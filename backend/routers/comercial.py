"""Comercial (Ventas y Reservas) router – cascading filters, no subtotal in UI."""
from fastapi import APIRouter, Depends, Query
from typing import Optional, List
import asyncio
import logging
from db import get_pool, records_to_list

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/comercial", tags=["comercial"])

VIEW = "crm.v_comercial_mov_flat"

# Cascade filter fields in order
CASCADE_COLS = ['marca', 'tipo', 'entalle', 'tela', 'hilo', 'talla', 'color']


def _get_auth_dep():
    from server import get_current_user
    return get_current_user


def _base_where(params_list, fecha_desde, fecha_hasta, doc_tipo):
    """Build base WHERE for date range + doc_tipo."""
    parts = []
    if doc_tipo:
        params_list.append(doc_tipo)
        parts.append(f"doc_tipo = ${len(params_list)}")
    if fecha_desde:
        params_list.append(fecha_desde)
        parts.append(f"fecha >= ${len(params_list)}::text::timestamptz")
    if fecha_hasta:
        params_list.append(fecha_hasta + "T23:59:59")
        parts.append(f"fecha <= ${len(params_list)}::text::timestamptz")
    return parts


def _build_where(params_list, fecha_desde, fecha_hasta, marca, tipo,
                 entalle, tela, hilo, modelo, talla, color, cliente, doc_tipo):
    parts = _base_where(params_list, fecha_desde, fecha_hasta, doc_tipo)

    def _add_arr(col, val):
        if not val:
            return
        vals = [v.strip() for v in val.split(',') if v.strip()]
        if vals:
            params_list.append(vals)
            parts.append(f"{col} = ANY(${len(params_list)})")

    _add_arr('marca', marca)
    _add_arr('tipo', tipo)
    _add_arr('entalle', entalle)
    _add_arr('tela', tela)
    _add_arr('hilo', hilo)
    _add_arr('talla', talla)
    _add_arr('color', color)

    if modelo:
        params_list.append(f"%{modelo}%")
        parts.append(f"modelo_display ILIKE ${len(params_list)}")

    if cliente:
        params_list.append(f"%{cliente}%")
        parts.append(f"owner_partner_name ILIKE ${len(params_list)}")

    return ("WHERE " + " AND ".join(parts)) if parts else "WHERE 1=1"


def _cascade_where(params_list, filters_dict, exclude_col):
    """Build WHERE excluding one column for cascade logic."""
    parts = _base_where(params_list,
                        filters_dict.get('fecha_desde'),
                        filters_dict.get('fecha_hasta'),
                        filters_dict.get('doc_tipo'))

    for col in CASCADE_COLS:
        if col == exclude_col:
            continue
        val = filters_dict.get(col)
        if not val:
            continue
        vals = [v.strip() for v in val.split(',') if v.strip()]
        if vals:
            params_list.append(vals)
            parts.append(f"{col} = ANY(${len(params_list)})")

    modelo = filters_dict.get('modelo')
    if modelo and exclude_col != 'modelo':
        params_list.append(f"%{modelo}%")
        parts.append(f"modelo_display ILIKE ${len(params_list)}")

    cliente = filters_dict.get('cliente')
    if cliente and exclude_col != 'cliente':
        params_list.append(f"%{cliente}%")
        parts.append(f"owner_partner_name ILIKE ${len(params_list)}")

    return ("WHERE " + " AND ".join(parts)) if parts else "WHERE 1=1"


# ─── FILTER OPTIONS (cascading with counts) ───
@router.get("/filter-options")
async def comercial_filter_options(
    doc_tipo: Optional[str] = None,
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
    user=Depends(_get_auth_dep()),
):
    pool = await get_pool()
    all_f = dict(doc_tipo=doc_tipo, fecha_desde=fecha_desde, fecha_hasta=fecha_hasta,
                 marca=marca, tipo=tipo, entalle=entalle, tela=tela, hilo=hilo,
                 modelo=modelo, talla=talla, color=color, cliente=cliente)

    async def _fetch_col(col):
        params = []
        where = _cascade_where(params, all_f, exclude_col=col)
        async with pool.acquire() as conn:
            rows = await conn.fetch(f"""
                SELECT {col}::text AS value,
                       COUNT(*) AS cnt
                FROM {VIEW} {where}
                  AND {col} IS NOT NULL AND {col} <> ''
                GROUP BY {col} ORDER BY {col} LIMIT 500
            """, *params)
            return col, [{"value": r['value'], "count": r['cnt']} for r in rows]

    results = await asyncio.gather(*[_fetch_col(c) for c in CASCADE_COLS])
    return {col: vals for col, vals in results}


# ─── SUMMARY (KPIs + Top 10) ───
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
    excluir_clientes_varios: bool = False,
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
                       COUNT(DISTINCT order_id) AS count_orders,
                       COUNT(DISTINCT owner_partner_id) AS count_clients
                FROM {VIEW} {where}
            """, *params)

    async def _top_prod():
        async with pool.acquire() as conn:
            return records_to_list(await conn.fetch(f"""
                SELECT modelo_display, product_tmpl_id, marca, tipo,
                       SUM(qty) AS qty,
                       COUNT(DISTINCT order_id) AS orders
                FROM {VIEW} {where}
                GROUP BY modelo_display, product_tmpl_id, marca, tipo
                ORDER BY SUM(qty) DESC LIMIT 10
            """, *params))

    async def _top_cli():
        excl = ""
        if excluir_clientes_varios:
            excl = " AND owner_partner_name NOT ILIKE '%CLIENTES VARIOS%'"
        async with pool.acquire() as conn:
            return records_to_list(await conn.fetch(f"""
                SELECT owner_partner_id, owner_partner_name,
                       SUM(qty) AS qty,
                       COUNT(DISTINCT order_id) AS orders
                FROM {VIEW} {where} {excl}
                GROUP BY owner_partner_id, owner_partner_name
                ORDER BY SUM(qty) DESC LIMIT 10
            """, *params))

    kpi, top_p, top_c = await asyncio.gather(_kpis(), _top_prod(), _top_cli())

    return {
        "kpis": {
            "total_qty": float(kpi['total_qty']),
            "count_orders": kpi['count_orders'],
            "count_clients": kpi['count_clients'],
        },
        "top_productos": top_p,
        "top_clientes": top_c,
    }


# ─── DETAIL (paginated) ───
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
    user=Depends(_get_auth_dep()),
):
    pool = await get_pool()
    params = []
    where = _build_where(params, fecha_desde, fecha_hasta, marca,
                         tipo, entalle, tela, hilo, modelo, talla, color,
                         cliente, doc_tipo)
    offset = (page - 1) * limit

    async with pool.acquire() as conn:
        p = list(params)
        p.append(limit + 1)
        p.append(offset)
        rows = records_to_list(await conn.fetch(f"""
            SELECT doc_tipo, order_id, line_id, fecha,
                   owner_partner_id, owner_partner_name,
                   product_product_id, product_tmpl_id, modelo_display,
                   marca, tipo, entalle, tela, hilo,
                   talla, color, barcode, qty, price_unit
            FROM {VIEW} {where}
            ORDER BY fecha DESC, order_id DESC, line_id DESC
            LIMIT ${len(p)-1} OFFSET ${len(p)}
        """, *p))

    has_next = len(rows) > limit
    items = rows[:limit]
    return {"items": items, "has_next": has_next, "page": page, "limit": limit}
