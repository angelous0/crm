"""Endpoints de contactos: directorio, edición, soft-disable, revinculación."""
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from auth_utils import get_current_user
from db import safe_acquire
from helpers import row_to_dict


router = APIRouter(prefix="/api/contactos", tags=["crm-contactos"])


class ContactoUpdateInput(BaseModel):
    rol: Optional[str] = None
    whatsapp: Optional[str] = None


class ToggleActiveInput(BaseModel):
    is_active: bool
    reason: Optional[str] = None


class BatchToggleActiveInput(BaseModel):
    ids: List[int]
    is_active: bool
    reason: Optional[str] = None


class RevincularInput(BaseModel):
    cuenta_partner_odoo_id: int


def _user_audit(user: dict) -> str:
    return user.get("username", "unknown") if isinstance(user, dict) else "unknown"


@router.get("")
async def get_contactos(
    search: str = "",
    page: int = 1,
    limit: int = 50,
    solo_dni: bool = False,
    solo_telefono: bool = False,
    cuenta_partner_odoo_id: Optional[int] = None,
    _user: dict = Depends(get_current_user),
):
    """Listado de contactos (odoo.res_partner GLOBAL+activos) con cuenta asignada.

    Si se pasa `cuenta_partner_odoo_id`, filtra a los contactos cuya cuenta efectiva
    (via crm.v_partner_account_final) sea ese partner.
    """
    async with safe_acquire() as conn:
        offset = (page - 1) * limit
        where = "WHERE rp.company_key = 'GLOBAL' AND COALESCE(rp.active, true) = true"
        params: list = []

        if search:
            params.append(f"%{search}%")
            idx = len(params)
            where += (
                f" AND (rp.name ILIKE ${idx}"
                f" OR COALESCE(rp.vat,'') ILIKE ${idx}"
                f" OR COALESCE(rp.phone::text,'') ILIKE ${idx}"
                f" OR COALESCE(rp.mobile::text,'') ILIKE ${idx})"
            )
        if solo_dni:
            where += " AND rp.vat IS NOT NULL AND rp.vat <> ''"
        if solo_telefono:
            where += (
                " AND ((rp.phone IS NOT NULL AND rp.phone::text <> '')"
                "  OR (rp.mobile IS NOT NULL AND rp.mobile::text <> ''))"
            )
        if cuenta_partner_odoo_id is not None:
            params.append(cuenta_partner_odoo_id)
            where += f" AND m.cuenta_partner_odoo_id = ${len(params)}"

        base_from = """
            FROM odoo.res_partner rp
            LEFT JOIN crm.v_partner_account_final m
                ON m.contacto_partner_odoo_id = rp.odoo_id
            LEFT JOIN odoo.res_partner rp_cuenta
                ON rp_cuenta.odoo_id = m.cuenta_partner_odoo_id
                AND rp_cuenta.company_key = 'GLOBAL'
        """

        count = await conn.fetchval(
            f"SELECT COUNT(*) {base_from} {where}",
            *params,
        )

        data_params = params + [limit, offset]
        rows = await conn.fetch(
            f"""SELECT
                rp.odoo_id,
                rp.name,
                COALESCE(rp.vat, '')           AS vat,
                COALESCE(rp.phone::text, '')   AS phone,
                COALESCE(rp.mobile::text, '')  AS mobile,
                COALESCE(rp.city::text, '')    AS city,
                m.cuenta_partner_odoo_id,
                CASE WHEN m.cuenta_partner_odoo_id = rp.odoo_id THEN NULL
                     ELSE rp_cuenta.name END   AS cuenta_nombre
            {base_from}
            {where}
            ORDER BY rp.name
            LIMIT ${len(data_params) - 1} OFFSET ${len(data_params)}""",
            *data_params,
        )
        return {
            "items": [row_to_dict(r) for r in rows],
            "total": count,
            "page": page,
        }


@router.put("/{contacto_id}")
async def update_contacto(
    contacto_id: str,
    data: ContactoUpdateInput,
    _user: dict = Depends(get_current_user),
):
    """Actualiza rol y/o whatsapp de un contacto (por UUID de crm.contacto)."""
    async with safe_acquire() as conn:
        sets: list = []
        params: list = []
        if data.rol is not None:
            params.append(data.rol)
            sets.append(f"rol = ${len(params)}")
        if data.whatsapp is not None:
            params.append(data.whatsapp)
            sets.append(f"whatsapp = ${len(params)}")
        if not sets:
            raise HTTPException(400, "No hay campos para actualizar")
        sets.append("updated_at = now()")
        params.append(contacto_id)
        row = await conn.fetchrow(
            f"UPDATE crm.contacto SET {', '.join(sets)} "
            f"WHERE id = ${len(params)}::uuid RETURNING *",
            *params,
        )
        if not row:
            raise HTTPException(404, "Contacto no encontrado")
        return row_to_dict(row)


@router.patch("/batch-active")
async def batch_toggle_contactos_active(
    data: BatchToggleActiveInput,
    user: dict = Depends(get_current_user),
):
    """Activa/desactiva contactos en lote. Si alguno es principal, cascada a su cuenta."""
    async with safe_acquire() as conn:
        user_email = _user_audit(user)
        ids = [int(i) for i in data.ids]
        if not ids:
            return {"ok": True, "contactos_affected": 0, "cuentas_affected": 0}

        contactos_affected = 0
        cuentas_affected = 0

        if not data.is_active:
            reason = data.reason or "MANUAL"
            res = await conn.execute(
                """
                UPDATE crm.contacto
                SET is_active = false, manual_inactive = true,
                    inactive_reason = $2, inactive_at = now(),
                    inactive_by = $3, updated_at = now()
                WHERE contacto_partner_odoo_id = ANY($1) AND is_active = true
                """,
                ids, reason, user_email,
            )
            contactos_affected = int(res.split()[-1]) if res else 0

            # Cascada: si alguno es principal, desactivar su cuenta + contactos hermanos
            principal_cuentas = await conn.fetch(
                """
                SELECT DISTINCT c.cuenta_partner_odoo_id
                FROM crm.contacto c
                WHERE c.contacto_partner_odoo_id = ANY($1)
                  AND c.contacto_partner_odoo_id = c.cuenta_partner_odoo_id
                """,
                ids,
            )
            if principal_cuentas:
                cuenta_ids = [r["cuenta_partner_odoo_id"] for r in principal_cuentas]
                res2 = await conn.execute(
                    """
                    UPDATE crm.cuenta
                    SET is_active = false, manual_inactive = true,
                        inactive_reason = 'CASCADE_CONTACT', inactive_at = now(),
                        inactive_by = $2, updated_at = now()
                    WHERE cuenta_partner_odoo_id = ANY($1) AND is_active = true
                    """,
                    cuenta_ids, user_email,
                )
                cuentas_affected = int(res2.split()[-1]) if res2 else 0

                await conn.execute(
                    """
                    UPDATE crm.contacto
                    SET is_active = false, manual_inactive = true,
                        inactive_reason = 'CASCADE_CONTACT', inactive_at = now(),
                        inactive_by = $2, updated_at = now()
                    WHERE cuenta_partner_odoo_id = ANY($1)
                      AND contacto_partner_odoo_id <> ALL($3)
                      AND is_active = true
                    """,
                    cuenta_ids, user_email, ids,
                )
        else:
            res = await conn.execute(
                """
                UPDATE crm.contacto
                SET is_active = true, manual_inactive = false,
                    inactive_reason = NULL, inactive_at = NULL,
                    inactive_by = NULL, updated_at = now()
                WHERE contacto_partner_odoo_id = ANY($1) AND is_active = false
                """,
                ids,
            )
            contactos_affected = int(res.split()[-1]) if res else 0

        return {
            "ok": True,
            "is_active": data.is_active,
            "contactos_affected": contactos_affected,
            "cuentas_affected": cuentas_affected,
        }


@router.patch("/{contacto_odoo_id}/active")
async def toggle_contacto_active(
    contacto_odoo_id: str,
    data: ToggleActiveInput,
    user: dict = Depends(get_current_user),
):
    """Activa/desactiva un contacto. Si es principal, cascada a su cuenta + hermanos."""
    async with safe_acquire() as conn:
        odoo_id = int(contacto_odoo_id)
        user_email = _user_audit(user)

        contacto = await conn.fetchrow(
            "SELECT * FROM crm.contacto WHERE contacto_partner_odoo_id = $1",
            odoo_id,
        )
        if not contacto:
            raise HTTPException(404, "Contacto no encontrado en CRM")

        cuenta_odoo_id = contacto["cuenta_partner_odoo_id"]
        is_principal = (odoo_id == cuenta_odoo_id)

        if not data.is_active:
            await conn.execute(
                """
                UPDATE crm.contacto
                SET is_active = false, manual_inactive = true,
                    inactive_reason = $2, inactive_at = now(),
                    inactive_by = $3, updated_at = now()
                WHERE contacto_partner_odoo_id = $1
                """,
                odoo_id, data.reason or "MANUAL", user_email,
            )

            cascade_cuenta = False
            cascade_contacts = 0
            if is_principal:
                await conn.execute(
                    """
                    UPDATE crm.cuenta
                    SET is_active = false, manual_inactive = true,
                        inactive_reason = 'CASCADE_CONTACT', inactive_at = now(),
                        inactive_by = $2, updated_at = now()
                    WHERE cuenta_partner_odoo_id = $1 AND is_active = true
                    """,
                    cuenta_odoo_id, user_email,
                )
                cascade_cuenta = True

                affected = await conn.execute(
                    """
                    UPDATE crm.contacto
                    SET is_active = false, manual_inactive = true,
                        inactive_reason = 'CASCADE_CONTACT', inactive_at = now(),
                        inactive_by = $3, updated_at = now()
                    WHERE cuenta_partner_odoo_id = $1
                      AND contacto_partner_odoo_id <> $2
                      AND is_active = true
                    """,
                    cuenta_odoo_id, odoo_id, user_email,
                )
                cascade_contacts = int(affected.split()[-1]) if affected else 0

            return {
                "ok": True,
                "is_active": False,
                "is_principal": is_principal,
                "cascade_cuenta": cascade_cuenta,
                "cascade_contacts": cascade_contacts,
            }
        else:
            await conn.execute(
                """
                UPDATE crm.contacto
                SET is_active = true, manual_inactive = false,
                    inactive_reason = NULL, inactive_at = NULL,
                    inactive_by = NULL, updated_at = now()
                WHERE contacto_partner_odoo_id = $1
                """,
                odoo_id,
            )
            return {"ok": True, "is_active": True, "is_principal": is_principal}


@router.post("/{contacto_id}/revincular")
async def revincular_contacto(
    contacto_id: str,
    data: RevincularInput,
    _user: dict = Depends(get_current_user),
):
    """Reasigna un contacto a otra cuenta (vía partner_principal_override + update directo)."""
    async with safe_acquire() as conn:
        contacto = await conn.fetchrow(
            "SELECT * FROM crm.contacto WHERE id = $1::uuid",
            contacto_id,
        )
        if not contacto:
            raise HTTPException(404, "Contacto no encontrado")

        await conn.execute(
            """
            INSERT INTO crm.partner_principal_override
                (contacto_partner_odoo_id, cuenta_partner_odoo_id)
            VALUES ($1, $2)
            ON CONFLICT (contacto_partner_odoo_id)
            DO UPDATE SET cuenta_partner_odoo_id = $2, updated_at = now()
            """,
            contacto["contacto_partner_odoo_id"], data.cuenta_partner_odoo_id,
        )

        await conn.execute(
            "UPDATE crm.contacto SET cuenta_partner_odoo_id = $1, updated_at = now() "
            "WHERE id = $2::uuid",
            data.cuenta_partner_odoo_id, contacto_id,
        )

        await conn.execute(
            """
            INSERT INTO crm.cuenta (cuenta_partner_odoo_id)
            VALUES ($1)
            ON CONFLICT (cuenta_partner_odoo_id) DO NOTHING
            """,
            data.cuenta_partner_odoo_id,
        )

        return {"ok": True}
