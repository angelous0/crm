"""Comercial (Ventas y Reservas) router."""
from fastapi import APIRouter, Depends, Query
from typing import Optional
import logging
from db import get_pool, records_to_list

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/comercial", tags=["comercial"])

VIEW = "crm.v_comercial_mov_flat"


def _build_where(params_list, fecha_desde, fecha_hasta, tienda, marca, tipo,
                 entalle, tela, hilo, modelo, talla, color, cliente, doc_tipo):
    """Build WHERE clause dynamically. params_list is mutated (appended)."""
    parts = []

    def _add_arr(col, val):
        if not val:
            return
        vals = [v.strip() for v in val.split(',') if v.strip()]
        if vals:
            params_list.append(vals)
            parts.append(f"{col} = ANY(${len(params_list)})")

    if doc_tipo:
        params_list.append(doc_tipo)
        parts.append(f"doc_tipo = ${len(params_list)}")

    if fecha_desde:
        params_list.append(fecha_desde)
        parts.append(f"fecha >= ${len(params_list)}::text::timestamptz")

    if fecha_hasta:
        params_list.append(fecha_hasta + "T23:59:59")
        parts.append(f"fecha <= ${len(params_list)}::text::timestamptz")

    _add_arr('marca', marca)
    _add_arr('tipo', tipo)
    _add_arr('entalle', entalle)
    _add_arr('tela', tela)
    _add_arr('hilo', hilo)
    _add_arr('talla', talla)
    _add_arr('color', color)

    if modelo:
        params_list.append(f"%{modelo}%")
        parts.append(f"modelo ILIKE ${len(params_list)}")

    if cliente:
        params_list.append(f"%{cliente}%")
        parts.append(f"partner_name ILIKE ${len(params_list)}")

    where = "WHERE " + (" AND ".join(parts)) if parts else "WHERE 1=1"
    return where


@router.get("/summary")
async def comercial_summary(
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    marca: Optional[str] = None,
    tipo: Optional[str] = None,
    entalle: Optional[str] = None,
    tela: Optional[str] = None,
    hilo: Optional[str] = None,
    modelo: Optional[str] = None,
    talla: Optional[str] = None,
    color: Optional[str] = None,
    cliente: Optional[str] = None,
    doc_tipo: Optional[str] = None,
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        params = []
        where = _build_where(params, fecha_desde, fecha_hasta, None, marca,
                             tipo, entalle, tela, hilo, modelo, talla, color,
                             cliente, doc_tipo)

        # KPIs
        kpi_sql = f"""
            SELECT
                COALESCE(SUM(qty), 0) AS total_qty,
                COALESCE(SUM(subtotal), 0) AS total_subtotal,
                COUNT(DISTINCT order_id) AS count_orders
            FROM {VIEW} {where}
        """
        kpi = await conn.fetchrow(kpi_sql, *params)

        # Top 10 productos
        top_prod_sql = f"""
            SELECT modelo, marca, tipo, talla, color,
                   SUM(qty) AS qty, SUM(subtotal) AS subtotal,
                   COUNT(DISTINCT order_id) AS orders
            FROM {VIEW} {where}
            GROUP BY modelo, marca, tipo, talla, color
            ORDER BY SUM(qty) DESC
            LIMIT 10
        """
        top_productos = records_to_list(await conn.fetch(top_prod_sql, *params))

        # Top 10 clientes
        top_cli_sql = f"""
            SELECT partner_id, partner_name,
                   SUM(qty) AS qty, SUM(subtotal) AS subtotal,
                   COUNT(DISTINCT order_id) AS orders
            FROM {VIEW} {where}
            GROUP BY partner_id, partner_name
            ORDER BY SUM(subtotal) DESC
            LIMIT 10
        """
        top_clientes = records_to_list(await conn.fetch(top_cli_sql, *params))

        # Filter options (for dynamic slicers)
        opts = {}
        for col in ['marca', 'tipo', 'entalle', 'tela', 'hilo', 'talla', 'color']:
            opt_sql = f"""
                SELECT {col} AS value, COUNT(*) AS cnt
                FROM {VIEW} {where}
                WHERE {col} IS NOT NULL AND {col} <> ''
                GROUP BY {col} ORDER BY {col}
            """.replace(f"{where}\n", f"{where} AND ", 1) if where != "WHERE 1=1" else f"""
                SELECT {col} AS value, COUNT(*) AS cnt
                FROM {VIEW}
                WHERE {col} IS NOT NULL AND {col} <> ''
                GROUP BY {col} ORDER BY {col}
            """
            # Simpler: just query distinct values with the same filters
            opt_params = list(params)
            opt_sql2 = f"""
                SELECT DISTINCT {col} AS value
                FROM {VIEW} {where}
                ORDER BY {col}
            """
            try:
                rows = await conn.fetch(opt_sql2, *opt_params)
                opts[col] = [r['value'] for r in rows if r['value']]
            except Exception:
                opts[col] = []

        return {
            "kpis": {
                "total_qty": float(kpi['total_qty']),
                "total_subtotal": float(kpi['total_subtotal']),
                "count_orders": kpi['count_orders'],
            },
            "top_productos": top_productos,
            "top_clientes": top_clientes,
            "filter_opts": opts,
        }


@router.get("/detail")
async def comercial_detail(
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    marca: Optional[str] = None,
    tipo: Optional[str] = None,
    entalle: Optional[str] = None,
    tela: Optional[str] = None,
    hilo: Optional[str] = None,
    modelo: Optional[str] = None,
    talla: Optional[str] = None,
    color: Optional[str] = None,
    cliente: Optional[str] = None,
    doc_tipo: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        params = []
        where = _build_where(params, fecha_desde, fecha_hasta, None, marca,
                             tipo, entalle, tela, hilo, modelo, talla, color,
                             cliente, doc_tipo)

        # Count
        cnt_sql = f"SELECT COUNT(*) FROM {VIEW} {where}"
        total = await conn.fetchval(cnt_sql, *params)

        # Paginated rows
        offset = (page - 1) * limit
        params.append(limit)
        params.append(offset)
        detail_sql = f"""
            SELECT doc_tipo, order_id, line_id, fecha,
                   partner_id, partner_name,
                   product_product_id, product_tmpl_id, modelo,
                   marca, tipo, entalle, tela, hilo,
                   talla, color, barcode,
                   qty, price_unit, subtotal
            FROM {VIEW} {where}
            ORDER BY fecha DESC, order_id DESC, line_id DESC
            LIMIT ${len(params) - 1} OFFSET ${len(params)}
        """
        rows = records_to_list(await conn.fetch(detail_sql, *params))

        return {
            "items": rows,
            "total": total,
            "page": page,
            "limit": limit,
        }
