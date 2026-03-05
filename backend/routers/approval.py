"""Approval workflow router – pending accounts/contacts management."""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, Literal
import logging
import re as _re
from db import get_pool, records_to_list

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/approval", tags=["approval"])


def _get_auth():
    from server import get_current_user
    return get_current_user


def _normalize(val):
    if not val:
        return ""
    return _re.sub(r'[^0-9A-Za-z]', '', str(val)).upper()


def _norm_phone(val):
    if not val:
        return ""
    return _re.sub(r'[^0-9]', '', str(val))


class ApproveInput(BaseModel):
    note: Optional[str] = None
    set_active: bool = True


class RejectInput(BaseModel):
    note: str


class LinkInput(BaseModel):
    target_cuenta_id: int
    mode: Literal['LINK', 'MERGE']
    note: Optional[str] = None


@router.get("/pending")
async def get_pending(
    entity: str = Query("cuenta", regex="^(cuenta|contacto)$"),
    days: int = 365,
    page: int = 1,
    limit: int = 50,
    search: str = "",
    user=Depends(_get_auth()),
):
    """List pending accounts or contacts with duplicate suggestions."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        offset = (page - 1) * limit

        if entity == "cuenta":
            where = "WHERE COALESCE(cu.approval_status, 'APPROVED') = 'PENDING'"
            params = []

            if search:
                params.append(f"%{search}%")
                idx = len(params)
                where += f" AND (rp.name ILIKE ${idx} OR COALESCE(rp.vat,'') ILIKE ${idx} OR COALESCE(rp.city::text,'') ILIKE ${idx})"

            count = await conn.fetchval(f"""
                SELECT COUNT(*)
                FROM crm.v_cuentas_libres cl
                JOIN odoo.res_partner rp ON rp.odoo_id = cl.cuenta_partner_odoo_id AND rp.company_key='GLOBAL'
                LEFT JOIN crm.cuenta cu ON cu.cuenta_partner_odoo_id = cl.cuenta_partner_odoo_id
                {where}
            """, *params)

            data_params = params.copy()
            data_params.extend([limit + 1, offset])
            rows = records_to_list(await conn.fetch(f"""
                SELECT
                    cl.cuenta_partner_odoo_id AS id,
                    rp.name AS nombre,
                    COALESCE(rp.vat, '') AS vat,
                    COALESCE(rp.city::text, '') AS ciudad,
                    COALESCE(rp.phone::text, '') AS raw_phone,
                    COALESCE(rp.mobile::text, '') AS raw_mobile,
                    cu.created_at,
                    cu.last_seen_at,
                    COALESCE(cu.approval_status, 'APPROVED') AS approval_status,
                    COALESCE(k.orders_12m, 0) AS ventas_orders,
                    COALESCE(k.qty_12m, 0) AS ventas_qty,
                    k.last_purchase_date AS ventas_ultima
                FROM crm.v_cuentas_libres cl
                JOIN odoo.res_partner rp ON rp.odoo_id = cl.cuenta_partner_odoo_id AND rp.company_key='GLOBAL'
                LEFT JOIN crm.cuenta cu ON cu.cuenta_partner_odoo_id = cl.cuenta_partner_odoo_id
                LEFT JOIN crm.mv_cuenta_sales_kpi k ON k.cuenta_id = cl.cuenta_partner_odoo_id
                {where}
                ORDER BY cu.created_at DESC NULLS LAST
                LIMIT ${len(data_params) - 1} OFFSET ${len(data_params)}
            """, *data_params))

            has_next = len(rows) > limit
            rows = rows[:limit]

            # Phone normalization
            from server import _apply_phone
            for r in rows:
                _apply_phone(r)

            # Compute suggestions
            if rows:
                pending_ids = [r['id'] for r in rows]
                suggestions = await _compute_suggestions(conn, pending_ids)
                for r in rows:
                    r['suggestion'] = suggestions.get(r['id'])

            return {
                "rows": rows,
                "total": count,
                "page": page,
                "limit": limit,
                "has_next": has_next,
            }

        else:  # contacto
            where = "WHERE COALESCE(co.approval_status, 'APPROVED') = 'PENDING'"
            params = []

            if search:
                params.append(f"%{search}%")
                idx = len(params)
                where += f" AND (rp.name ILIKE ${idx} OR COALESCE(rp.vat,'') ILIKE ${idx})"

            count = await conn.fetchval(f"""
                SELECT COUNT(*)
                FROM crm.contacto co
                JOIN odoo.res_partner rp ON rp.odoo_id = co.contacto_partner_odoo_id AND rp.company_key='GLOBAL'
                {where}
            """, *params)

            data_params = params.copy()
            data_params.extend([limit + 1, offset])
            rows = records_to_list(await conn.fetch(f"""
                SELECT
                    co.contacto_partner_odoo_id AS id,
                    co.cuenta_partner_odoo_id,
                    rp.name AS nombre,
                    COALESCE(rp.vat, '') AS vat,
                    COALESCE(rp.city::text, '') AS ciudad,
                    COALESCE(rp.phone::text, '') AS raw_phone,
                    COALESCE(rp.mobile::text, '') AS raw_mobile,
                    co.created_at,
                    co.last_seen_at,
                    COALESCE(co.approval_status, 'APPROVED') AS approval_status,
                    rp_parent.name AS cuenta_nombre
                FROM crm.contacto co
                JOIN odoo.res_partner rp ON rp.odoo_id = co.contacto_partner_odoo_id AND rp.company_key='GLOBAL'
                LEFT JOIN odoo.res_partner rp_parent ON rp_parent.odoo_id = co.cuenta_partner_odoo_id AND rp_parent.company_key='GLOBAL'
                {where}
                ORDER BY co.created_at DESC NULLS LAST
                LIMIT ${len(data_params) - 1} OFFSET ${len(data_params)}
            """, *data_params))

            has_next = len(rows) > limit
            rows = rows[:limit]

            from server import _apply_phone
            for r in rows:
                _apply_phone(r)

            return {
                "rows": rows,
                "total": count,
                "page": page,
                "limit": limit,
                "has_next": has_next,
            }


@router.get("/pending/count")
async def get_pending_count(user=Depends(_get_auth())):
    """Get counts of pending items for sidebar badge."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        cuenta_count = await conn.fetchval("""
            SELECT COUNT(*)
            FROM crm.v_cuentas_libres cl
            LEFT JOIN crm.cuenta cu ON cu.cuenta_partner_odoo_id = cl.cuenta_partner_odoo_id
            WHERE COALESCE(cu.approval_status, 'APPROVED') = 'PENDING'
        """)
        contacto_count = await conn.fetchval("""
            SELECT COUNT(*)
            FROM crm.contacto co
            WHERE COALESCE(co.approval_status, 'APPROVED') = 'PENDING'
        """)
        return {"cuentas": cuenta_count or 0, "contactos": contacto_count or 0, "total": (cuenta_count or 0) + (contacto_count or 0)}


@router.get("/partner/{partner_id}/sales")
async def get_partner_sales(partner_id: int, user=Depends(_get_auth())):
    """Get POS sales detail for a specific partner (for pending approval review)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = records_to_list(await conn.fetch("""
            SELECT
                po.odoo_id AS order_id,
                po.name AS order_name,
                po.date_order,
                po.amount_total,
                COALESCE(agg.qty_total, 0) AS qty_total,
                COALESCE(agg.lines_count, 0) AS lines_count
            FROM odoo.pos_order po
            JOIN (
                SELECT pol.order_id,
                       COALESCE(SUM(pol.qty), 0) AS qty_total,
                       COUNT(*) AS lines_count
                FROM odoo.pos_order_line pol
                GROUP BY pol.order_id
            ) agg ON agg.order_id = po.odoo_id
            WHERE po.partner_id = $1
              AND COALESCE(po.is_cancel, false) = false
              AND COALESCE(po.order_cancel, false) = false
            ORDER BY po.date_order DESC
            LIMIT 50
        """, partner_id))
        return {"rows": rows, "partner_id": partner_id}


@router.post("/detect-new")
async def detect_new_pending(user=Depends(_get_auth())):
    """Detect partners in v_cuentas_libres without a crm.cuenta row and create them as PENDING."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            INSERT INTO crm.cuenta (cuenta_partner_odoo_id, approval_status, created_at)
            SELECT cl.cuenta_partner_odoo_id, 'PENDING', now()
            FROM crm.v_cuentas_libres cl
            LEFT JOIN crm.cuenta cu ON cu.cuenta_partner_odoo_id = cl.cuenta_partner_odoo_id
            WHERE cu.id IS NULL
            ON CONFLICT (cuenta_partner_odoo_id) DO NOTHING
            RETURNING cuenta_partner_odoo_id
        """)
        count = len(rows)
        logger.info(f"detect-new: created {count} PENDING accounts")
        return {"ok": True, "new_pending_count": count}


@router.post("/{entity}/{partner_id}/approve")
async def approve_entity(
    entity: str, partner_id: int, data: ApproveInput,
    user=Depends(_get_auth()),
):
    """Approve a pending account or contact."""
    if entity not in ("cuenta", "contacto"):
        raise HTTPException(400, "entity must be 'cuenta' or 'contacto'")
    pool = await get_pool()
    user_email = user.get("usuario", "unknown") if isinstance(user, dict) else "unknown"
    async with pool.acquire() as conn:
        if entity == "cuenta":
            id_col = "cuenta_partner_odoo_id"
        else:
            id_col = "contacto_partner_odoo_id"
        tbl = f"crm.{entity}"

        res = await conn.execute(f"""
            UPDATE {tbl} SET
                approval_status = 'APPROVED',
                approved_at = now(),
                approved_by = $2,
                approval_note = $3,
                is_active = $4,
                manual_inactive = CASE WHEN $4 = false THEN true ELSE manual_inactive END
            WHERE {id_col} = $1
        """, partner_id, user_email, data.note, data.set_active)

        affected = int(res.split()[-1]) if res else 0
        if not affected:
            # Create the row if it doesn't exist yet (account not in crm.cuenta)
            if entity == "cuenta":
                await conn.execute("""
                    INSERT INTO crm.cuenta (cuenta_partner_odoo_id, approval_status, approved_at, approved_by, approval_note, is_active, manual_inactive)
                    VALUES ($1, 'APPROVED', now(), $2, $3, $4, CASE WHEN $4 = false THEN true ELSE false END)
                    ON CONFLICT (cuenta_partner_odoo_id) DO UPDATE SET
                        approval_status = 'APPROVED', approved_at = now(), approved_by = $2, approval_note = $3,
                        is_active = $4, manual_inactive = CASE WHEN $4 = false THEN true ELSE false END
                """, partner_id, user_email, data.note, data.set_active)
            else:
                raise HTTPException(404, "Contacto no encontrado")

        return {"ok": True, "status": "APPROVED", "is_active": data.set_active}


@router.post("/{entity}/{partner_id}/reject")
async def reject_entity(
    entity: str, partner_id: int, data: RejectInput,
    user=Depends(_get_auth()),
):
    """Reject a pending account or contact."""
    if entity not in ("cuenta", "contacto"):
        raise HTTPException(400, "entity must be 'cuenta' or 'contacto'")
    if len((data.note or "").strip()) < 3:
        raise HTTPException(422, "La nota debe tener al menos 3 caracteres")
    pool = await get_pool()
    user_email = user.get("usuario", "unknown") if isinstance(user, dict) else "unknown"
    async with pool.acquire() as conn:
        if entity == "cuenta":
            id_col = "cuenta_partner_odoo_id"
        else:
            id_col = "contacto_partner_odoo_id"
        tbl = f"crm.{entity}"

        res = await conn.execute(f"""
            UPDATE {tbl} SET
                approval_status = 'REJECTED',
                approved_at = now(),
                approved_by = $2,
                approval_note = $3,
                is_active = false,
                manual_inactive = true
            WHERE {id_col} = $1
        """, partner_id, user_email, data.note)

        affected = int(res.split()[-1]) if res else 0
        if not affected:
            if entity == "cuenta":
                await conn.execute("""
                    INSERT INTO crm.cuenta (cuenta_partner_odoo_id, approval_status, approved_at, approved_by, approval_note, is_active, manual_inactive)
                    VALUES ($1, 'REJECTED', now(), $2, $3, false, true)
                    ON CONFLICT (cuenta_partner_odoo_id) DO UPDATE SET
                        approval_status = 'REJECTED', approved_at = now(), approved_by = $2, approval_note = $3,
                        is_active = false, manual_inactive = true
                """, partner_id, user_email, data.note)
            else:
                raise HTTPException(404, "Contacto no encontrado")

        return {"ok": True, "status": "REJECTED"}


@router.post("/cuenta/{partner_id}/link-to")
async def link_cuenta(
    partner_id: int, data: LinkInput,
    user=Depends(_get_auth()),
):
    """Link a pending account to an existing approved account."""
    pool = await get_pool()
    user_email = user.get("usuario", "unknown") if isinstance(user, dict) else "unknown"
    async with pool.acquire() as conn:
        # Find target cuenta UUID
        target = await conn.fetchrow(
            "SELECT id FROM crm.cuenta WHERE cuenta_partner_odoo_id = $1",
            data.target_cuenta_id,
        )
        if not target:
            # Auto-create target cuenta if not in CRM yet
            target = await conn.fetchrow("""
                INSERT INTO crm.cuenta (cuenta_partner_odoo_id, approval_status)
                VALUES ($1, 'APPROVED')
                ON CONFLICT (cuenta_partner_odoo_id) DO UPDATE SET approval_status = crm.cuenta.approval_status
                RETURNING id
            """, data.target_cuenta_id)

        if data.mode == "LINK":
            # Create vinculo: link the pending partner to the target account
            await conn.execute("""
                INSERT INTO crm.cuenta_vinculo (cuenta_id, odoo_partner_id, activo, created_at)
                VALUES ($1, $2, true, now())
                ON CONFLICT (cuenta_id, odoo_partner_id) DO UPDATE SET activo = true
            """, target['id'], partner_id)

            # Approve the pending account
            await conn.execute("""
                UPDATE crm.cuenta SET
                    approval_status = 'APPROVED',
                    approved_at = now(), approved_by = $2,
                    approval_note = $3
                WHERE cuenta_partner_odoo_id = $1
            """, partner_id, user_email,
                 f"Vinculado a cuenta {data.target_cuenta_id}. {data.note or ''}")

            return {"ok": True, "mode": "LINK", "target_cuenta_id": data.target_cuenta_id}

        elif data.mode == "MERGE":
            # Create vinculo so the partner's sales roll up into the target
            await conn.execute("""
                INSERT INTO crm.cuenta_vinculo (cuenta_id, odoo_partner_id, activo, created_at)
                VALUES ($1, $2, true, now())
                ON CONFLICT (cuenta_id, odoo_partner_id) DO UPDATE SET activo = true
            """, target['id'], partner_id)

            # Reject the pending account (hide it)
            await conn.execute("""
                UPDATE crm.cuenta SET
                    approval_status = 'REJECTED',
                    approved_at = now(), approved_by = $2,
                    approval_note = $3,
                    is_active = false, manual_inactive = true
                WHERE cuenta_partner_odoo_id = $1
            """, partner_id, user_email,
                 f"Merge → cuenta {data.target_cuenta_id}. {data.note or ''}")

            return {"ok": True, "mode": "MERGE", "target_cuenta_id": data.target_cuenta_id}

        raise HTTPException(400, "mode must be LINK or MERGE")


async def _compute_suggestions(conn, pending_ids):
    """Compute duplicate suggestions for pending accounts using batch queries."""
    if not pending_ids:
        return {}

    # Get pending accounts info
    pending_rows = await conn.fetch("""
        SELECT rp.odoo_id AS id, COALESCE(rp.vat, '') AS vat,
               COALESCE(rp.phone::text, '') AS phone, COALESCE(rp.mobile::text, '') AS mobile,
               rp.name
        FROM odoo.res_partner rp
        WHERE rp.odoo_id = ANY($1) AND rp.company_key = 'GLOBAL'
    """, pending_ids)

    if not pending_rows:
        return {}

    # Build lookup dicts
    pending_map = {}
    docs = {}  # normalized_doc -> pending_id
    phones = {}  # normalized_phone -> pending_id
    names = {}  # pending_id -> name

    for pr in pending_rows:
        pid = pr['id']
        pending_map[pid] = pr
        doc = _normalize(pr['vat'])
        if doc and len(doc) >= 6:
            docs[doc] = pid
        ph = _norm_phone(pr['mobile']) or _norm_phone(pr['phone'])
        if ph and len(ph) >= 7:
            phones[ph] = pid
        name = (pr['name'] or '').strip()
        if name and len(name) >= 4:
            names[pid] = name

    suggestions = {}
    matched_pids = set()

    # 1) Batch DOC match – single query
    if docs:
        doc_values = list(docs.keys())
        doc_matches = await conn.fetch("""
            SELECT DISTINCT ON (UPPER(TRIM(COALESCE(rp.vat, ''))))
                UPPER(TRIM(COALESCE(rp.vat, ''))) AS norm_vat,
                rp.odoo_id AS id, rp.name
            FROM crm.v_cuentas_libres cl
            JOIN odoo.res_partner rp ON rp.odoo_id = cl.cuenta_partner_odoo_id AND rp.company_key='GLOBAL'
            LEFT JOIN crm.cuenta cu ON cu.cuenta_partner_odoo_id = cl.cuenta_partner_odoo_id
            WHERE COALESCE(cu.approval_status, 'APPROVED') = 'APPROVED'
              AND UPPER(TRIM(COALESCE(rp.vat, ''))) = ANY($1)
              AND rp.odoo_id <> ALL($2)
            ORDER BY UPPER(TRIM(COALESCE(rp.vat, ''))), rp.odoo_id
        """, doc_values, pending_ids)
        for m in doc_matches:
            norm_vat = m['norm_vat']
            if norm_vat in docs:
                pid = docs[norm_vat]
                if pid not in matched_pids:
                    suggestions[pid] = {
                        "suggested_cuenta_id": m['id'],
                        "suggested_name": m['name'],
                        "reason": "DOC",
                        "confidence": 1.0,
                    }
                    matched_pids.add(pid)

    # 2) Batch TEL match – single query for unmatched
    unmatched_phones = {ph: pid for ph, pid in phones.items() if pid not in matched_pids}
    if unmatched_phones:
        phone_values = list(unmatched_phones.keys())
        unmatched_pids = list(set(unmatched_phones.values()))
        tel_matches = await conn.fetch("""
            SELECT
                REGEXP_REPLACE(COALESCE(rp.phone::text,''), '[^0-9]', '', 'g') AS norm_phone,
                REGEXP_REPLACE(COALESCE(rp.mobile::text,''), '[^0-9]', '', 'g') AS norm_mobile,
                rp.odoo_id AS id, rp.name
            FROM crm.v_cuentas_libres cl
            JOIN odoo.res_partner rp ON rp.odoo_id = cl.cuenta_partner_odoo_id AND rp.company_key='GLOBAL'
            LEFT JOIN crm.cuenta cu ON cu.cuenta_partner_odoo_id = cl.cuenta_partner_odoo_id
            WHERE COALESCE(cu.approval_status, 'APPROVED') = 'APPROVED'
              AND rp.odoo_id <> ALL($2)
              AND (
                  REGEXP_REPLACE(COALESCE(rp.phone::text,''), '[^0-9]', '', 'g') = ANY($1)
                  OR REGEXP_REPLACE(COALESCE(rp.mobile::text,''), '[^0-9]', '', 'g') = ANY($1)
              )
        """, phone_values, unmatched_pids)
        for m in tel_matches:
            matched_ph = m['norm_phone'] if m['norm_phone'] in unmatched_phones else (m['norm_mobile'] if m['norm_mobile'] in unmatched_phones else None)
            if matched_ph and unmatched_phones[matched_ph] not in matched_pids:
                pid = unmatched_phones[matched_ph]
                suggestions[pid] = {
                    "suggested_cuenta_id": m['id'],
                    "suggested_name": m['name'],
                    "reason": "TEL",
                    "confidence": 1.0,
                }
                matched_pids.add(pid)

    # 3) Skip name matching for performance (low confidence, expensive ILIKE)
    # Name matches are O(N) ILIKE queries and rarely actionable

    return suggestions
