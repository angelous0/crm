"""Endpoints de la página /cola — Cola de llamadas (Sprint CRM-D2).

Todos requieren auth. Las queries respetan el rol:
- vendedora: solo ve cuentas de su cartera (asignado_a = username)
- admin/supervisor: ve todas las cuentas

Lee del matview crm.mv_cuenta_estado (refrescado nocturnamente a las 3am).
"""
from typing import List, Optional, Dict, Any
from datetime import datetime, date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from auth_utils import get_current_user, is_admin_or_supervisor
from db import safe_acquire
from helpers import row_to_dict


router = APIRouter(prefix="/api/cola")


# ─── Helpers ─────────────────────────────────────────────────
def _cartera_filter(user: dict) -> tuple[str, list]:
    """Devuelve (where_clause, params_extra). Para vendedora, restringe a
    su cartera; para admin/supervisor devuelve "" (sin filtro)."""
    if is_admin_or_supervisor(user):
        return "", []
    username = user.get("username")
    return " AND mvce.asignado_a = $%d", [username]


def _saludo() -> str:
    """Genera saludo según hora local Lima."""
    h = datetime.now().hour
    if h < 12:
        return "Buenos días"
    if h < 19:
        return "Buenas tardes"
    return "Buenas noches"


# ─── Header ──────────────────────────────────────────────────
@router.get("/header")
async def cola_header(user: dict = Depends(get_current_user)):
    """Datos del header: saludo, urgentes, programadas hoy."""
    nombre = (
        user.get("nombre_completo")
        or user.get("nombre")
        or user.get("username", "Usuario").capitalize()
    ).split()[0]  # solo el primer nombre para el saludo

    where_extra, params = _cartera_filter(user)
    if where_extra:
        where_extra = where_extra % (1,)  # placeholder index 1

    async with safe_acquire() as conn:
        # Urgentes = en_riesgo + dormido + perdido (cuentas que necesitan reactivación)
        urgentes = await conn.fetchval(
            f"""
            SELECT COUNT(*)
            FROM crm.mv_cuenta_estado mvce
            WHERE estado_auto IN ('alerta', 'olvidado', 'perdido')
              AND no_llamar = false
              {where_extra}
            """,
            *params,
        )

        # Tareas programadas para hoy del usuario actual
        if is_admin_or_supervisor(user):
            programadas = await conn.fetchval(
                """
                SELECT COUNT(*) FROM crm.tarea
                WHERE status = 'PENDIENTE'
                  AND due_at::date = CURRENT_DATE
                """
            )
        else:
            programadas = await conn.fetchval(
                """
                SELECT COUNT(*) FROM crm.tarea
                WHERE status = 'PENDIENTE'
                  AND due_at::date = CURRENT_DATE
                  AND asignado_a = $1
                """,
                user.get("username"),
            )

    return {
        "saludo": _saludo(),
        "nombre": nombre,
        "urgentes": int(urgentes or 0),
        "programadas_hoy": int(programadas or 0),
        "fecha_iso": date.today().isoformat(),
    }


# ─── KPIs ────────────────────────────────────────────────────
@router.get("/kpis")
async def cola_kpis(user: dict = Depends(get_current_user)):
    """4 KPIs principales con sparklines."""
    where_extra, params = _cartera_filter(user)
    if where_extra:
        where_extra = where_extra % (1,)

    async with safe_acquire() as conn:
        # Por llamar hoy: pendientes de cadencia + tareas vencidas
        if is_admin_or_supervisor(user):
            por_llamar = await conn.fetchval(
                """
                SELECT (
                    SELECT COUNT(*) FROM crm.tarea
                    WHERE status='PENDIENTE'
                      AND (due_at::date = CURRENT_DATE
                           OR due_at::date < CURRENT_DATE)
                ) + (
                    SELECT COUNT(*) FROM crm.mv_cuenta_estado
                    WHERE estado_auto IN ('alerta', 'olvidado')
                      AND no_llamar = false
                )
                """
            )
        else:
            por_llamar = await conn.fetchval(
                """
                SELECT (
                    SELECT COUNT(*) FROM crm.tarea
                    WHERE status='PENDIENTE'
                      AND (due_at::date <= CURRENT_DATE)
                      AND asignado_a = $1
                ) + (
                    SELECT COUNT(*) FROM crm.mv_cuenta_estado
                    WHERE estado_auto IN ('alerta', 'olvidado')
                      AND no_llamar = false
                      AND asignado_a = $1
                )
                """,
                user.get("username"),
            )

        # Mes en curso: suma amount_mtd de las cuentas
        mes_en_curso = await conn.fetchval(
            f"""
            SELECT COALESCE(SUM(amount_mtd), 0)::float
            FROM crm.mv_cuenta_estado mvce
            WHERE 1=1 {where_extra}
            """,
            *params,
        )

        # En riesgo: cuentas en estado 'alerta' (61-120d sin comprar)
        en_riesgo = await conn.fetchval(
            f"""
            SELECT COUNT(*)
            FROM crm.mv_cuenta_estado mvce
            WHERE estado_auto = 'alerta'
              AND no_llamar = false
              {where_extra}
            """,
            *params,
        )

        # Sparkline: ventas por día últimos 7 días (real, basado en mv_pos_line_cuenta)
        sparkline_7d_rows = await conn.fetch(
            """
            SELECT
                date_order::date AS dia,
                SUM(price_subtotal)::float AS monto
            FROM crm.mv_pos_line_cuenta
            WHERE date_order >= CURRENT_DATE - 7
            GROUP BY date_order::date
            ORDER BY date_order::date
            """
        )
        sparkline_ventas = [float(r["monto"] or 0) for r in sparkline_7d_rows]

    return {
        "por_llamar_hoy": {
            "value": int(por_llamar or 0),
            "delta_label": None,  # falta histórico — D3
            "sparkline": [],
        },
        "mes_en_curso": {
            "value": float(mes_en_curso or 0),
            "delta_label": None,
            "sparkline": sparkline_ventas,
        },
        "por_cobrar": {
            "value": None,  # CRM-D4 (cobranzas)
            "delta_label": None,
            "sparkline": [],
            "disponible": False,
        },
        "en_riesgo": {
            "value": int(en_riesgo or 0),
            "delta_label": None,
            "sparkline": [],
        },
    }


# ─── Lista de cuentas en cola ────────────────────────────────
@router.get("/llamadas")
async def cola_llamadas(
    filtro: str = Query("todos", regex="^(todos|urgentes|en-riesgo|credito)$"),
    limit: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user),
):
    """Tarjetas de la cola, ordenadas por prioridad_score."""
    where_extra, params_extra = _cartera_filter(user)
    if where_extra:
        where_extra = where_extra % (1,)

    # Filtros adicionales
    extra_filter = ""
    if filtro == "urgentes":
        extra_filter = " AND mvce.estado_auto IN ('alerta', 'olvidado', 'perdido')"
    elif filtro == "en-riesgo":
        extra_filter = " AND mvce.estado_auto = 'alerta'"
    elif filtro == "credito":
        # Aproximación: clientes Estrella (top 10% del depto)
        extra_filter = " AND mvce.tier = 'estrella'"

    sql = f"""
        SELECT
            mvce.cuenta_partner_odoo_id   AS partner_odoo_id,
            mvce.crm_cuenta_id            AS cuenta_id,
            mvce.name                     AS nombre,
            mvce.display_name,
            mvce.city                     AS ciudad,
            mvce.phone,
            mvce.mobile,
            mvce.tier,
            mvce.mayorista,
            mvce.estado_auto,
            mvce.recencia_dias,
            mvce.freq_dias_estimada,
            mvce.last_purchase_date,
            mvce.amount_12m::float        AS amount_12m,
            mvce.qty_12m,
            mvce.orders_12m,
            mvce.asignado_a,
            mvce.prioridad_score::float   AS prioridad_score,
            (SELECT COUNT(*) FROM crm.tarea t
             WHERE t.cuenta_id = mvce.crm_cuenta_id
               AND t.status = 'PENDIENTE'
               AND t.due_at::date <= CURRENT_DATE
            ) AS tareas_pendientes
        FROM crm.mv_cuenta_estado mvce
        WHERE mvce.no_llamar = false
          AND mvce.estado_auto != 'sin_data'
          {where_extra}
          {extra_filter}
        ORDER BY mvce.prioridad_score DESC NULLS LAST
        LIMIT {limit}
    """

    async with safe_acquire() as conn:
        rows = await conn.fetch(sql, *params_extra)

    return {"items": [row_to_dict(r) for r in rows], "filtro": filtro}


# ─── Resumen del día (panel derecho) ─────────────────────────
@router.get("/resumen-dia")
async def cola_resumen_dia(user: dict = Depends(get_current_user)):
    """Panel lateral del día: potencial, contadores, recientes."""
    where_extra, params_extra = _cartera_filter(user)
    if where_extra:
        where_extra = where_extra % (1,)

    async with safe_acquire() as conn:
        # Potencial: amount_12m promedio del top 8 prioridad → potencial diario
        potencial_row = await conn.fetchrow(
            f"""
            SELECT
                COALESCE(SUM(top.amount_12m / 365.0)::float, 0) AS potencial_dia,
                COUNT(*) AS top_n
            FROM (
                SELECT mvce.amount_12m
                FROM crm.mv_cuenta_estado mvce
                WHERE mvce.no_llamar = false
                  AND mvce.estado_auto != 'sin_data'
                  {where_extra}
                ORDER BY mvce.prioridad_score DESC NULLS LAST
                LIMIT 8
            ) top
            """,
            *params_extra,
        )

        # Contadores de tareas por tipo
        tareas_username = (
            None if is_admin_or_supervisor(user) else user.get("username")
        )
        tareas_rows = await conn.fetch(
            """
            SELECT LOWER(COALESCE(tipo, 'otro')) AS tipo, COUNT(*) AS n
            FROM crm.tarea
            WHERE status = 'PENDIENTE'
              AND due_at::date <= CURRENT_DATE + 1
              AND ($1::text IS NULL OR asignado_a = $1)
            GROUP BY LOWER(COALESCE(tipo, 'otro'))
            """,
            tareas_username,
        )
        tareas_por_tipo = {r["tipo"]: int(r["n"]) for r in tareas_rows}

        # Recientes: últimas 5 interacciones
        if is_admin_or_supervisor(user):
            recientes = await conn.fetch(
                """
                SELECT
                    i.id,
                    rp.name AS cuenta_nombre,
                    rp.odoo_id AS partner_odoo_id,
                    COALESCE(i.channel, i.tipo) AS canal,
                    i.outcome,
                    i.happened_at,
                    i.created_by
                FROM crm.interaccion i
                LEFT JOIN crm.cuenta cu ON cu.id = i.cuenta_id
                LEFT JOIN odoo.res_partner rp
                    ON rp.odoo_id = cu.cuenta_partner_odoo_id
                    AND rp.company_key = 'GLOBAL'
                ORDER BY i.happened_at DESC NULLS LAST
                LIMIT 5
                """
            )
        else:
            recientes = await conn.fetch(
                """
                SELECT
                    i.id,
                    rp.name AS cuenta_nombre,
                    rp.odoo_id AS partner_odoo_id,
                    COALESCE(i.channel, i.tipo) AS canal,
                    i.outcome,
                    i.happened_at,
                    i.created_by
                FROM crm.interaccion i
                LEFT JOIN crm.cuenta cu ON cu.id = i.cuenta_id
                LEFT JOIN odoo.res_partner rp
                    ON rp.odoo_id = cu.cuenta_partner_odoo_id
                    AND rp.company_key = 'GLOBAL'
                WHERE i.created_by = $1
                ORDER BY i.happened_at DESC NULLS LAST
                LIMIT 5
                """,
                user.get("username"),
            )

    return {
        "potencial_dia": float(potencial_row["potencial_dia"] or 0) if potencial_row else 0,
        "top_n": int(potencial_row["top_n"] or 0) if potencial_row else 0,
        "visitas_planeadas": tareas_por_tipo.get("visita", 0),
        "llamadas_pendientes": tareas_por_tipo.get("llamada", 0),
        "whatsapp_pendientes": tareas_por_tipo.get("whatsapp", 0)
            + tareas_por_tipo.get("wa", 0),
        "cierres": tareas_por_tipo.get("cierre", 0)
            + tareas_por_tipo.get("pedido", 0),
        "recientes": [
            {
                "id": str(r["id"]),
                "cuenta_nombre": r["cuenta_nombre"],
                "partner_odoo_id": r["partner_odoo_id"],
                "canal": (r["canal"] or "").lower(),
                "outcome": r["outcome"],
                "happened_at": r["happened_at"].isoformat() if r["happened_at"] else None,
                "created_by": r["created_by"],
            }
            for r in recientes
        ],
    }


# ─── Quick Followup (E6) ─────────────────────────────────────
class QuickFollowupBody(BaseModel):
    cuenta_partner_odoo_id: int
    resultado: str  # vendi | comprometio | tibio | no_interesado | no_contesto
    nota: Optional[str] = None
    proximo_seguimiento_dias: Optional[int] = None
    canal: Optional[str] = "llamada"  # llamada | wa | visita | email


VALID_RESULTADOS = {"vendi", "comprometio", "tibio", "no_interesado", "no_contesto"}
VALID_CANALES = {"llamada", "wa", "whatsapp", "visita", "email"}


@router.post("/quick-followup")
async def quick_followup(
    body: QuickFollowupBody,
    user: dict = Depends(get_current_user),
):
    """Registra una interacción rápida + opcionalmente crea tarea de seguimiento."""
    if body.resultado not in VALID_RESULTADOS:
        raise HTTPException(status_code=400, detail=f"resultado inválido. Válidos: {sorted(VALID_RESULTADOS)}")
    canal = (body.canal or "llamada").lower()
    if canal not in VALID_CANALES:
        raise HTTPException(status_code=400, detail=f"canal inválido")

    async with safe_acquire() as conn:
        # Resolver crm.cuenta.id por partner_odoo_id
        cuenta_row = await conn.fetchrow(
            """
            SELECT id FROM crm.cuenta
            WHERE cuenta_partner_odoo_id = $1
            LIMIT 1
            """,
            body.cuenta_partner_odoo_id,
        )
        if not cuenta_row:
            # Auto-crear cuenta si no existe (común tras sync inicial)
            cuenta_row = await conn.fetchrow(
                """
                INSERT INTO crm.cuenta (cuenta_partner_odoo_id, estado_comercial)
                VALUES ($1, 'ACTIVO')
                ON CONFLICT (cuenta_partner_odoo_id) DO UPDATE
                  SET updated_at = now()
                RETURNING id
                """,
                body.cuenta_partner_odoo_id,
            )
        cuenta_id = cuenta_row["id"]

        async with conn.transaction():
            # 1) Insertar interacción
            interaccion_id = await conn.fetchval(
                """
                INSERT INTO crm.interaccion
                    (cuenta_id, tipo, channel, outcome, fecha, happened_at,
                     resumen, created_by)
                VALUES ($1, $2, $3, $4, now(), now(), $5, $6)
                RETURNING id
                """,
                cuenta_id,
                canal.upper(),
                canal.upper(),
                body.resultado.upper(),
                (body.nota or "")[:1000],
                user.get("username"),
            )

            # 2) Marcar tareas vencidas como completadas (cerrar el loop)
            await conn.execute(
                """
                UPDATE crm.tarea SET status = 'COMPLETADA', done_at = now(),
                    updated_by = $1, updated_at = now()
                WHERE cuenta_id = $2
                  AND status = 'PENDIENTE'
                  AND due_at::date <= CURRENT_DATE
                """,
                user.get("username"),
                cuenta_id,
            )

            # 3) Crear próxima tarea si se pidió
            tarea_creada_id = None
            if body.proximo_seguimiento_dias and body.proximo_seguimiento_dias > 0:
                # Tipo de tarea según el resultado
                tipo_tarea = {
                    "vendi": "seguimiento",
                    "comprometio": "cierre",
                    "tibio": "llamada",
                    "no_interesado": "llamada",
                    "no_contesto": "llamada",
                }.get(body.resultado, "llamada")

                desc_default = {
                    "vendi": "Seguimiento post-venta",
                    "comprometio": "Cerrar pedido prometido",
                    "tibio": "Reintentar contacto",
                    "no_interesado": "Validar interés a futuro",
                    "no_contesto": "Reintentar llamada",
                }[body.resultado]

                tarea_creada_id = await conn.fetchval(
                    """
                    INSERT INTO crm.tarea
                        (cuenta_id, tipo, due_at, status, prioridad,
                         descripcion, asignado_a, created_by)
                    VALUES ($1, $2,
                            (CURRENT_DATE + ($3::int || ' days')::interval)::timestamptz,
                            'PENDIENTE', 3, $4, $5, $5)
                    RETURNING id
                    """,
                    cuenta_id,
                    tipo_tarea,
                    body.proximo_seguimiento_dias,
                    desc_default,
                    user.get("username"),
                )

    return {
        "ok": True,
        "interaccion_id": str(interaccion_id),
        "tarea_creada_id": str(tarea_creada_id) if tarea_creada_id else None,
    }


# ─── Estado de cuenta individual (E5 endpoint público) ───────
@router.get("/estado/{partner_odoo_id}")
async def cuenta_estado(partner_odoo_id: int, user: dict = Depends(get_current_user)):
    """Estado calculado de una cuenta específica."""
    async with safe_acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT
                cuenta_partner_odoo_id, name, tier, estado_auto,
                recencia_dias, freq_dias_estimada,
                amount_12m::float AS amount_12m,
                qty_12m, orders_12m,
                last_purchase_date, asignado_a,
                prioridad_score::float AS prioridad_score
            FROM crm.mv_cuenta_estado
            WHERE cuenta_partner_odoo_id = $1
            """,
            partner_odoo_id,
        )
    if not row:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada en mv_cuenta_estado")
    return row_to_dict(row)
