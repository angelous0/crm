"""Endpoints sobre odoo.res_partner para uso del CRM (lookups)."""
from typing import Optional
from fastapi import APIRouter, Depends

from auth_utils import get_current_user
from db import safe_acquire
from helpers import row_to_dict


router = APIRouter(prefix="/api/partners", tags=["crm-partners"])


@router.get("/unlinked")
async def list_unlinked_partners(
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    include_linked: bool = False,
    exclude_cuenta_id: Optional[int] = None,
    _user: dict = Depends(get_current_user),
):
    """Partners GLOBAL+activos disponibles para vincular como contacto.

    ─── Modelo de vinculación (alineado con la terminología del usuario) ───
    Cada partner cae en una de 4 categorías:

      • `solo` (standalone): tiene su propia cuenta CRM pero NADIE más está
        vinculado a esa cuenta. Está "solo" en su grupo de uno.
      • `principal`: es el principal de un grupo CON otros vinculados (>1).
      • `secundario`: pertenece al grupo de OTRO partner (es contacto/vinculado).
      • `orphan`: no tiene cuenta CRM todavía (existe en Odoo sin tracking CRM).

    Por DEFAULT (`include_linked=false`) se devuelven solo `solo` + `orphan` —
    estos son los "no vinculados" que el user puede agregar sin consecuencias.

    Con `include_linked=true` se incluyen TODOS (principales + secundarios).
    Cada item trae `estado_vinculo` y `linked_cuenta_*` para que el UI muestre
    el contexto (a qué grupo pertenece) y permita decidir.

    `exclude_cuenta_id`: oculta partners que ya están en esa misma cuenta
    (no tiene sentido mostrarlos como opción para vincular ahí).
    """
    async with safe_acquire() as conn:
        params: list = []
        where = """
            WHERE rp.company_key = 'GLOBAL'
              AND COALESCE(rp.active, true) = true
        """
        if search:
            params.append(f"%{search}%")
            idx = len(params)
            where += (
                f" AND (rp.name ILIKE ${idx}"
                f" OR COALESCE(rp.vat, '') ILIKE ${idx})"
            )

        # SQL base: enriquece cada partner con su estado_vinculo
        base_sql = f"""
            WITH partners_filtrados AS (
                SELECT rp.* FROM odoo.res_partner rp {where}
            ),
            partner_cuenta AS (
                -- Para cada partner: UNA fila con la cuenta más relevante.
                -- Un partner puede aparecer en varias cuentas en v_cuenta_partners
                -- (ej: su cuenta propia + el grupo al que fue vinculado).
                -- Prioridad: secundario activo (en otra cuenta) > solo/principal > orphan.
                SELECT DISTINCT ON (p.odoo_id)
                    p.odoo_id AS partner_id,
                    c.id      AS cuenta_id,
                    c.cuenta_partner_odoo_id AS cuenta_principal_odoo_id
                FROM partners_filtrados p
                LEFT JOIN crm.v_cuenta_partners vcp ON vcp.partner_id = p.odoo_id
                LEFT JOIN crm.cuenta c              ON c.id = vcp.cuenta_id
                  AND COALESCE(c.is_active, true) = true
                  AND COALESCE(c.manual_inactive, false) = false
                ORDER BY
                  p.odoo_id,
                  CASE
                    WHEN c.id IS NULL THEN 2  -- orphan / cuenta inactiva → último recurso
                    WHEN c.cuenta_partner_odoo_id <> p.odoo_id THEN 0  -- secundario en otra cuenta → ganadora
                    ELSE 1  -- principal/solo de su propia cuenta
                  END
            ),
            cuenta_size AS (
                -- Cuántos partners hay en cada cuenta (solo cuentas activas)
                SELECT vcp.cuenta_id, COUNT(*) AS n
                FROM crm.v_cuenta_partners vcp
                JOIN crm.cuenta c ON c.id = vcp.cuenta_id
                WHERE COALESCE(c.is_active, true) = true
                  AND COALESCE(c.manual_inactive, false) = false
                GROUP BY vcp.cuenta_id
            )
            SELECT
                p.odoo_id,
                p.name,
                COALESCE(p.vat, '')          AS vat,
                COALESCE(p.catalog_06_name, '') AS catalog_06_name,
                COALESCE(p.phone::text, '')  AS phone,
                COALESCE(p.mobile::text, '') AS mobile,
                COALESCE(p.city::text, '')   AS city,
                COALESCE(p.state_name::text, '') AS state_name,
                pc.cuenta_id,
                pc.cuenta_principal_odoo_id,
                rp_principal.name AS cuenta_principal_name,
                COALESCE(cs.n, 0) AS n_partners_en_cuenta,
                CASE
                    WHEN pc.cuenta_id IS NULL THEN 'orphan'
                    WHEN pc.cuenta_principal_odoo_id = p.odoo_id AND COALESCE(cs.n,1) = 1 THEN 'solo'
                    WHEN pc.cuenta_principal_odoo_id = p.odoo_id THEN 'principal'
                    ELSE 'secundario'
                END AS estado_vinculo,
                (SELECT COUNT(*) FROM odoo.pos_order po WHERE po.partner_id = p.odoo_id) AS sales_count
            FROM partners_filtrados p
            LEFT JOIN partner_cuenta pc ON pc.partner_id = p.odoo_id
            LEFT JOIN cuenta_size  cs   ON cs.cuenta_id = pc.cuenta_id
            LEFT JOIN odoo.res_partner rp_principal
                ON rp_principal.odoo_id = pc.cuenta_principal_odoo_id
               AND rp_principal.company_key = 'GLOBAL'
        """

        # Aplicar filtros sobre estado_vinculo y exclude_cuenta_id
        outer_where = []
        outer_params = list(params)

        if not include_linked:
            outer_where.append("estado_vinculo IN ('solo', 'orphan')")

        if exclude_cuenta_id is not None:
            outer_params.append(exclude_cuenta_id)
            idx = len(outer_params)
            outer_where.append(f"(cuenta_principal_odoo_id IS NULL OR cuenta_principal_odoo_id <> ${idx})")

        full_sql = f"SELECT * FROM ({base_sql}) t"
        if outer_where:
            full_sql += " WHERE " + " AND ".join(outer_where)

        # Count
        count = await conn.fetchval(
            f"SELECT COUNT(*) FROM ({full_sql}) c",
            *outer_params,
        )

        # Data
        data_params = outer_params + [limit, offset]
        rows = await conn.fetch(
            f"{full_sql} ORDER BY "
            "  CASE estado_vinculo "
            "    WHEN 'solo' THEN 1 WHEN 'orphan' THEN 2 "
            "    WHEN 'principal' THEN 3 ELSE 4 END, "
            f"name LIMIT ${len(data_params)-1} OFFSET ${len(data_params)}",
            *data_params,
        )

        items = []
        for r in rows:
            d = row_to_dict(r)
            d["sales_count"] = int(d.get("sales_count") or 0)
            d["n_partners_en_cuenta"] = int(d.get("n_partners_en_cuenta") or 0)
            # Compat con UI vieja
            d["is_linked"] = d.get("estado_vinculo") not in ("solo", "orphan")
            d["linked_cuenta_id"] = d.get("cuenta_principal_odoo_id")
            d["linked_cuenta_name"] = d.get("cuenta_principal_name")
            items.append(d)

        return {
            "items":  items,
            "total":  count,
            "limit":  limit,
            "offset": offset,
        }
