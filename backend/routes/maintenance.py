"""Maintenance: inactivación masiva de cuentas/contactos sin ventas."""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth_utils import get_current_user
from db import safe_acquire
from helpers import row_to_dict

router = APIRouter(prefix="/api/maintenance")


class InactivateInput(BaseModel):
    scope: Literal["cuentas", "contactos", "ambos"] = "ambos"
    months: Optional[int] = None
    reason: str = "SIN_VENTAS"


def _date_filter(months: Optional[int]) -> str:
    if months and months > 0:
        return f"AND oh.date_order >= (now() - interval '{int(months)} months')"
    return ""


@router.get("/inactivate-no-sales/preview")
async def preview_inactivation(
    scope: str = "ambos",
    months: Optional[int] = None,
    _user: dict = Depends(get_current_user),
):
    if scope not in ("cuentas", "contactos", "ambos"):
        raise HTTPException(400, "scope must be cuentas, contactos, or ambos")

    date_clause = _date_filter(months)

    async with safe_acquire() as conn:
        cuentas_count = 0
        contactos_count = 0
        sample_cuentas = []
        sample_contactos = []

        if scope in ("cuentas", "ambos"):
            cuentas_count = await conn.fetchval(f"""
                SELECT COUNT(*) FROM crm.cuenta cu
                WHERE cu.is_active = true
                  AND cu.manual_inactive = false
                  AND COALESCE(cu.approval_status, 'APPROVED') = 'APPROVED'
                  AND NOT EXISTS (
                      SELECT 1 FROM crm.v_comercial_order_header oh
                      WHERE oh.doc_tipo = 'SALE'
                        AND oh.owner_partner_id = cu.cuenta_partner_odoo_id
                        {date_clause}
                  )
            """) or 0

            sample_cuentas = [row_to_dict(r) for r in await conn.fetch(f"""
                SELECT cu.cuenta_partner_odoo_id AS id,
                       rp.name AS nombre,
                       COALESCE(rp.vat, '') AS vat,
                       COALESCE(rp.city::text, '') AS ciudad
                FROM crm.cuenta cu
                JOIN odoo.res_partner rp
                  ON rp.odoo_id = cu.cuenta_partner_odoo_id AND rp.company_key = 'GLOBAL'
                WHERE cu.is_active = true
                  AND cu.manual_inactive = false
                  AND COALESCE(cu.approval_status, 'APPROVED') = 'APPROVED'
                  AND NOT EXISTS (
                      SELECT 1 FROM crm.v_comercial_order_header oh
                      WHERE oh.doc_tipo = 'SALE'
                        AND oh.owner_partner_id = cu.cuenta_partner_odoo_id
                        {date_clause}
                  )
                ORDER BY rp.name
                LIMIT 20
            """)]

        if scope in ("contactos", "ambos"):
            contactos_count = await conn.fetchval(f"""
                SELECT COUNT(*) FROM crm.contacto co
                WHERE co.is_active = true
                  AND co.manual_inactive = false
                  AND COALESCE(co.approval_status, 'APPROVED') = 'APPROVED'
                  AND co.cuenta_partner_odoo_id IS NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM crm.v_comercial_order_header oh
                      WHERE oh.doc_tipo = 'SALE'
                        AND oh.owner_partner_id = co.contacto_partner_odoo_id
                        {date_clause}
                  )
            """) or 0

            sample_contactos = [row_to_dict(r) for r in await conn.fetch(f"""
                SELECT co.contacto_partner_odoo_id AS id,
                       rp.name AS nombre,
                       COALESCE(rp.vat, '') AS vat,
                       COALESCE(rp.city::text, '') AS ciudad
                FROM crm.contacto co
                JOIN odoo.res_partner rp
                  ON rp.odoo_id = co.contacto_partner_odoo_id AND rp.company_key = 'GLOBAL'
                WHERE co.is_active = true
                  AND co.manual_inactive = false
                  AND COALESCE(co.approval_status, 'APPROVED') = 'APPROVED'
                  AND co.cuenta_partner_odoo_id IS NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM crm.v_comercial_order_header oh
                      WHERE oh.doc_tipo = 'SALE'
                        AND oh.owner_partner_id = co.contacto_partner_odoo_id
                        {date_clause}
                  )
                ORDER BY rp.name
                LIMIT 20
            """)]

    return {
        "cuentas_candidates": cuentas_count,
        "contactos_candidates": contactos_count,
        "sample_cuentas": sample_cuentas,
        "sample_contactos": sample_contactos,
        "months": months,
        "scope": scope,
    }


@router.post("/inactivate-no-sales")
async def execute_inactivation(
    data: InactivateInput,
    user: dict = Depends(get_current_user),
):
    date_clause = _date_filter(data.months)
    user_email = user.get("usuario", "unknown") if isinstance(user, dict) else "unknown"
    reason = data.reason or "SIN_VENTAS"

    async with safe_acquire() as conn:
        cuentas_affected = 0
        contactos_affected = 0

        if data.scope in ("cuentas", "ambos"):
            res = await conn.execute(f"""
                UPDATE crm.cuenta SET
                    is_active = false,
                    manual_inactive = true,
                    inactive_reason = $1,
                    inactive_at = now(),
                    inactive_by = $2
                WHERE is_active = true
                  AND manual_inactive = false
                  AND COALESCE(approval_status, 'APPROVED') = 'APPROVED'
                  AND NOT EXISTS (
                      SELECT 1 FROM crm.v_comercial_order_header oh
                      WHERE oh.doc_tipo = 'SALE'
                        AND oh.owner_partner_id = cuenta_partner_odoo_id
                        {date_clause}
                  )
            """, reason, user_email)
            cuentas_affected = int(res.split()[-1]) if res else 0

        if data.scope in ("contactos", "ambos"):
            res = await conn.execute(f"""
                UPDATE crm.contacto SET
                    is_active = false,
                    manual_inactive = true,
                    inactive_reason = $1,
                    inactive_at = now(),
                    inactive_by = $2
                WHERE is_active = true
                  AND manual_inactive = false
                  AND COALESCE(approval_status, 'APPROVED') = 'APPROVED'
                  AND cuenta_partner_odoo_id IS NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM crm.v_comercial_order_header oh
                      WHERE oh.doc_tipo = 'SALE'
                        AND oh.owner_partner_id = contacto_partner_odoo_id
                        {date_clause}
                  )
            """, reason, user_email)
            contactos_affected = int(res.split()[-1]) if res else 0

    return {
        "ok": True,
        "cuentas_affected": cuentas_affected,
        "contactos_affected": contactos_affected,
        "scope": data.scope,
        "months": data.months,
        "reason": reason,
        "executed_by": user_email,
    }
