"""Créditos router – invoice-header + line-detail endpoints."""
from fastapi import APIRouter, Depends
from typing import Optional
import logging
from db import get_pool, records_to_list

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/creditos", tags=["creditos"])

HEADER_VIEW = "crm.v_credito_invoice_header"
LINES_VIEW = "crm.v_credito_flat"


def _get_auth():
    from server import get_current_user
    return get_current_user


def _build_where(params, fecha_desde=None, fecha_hasta=None, state=None,
                 cliente=None, solo_con_saldo=False):
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
        parts.append(f"(partner_name ILIKE ${len(params)} OR owner_partner_name ILIKE ${len(params)})")
    if solo_con_saldo:
        parts.append("amount_residual > 0")
    return ("WHERE " + " AND ".join(parts)) if parts else ""


# ── Global invoice headers ──
@router.get("/invoices")
async def creditos_invoices(
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    state: Optional[str] = None,
    cliente: Optional[str] = None,
    solo_con_saldo: bool = False,
    page: int = 1,
    limit: int = 50,
    user=Depends(_get_auth()),
):
    pool = await get_pool()
    params = []
    where = _build_where(params, fecha_desde, fecha_hasta, state, cliente, solo_con_saldo)

    async with pool.acquire() as conn:
        met = await conn.fetchrow(f"""
            SELECT COUNT(*) AS invoices_count,
                   COALESCE(SUM(qty_total), 0) AS qty_total,
                   COALESCE(SUM(amount_residual), 0) AS saldo_total,
                   COALESCE(SUM(amount_total), 0) AS total_facturado,
                   COUNT(DISTINCT owner_partner_id) AS clientes_count
            FROM {HEADER_VIEW} {where}
        """, *params)

        p2 = list(params)
        offset = (page - 1) * limit
        p2.append(limit + 1)
        p2.append(offset)
        rows = records_to_list(await conn.fetch(f"""
            SELECT invoice_id, invoice_number, date_invoice, state,
                   partner_id, partner_name, owner_partner_id, owner_partner_name,
                   amount_total, amount_residual, qty_total, lines_count
            FROM {HEADER_VIEW} {where}
            ORDER BY date_invoice DESC, invoice_id DESC
            LIMIT ${len(p2)-1} OFFSET ${len(p2)}
        """, *p2))

    has_next = len(rows) > limit
    return {
        "metrics": {
            "invoices_count": met['invoices_count'],
            "qty_total": float(met['qty_total']),
            "saldo_total": float(met['saldo_total']),
            "total_facturado": float(met['total_facturado']),
            "clientes_count": met['clientes_count'],
        },
        "rows": rows[:limit],
        "page": page,
        "limit": limit,
        "has_next": has_next,
    }


# ── Invoice lines detail (on-demand) ──
@router.get("/invoices/{invoice_id}/lines")
async def credito_invoice_lines(
    invoice_id: int,
    page: int = 1,
    limit: int = 100,
    user=Depends(_get_auth()),
):
    pool = await get_pool()
    offset = (page - 1) * limit
    async with pool.acquire() as conn:
        rows = records_to_list(await conn.fetch(f"""
            SELECT invoice_id, invoice_number, date_invoice, state,
                   partner_id, partner_name,
                   amount_total, amount_residual,
                   line_id, product_id, line_description, qty, price_unit, price_subtotal,
                   modelo_display, product_tmpl_id, barcode, talla, color,
                   marca, tipo, entalle, tela, hilo
            FROM {LINES_VIEW}
            WHERE invoice_id = $1
            ORDER BY line_id
            LIMIT $2 OFFSET $3
        """, invoice_id, limit + 1, offset))
    has_next = len(rows) > limit
    return {"items": rows[:limit], "has_next": has_next, "page": page}


# ── Legacy metrics (backward compat for /metrics) ──
@router.get("/metrics")
async def creditos_global_metrics(
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    state: Optional[str] = None,
    cliente: Optional[str] = None,
    solo_con_saldo: bool = False,
    user=Depends(_get_auth()),
):
    pool = await get_pool()
    params = []
    where = _build_where(params, fecha_desde, fecha_hasta, state, cliente, solo_con_saldo)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(f"""
            SELECT COUNT(*) AS invoices_count,
                   COALESCE(SUM(qty_total), 0) AS qty_total,
                   COALESCE(SUM(amount_residual), 0) AS saldo_total,
                   COALESCE(SUM(amount_total), 0) AS total_facturado,
                   COUNT(DISTINCT owner_partner_id) AS clientes_count,
                   MAX(date_invoice) AS last_invoice_date,
                   MIN(date_invoice) AS first_invoice_date
            FROM {HEADER_VIEW} {where}
        """, *params)
    return {
        "invoices_count": row['invoices_count'],
        "lines_count": 0,
        "qty_total": float(row['qty_total']),
        "saldo_total": float(row['saldo_total']),
        "total_facturado": float(row['total_facturado']),
        "clientes_count": row['clientes_count'],
        "last_invoice_date": str(row['last_invoice_date']) if row['last_invoice_date'] else None,
        "first_invoice_date": str(row['first_invoice_date']) if row['first_invoice_date'] else None,
    }


# ── Filter options ──
@router.get("/filter-options")
async def creditos_filter_options(user=Depends(_get_auth())):
    pool = await get_pool()
    async with pool.acquire() as conn:
        states = await conn.fetch(f"SELECT DISTINCT state FROM {HEADER_VIEW} WHERE state IS NOT NULL ORDER BY state")
    return {"states": [r['state'] for r in states]}
