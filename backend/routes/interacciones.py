"""Endpoints globales de interacciones + plantillas.

Los endpoints scoped por cuenta (GET/POST /cuentas/{id}/interacciones) viven en cuentas.py.
"""
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from auth_utils import get_current_user
from db import safe_acquire
from helpers import row_to_dict


router = APIRouter(prefix="/api", tags=["crm-interacciones"])


class InteraccionCreate(BaseModel):
    cuenta_id: str  # UUID de crm.cuenta
    contacto_id: Optional[str] = None  # UUID de crm.contacto
    tipo: str
    resumen: str
    resultado: Optional[str] = None
    channel: Optional[str] = None
    outcome: Optional[str] = None
    happened_at: Optional[str] = None  # ISO8601


class InteraccionUpdate(BaseModel):
    tipo: Optional[str] = None
    resumen: Optional[str] = None
    resultado: Optional[str] = None
    channel: Optional[str] = None
    outcome: Optional[str] = None
    happened_at: Optional[str] = None


def _username(user: dict) -> str:
    return user.get("username", "unknown") if isinstance(user, dict) else "unknown"


def _is_admin(user: dict) -> bool:
    return isinstance(user, dict) and user.get("rol") == "admin"


def _parse_dt(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


# ═══════════════════════════════════════════════════════════════════════════
#  Interacciones — listado / creación / edición / borrado
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/interacciones")
async def list_interacciones(
    cuenta_id: Optional[str] = None,
    contacto_id: Optional[str] = None,
    channel: Optional[str] = None,
    tipo: Optional[str] = None,
    outcome: Optional[str] = None,
    created_by: Optional[str] = None,
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    _user: dict = Depends(get_current_user),
):
    """Listado global de interacciones con filtros."""
    async with safe_acquire() as conn:
        offset = (page - 1) * limit
        where = "WHERE 1=1"
        params: list = []

        if cuenta_id:
            params.append(cuenta_id)
            where += f" AND i.cuenta_id = ${len(params)}::uuid"
        if contacto_id:
            params.append(contacto_id)
            where += f" AND i.contacto_id = ${len(params)}::uuid"
        if channel:
            params.append(channel)
            where += f" AND i.channel = ${len(params)}"
        if tipo:
            params.append(tipo)
            where += f" AND i.tipo = ${len(params)}"
        if outcome:
            params.append(outcome)
            where += f" AND i.outcome = ${len(params)}"
        if created_by:
            params.append(created_by)
            where += f" AND i.created_by = ${len(params)}"
        if desde:
            params.append(_parse_dt(desde))
            where += f" AND i.happened_at >= ${len(params)}"
        if hasta:
            params.append(_parse_dt(hasta))
            where += f" AND i.happened_at <= ${len(params)}"

        count = await conn.fetchval(
            f"SELECT COUNT(*) FROM crm.interaccion i {where}",
            *params,
        )

        data_params = params + [limit, offset]
        rows = await conn.fetch(
            f"""SELECT
                i.id, i.cuenta_id, i.contacto_id,
                i.tipo, i.channel, i.outcome,
                i.resumen, i.resultado,
                i.happened_at, i.fecha, i.created_at, i.updated_at,
                i.created_by, i.updated_by,
                rp.name AS cuenta_nombre
            FROM crm.interaccion i
            LEFT JOIN crm.cuenta cu       ON cu.id = i.cuenta_id
            LEFT JOIN odoo.res_partner rp
                ON rp.odoo_id = cu.cuenta_partner_odoo_id
                AND rp.company_key = 'GLOBAL'
            {where}
            ORDER BY i.happened_at DESC
            LIMIT ${len(data_params) - 1} OFFSET ${len(data_params)}""",
            *data_params,
        )
        return {
            "items": [row_to_dict(r) for r in rows],
            "total": count,
            "page": page,
        }


@router.post("/interacciones")
async def create_interaccion(
    data: InteraccionCreate,
    user: dict = Depends(get_current_user),
):
    """Crear una interacción global. cuenta_id es el UUID de crm.cuenta (no el odoo_id)."""
    username = _username(user)
    happened = _parse_dt(data.happened_at) or datetime.utcnow()

    async with safe_acquire() as conn:
        cuenta = await conn.fetchrow(
            "SELECT id FROM crm.cuenta WHERE id = $1::uuid",
            data.cuenta_id,
        )
        if not cuenta:
            raise HTTPException(404, "Cuenta no encontrada")

        if data.contacto_id:
            contacto = await conn.fetchrow(
                "SELECT id FROM crm.contacto WHERE id = $1::uuid",
                data.contacto_id,
            )
            if not contacto:
                raise HTTPException(404, "Contacto no encontrado")

        row = await conn.fetchrow(
            """
            INSERT INTO crm.interaccion (
                cuenta_id, contacto_id, tipo, channel, outcome,
                resumen, resultado, happened_at, fecha,
                created_by, updated_by, updated_at
            ) VALUES (
                $1::uuid, $2::uuid, $3, $4, $5,
                $6, $7, $8, $8,
                $9, $9, now()
            )
            RETURNING *
            """,
            data.cuenta_id, data.contacto_id, data.tipo, data.channel, data.outcome,
            data.resumen, data.resultado, happened,
            username,
        )
        return row_to_dict(row)


@router.patch("/interacciones/{interaccion_id}")
async def update_interaccion(
    interaccion_id: str,
    data: InteraccionUpdate,
    user: dict = Depends(get_current_user),
):
    """Editar una interacción. Solo el creador o un admin pueden modificarla."""
    username = _username(user)
    async with safe_acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT created_by FROM crm.interaccion WHERE id = $1::uuid",
            interaccion_id,
        )
        if not existing:
            raise HTTPException(404, "Interacción no encontrada")
        if existing["created_by"] != username and not _is_admin(user):
            raise HTTPException(403, "Solo el creador o admin pueden editar")

        sets: list = []
        params: list = []
        for field in ("tipo", "resumen", "resultado", "channel", "outcome"):
            v = getattr(data, field)
            if v is not None:
                params.append(v)
                sets.append(f"{field} = ${len(params)}")
        if data.happened_at is not None:
            params.append(_parse_dt(data.happened_at))
            sets.append(f"happened_at = ${len(params)}")
            sets.append(f"fecha = ${len(params)}")
        if not sets:
            raise HTTPException(400, "No hay campos para actualizar")

        params.append(username)
        sets.append(f"updated_by = ${len(params)}")
        sets.append("updated_at = now()")
        params.append(interaccion_id)

        row = await conn.fetchrow(
            f"UPDATE crm.interaccion SET {', '.join(sets)} "
            f"WHERE id = ${len(params)}::uuid RETURNING *",
            *params,
        )
        return row_to_dict(row)


@router.delete("/interacciones/{interaccion_id}")
async def delete_interaccion(
    interaccion_id: str,
    user: dict = Depends(get_current_user),
):
    """Borrar una interacción. Solo el creador o un admin pueden borrarla."""
    username = _username(user)
    async with safe_acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT created_by FROM crm.interaccion WHERE id = $1::uuid",
            interaccion_id,
        )
        if not existing:
            raise HTTPException(404, "Interacción no encontrada")
        if existing["created_by"] != username and not _is_admin(user):
            raise HTTPException(403, "Solo el creador o admin pueden borrar")

        await conn.execute(
            "DELETE FROM crm.interaccion WHERE id = $1::uuid",
            interaccion_id,
        )
        return {"ok": True, "id": interaccion_id}


# ═══════════════════════════════════════════════════════════════════════════
#  Plantillas de interacción
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/interaction-templates")
async def list_interaction_templates(_user: dict = Depends(get_current_user)):
    """Lista plantillas activas (channel, outcome, default_note)."""
    async with safe_acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, name, channel, outcome, default_note "
            "FROM crm.interaction_template "
            "WHERE is_active = true ORDER BY name"
        )
        return [row_to_dict(r) for r in rows]
