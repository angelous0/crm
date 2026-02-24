"""Order override router – reassign POS orders to a different customer."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
import logging
from db import get_pool, record_to_dict, records_to_list

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/orders", tags=["orders"])


def _get_auth():
    from server import get_current_user
    return get_current_user


class OverrideCustomerInput(BaseModel):
    new_owner_partner_id: int
    reason: Optional[str] = None


@router.get("/search-customers")
async def search_customers(q: str = "", limit: int = 20, user=Depends(_get_auth())):
    """Search accounts (cuentas) for the override modal."""
    if not q or len(q) < 2:
        return {"items": []}
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT cl.cuenta_partner_odoo_id AS id,
                   rp.name AS nombre,
                   COALESCE(rp.vat, '') AS vat,
                   COALESCE(rp.city::text, '') AS ciudad
            FROM crm.v_cuentas_libres cl
            JOIN odoo.res_partner rp ON rp.odoo_id = cl.cuenta_partner_odoo_id AND rp.company_key = 'GLOBAL'
            LEFT JOIN crm.cuenta cu ON cu.cuenta_partner_odoo_id = cl.cuenta_partner_odoo_id
            WHERE COALESCE(cu.is_active, true) = true
              AND (rp.name ILIKE $1 OR COALESCE(rp.vat, '') ILIKE $1)
            ORDER BY rp.name
            LIMIT $2
        """, f"%{q}%", limit)
        return {"items": records_to_list(rows)}


@router.get("/{order_id}/override-customer")
async def get_override(order_id: int, user=Depends(_get_auth())):
    """Get the current active override for an order, if any."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT ov.id, ov.order_id, ov.original_partner_id, ov.new_owner_partner_id,
                   ov.reason, ov.created_at, ov.created_by, ov.updated_at, ov.updated_by,
                   ov.active,
                   rp_orig.name AS original_partner_name,
                   rp_new.name AS new_owner_partner_name
            FROM crm.pos_order_partner_override ov
            LEFT JOIN odoo.res_partner rp_orig ON rp_orig.odoo_id = ov.original_partner_id AND rp_orig.company_key = 'GLOBAL'
            LEFT JOIN odoo.res_partner rp_new ON rp_new.odoo_id = ov.new_owner_partner_id AND rp_new.company_key = 'GLOBAL'
            WHERE ov.order_id = $1 AND ov.active = true
        """, order_id)
        if not row:
            return {"override": None}
        return {"override": record_to_dict(row)}


@router.post("/{order_id}/override-customer")
async def create_override(order_id: int, data: OverrideCustomerInput, user=Depends(_get_auth())):
    """Create or update an override for an order (re-activates soft-deleted)."""
    pool = await get_pool()
    user_email = user.get("email", "unknown") if isinstance(user, dict) else "unknown"
    async with pool.acquire() as conn:
        order = await conn.fetchrow(
            "SELECT partner_id FROM odoo.pos_order WHERE odoo_id = $1", order_id
        )
        if not order:
            raise HTTPException(404, "Orden no encontrada")

        original_partner_id = order['partner_id']

        # Try to update existing (active or inactive) row first
        existing = await conn.fetchrow(
            "SELECT id, active FROM crm.pos_order_partner_override WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1",
            order_id
        )

        if existing:
            row = await conn.fetchrow("""
                UPDATE crm.pos_order_partner_override
                SET new_owner_partner_id = $2, original_partner_id = $3,
                    reason = $4, updated_by = $5, updated_at = now(),
                    active = true
                WHERE id = $1
                RETURNING id, order_id, original_partner_id, new_owner_partner_id,
                          reason, created_at, created_by, updated_at, updated_by, active
            """, existing['id'], data.new_owner_partner_id, original_partner_id,
                 data.reason, user_email)
        else:
            row = await conn.fetchrow("""
                INSERT INTO crm.pos_order_partner_override
                    (order_id, original_partner_id, new_owner_partner_id, reason, created_by, updated_by, active)
                VALUES ($1, $2, $3, $4, $5, $5, true)
                RETURNING id, order_id, original_partner_id, new_owner_partner_id,
                          reason, created_at, created_by, updated_at, updated_by, active
            """, order_id, original_partner_id, data.new_owner_partner_id,
                 data.reason, user_email)

        result = record_to_dict(row)

        names = await conn.fetchrow("""
            SELECT
                (SELECT name FROM odoo.res_partner WHERE odoo_id = $1 AND company_key = 'GLOBAL') AS original_name,
                (SELECT name FROM odoo.res_partner WHERE odoo_id = $2 AND company_key = 'GLOBAL') AS new_name
        """, original_partner_id, data.new_owner_partner_id)
        result['original_partner_name'] = names['original_name'] if names else None
        result['new_owner_partner_name'] = names['new_name'] if names else None

        return {"ok": True, "override": result}


@router.delete("/{order_id}/override-customer")
async def delete_override(order_id: int, user=Depends(_get_auth())):
    """Soft-delete: set active=false on the override."""
    pool = await get_pool()
    user_email = user.get("email", "unknown") if isinstance(user, dict) else "unknown"
    async with pool.acquire() as conn:
        res = await conn.execute("""
            UPDATE crm.pos_order_partner_override
            SET active = false, updated_at = now(), updated_by = $2
            WHERE order_id = $1 AND active = true
        """, order_id, user_email)
        affected = int(res.split()[-1]) if res else 0
        if not affected:
            raise HTTPException(404, "Override no encontrado")
        return {"ok": True, "deactivated": True}
