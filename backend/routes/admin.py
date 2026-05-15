"""Admin endpoints — gestión de usuarios, roles y carteras.

Todos los endpoints requieren rol admin o supervisor (excepto los puramente
informativos como /admin/me que ya están en /auth/me).
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth_utils import get_current_user, require_role
from db import safe_acquire
from helpers import row_to_dict


router = APIRouter(prefix="/api/admin")


# ───────── Modelos ─────────
class CarteraAssign(BaseModel):
    username: str
    cuenta_ids: List[str]  # UUIDs


class CarteraRemove(BaseModel):
    username: str
    cuenta_ids: List[str]


class UsuarioUpdate(BaseModel):
    rol: Optional[str] = None
    nombre_completo: Optional[str] = None
    iniciales: Optional[str] = None
    whatsapp: Optional[str] = None
    email: Optional[str] = None
    activo: Optional[bool] = None


# ───────── Listado de usuarios ─────────
@router.get("/usuarios", dependencies=[Depends(require_role(["admin", "supervisor"]))])
async def list_usuarios():
    async with safe_acquire() as conn:
        rows = await conn.fetch("""
            SELECT u.username, u.nombre_completo, u.rol, u.iniciales,
                   u.email, u.whatsapp, u.activo, u.ultimo_login,
                   COALESCE(c.cuentas_asignadas, 0) AS cuentas_asignadas
            FROM crm.usuario u
            LEFT JOIN (
                SELECT username, COUNT(*) AS cuentas_asignadas
                FROM crm.usuario_cartera
                WHERE activo = true
                GROUP BY username
            ) c ON c.username = u.username
            ORDER BY
                CASE u.rol WHEN 'admin' THEN 1 WHEN 'supervisor' THEN 2 ELSE 3 END,
                u.username
        """)
        return {"items": [row_to_dict(r) for r in rows]}


@router.patch("/usuarios/{username}", dependencies=[Depends(require_role(["admin"]))])
async def update_usuario(username: str, data: UsuarioUpdate):
    sets, params = [], []
    for field in ["rol", "nombre_completo", "iniciales", "whatsapp", "email", "activo"]:
        val = getattr(data, field)
        if val is not None:
            params.append(val)
            sets.append(f"{field} = ${len(params)}")
    if not sets:
        raise HTTPException(status_code=400, detail="Sin campos a actualizar")
    if data.rol and data.rol not in ("admin", "supervisor", "vendedora"):
        raise HTTPException(status_code=400, detail="Rol inválido")
    params.append(username)
    async with safe_acquire() as conn:
        result = await conn.execute(
            f"UPDATE crm.usuario SET {', '.join(sets)} WHERE username = ${len(params)}",
            *params,
        )
        if result.endswith(" 0"):
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return {"ok": True}


# ───────── Carteras ─────────
@router.get("/carteras/{username}", dependencies=[Depends(require_role(["admin", "supervisor"]))])
async def get_cartera(username: str):
    async with safe_acquire() as conn:
        rows = await conn.fetch("""
            SELECT c.id, c.cuenta_partner_odoo_id, c.estado_comercial,
                   c.clasificacion, uc.asignado_at, uc.asignado_por
            FROM crm.usuario_cartera uc
            JOIN crm.cuenta c ON c.id = uc.cuenta_id
            WHERE uc.username = $1 AND uc.activo = true
            ORDER BY uc.asignado_at DESC
        """, username)
        return {"username": username, "items": [row_to_dict(r) for r in rows]}


@router.post("/carteras/asignar")
async def asignar_cartera(
    data: CarteraAssign,
    user: dict = Depends(require_role(["admin", "supervisor"])),
):
    if not data.cuenta_ids:
        raise HTTPException(status_code=400, detail="cuenta_ids vacío")
    async with safe_acquire() as conn:
        # Valida que el usuario destino exista
        target = await conn.fetchval(
            "SELECT 1 FROM crm.usuario WHERE username = $1 AND activo = true",
            data.username,
        )
        if not target:
            raise HTTPException(status_code=404, detail="Usuario destino no existe o inactivo")
        # Inserta o reactiva (upsert)
        async with conn.transaction():
            for cuenta_id in data.cuenta_ids:
                await conn.execute("""
                    INSERT INTO crm.usuario_cartera (username, cuenta_id, asignado_por, activo)
                    VALUES ($1, $2, $3, true)
                    ON CONFLICT (username, cuenta_id)
                    DO UPDATE SET activo = true, asignado_at = now(), asignado_por = $3
                """, data.username, cuenta_id, user["username"])
                # Mantiene crm.cuenta.asignado_a sincronizado para cadencia legacy
                await conn.execute(
                    "UPDATE crm.cuenta SET asignado_a = $1 WHERE id = $2",
                    data.username, cuenta_id,
                )
    return {"ok": True, "asignadas": len(data.cuenta_ids)}


@router.post("/carteras/remover")
async def remover_cartera(
    data: CarteraRemove,
    user: dict = Depends(require_role(["admin", "supervisor"])),
):
    if not data.cuenta_ids:
        raise HTTPException(status_code=400, detail="cuenta_ids vacío")
    async with safe_acquire() as conn:
        async with conn.transaction():
            for cuenta_id in data.cuenta_ids:
                await conn.execute("""
                    UPDATE crm.usuario_cartera SET activo = false
                    WHERE username = $1 AND cuenta_id = $2
                """, data.username, cuenta_id)
                # Limpia legacy si coincide
                await conn.execute("""
                    UPDATE crm.cuenta SET asignado_a = NULL
                    WHERE id = $1 AND asignado_a = $2
                """, cuenta_id, data.username)
    return {"ok": True, "removidas": len(data.cuenta_ids)}
