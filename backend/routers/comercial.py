"""Comercial (Ventas y Reservas) router – order-header + line-detail endpoints."""
from fastapi import APIRouter, Depends, Query
from typing import Optional
import asyncio
import logging
from db import get_pool, records_to_list

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/comercial", tags=["comercial"])

HEADER_VIEW = "crm.v_comercial_order_header"
LINES_VIEW = "crm.v_comercial_mov_flat"


def _get_auth():
    from server import get_current_user
    return get_current_user


def _build_header_where(params, doc_tipo=None, fecha_desde=None, fecha_hasta=None,
                        cliente=None, exclude_varios=False):
    parts = []
    if doc_tipo:
        params.append(doc_tipo)
        parts.append(f"doc_tipo = ${len(params)}")
    if fecha_desde:
        params.append(fecha_desde)
        parts.append(f"date_order >= ${len(params)}::text::timestamptz")
    if fecha_hasta:
        params.append(fecha_hasta + "T23:59:59")
        parts.append(f"date_order <= ${len(params)}::text::timestamptz")
    if cliente:
        params.append(f"%{cliente}%")
        parts.append(f"owner_partner_name ILIKE ${len(params)}")
    if exclude_varios:
        parts.append("owner_partner_name NOT ILIKE '%varios%'")
    return ("WHERE " + " AND ".join(parts)) if parts else ""


# ── Global order headers ──
@router.get("/orders")
async def comercial_orders(
    doc_tipo: Optional[str] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    cliente: Optional[str] = None,
    exclude_varios: bool = False,
    page: int = 1,
    limit: int = 50,
    user=Depends(_get_auth()),
):
    pool = await get_pool()
    params = []
    where = _build_header_where(params, doc_tipo, fecha_desde, fecha_hasta,
                                cliente, exclude_varios)

    async with pool.acquire() as conn:
        # metrics
        met = await conn.fetchrow(f"""
            SELECT COUNT(*) AS orders_count,
                   COALESCE(SUM(qty_total), 0) AS qty_total,
                   COUNT(DISTINCT owner_partner_id) AS clientes_count
            FROM {HEADER_VIEW} {where}
        """, *params)

        # paginated rows
        p2 = list(params)
        offset = (page - 1) * limit
        p2.append(limit + 1)
        p2.append(offset)
        rows = records_to_list(await conn.fetch(f"""
            SELECT doc_tipo, order_id, order_name, date_order, state,
                   amount_total, owner_partner_id, owner_partner_name,
                   has_override, original_partner_name, qty_total, lines_count
            FROM {HEADER_VIEW} {where}
            ORDER BY date_order DESC, order_id DESC
            LIMIT ${len(p2)-1} OFFSET ${len(p2)}
        """, *p2))

    has_next = len(rows) > limit
    return {
        "metrics": {
            "orders_count": met['orders_count'],
            "qty_total": float(met['qty_total']),
            "clientes_count": met['clientes_count'],
        },
        "rows": rows[:limit],
        "page": page,
        "limit": limit,
        "has_next": has_next,
    }


# ── Order lines detail (on-demand) ──
@router.get("/orders/{order_id}/lines")
async def comercial_order_lines(
    order_id: int,
    page: int = 1,
    limit: int = 100,
    user=Depends(_get_auth()),
):
    pool = await get_pool()
    offset = (page - 1) * limit
    async with pool.acquire() as conn:
        rows = records_to_list(await conn.fetch(f"""
            SELECT doc_tipo, order_id, line_id, fecha, partner_id,
                   owner_partner_id, owner_partner_name, has_override, original_partner_name,
                   product_product_id, product_tmpl_id,
                   modelo_display, marca, tipo, entalle, tela, hilo,
                   talla, color, barcode, qty, price_unit, subtotal
            FROM {LINES_VIEW}
            WHERE order_id = $1
            ORDER BY line_id
            LIMIT $2 OFFSET $3
        """, order_id, limit + 1, offset))
    has_next = len(rows) > limit
    return {"items": rows[:limit], "has_next": has_next, "page": page}


# ── Global order lines (detail mode) ──
@router.get("/lines")
async def comercial_lines(
    doc_tipo: Optional[str] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    cliente: Optional[str] = None,
    exclude_varios: bool = False,
    page: int = 1,
    limit: int = 50,
    user=Depends(_get_auth()),
):
    pool = await get_pool()

    # Line-level filters
    params = []
    parts = []
    if doc_tipo:
        params.append(doc_tipo)
        parts.append(f"doc_tipo = ${len(params)}")
    if fecha_desde:
        params.append(fecha_desde)
        parts.append(f"fecha >= ${len(params)}::text::timestamptz")
    if fecha_hasta:
        params.append(fecha_hasta + "T23:59:59")
        parts.append(f"fecha <= ${len(params)}::text::timestamptz")
    if cliente:
        params.append(f"%{cliente}%")
        parts.append(f"owner_partner_name ILIKE ${len(params)}")
    if exclude_varios:
        parts.append("owner_partner_name NOT ILIKE '%varios%'")
    where = ("WHERE " + " AND ".join(parts)) if parts else ""

    # Header-level metrics (consistent KPIs)
    h_params = []
    h_where = _build_header_where(h_params, doc_tipo, fecha_desde, fecha_hasta,
                                  cliente, exclude_varios)

    async with pool.acquire() as conn:
        met = await conn.fetchrow(f"""
            SELECT COUNT(*) AS orders_count,
                   COALESCE(SUM(qty_total), 0) AS qty_total,
                   COUNT(DISTINCT owner_partner_id) AS clientes_count
            FROM {HEADER_VIEW} {h_where}
        """, *h_params)

        p2 = list(params)
        offset = (page - 1) * limit
        p2.append(limit + 1)
        p2.append(offset)
        rows = records_to_list(await conn.fetch(f"""
            SELECT doc_tipo, order_id, line_id, fecha, partner_id,
                   owner_partner_id, owner_partner_name, has_override, original_partner_name,
                   product_product_id, product_tmpl_id,
                   modelo_display, marca, tipo, entalle, tela, hilo,
                   talla, color, barcode, qty, price_unit, subtotal
            FROM {LINES_VIEW} {where}
            ORDER BY fecha DESC, line_id DESC
            LIMIT ${len(p2)-1} OFFSET ${len(p2)}
        """, *p2))

    has_next = len(rows) > limit
    return {
        "metrics": {
            "orders_count": met['orders_count'],
            "qty_total": float(met['qty_total']),
            "clientes_count": met['clientes_count'],
        },
        "rows": rows[:limit],
        "page": page,
        "limit": limit,
        "has_next": has_next,
    }


# ── Legacy summary endpoint (keep backward compat) ──
@router.get("/summary")
async def comercial_summary(
    doc_tipo: str = "SALE",
    fecha_desde: str = "",
    fecha_hasta: str = "",
    exclude_varios: bool = False,
    user=Depends(_get_auth()),
):
    pool = await get_pool()
    params = []
    where = _build_header_where(params, doc_tipo, fecha_desde, fecha_hasta,
                                exclude_varios=exclude_varios)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(f"""
            SELECT COUNT(*) AS count_orders,
                   COALESCE(SUM(qty_total), 0) AS total_qty,
                   COUNT(DISTINCT owner_partner_id) AS count_clients
            FROM {HEADER_VIEW} {where}
        """, *params)
    return {
        "kpis": {
            "total_qty": float(row['total_qty']),
            "count_orders": row['count_orders'],
            "count_clients": row['count_clients'],
        },
        "top10_products": [],
        "top10_clients": [],
    }


# ── Legacy detail endpoint (line-level, optional) ──
@router.get("/detail")
async def comercial_detail(
    doc_tipo: str = "SALE",
    fecha_desde: str = "",
    fecha_hasta: str = "",
    page: int = 1,
    limit: int = 50,
    user=Depends(_get_auth()),
):
    pool = await get_pool()
    params = [doc_tipo]
    where = "WHERE doc_tipo = $1"
    if fecha_desde:
        params.append(fecha_desde)
        where += f" AND fecha >= ${len(params)}::text::timestamptz"
    if fecha_hasta:
        params.append(fecha_hasta + "T23:59:59")
        where += f" AND fecha <= ${len(params)}::text::timestamptz"

    offset = (page - 1) * limit
    params.append(limit + 1)
    params.append(offset)
    async with pool.acquire() as conn:
        rows = records_to_list(await conn.fetch(f"""
            SELECT * FROM {LINES_VIEW} {where}
            ORDER BY fecha DESC, line_id DESC
            LIMIT ${len(params)-1} OFFSET ${len(params)}
        """, *params))
    has_next = len(rows) > limit
    return {"items": rows[:limit], "has_next": has_next, "page": page, "limit": limit}


# ── Filter options for header view ──
@router.get("/filter-options")
async def comercial_filter_options(user=Depends(_get_auth())):
    return {"states": ["done", "paid", "invoiced"]}
