"""Locales comerciales por cuenta — múltiples puntos de venta con geolocalización.

Sprint CRM-D7. Una cuenta puede tener varios locales (calle, galería, mercado,
boutique, mall, otro). Uno se marca como principal. Geocoded para mostrar en
mapa interactivo (Leaflet en frontend).

Endpoints:
- GET    /api/cuentas/{partner_odoo_id}/locales
    → lista de locales activos de la cuenta
- POST   /api/cuentas/{partner_odoo_id}/locales
    → crear nuevo local (si es_principal=true, los demás se desmarcan)
- PATCH  /api/cuentas/{partner_odoo_id}/locales/{local_id}
    → actualizar campos del local
- DELETE /api/cuentas/{partner_odoo_id}/locales/{local_id}
    → soft-delete (activo=false)
- POST   /api/cuentas/{partner_odoo_id}/locales/{local_id}/principal
    → marcar local como principal (desmarca los demás)
- POST   /api/cuentas/{partner_odoo_id}/locales/autocreate
    → autocrear el local principal desde los campos del perfil (direccion_crm,
      departamento, distrito). Idempotente: si ya hay locales, no hace nada.
"""
from typing import Optional
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth_utils import get_current_user
from db import safe_acquire
from helpers import row_to_dict


router = APIRouter(prefix="/api/cuentas")


TIPOS_VALIDOS = {"galeria", "calle", "mercado", "boutique", "mall", "otro"}


class LocalInput(BaseModel):
    nombre:       Optional[str] = None
    tipo:         Optional[str] = Field(default="calle")
    referencia:   Optional[str] = None
    direccion:    Optional[str] = None
    distrito:     Optional[str] = None
    departamento: Optional[str] = None
    pais:         Optional[str] = None
    horario:      Optional[str] = None
    latitud:      Optional[float] = None
    longitud:     Optional[float] = None
    es_principal: Optional[bool] = False
    foto_url:     Optional[str] = None


class LocalPatchInput(BaseModel):
    nombre:       Optional[str] = None
    tipo:         Optional[str] = None
    referencia:   Optional[str] = None
    direccion:    Optional[str] = None
    distrito:     Optional[str] = None
    departamento: Optional[str] = None
    pais:         Optional[str] = None
    horario:      Optional[str] = None
    latitud:      Optional[float] = None
    longitud:     Optional[float] = None
    es_principal: Optional[bool] = None
    foto_url:     Optional[str] = None


def _validar_tipo(tipo: Optional[str]) -> str:
    """Valida tipo de local; default 'calle' si vacío."""
    t = (tipo or "calle").lower().strip()
    if t not in TIPOS_VALIDOS:
        raise HTTPException(400, f"tipo inválido. Válidos: {', '.join(sorted(TIPOS_VALIDOS))}")
    return t


def _serialize(row) -> dict:
    """Convierte Record asyncpg → dict serializable JSON."""
    d = row_to_dict(row)
    # Numeric → float
    for k in ("latitud", "longitud"):
        if d.get(k) is not None:
            d[k] = float(d[k]) if isinstance(d[k], Decimal) else d[k]
    return d


@router.get("/{partner_odoo_id}/locales")
async def list_locales(partner_odoo_id: int, _user: dict = Depends(get_current_user)):
    """Lista locales activos de la cuenta, principal primero."""
    async with safe_acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, cuenta_partner_odoo_id, nombre, tipo, referencia,
                   direccion, distrito, departamento, pais, horario,
                   latitud, longitud, es_principal, foto_url, activo,
                   created_at, created_by, updated_at, updated_by
            FROM crm.cuenta_local
            WHERE cuenta_partner_odoo_id = $1 AND activo = true
            ORDER BY es_principal DESC, created_at ASC
        """, partner_odoo_id)
    return {"locales": [_serialize(r) for r in rows]}


@router.post("/{partner_odoo_id}/locales")
async def create_local(
    partner_odoo_id: int,
    data: LocalInput,
    user: dict = Depends(get_current_user),
):
    """Crea un nuevo local. Si es_principal=true, desmarca los demás."""
    tipo = _validar_tipo(data.tipo)
    user_name = (user.get("username") if isinstance(user, dict) else None) or "system"

    async with safe_acquire() as conn:
        # Asegurar crm.cuenta existe
        await conn.execute("""
            INSERT INTO crm.cuenta (cuenta_partner_odoo_id) VALUES ($1)
            ON CONFLICT (cuenta_partner_odoo_id) DO NOTHING
        """, partner_odoo_id)

        # Si el caller pide marcarlo como principal o no hay locales previos
        # activos, ese registro será el principal.
        async with conn.transaction():
            cantidad_actual = await conn.fetchval(
                "SELECT COUNT(*) FROM crm.cuenta_local "
                "WHERE cuenta_partner_odoo_id = $1 AND activo = true",
                partner_odoo_id,
            )
            quiere_principal = bool(data.es_principal) or (cantidad_actual == 0)

            if quiere_principal:
                # Desmarcar los demás
                await conn.execute("""
                    UPDATE crm.cuenta_local
                    SET es_principal = false, updated_at = now(), updated_by = $2
                    WHERE cuenta_partner_odoo_id = $1 AND activo = true AND es_principal = true
                """, partner_odoo_id, user_name)

            row = await conn.fetchrow("""
                INSERT INTO crm.cuenta_local (
                    cuenta_partner_odoo_id, nombre, tipo, referencia, direccion,
                    distrito, departamento, pais, horario, latitud, longitud,
                    es_principal, foto_url, created_by, updated_by
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14
                ) RETURNING *
            """,
                partner_odoo_id,
                data.nombre, tipo, data.referencia, data.direccion,
                data.distrito, data.departamento, data.pais or "PE", data.horario,
                data.latitud, data.longitud,
                quiere_principal, data.foto_url,
                user_name,
            )
    return _serialize(row)


@router.patch("/{partner_odoo_id}/locales/{local_id}")
async def update_local(
    partner_odoo_id: int,
    local_id: str,
    data: LocalPatchInput,
    user: dict = Depends(get_current_user),
):
    """Actualiza campos de un local. Si es_principal=true, desmarca los demás."""
    user_name = (user.get("username") if isinstance(user, dict) else None) or "system"

    if data.tipo is not None:
        _validar_tipo(data.tipo)

    sets: list = []
    params: list = []
    for field in (
        "nombre", "tipo", "referencia", "direccion", "distrito",
        "departamento", "pais", "horario", "latitud", "longitud", "foto_url",
    ):
        value = getattr(data, field)
        if value is not None:
            params.append(value)
            sets.append(f"{field} = ${len(params)}")

    async with safe_acquire() as conn:
        async with conn.transaction():
            existe = await conn.fetchrow("""
                SELECT id FROM crm.cuenta_local
                WHERE id = $1 AND cuenta_partner_odoo_id = $2 AND activo = true
            """, local_id, partner_odoo_id)
            if not existe:
                raise HTTPException(404, "Local no encontrado")

            # Si se marca como principal, desmarcar los demás
            if data.es_principal is True:
                await conn.execute("""
                    UPDATE crm.cuenta_local
                    SET es_principal = false, updated_at = now(), updated_by = $3
                    WHERE cuenta_partner_odoo_id = $1 AND activo = true AND id <> $2
                """, partner_odoo_id, local_id, user_name)
                params.append(True)
                sets.append(f"es_principal = ${len(params)}")
            elif data.es_principal is False:
                params.append(False)
                sets.append(f"es_principal = ${len(params)}")

            if not sets:
                raise HTTPException(400, "No hay campos para actualizar")

            params.append(user_name)
            sets.append(f"updated_by = ${len(params)}")
            sets.append("updated_at = now()")

            params.append(local_id)
            row = await conn.fetchrow(
                f"UPDATE crm.cuenta_local SET {', '.join(sets)} "
                f"WHERE id = ${len(params)} RETURNING *",
                *params,
            )
    return _serialize(row)


@router.delete("/{partner_odoo_id}/locales/{local_id}")
async def delete_local(
    partner_odoo_id: int,
    local_id: str,
    user: dict = Depends(get_current_user),
):
    """Soft-delete: activo=false. Si era principal y queda otro local activo,
    asciende al más antiguo como nuevo principal."""
    user_name = (user.get("username") if isinstance(user, dict) else None) or "system"

    async with safe_acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow("""
                SELECT id, es_principal FROM crm.cuenta_local
                WHERE id = $1 AND cuenta_partner_odoo_id = $2 AND activo = true
            """, local_id, partner_odoo_id)
            if not row:
                raise HTTPException(404, "Local no encontrado")

            await conn.execute("""
                UPDATE crm.cuenta_local
                SET activo = false, es_principal = false,
                    updated_at = now(), updated_by = $2
                WHERE id = $1
            """, local_id, user_name)

            # Si era el principal, ascender otro
            if row["es_principal"]:
                nuevo = await conn.fetchrow("""
                    SELECT id FROM crm.cuenta_local
                    WHERE cuenta_partner_odoo_id = $1 AND activo = true
                    ORDER BY created_at ASC LIMIT 1
                """, partner_odoo_id)
                if nuevo:
                    await conn.execute("""
                        UPDATE crm.cuenta_local
                        SET es_principal = true, updated_at = now(), updated_by = $2
                        WHERE id = $1
                    """, nuevo["id"], user_name)

    return {"ok": True, "deleted": local_id}


@router.post("/{partner_odoo_id}/locales/{local_id}/principal")
async def marcar_principal(
    partner_odoo_id: int,
    local_id: str,
    user: dict = Depends(get_current_user),
):
    """Marca un local como principal (desmarca los demás)."""
    user_name = (user.get("username") if isinstance(user, dict) else None) or "system"

    async with safe_acquire() as conn:
        async with conn.transaction():
            existe = await conn.fetchrow("""
                SELECT id FROM crm.cuenta_local
                WHERE id = $1 AND cuenta_partner_odoo_id = $2 AND activo = true
            """, local_id, partner_odoo_id)
            if not existe:
                raise HTTPException(404, "Local no encontrado")

            await conn.execute("""
                UPDATE crm.cuenta_local
                SET es_principal = false, updated_at = now(), updated_by = $2
                WHERE cuenta_partner_odoo_id = $1 AND activo = true AND es_principal = true
            """, partner_odoo_id, user_name)

            row = await conn.fetchrow("""
                UPDATE crm.cuenta_local
                SET es_principal = true, updated_at = now(), updated_by = $2
                WHERE id = $1 RETURNING *
            """, local_id, user_name)
    return _serialize(row)


@router.post("/{partner_odoo_id}/locales/autocreate")
async def autocreate_local(
    partner_odoo_id: int,
    user: dict = Depends(get_current_user),
):
    """Autocrea el local principal desde los campos del perfil de la cuenta.

    Idempotente: si la cuenta ya tiene algún local activo, retorna sin crear
    nada. Lee direccion_crm/departamento/distrito de crm.cuenta y los campos
    de Odoo como fallback (city, street, state_name).
    """
    user_name = (user.get("username") if isinstance(user, dict) else None) or "system"

    async with safe_acquire() as conn:
        # ¿Ya tiene locales?
        existentes = await conn.fetchval(
            "SELECT COUNT(*) FROM crm.cuenta_local "
            "WHERE cuenta_partner_odoo_id = $1 AND activo = true",
            partner_odoo_id,
        )
        if existentes and int(existentes) > 0:
            return {"ok": True, "skipped": True, "reason": "ya existe local"}

        # Datos CRM + Odoo
        row = await conn.fetchrow("""
            SELECT
                COALESCE(NULLIF(cu.direccion_crm, ''), rp.street)         AS direccion,
                COALESCE(NULLIF(cu.distrito, ''), rp.district_name)       AS distrito,
                COALESCE(NULLIF(cu.departamento, ''), rp.state_name::text) AS departamento,
                COALESCE(NULLIF(cu.pais, ''), 'PE')                       AS pais,
                rp.name AS nombre_partner
            FROM odoo.res_partner rp
            LEFT JOIN crm.cuenta cu ON cu.cuenta_partner_odoo_id = rp.odoo_id
            WHERE rp.odoo_id = $1 AND rp.company_key = 'GLOBAL'
            LIMIT 1
        """, partner_odoo_id)

        if not row:
            raise HTTPException(404, "Cuenta no encontrada")

        direccion = row["direccion"]
        depto     = row["departamento"]
        distrito  = row["distrito"]
        nombre    = row["nombre_partner"]

        # Si no hay ningún dato útil, no crear
        if not any([direccion, depto, distrito]):
            return {"ok": True, "skipped": True, "reason": "sin datos de dirección"}

        # Asegurar crm.cuenta existe
        await conn.execute("""
            INSERT INTO crm.cuenta (cuenta_partner_odoo_id) VALUES ($1)
            ON CONFLICT (cuenta_partner_odoo_id) DO NOTHING
        """, partner_odoo_id)

        nuevo = await conn.fetchrow("""
            INSERT INTO crm.cuenta_local (
                cuenta_partner_odoo_id, nombre, tipo, direccion,
                distrito, departamento, pais, es_principal,
                created_by, updated_by
            ) VALUES (
                $1, $2, 'calle', $3, $4, $5, $6, true, $7, $7
            ) RETURNING *
        """,
            partner_odoo_id,
            f"{nombre} · Principal" if nombre else "Local principal",
            direccion, distrito, depto, row["pais"], user_name,
        )

    return {"ok": True, "created": True, "local": _serialize(nuevo)}
