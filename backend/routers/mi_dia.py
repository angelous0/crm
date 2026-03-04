"""Mi Día + Tareas + Interacciones + Next Action router."""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, Literal
from datetime import date, datetime, timezone
import logging

from db import get_pool, records_to_list, record_to_dict

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["mi-dia"])


def _get_auth():
    from server import get_current_user
    return get_current_user


def _user_id(user: dict) -> str:
    return user.get("sub", "")


# ─── Pydantic Models ───

class TareaCreate(BaseModel):
    cuenta_id: str
    title: str
    due_at: str
    priority: int = 2
    note: Optional[str] = None
    assigned_user_id: Optional[str] = None

class TareaUpdate(BaseModel):
    title: Optional[str] = None
    due_at: Optional[str] = None
    priority: Optional[int] = None
    note: Optional[str] = None
    status: Optional[str] = None
    assigned_user_id: Optional[str] = None

class InteraccionCreate(BaseModel):
    cuenta_id: str
    contacto_id: Optional[str] = None
    channel: str  # WHATSAPP | LLAMADA | VISITA | OTRO
    outcome: Optional[str] = None
    note: Optional[str] = None
    happened_at: Optional[str] = None

class NextActionUpdate(BaseModel):
    next_action_type: Optional[str] = None
    next_action_at: Optional[str] = None
    next_action_note: Optional[str] = None
    create_task: bool = False


# ─── Phone helper ───
def _apply_phone(row: dict) -> dict:
    """Add phone_display and phone_whatsapp from partner data."""
    phone = row.get("phone") or ""
    mobile = row.get("mobile") or ""
    raw = mobile or phone
    digits = "".join(c for c in str(raw) if c.isdigit())
    if digits:
        row["phone_display"] = raw.strip()
        row["phone_whatsapp"] = f"51{digits}" if len(digits) == 9 else digits
    else:
        row["phone_display"] = ""
        row["phone_whatsapp"] = ""
    return row


# ═══════════════════════════════════
# C1) Mi Día
# ═══════════════════════════════════

@router.get("/my-day")
async def my_day(
    target_date: Optional[str] = None,
    user=Depends(_get_auth()),
):
    pool = await get_pool()
    uid = _user_id(user)
    d = date.fromisoformat(target_date) if target_date else date.today()

    async with pool.acquire() as conn:
        # Tasks overdue
        tasks_overdue = records_to_list(await conn.fetch("""
            SELECT t.id, t.title, t.due_at, t.priority, t.note, t.status,
                   t.cuenta_id, rp.name AS cuenta_nombre
            FROM crm.tarea t
            JOIN crm.cuenta cu ON cu.id = t.cuenta_id
            JOIN odoo.res_partner rp ON rp.odoo_id = cu.cuenta_partner_odoo_id AND rp.company_key='GLOBAL'
            WHERE t.assigned_user_id = $1::uuid AND t.status = 'OPEN'
              AND t.due_at::date < $2::date
            ORDER BY t.due_at ASC LIMIT 30
        """, uid, d))

        # Tasks today
        tasks_today = records_to_list(await conn.fetch("""
            SELECT t.id, t.title, t.due_at, t.priority, t.note, t.status,
                   t.cuenta_id, rp.name AS cuenta_nombre
            FROM crm.tarea t
            JOIN crm.cuenta cu ON cu.id = t.cuenta_id
            JOIN odoo.res_partner rp ON rp.odoo_id = cu.cuenta_partner_odoo_id AND rp.company_key='GLOBAL'
            WHERE t.assigned_user_id = $1::uuid AND t.status = 'OPEN'
              AND t.due_at::date = $2::date
            ORDER BY t.priority ASC, t.due_at ASC LIMIT 30
        """, uid, d))

        # Next actions today
        next_actions = records_to_list(await conn.fetch("""
            SELECT cu.id AS cuenta_id, cu.cuenta_partner_odoo_id,
                   rp.name AS cuenta_nombre, rp.phone, rp.mobile,
                   cu.next_action_type, cu.next_action_at, cu.next_action_note
            FROM crm.cuenta cu
            JOIN odoo.res_partner rp ON rp.odoo_id = cu.cuenta_partner_odoo_id AND rp.company_key='GLOBAL'
            WHERE cu.assigned_user_id = $1::uuid
              AND cu.next_action_at::date <= $2::date
              AND cu.is_active = true
            ORDER BY cu.next_action_at ASC LIMIT 30
        """, uid, d))
        for r in next_actions:
            _apply_phone(r)

        # Risk accounts (days since last purchase > 45)
        risk_accounts = records_to_list(await conn.fetch("""
            SELECT cu.id AS cuenta_id, cu.cuenta_partner_odoo_id,
                   rp.name AS cuenta_nombre, rp.phone, rp.mobile,
                   k.last_purchase_date,
                   EXTRACT(DAY FROM now() - k.last_purchase_date)::int AS days_since
            FROM crm.cuenta cu
            JOIN odoo.res_partner rp ON rp.odoo_id = cu.cuenta_partner_odoo_id AND rp.company_key='GLOBAL'
            LEFT JOIN crm.mv_cuenta_sales_kpi k ON k.cuenta_id = cu.cuenta_partner_odoo_id
            WHERE cu.assigned_user_id = $1::uuid
              AND cu.is_active = true
              AND k.last_purchase_date IS NOT NULL
              AND EXTRACT(DAY FROM now() - k.last_purchase_date) > 45
            ORDER BY days_since DESC LIMIT 30
        """, uid))
        for r in risk_accounts:
            _apply_phone(r)

        # Quick stats
        stats = record_to_dict(await conn.fetchrow("""
            SELECT
                (SELECT COUNT(*) FROM crm.tarea WHERE assigned_user_id=$1::uuid AND status='OPEN') AS tareas_abiertas,
                (SELECT COUNT(*) FROM crm.tarea WHERE assigned_user_id=$1::uuid AND status='OPEN' AND due_at::date < $2::date) AS tareas_vencidas,
                (SELECT COUNT(*) FROM crm.interaccion WHERE user_id=$1::uuid AND happened_at::date=$2::date AND channel='LLAMADA') AS llamadas_hoy,
                (SELECT COUNT(*) FROM crm.interaccion WHERE user_id=$1::uuid AND happened_at::date=$2::date AND channel='WHATSAPP') AS whatsapps_hoy
        """, uid, d))

    return {
        "date": d.isoformat(),
        "tasks_overdue": tasks_overdue,
        "tasks_today": tasks_today,
        "next_actions_today": next_actions,
        "risk_accounts": risk_accounts,
        "stats": stats,
    }


# ═══════════════════════════════════
# C2) CRUD Tareas
# ═══════════════════════════════════

@router.get("/tareas")
async def list_tareas(
    assigned_user_id: Optional[str] = None,
    cuenta_id: Optional[int] = None,
    status: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    user=Depends(_get_auth()),
):
    pool = await get_pool()
    uid = assigned_user_id or _user_id(user)
    where = "WHERE t.assigned_user_id = $1::uuid"
    params = [uid]
    idx = 2

    if status:
        where += f" AND t.status = ${idx}"
        params.append(status)
        idx += 1
    if cuenta_id:
        where += f" AND t.cuenta_id = ${idx}::uuid"
        params.append(cuenta_id)
        idx += 1

    async with pool.acquire() as conn:
        total = await conn.fetchval(f"""
            SELECT COUNT(*) FROM crm.tarea t {where}
        """, *params)

        rows = records_to_list(await conn.fetch(f"""
            SELECT t.id, t.cuenta_id, t.title, t.due_at, t.priority, t.note, t.status, t.done_at,
                   t.assigned_user_id, t.created_at,
                   rp.name AS cuenta_nombre
            FROM crm.tarea t
            JOIN crm.cuenta cu ON cu.id = t.cuenta_id
            JOIN odoo.res_partner rp ON rp.odoo_id = cu.cuenta_partner_odoo_id AND rp.company_key='GLOBAL'
            {where}
            ORDER BY CASE t.status WHEN 'OPEN' THEN 0 ELSE 1 END, t.priority ASC, t.due_at ASC
            LIMIT ${idx} OFFSET ${idx+1}
        """, *params, limit, (page - 1) * limit))

    return {"rows": rows, "total": total, "page": page}


@router.post("/tareas")
async def create_tarea(data: TareaCreate, user=Depends(_get_auth())):
    pool = await get_pool()
    uid = data.assigned_user_id or _user_id(user)
    due = datetime.fromisoformat(data.due_at)

    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            INSERT INTO crm.tarea (cuenta_id, assigned_user_id, title, due_at, priority, note, tipo, descripcion, status)
            VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, 'TAREA', COALESCE($6, $3), 'OPEN')
            RETURNING id, cuenta_id, title, due_at, priority, note, status, created_at
        """, data.cuenta_id, uid, data.title, due, data.priority, data.note)

    return record_to_dict(row)


@router.patch("/tareas/{tarea_id}")
async def update_tarea(tarea_id: str, data: TareaUpdate, user=Depends(_get_auth())):
    pool = await get_pool()
    sets, params, idx = [], [], 1

    for field, val in data.dict(exclude_unset=True).items():
        if val is not None:
            sets.append(f"{field} = ${idx}" + ("::timestamptz" if field == "due_at" else "::uuid" if field == "assigned_user_id" else ""))
            params.append(val)
            idx += 1

    if not sets:
        raise HTTPException(400, "Nada que actualizar")

    params.append(tarea_id)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(f"""
            UPDATE crm.tarea SET {', '.join(sets)}
            WHERE id = ${idx}::uuid
            RETURNING id, cuenta_id, title, due_at, priority, note, status, done_at
        """, *params)

    if not row:
        raise HTTPException(404, "Tarea no encontrada")
    return record_to_dict(row)


@router.post("/tareas/{tarea_id}/done")
async def complete_tarea(tarea_id: str, user=Depends(_get_auth())):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            UPDATE crm.tarea SET status = 'DONE', done_at = now()
            WHERE id = $1::uuid AND status = 'OPEN'
            RETURNING id, cuenta_id, title, status, done_at
        """, tarea_id)

    if not row:
        raise HTTPException(404, "Tarea no encontrada o ya completada")
    return record_to_dict(row)


# ═══════════════════════════════════
# C3) CRUD Interacciones
# ═══════════════════════════════════

@router.get("/interacciones")
async def list_interacciones(
    cuenta_id: Optional[str] = None,
    user_id: Optional[str] = None,
    channel: Optional[str] = None,
    page: int = 1,
    limit: int = 30,
    user=Depends(_get_auth()),
):
    pool = await get_pool()
    where_parts = []
    params = []
    idx = 1

    if cuenta_id:
        where_parts.append(f"i.cuenta_id = ${idx}::uuid")
        params.append(cuenta_id)
        idx += 1
    if user_id:
        where_parts.append(f"i.user_id = ${idx}::uuid")
        params.append(user_id)
        idx += 1
    if channel:
        where_parts.append(f"i.channel = ${idx}")
        params.append(channel)
        idx += 1

    where = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

    async with pool.acquire() as conn:
        total = await conn.fetchval(f"SELECT COUNT(*) FROM crm.interaccion i {where}", *params)
        rows = records_to_list(await conn.fetch(f"""
            SELECT i.id, i.cuenta_id, i.channel, i.outcome, i.resumen AS note, i.happened_at,
                   i.user_id, i.created_at,
                   rp.name AS cuenta_nombre,
                   u.nombre AS user_nombre
            FROM crm.interaccion i
            JOIN crm.cuenta cu ON cu.id = i.cuenta_id
            JOIN odoo.res_partner rp ON rp.odoo_id = cu.cuenta_partner_odoo_id AND rp.company_key='GLOBAL'
            LEFT JOIN crm.usuario u ON u.id = i.user_id
            {where}
            ORDER BY i.happened_at DESC
            LIMIT ${idx} OFFSET ${idx+1}
        """, *params, limit, (page - 1) * limit))

    return {"rows": rows, "total": total, "page": page}


@router.post("/interacciones")
async def create_interaccion(data: InteraccionCreate, user=Depends(_get_auth())):
    pool = await get_pool()
    uid = _user_id(user)
    happened = datetime.fromisoformat(data.happened_at) if data.happened_at else datetime.now(timezone.utc)

    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            INSERT INTO crm.interaccion (cuenta_id, contacto_id, user_id, channel, outcome, resumen, happened_at, tipo, fecha)
            VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $4, $7)
            RETURNING id, cuenta_id, channel, outcome, resumen AS note, happened_at, created_at
        """, data.cuenta_id, data.contacto_id, uid, data.channel, data.outcome, data.note, happened)

    return record_to_dict(row)


@router.get("/interaction-templates")
async def list_templates(user=Depends(_get_auth())):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = records_to_list(await conn.fetch(
            "SELECT id, name, channel, outcome, default_note FROM crm.interaction_template WHERE is_active = true ORDER BY name"
        ))
    return rows


# ═══════════════════════════════════
# C4) Next Action on Cuenta
# ═══════════════════════════════════

@router.patch("/cuentas/{cuenta_id}/next-action")
async def set_next_action(cuenta_id: str, data: NextActionUpdate, user=Depends(_get_auth())):
    pool = await get_pool()
    uid = _user_id(user)

    async with pool.acquire() as conn:
        na_at = datetime.fromisoformat(data.next_action_at) if data.next_action_at else None
        await conn.execute("""
            UPDATE crm.cuenta SET
                next_action_type = $1, next_action_at = $2, next_action_note = $3
            WHERE id = $4::uuid
        """, data.next_action_type, na_at, data.next_action_note, cuenta_id)

        if data.create_task and na_at and data.next_action_type:
            title = f"{data.next_action_type}: {data.next_action_note or ''}"[:100]
            await conn.execute("""
                INSERT INTO crm.tarea (cuenta_id, assigned_user_id, title, due_at, priority, note, tipo, descripcion, status)
                VALUES ($1::uuid, $2::uuid, $3, $4, 2, $5, 'TAREA', COALESCE($5, $3), 'OPEN')
            """, cuenta_id, uid, title, na_at, data.next_action_note)

    return {"ok": True}


# ═══════════════════════════════════
# Users list (for assignment)
# ═══════════════════════════════════

@router.get("/users")
async def list_users(user=Depends(_get_auth())):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = records_to_list(await conn.fetch(
            "SELECT id, usuario, nombre, rol FROM crm.usuario ORDER BY nombre"
        ))
    return rows
