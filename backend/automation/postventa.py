"""Automatización Post-venta (CRM-D14).

Cron asíncrono que cada 15 minutos:
  1. Busca ventas en `odoo.v_pos_order_real` con `date_order >= hoy` que
     aún no tienen tarea CRM asociada.
  2. Resuelve cuenta CRM (crea registro si no existía) y vendedor vía
     `crm.odoo_user_map` usando `vendedor_id` (NO `user_id`, que es la
     tienda/caja en este sistema).
  3. Crea tarea con motivo=POST_VENTA, prioridad media (3), tipo=LLAMADA
     y `source_type='ODOO_SALE'` para dedupe en próximos ciclos.

CRM-D15: pasamos de `vendedor_id` (persona) a `user_id` (tienda/caja)
para resolver el mapeo. En este Odoo el `user_id` es el login de la
tienda física (s_barranca1552, grau238, gamarra209, etc.), y mapeamos
cada uno al usuario CRM de la tienda canónica correspondiente
(gm209, gr238, gm207, taller, gm218, boosh, gr55). Cuando una
vendedora real registra la primera interacción con esa cuenta, la
tarea se reasigna automáticamente a esa vendedora (ver POST de
interacción en cuentas.py).

MVP — solo CREA tareas nuevas:
  · Si una venta cambia en Odoo después → tarea queda con los datos originales
  · Si una venta se cancela → tarea sigue activa (vendedora la cierra manual)

Idempotente: filtro `NOT EXISTS` sobre `source_type='ODOO_SALE'` + `source_ref=odoo_id`.

NO hace backfill: solo procesa ventas con `date_order >= CURRENT_DATE`.
Ventas viejas previas al arranque del cron se ignoran a propósito.

Patrón: se llama desde `_postventa_automation_loop()` en server.py, igual
que `_cobrar_automation_loop`.
"""
from __future__ import annotations

import logging
from datetime import datetime, date, time, timedelta

from db import safe_acquire

logger = logging.getLogger(__name__)


# ─── Defaults de la tarea generada ───────────────────────────────────────
TASK_DEFAULTS = {
    "tipo":      "LLAMADA",       # vendedora puede cambiar a WHATSAPP en UI
    "motivo":    "POST_VENTA",
    "prioridad": 3,               # 3 = Media (vs Alta=2 en Cobrar)
    "status":    "PENDIENTE",
    "source_type": "ODOO_SALE",
}

# Fuente: ventas POS reales del día (la view ya filtra cancelaciones,
# reservas y órdenes fantasma). CRM-D15: usamos `user_id` (tienda/caja
# Odoo) en lugar de `vendedor_id` (persona), porque en este Odoo:
#   · user_id    = login de la TIENDA (gamarra209, grau238, ...) → mapeable
#   · vendedor_id = persona física (Luz, Janeth, ...) → solo Luz mapeada
# Las tareas POST_VENTA caen al usuario CRM "Tienda XXX" y se reasignan
# a una vendedora real cuando esa vendedora registra la primera
# interacción con la cuenta.
_QUERY_VENTAS_PENDIENTES = """
    SELECT
        po.odoo_id,
        po.name,
        po.date_order,
        po.cliente_efectivo_id  AS partner_id,
        po.user_id              AS odoo_user_id,
        po.amount_total,
        po.tipo_comp,
        po.num_comp
    FROM odoo.v_pos_order_real po
    WHERE po.date_order >=
        (date_trunc('day', now() AT TIME ZONE 'America/Lima') AT TIME ZONE 'America/Lima')
      AND po.cliente_efectivo_id IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM crm.tarea t
          WHERE t.source_type = 'ODOO_SALE'
            AND t.source_ref  = po.odoo_id::text
      )
    ORDER BY po.date_order ASC, po.odoo_id ASC
"""
# Nota TZ: usamos "inicio del día en Lima" en lugar de CURRENT_DATE
# (que es UTC en el server). Si en el server son las 00:30 UTC del 18 may
# y en Lima son las 19:30 del 17 may, CURRENT_DATE da 18 may y se
# pierden las ventas del día Lima. Esta expresión devuelve el comienzo
# del día Lima actual como TIMESTAMPTZ, así filtra correctamente.


def _calc_due_at(date_venta: datetime, now: datetime) -> datetime:
    """Calcula due_at: fecha venta + 5 días a las 09:00 local.

    Si esa fecha cae en el pasado (raro porque date_order >= hoy, pero
    posible si el cron tarda en procesarse), usamos el mismo fallback
    que Cobrar: now+1h, ajustado a 09:00 del próximo día.
    """
    target_date = (date_venta + timedelta(days=5)).date()
    target = datetime.combine(target_date, time(9, 0))
    min_dt = now + timedelta(hours=1)
    if target >= min_dt:
        return target
    today_9 = datetime.combine(now.date(), time(9, 0))
    if today_9 >= min_dt:
        return today_9
    return datetime.combine(now.date() + timedelta(days=1), time(9, 0))


def _fmt_descripcion(date_venta: datetime) -> str:
    return f"Llamar post-venta — venta del {date_venta.strftime('%d/%m/%Y')}"


def _fmt_notas(venta: dict, nombre_tienda_odoo: str | None) -> str:
    monto = float(venta.get("amount_total") or 0)
    num_comp = venta.get("num_comp") or "(sin comprobante)"
    tipo_comp = venta.get("tipo_comp") or ""
    referencia = f"{tipo_comp} {num_comp}".strip()
    fecha = venta["date_order"]
    fecha_str = fecha.strftime("%d/%m/%Y %H:%M") if hasattr(fecha, "strftime") else str(fecha)
    tienda_str = f"\nTienda Odoo: {nombre_tienda_odoo}" if nombre_tienda_odoo else ""
    return (
        f"Monto: S/ {monto:,.2f}\n"
        f"Venta: {venta.get('name') or '(sin número)'}\n"
        f"Comprobante: {referencia}\n"
        f"Fecha: {fecha_str}"
        f"{tienda_str}\n"
        f"Origen: Odoo pos_order id={venta['odoo_id']}"
    )


async def run_postventa_automation() -> dict:
    """Una pasada del cron. Retorna métricas para logging.

    Devuelve:
        {
          "candidatos":  int,   # ventas elegibles encontradas
          "creadas":     int,   # tareas insertadas
          "sin_mapeo":   int,   # user_id no presente en odoo_user_map
          "sin_user":    int,   # venta sin user_id en Odoo (raro)
          "errores":     int,   # excepciones por venta (no rompe el batch)
        }
    """
    now = datetime.now()
    metrics = {"candidatos": 0, "creadas": 0, "sin_mapeo": 0, "sin_user": 0, "errores": 0}

    async with safe_acquire() as conn:
        ventas = await conn.fetch(_QUERY_VENTAS_PENDIENTES)
        metrics["candidatos"] = len(ventas)
        if not ventas:
            return metrics

        # Mapping completo (es pequeño, ~15 entradas tras D15)
        mapping_rows = await conn.fetch(
            "SELECT odoo_user_id, crm_username FROM crm.odoo_user_map"
        )
        mapping = {r["odoo_user_id"]: r["crm_username"] for r in mapping_rows}

        # Nombres legibles de res_users para logs (caso sin mapeo)
        user_ids = {v["odoo_user_id"] for v in ventas if v["odoo_user_id"]}
        names_rows = await conn.fetch(
            "SELECT odoo_id, name, login FROM odoo.res_users "
            "WHERE odoo_id = ANY($1::int[])",
            list(user_ids),
        ) if user_ids else []
        user_names = {r["odoo_id"]: (r["name"] or r["login"] or "?") for r in names_rows}

        for v in ventas:
            try:
                odoo_user_id = v["odoo_user_id"]
                if not odoo_user_id:
                    metrics["sin_user"] += 1
                    logger.warning(
                        f"[postventa-automation] Venta {v['odoo_id']} "
                        f"({v.get('name') or '?'}) sin user_id en Odoo — saltando."
                    )
                    continue

                asignado = mapping.get(odoo_user_id)
                if not asignado:
                    metrics["sin_mapeo"] += 1
                    nombre = user_names.get(odoo_user_id, "?")
                    logger.warning(
                        f"[postventa-automation] Venta {v['odoo_id']} sin mapeo: "
                        f"odoo_user_id={odoo_user_id} ({nombre}). "
                        f"Agregar a crm.odoo_user_map para procesar."
                    )
                    continue

                # Asegurar que existe crm.cuenta para el partner (idempotente)
                await conn.execute(
                    "INSERT INTO crm.cuenta (cuenta_partner_odoo_id) VALUES ($1) "
                    "ON CONFLICT (cuenta_partner_odoo_id) DO NOTHING",
                    v["partner_id"],
                )
                cuenta = await conn.fetchrow(
                    "SELECT id FROM crm.cuenta WHERE cuenta_partner_odoo_id = $1",
                    v["partner_id"],
                )
                if not cuenta:
                    metrics["errores"] += 1
                    logger.warning(
                        f"[postventa-automation] No se pudo resolver crm.cuenta "
                        f"para partner_id={v['partner_id']} (venta {v['odoo_id']})"
                    )
                    continue

                due_at = _calc_due_at(v["date_order"], now)
                desc = _fmt_descripcion(v["date_order"])
                notas = _fmt_notas(v, user_names.get(odoo_user_id))

                await conn.execute(
                    """
                    INSERT INTO crm.tarea (
                        cuenta_id, contacto_id, tipo, descripcion,
                        due_at, prioridad, status, motivo,
                        created_by, updated_by, updated_at, asignado_a,
                        source_type, source_ref
                    ) VALUES (
                        $1, NULL, $2, $3,
                        $4, $5, 'PENDIENTE', 'POST_VENTA',
                        'cron-postventa', 'cron-postventa', now(), $6,
                        'ODOO_SALE', $7
                    )
                    """,
                    cuenta["id"],
                    TASK_DEFAULTS["tipo"],
                    desc + "\n\n" + notas,
                    due_at,
                    TASK_DEFAULTS["prioridad"],
                    asignado,
                    str(v["odoo_id"]),
                )
                metrics["creadas"] += 1
            except Exception as e:
                metrics["errores"] += 1
                logger.exception(
                    f"[postventa-automation] Error procesando venta {v.get('odoo_id')}: {e}"
                )

    return metrics
