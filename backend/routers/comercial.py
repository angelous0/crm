"""Comercial (Ventas y Reservas) router – optimized."""
from fastapi import APIRouter, Depends, Query
from typing import Optional
import asyncio
import logging
from db import get_pool, records_to_list

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/comercial", tags=["comercial"])

VIEW = "crm.v_comercial_mov_flat"


def _get_auth_dep():
    from server import get_current_user
    return get_current_user


def _build_where(params_list, fecha_desde, fecha_hasta, marca, tipo,
                 entalle, tela, hilo, modelo, talla, color, cliente, doc_tipo):
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

    return ("WHERE " + " AND ".join(parts)) if parts else "WHERE 1=1"


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
    user=Depends(_get_auth_dep()),
):
    pool = await get_pool()
    params = []
    where = _build_where(params, fecha_desde, fecha_hasta, marca,
                         tipo, entalle, tela, hilo, modelo, talla, color,
                         cliente, doc_tipo)

    async def _kpis():
        async with pool.acquire() as conn:
            return await conn.fetchrow(f"""
                SELECT COALESCE(SUM(qty),0) AS total_qty,
                       COALESCE(SUM(subtotal),0) AS total_subtotal,
                       COUNT(DISTINCT order_id) AS count_orders
                FROM {VIEW} {where}
            """, *params)

    async def _top_prod():
        async with pool.acquire() as conn:
            return records_to_list(await conn.fetch(f"""
                SELECT modelo, marca, tipo, talla, color,
                       SUM(qty) AS qty, SUM(subtotal) AS subtotal,
                       COUNT(DISTINCT order_id) AS orders
                FROM {VIEW} {where}
                GROUP BY modelo, marca, tipo, talla, color
                ORDER BY SUM(qty) DESC LIMIT 10
            """, *params))

    async def _top_cli():
        async with pool.acquire() as conn:
            return records_to_list(await conn.fetch(f"""
                SELECT partner_id, partner_name,
                       SUM(qty) AS qty, SUM(subtotal) AS subtotal,
                       COUNT(DISTINCT order_id) AS orders
                FROM {VIEW} {where}
                GROUP BY partner_id, partner_name
                ORDER BY SUM(subtotal) DESC LIMIT 10
            """, *params))

    kpi, top_p, top_c = await asyncio.gather(_kpis(), _top_prod(), _top_cli())

    return {
        "kpis": {
            "total_qty": float(kpi['total_qty']),
            "total_subtotal": float(kpi['total_subtotal']),
            "count_orders": kpi['count_orders'],
        },
        "top_productos": top_p,
        "top_clientes": top_c,
    }


@router.get("/filter-options")
async def comercial_filter_options(
    doc_tipo: Optional[str] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    user=Depends(_get_auth_dep()),
):
    """Lightweight endpoint: only filters by doc_tipo + dates for speed."""
    pool = await get_pool()
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
    where = ("WHERE " + " AND ".join(parts)) if parts else "WHERE 1=1"

    cols = ['marca', 'tipo', 'entalle', 'tela', 'hilo', 'talla', 'color']

    async def _fetch_col(col):
        async with pool.acquire() as conn:
            rows = await conn.fetch(f"""
                SELECT DISTINCT {col} AS value FROM {VIEW}
                {where} AND {col} IS NOT NULL AND {col} <> ''
                ORDER BY {col}
            """, *params)
            return col, [r['value'] for r in rows]

    results = await asyncio.gather(*[_fetch_col(c) for c in cols])
    return {col: vals for col, vals in results}


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
    params = []
    where = _build_where(params, fecha_desde, fecha_hasta, marca,
                         tipo, entalle, tela, hilo, modelo, talla, color,
                         cliente, doc_tipo)
    offset = (page - 1) * limit

    async with pool.acquire() as conn:
        p = list(params)
        p.append(limit + 1)  # fetch one extra to detect next page
        p.append(offset)
        rows = records_to_list(await conn.fetch(f"""
            SELECT doc_tipo, order_id, line_id, fecha,
                   partner_id, partner_name,
                   product_product_id, product_tmpl_id, modelo,
                   marca, tipo, entalle, tela, hilo,
                   talla, color, barcode, qty, price_unit, subtotal
            FROM {VIEW} {where}
            ORDER BY fecha DESC, order_id DESC, line_id DESC
            LIMIT ${len(p)-1} OFFSET ${len(p)}
        """, *p))

    has_next = len(rows) > limit
    items = rows[:limit]
    return {"items": items, "has_next": has_next, "page": page, "limit": limit}
