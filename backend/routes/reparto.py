"""Reparto de cartera — listar y asignar cuentas en masa (Sprint CRM-D8).

Endpoints solo para admin/supervisor. La acción de asignar/remover usa los
endpoints existentes de `/api/admin/carteras/...` que ya manejan tanto la
junction `crm.usuario_cartera` como el legacy `crm.cuenta.asignado_a`.

Acá solo añadimos:
  - GET /api/reparto/cuentas → listado paginado con filtros para el grid
  - GET /api/reparto/resumen → KPIs y conteo por vendedora / depto
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from auth_utils import get_current_user
from db import safe_acquire
from helpers import row_to_dict


router = APIRouter(prefix="/api/reparto", tags=["reparto"])


def _solo_admin(user: dict):
    if user.get("rol") not in ("admin", "supervisor"):
        raise HTTPException(403, "Solo admin o supervisor")


@router.get("/cuentas")
async def listar_cuentas_reparto(
    q: str = "",
    depto: str = "",
    estado_auto: str = "",      # CSV: 'vip,activo,en_riesgo,dormido,perdido,nuevo,sin_data'
    tier: str = "",             # CSV: 'oro,plata,bronce'
    asignacion: str = "sin",    # sin | asignada | todas
    asignado_a: str = "",       # filtrar por vendedora específica
    min_orders_12m: int = 0,    # cuentas con al menos N órdenes en últimos 12 meses
    solo_con_telefono: bool = False,
    solo_no_mayoristas: bool = False,  # alerta: partners nuevos de Odoo sin flag mayorista
    sort: str = "amount_12m",   # amount_12m | last_purchase | nombre | prioridad
    dir: str = "desc",
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    user: dict = Depends(get_current_user),
):
    """Lista cuentas activas filtrables para reparto masivo.

    Devuelve `cuenta_id` (UUID) — usable directamente en
    POST /api/admin/carteras/asignar.
    """
    _solo_admin(user)

    async with safe_acquire() as conn:
        offset = (page - 1) * limit
        params: list = []
        where = """
            WHERE COALESCE(cu.is_active, true) = true
              AND COALESCE(cu.manual_inactive, false) = false
              AND COALESCE(cu.approval_status, 'APPROVED') = 'APPROVED'
              AND cu.id IS NOT NULL
        """

        # ── Asignación: sin / asignada / todas ──
        if asignacion == "sin":
            where += " AND cu.asignado_a IS NULL"
        elif asignacion == "asignada":
            where += " AND cu.asignado_a IS NOT NULL"
        # 'todas' → no filtra

        if asignado_a:
            params.append(asignado_a)
            where += f" AND cu.asignado_a = ${len(params)}"

        # ── Búsqueda libre ──
        if q:
            params.append(f"%{q}%")
            idx = len(params)
            where += (
                f" AND (rp.name ILIKE ${idx}"
                f" OR COALESCE(rp.vat,'') ILIKE ${idx}"
                f" OR COALESCE(rp.phone::text,'') ILIKE ${idx}"
                f" OR COALESCE(rp.mobile::text,'') ILIKE ${idx})"
            )

        if depto:
            params.append(f"%{depto}%")
            idx = len(params)
            where += (
                f" AND (cu.departamento ILIKE ${idx}"
                f" OR rp.state_name::text ILIKE ${idx})"
            )

        if estado_auto:
            ea_list = [e.strip() for e in estado_auto.split(",") if e.strip()]
            if ea_list:
                params.append(ea_list)
                where += f" AND mvce.estado_auto = ANY(${len(params)})"

        if tier:
            t_list = [t.strip() for t in tier.split(",") if t.strip()]
            if t_list:
                params.append(t_list)
                where += f" AND mvce.tier = ANY(${len(params)})"

        if min_orders_12m and min_orders_12m > 0:
            params.append(min_orders_12m)
            where += f" AND COALESCE(mvce.orders_12m, 0) >= ${len(params)}"

        if solo_con_telefono:
            where += (
                " AND (COALESCE(btrim(rp.phone::text), '') <> ''"
                "      OR COALESCE(btrim(rp.mobile::text), '') <> '')"
            )

        if solo_no_mayoristas:
            # Override CRM gana sobre Odoo — muestra partners que NO son mayoristas
            # (candidatos a revisión: posible trabajador/proveedor/consumidor final)
            where += " AND COALESCE(cu.mayorista, rp.mayorista, false) = false"

        # ── Ordenamiento ──
        sort_map = {
            "amount_12m":    "COALESCE(mvce.amount_12m, 0)",
            "last_purchase": "mvce.last_purchase_date",
            "nombre":        "rp.name",
            "prioridad":     "COALESCE(mvce.prioridad_score, 0)",
            "orders_12m":    "COALESCE(mvce.orders_12m, 0)",
        }
        order_col = sort_map.get(sort, "COALESCE(mvce.amount_12m, 0)")
        order_dir = "ASC" if dir.lower() == "asc" else "DESC"
        nulls = "NULLS LAST" if order_dir == "DESC" else "NULLS FIRST"

        base_from = """
            FROM crm.cuenta cu
            JOIN odoo.res_partner rp
              ON rp.odoo_id = cu.cuenta_partner_odoo_id
             AND rp.company_key = 'GLOBAL'
            LEFT JOIN crm.mv_cuenta_estado mvce
              ON mvce.cuenta_partner_odoo_id = cu.cuenta_partner_odoo_id
        """

        data_params = params + [limit, offset]
        rows = await conn.fetch(
            f"""
            SELECT
                cu.id                                AS cuenta_id,
                cu.cuenta_partner_odoo_id            AS partner_odoo_id,
                rp.name                              AS nombre,
                COALESCE(rp.vat, '')                 AS vat,
                COALESCE(rp.catalog_06_name, '')     AS doc_tipo_name,
                COALESCE(rp.phone::text, '')         AS phone,
                COALESCE(rp.mobile::text, '')        AS mobile,
                COALESCE(NULLIF(cu.departamento, ''), rp.state_name::text, '') AS depto,
                COALESCE(NULLIF(cu.distrito, ''),    rp.district_name)         AS distrito,
                COALESCE(cu.mayorista, rp.mayorista, false) AS mayorista,
                cu.estado_comercial,
                cu.clasificacion,
                cu.asignado_a,
                u.nombre_completo                    AS asignado_nombre,
                u.color_hex                          AS asignado_color,
                mvce.estado_auto,
                mvce.tier,
                mvce.last_purchase_date,
                COALESCE(mvce.orders_12m, 0)::bigint AS orders_12m,
                COALESCE(mvce.amount_12m, 0)::float  AS amount_12m,
                COALESCE(mvce.amount_total, 0)::float AS amount_total,
                COALESCE(mvce.recencia_dias, 0)::int AS recencia_dias,
                COALESCE(mvce.prioridad_score, 0)::float AS prioridad_score,
                COUNT(*) OVER()                      AS _total
            {base_from}
            LEFT JOIN crm.usuario u ON u.username = cu.asignado_a
            {where}
            ORDER BY {order_col} {order_dir} {nulls}
            LIMIT ${len(data_params) - 1} OFFSET ${len(data_params)}
            """,
            *data_params,
        )

        total = int(rows[0]["_total"]) if rows else 0
        items = []
        for r in rows:
            d = row_to_dict(r)
            d.pop("_total", None)
            d["cuenta_id"]       = str(d["cuenta_id"])
            d["partner_odoo_id"] = int(d["partner_odoo_id"])
            items.append(d)

        return {
            "items":  items,
            "total":  total,
            "page":   page,
            "limit":  limit,
        }


@router.get("/resumen")
async def resumen_reparto(user: dict = Depends(get_current_user)):
    """KPIs agregados de cartera: total, sin asignar, por vendedora, por depto."""
    _solo_admin(user)

    async with safe_acquire() as conn:
        # KPIs principales + alerta de no-mayoristas
        totales = await conn.fetchrow("""
            SELECT
                COUNT(*)                                                    AS total,
                COUNT(*) FILTER (WHERE cu.asignado_a IS NULL)               AS sin_asignar,
                COUNT(*) FILTER (WHERE cu.asignado_a IS NOT NULL)           AS asignadas,
                COUNT(*) FILTER (
                    WHERE COALESCE(cu.mayorista, rp.mayorista, false) = false
                )                                                           AS no_mayoristas
            FROM crm.cuenta cu
            JOIN odoo.res_partner rp
              ON rp.odoo_id = cu.cuenta_partner_odoo_id
             AND rp.company_key = 'GLOBAL'
            WHERE COALESCE(cu.is_active, true) = true
              AND COALESCE(cu.manual_inactive, false) = false
              AND COALESCE(cu.approval_status, 'APPROVED') = 'APPROVED'
        """)

        # Conteo por vendedora (solo equipo activo)
        por_vendedora = await conn.fetch("""
            SELECT
                u.username,
                u.nombre_completo,
                u.color_hex,
                u.rol,
                u.activo,
                COALESCE(c.n, 0)::int AS cuentas
            FROM crm.usuario u
            LEFT JOIN (
                SELECT cu.asignado_a, COUNT(*) AS n
                FROM crm.cuenta cu
                WHERE COALESCE(cu.is_active, true) = true
                  AND COALESCE(cu.manual_inactive, false) = false
                  AND cu.asignado_a IS NOT NULL
                GROUP BY cu.asignado_a
            ) c ON c.asignado_a = u.username
            WHERE u.es_equipo_ventas = true
              AND u.activo = true
            ORDER BY cuentas DESC, u.nombre_completo NULLS LAST
        """)

        # Top 15 deptos con más cuentas sin asignar
        por_depto = await conn.fetch("""
            SELECT
                COALESCE(NULLIF(cu.departamento, ''), rp.state_name::text, '— sin depto —') AS depto,
                COUNT(*)                                              AS total,
                COUNT(*) FILTER (WHERE cu.asignado_a IS NULL)         AS sin_asignar,
                COUNT(*) FILTER (WHERE cu.asignado_a IS NOT NULL)     AS asignadas
            FROM crm.cuenta cu
            JOIN odoo.res_partner rp
              ON rp.odoo_id = cu.cuenta_partner_odoo_id
             AND rp.company_key = 'GLOBAL'
            WHERE COALESCE(cu.is_active, true) = true
              AND COALESCE(cu.manual_inactive, false) = false
            GROUP BY depto
            ORDER BY sin_asignar DESC, total DESC
            LIMIT 15
        """)

        total = int(totales["total"] or 0)
        sin   = int(totales["sin_asignar"] or 0)
        asig  = int(totales["asignadas"] or 0)
        no_may = int(totales["no_mayoristas"] or 0)

        return {
            "total":          total,
            "sin_asignar":    sin,
            "asignadas":      asig,
            "no_mayoristas":  no_may,  # alerta: partners nuevos sin flag
            "pct_asignacion": (asig / total * 100) if total > 0 else 0,
            "por_vendedora":  [row_to_dict(r) for r in por_vendedora],
            "por_depto":      [row_to_dict(r) for r in por_depto],
        }
