"""Grupos comerciales — vinculación de varias cuentas con un cliente principal.

Sprint CRM-D4. Distinto de crm.cuenta_vinculo (que une múltiples odoo_partner_id
a UNA cuenta CRM por dedupe). Acá vinculamos cuentas DISTINTAS bajo un grupo.

Endpoints:
- GET /api/cuentas/{partner_odoo_id}/vinculados
    → datos del grupo + miembros con LTV/mes/tier por cuenta
- POST /api/cuentas/{partner_odoo_id}/vinculados/link
    → vincular otra cuenta (busca por nombre o RUC)
- POST /api/cuentas/{partner_odoo_id}/vinculados/principal/{otro_partner_id}
    → cambiar el principal del grupo
- DELETE /api/cuentas/{partner_odoo_id}/vinculados/{otro_partner_id}
    → desvincular un miembro
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth_utils import get_current_user
from db import safe_acquire
from helpers import row_to_dict


router = APIRouter(prefix="/api/cuentas")


# ───── helpers ─────
async def _ensure_cuenta(conn, partner_odoo_id: int) -> str:
    """Asegura que crm.cuenta exista para el partner. Retorna cuenta_id (UUID)."""
    cu = await conn.fetchrow(
        "SELECT id FROM crm.cuenta WHERE cuenta_partner_odoo_id = $1",
        partner_odoo_id,
    )
    if cu:
        return str(cu["id"])
    cu = await conn.fetchrow(
        """
        INSERT INTO crm.cuenta (cuenta_partner_odoo_id, estado_comercial)
        VALUES ($1, 'ACTIVO')
        ON CONFLICT (cuenta_partner_odoo_id)
        DO UPDATE SET updated_at = now()
        RETURNING id
        """,
        partner_odoo_id,
    )
    return str(cu["id"])


async def _get_grupo_id(conn, cuenta_id: str) -> Optional[str]:
    row = await conn.fetchrow(
        "SELECT grupo_id FROM crm.grupo_miembro WHERE cuenta_id = $1",
        cuenta_id,
    )
    return str(row["grupo_id"]) if row else None


# ───── modelos ─────
class LinkBody(BaseModel):
    partner_odoo_id: int
    rol_descripcion: Optional[str] = None  # ej: "Sucursal Cusco", "Hijo del dueño"
    nombre_grupo: Optional[str] = None     # solo si crea grupo nuevo


# ───── GET vinculados ─────
@router.get("/{partner_odoo_id}/vinculados")
async def get_vinculados(
    partner_odoo_id: int,
    _user: dict = Depends(get_current_user),
):
    """Devuelve grupo + miembros con sus métricas (tier, LTV, S/mes estimado)."""
    async with safe_acquire() as conn:
        cuenta_id = await _ensure_cuenta(conn, partner_odoo_id)
        grupo_id = await _get_grupo_id(conn, cuenta_id)

        # Sin grupo: respuesta vacía + flag para crear
        if not grupo_id:
            partner = await conn.fetchrow(
                """SELECT odoo_id AS partner_odoo_id, name, vat
                   FROM odoo.res_partner
                   WHERE odoo_id = $1 AND company_key = 'GLOBAL' LIMIT 1""",
                partner_odoo_id,
            )
            return {
                "tiene_grupo": False,
                "grupo": None,
                "miembros": [],
                "es_principal": False,
                "viewing_partner_odoo_id": partner_odoo_id,
                "viewing_nombre": partner["name"] if partner else None,
                "totales": {"ltv_12m": 0, "estimado_mensual": 0, "miembros_count": 1},
            }

        # Con grupo: traer datos del grupo + todos los miembros
        grupo_row = await conn.fetchrow(
            "SELECT id, nombre, notas, created_at FROM crm.grupo_comercial WHERE id = $1",
            grupo_id,
        )

        miembros_rows = await conn.fetch(
            """
            SELECT
                gm.cuenta_id,
                gm.es_principal,
                gm.rol_descripcion,
                gm.created_at AS vinculado_at,
                cu.cuenta_partner_odoo_id AS partner_odoo_id,
                rp.name,
                rp.city,
                rp.vat,
                rp.phone,
                rp.mobile,
                mvce.tier,
                mvce.estado_auto,
                mvce.amount_12m::float AS ltv_12m,
                mvce.qty_12m,
                mvce.orders_12m,
                -- Estimado mensual = LTV 12m / 12
                (COALESCE(mvce.amount_12m, 0) / 12.0)::float AS estimado_mensual
            FROM crm.grupo_miembro gm
            JOIN crm.cuenta cu ON cu.id = gm.cuenta_id
            LEFT JOIN odoo.res_partner rp
                ON rp.odoo_id = cu.cuenta_partner_odoo_id
                AND rp.company_key = 'GLOBAL'
            LEFT JOIN crm.mv_cuenta_estado mvce
                ON mvce.cuenta_partner_odoo_id = cu.cuenta_partner_odoo_id
            WHERE gm.grupo_id = $1
            ORDER BY gm.es_principal DESC, mvce.amount_12m DESC NULLS LAST
            """,
            grupo_id,
        )

        miembros = []
        ltv_total = 0.0
        for r in miembros_rows:
            miembros.append({
                "cuenta_id": str(r["cuenta_id"]),
                "partner_odoo_id": r["partner_odoo_id"],
                "es_principal": r["es_principal"],
                "rol_descripcion": r["rol_descripcion"],
                "viewing": r["partner_odoo_id"] == partner_odoo_id,
                "nombre": r["name"],
                "vat": r["vat"],
                "city": r["city"],
                "phone": r["phone"],
                "tier": r["tier"],
                "estado_auto": r["estado_auto"],
                "ltv_12m": float(r["ltv_12m"] or 0),
                "qty_12m": int(r["qty_12m"] or 0),
                "orders_12m": int(r["orders_12m"] or 0),
                "estimado_mensual": float(r["estimado_mensual"] or 0),
            })
            ltv_total += float(r["ltv_12m"] or 0)

        es_principal_actual = any(
            m["es_principal"] and m["viewing"] for m in miembros
        )

        return {
            "tiene_grupo": True,
            "grupo": {
                "id": str(grupo_row["id"]),
                "nombre": grupo_row["nombre"],
                "notas": grupo_row["notas"],
                "created_at": grupo_row["created_at"].isoformat() if grupo_row["created_at"] else None,
            },
            "miembros": miembros,
            "es_principal": es_principal_actual,
            "viewing_partner_odoo_id": partner_odoo_id,
            "viewing_nombre": next(
                (m["nombre"] for m in miembros if m["viewing"]), None
            ),
            "totales": {
                "ltv_12m": round(ltv_total, 2),
                "estimado_mensual": round(ltv_total / 12.0, 2),
                "miembros_count": len(miembros),
            },
        }


# ───── POST vincular ─────
@router.post("/{partner_odoo_id}/vinculados/link")
async def link_cuenta(
    partner_odoo_id: int,
    body: LinkBody,
    user: dict = Depends(get_current_user),
):
    """Vincula otra cuenta a este grupo. Si la cuenta actual no tiene grupo,
    se crea uno nuevo con la cuenta actual como principal y la nueva como
    miembro adicional."""
    if body.partner_odoo_id == partner_odoo_id:
        raise HTTPException(status_code=400, detail="No podés vincular una cuenta consigo misma")

    async with safe_acquire() as conn:
        # Asegurar ambas cuentas
        cuenta_actual_id = await _ensure_cuenta(conn, partner_odoo_id)
        cuenta_nueva_id = await _ensure_cuenta(conn, body.partner_odoo_id)

        async with conn.transaction():
            grupo_id = await _get_grupo_id(conn, cuenta_actual_id)
            grupo_nueva = await _get_grupo_id(conn, cuenta_nueva_id)

            if grupo_nueva and grupo_nueva != grupo_id:
                raise HTTPException(
                    status_code=409,
                    detail="Esa cuenta ya pertenece a otro grupo. Desvinculala primero.",
                )

            # Crear grupo si no existe
            if not grupo_id:
                # Nombre por default: nombre del partner actual
                partner_actual = await conn.fetchrow(
                    "SELECT name FROM odoo.res_partner WHERE odoo_id = $1 AND company_key = 'GLOBAL'",
                    partner_odoo_id,
                )
                nombre = body.nombre_grupo or (
                    partner_actual["name"] if partner_actual else f"Grupo {partner_odoo_id}"
                )
                grupo_id = await conn.fetchval(
                    """
                    INSERT INTO crm.grupo_comercial (nombre, created_by)
                    VALUES ($1, $2) RETURNING id
                    """,
                    nombre, user.get("username"),
                )
                # Cuenta actual se convierte en principal
                await conn.execute(
                    """
                    INSERT INTO crm.grupo_miembro (grupo_id, cuenta_id, es_principal, created_by)
                    VALUES ($1, $2, true, $3)
                    """,
                    grupo_id, cuenta_actual_id, user.get("username"),
                )

            # Insertar la nueva cuenta como miembro (no principal)
            if grupo_nueva == grupo_id:
                # Ya estaba — actualizar rol si cambió
                if body.rol_descripcion is not None:
                    await conn.execute(
                        "UPDATE crm.grupo_miembro SET rol_descripcion = $1 WHERE cuenta_id = $2",
                        body.rol_descripcion, cuenta_nueva_id,
                    )
            else:
                await conn.execute(
                    """
                    INSERT INTO crm.grupo_miembro (grupo_id, cuenta_id, es_principal, rol_descripcion, created_by)
                    VALUES ($1, $2, false, $3, $4)
                    ON CONFLICT (cuenta_id) DO NOTHING
                    """,
                    grupo_id, cuenta_nueva_id, body.rol_descripcion, user.get("username"),
                )

    return {"ok": True, "grupo_id": grupo_id}


# ───── PATCH cambiar principal ─────
@router.post("/{partner_odoo_id}/vinculados/principal/{nuevo_principal_partner_id}")
async def set_principal(
    partner_odoo_id: int,
    nuevo_principal_partner_id: int,
    user: dict = Depends(get_current_user),
):
    """Marca a otra cuenta del mismo grupo como principal."""
    async with safe_acquire() as conn:
        cuenta_actual_id = await _ensure_cuenta(conn, partner_odoo_id)
        nuevo_id = await _ensure_cuenta(conn, nuevo_principal_partner_id)

        grupo_actual = await _get_grupo_id(conn, cuenta_actual_id)
        grupo_nuevo = await _get_grupo_id(conn, nuevo_id)
        if not grupo_actual or grupo_actual != grupo_nuevo:
            raise HTTPException(status_code=400, detail="Las cuentas no están en el mismo grupo")

        async with conn.transaction():
            await conn.execute(
                "UPDATE crm.grupo_miembro SET es_principal = false WHERE grupo_id = $1",
                grupo_actual,
            )
            await conn.execute(
                "UPDATE crm.grupo_miembro SET es_principal = true WHERE cuenta_id = $1",
                nuevo_id,
            )
    return {"ok": True}


# ───── DELETE desvincular miembro ─────
@router.delete("/{partner_odoo_id}/vinculados/{otro_partner_id}")
async def unlink_miembro(
    partner_odoo_id: int,
    otro_partner_id: int,
    user: dict = Depends(get_current_user),
):
    """Saca a un miembro del grupo. Si queda solo el principal, elimina el grupo."""
    async with safe_acquire() as conn:
        cuenta_actual_id = await _ensure_cuenta(conn, partner_odoo_id)
        otro_id = await _ensure_cuenta(conn, otro_partner_id)
        grupo_id = await _get_grupo_id(conn, cuenta_actual_id)
        if not grupo_id:
            raise HTTPException(status_code=404, detail="Esta cuenta no tiene grupo")

        # Verificar que el otro está en el mismo grupo
        otro_grupo = await _get_grupo_id(conn, otro_id)
        if otro_grupo != grupo_id:
            raise HTTPException(status_code=400, detail="No están en el mismo grupo")

        async with conn.transaction():
            # No permitir borrar el principal si hay otros miembros
            principal_partner_id = await conn.fetchval(
                """
                SELECT cu.cuenta_partner_odoo_id
                FROM crm.grupo_miembro gm
                JOIN crm.cuenta cu ON cu.id = gm.cuenta_id
                WHERE gm.grupo_id = $1 AND gm.es_principal = true
                """,
                grupo_id,
            )
            if otro_partner_id == principal_partner_id:
                count = await conn.fetchval(
                    "SELECT COUNT(*) FROM crm.grupo_miembro WHERE grupo_id = $1",
                    grupo_id,
                )
                if count > 1:
                    raise HTTPException(
                        status_code=400,
                        detail="No podés desvincular al principal si hay otros miembros. Cambiá el principal primero.",
                    )

            await conn.execute(
                "DELETE FROM crm.grupo_miembro WHERE cuenta_id = $1",
                otro_id,
            )

            # Si el grupo queda vacío o con un solo miembro, eliminar el grupo
            count_after = await conn.fetchval(
                "SELECT COUNT(*) FROM crm.grupo_miembro WHERE grupo_id = $1",
                grupo_id,
            )
            if count_after <= 1:
                await conn.execute(
                    "DELETE FROM crm.grupo_comercial WHERE id = $1",
                    grupo_id,
                )

    return {"ok": True}


# ───── Búsqueda para autocomplete del modal ─────
@router.get("/{partner_odoo_id}/vinculados/buscar")
async def buscar_para_vincular(
    partner_odoo_id: int,
    q: str = "",
    limit: int = 10,
    _user: dict = Depends(get_current_user),
):
    """Busca cuentas para vincular. Excluye:
    - La cuenta actual
    - Cuentas inactivas
    - Cuentas que ya están en CUALQUIER grupo (principal o miembro)

    Misma filosofía que /api/partners/unlinked: solo cuentas "libres" para
    sumar al grupo. Si una cuenta ya está en otro grupo, hay que desvincularla
    primero desde la ficha de ese grupo.
    """
    if not q or len(q.strip()) < 2:
        return {"items": []}
    async with safe_acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                rp.odoo_id AS partner_odoo_id,
                rp.name,
                rp.vat,
                rp.city,
                mvce.tier,
                mvce.estado_auto,
                mvce.amount_12m::float AS ltv_12m
            FROM odoo.res_partner rp
            LEFT JOIN crm.mv_cuenta_estado mvce ON mvce.cuenta_partner_odoo_id = rp.odoo_id
            LEFT JOIN crm.cuenta cu ON cu.cuenta_partner_odoo_id = rp.odoo_id
            WHERE rp.company_key = 'GLOBAL'
              AND COALESCE(rp.active, true) = true
              AND rp.odoo_id != $1
              AND COALESCE(cu.is_active, true) = true
              AND NOT EXISTS (
                  -- Excluye cuentas ya vinculadas a CUALQUIER grupo
                  SELECT 1 FROM crm.grupo_miembro gm
                  JOIN crm.cuenta cu2 ON cu2.id = gm.cuenta_id
                  WHERE cu2.cuenta_partner_odoo_id = rp.odoo_id
              )
              AND (
                rp.name ILIKE $2
                OR COALESCE(rp.vat, '') ILIKE $2
              )
            ORDER BY mvce.amount_12m DESC NULLS LAST, rp.name
            LIMIT $3
            """,
            partner_odoo_id, f"%{q.strip()}%", limit,
        )

        return {"items": [row_to_dict(r) for r in rows]}
