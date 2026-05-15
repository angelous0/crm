"""Automatización Cobrar (CRM-D10).

Cron asíncrono que cada 15 minutos:
  1. Busca créditos `state='open'` con `date_due` poblado en
     `odoo.account_invoice_credit` que aún no tienen tarea CRM asociada.
  2. Resuelve cuenta CRM (crea registro si no existía) y vendedor via
     `crm.odoo_user_map`.
  3. Crea tarea con motivo=COBRAR, prioridad alta (2), tipo=LLAMADA y
     `source_type='ODOO_CREDIT'` para dedupe en próximos ciclos.

MVP — solo CREA tareas nuevas; no sincroniza cambios:
  · cambio de date_due en Odoo → tarea se queda con fecha original
  · cancelación o pago en Odoo → tarea sigue activa (vendedora la cierra)

Idempotente: el filtro NOT EXISTS sobre (source_type='ODOO_CREDIT', source_ref=odoo_id)
garantiza que ejecutar 2 veces seguidas no duplica.

Patrón: se llama desde `_cobrar_automation_loop()` en server.py, igual que
`_matviews_refresh_loop` y `_ventas_en_vivo_loop`.
"""
from __future__ import annotations

import logging
from datetime import datetime, date, time, timedelta

from db import safe_acquire

logger = logging.getLogger(__name__)


# ─── Defaults de la tarea generada ───────────────────────────────────────
TASK_DEFAULTS = {
    "tipo":      "LLAMADA",   # vendedora puede cambiar a WHATSAPP en UI
    "motivo":    "COBRAR",
    "prioridad": 2,           # 2 = Alta (en el sistema 1=Crítica, 2=Alta, 3=Media, 4=Baja, 5=Info)
    "status":    "PENDIENTE",
    "source_type": "ODOO_CREDIT",
}

# Fuente: solo facturas a crédito abiertas con vencimiento definido.
# (state='paid'/'cancel' o date_due NULL se ignoran a propósito).
_QUERY_CREDITOS_PENDIENTES = """
    SELECT
        aic.company_key,
        aic.odoo_id,
        aic.number,
        aic.partner_id,
        aic.user_id          AS odoo_user_id,
        aic.date_invoice,
        aic.date_due,
        aic.amount_total,
        aic.amount_residual
    FROM odoo.account_invoice_credit aic
    WHERE aic.state = 'open'
      AND aic.date_due IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM crm.tarea t
          WHERE t.source_type = 'ODOO_CREDIT'
            AND t.source_ref  = aic.odoo_id::text
      )
    ORDER BY aic.date_due ASC, aic.odoo_id ASC
"""


def _calc_due_at(date_due: date, now: datetime) -> datetime:
    """Calcula due_at para la tarea según la regla acordada CRM-D10:

        target = date_due - 2 días a las 09:00 local
        min    = now + 1 hora

        - Si target > min → usar target (2 días antes a las 9am)
        - Si no, y hoy todavía no son las 9am → usar HOY 09:00
        - Si ya pasaron las 9am de hoy → MAÑANA 09:00

    Así nunca nace en el pasado pero respeta "2 días antes" cuando hay margen.
    """
    target = datetime.combine(date_due - timedelta(days=2), time(9, 0))
    min_dt = now + timedelta(hours=1)
    if target >= min_dt:
        return target
    today_9 = datetime.combine(now.date(), time(9, 0))
    if today_9 >= min_dt:
        return today_9
    return datetime.combine(now.date() + timedelta(days=1), time(9, 0))


def _fmt_descripcion(date_due: date) -> str:
    return f"Cobrar factura — vence {date_due.strftime('%d/%m/%Y')}"


def _fmt_notas(credito: dict) -> str:
    monto = credito.get("amount_residual") or credito.get("amount_total") or 0
    return (
        f"Monto pendiente: S/ {float(monto):,.2f}\n"
        f"Factura: {credito['number'] or '(sin número)'}\n"
        f"Emitida: {credito['date_invoice']}\n"
        f"Vence: {credito['date_due']}\n"
        f"Origen: Odoo account.invoice id={credito['odoo_id']}"
    )


async def run_cobrar_automation() -> dict:
    """Una pasada del cron. Retorna métricas para logging.

    Devuelve:
        {
          "candidatos": int,           # créditos elegibles encontrados
          "creadas":    int,           # tareas insertadas
          "sin_mapeo":  int,           # odoo_user_id no presente en odoo_user_map
          "sin_user":   int,           # crédito sin user_id en Odoo
          "errores":    int,           # excepciones por crédito (no rompe el batch)
        }
    """
    now = datetime.now()
    metrics = {"candidatos": 0, "creadas": 0, "sin_mapeo": 0, "sin_user": 0, "errores": 0}

    async with safe_acquire() as conn:
        creditos = await conn.fetch(_QUERY_CREDITOS_PENDIENTES)
        metrics["candidatos"] = len(creditos)
        if not creditos:
            return metrics

        # Cargar todo el mapping de una vez (es pequeño)
        mapping_rows = await conn.fetch(
            "SELECT odoo_user_id, crm_username FROM crm.odoo_user_map"
        )
        mapping = {r["odoo_user_id"]: r["crm_username"] for r in mapping_rows}

        # Nombres legibles desde res_users para los warnings (mejora del log).
        # Cargamos solo los que aparecen sin mapeo para no llenar la query.
        odoo_uids_needed = {c["odoo_user_id"] for c in creditos if c["odoo_user_id"]}
        names_rows = await conn.fetch(
            "SELECT odoo_id, name, login FROM odoo.res_users "
            "WHERE odoo_id = ANY($1::int[])",
            list(odoo_uids_needed),
        ) if odoo_uids_needed else []
        odoo_names = {r["odoo_id"]: (r["name"] or r["login"] or "?") for r in names_rows}

        for c in creditos:
            try:
                odoo_uid = c["odoo_user_id"]
                if not odoo_uid:
                    metrics["sin_user"] += 1
                    logger.warning(
                        f"[cobrar-automation] Crédito {c['odoo_id']} "
                        f"({c['number']}) sin user_id en Odoo — saltando."
                    )
                    continue

                asignado = mapping.get(odoo_uid)
                if not asignado:
                    metrics["sin_mapeo"] += 1
                    nombre = odoo_names.get(odoo_uid, "?")
                    logger.warning(
                        f"[cobrar-automation] Crédito {c['odoo_id']} sin mapeo: "
                        f"odoo_uid={odoo_uid} ({nombre}). "
                        f"Agregar a crm.odoo_user_map para procesar."
                    )
                    continue

                # Asegurar que existe crm.cuenta para este partner_id (idempotente)
                await conn.execute(
                    "INSERT INTO crm.cuenta (cuenta_partner_odoo_id) VALUES ($1) "
                    "ON CONFLICT (cuenta_partner_odoo_id) DO NOTHING",
                    c["partner_id"],
                )
                cuenta = await conn.fetchrow(
                    "SELECT id FROM crm.cuenta WHERE cuenta_partner_odoo_id = $1",
                    c["partner_id"],
                )
                if not cuenta:
                    metrics["errores"] += 1
                    logger.warning(
                        f"[cobrar-automation] No se pudo resolver crm.cuenta "
                        f"para partner_id={c['partner_id']} (crédito {c['odoo_id']})"
                    )
                    continue

                due_at = _calc_due_at(c["date_due"], now)

                await conn.execute(
                    """
                    INSERT INTO crm.tarea (
                        cuenta_id, contacto_id, tipo, descripcion,
                        due_at, prioridad, status, motivo,
                        created_by, updated_by, updated_at, asignado_a,
                        source_type, source_ref
                    ) VALUES (
                        $1, NULL, $2, $3,
                        $4, $5, 'PENDIENTE', 'COBRAR',
                        'cron-cobrar', 'cron-cobrar', now(), $6,
                        'ODOO_CREDIT', $7
                    )
                    """,
                    cuenta["id"],
                    TASK_DEFAULTS["tipo"],
                    _fmt_descripcion(c["date_due"]) + "\n\n" + _fmt_notas(c),
                    due_at,
                    TASK_DEFAULTS["prioridad"],
                    asignado,
                    str(c["odoo_id"]),
                )
                metrics["creadas"] += 1
            except Exception as e:
                metrics["errores"] += 1
                logger.exception(
                    f"[cobrar-automation] Error procesando crédito {c.get('odoo_id')}: {e}"
                )

    return metrics
