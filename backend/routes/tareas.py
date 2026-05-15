"""Endpoints globales de tareas.

Los endpoints scoped por cuenta (GET/POST /cuentas/{id}/tareas) viven en cuentas.py.

Status válidos: PENDIENTE / HECHO / CANCELADO.
Autorización:
  • PATCH y /completar: created_by OR asignado_a OR admin
  • DELETE: created_by OR admin (asignado_a NO puede borrar)
"""
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from auth_utils import get_current_user
from db import safe_acquire
from helpers import row_to_dict


router = APIRouter(prefix="/api/tareas", tags=["crm-tareas"])


# CRM-D9: motivos canónicos. Mantener sincronizado con cuentas.MOTIVOS_VALIDOS
# y con el CHECK constraint en crm.tarea. Se duplica acá para evitar import
# cruzado entre routers (cuentas ⇄ tareas).
MOTIVOS_VALIDOS = frozenset({
    "COBRAR", "POST_VENTA", "SEGUIMIENTO",
    "VENDER", "RECUPERAR", "DEVOLVER_LLAMADA",
})


def _validate_motivo(motivo):
    """None ↑ str→upper. Lanza 400 si no está en MOTIVOS_VALIDOS."""
    if motivo is None:
        return None
    m = str(motivo).strip().upper()
    if not m:
        return None
    if m not in MOTIVOS_VALIDOS:
        raise HTTPException(400, f"motivo inválido: '{m}'. Permitidos: {sorted(MOTIVOS_VALIDOS)}")
    return m


class TareaCreate(BaseModel):
    cuenta_id: str  # UUID de crm.cuenta
    contacto_id: Optional[str] = None
    tipo: str
    descripcion: str
    due_at: str  # ISO8601
    prioridad: Optional[int] = 3
    asignado_a: Optional[str] = None  # username; default a created_by
    motivo: Optional[str] = None      # CRM-D9: COBRAR/POST_VENTA/.../None


class TareaUpdate(BaseModel):
    tipo: Optional[str] = None
    descripcion: Optional[str] = None
    due_at: Optional[str] = None
    prioridad: Optional[int] = None
    status: Optional[str] = None
    asignado_a: Optional[str] = None
    motivo: Optional[str] = None      # CRM-D9: opcional en edit, mantiene compat


def _username(user: dict) -> str:
    return user.get("username", "unknown") if isinstance(user, dict) else "unknown"


def _is_admin(user: dict) -> bool:
    return isinstance(user, dict) and user.get("rol") == "admin"


def _parse_dt(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


async def _validate_username(conn, username: Optional[str]):
    """Valida que `username` exista y esté activo en produccion.prod_usuarios."""
    if not username:
        return
    exists = await conn.fetchval(
        "SELECT EXISTS(SELECT 1 FROM produccion.prod_usuarios "
        "WHERE username = $1 AND activo = true)",
        username,
    )
    if not exists:
        raise HTTPException(400, f"Usuario '{username}' no encontrado")


def _can_edit(existing: dict, user: dict) -> bool:
    """PATCH y /completar: created_by OR asignado_a OR admin."""
    username = _username(user)
    return (
        existing["created_by"] == username
        or existing["asignado_a"] == username
        or _is_admin(user)
    )


def _can_delete(existing: dict, user: dict) -> bool:
    """DELETE: solo created_by OR admin (asignado NO puede borrar)."""
    username = _username(user)
    return existing["created_by"] == username or _is_admin(user)


# ═══════════════════════════════════════════════════════════════════════════


@router.get("")
async def list_tareas(
    cuenta_id: Optional[str] = None,
    contacto_id: Optional[str] = None,
    status: Optional[str] = None,
    prioridad: Optional[int] = None,
    asignado_a: Optional[str] = None,
    created_by: Optional[str] = None,
    due_before: Optional[str] = None,
    due_after: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    _user: dict = Depends(get_current_user),
):
    """Listado global de tareas con filtros."""
    async with safe_acquire() as conn:
        offset = (page - 1) * limit
        where = "WHERE 1=1"
        params: list = []

        if cuenta_id:
            params.append(cuenta_id)
            where += f" AND t.cuenta_id = ${len(params)}::uuid"
        if contacto_id:
            params.append(contacto_id)
            where += f" AND t.contacto_id = ${len(params)}::uuid"
        if status:
            params.append(status)
            where += f" AND t.status = ${len(params)}"
        if prioridad is not None:
            params.append(prioridad)
            where += f" AND t.prioridad = ${len(params)}"
        if asignado_a:
            params.append(asignado_a)
            where += f" AND t.asignado_a = ${len(params)}"
        if created_by:
            params.append(created_by)
            where += f" AND t.created_by = ${len(params)}"
        if due_after:
            params.append(_parse_dt(due_after))
            where += f" AND t.due_at >= ${len(params)}"
        if due_before:
            params.append(_parse_dt(due_before))
            where += f" AND t.due_at <= ${len(params)}"
        if search:
            params.append(f"%{search}%")
            where += f" AND t.descripcion ILIKE ${len(params)}"

        base_from = """
            FROM crm.tarea t
            LEFT JOIN crm.cuenta cu       ON cu.id = t.cuenta_id
            LEFT JOIN odoo.res_partner rp
                ON rp.odoo_id = cu.cuenta_partner_odoo_id
                AND rp.company_key = 'GLOBAL'
        """

        count = await conn.fetchval(
            f"SELECT COUNT(*) {base_from} {where}",
            *params,
        )

        data_params = params + [limit, offset]
        rows = await conn.fetch(
            f"""SELECT
                t.id, t.cuenta_id, t.contacto_id,
                t.tipo, t.descripcion,
                t.due_at, t.status, t.prioridad,
                t.created_at, t.done_at,
                t.created_by, t.updated_by, t.updated_at,
                t.asignado_a,
                COALESCE(rp.name, 'Sin nombre') AS cuenta_nombre
            {base_from}
            {where}
            ORDER BY t.due_at ASC
            LIMIT ${len(data_params) - 1} OFFSET ${len(data_params)}""",
            *data_params,
        )
        return {
            "items": [row_to_dict(r) for r in rows],
            "total": count,
            "page": page,
        }


@router.post("")
async def create_tarea(
    data: TareaCreate,
    user: dict = Depends(get_current_user),
):
    """Crear una tarea. asignado_a default a created_by si no se especifica."""
    username = _username(user)
    due_at = _parse_dt(data.due_at)
    if not due_at:
        raise HTTPException(400, "due_at requerido")
    asignado = data.asignado_a or username

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

        await _validate_username(conn, asignado)

        motivo = _validate_motivo(data.motivo)  # CRM-D9

        row = await conn.fetchrow(
            """
            INSERT INTO crm.tarea (
                cuenta_id, contacto_id, tipo, descripcion,
                due_at, prioridad, status, motivo,
                created_by, updated_by, updated_at, asignado_a
            ) VALUES (
                $1::uuid, $2::uuid, $3, $4,
                $5, $6, 'PENDIENTE', $9,
                $7, $7, now(), $8
            )
            RETURNING *
            """,
            data.cuenta_id, data.contacto_id, data.tipo, data.descripcion,
            due_at, data.prioridad if data.prioridad is not None else 3,
            username, asignado, motivo,
        )
        return row_to_dict(row)


@router.patch("/{tarea_id}")
async def update_tarea(
    tarea_id: str,
    data: TareaUpdate,
    user: dict = Depends(get_current_user),
):
    """Editar una tarea. Auth: created_by OR asignado_a OR admin."""
    username = _username(user)
    async with safe_acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT created_by, asignado_a FROM crm.tarea WHERE id = $1::uuid",
            tarea_id,
        )
        if not existing:
            raise HTTPException(404, "Tarea no encontrada")
        if not _can_edit(existing, user):
            raise HTTPException(403, "Solo creador, asignado o admin pueden editar")

        if data.asignado_a is not None and data.asignado_a != "":
            await _validate_username(conn, data.asignado_a)

        sets: list = []
        params: list = []
        for field in ("tipo", "descripcion", "status", "asignado_a"):
            v = getattr(data, field)
            if v is not None:
                params.append(v)
                sets.append(f"{field} = ${len(params)}")
        if data.prioridad is not None:
            params.append(data.prioridad)
            sets.append(f"prioridad = ${len(params)}")
        if data.due_at is not None:
            params.append(_parse_dt(data.due_at))
            sets.append(f"due_at = ${len(params)}")
        # CRM-D9: motivo es opcional en edit. "" → set NULL (limpia el motivo).
        # Un valor válido se normaliza y actualiza; un valor inválido lanza 400.
        if data.motivo is not None:
            params.append(_validate_motivo(data.motivo))
            sets.append(f"motivo = ${len(params)}")
        if not sets:
            raise HTTPException(400, "No hay campos para actualizar")

        params.append(username)
        sets.append(f"updated_by = ${len(params)}")
        sets.append("updated_at = now()")
        params.append(tarea_id)

        row = await conn.fetchrow(
            f"UPDATE crm.tarea SET {', '.join(sets)} "
            f"WHERE id = ${len(params)}::uuid RETURNING *",
            *params,
        )
        return row_to_dict(row)


@router.patch("/{tarea_id}/completar")
async def completar_tarea(
    tarea_id: str,
    user: dict = Depends(get_current_user),
):
    """Atajo para marcar HECHO. Auth: created_by OR asignado_a OR admin."""
    username = _username(user)
    async with safe_acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT created_by, asignado_a FROM crm.tarea WHERE id = $1::uuid",
            tarea_id,
        )
        if not existing:
            raise HTTPException(404, "Tarea no encontrada")
        if not _can_edit(existing, user):
            raise HTTPException(403, "Solo creador, asignado o admin pueden completar")

        row = await conn.fetchrow(
            """
            UPDATE crm.tarea
            SET status = 'HECHO', done_at = now(),
                updated_by = $1, updated_at = now()
            WHERE id = $2::uuid
            RETURNING *
            """,
            username, tarea_id,
        )
        return row_to_dict(row)


@router.delete("/{tarea_id}")
async def delete_tarea(
    tarea_id: str,
    user: dict = Depends(get_current_user),
):
    """Borrar una tarea. Auth: created_by OR admin (asignado NO puede borrar)."""
    async with safe_acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT created_by, asignado_a FROM crm.tarea WHERE id = $1::uuid",
            tarea_id,
        )
        if not existing:
            raise HTTPException(404, "Tarea no encontrada")
        if not _can_delete(existing, user):
            raise HTTPException(403, "Solo el creador o admin pueden borrar")

        await conn.execute(
            "DELETE FROM crm.tarea WHERE id = $1::uuid",
            tarea_id,
        )
        return {"ok": True, "id": tarea_id}
