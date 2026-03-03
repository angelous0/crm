"""Maintenance router – bulk inactivation of accounts/contacts without sales."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, Literal
import logging
from db import get_pool, records_to_list

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/maintenance", tags=["maintenance"])


def _get_auth():
    from server import get_current_user
    return get_current_user


class InactivateInput(BaseModel):
    scope: Literal['cuentas', 'contactos', 'ambos'] = 'ambos'
    months: Optional[int] = None
    reason: str = 'SIN_VENTAS'


def _date_filter(months: Optional[int]) -> str:
    """Return a SQL date clause fragment for the sales window."""
    if months and months > 0:
        return f"AND oh.date_order >= (now() - interval '{int(months)} months')"
    return ""


@router.get("/inactivate-no-sales/preview")
async def preview_inactivation(
    scope: str = "ambos",
    months: Optional[int] = None,
    user=Depends(_get_auth()),
):
    if scope not in ("cuentas", "contactos", "ambos"):
        raise HTTPException(400, "scope must be cuentas, contactos, or ambos")

    pool = await get_pool()
    date_clause = _date_filter(months)

    async with pool.acquire() as conn:
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

            sample_cuentas = records_to_list(await conn.fetch(f"""
                SELECT cu.cuenta_partner_odoo_id AS id, rp.name AS nombre,
                       COALESCE(rp.vat, '') AS vat, COALESCE(rp.city::text, '') AS ciudad
                FROM crm.cuenta cu
                JOIN odoo.res_partner rp ON rp.odoo_id = cu.cuenta_partner_odoo_id AND rp.company_key = 'GLOBAL'
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
            """))

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

            sample_contactos = records_to_list(await conn.fetch(f"""
                SELECT co.contacto_partner_odoo_id AS id, rp.name AS nombre,
                       COALESCE(rp.vat, '') AS vat, COALESCE(rp.city::text, '') AS ciudad
                FROM crm.contacto co
                JOIN odoo.res_partner rp ON rp.odoo_id = co.contacto_partner_odoo_id AND rp.company_key = 'GLOBAL'
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
            """))

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
    user=Depends(_get_auth()),
):
    pool = await get_pool()
    date_clause = _date_filter(data.months)
    user_email = user.get("usuario", "unknown") if isinstance(user, dict) else "unknown"
    reason = data.reason or "SIN_VENTAS"

    async with pool.acquire() as conn:
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

    logger.info(f"Inactivation executed by {user_email}: {cuentas_affected} cuentas, {contactos_affected} contactos (scope={data.scope}, months={data.months})")

    return {
        "ok": True,
        "cuentas_affected": cuentas_affected,
        "contactos_affected": contactos_affected,
        "scope": data.scope,
        "months": data.months,
        "reason": reason,
        "executed_by": user_email,
    }
