"""Revisión de vinculaciones — auto-vinculaciones y fusiones de grupos.

Sprint CRM-D7. Permite al admin revisar lo que el sistema vinculó automáticamente
y aprobar/rechazar fusiones de grupos donde 2 grupos comparten reservas.

Endpoints:
- GET  /api/admin/vinculos/auto             → lista de auto-vinculaciones
- GET  /api/admin/vinculos/fusiones         → pares de grupos candidatos a fusión
- POST /api/admin/vinculos/fusiones/aplicar → fusionar grupo A con grupo B
- POST /api/admin/vinculos/fusiones/ignorar → marcar par como descartado
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth_utils import get_current_user
from db import safe_acquire
from helpers import row_to_dict


router = APIRouter(prefix="/api/admin/vinculos")

# Catch-alls genéricos a excluir siempre
GENERIC_PARTNER_IDS = [8, 1847]


def _solo_admin(user: dict):
    if not isinstance(user, dict):
        raise HTTPException(403, "Solo admin")
    if user.get("rol") not in ("admin", "superadmin", "supervisor"):
        raise HTTPException(403, "Solo admin/supervisor")


@router.get("/auto")
async def listar_auto_vinculaciones(
    q: str = "",
    page: int = 1,
    limit: int = 100,
    _user: dict = Depends(get_current_user),
):
    """Lista de auto-vinculaciones (overrides creados por batches automáticos)."""
    offset = (page - 1) * limit
    params: list = []
    where = "WHERE po.nota LIKE 'auto-vinculado%'"
    if q:
        params.append(f"%{q}%")
        idx = len(params)
        where += f" AND (rp_sec.name ILIKE ${idx} OR rp_pri.name ILIKE ${idx})"

    async with safe_acquire() as conn:
        data_params = params + [limit, offset]
        rows = await conn.fetch(
            f"""
            WITH ventas AS (
                SELECT cuenta_partner_id AS pid, SUM(price_subtotal)::numeric(14,2) AS v
                FROM crm.mv_pos_line_cuenta GROUP BY cuenta_partner_id
            )
            SELECT
                po.id::text                   AS override_id,
                po.contacto_partner_odoo_id   AS secundario_id,
                rp_sec.name                   AS secundario_nombre,
                COALESCE(rp_sec.vat, '')      AS secundario_vat,
                COALESCE(rp_sec.catalog_06_name, '') AS secundario_catalog_06_name,
                po.cuenta_partner_odoo_id     AS principal_id,
                rp_pri.name                   AS principal_nombre,
                po.nota,
                po.created_at,
                COALESCE(vs.v, 0)::float      AS ventas_sec,
                COALESCE(vp.v, 0)::float      AS ventas_pri,
                COUNT(*) OVER()               AS _total
            FROM crm.partner_principal_override po
            LEFT JOIN odoo.res_partner rp_sec
                ON rp_sec.odoo_id = po.contacto_partner_odoo_id AND rp_sec.company_key='GLOBAL'
            LEFT JOIN odoo.res_partner rp_pri
                ON rp_pri.odoo_id = po.cuenta_partner_odoo_id AND rp_pri.company_key='GLOBAL'
            LEFT JOIN ventas vs ON vs.pid = po.contacto_partner_odoo_id
            LEFT JOIN ventas vp ON vp.pid = po.cuenta_partner_odoo_id
            {where}
            ORDER BY po.created_at DESC
            LIMIT ${len(data_params) - 1} OFFSET ${len(data_params)}
            """,
            *data_params,
        )

    total = int(rows[0]["_total"]) if rows else 0
    items = []
    for r in rows:
        d = row_to_dict(r)
        d.pop("_total", None)
        items.append(d)
    return {"items": items, "total": total, "page": page, "limit": limit}


@router.get("/fusiones")
async def listar_fusiones(
    page: int = 1,
    limit: int = 50,
    min_reservas: int = 1,
    q: str = "",
    _user: dict = Depends(get_current_user),
):
    """Lista de pares de grupos candidatos a fusión.

    Cada fila representa un par (grupo_a, grupo_b) donde algún partner del
    grupo A hizo una reserva que terminó en alguien del grupo B (o viceversa).
    Excluye pares ya descartados en crm.vinculo_dismissed.
    """
    offset = (page - 1) * limit

    async with safe_acquire() as conn:
        rows = await conn.fetch(
            """
            WITH RECURSIVE GENERIC_IDS AS (SELECT unnest($1::int[]) AS id),
            pares AS (
              SELECT
                LEAST(po_res.partner_id, po_real.partner_id)    AS p1,
                GREATEST(po_res.partner_id, po_real.partner_id) AS p2,
                COUNT(*) AS n
              FROM odoo.pos_order po_res
              JOIN odoo.pos_order po_real ON po_real.odoo_id = po_res.reserva_use_id
              WHERE po_res.reserva = true AND po_res.reserva_use_id > 0
                AND po_res.partner_id IS NOT NULL AND po_real.partner_id IS NOT NULL
                AND po_res.partner_id <> po_real.partner_id
                AND po_res.partner_id NOT IN (SELECT id FROM GENERIC_IDS)
                AND po_real.partner_id NOT IN (SELECT id FROM GENERIC_IDS)
              GROUP BY 1, 2
            ),
            -- Resolución transitiva del principal final (sigue la cadena de overrides)
            principal_chain AS (
              SELECT p.id AS origen,
                COALESCE(po.cuenta_partner_odoo_id, vpam.cuenta_partner_id, p.id) AS destino,
                1 AS depth
              FROM (SELECT p1 AS id FROM pares UNION SELECT p2 FROM pares) p
              LEFT JOIN crm.partner_principal_override po ON po.contacto_partner_odoo_id = p.id
              LEFT JOIN odoo.v_partner_account_map vpam
                ON vpam.contacto_partner_id = p.id AND vpam.cuenta_partner_id <> p.id
              UNION ALL
              SELECT pc.origen, COALESCE(po2.cuenta_partner_odoo_id, vpam2.cuenta_partner_id, pc.destino),
                pc.depth + 1
              FROM principal_chain pc
              LEFT JOIN crm.partner_principal_override po2 ON po2.contacto_partner_odoo_id = pc.destino
              LEFT JOIN odoo.v_partner_account_map vpam2
                ON vpam2.contacto_partner_id = pc.destino AND vpam2.cuenta_partner_id <> pc.destino
              WHERE pc.depth < 10
                AND (po2.cuenta_partner_odoo_id IS NOT NULL
                     OR (vpam2.cuenta_partner_id IS NOT NULL AND vpam2.cuenta_partner_id <> pc.destino))
            ),
            final_principal AS (
              SELECT DISTINCT ON (origen) origen AS id, destino AS principal
              FROM principal_chain
              ORDER BY origen, depth DESC
            ),
            group_pairs AS (
              SELECT
                LEAST(fp1.principal, fp2.principal)    AS grupo_a,
                GREATEST(fp1.principal, fp2.principal) AS grupo_b,
                SUM(pb.n) AS reservas_compartidas
              FROM pares pb
              JOIN final_principal fp1 ON fp1.id = pb.p1
              JOIN final_principal fp2 ON fp2.id = pb.p2
              WHERE fp1.principal <> fp2.principal
              GROUP BY 1, 2
              HAVING SUM(pb.n) >= $2
            ),
            ventas AS (
              SELECT cuenta_partner_id AS pid, SUM(price_subtotal)::numeric(14,2) AS v
              FROM crm.mv_pos_line_cuenta GROUP BY cuenta_partner_id
            )
            SELECT
              gp.grupo_a,
              gp.grupo_b,
              gp.reservas_compartidas,
              rp_a.name                 AS name_a,
              rp_b.name                 AS name_b,
              COALESCE(rp_a.vat, '')    AS vat_a,
              COALESCE(rp_b.vat, '')    AS vat_b,
              COALESCE(rp_a.catalog_06_name, '') AS catalog_06_a,
              COALESCE(rp_b.catalog_06_name, '') AS catalog_06_b,
              -- Geográfico
              COALESCE(rp_a.state_name::text, '')    AS depto_a,
              COALESCE(rp_b.state_name::text, '')    AS depto_b,
              COALESCE(rp_a.district_name, '')       AS distrito_a,
              COALESCE(rp_b.district_name, '')       AS distrito_b,
              COALESCE(rp_a.street, '')              AS direccion_a,
              COALESCE(rp_b.street, '')              AS direccion_b,
              -- Contacto
              COALESCE(NULLIF(rp_a.phone, ''), NULLIF(rp_a.mobile::text, ''), '') AS telefono_a,
              COALESCE(NULLIF(rp_b.phone, ''), NULLIF(rp_b.mobile::text, ''), '') AS telefono_b,
              COALESCE(va.v, 0)::float  AS ventas_a,
              COALESCE(vb.v, 0)::float  AS ventas_b,
              (SELECT COUNT(*) FROM crm.v_cuenta_partners vcp
               JOIN crm.cuenta c ON c.id = vcp.cuenta_id
               WHERE c.cuenta_partner_odoo_id = gp.grupo_a
                 AND COALESCE(c.is_active, true) = true) AS miembros_a,
              (SELECT COUNT(*) FROM crm.v_cuenta_partners vcp
               JOIN crm.cuenta c ON c.id = vcp.cuenta_id
               WHERE c.cuenta_partner_odoo_id = gp.grupo_b
                 AND COALESCE(c.is_active, true) = true) AS miembros_b,
              -- Similitudes (booleans) para que el frontend pueda destacar coincidencias
              (LOWER(REGEXP_REPLACE(rp_a.name, '[^a-z]', '', 'gi'))
                 = LOWER(REGEXP_REPLACE(rp_b.name, '[^a-z]', '', 'gi'))) AS match_nombre,
              (rp_a.state_name = rp_b.state_name AND rp_a.state_name IS NOT NULL) AS match_depto,
              (rp_a.district_name = rp_b.district_name AND rp_a.district_name IS NOT NULL) AS match_distrito,
              (REGEXP_REPLACE(COALESCE(rp_a.phone, rp_a.mobile::text, ''), '[^0-9]', '', 'g')
                = REGEXP_REPLACE(COALESCE(rp_b.phone, rp_b.mobile::text, ''), '[^0-9]', '', 'g')
                AND REGEXP_REPLACE(COALESCE(rp_a.phone, rp_a.mobile::text, ''), '[^0-9]', '', 'g') <> '') AS match_telefono,
              -- Apellido (primera palabra del nombre)
              (split_part(rp_a.name, ' ', 1) = split_part(rp_b.name, ' ', 1)
                AND split_part(rp_a.name, ' ', 1) <> '') AS match_apellido,
              -- Compat con UI anterior
              CASE
                WHEN LOWER(REGEXP_REPLACE(rp_a.name, '[^a-z]', '', 'gi'))
                   = LOWER(REGEXP_REPLACE(rp_b.name, '[^a-z]', '', 'gi'))
                THEN 1.0
                ELSE 0.0
              END AS similitud_nombre,
              COUNT(*) OVER() AS _total
            FROM group_pairs gp
            LEFT JOIN odoo.res_partner rp_a
              ON rp_a.odoo_id = gp.grupo_a AND rp_a.company_key='GLOBAL'
            LEFT JOIN odoo.res_partner rp_b
              ON rp_b.odoo_id = gp.grupo_b AND rp_b.company_key='GLOBAL'
            LEFT JOIN ventas va ON va.pid = gp.grupo_a
            LEFT JOIN ventas vb ON vb.pid = gp.grupo_b
            WHERE NOT EXISTS (
              SELECT 1 FROM crm.vinculo_dismissed vd
              WHERE vd.partner_a = gp.grupo_a AND vd.partner_b = gp.grupo_b
            )
            -- EXCLUIR pares donde alguno de los grupos pertenece a cuenta inactiva
            -- (vendedora-proxy, basura, etc.) — no tiene sentido fusionar con ellas
            AND NOT EXISTS (
              SELECT 1 FROM crm.cuenta cu
              WHERE cu.cuenta_partner_odoo_id IN (gp.grupo_a, gp.grupo_b)
                AND (COALESCE(cu.is_active, true) = false
                  OR COALESCE(cu.manual_inactive, false) = true)
            )
            -- EXCLUIR pares cross-departamento (clientes en deptos distintos
            -- casi nunca son la misma persona — son errores de mostrador)
            -- Excepción: si nombres son IDÉNTICOS (typos), permitir
            AND (
              rp_a.state_name IS NULL OR rp_b.state_name IS NULL
              OR rp_a.state_name = rp_b.state_name
              OR LOWER(REGEXP_REPLACE(rp_a.name, '[^a-z]', '', 'gi'))
                 = LOWER(REGEXP_REPLACE(rp_b.name, '[^a-z]', '', 'gi'))
            )
            -- Filtro de búsqueda por nombre (sec o pri)
            AND ($5::text = '' OR rp_a.name ILIKE '%' || $5 || '%' OR rp_b.name ILIKE '%' || $5 || '%')
            ORDER BY similitud_nombre DESC, gp.reservas_compartidas DESC,
                     (COALESCE(va.v, 0) + COALESCE(vb.v, 0)) DESC
            LIMIT $3 OFFSET $4
            """,
            GENERIC_PARTNER_IDS, min_reservas, limit, offset, q or "",
        )

    total = int(rows[0]["_total"]) if rows else 0
    items = []
    for r in rows:
        d = row_to_dict(r)
        d.pop("_total", None)
        items.append(d)
    return {"items": items, "total": total, "page": page, "limit": limit}


class FusionarInput(BaseModel):
    grupo_a: int        # Principal del grupo A
    grupo_b: int        # Principal del grupo B
    ganador: int        # Cuál sobrevive como principal (debe ser grupo_a o grupo_b)


@router.post("/fusiones/aplicar")
async def aplicar_fusion(data: FusionarInput, user: dict = Depends(get_current_user)):
    """Fusiona dos grupos: el ganador absorbe al perdedor.

    Mueve TODOS los miembros del grupo perdedor → grupo ganador.
    Inactiva la cuenta standalone del perdedor.
    """
    _solo_admin(user)
    user_name = (user.get("username") if isinstance(user, dict) else None) or "system"

    if data.ganador not in (data.grupo_a, data.grupo_b):
        raise HTTPException(400, "ganador debe ser grupo_a o grupo_b")

    perdedor = data.grupo_b if data.ganador == data.grupo_a else data.grupo_a

    async with safe_acquire() as conn:
        async with conn.transaction():
            # 1. Asegurar que ambas cuentas existen en crm.cuenta
            await conn.execute("""
                INSERT INTO crm.cuenta (cuenta_partner_odoo_id, estado_comercial)
                VALUES ($1, 'ACTIVO') ON CONFLICT DO NOTHING
            """, data.ganador)

            # 2. Obtener todos los miembros activos del grupo perdedor
            miembros = await conn.fetch("""
                SELECT vcp.partner_id
                FROM crm.cuenta c
                JOIN crm.v_cuenta_partners vcp ON vcp.cuenta_id = c.id
                WHERE c.cuenta_partner_odoo_id = $1
                  AND COALESCE(c.is_active, true) = true
            """, perdedor)
            partner_ids = [r["partner_id"] for r in miembros]
            # Asegurar incluir el principal perdedor mismo
            if perdedor not in partner_ids:
                partner_ids.append(perdedor)

            # 3. Para cada miembro → override → ganador
            n_overrides = 0
            n_contactos = 0
            for pid in partner_ids:
                if pid == data.ganador:
                    continue  # no auto-link
                # Override
                r1 = await conn.execute("""
                    INSERT INTO crm.partner_principal_override
                      (contacto_partner_odoo_id, cuenta_partner_odoo_id, nota)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (contacto_partner_odoo_id) DO UPDATE
                      SET cuenta_partner_odoo_id = EXCLUDED.cuenta_partner_odoo_id,
                          nota = EXCLUDED.nota,
                          updated_at = now()
                """, pid, data.ganador, f"fusión manual: grupo {perdedor} → {data.ganador}")
                n_overrides += 1
                # Contacto
                r2 = await conn.execute("""
                    INSERT INTO crm.contacto (contacto_partner_odoo_id, cuenta_partner_odoo_id, rol)
                    VALUES ($1, $2, 'OTRO')
                    ON CONFLICT (contacto_partner_odoo_id) DO UPDATE
                      SET cuenta_partner_odoo_id = EXCLUDED.cuenta_partner_odoo_id,
                          updated_at = now()
                """, pid, data.ganador)
                n_contactos += 1

            # 4. Inactivar la cuenta standalone del perdedor
            await conn.execute("""
                UPDATE crm.cuenta
                SET is_active = false, manual_inactive = true,
                    inactive_reason = 'AUTO: fusionado al grupo de ' || $2,
                    inactive_at = now(), inactive_by = $3, updated_at = now()
                WHERE cuenta_partner_odoo_id = $1
                  AND COALESCE(is_active, true) = true
            """, perdedor, str(data.ganador), user_name)

            # 5. APLANAR CADENAS: si X → perdedor → ganador, actualizar X → ganador
            await conn.execute("""
                UPDATE crm.partner_principal_override
                SET cuenta_partner_odoo_id = $1, updated_at = now()
                WHERE cuenta_partner_odoo_id = $2
                  AND contacto_partner_odoo_id <> $1
            """, data.ganador, perdedor)
            await conn.execute("""
                UPDATE crm.contacto
                SET cuenta_partner_odoo_id = $1, updated_at = now()
                WHERE cuenta_partner_odoo_id = $2
                  AND contacto_partner_odoo_id <> $1
            """, data.ganador, perdedor)

    return {
        "ok": True,
        "ganador": data.ganador,
        "perdedor": perdedor,
        "miembros_movidos": len(partner_ids),
        "overrides_creados": n_overrides,
    }


class IgnorarFusionInput(BaseModel):
    grupo_a: int
    grupo_b: int
    motivo: Optional[str] = None


@router.post("/fusiones/ignorar")
async def ignorar_fusion(data: IgnorarFusionInput, user: dict = Depends(get_current_user)):
    """Marca un par como descartado para que no aparezca más en sugerencias."""
    _solo_admin(user)
    user_name = (user.get("username") if isinstance(user, dict) else None) or "system"

    pa = min(data.grupo_a, data.grupo_b)
    pb = max(data.grupo_a, data.grupo_b)

    async with safe_acquire() as conn:
        await conn.execute("""
            INSERT INTO crm.vinculo_dismissed (partner_a, partner_b, reason, dismissed_by)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (partner_a, partner_b) DO UPDATE
              SET reason = EXCLUDED.reason,
                  dismissed_at = now(),
                  dismissed_by = EXCLUDED.dismissed_by
        """, pa, pb, data.motivo, user_name)

    return {"ok": True, "dismissed": [pa, pb]}


@router.delete("/fusiones/ignorar")
async def quitar_ignorar(grupo_a: int, grupo_b: int, user: dict = Depends(get_current_user)):
    """Quita un par de los descartados (vuelve a aparecer en sugerencias)."""
    _solo_admin(user)
    pa = min(grupo_a, grupo_b)
    pb = max(grupo_a, grupo_b)
    async with safe_acquire() as conn:
        await conn.execute("""
            DELETE FROM crm.vinculo_dismissed WHERE partner_a = $1 AND partner_b = $2
        """, pa, pb)
    return {"ok": True}


async def _aplicar_bulk_helper(
    where_extra: str,
    nota_template: str,
    user_name: str,
) -> dict:
    """Helper interno: detecta pares según un filtro extra y aplica fusiones masivas."""
    async with safe_acquire() as conn:
        pairs = await conn.fetch(
            f"""
            WITH GENERIC_IDS AS (SELECT unnest($1::int[]) AS id),
            pares AS (
              SELECT LEAST(po_res.partner_id, po_real.partner_id) AS p1,
                GREATEST(po_res.partner_id, po_real.partner_id) AS p2, COUNT(*) AS n
              FROM odoo.pos_order po_res
              JOIN odoo.pos_order po_real ON po_real.odoo_id = po_res.reserva_use_id
              WHERE po_res.reserva = true AND po_res.reserva_use_id > 0
                AND po_res.partner_id IS NOT NULL AND po_real.partner_id IS NOT NULL
                AND po_res.partner_id <> po_real.partner_id
                AND po_res.partner_id NOT IN (SELECT id FROM GENERIC_IDS)
                AND po_real.partner_id NOT IN (SELECT id FROM GENERIC_IDS)
              GROUP BY 1, 2
            ),
            final_principal AS (
              SELECT p.id, COALESCE(po.cuenta_partner_odoo_id, vpam.cuenta_partner_id, p.id) AS principal
              FROM (SELECT p1 AS id FROM pares UNION SELECT p2 FROM pares) p
              LEFT JOIN crm.partner_principal_override po ON po.contacto_partner_odoo_id = p.id
              LEFT JOIN odoo.v_partner_account_map vpam ON vpam.contacto_partner_id = p.id AND vpam.cuenta_partner_id <> p.id
            ),
            group_pairs AS (
              SELECT LEAST(fp1.principal, fp2.principal) AS grupo_a,
                GREATEST(fp1.principal, fp2.principal) AS grupo_b, SUM(pb.n) AS n_reservas
              FROM pares pb
              JOIN final_principal fp1 ON fp1.id = pb.p1
              JOIN final_principal fp2 ON fp2.id = pb.p2
              WHERE fp1.principal <> fp2.principal
              GROUP BY 1, 2
            ),
            ventas AS (
              SELECT cuenta_partner_id AS pid, SUM(price_subtotal)::numeric(14,2) AS v
              FROM crm.mv_pos_line_cuenta GROUP BY cuenta_partner_id
            )
            SELECT gp.grupo_a, gp.grupo_b,
              CASE WHEN COALESCE(va.v,0) >= COALESCE(vb.v,0) THEN gp.grupo_a ELSE gp.grupo_b END AS ganador
            FROM group_pairs gp
            LEFT JOIN odoo.res_partner rp_a ON rp_a.odoo_id = gp.grupo_a AND rp_a.company_key='GLOBAL'
            LEFT JOIN odoo.res_partner rp_b ON rp_b.odoo_id = gp.grupo_b AND rp_b.company_key='GLOBAL'
            LEFT JOIN ventas va ON va.pid = gp.grupo_a
            LEFT JOIN ventas vb ON vb.pid = gp.grupo_b
            WHERE NOT EXISTS (
              SELECT 1 FROM crm.vinculo_dismissed vd
              WHERE vd.partner_a = gp.grupo_a AND vd.partner_b = gp.grupo_b
            )
            AND NOT EXISTS (
              SELECT 1 FROM crm.cuenta cu
              WHERE cu.cuenta_partner_odoo_id IN (gp.grupo_a, gp.grupo_b)
                AND (COALESCE(cu.is_active, true) = false OR COALESCE(cu.manual_inactive, false) = true)
            )
            AND ({where_extra})
            """,
            GENERIC_PARTNER_IDS,
        )

        fusionados = 0
        errores = 0
        for p in pairs:
            ganador = p["ganador"]
            perdedor = p["grupo_b"] if ganador == p["grupo_a"] else p["grupo_a"]
            try:
                async with conn.transaction():
                    await conn.execute("INSERT INTO crm.cuenta (cuenta_partner_odoo_id, estado_comercial) VALUES ($1, 'ACTIVO') ON CONFLICT DO NOTHING", ganador)
                    miembros = await conn.fetch(
                        "SELECT vcp.partner_id FROM crm.cuenta c JOIN crm.v_cuenta_partners vcp ON vcp.cuenta_id = c.id WHERE c.cuenta_partner_odoo_id = $1 AND COALESCE(c.is_active,true)=true",
                        perdedor,
                    )
                    pids = [r["partner_id"] for r in miembros]
                    if perdedor not in pids:
                        pids.append(perdedor)
                    for pid in pids:
                        if pid == ganador:
                            continue
                        await conn.execute(
                            "INSERT INTO crm.partner_principal_override (contacto_partner_odoo_id, cuenta_partner_odoo_id, nota) VALUES ($1, $2, $3) ON CONFLICT (contacto_partner_odoo_id) DO UPDATE SET cuenta_partner_odoo_id = EXCLUDED.cuenta_partner_odoo_id, nota = EXCLUDED.nota, updated_at = now()",
                            pid, ganador, nota_template.format(perdedor=perdedor, ganador=ganador),
                        )
                        await conn.execute(
                            "INSERT INTO crm.contacto (contacto_partner_odoo_id, cuenta_partner_odoo_id, rol) VALUES ($1, $2, 'OTRO') ON CONFLICT (contacto_partner_odoo_id) DO UPDATE SET cuenta_partner_odoo_id = EXCLUDED.cuenta_partner_odoo_id, updated_at = now()",
                            pid, ganador,
                        )
                    await conn.execute(
                        "UPDATE crm.cuenta SET is_active=false, manual_inactive=true, inactive_reason='AUTO: fusionado al grupo de ' || $2, inactive_at=now(), inactive_by=$3, updated_at=now() WHERE cuenta_partner_odoo_id=$1 AND COALESCE(is_active,true)=true",
                        perdedor, str(ganador), user_name,
                    )
                    # Aplanar cadenas
                    await conn.execute(
                        "UPDATE crm.partner_principal_override SET cuenta_partner_odoo_id=$1, updated_at=now() WHERE cuenta_partner_odoo_id=$2 AND contacto_partner_odoo_id<>$1",
                        ganador, perdedor,
                    )
                    await conn.execute(
                        "UPDATE crm.contacto SET cuenta_partner_odoo_id=$1, updated_at=now() WHERE cuenta_partner_odoo_id=$2 AND contacto_partner_odoo_id<>$1",
                        ganador, perdedor,
                    )
                fusionados += 1
            except Exception:
                errores += 1
    return {"ok": True, "fusionados": fusionados, "errores": errores, "total_detectados": len(pairs)}


@router.post("/fusiones/aplicar-bulk-mismo-telefono")
async def aplicar_bulk_mismo_telefono(user: dict = Depends(get_current_user)):
    """Aplica fusión automática a todos los pares donde el teléfono normalizado
    coincide entre los principales (mismo número aunque escrito distinto)."""
    _solo_admin(user)
    user_name = (user.get("username") if isinstance(user, dict) else None) or "system"
    where = """
        REGEXP_REPLACE(COALESCE(rp_a.phone, rp_a.mobile::text, ''), '[^0-9]', '', 'g')
          = REGEXP_REPLACE(COALESCE(rp_b.phone, rp_b.mobile::text, ''), '[^0-9]', '', 'g')
        AND REGEXP_REPLACE(COALESCE(rp_a.phone, rp_a.mobile::text, ''), '[^0-9]', '', 'g') <> ''
        AND LENGTH(REGEXP_REPLACE(COALESCE(rp_a.phone, rp_a.mobile::text, ''), '[^0-9]', '', 'g')) >= 7
    """
    return await _aplicar_bulk_helper(where, "bulk-fusion mismo-telefono: {perdedor} → {ganador}", user_name)


@router.post("/fusiones/aplicar-bulk-mismo-nombre")
async def aplicar_bulk_mismo_nombre(user: dict = Depends(get_current_user)):
    """Aplica automáticamente la sugerencia (destino con más ventas) a TODOS los
    pares con nombre normalizado idéntico — son fusiones casi seguras (typo del
    mismo cliente). Devuelve resumen."""
    _solo_admin(user)
    user_name = (user.get("username") if isinstance(user, dict) else None) or "system"

    async with safe_acquire() as conn:
        # Detectar pares mismo-nombre
        pairs = await conn.fetch(
            """
            WITH GENERIC_IDS AS (SELECT unnest($1::int[]) AS id),
            pares AS (
              SELECT LEAST(po_res.partner_id, po_real.partner_id) AS p1,
                GREATEST(po_res.partner_id, po_real.partner_id) AS p2, COUNT(*) AS n
              FROM odoo.pos_order po_res
              JOIN odoo.pos_order po_real ON po_real.odoo_id = po_res.reserva_use_id
              WHERE po_res.reserva = true AND po_res.reserva_use_id > 0
                AND po_res.partner_id IS NOT NULL AND po_real.partner_id IS NOT NULL
                AND po_res.partner_id <> po_real.partner_id
                AND po_res.partner_id NOT IN (SELECT id FROM GENERIC_IDS)
                AND po_real.partner_id NOT IN (SELECT id FROM GENERIC_IDS)
              GROUP BY 1, 2
            ),
            final_principal AS (
              SELECT p.id, COALESCE(po.cuenta_partner_odoo_id, vpam.cuenta_partner_id, p.id) AS principal
              FROM (SELECT p1 AS id FROM pares UNION SELECT p2 FROM pares) p
              LEFT JOIN crm.partner_principal_override po ON po.contacto_partner_odoo_id = p.id
              LEFT JOIN odoo.v_partner_account_map vpam ON vpam.contacto_partner_id = p.id AND vpam.cuenta_partner_id <> p.id
            ),
            group_pairs AS (
              SELECT LEAST(fp1.principal, fp2.principal) AS grupo_a,
                GREATEST(fp1.principal, fp2.principal) AS grupo_b,
                SUM(pb.n) AS n_reservas
              FROM pares pb
              JOIN final_principal fp1 ON fp1.id = pb.p1
              JOIN final_principal fp2 ON fp2.id = pb.p2
              WHERE fp1.principal <> fp2.principal
              GROUP BY 1, 2
            ),
            ventas AS (
              SELECT cuenta_partner_id AS pid, SUM(price_subtotal)::numeric(14,2) AS v
              FROM crm.mv_pos_line_cuenta GROUP BY cuenta_partner_id
            )
            SELECT gp.grupo_a, gp.grupo_b,
              CASE WHEN COALESCE(va.v,0) >= COALESCE(vb.v,0) THEN gp.grupo_a ELSE gp.grupo_b END AS ganador
            FROM group_pairs gp
            LEFT JOIN odoo.res_partner rp_a ON rp_a.odoo_id = gp.grupo_a AND rp_a.company_key='GLOBAL'
            LEFT JOIN odoo.res_partner rp_b ON rp_b.odoo_id = gp.grupo_b AND rp_b.company_key='GLOBAL'
            LEFT JOIN ventas va ON va.pid = gp.grupo_a
            LEFT JOIN ventas vb ON vb.pid = gp.grupo_b
            WHERE NOT EXISTS (
              SELECT 1 FROM crm.vinculo_dismissed vd
              WHERE vd.partner_a = gp.grupo_a AND vd.partner_b = gp.grupo_b
            )
            -- EXCLUIR pares donde alguno de los grupos pertenece a cuenta inactiva
            -- (vendedora-proxy, basura, etc.) — no tiene sentido fusionar con ellas
            AND NOT EXISTS (
              SELECT 1 FROM crm.cuenta cu
              WHERE cu.cuenta_partner_odoo_id IN (gp.grupo_a, gp.grupo_b)
                AND (COALESCE(cu.is_active, true) = false
                  OR COALESCE(cu.manual_inactive, false) = true)
            )
            -- Filtro clave: nombres normalizados idénticos
            AND LOWER(REGEXP_REPLACE(rp_a.name, '[^a-z]', '', 'gi')) = LOWER(REGEXP_REPLACE(rp_b.name, '[^a-z]', '', 'gi'))
            AND rp_a.name IS NOT NULL AND rp_b.name IS NOT NULL
            """,
            GENERIC_PARTNER_IDS,
        )

        # Aplicar cada fusión
        fusionados = 0
        errores = 0
        for p in pairs:
            ganador = p["ganador"]
            perdedor = p["grupo_b"] if ganador == p["grupo_a"] else p["grupo_a"]
            try:
                async with conn.transaction():
                    await conn.execute("""
                        INSERT INTO crm.cuenta (cuenta_partner_odoo_id, estado_comercial)
                        VALUES ($1, 'ACTIVO') ON CONFLICT DO NOTHING
                    """, ganador)
                    miembros = await conn.fetch("""
                        SELECT vcp.partner_id FROM crm.cuenta c
                        JOIN crm.v_cuenta_partners vcp ON vcp.cuenta_id = c.id
                        WHERE c.cuenta_partner_odoo_id = $1 AND COALESCE(c.is_active,true)=true
                    """, perdedor)
                    pids = [r["partner_id"] for r in miembros]
                    if perdedor not in pids:
                        pids.append(perdedor)
                    for pid in pids:
                        if pid == ganador:
                            continue
                        await conn.execute("""
                            INSERT INTO crm.partner_principal_override (contacto_partner_odoo_id, cuenta_partner_odoo_id, nota)
                            VALUES ($1, $2, $3)
                            ON CONFLICT (contacto_partner_odoo_id) DO UPDATE
                              SET cuenta_partner_odoo_id = EXCLUDED.cuenta_partner_odoo_id, nota = EXCLUDED.nota, updated_at = now()
                        """, pid, ganador, f"bulk-fusion mismo-nombre: {perdedor} → {ganador}")
                        await conn.execute("""
                            INSERT INTO crm.contacto (contacto_partner_odoo_id, cuenta_partner_odoo_id, rol)
                            VALUES ($1, $2, 'OTRO')
                            ON CONFLICT (contacto_partner_odoo_id) DO UPDATE
                              SET cuenta_partner_odoo_id = EXCLUDED.cuenta_partner_odoo_id, updated_at = now()
                        """, pid, ganador)
                    await conn.execute("""
                        UPDATE crm.cuenta SET is_active = false, manual_inactive = true,
                          inactive_reason = 'AUTO: fusionado al grupo de ' || $2,
                          inactive_at = now(), inactive_by = $3, updated_at = now()
                        WHERE cuenta_partner_odoo_id = $1 AND COALESCE(is_active, true) = true
                    """, perdedor, str(ganador), user_name)
                    # Aplanar cadenas: X → perdedor → ganador
                    await conn.execute("""
                        UPDATE crm.partner_principal_override
                        SET cuenta_partner_odoo_id = $1, updated_at = now()
                        WHERE cuenta_partner_odoo_id = $2 AND contacto_partner_odoo_id <> $1
                    """, ganador, perdedor)
                    await conn.execute("""
                        UPDATE crm.contacto
                        SET cuenta_partner_odoo_id = $1, updated_at = now()
                        WHERE cuenta_partner_odoo_id = $2 AND contacto_partner_odoo_id <> $1
                    """, ganador, perdedor)
                fusionados += 1
            except Exception:
                errores += 1

    return {"ok": True, "fusionados": fusionados, "errores": errores, "total_detectados": len(pairs)}
