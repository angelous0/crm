"""Pipeline comercial — kanban de asignaciones de seguimiento por vendedor.

Flujo:
    1. Encargado (admin/supervisor) asigna cuentas a una vendedora
    2. La vendedora ve las suyas en un kanban con 10 estados
    3. Mueve cards entre columnas según avanza el seguimiento
    4. Al cerrar (compro / no_interesado), la asignación sale del kanban

Persistencia entre días:
    - Estados intermedios (asignados, contactado, ..., pago_pendiente): siguen activos
    - Compró / No interesado: cerradas (closed_at, cerrada=true)
    - Reprogramar: vuelve automáticamente en `reprogramar_para`
    - No responde: vuelve mañana como 'contactado' (auto al refrescar)
"""
from datetime import date, datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from auth_utils import get_current_user
from db import safe_acquire
from helpers import row_to_dict


router = APIRouter(prefix="/api/pipeline")


ESTADOS_VALIDOS = {
    "asignados", "contactado", "interesado", "catalogo_enviado",
    "pedido_en_conversacion", "pago_pendiente", "compro",
    "reprogramar", "no_responde", "no_interesado",
}
ESTADOS_CERRADOS = {"compro", "no_interesado"}


# ── Modelos ─────────────────────────────────────────────────────────────────

class AsignarInput(BaseModel):
    cuenta_partner_odoo_ids: List[int]
    asignado_a: str
    marca: Optional[str] = None
    nota: Optional[str] = None


class MoverInput(BaseModel):
    estado: str
    nota: Optional[str] = None
    reprogramar_para: Optional[str] = None  # ISO date YYYY-MM-DD


# ── Helper: reabrir reprogramaciones cuyo fecha llegó + no_responde de ayer ──

async def _auto_reactivar(conn, vendedor: str):
    """Mueve a 'contactado' las reprogramaciones cuyo fecha ya llegó, y los
    'no_responde' del día anterior los regresa para reintento."""
    # Reprogramar → contactado cuando llega la fecha
    await conn.execute("""
        UPDATE crm.asignacion_seguimiento
           SET estado = 'asignados',
               moved_at = NOW(),
               updated_at = NOW(),
               reprogramar_para = NULL
         WHERE asignado_a = $1
           AND estado = 'reprogramar'
           AND cerrada = false
           AND reprogramar_para IS NOT NULL
           AND reprogramar_para <= CURRENT_DATE
    """, vendedor)
    # no_responde → contactado al día siguiente
    await conn.execute("""
        UPDATE crm.asignacion_seguimiento
           SET estado = 'contactado',
               moved_at = NOW(),
               updated_at = NOW()
         WHERE asignado_a = $1
           AND estado = 'no_responde'
           AND cerrada = false
           AND moved_at < CURRENT_DATE
    """, vendedor)


# ── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/mis-asignaciones")
async def mis_asignaciones(user: dict = Depends(get_current_user)):
    """Kanban del vendedor logueado. Devuelve cards con datos enriquecidos
    (LTV, días sin compra, tier, monto último, etc.)."""
    vendedor = user.get("username")
    if not vendedor:
        raise HTTPException(400, "Usuario sin username")

    async with safe_acquire() as conn:
        # Reactivar reprogramaciones + no_responde antes de devolver
        await _auto_reactivar(conn, vendedor)

        rows = await conn.fetch("""
            SELECT
                a.id, a.cuenta_partner_odoo_id, a.estado, a.marca, a.nota,
                a.asignado_at, a.asignado_por, a.moved_at, a.reprogramar_para,
                EXTRACT(EPOCH FROM (NOW() - a.moved_at))::bigint AS segs_en_columna,
                rp.name        AS partner_name,
                rp.phone       AS phone,
                rp.mobile      AS mobile,
                rp.state_name  AS depto,
                rp.district_name AS distrito,
                mvce.tier              AS tier,
                mvce.estado_auto       AS estado_auto,
                mvce.amount_12m::float AS ltv_12m,
                mvce.orders_12m::int   AS orders_12m,
                mvce.recencia_dias     AS recencia_dias,
                -- ticket promedio calculado: amount_12m / orders_12m
                CASE WHEN mvce.orders_12m > 0
                     THEN (mvce.amount_12m / mvce.orders_12m)::float
                     ELSE 0 END  AS ticket,
                mvce.last_purchase_date  AS last_purchase_date
            FROM crm.asignacion_seguimiento a
            LEFT JOIN odoo.res_partner rp
              ON rp.odoo_id = a.cuenta_partner_odoo_id AND rp.company_key = 'GLOBAL'
            LEFT JOIN crm.mv_cuenta_estado mvce
              ON mvce.cuenta_partner_odoo_id = a.cuenta_partner_odoo_id
            WHERE a.asignado_a = $1
              AND a.cerrada = false
            ORDER BY a.moved_at DESC
        """, vendedor)

        items = []
        for r in rows:
            phone = r["phone"] or r["mobile"] or ""
            phone_source = "phone" if r["phone"] else ("mobile" if r["mobile"] else None)
            items.append({
                "id": str(r["id"]),
                "cuenta_partner_odoo_id": r["cuenta_partner_odoo_id"],
                "partner_name": r["partner_name"],
                "phone": phone,
                "phone_source": phone_source,
                "depto": r["depto"],
                "distrito": r["distrito"],
                "estado": r["estado"],
                "marca": r["marca"],
                "nota": r["nota"],
                "tier": r["tier"],
                "estado_auto": r["estado_auto"],
                "ltv_12m": float(r["ltv_12m"] or 0),
                "orders_12m": int(r["orders_12m"] or 0),
                "recencia_dias": r["recencia_dias"],
                "ticket": float(r["ticket"] or 0),
                "last_purchase_date": r["last_purchase_date"].isoformat() if r["last_purchase_date"] else None,
                "asignado_por": r["asignado_por"],
                "asignado_at": r["asignado_at"].isoformat() if r["asignado_at"] else None,
                "moved_at": r["moved_at"].isoformat() if r["moved_at"] else None,
                "segs_en_columna": int(r["segs_en_columna"] or 0),
                "reprogramar_para": r["reprogramar_para"].isoformat() if r["reprogramar_para"] else None,
            })

    # Agrupar por estado (para el kanban)
    por_estado: dict = {e: [] for e in ESTADOS_VALIDOS}
    for it in items:
        por_estado.setdefault(it["estado"], []).append(it)

    return {
        "vendedor": vendedor,
        "total": len(items),
        "items": items,
        "por_estado": por_estado,
    }


@router.post("/asignar")
async def asignar(data: AsignarInput, user: dict = Depends(get_current_user)):
    """Encargado asigna 1+ cuentas a una vendedora. Estado inicial: 'asignados'."""
    rol = user.get("rol", "vendedora")
    if rol not in ("admin", "supervisor"):
        raise HTTPException(403, "Solo admin o supervisor pueden asignar")

    asignador = user.get("username")
    creadas = []
    saltadas = []

    async with safe_acquire() as conn:
        for partner_id in data.cuenta_partner_odoo_ids:
            try:
                row = await conn.fetchrow("""
                    INSERT INTO crm.asignacion_seguimiento
                        (cuenta_partner_odoo_id, asignado_a, asignado_por,
                         marca, nota, estado)
                    VALUES ($1, $2, $3, $4, $5, 'asignados')
                    RETURNING id
                """, partner_id, data.asignado_a, asignador,
                     data.marca or None, data.nota)
                creadas.append({"partner_id": partner_id, "asignacion_id": str(row["id"])})
            except Exception as e:
                # Ya estaba asignada al mismo vendedor con la misma marca
                saltadas.append({"partner_id": partner_id, "razon": str(e)[:80]})

    return {"creadas": creadas, "saltadas": saltadas,
            "ok": len(creadas), "ya_asignadas": len(saltadas)}


@router.patch("/asignacion/{asignacion_id}")
async def mover_asignacion(
    asignacion_id: str,
    data: MoverInput,
    user: dict = Depends(get_current_user),
):
    """Mueve una asignación a otro estado. Cierra si llega a compro/no_interesado.
    Si estado='reprogramar', requiere `reprogramar_para`."""
    if data.estado not in ESTADOS_VALIDOS:
        raise HTTPException(400, f"Estado inválido: {data.estado}")

    es_cerrada = data.estado in ESTADOS_CERRADOS
    reprogramar = data.estado == "reprogramar"
    if reprogramar and not data.reprogramar_para:
        raise HTTPException(400, "reprogramar_para requerido para estado 'reprogramar'")

    async with safe_acquire() as conn:
        row = await conn.fetchrow("""
            SELECT asignado_a FROM crm.asignacion_seguimiento WHERE id = $1
        """, asignacion_id)
        if not row:
            raise HTTPException(404, "Asignación no encontrada")

        # Solo el vendedor asignado o admin puede mover
        rol = user.get("rol", "vendedora")
        if row["asignado_a"] != user.get("username") and rol not in ("admin", "supervisor"):
            raise HTTPException(403, "No puedes mover una asignación de otro vendedor")

        await conn.execute("""
            UPDATE crm.asignacion_seguimiento
               SET estado = $2,
                   moved_at = NOW(),
                   updated_at = NOW(),
                   nota = COALESCE($3, nota),
                   reprogramar_para = $4,
                   cerrada = $5,
                   closed_at = CASE WHEN $5 THEN NOW() ELSE NULL END
             WHERE id = $1
        """, asignacion_id, data.estado, data.nota,
             data.reprogramar_para if reprogramar else None,
             es_cerrada)

    return {"ok": True, "id": asignacion_id, "estado": data.estado,
            "cerrada": es_cerrada}


@router.delete("/asignacion/{asignacion_id}")
async def desasignar(asignacion_id: str, user: dict = Depends(get_current_user)):
    """Borra (hard) una asignación. Solo admin/supervisor."""
    rol = user.get("rol", "vendedora")
    if rol not in ("admin", "supervisor"):
        raise HTTPException(403, "Solo admin o supervisor")
    async with safe_acquire() as conn:
        await conn.execute("DELETE FROM crm.asignacion_seguimiento WHERE id = $1", asignacion_id)
    return {"ok": True}


@router.get("/vendedores")
async def listar_vendedores(_user: dict = Depends(get_current_user)):
    """Lista de usernames activos del CRM (para dropdown de asignar)."""
    async with safe_acquire() as conn:
        rows = await conn.fetch("""
            SELECT username, rol, nombre_completo, iniciales
            FROM crm.usuario
            WHERE activo = true
            ORDER BY rol DESC, nombre_completo NULLS LAST
        """)
    return [row_to_dict(r) for r in rows]
