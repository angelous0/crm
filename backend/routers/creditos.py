"""Créditos router – global credit invoice endpoints."""
from fastapi import APIRouter, Depends, Query
from typing import Optional
import asyncio
import logging
from db import get_pool, records_to_list

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/creditos", tags=["creditos"])

VIEW = "crm.v_credito_flat"


def _get_auth_dep():
    from server import get_current_user
    return get_current_user


def _build_where(params, fecha_desde=None, fecha_hasta=None, state=None,
                 cliente=None, marca=None, tipo=None, entalle=None,
                 tela=None, hilo=None, modelo=None, solo_con_saldo=False):
    parts = []
    if state:
        params.append(state)
        parts.append(f"state = ${len(params)}")
    if fecha_desde:
        params.append(fecha_desde)
        parts.append(f"date_invoice >= ${len(params)}::text::date")
    if fecha_hasta:
        params.append(fecha_hasta)
        parts.append(f"date_invoice <= ${len(params)}::text::date")
    if cliente:
        params.append(f"%{cliente}%")
        parts.append(f"partner_name ILIKE ${len(params)}")

    def _add_arr(col, val):
        if not val:
            return
        vals = [v.strip() for v in val.split(',') if v.strip()]
        if vals:
            params.append(vals)
            parts.append(f"{col} = ANY(${len(params)})")

    _add_arr('marca', marca)
    _add_arr('tipo', tipo)
    _add_arr('entalle', entalle)
    _add_arr('tela', tela)
    _add_arr('hilo', hilo)

    if modelo:
        params.append(f"%{modelo}%")
        parts.append(f"modelo_display ILIKE ${len(params)}")
    if solo_con_saldo:
        parts.append("amount_residual > 0")

    return ("WHERE " + " AND ".join(parts)) if parts else ""


@router.get("/metrics")
async def creditos_global_metrics(
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    state: Optional[str] = None,
    cliente: Optional[str] = None,
    marca: Optional[str] = None,
    tipo: Optional[str] = None,
    entalle: Optional[str] = None,
    tela: Optional[str] = None,
    hilo: Optional[str] = None,
    modelo: Optional[str] = None,
    solo_con_saldo: bool = False,
    user=Depends(_get_auth_dep()),
):
    pool = await get_pool()
    params = []
    where = _build_where(params, fecha_desde, fecha_hasta, state, cliente,
                         marca, tipo, entalle, tela, hilo, modelo, solo_con_saldo)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(f"""
            SELECT COUNT(DISTINCT invoice_id) AS invoices_count,
                   COUNT(*) AS lines_count,
                   COALESCE(SUM(qty), 0) AS qty_total,
                   COALESCE(SUM(DISTINCT amount_residual), 0) AS saldo_total_approx,
                   MAX(date_invoice) AS last_invoice_date,
                   MIN(date_invoice) AS first_invoice_date,
                   COUNT(DISTINCT partner_id) AS clientes_count
            FROM {VIEW} {where}
        """, *params)
        # Accurate saldo: sum at invoice level
        saldo_row = await conn.fetchrow(f"""
            SELECT COALESCE(SUM(amount_residual), 0) AS saldo_total,
                   COALESCE(SUM(amount_total), 0) AS total_facturado
            FROM (
                SELECT DISTINCT invoice_id, amount_residual, amount_total
                FROM {VIEW} {where}
            ) sub
        """, *params)
        return {
            "invoices_count": row['invoices_count'],
            "lines_count": row['lines_count'],
            "qty_total": float(row['qty_total']),
            "saldo_total": float(saldo_row['saldo_total']),
            "total_facturado": float(saldo_row['total_facturado']),
            "clientes_count": row['clientes_count'],
            "last_invoice_date": str(row['last_invoice_date']) if row['last_invoice_date'] else None,
            "first_invoice_date": str(row['first_invoice_date']) if row['first_invoice_date'] else None,
        }


@router.get("/filter-options")
async def creditos_filter_options(
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    state: Optional[str] = None,
    solo_con_saldo: bool = False,
    user=Depends(_get_auth_dep()),
):
    pool = await get_pool()
    params = []
    where = _build_where(params, fecha_desde, fecha_hasta, state,
                         solo_con_saldo=solo_con_saldo)

    async def _fetch(col):
        p = list(params)
        w = where if where else "WHERE 1=1"
        async with pool.acquire() as conn:
            rows = await conn.fetch(f"""
                SELECT {col}::text AS value, COUNT(*) AS cnt
                FROM {VIEW} {w}
                AND {col} IS NOT NULL AND {col} <> ''
                GROUP BY {col} ORDER BY {col} LIMIT 300
            """, *p)
            return col, [{"value": r['value'], "count": r['cnt']} for r in rows]

    results = await asyncio.gather(*[_fetch(c) for c in ['marca', 'tipo', 'entalle', 'tela', 'hilo']])
    # States
    async with pool.acquire() as conn:
        states = await conn.fetch(f"SELECT DISTINCT state FROM {VIEW} WHERE state IS NOT NULL ORDER BY state")
    return {
        **{col: vals for col, vals in results},
        "states": [r['state'] for r in states],
    }


@router.get("")
async def creditos_global_list(
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    state: Optional[str] = None,
    cliente: Optional[str] = None,
    marca: Optional[str] = None,
    tipo: Optional[str] = None,
    entalle: Optional[str] = None,
    tela: Optional[str] = None,
    hilo: Optional[str] = None,
    modelo: Optional[str] = None,
    solo_con_saldo: bool = False,
    page: int = 1,
    limit: int = 50,
    user=Depends(_get_auth_dep()),
):
    pool = await get_pool()
    params = []
    where = _build_where(params, fecha_desde, fecha_hasta, state, cliente,
                         marca, tipo, entalle, tela, hilo, modelo, solo_con_saldo)
    offset = (page - 1) * limit
    params.append(limit + 1)
    params.append(offset)
    async with pool.acquire() as conn:
        rows = records_to_list(await conn.fetch(f"""
            SELECT invoice_id, invoice_number, date_invoice, state,
                   partner_id, partner_name, cuenta_id,
                   amount_total, amount_residual,
                   line_id, product_id, line_description, qty, price_unit, price_subtotal,
                   modelo_display, product_tmpl_id, barcode, talla, color,
                   marca, tipo, entalle, tela, hilo
            FROM {VIEW} {where}
            ORDER BY date_invoice DESC, invoice_id DESC, line_id DESC
            LIMIT ${len(params)-1} OFFSET ${len(params)}
        """, *params))
    has_next = len(rows) > limit
    return {"items": rows[:limit], "has_next": has_next, "page": page, "limit": limit}
