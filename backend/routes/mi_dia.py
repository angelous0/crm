"""Mi Día — dashboard accionable del vendedor.

Es el endpoint que el frontend abre 20–30 veces al día.
Performance objetivo: GET /mi-dia < 500ms, GET /mi-dia/kpis < 100ms.

Filosofía: data mínima accionable, no analítica. Cada bloque dice "qué hacer ahora".
"""
from datetime import datetime, timedelta
from typing import Optional, Tuple
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Depends

from auth_utils import get_current_user
from db import safe_acquire
from helpers import row_to_dict


router = APIRouter(prefix="/api/mi-dia", tags=["crm-mi-dia"])

LIMA = ZoneInfo("America/Lima")
UTC = ZoneInfo("UTC")


def _username(user: dict) -> str:
    return user.get("username", "unknown") if isinstance(user, dict) else "unknown"


def _is_admin(user: dict) -> bool:
    return isinstance(user, dict) and user.get("rol") == "admin"


def _lima_day_bounds() -> Tuple[datetime, datetime]:
    """Devuelve (inicio_hoy_lima_UTC, fin_hoy_lima_UTC) como timestamps con tz=UTC.

    Sirven como literales en queries: `due_at >= $1 AND due_at < $2` usa índices.
    """
    now_lima = datetime.now(LIMA)
    today_start_lima = now_lima.replace(hour=0, minute=0, second=0, microsecond=0)
    return today_start_lima.astimezone(UTC), (today_start_lima + timedelta(days=1)).astimezone(UTC)


async def _resolve_target_user(conn, user: dict, as_user: Optional[str]) -> dict:
    """Resuelve quién es el target_user. Maneja autorización + existencia."""
    if as_user:
        if not _is_admin(user):
            raise HTTPException(403, "Solo admin puede ver Mi Día de otros usuarios")
        if as_user == _username(user):
            return user
        target = await conn.fetchrow(
            "SELECT username, rol, nombre_completo FROM produccion.prod_usuarios "
            "WHERE username = $1 AND activo = true",
            as_user,
        )
        if not target:
            raise HTTPException(400, f"Usuario '{as_user}' no encontrado")
        return dict(target)
    return user


async def _get_cadencia_alerts(conn, username: str, limit: int = 15) -> list:
    """Motor de cadencia: detecta cuentas asignadas cuya frecuencia de compra
    ha caído por debajo de su ciclo histórico.

    Algoritmo:
        avg_freq_dias = 365 / orders_12m  (frecuencia implícita en 12m)
        ratio_overdue = dias_desde_ultima / avg_freq_dias
        Alerta si ratio_overdue > 1 Y dias_desde_ultima >= 7
    Ordena por ratio_overdue DESC (más atrasados primero).
    Solo cuentas con ≥ 2 órdenes en 12m (patrón mínimo confiable).
    """
    rows = await conn.fetch("""
        WITH cuentas AS (
            SELECT
                cu.cuenta_partner_odoo_id,
                rp.name                                                        AS cuenta_nombre,
                kpi.last_purchase_date,
                kpi.orders_12m,
                (CURRENT_DATE - kpi.last_purchase_date::date)::int             AS dias_desde_ultima,
                ROUND(365.0 / kpi.orders_12m, 1)                              AS avg_freq_dias
            FROM crm.cuenta cu
            JOIN crm.mv_cuenta_sales_kpi kpi
                ON kpi.cuenta_id = cu.cuenta_partner_odoo_id
            JOIN odoo.res_partner rp
                ON rp.odoo_id = cu.cuenta_partner_odoo_id
               AND rp.company_key = 'GLOBAL'
            WHERE cu.asignado_a = $1
              AND cu.estado_comercial = 'ACTIVO'
              AND COALESCE(cu.is_active, true) = true
              AND kpi.orders_12m >= 2
              AND kpi.last_purchase_date IS NOT NULL
        )
        SELECT
            cuenta_partner_odoo_id,
            cuenta_nombre,
            last_purchase_date,
            orders_12m,
            dias_desde_ultima,
            avg_freq_dias,
            ROUND(dias_desde_ultima / avg_freq_dias, 2) AS ratio_overdue
        FROM cuentas
        WHERE dias_desde_ultima > avg_freq_dias
          AND dias_desde_ultima >= 7
        ORDER BY ratio_overdue DESC
        LIMIT $2
    """, username, limit)

    items = []
    for r in rows:
        d = row_to_dict(r)
        ratio = float(d.get("ratio_overdue") or 0)
        dias  = int(d.get("dias_desde_ultima") or 0)
        freq  = float(d.get("avg_freq_dias") or 1)
        # Nivel de urgencia según cuántos ciclos lleva sin comprar
        if ratio >= 3.0:
            urgencia = "urgente"
        elif ratio >= 1.8:
            urgencia = "alta"
        else:
            urgencia = "media"
        d["urgencia"] = urgencia
        d["descripcion"] = f"Sin compra hace {dias}d · ciclo usual {int(round(freq))}d"
        items.append(d)

    return items


async def _get_cadencia_count(conn, username: str) -> int:
    """Versión liviana de cadencia para el endpoint /kpis (solo cuenta, sin nombres)."""
    return await conn.fetchval("""
        SELECT COUNT(*)
        FROM crm.cuenta cu
        JOIN crm.mv_cuenta_sales_kpi kpi
            ON kpi.cuenta_id = cu.cuenta_partner_odoo_id
        WHERE cu.asignado_a = $1
          AND cu.estado_comercial = 'ACTIVO'
          AND COALESCE(cu.is_active, true) = true
          AND kpi.orders_12m >= 2
          AND kpi.last_purchase_date IS NOT NULL
          AND (CURRENT_DATE - kpi.last_purchase_date::date) > (365.0 / kpi.orders_12m)
          AND (CURRENT_DATE - kpi.last_purchase_date::date) >= 7
    """, username) or 0


def _truncate(text: Optional[str], maxlen: int = 150) -> Optional[str]:
    if text is None:
        return None
    if len(text) <= maxlen:
        return text
    return text[:maxlen].rstrip() + "…"


# SQL columns for tarea items in Mi Día (single source of truth)
_TAREA_COLS = """
    t.id, t.tipo, t.descripcion, t.due_at, t.prioridad,
    t.cuenta_id, cu.cuenta_partner_odoo_id,
    rp.name AS cuenta_nombre,
    t.contacto_id,
    rp_c.name AS contacto_nombre,
    COALESCE(co.whatsapp, rp_c.mobile::text) AS contacto_whatsapp,
    COALESCE(rp_c.phone::text, rp_c.mobile::text) AS contacto_telefono,
    t.asignado_a
"""

_TAREA_JOINS = """
    FROM crm.tarea t
    LEFT JOIN crm.cuenta cu       ON cu.id = t.cuenta_id
    LEFT JOIN odoo.res_partner rp ON rp.odoo_id = cu.cuenta_partner_odoo_id
                                  AND rp.company_key = 'GLOBAL'
    LEFT JOIN crm.contacto co     ON co.id = t.contacto_id
    LEFT JOIN odoo.res_partner rp_c ON rp_c.odoo_id = co.contacto_partner_odoo_id
                                    AND rp_c.company_key = 'GLOBAL'
"""


def _tarea_item(r, hoy_inicio_utc: datetime) -> dict:
    """Convierte un row de tarea en un item Mi Día con campos calculados."""
    d = row_to_dict(r)
    due_at = r["due_at"]
    es_vencida = due_at < hoy_inicio_utc
    delta = due_at - datetime.now(UTC)
    d["es_vencida"] = es_vencida
    d["minutos_hasta_vencer"] = int(delta.total_seconds() // 60)
    return d


# ═══════════════════════════════════════════════════════════════════════════


@router.get("")
async def get_mi_dia(
    as_user: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """Dashboard completo: usuario, kpis, 4 secciones."""
    hoy_inicio, hoy_fin = _lima_day_bounds()
    semana_inicio = hoy_inicio - timedelta(days=7)

    async with safe_acquire() as conn:
        target = await _resolve_target_user(conn, user, as_user)
        target_username = target["username"] if isinstance(target, dict) else _username(target)

        # KPIs en una sola query (4 subqueries, 1 round-trip)
        kpis_row = await conn.fetchrow(
            """
            SELECT
              (SELECT COUNT(*) FROM crm.tarea
               WHERE asignado_a = $1 AND status = 'PENDIENTE'
                 AND due_at >= $2 AND due_at < $3)              AS tareas_hoy,
              (SELECT COUNT(*) FROM crm.tarea
               WHERE asignado_a = $1 AND status = 'PENDIENTE'
                 AND due_at < $2)                               AS tareas_vencidas,
              (SELECT COUNT(*) FROM crm.interaccion
               WHERE created_by = $1 AND happened_at >= $4)     AS interacciones_semana,
              (SELECT COUNT(*) FROM crm.interaccion
               WHERE created_by = $1
                 AND happened_at >= $2 AND happened_at < $3)    AS interacciones_hoy
            """,
            target_username, hoy_inicio, hoy_fin, semana_inicio,
        )
        kpis = dict(kpis_row)

        # Sección: tareas_hoy
        tareas_hoy_rows = await conn.fetch(
            f"""
            SELECT {_TAREA_COLS}
            {_TAREA_JOINS}
            WHERE t.asignado_a = $1 AND t.status = 'PENDIENTE'
              AND t.due_at >= $2 AND t.due_at < $3
            ORDER BY t.prioridad ASC, t.due_at ASC
            """,
            target_username, hoy_inicio, hoy_fin,
        )

        # Sección: tareas_vencidas (limit 20, oldest first)
        tareas_venc_rows = await conn.fetch(
            f"""
            SELECT {_TAREA_COLS}
            {_TAREA_JOINS}
            WHERE t.asignado_a = $1 AND t.status = 'PENDIENTE'
              AND t.due_at < $2
            ORDER BY t.due_at ASC
            LIMIT 20
            """,
            target_username, hoy_inicio,
        )

        # Sección: interacciones recientes (last 10)
        interacciones_rows = await conn.fetch(
            """
            SELECT
                i.id, i.happened_at, i.cuenta_id, cu.cuenta_partner_odoo_id,
                rp.name  AS cuenta_nombre,
                rp_c.name AS contacto_nombre,
                i.channel, i.outcome, i.resumen, i.created_by
            FROM crm.interaccion i
            LEFT JOIN crm.cuenta cu       ON cu.id = i.cuenta_id
            LEFT JOIN odoo.res_partner rp ON rp.odoo_id = cu.cuenta_partner_odoo_id
                                          AND rp.company_key = 'GLOBAL'
            LEFT JOIN crm.contacto co     ON co.id = i.contacto_id
            LEFT JOIN odoo.res_partner rp_c ON rp_c.odoo_id = co.contacto_partner_odoo_id
                                            AND rp_c.company_key = 'GLOBAL'
            WHERE i.created_by = $1
            ORDER BY i.happened_at DESC
            LIMIT 10
            """,
            target_username,
        )

        # tareas_vencidas total real (puede ser > 20)
        total_venc = kpis["tareas_vencidas"]

        # Motor de cadencia
        cadencia_items = await _get_cadencia_alerts(conn, target_username)
        kpis["cadencia_hoy"] = len(cadencia_items)

    interacciones_items = []
    for r in interacciones_rows:
        d = row_to_dict(r)
        d["resumen"] = _truncate(d.get("resumen"))
        interacciones_items.append(d)

    return {
        "usuario": {
            "username": target.get("username") if isinstance(target, dict) else target_username,
            "rol":      target.get("rol") if isinstance(target, dict) else None,
            "nombre":   target.get("nombre_completo") if isinstance(target, dict) else None,
        },
        "viewing_as": target_username,
        "kpis": kpis,
        "secciones": {
            "urgente_proactivo": {
                "titulo": "Contactar hoy",
                "items": cadencia_items,
                "total": len(cadencia_items),
                "disponible": True,
            },
            "tareas_hoy": {
                "titulo": "Tareas de hoy",
                "items": [_tarea_item(r, hoy_inicio) for r in tareas_hoy_rows],
                "total": len(tareas_hoy_rows),
            },
            "tareas_vencidas": {
                "titulo": "Tareas vencidas",
                "items": [_tarea_item(r, hoy_inicio) for r in tareas_venc_rows],
                "total": total_venc,
                "mostrados": len(tareas_venc_rows),
            },
            "interacciones_recientes": {
                "titulo": "Tus últimas interacciones",
                "items": interacciones_items,
                "total": len(interacciones_items),
            },
        },
    }


@router.get("/kpis")
async def get_mi_dia_kpis(
    as_user: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """Solo los 4 KPIs del header — refresco rápido sin reload completo."""
    hoy_inicio, hoy_fin = _lima_day_bounds()
    semana_inicio = hoy_inicio - timedelta(days=7)

    async with safe_acquire() as conn:
        target = await _resolve_target_user(conn, user, as_user)
        target_username = target["username"] if isinstance(target, dict) else _username(target)

        row = await conn.fetchrow(
            """
            SELECT
              (SELECT COUNT(*) FROM crm.tarea
               WHERE asignado_a = $1 AND status = 'PENDIENTE'
                 AND due_at >= $2 AND due_at < $3)              AS tareas_hoy,
              (SELECT COUNT(*) FROM crm.tarea
               WHERE asignado_a = $1 AND status = 'PENDIENTE'
                 AND due_at < $2)                               AS tareas_vencidas,
              (SELECT COUNT(*) FROM crm.interaccion
               WHERE created_by = $1 AND happened_at >= $4)     AS interacciones_semana,
              (SELECT COUNT(*) FROM crm.interaccion
               WHERE created_by = $1
                 AND happened_at >= $2 AND happened_at < $3)    AS interacciones_hoy
            """,
            target_username, hoy_inicio, hoy_fin, semana_inicio,
        )
        result = dict(row)
        result["cadencia_hoy"] = await _get_cadencia_count(conn, target_username)
        return result


@router.get("/resumen-equipo")
async def get_resumen_equipo(user: dict = Depends(get_current_user)):
    """Vista admin-only: agregados de todos los vendedores."""
    if not _is_admin(user):
        raise HTTPException(403, "Solo admin puede ver el resumen del equipo")

    hoy_inicio, hoy_fin = _lima_day_bounds()

    async with safe_acquire() as conn:
        rows = await conn.fetch(
            """
            WITH
            tareas_agg AS (
                SELECT
                    asignado_a AS username,
                    COUNT(*) FILTER (WHERE status='PENDIENTE'
                                     AND due_at >= $1 AND due_at < $2) AS tareas_hoy,
                    COUNT(*) FILTER (WHERE status='PENDIENTE'
                                     AND due_at <  $1)                  AS tareas_vencidas
                FROM crm.tarea
                WHERE asignado_a IS NOT NULL
                GROUP BY asignado_a
            ),
            interacciones_agg AS (
                SELECT
                    created_by AS username,
                    COUNT(*) FILTER (WHERE happened_at >= $1 AND happened_at < $2)
                                                                AS interacciones_hoy,
                    MAX(happened_at)                            AS ultima_actividad
                FROM crm.interaccion
                WHERE created_by IS NOT NULL
                GROUP BY created_by
            )
            SELECT
                u.username, u.rol, u.nombre_completo AS nombre,
                COALESCE(t.tareas_hoy,        0) AS tareas_hoy,
                COALESCE(t.tareas_vencidas,   0) AS tareas_vencidas,
                COALESCE(i.interacciones_hoy, 0) AS interacciones_hoy,
                i.ultima_actividad
            FROM produccion.prod_usuarios u
            LEFT JOIN tareas_agg       t ON t.username = u.username
            LEFT JOIN interacciones_agg i ON i.username = u.username
            WHERE u.activo = true AND u.rol <> 'lectura'
            ORDER BY u.username
            """,
            hoy_inicio, hoy_fin,
        )

        items = [row_to_dict(r) for r in rows]
        total_th  = sum(r["tareas_hoy"]        for r in items)
        total_tv  = sum(r["tareas_vencidas"]   for r in items)
        total_ih  = sum(r["interacciones_hoy"] for r in items)

        return {
            "fecha": datetime.now(LIMA).date().isoformat(),
            "total_vendedores": len(items),
            "vendedores": items,
            "totales": {
                "total_tareas_hoy":        total_th,
                "total_tareas_vencidas":   total_tv,
                "total_interacciones_hoy": total_ih,
            },
        }
