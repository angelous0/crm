"""Gestión de cuentas CRM: directorio, ficha, ventas drill-down, créditos, interacciones, tareas."""
import calendar
import re
from datetime import date, datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from auth_utils import get_current_user
from db import safe_acquire
from helpers import row_to_dict

router = APIRouter(prefix="/api/cuentas")


# ── Modelos ────────────────────────────────────────────────────────────────────

class CuentaUpdateInput(BaseModel):
    estado_comercial: Optional[str] = None
    clasificacion: Optional[str] = None
    notas: Optional[str] = None
    asignado_a: Optional[str] = None
    # D4 v2: campos del perfil editable (sin email — el negocio usa WhatsApp)
    telefono_crm: Optional[str] = None
    whatsapp_crm: Optional[str] = None
    tipo_negocio: Optional[str] = None
    pais: Optional[str] = None              # 'PE' | 'BO'
    departamento: Optional[str] = None
    provincia: Optional[str] = None         # D5: nivel intermedio del UBIGEO
    distrito: Optional[str] = None
    direccion_crm: Optional[str] = None
    credito_linea: Optional[float] = None
    credito_usado: Optional[float] = None
    terminos_pago_dias: Optional[int] = None
    canal_preferido: Optional[str] = None
    foto_url: Optional[str] = None
    cliente_desde: Optional[str] = None     # ISO date YYYY-MM-DD
    # Override del flag mayorista de Odoo (NULL = use Odoo)
    mayorista: Optional[bool] = None


class ToggleActiveInput(BaseModel):
    is_active: bool
    reason: Optional[str] = None


class BatchToggleActiveInput(BaseModel):
    ids: list
    is_active: bool
    reason: Optional[str] = None


class VincularContactoInput(BaseModel):
    contacto_partner_odoo_id: int
    nota: Optional[str] = None
    rol: Optional[str] = None
    whatsapp: Optional[str] = None


class InteraccionInput(BaseModel):
    # contacto_id puede venir como UUID (legacy) o el frontend nuevo manda
    # contacto_partner_odoo_id (entero) y se resuelve aquí.
    contacto_id: Optional[str] = None
    contacto_partner_odoo_id: Optional[int] = None
    tipo: str
    resumen: str
    resultado: Optional[str] = None
    channel: Optional[str] = None
    outcome: Optional[str] = None
    happened_at: Optional[str] = None  # ISO8601


# Motivos canónicos para clasificación operativa de tareas (CRM-D9).
# Sincronizado con CHECK constraint en crm.tarea (startup_ddl.py) y con
# los chips del modal en NuevaTareaModal.jsx. NULL permitido para tareas
# heredadas; POST nuevo exige uno desde el frontend.
MOTIVOS_VALIDOS = frozenset({
    "COBRAR", "POST_VENTA", "SEGUIMIENTO",
    "VENDER", "RECUPERAR", "DEVOLVER_LLAMADA",
})


class TareaInput(BaseModel):
    contacto_id: Optional[str] = None
    contacto_partner_odoo_id: Optional[int] = None
    tipo: str
    due_at: str
    prioridad: Optional[int] = 3
    descripcion: str
    asignado_a: Optional[str] = None  # username; default a created_by
    motivo: Optional[str] = None      # CRM-D9: uno de MOTIVOS_VALIDOS o NULL


# ── SQL constants ──────────────────────────────────────────────────────────────
#
# IMPORTANTE: TODAS las queries de "venta real" del CRM consumen las vistas
# centralizadas `odoo.v_pos_order_real` y `odoo.v_pos_line_real`. Estas vistas
# ya aplican TODOS los filtros (canceladas, reservas, palabras prohibidas,
# anti-doble-conteo NV+Factura, productos basura, productos con estado='excluido').
# NO replicar filtros aquí — single source of truth en SQL.
# Ver odoo/backend/migration.py sección "H4) VISTAS REAL".
#
# Las vistas excluyen reservas; los endpoints que aceptan `doc_tipo=RESERVA`
# devuelven resultado vacío.
#
# Override: asigna el pedido al "dueño real" cuando hay reasignación manual desde el CRM.
_OVERRIDE_JOIN = (
    "LEFT JOIN crm.pos_order_partner_override ov_po"
    " ON ov_po.order_id = po.odoo_id AND ov_po.active = true"
)
_EFFECTIVE_PARTNER = "COALESCE(ov_po.new_owner_partner_id, po.partner_id)"

# Override para queries que parten de v_pos_line_real (alias `v`)
_OVERRIDE_JOIN_LINE = (
    "LEFT JOIN crm.pos_order_partner_override ov_po"
    " ON ov_po.order_id = v.order_id AND ov_po.active = true"
)
_EFFECTIVE_PARTNER_LINE = "COALESCE(ov_po.new_owner_partner_id, v.cuenta_partner_id)"

_TIENDA_JOIN = """LEFT JOIN odoo.stock_location sl_tienda
    ON sl_tienda.odoo_id = po.location_id AND sl_tienda.company_key = 'GLOBAL'
    AND sl_tienda.x_nombre IS NOT NULL AND btrim(sl_tienda.x_nombre) <> ''"""

_TIENDA_EXPR = """COALESCE(
    sl_tienda.x_nombre,
    CASE SPLIT_PART(po.name, '/', 1)
        WHEN 'BOSH GAMARRA' THEN 'BOOSH'
        WHEN 'G209'         THEN 'GM209'
        WHEN 'GaleriaAzul'  THEN 'AZUL'
        WHEN 'Gamarra207A'  THEN 'GM207'
        WHEN 'Grau 238'     THEN 'GR238'
        WHEN 'Grau238'      THEN 'GR238'
        WHEN 'Grau 555-'    THEN 'GR55'
        WHEN 'Sebastian Barranca 1556' THEN 'GM218'
        WHEN 'Venta Taller' THEN 'TALLER'
        WHEN 'Zapaton'      THEN 'ZAP'
        ELSE NULL
    END
) AS tienda"""


# ── Helpers internos ───────────────────────────────────────────────────────────

def _normalize_phone(raw: str) -> str:
    if not raw:
        return ""
    return re.sub(r"[^0-9]", "", str(raw))


def _apply_phone(row: dict) -> None:
    """Calcula phone_display y phone_whatsapp.

    Prioridad (gana el primero que tenga valor):
      1. crm_whatsapp (override CRM específico para WhatsApp)
      2. crm_telefono (override CRM para teléfono)
      3. rp.mobile (celular de Odoo)
      4. rp.phone  (fijo de Odoo)
      5. → "" → botón WhatsApp deshabilitado
    """
    crm_wa  = _normalize_phone(row.get("crm_whatsapp", ""))
    crm_tel = _normalize_phone(row.get("crm_telefono", ""))
    rp = _normalize_phone(row.get("raw_phone", ""))
    rm = _normalize_phone(row.get("raw_mobile", ""))

    # Si phone == mobile, no duplicar
    if rp and rm and rp == rm:
        rp = ""

    # Pick por prioridad
    if crm_wa:
        primary_norm    = crm_wa
        primary_display = str(row.get("crm_whatsapp", "")).strip()
    elif crm_tel:
        primary_norm    = crm_tel
        primary_display = str(row.get("crm_telefono", "")).strip()
    elif rm:
        primary_norm    = rm
        primary_display = str(row.get("raw_mobile", "")).strip()
    elif rp:
        primary_norm    = rp
        primary_display = str(row.get("raw_phone", "")).strip()
    else:
        row["phone_display"]  = ""
        row["phone_whatsapp"] = ""
        for k in ("raw_phone", "raw_mobile", "crm_telefono", "crm_whatsapp"):
            row.pop(k, None)
        return

    row["phone_display"] = primary_display
    wa = ""
    if len(primary_norm) == 9 and primary_norm[0] == "9":
        wa = f"51{primary_norm}"
    elif primary_norm.startswith("51") and len(primary_norm) >= 11:
        wa = primary_norm
    elif len(primary_norm) >= 10:
        wa = primary_norm
    row["phone_whatsapp"] = wa
    # Limpiar campos auxiliares (no se mandan al frontend)
    for k in ("raw_phone", "raw_mobile", "crm_telefono", "crm_whatsapp"):
        row.pop(k, None)


async def _get_cuenta_partner_ids(conn, cuenta_id: str) -> tuple[list, int]:
    """Garantiza que existe crm.cuenta; devuelve (partner_ids, odoo_id)."""
    odoo_id = int(cuenta_id)
    await conn.execute("""
        INSERT INTO crm.cuenta (cuenta_partner_odoo_id)
        VALUES ($1) ON CONFLICT (cuenta_partner_odoo_id) DO NOTHING
    """, odoo_id)
    cuenta_row = await conn.fetchrow(
        "SELECT id FROM crm.cuenta WHERE cuenta_partner_odoo_id = $1", odoo_id
    )
    if not cuenta_row:
        return [], odoo_id
    rows = await conn.fetch(
        "SELECT DISTINCT partner_id FROM crm.v_cuenta_partners WHERE cuenta_id = $1",
        cuenta_row["id"],
    )
    return [r["partner_id"] for r in rows], odoo_id


# ── Directorio ─────────────────────────────────────────────────────────────────

@router.get("")
async def get_cuentas(
    estado: str = "",
    clasificacion: str = "",
    asignado: str = "",
    search: str = "",
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    _user: dict = Depends(get_current_user),
):
    """Lista básica de cuentas libres (principal = self)."""
    async with safe_acquire() as conn:
        offset = (page - 1) * limit
        where = "WHERE 1=1"
        params: list = []

        if estado:
            params.append(estado)
            where += f" AND cu.estado_comercial = ${len(params)}"
        if clasificacion:
            params.append(clasificacion)
            where += f" AND cu.clasificacion = ${len(params)}"
        if asignado:
            params.append(f"%{asignado}%")
            where += f" AND cu.asignado_a ILIKE ${len(params)}"
        if search:
            params.append(f"%{search}%")
            idx = len(params)
            where += (
                f" AND (rp.name ILIKE ${idx}"
                f" OR COALESCE(rp.vat,'') ILIKE ${idx}"
                f" OR COALESCE(cu.asignado_a,'') ILIKE ${idx})"
            )

        base_from = """
            FROM crm.v_cuentas_libres cl
            JOIN odoo.res_partner rp
              ON rp.odoo_id = cl.cuenta_partner_odoo_id AND rp.company_key = 'GLOBAL'
            LEFT JOIN crm.cuenta cu
              ON cu.cuenta_partner_odoo_id = cl.cuenta_partner_odoo_id
        """

        # Count + data en un solo round-trip con COUNT(*) OVER() — ahorra ~85ms.
        data_params = params + [limit, offset]
        rows = await conn.fetch(
            f"""SELECT
                cl.cuenta_partner_odoo_id,
                rp.name                              AS partner_nombre,
                COALESCE(rp.vat, '')                 AS partner_vat,
                COALESCE(rp.phone::text, '')         AS partner_phone,
                COALESCE(rp.mobile::text, '')        AS partner_mobile,
                COALESCE(rp.city::text, '')          AS partner_city,
                cu.id                                AS cuenta_id,
                COALESCE(cu.estado_comercial, 'ACTIVO') AS estado_comercial,
                cu.clasificacion,
                cu.asignado_a,
                cu.notas,
                COUNT(*) OVER()                      AS _total
            {base_from}
            {where}
            ORDER BY rp.name
            LIMIT ${len(data_params) - 1} OFFSET ${len(data_params)}""",
            *data_params,
        )

        count = int(rows[0]["_total"]) if rows else 0
        items = [row_to_dict(r) for r in rows]
        for it in items:
            it.pop("_total", None)
        return {"items": items, "total": count, "page": page}


@router.get("/list")
async def get_cuentas_list(
    q: str = "",
    estado: str = "",
    clasificacion: str = "",
    ciudad: str = "",
    asignado: str = "",
    tienda: str = "",
    estado_auto: str = "",
    tier: str = "",
    motivo: str = "",   # CRM-D9: filtra cuentas con ≥1 tarea PENDIENTE de este motivo
    sort: str = "name",
    dir: str = "asc",
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    include_inactive: bool = False,
    approval_status: str = "APPROVED",
    _user: dict = Depends(get_current_user),
):
    """Directorio estilo Airtable con KPIs, teléfono normalizado y %YTD.

    Sprint CRM-D3: añade JOIN con crm.mv_cuenta_estado para devolver
    estado_auto/tier/prioridad_score/recencia_dias/ltv_12m/freq_dias_estimada
    en cada fila + filtros multi-valor `estado_auto` y `tier` (CSV).
    """
    async with safe_acquire() as conn:
        offset = (page - 1) * limit
        where = "WHERE 1=1"
        params: list = []

        if approval_status:
            params.append(approval_status)
            where += f" AND COALESCE(cu.approval_status, 'APPROVED') = ${len(params)}"
        if not include_inactive:
            where += " AND COALESCE(cu.is_active, true) = true"
        if q:
            params.append(f"%{q}%")
            idx = len(params)
            where += (
                f" AND (rp.name ILIKE ${idx}"
                f" OR COALESCE(rp.vat,'') ILIKE ${idx}"
                f" OR COALESCE(rp.phone::text,'') ILIKE ${idx}"
                f" OR COALESCE(rp.mobile::text,'') ILIKE ${idx}"
                f" OR COALESCE(rp.state_name::text,'') ILIKE ${idx})"
            )
        if estado:
            params.append(estado)
            where += f" AND COALESCE(cu.estado_comercial, 'ACTIVO') = ${len(params)}"
        if clasificacion:
            params.append(clasificacion)
            where += f" AND cu.clasificacion = ${len(params)}"
        if ciudad:
            # Normalización de departamento: el frontend puede mandar
            # "Huánuco" (Title Case con tilde) o "HUANUCO" (UPPER sin tilde).
            # Removemos tildes y comparamos UPPER de ambos lados para
            # matchear independientemente del formato.
            import unicodedata
            ciudad_norm = "".join(
                c for c in unicodedata.normalize("NFD", ciudad)
                if unicodedata.category(c) != "Mn"
            ).upper().strip()
            params.append(f"%{ciudad_norm}%")
            # Compara contra UPPER sin tildes en ambos campos (Odoo
            # devuelve generalmente UPPER sin tilde; cu.departamento puede
            # venir en cualquier formato).
            where += (
                f" AND ("
                f"   UPPER(translate(COALESCE(cu.departamento, ''), 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')) ILIKE ${len(params)}"
                f"   OR UPPER(translate(COALESCE(rp.state_name::text, ''), 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')) ILIKE ${len(params)}"
                f" )"
            )
        if asignado:
            params.append(f"%{asignado}%")
            where += f" AND cu.asignado_a ILIKE ${len(params)}"
        if tienda:
            if tienda == "Sin tienda":
                where += " AND k.tienda IS NULL"
            else:
                params.append(tienda)
                where += f" AND k.tienda = ${len(params)}"

        # Sprint D3: filtros multi-valor por estado_auto y tier (CSV).
        # Acepta 'vip,en_riesgo' o 'oro,plata'. Vacío = sin filtro.
        if estado_auto:
            estados_list = [e.strip() for e in estado_auto.split(",") if e.strip()]
            if estados_list:
                params.append(estados_list)
                where += f" AND mvce.estado_auto = ANY(${len(params)})"
        if tier:
            tiers_list = [t.strip() for t in tier.split(",") if t.strip()]
            if tiers_list:
                params.append(tiers_list)
                where += f" AND mvce.tier = ANY(${len(params)})"

        # CRM-D9: filtro por motivo de tarea pendiente (single-select).
        # Valida contra MOTIVOS_VALIDOS; valor inválido → 400.
        # CRM-D11 (fix performance): IN subquery sobre cl.cuenta_partner_odoo_id
        # en lugar de EXISTS por fila. Así el planner materializa los 26 partner_id
        # candidatos UNA VEZ y reduce los LATERAL de 4319 → 26 iteraciones.
        # De ~3.1s a ~150ms con motivo=COBRAR.
        if motivo:
            motivo_norm = motivo.strip().upper()
            if motivo_norm not in MOTIVOS_VALIDOS:
                raise HTTPException(400, f"motivo inválido: '{motivo_norm}'. Permitidos: {sorted(MOTIVOS_VALIDOS)}")
            params.append(motivo_norm)
            where += (
                f" AND cl.cuenta_partner_odoo_id IN ("
                f"   SELECT cu2.cuenta_partner_odoo_id FROM crm.cuenta cu2 "
                f"   JOIN crm.tarea tm ON tm.cuenta_id = cu2.id "
                f"   WHERE tm.status = 'PENDIENTE' AND tm.motivo = ${len(params)}"
                f")"
            )

        base_from = """
            FROM crm.v_cuentas_libres cl
            JOIN odoo.res_partner rp
              ON rp.odoo_id = cl.cuenta_partner_odoo_id AND rp.company_key = 'GLOBAL'
            LEFT JOIN crm.cuenta cu
              ON cu.cuenta_partner_odoo_id = cl.cuenta_partner_odoo_id
            LEFT JOIN crm.mv_cuenta_sales_kpi k
              ON k.cuenta_id = cl.cuenta_partner_odoo_id
            LEFT JOIN crm.mv_cuenta_estado mvce
              ON mvce.cuenta_partner_odoo_id = cl.cuenta_partner_odoo_id
            -- CRM-D9: dos LATERAL distintos sobre crm.tarea ─────────────────
            -- (a) pt = tarea que se MUESTRA en la celda "Próx. tarea".
            --     Prioriza motivo=COBRAR para que las cobranzas no queden
            --     escondidas detrás de seguimientos vencidos. Tie-break:
            --     due_at ASC, luego prioridad ASC.
            LEFT JOIN LATERAL (
                SELECT id, descripcion, due_at, prioridad, motivo
                FROM crm.tarea
                WHERE cuenta_id = cu.id AND status = 'PENDIENTE'
                ORDER BY
                    (CASE WHEN motivo = 'COBRAR' THEN 0 ELSE 1 END) ASC,
                    due_at ASC,
                    prioridad ASC
                LIMIT 1
            ) pt ON true
            -- (b) pto = due_at MÍNIMO de TODAS las tareas pendientes (sin
            --     priorizar motivo) → usado SOLO para el ORDER BY global.
            --     Así una cuenta con tarea vencida sube al tope aunque pt
            --     muestre una COBRAR futura. Si no tiene tareas, NULL → fin.
            LEFT JOIN LATERAL (
                SELECT MIN(due_at) AS orden_due_at
                FROM crm.tarea
                WHERE cuenta_id = cu.id AND status = 'PENDIENTE'
            ) pto ON true
        """

        sort_map = {
            "name":          "CASE WHEN rp.name IS NULL OR btrim(rp.name) = '' THEN 1 ELSE 0 END, rp.name",
            "depto":         "COALESCE(NULLIF(cu.departamento, ''), rp.state_name::text)",
            "last_purchase": "k.last_purchase_date",
            "qty_12m":       "k.qty_12m",
            "orders_12m":    "k.orders_12m",
            "qty_total":     "k.qty_total",
            "orders_total":  "k.orders_total",
            "pct_ytd":       "pct_vs_avg_ytd",
            "tienda":        "k.tienda",
            # Nuevos sorts D3
            "prioridad":     "mvce.prioridad_score",
            "ltv_12m":       "mvce.amount_12m",
            "tier":          "CASE mvce.tier WHEN 'estrella' THEN 1 WHEN 'alto' THEN 2 WHEN 'medio' THEN 3 WHEN 'bajo' THEN 4 ELSE 5 END",
            "estado_auto":   "mvce.estado_auto",
            # CRM-D9: sort global usa pto (due_at mínimo SIN priorizar motivo).
            # Así una cuenta con tarea vencida sube al tope aunque la celda
            # muestre una COBRAR futura (pt) por la regla de prioridad. NULLS
            # LAST forzado abajo para mandar cuentas sin tarea al final.
            "proxima_tarea": "pto.orden_due_at",
        }
        order_col = sort_map.get(sort, "rp.name")
        order_dir = "ASC" if dir.lower() == "asc" else "DESC"
        nulls = "NULLS LAST" if order_dir == "DESC" else "NULLS FIRST"
        # Override: para "proxima_tarea" siempre queremos que las cuentas
        # SIN tarea (NULL) caigan al final, sin importar la dirección.
        # En ASC: vencidas (due_at más antiguo) primero → hoy → futuras → sin tarea.
        # En DESC: futuras lejanas primero → hoy → vencidas → sin tarea.
        if sort == "proxima_tarea":
            nulls = "NULLS LAST"

        # Optimización: una sola query con COUNT(*) OVER() en lugar de
        # COUNT separado + SELECT. Ahorra un round-trip de ~85ms al DB remoto
        # (Hostinger). 4.7× más rápido en pruebas (876ms → 183ms).
        data_params = params + [limit, offset]
        rows = await conn.fetch(
            f"""SELECT
                cl.cuenta_partner_odoo_id                     AS id,
                rp.name                                        AS nombre,
                -- Sprint D4: si el usuario editó el perfil y guardó un departamento,
                -- gana ese override; si no, fallback al state_name de Odoo.
                COALESCE(NULLIF(cu.departamento, ''), rp.state_name::text, '') AS depto_name,
                -- D5: distrito y provincia ganan override CRM, sino UBIGEO de Odoo
                COALESCE(NULLIF(cu.distrito, ''), rp.district_name) AS distrito,
                COALESCE(NULLIF(cu.provincia, ''), rp.province_name) AS provincia,
                -- Override CRM (cu.pais 'PE'/'BO') gana sobre Odoo
                COALESCE(
                    CASE cu.pais WHEN 'BO' THEN 'Bolivia' WHEN 'PE' THEN 'Peru' END,
                    rp.country_name
                )                                              AS pais_nombre,
                COALESCE(cu.estado_comercial, 'ACTIVO')        AS estado,
                COALESCE(cu.is_active, true)                   AS is_active,
                COALESCE(rp.phone::text, '')                   AS raw_phone,
                COALESCE(rp.mobile::text, '')                  AS raw_mobile,
                -- Overrides CRM (ganan sobre Odoo en _apply_phone)
                COALESCE(cu.telefono_crm, '')                  AS crm_telefono,
                COALESCE(cu.whatsapp_crm, '')                  AS crm_whatsapp,
                k.last_purchase_date,
                COALESCE(k.qty_12m, 0)::bigint                 AS qty_12m,
                COALESCE(k.orders_12m, 0)::bigint              AS orders_12m,
                COALESCE(k.qty_total, 0)::bigint               AS qty_total,
                COALESCE(k.orders_total, 0)::bigint            AS orders_total,
                CASE WHEN (COALESCE(k.qty_ytd_p1, 0) + COALESCE(k.qty_ytd_p2, 0)) > 0
                     THEN (COALESCE(k.qty_ytd_cur, 0)::float
                           / ((COALESCE(k.qty_ytd_p1, 0) + COALESCE(k.qty_ytd_p2, 0))::float / 2.0)) - 1.0
                     ELSE NULL END                             AS pct_vs_avg_ytd,
                k.tienda,
                -- Sprint D3: campos del matview de estado
                mvce.estado_auto,
                mvce.tier,
                mvce.prioridad_score::float                    AS prioridad_score,
                mvce.recencia_dias,
                mvce.amount_12m::float                         AS ltv_12m,
                mvce.freq_dias_estimada::float                 AS freq_dias_estimada,
                -- Próxima tarea pendiente — CELDA (CRM-D8 + D9 motivo)
                pt.id                                          AS pt_id,
                pt.descripcion                                 AS pt_descripcion,
                pt.due_at                                      AS pt_due_at,
                pt.prioridad                                   AS pt_prioridad,
                pt.motivo                                      AS pt_motivo,
                -- due_at mínimo de TODAS las pendientes (sort global, CRM-D9)
                pto.orden_due_at                               AS pt_orden_due_at,
                COUNT(*) OVER()                                AS _total_rows
            {base_from}
            {where}
            ORDER BY {order_col} {order_dir} {nulls}
            LIMIT ${len(data_params) - 1} OFFSET ${len(data_params)}""",
            *data_params,
        )

        count = int(rows[0]["_total_rows"]) if rows else 0
        result = [row_to_dict(r) for r in rows]
        for r in result:
            r.pop("_total_rows", None)
            if r.get("pct_vs_avg_ytd") is not None:
                r["pct_vs_avg_ytd"] = round(r["pct_vs_avg_ytd"], 4)
            _apply_phone(r)
            # Compactar pt_* en un objeto proxima_tarea (o null).
            # row_to_dict ya convirtió datetime→ISO string, así que pt_due es str.
            # Frontend calcula dias_relativos comparando due_at con new Date() local.
            pt_id = r.pop("pt_id", None)
            pt_desc = r.pop("pt_descripcion", None)
            pt_due = r.pop("pt_due_at", None)
            pt_pri = r.pop("pt_prioridad", None)
            pt_motivo = r.pop("pt_motivo", None)
            # pt_orden_due_at: due_at mínimo SIN priorizar motivo. Sirve para
            # debug/auditoría (sort global ya usa este campo en SQL). El
            # frontend no lo necesita pero lo exponemos por transparencia.
            pt_orden = r.pop("pt_orden_due_at", None)
            r["proxima_tarea"] = {
                "id": str(pt_id),
                "descripcion": pt_desc or "",
                "due_at": pt_due,           # ya es ISO string (o None)
                "prioridad": pt_pri,
                "motivo": pt_motivo,        # CRM-D9: 'COBRAR'/'POST_VENTA'/.../None
            } if pt_id else None
            r["proxima_tarea_orden_due_at"] = pt_orden

        return {"rows": result, "total_rows": count, "page": page, "limit": limit}


@router.delete("/{cuenta_id}/desvincular")
async def desvincular_cuenta(
    cuenta_id: str,
    _user: dict = Depends(get_current_user),
):
    """Desvincula un partner del principal al que apuntaba.

    Elimina:
      • crm.partner_principal_override (la "magia" que redirige ventas)
      • crm.contacto (el registro de contacto)
    Y reactiva la cuenta standalone si estaba inactivada por auto-vinculación.
    """
    partner_id = int(cuenta_id)
    async with safe_acquire() as conn:
        existe = await conn.fetchval(
            "SELECT 1 FROM crm.partner_principal_override WHERE contacto_partner_odoo_id = $1",
            partner_id,
        )
        if not existe:
            raise HTTPException(404, "Este partner no tiene override registrado")

        await conn.execute(
            "DELETE FROM crm.partner_principal_override WHERE contacto_partner_odoo_id = $1",
            partner_id,
        )
        await conn.execute(
            "DELETE FROM crm.contacto WHERE contacto_partner_odoo_id = $1",
            partner_id,
        )
        # Reactivar la cuenta si fue inactivada por auto-vinculación
        await conn.execute(
            """UPDATE crm.cuenta
               SET is_active = true, manual_inactive = false,
                   inactive_reason = NULL, inactive_at = NULL, inactive_by = NULL,
                   updated_at = now()
               WHERE cuenta_partner_odoo_id = $1
                 AND inactive_reason = 'AUTO: vinculado como secundario a otra cuenta'""",
            partner_id,
        )
    return {"ok": True, "desvinculado": partner_id}


@router.get("/vinculadas")
async def get_cuentas_vinculadas(
    q: str = "",
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    sort: str = "name",
    dir: str = "asc",
    fuente: str = "",  # 'override' | 'odoo_map' | '' (todas)
    _user: dict = Depends(get_current_user),
):
    """Lista de cuentas SECUNDARIAS (vinculadas a otro principal).

    Incluye ambas fuentes de vinculación:
      • `override`: crm.partner_principal_override (manual o auto-batch)
      • `odoo_map`: odoo.v_partner_account_map (consolidación nativa Odoo)

    Cada fila trae el partner secundario + el principal al que apunta.
    """
    async with safe_acquire() as conn:
        offset = (page - 1) * limit
        params: list = []
        where_filters = ["rp.company_key = 'GLOBAL'", "COALESCE(rp.active, true) = true"]

        if q:
            params.append(f"%{q}%")
            idx = len(params)
            where_filters.append(
                f"(rp.name ILIKE ${idx}"
                f" OR rp_pri.name ILIKE ${idx}"
                f" OR COALESCE(rp.vat,'') ILIKE ${idx}"
                f" OR COALESCE(rp.phone::text,'') ILIKE ${idx})"
            )

        if fuente == "override":
            where_filters.append("po.contacto_partner_odoo_id IS NOT NULL")
        elif fuente == "odoo_map":
            where_filters.append("po.contacto_partner_odoo_id IS NULL AND vpam.contacto_partner_id IS NOT NULL")

        where_sql = " AND ".join(where_filters)

        sort_map = {
            "name":         "rp.name",
            "principal":    "rp_pri.name",
            "ventas_sec":   "ventas_sec",
            "ventas_pri":   "ventas_pri",
            "fuente":       "fuente",
        }
        order_col = sort_map.get(sort, "rp.name")
        order_dir = "ASC" if dir.lower() == "asc" else "DESC"

        # Subquery: partners que son secundarios (apuntan a otra cuenta)
        data_params = params + [limit, offset]
        rows = await conn.fetch(
            f"""
            WITH ventas AS (
                SELECT cuenta_partner_id AS pid, SUM(price_subtotal)::numeric(14,2) AS v
                FROM crm.mv_pos_line_cuenta GROUP BY cuenta_partner_id
            )
            SELECT
                rp.odoo_id                    AS secundario_id,
                rp.name                       AS secundario_nombre,
                COALESCE(rp.vat, '')          AS vat,
                COALESCE(rp.catalog_06_name, '') AS catalog_06_name,
                COALESCE(rp.phone::text, '')  AS raw_phone,
                COALESCE(rp.mobile::text, '') AS raw_mobile,
                COALESCE(rp.state_name::text, '') AS depto,
                COALESCE(po.cuenta_partner_odoo_id, vpam.cuenta_partner_id) AS principal_id,
                rp_pri.name                   AS principal_nombre,
                CASE
                    WHEN po.contacto_partner_odoo_id IS NOT NULL THEN 'override'
                    WHEN vpam.contacto_partner_id IS NOT NULL THEN 'odoo_map'
                    ELSE 'otro'
                END                           AS fuente,
                po.nota                       AS nota_override,
                COALESCE(vs.v, 0)::float      AS ventas_sec,
                COALESCE(vp.v, 0)::float      AS ventas_pri,
                COUNT(*) OVER()               AS _total_rows
            FROM odoo.res_partner rp
            LEFT JOIN crm.partner_principal_override po
                ON po.contacto_partner_odoo_id = rp.odoo_id
            LEFT JOIN odoo.v_partner_account_map vpam
                ON vpam.contacto_partner_id = rp.odoo_id
                AND vpam.cuenta_partner_id <> rp.odoo_id
            LEFT JOIN odoo.res_partner rp_pri
                ON rp_pri.odoo_id = COALESCE(po.cuenta_partner_odoo_id, vpam.cuenta_partner_id)
                AND rp_pri.company_key = 'GLOBAL'
            LEFT JOIN ventas vs ON vs.pid = rp.odoo_id
            LEFT JOIN ventas vp ON vp.pid = COALESCE(po.cuenta_partner_odoo_id, vpam.cuenta_partner_id)
            WHERE {where_sql}
              -- Secundario = está vinculado a OTRO partner (no a sí mismo)
              AND (
                (po.contacto_partner_odoo_id IS NOT NULL AND po.cuenta_partner_odoo_id <> rp.odoo_id)
                OR (vpam.contacto_partner_id IS NOT NULL AND vpam.cuenta_partner_id <> rp.odoo_id)
              )
            ORDER BY {order_col} {order_dir} NULLS LAST
            LIMIT ${len(data_params) - 1} OFFSET ${len(data_params)}
            """,
            *data_params,
        )

    count = int(rows[0]["_total_rows"]) if rows else 0
    result = []
    for r in rows:
        d = row_to_dict(r)
        d.pop("_total_rows", None)
        _apply_phone(d)
        result.append(d)
    return {"rows": result, "total_rows": count, "page": page, "limit": limit}


@router.get("/admin/deptos-no-canonicos")
async def get_deptos_no_canonicos(
    limit_samples: int = Query(5, ge=1, le=50),
    _user: dict = Depends(get_current_user),
):
    """Diagnóstico de departamentos no canónicos.

    Lista valores crudos de `state_name` (Odoo) o `cu.departamento` (CRM) que
    NO matchean con la lista canónica del país (PE/BO + aliases conocidos).

    Útil para descubrir typos masivos en Odoo, valores raros (ej. "Tacna -
    Tarata"), o nuevos deptos que conviene agregar al diccionario de aliases.

    Mantén en sync el diccionario:
      - JS: crm/frontend/src/components/cuentas/perfil-options.js _ALIASES
      - PY: crm/backend/utils/depto_normalize.py _ALIASES
    """
    from utils.depto_normalize import normalize_depto, suggest_split

    async with safe_acquire() as conn:
        rows = await conn.fetch("""
            SELECT
                COALESCE(NULLIF(cu.departamento, ''), rp.state_name::text) AS depto_raw,
                COALESCE(cu.pais, 'PE') AS pais,
                rp.odoo_id AS partner_id,
                rp.name AS partner_name
            FROM crm.v_cuentas_libres cl
            JOIN odoo.res_partner rp
              ON rp.odoo_id = cl.cuenta_partner_odoo_id AND rp.company_key = 'GLOBAL'
            LEFT JOIN crm.cuenta cu
              ON cu.cuenta_partner_odoo_id = cl.cuenta_partner_odoo_id
            WHERE COALESCE(cu.departamento, rp.state_name::text, '') <> ''
        """)

    # Agrupar valores no-canónicos
    grupos: dict = {}
    canon_count = 0
    for r in rows:
        raw = r["depto_raw"]
        pais = r["pais"] or "PE"
        if normalize_depto(raw, pais):
            canon_count += 1
            continue
        key = (raw, pais)
        if key not in grupos:
            sug = suggest_split(raw, pais)
            grupos[key] = {
                "depto_raw": raw,
                "pais": pais,
                "cuentas_count": 0,
                "samples": [],
                # Sugerencia para corregir: dónde poner cada cosa
                "sugerencia": sug,
            }
        grupos[key]["cuentas_count"] += 1
        if len(grupos[key]["samples"]) < limit_samples:
            grupos[key]["samples"].append({
                "partner_id": r["partner_id"],
                "partner_name": r["partner_name"],
            })

    # Ordenar: primero los que tienen sugerencia clara, luego por #cuentas
    items = sorted(
        grupos.values(),
        key=lambda g: (
            0 if g["sugerencia"]["confianza"] == "alta" else 1,
            -g["cuentas_count"],
        ),
    )
    total_no_canon = sum(g["cuentas_count"] for g in items)
    auto_fixable = sum(g["cuentas_count"] for g in items
                       if g["sugerencia"]["confianza"] == "alta")

    return {
        "total_con_depto": canon_count + total_no_canon,
        "canonicos": canon_count,
        "no_canonicos": total_no_canon,
        "auto_fixable": auto_fixable,
        "items": items,
    }


@router.post("/admin/fix-depto")
async def fix_cuenta_depto(
    request: dict,
    _user: dict = Depends(get_current_user),
):
    """Aplica una corrección de departamento sugerida por el diagnóstico.

    Body:
        {
            "partner_id": 1234,
            "departamento": "La Libertad",   # nuevo depto canónico
            "distrito":     "Trujillo",      # opcional: distrito sugerido
            "pais":         "PE"             # opcional: cambiar país también
        }

    Se aplica como override en `crm.cuenta` (no toca Odoo). Si el cuenta CRM
    no existe, se crea.
    """
    from utils.depto_normalize import normalize_depto

    partner_id = request.get("partner_id")
    depto_nuevo = (request.get("departamento") or "").strip()
    distrito_nuevo = (request.get("distrito") or "").strip() or None
    pais_nuevo = (request.get("pais") or "").strip() or None

    if not partner_id:
        return {"ok": False, "error": "partner_id requerido"}
    if depto_nuevo and not normalize_depto(depto_nuevo, pais_nuevo or "PE"):
        return {"ok": False, "error": f"'{depto_nuevo}' no es canónico"}

    async with safe_acquire() as conn:
        await conn.execute("""
            INSERT INTO crm.cuenta (cuenta_partner_odoo_id)
            VALUES ($1) ON CONFLICT DO NOTHING
        """, int(partner_id))

        # Construir UPDATE dinámico
        sets = []
        vals = []
        if depto_nuevo:
            vals.append(depto_nuevo)
            sets.append(f"departamento = ${len(vals)}")
        if distrito_nuevo is not None:
            vals.append(distrito_nuevo)
            sets.append(f"distrito = ${len(vals)}")
        if pais_nuevo:
            vals.append(pais_nuevo)
            sets.append(f"pais = ${len(vals)}")

        if not sets:
            return {"ok": False, "error": "ningún cambio especificado"}

        vals.append(int(partner_id))
        await conn.execute(
            f"UPDATE crm.cuenta SET {', '.join(sets)}, updated_at = NOW() "
            f"WHERE cuenta_partner_odoo_id = ${len(vals)}",
            *vals,
        )

    return {
        "ok": True,
        "partner_id": int(partner_id),
        "departamento": depto_nuevo or None,
        "distrito": distrito_nuevo,
        "pais": pais_nuevo,
    }


@router.get("/ventas-en-vivo")
async def get_ventas_en_vivo(
    horas: int = Query(2, ge=1, le=24),
    _user: dict = Depends(get_current_user),
):
    """Ventas POS recientes con flags de alerta para seguimiento en vivo.

    Pensado para una vista que la vendedora deja abierta en una pestaña
    mientras atiende POS. Cada N segundos refresca y detecta:

    - cliente_nuevo: partner creado hace <30d
    - falta_telefono: ni phone ni mobile
    - falta_departamento: state_name vacío o no canónico
    - tiene_credito_pendiente: saldo > 0 en account_invoice_credit
    - tiene_reservas: reservas pendientes (sin concretar)

    Solo devuelve ventas REALES (no canceladas, no reservas), de las últimas
    `horas` horas. Ordenado por fecha DESC.
    """
    from utils.depto_normalize import normalize_depto

    async with safe_acquire() as conn:
        rows = await conn.fetch("""
            SELECT
                po.odoo_id          AS order_id,
                po.name             AS order_name,
                po.date_order,
                po.amount_total,
                po.tipo_comp,
                po.num_comp,
                po.company_key      AS empresa,
                po.partner_id,
                rp.name             AS partner_name,
                rp.phone            AS phone,
                rp.mobile           AS mobile,
                rp.state_name       AS state_name,
                rp.district_name    AS district_name,
                EXTRACT(DAY FROM (NOW() - rp.odoo_create_date))::int AS dias_desde_alta,
                sl.x_nombre         AS tienda,
                COALESCE(uv_vend.name, uv_caj.name) AS vendedor,
                COALESCE(line_agg.lines_count, 0) AS lines_count,
                COALESCE(line_agg.qty_total, 0)::float AS qty_total,
                -- Saldo crédito pendiente del partner
                COALESCE((
                    SELECT SUM(amount_residual)
                    FROM odoo.account_invoice_credit ic
                    WHERE ic.partner_id = po.partner_id
                      AND COALESCE(ic.state, '') NOT IN ('cancel', 'draft')
                ), 0)::float AS credito_pendiente,
                -- Reservas pendientes del partner
                (
                    SELECT COUNT(*)
                    FROM odoo.pos_order po_res
                    WHERE po_res.partner_id = po.partner_id
                      AND po_res.reserva = true
                      AND (po_res.reserva_use_id = 0 OR po_res.reserva_use_id IS NULL)
                      AND (po_res.order_cancel = false OR po_res.order_cancel IS NULL)
                      AND (po_res.is_cancel = false OR po_res.is_cancel IS NULL)
                ) AS reservas_pendientes
            FROM odoo.v_pos_order_real po
            LEFT JOIN odoo.res_partner rp
              ON rp.odoo_id = po.partner_id AND rp.company_key = 'GLOBAL'
            LEFT JOIN odoo.stock_location sl
              ON sl.odoo_id = po.location_id AND sl.company_key = 'GLOBAL'
            LEFT JOIN odoo.res_users uv_vend ON uv_vend.odoo_id = po.vendedor_id
            LEFT JOIN odoo.res_users uv_caj  ON uv_caj.odoo_id  = po.user_id
            LEFT JOIN (
                SELECT order_id, COUNT(*) AS lines_count, SUM(qty) AS qty_total
                FROM odoo.pos_order_line GROUP BY order_id
            ) line_agg ON line_agg.order_id = po.odoo_id
            WHERE po.date_order >= NOW() - ($1 || ' hours')::interval
            ORDER BY po.date_order DESC
            LIMIT 200
        """, str(horas))

    items = []
    for r in rows:
        phone = r["phone"] or r["mobile"] or ""
        phone_source = "phone" if r["phone"] else ("mobile" if r["mobile"] else None)
        depto_raw = r["state_name"]
        depto_canon = normalize_depto(depto_raw, "PE") if depto_raw else ""

        flags = {
            "cliente_nuevo": (r["dias_desde_alta"] or 9999) < 30,
            "falta_telefono": not phone,
            "falta_departamento": not depto_canon,
            "tiene_credito_pendiente": float(r["credito_pendiente"] or 0) > 0,
            "tiene_reservas": int(r["reservas_pendientes"] or 0) > 0,
        }
        # Alguna alerta == cualquier flag true
        has_alert = any(flags.values())

        items.append({
            "order_id": r["order_id"],
            "order_name": r["order_name"],
            "date_order": r["date_order"].isoformat() if r["date_order"] else None,
            "amount_total": float(r["amount_total"] or 0),
            "tipo_comp": r["tipo_comp"],
            "num_comp": r["num_comp"],
            "empresa": r["empresa"],
            "partner_id": r["partner_id"],
            "partner_name": r["partner_name"],
            "phone": phone,
            "phone_source": phone_source,
            "depto_actual": depto_canon or depto_raw,
            "distrito": r["district_name"],
            "tienda": r["tienda"],
            "vendedor": r["vendedor"],
            "lines_count": r["lines_count"],
            "qty_total": r["qty_total"],
            "credito_pendiente": float(r["credito_pendiente"] or 0),
            "reservas_pendientes": int(r["reservas_pendientes"] or 0),
            "dias_desde_alta": r["dias_desde_alta"],
            "flags": flags,
            "has_alert": has_alert,
        })

    # Stats globales para badge
    con_alerta = sum(1 for it in items if it["has_alert"])
    return {
        "items": items,
        "total": len(items),
        "con_alerta": con_alerta,
        "horas": horas,
    }


@router.get("/ubigeo")
async def get_ubigeo(
    pais: str = "PE",
    _user: dict = Depends(get_current_user),
):
    """Devuelve la jerarquía UBIGEO completa (depto → provincia → distrito).

    Source: crm.ubigeo (poblada desde res.country.state de Odoo l10n_pe).
    Filtra solo los deptos canónicos (los que tienen ≥1 provincia hija).

    Response:
        {
          "Lima": {
            "Lima": ["Miraflores", "San Juan de Lurigancho", ...],
            "Cañete": [...]
          },
          "Cusco": { ... }
        }
    """
    async with safe_acquire() as conn:
        # Capitalizamos a Title Case porque Odoo guarda en MAYÚSCULAS
        # ("LIMA" → "Lima", "MADRE DE DIOS" → "Madre de Dios").
        rows = await conn.fetch("""
            SELECT
                d.name AS depto,
                d.odoo_id AS depto_id,
                p.name AS provincia,
                p.odoo_id AS provincia_id,
                dist.name AS distrito,
                dist.odoo_id AS distrito_id
            FROM crm.ubigeo d
            JOIN crm.ubigeo p
              ON p.kind='provincia' AND p.parent_state_id = d.odoo_id
            LEFT JOIN crm.ubigeo dist
              ON dist.kind='distrito' AND dist.parent_province_id = p.odoo_id
            WHERE d.kind = 'depto' AND d.country_code = $1
            ORDER BY d.name, p.name, dist.name
        """, pais)

    # Construir jerarquía con nombres canónicos (Áncash, Apurímac, etc.)
    # Para depto: usar normalize_depto que tiene la lista canónica con tildes.
    # Para provincia/distrito: Title Case (Odoo no guarda tildes en estos).
    from utils.depto_normalize import _titleize, normalize_depto
    hierarchy: dict = {}
    for r in rows:
        d = normalize_depto(r["depto"], pais) or _titleize(r["depto"])
        p = _titleize(r["provincia"])
        if d not in hierarchy:
            hierarchy[d] = {}
        if p not in hierarchy[d]:
            hierarchy[d][p] = []
        if r["distrito"]:
            distrito_clean = _titleize(r["distrito"])
            if distrito_clean not in hierarchy[d][p]:
                hierarchy[d][p].append(distrito_clean)

    return {"pais": pais, "ubigeo": hierarchy}


@router.get("/admin/calidad-datos")
async def get_calidad_datos(
    severidad: str = "",       # "critico" | "sucio" | "incompleto" | "" (todos)
    rule: str = "",            # filtro por regla específica
    nuevos_only: bool = False,  # solo cuentas <90d con falta crítica
    sort: str = "last_purchase",  # "last_purchase" | "dias_alta"
    limit: int = Query(500, ge=1, le=2000),
    _user: dict = Depends(get_current_user),
):
    """Evalúa todas las cuentas activas contra las reglas de calidad de datos.

    Devuelve summary (counts por severidad y por regla) + lista de cuentas
    con problemas. Pensado para una vista admin "Calidad de Datos".
    """
    from utils.calidad_datos import evaluar_cuenta, severidad_max, RULE_LABELS

    async with safe_acquire() as conn:
        # D5 simplificado: solo principales (v_cuentas_libres ya filtra a
        # x_es_principal=true y standalones). Datos del kpi para sort por
        # última compra. Phone/mobile en bruto — el evaluador decide.
        rows = await conn.fetch("""
            SELECT
                cl.cuenta_partner_odoo_id        AS cuenta_partner_odoo_id,
                rp.name                          AS nombre,
                rp.phone                         AS phone,
                rp.mobile                        AS mobile,
                rp.state_name                    AS state_name,
                cu.departamento                  AS depto_crm,
                COALESCE(cu.pais,
                    CASE WHEN rp.country_name = 'Bolivia' THEN 'BO' ELSE 'PE' END
                )                                AS pais,
                mvce.tier                        AS tier,
                k.last_purchase_date             AS last_purchase_date,
                EXTRACT(DAY FROM (NOW() - COALESCE(rp.odoo_create_date, cu.created_at)))::int AS dias_desde_alta
            FROM crm.v_cuentas_libres cl
            JOIN odoo.res_partner rp
              ON rp.odoo_id = cl.cuenta_partner_odoo_id AND rp.company_key = 'GLOBAL'
            LEFT JOIN crm.cuenta cu
              ON cu.cuenta_partner_odoo_id = cl.cuenta_partner_odoo_id
            LEFT JOIN crm.mv_cuenta_estado mvce
              ON mvce.cuenta_partner_odoo_id = cl.cuenta_partner_odoo_id
            LEFT JOIN crm.mv_cuenta_sales_kpi k
              ON k.cuenta_id = cl.cuenta_partner_odoo_id
            WHERE COALESCE(cu.approval_status, 'APPROVED') = 'APPROVED'
              AND COALESCE(cu.is_active, true) = true
        """)

    items_total = []
    counts_severidad = {"critico": 0, "sucio": 0, "incompleto": 0}
    counts_rule: dict = {}
    nuevos_count = 0

    for r in rows:
        row = dict(r)
        problemas = evaluar_cuenta(row)
        if not problemas:
            continue
        sev = severidad_max(problemas)
        counts_severidad[sev] = counts_severidad.get(sev, 0) + 1
        for p in problemas:
            counts_rule[p["rule"]] = counts_rule.get(p["rule"], 0) + 1

        es_nuevo = (row.get("dias_desde_alta") or 9999) < 90
        tiene_critico = any(p["severidad"] == "critico" for p in problemas)
        if es_nuevo and tiene_critico:
            nuevos_count += 1

        # Phone unificado: el primero no vacío (phone gana sobre mobile),
        # con indicador del campo de origen para que el usuario sepa de dónde
        # vino el dato.
        phone_raw = row.get("phone")
        mobile_raw = row.get("mobile")
        phone_final = phone_raw or mobile_raw
        phone_source = "phone" if phone_raw else ("mobile" if mobile_raw else None)
        last_purchase = row.get("last_purchase_date")

        items_total.append({
            "cuenta_partner_odoo_id": row["cuenta_partner_odoo_id"],
            "nombre": row.get("nombre"),
            "phone": phone_final,
            "phone_source": phone_source,
            "depto_actual": row.get("depto_crm") or row.get("state_name"),
            "tier": row.get("tier"),
            "dias_desde_alta": row.get("dias_desde_alta"),
            "last_purchase_date": last_purchase.isoformat() if last_purchase else None,
            "es_nuevo": es_nuevo,
            "severidad": sev,
            "problemas": problemas,
            # Referencias desde vinculados — se llenan abajo (post sort+limit)
            "phone_referencia": None,
            "phone_referencia_partner": None,
            "phone_referencia_source": None,
            "depto_referencia": None,
            "depto_referencia_partner": None,
        })

    # Aplicar filtros
    items = items_total
    if severidad:
        items = [it for it in items if it["severidad"] == severidad]
    if rule:
        items = [it for it in items
                 if any(p["rule"] == rule for p in it["problemas"])]
    if nuevos_only:
        items = [it for it in items if it["es_nuevo"]]

    # Sort: por defecto última compra DESC (clientes activos primero — son
    # los más urgentes a corregir). Alternativa: dias_alta ASC (nuevos primero).
    orden = {"critico": 0, "sucio": 1, "incompleto": 2}

    def _sort_date_key(d_str):
        """Convierte '2024-05-31T22:43:50+00:00' o '2024-05-31' a int YYYYMMDD
        para sort DESC. None → 0 (al final)."""
        if not d_str:
            return 0
        try:
            return int(d_str[:10].replace("-", ""))
        except (ValueError, AttributeError):
            return 0

    if sort == "dias_alta":
        items.sort(key=lambda x: (
            orden.get(x["severidad"], 99),
            x["dias_desde_alta"] or 9999,
        ))
    else:  # "last_purchase" (default)
        items.sort(key=lambda x: (
            orden.get(x["severidad"], 99),
            -_sort_date_key(x["last_purchase_date"]),
        ))

    # Truncar a limit ANTES de buscar referencias (más rápido — solo busca para
    # las cuentas visibles, no las 8K).
    items_visibles = items[:limit]

    # ── Referencias desde vinculados (solo para items visibles) ──────────
    # Si el principal carece de phone o depto, buscamos entre sus partners
    # vinculados si alguno tiene el dato. Mostrar como hint para que el
    # usuario pueda copiar al principal.
    visible_needs_phone = [it["cuenta_partner_odoo_id"] for it in items_visibles
                           if any(p["rule"] == "sin_telefono" for p in it["problemas"])]
    visible_needs_depto = [it["cuenta_partner_odoo_id"] for it in items_visibles
                           if any(p["rule"] == "sin_departamento" for p in it["problemas"])]
    visible_needs_any = list(set(visible_needs_phone + visible_needs_depto))

    if visible_needs_any:
        try:
            async with safe_acquire() as conn:
                ref_rows = await conn.fetch("""
                    SELECT
                        cu.cuenta_partner_odoo_id   AS principal_id,
                        vp.name                     AS vinculado_name,
                        COALESCE(vp.phone, vp.mobile) AS phone,
                        CASE WHEN vp.phone IS NOT NULL AND vp.phone <> '' THEN 'phone'
                             WHEN vp.mobile IS NOT NULL AND vp.mobile <> '' THEN 'mobile'
                             ELSE NULL END         AS phone_source,
                        vp.state_name               AS state_name
                    FROM crm.v_cuenta_partners vcp
                    JOIN crm.cuenta cu ON cu.id = vcp.cuenta_id
                    JOIN odoo.res_partner vp ON vp.odoo_id = vcp.partner_id
                                              AND vp.company_key = 'GLOBAL'
                    WHERE cu.cuenta_partner_odoo_id = ANY($1)
                      AND vp.odoo_id <> cu.cuenta_partner_odoo_id
                """, visible_needs_any)

            refs_by_principal: dict = {}
            for r in ref_rows:
                refs_by_principal.setdefault(r["principal_id"], []).append(r)

            for it in items_visibles:
                pid = it["cuenta_partner_odoo_id"]
                vinculados = refs_by_principal.get(pid, [])
                if pid in visible_needs_phone:
                    for v in vinculados:
                        if v["phone"]:
                            it["phone_referencia"] = v["phone"]
                            it["phone_referencia_partner"] = v["vinculado_name"]
                            it["phone_referencia_source"] = v["phone_source"]
                            break
                if pid in visible_needs_depto:
                    for v in vinculados:
                        if v["state_name"]:
                            it["depto_referencia"] = v["state_name"]
                            it["depto_referencia_partner"] = v["vinculado_name"]
                            break
        except Exception:
            # Si la query de vinculados falla, no romper la response
            pass

    total_evaluadas = len(rows)
    total_con_problemas = len(items_total)
    pct_problemas = (
        round(100 * total_con_problemas / total_evaluadas, 1)
        if total_evaluadas else 0
    )

    return {
        "summary": {
            "total_evaluadas": total_evaluadas,
            "con_problemas": total_con_problemas,
            "pct_problemas": pct_problemas,
            "criticos": counts_severidad["critico"],
            "sucios": counts_severidad["sucio"],
            "incompletos": counts_severidad["incompleto"],
            "nuevos_sin_datos": nuevos_count,
        },
        "rule_counts": [
            {"rule": k, "label": RULE_LABELS.get(k, k), "count": v}
            for k, v in sorted(counts_rule.items(), key=lambda x: -x[1])
        ],
        "items": items_visibles,
        "items_truncated": len(items) > limit,
    }


@router.post("/refresh-kpis")
async def refresh_cuenta_kpis(_user: dict = Depends(get_current_user)):
    """Refresca mv_cuenta_sales_kpi (directorio) y mv_ventas_reporte."""
    async with safe_acquire() as conn:
        await conn.execute(
            "REFRESH MATERIALIZED VIEW CONCURRENTLY crm.mv_cuenta_sales_kpi"
        )
        try:
            await conn.execute("REFRESH MATERIALIZED VIEW crm.mv_ventas_reporte")
        except Exception:
            pass
    return {"ok": True, "message": "KPIs actualizados"}


@router.get("/list/filter-options")
async def get_cuentas_filter_options(_user: dict = Depends(get_current_user)):
    """Valores distintos para los dropdowns del toolbar.

    Devuelve listas en vivo desde la DB (no hardcoded en el frontend):
      - estados:        cu.estado_comercial REAL en uso (no falsos)
      - clasificaciones: cu.clasificacion REAL en uso
      - ciudades:       deptos peruanos válidos solamente (excluye ruido como
                        "Idaho", "BOLIVIA", nombres de ciudades sueltas)
      - tiendas:        stock_location internas activas
      - asignados:      usernames con cartera asignada
    """
    # Deptos canónicos del Perú en Title Case con tildes (coincide con
    # DEPARTAMENTOS_PE del frontend y con cómo se muestran en la tabla).
    # Key = normalizado UPPER sin tildes (para matchear contra state_name de Odoo
    # que viene en mayúsculas), value = forma canónica para mostrar.
    DEPTOS_PERU = {
        'AMAZONAS':      'Amazonas',
        'ANCASH':        'Áncash',
        'APURIMAC':      'Apurímac',
        'AREQUIPA':      'Arequipa',
        'AYACUCHO':      'Ayacucho',
        'CAJAMARCA':     'Cajamarca',
        'CALLAO':        'Callao',
        'CUSCO':         'Cusco',
        'HUANCAVELICA':  'Huancavelica',
        'HUANUCO':       'Huánuco',
        'ICA':           'Ica',
        'JUNIN':         'Junín',
        'LA LIBERTAD':   'La Libertad',
        'LAMBAYEQUE':    'Lambayeque',
        'LIMA':          'Lima',
        'LORETO':        'Loreto',
        'MADRE DE DIOS': 'Madre de Dios',
        'MOQUEGUA':      'Moquegua',
        'PASCO':         'Pasco',
        'PIURA':         'Piura',
        'PUNO':          'Puno',
        'SAN MARTIN':    'San Martín',
        'TACNA':         'Tacna',
        'TUMBES':        'Tumbes',
        'UCAYALI':       'Ucayali',
    }

    async with safe_acquire() as conn:
        # Estados comerciales realmente en uso
        estados = [
            r["estado_comercial"] for r in await conn.fetch("""
                SELECT DISTINCT estado_comercial
                FROM crm.cuenta
                WHERE estado_comercial IS NOT NULL
                  AND btrim(estado_comercial) <> ''
                  AND COALESCE(is_active, true) = true
                  AND COALESCE(manual_inactive, false) = false
                ORDER BY estado_comercial
            """)
        ]

        # Clasificaciones en uso
        clasificaciones = [
            r["clasificacion"] for r in await conn.fetch("""
                SELECT DISTINCT clasificacion
                FROM crm.cuenta
                WHERE clasificacion IS NOT NULL
                  AND btrim(clasificacion) <> ''
                  AND COALESCE(is_active, true) = true
                  AND COALESCE(manual_inactive, false) = false
                ORDER BY clasificacion
            """)
        ]

        # Ciudades (deptos) — filtramos a peruanos canónicos y normalizamos
        # a Title Case con tildes para que coincidan con cómo se muestran
        # en la tabla (Lima, Cusco, Huánuco — no LIMA, CUSCO, HUANUCO).
        ciudades_raw = [
            r["state_name"] for r in await conn.fetch("""
                SELECT DISTINCT UPPER(btrim(rp.state_name::text)) AS state_name
                FROM crm.cuenta cu
                JOIN odoo.res_partner rp
                  ON rp.odoo_id = cu.cuenta_partner_odoo_id AND rp.company_key = 'GLOBAL'
                WHERE rp.state_name IS NOT NULL AND btrim(rp.state_name::text) <> ''
                  AND COALESCE(cu.is_active, true) = true
                  AND COALESCE(cu.manual_inactive, false) = false
                ORDER BY state_name
            """)
        ]
        # Mapear a forma canónica y ordenar alfabéticamente
        ciudades = sorted({
            DEPTOS_PERU[c] for c in ciudades_raw if c in DEPTOS_PERU
        })

        # Vendedoras con cartera asignada
        asignados = [
            r["asignado_a"] for r in await conn.fetch("""
                SELECT DISTINCT cu.asignado_a
                FROM crm.cuenta cu
                WHERE cu.asignado_a IS NOT NULL AND btrim(cu.asignado_a) <> ''
                  AND COALESCE(cu.is_active, true) = true
                  AND COALESCE(cu.manual_inactive, false) = false
                ORDER BY cu.asignado_a
            """)
        ]

        # Tiendas internas activas
        tiendas = [
            r["x_nombre"] for r in await conn.fetch("""
                SELECT DISTINCT x_nombre
                FROM odoo.stock_location
                WHERE company_key = 'GLOBAL'
                  AND x_nombre IS NOT NULL AND btrim(x_nombre) <> ''
                  AND COALESCE(active, true) = true
                  AND usage = 'internal'
                ORDER BY x_nombre
            """)
        ]
        tiendas.append("Sin tienda")

    return {
        "estados":         estados,
        "clasificaciones": clasificaciones,
        "ciudades":        ciudades,
        "tiendas":         tiendas,
        "asignados":       asignados,
    }


@router.patch("/batch-active")
async def batch_toggle_cuentas_active(
    data: BatchToggleActiveInput,
    user: dict = Depends(get_current_user),
):
    """Activa/desactiva cuentas en lote con cascade a contactos."""
    user_email = user.get("username", "unknown") if isinstance(user, dict) else "unknown"
    ids = [int(i) for i in data.ids]
    if not ids:
        return {"ok": True, "cuentas_affected": 0, "contactos_affected": 0}

    async with safe_acquire() as conn:
        cuentas_affected = 0
        contactos_affected = 0

        if not data.is_active:
            reason = data.reason or "MANUAL"
            for oid in ids:
                await conn.execute(
                    "INSERT INTO crm.cuenta (cuenta_partner_odoo_id) VALUES ($1)"
                    " ON CONFLICT DO NOTHING", oid
                )
            res = await conn.execute("""
                UPDATE crm.cuenta
                SET is_active = false, manual_inactive = true,
                    inactive_reason = $2, inactive_at = now(), inactive_by = $3,
                    updated_at = now()
                WHERE cuenta_partner_odoo_id = ANY($1) AND is_active = true
            """, ids, reason, user_email)
            cuentas_affected = int(res.split()[-1]) if res else 0

            res2 = await conn.execute("""
                UPDATE crm.contacto
                SET is_active = false, manual_inactive = true,
                    inactive_reason = 'CASCADE_ACCOUNT', inactive_at = now(),
                    inactive_by = $2, updated_at = now()
                WHERE cuenta_partner_odoo_id = ANY($1) AND is_active = true
            """, ids, user_email)
            contactos_affected = int(res2.split()[-1]) if res2 else 0
        else:
            res = await conn.execute("""
                UPDATE crm.cuenta
                SET is_active = true, manual_inactive = false,
                    inactive_reason = NULL, inactive_at = NULL, inactive_by = NULL,
                    updated_at = now()
                WHERE cuenta_partner_odoo_id = ANY($1) AND is_active = false
            """, ids)
            cuentas_affected = int(res.split()[-1]) if res else 0

            res2 = await conn.execute("""
                UPDATE crm.contacto
                SET is_active = true, manual_inactive = false,
                    inactive_reason = NULL, inactive_at = NULL, inactive_by = NULL,
                    updated_at = now()
                WHERE cuenta_partner_odoo_id = ANY($1) AND is_active = false
                  AND inactive_reason IN ('CASCADE_ACCOUNT', 'CASCADE_CONTACT')
            """, ids)
            contactos_affected = int(res2.split()[-1]) if res2 else 0

    return {
        "ok": True,
        "is_active": data.is_active,
        "cuentas_affected": cuentas_affected,
        "contactos_affected": contactos_affected,
    }


# ── Detalle de cuenta ──────────────────────────────────────────────────────────

@router.get("/{cuenta_id}/header-metrics")
async def get_cuenta_header_metrics(
    cuenta_id: str,
    _user: dict = Depends(get_current_user),
):
    """Métricas compactas de cabecera: última compra, ventas 12m, ticket
    promedio + estado_auto / tier / recencia / freq del matview de estado.
    """
    async with safe_acquire() as conn:
        partner_ids, _ = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return {
                "last_purchase_date": None,
                "days_since_last_purchase": None,
                "sales_12m_amount": 0,
                "orders_12m_count": 0,
                "ticket_promedio": 0,
                "estado_auto": None,
                "tier": None,
                "recencia_dias": None,
                "freq_dias_estimada": None,
            }
        # Métricas frescas (calculadas desde mv_pos_line_cuenta)
        row = await conn.fetchrow("""
            SELECT
                MAX(v.date_order) AS last_purchase_date,
                CASE WHEN MAX(v.date_order) IS NOT NULL
                     THEN (CURRENT_DATE - MAX(v.date_order)::date)::int
                     ELSE NULL END AS days_since_last_purchase,
                COALESCE(SUM(CASE WHEN v.date_order >= CURRENT_DATE - 365
                                  THEN v.price_subtotal ELSE 0 END), 0) AS sales_12m_amount,
                COUNT(DISTINCT CASE WHEN v.date_order >= CURRENT_DATE - 365
                                    THEN v.order_id END) AS orders_12m_count,
                COUNT(DISTINCT v.order_id) AS orders_total
            FROM crm.mv_pos_line_cuenta v
            WHERE v.cuenta_partner_id = ANY($1)
        """, partner_ids)

        # Estado del matview (refresh nocturno) — datos de tier/estado/score
        estado_row = await conn.fetchrow("""
            SELECT estado_auto, tier, recencia_dias,
                   freq_dias_estimada::float AS freq_dias_estimada,
                   prioridad_score::float    AS prioridad_score
            FROM crm.mv_cuenta_estado
            WHERE cuenta_partner_odoo_id = ANY($1)
            ORDER BY prioridad_score DESC NULLS LAST
            LIMIT 1
        """, partner_ids)

    sales_12m = float(row["sales_12m_amount"] or 0)
    orders_12m = int(row["orders_12m_count"] or 0)
    ticket_prom = (sales_12m / orders_12m) if orders_12m > 0 else 0.0

    return {
        "last_purchase_date": row["last_purchase_date"].isoformat() if row["last_purchase_date"] else None,
        "days_since_last_purchase": int(row["days_since_last_purchase"]) if row["days_since_last_purchase"] is not None else None,
        "sales_12m_amount": sales_12m,
        "orders_12m_count": orders_12m,
        "orders_total": int(row["orders_total"] or 0),
        "ticket_promedio": round(ticket_prom, 2),
        "estado_auto": estado_row["estado_auto"] if estado_row else None,
        "tier": estado_row["tier"] if estado_row else None,
        "recencia_dias": int(estado_row["recencia_dias"]) if estado_row and estado_row["recencia_dias"] is not None else None,
        "freq_dias_estimada": float(estado_row["freq_dias_estimada"]) if estado_row and estado_row["freq_dias_estimada"] is not None else None,
        "prioridad_score": float(estado_row["prioridad_score"]) if estado_row and estado_row["prioridad_score"] is not None else None,
    }


@router.get("/{cuenta_id}/resumen")
async def get_cuenta_resumen(
    cuenta_id: str,
    _user: dict = Depends(get_current_user),
):
    """Resumen completo para el tab Resumen (Sprint CRM-D3):
    - sparkline 12 meses (compras mensuales en S/)
    - última interacción registrada
    - próxima acción sugerida (basada en estado_auto + recencia)
    - top 3 productos comprados (marca/tipo/entalle)
    - YoY % cambio (sales_12m vs sales 24-12m anterior)
    """
    async with safe_acquire() as conn:
        partner_ids, _ = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return {
                "sparkline_12m": [],
                "yoy_pct": None,
                "ultima_interaccion": None,
                "sugerencia": None,
                "top_productos": [],
            }

        # 1) Sparkline mensual últimos 12 meses
        sparkline_rows = await conn.fetch("""
            WITH meses AS (
                SELECT generate_series(
                    date_trunc('month', CURRENT_DATE) - interval '11 months',
                    date_trunc('month', CURRENT_DATE),
                    interval '1 month'
                )::date AS mes
            )
            SELECT m.mes,
                   COALESCE(SUM(v.price_subtotal), 0)::float AS monto
            FROM meses m
            LEFT JOIN crm.mv_pos_line_cuenta v
                ON date_trunc('month', v.date_order)::date = m.mes
                AND v.cuenta_partner_id = ANY($1)
            GROUP BY m.mes
            ORDER BY m.mes
        """, partner_ids)
        sparkline_12m = [
            {"mes": r["mes"].isoformat(), "monto": float(r["monto"] or 0)}
            for r in sparkline_rows
        ]

        # 2) YoY%: ventas últimos 12m vs 12 meses anteriores (mes 13-24)
        yoy_row = await conn.fetchrow("""
            SELECT
                COALESCE(SUM(CASE WHEN date_order >= CURRENT_DATE - 365
                                  THEN price_subtotal ELSE 0 END), 0)::float AS curr,
                COALESCE(SUM(CASE WHEN date_order >= CURRENT_DATE - 730
                                  AND date_order <  CURRENT_DATE - 365
                                  THEN price_subtotal ELSE 0 END), 0)::float AS prev
            FROM crm.mv_pos_line_cuenta
            WHERE cuenta_partner_id = ANY($1)
        """, partner_ids)
        curr, prev = float(yoy_row["curr"] or 0), float(yoy_row["prev"] or 0)
        yoy_pct = ((curr - prev) / prev) if prev > 0 else None

        # 3) Última interacción
        # cuenta_id (UUID) → buscar interacción asociada al primer partner
        ult_int = await conn.fetchrow("""
            SELECT i.happened_at, i.tipo, i.channel, i.outcome, i.resumen,
                   i.created_by, i.fecha
            FROM crm.interaccion i
            JOIN crm.cuenta cu ON cu.id = i.cuenta_id
            WHERE cu.cuenta_partner_odoo_id = ANY($1)
            ORDER BY i.happened_at DESC NULLS LAST, i.fecha DESC NULLS LAST
            LIMIT 1
        """, partner_ids)
        ultima_interaccion = None
        if ult_int:
            when = ult_int["happened_at"] or ult_int["fecha"]
            ultima_interaccion = {
                "happened_at": when.isoformat() if when else None,
                "tipo": ult_int["tipo"],
                "channel": ult_int["channel"],
                "outcome": ult_int["outcome"],
                "resumen": ult_int["resumen"],
                "created_by": ult_int["created_by"],
            }

        # 4) Sugerencia automática basada en estado + recencia
        estado_row = await conn.fetchrow("""
            SELECT estado_auto, tier, recencia_dias,
                   freq_dias_estimada::float AS freq_dias_estimada,
                   amount_12m::float AS amount_12m, name
            FROM crm.mv_cuenta_estado
            WHERE cuenta_partner_odoo_id = ANY($1)
            LIMIT 1
        """, partner_ids)
        sugerencia = _generar_sugerencia(estado_row)

        # 5) Top 3 productos por unidades 12m — marca/tipo enriquecidos
        top_rows = await conn.fetch("""
            SELECT
                COALESCE(pm.nombre, pm_fb.nombre, INITCAP(v.marca), '')  AS marca,
                COALESCE(pti.nombre, pti_fb.nombre, INITCAP(v.tipo), '') AS tipo,
                v.entalle,
                SUM(v.qty)::bigint            AS qty_12m,
                SUM(v.price_subtotal)::float  AS amount_12m
            FROM crm.mv_pos_line_cuenta v
            LEFT JOIN produccion.prod_odoo_productos_enriq pe
                ON pe.odoo_template_id = v.product_tmpl_id
            LEFT JOIN produccion.prod_marcas pm  ON pm.id  = pe.marca_id
            LEFT JOIN produccion.prod_tipos  pti ON pti.id = pe.tipo_id
            LEFT JOIN produccion.prod_marcas pm_fb
                ON pe.marca_id IS NULL AND UPPER(pm_fb.nombre) = UPPER(v.marca)
            LEFT JOIN produccion.prod_tipos  pti_fb
                ON pe.tipo_id IS NULL AND UPPER(pti_fb.nombre) = UPPER(v.tipo)
            WHERE v.cuenta_partner_id = ANY($1)
              AND v.date_order >= CURRENT_DATE - 365
            GROUP BY
                COALESCE(pm.nombre, pm_fb.nombre, INITCAP(v.marca), ''),
                COALESCE(pti.nombre, pti_fb.nombre, INITCAP(v.tipo), ''),
                v.entalle
            ORDER BY qty_12m DESC NULLS LAST
            LIMIT 3
        """, partner_ids)
        top_productos = [
            {
                "marca": r["marca"], "tipo": r["tipo"], "entalle": r["entalle"],
                "qty_12m": int(r["qty_12m"] or 0),
                "amount_12m": float(r["amount_12m"] or 0),
            }
            for r in top_rows
        ]

    return {
        "sparkline_12m": sparkline_12m,
        "yoy_pct": round(yoy_pct, 4) if yoy_pct is not None else None,
        "ultima_interaccion": ultima_interaccion,
        "sugerencia": sugerencia,
        "top_productos": top_productos,
    }


def _generar_sugerencia(estado_row) -> Optional[dict]:
    """Frase de acción sugerida según el estado + recencia + LTV."""
    if not estado_row:
        return None
    e = estado_row["estado_auto"]
    rec = estado_row["recencia_dias"]
    freq = estado_row["freq_dias_estimada"]
    tier = estado_row["tier"]
    amt = estado_row["amount_12m"]

    if e == "vip":
        return {
            "tipo": "info",
            "titulo": "Cliente VIP — mantener cercanía",
            "detalle": f"LTV S/ {amt:,.0f} · ciclo {freq:.0f}d. Prioriza no perder este vínculo.",
            "accion": "llamar_o_visitar",
        }
    if e == "en_riesgo":
        return {
            "tipo": "warn",
            "titulo": "Empieza a alejarse del ciclo normal",
            "detalle": f"Última compra hace {rec}d, ciclo normal {freq:.0f}d. Reactivar pronto.",
            "accion": "llamar",
        }
    if e == "dormido":
        return {
            "tipo": "crit",
            "titulo": "Llamar para reactivar urgente",
            "detalle": (
                f"Última compra hace {rec}d, ciclo normal {freq:.0f}d "
                f"({(rec/freq if freq else 0):.1f}× del normal). "
                + (f"Cliente tier {tier} con LTV S/ {amt:,.0f}." if tier else "")
            ),
            "accion": "llamar",
        }
    if e == "perdido":
        return {
            "tipo": "crit",
            "titulo": "Cuenta perdida — operación de rescate",
            "detalle": f"Más de 3× del ciclo normal sin compra. LTV histórico: S/ {amt:,.0f}.",
            "accion": "campania_recovery",
        }
    if e == "nuevo":
        return {
            "tipo": "info",
            "titulo": "Cuenta nueva — onboarding",
            "detalle": "Crear primer punto de contacto y conocer necesidad.",
            "accion": "llamar",
        }
    if e == "activo":
        return {
            "tipo": "ok",
            "titulo": "Cliente saludable",
            "detalle": f"Comprando dentro del ciclo normal ({freq:.0f}d). Mantener relación.",
            "accion": None,
        }
    return None


@router.get("/{cuenta_id}")
async def get_cuenta(
    cuenta_id: str,
    _user: dict = Depends(get_current_user),
):
    """Obtiene cuenta por odoo_id; crea fila en crm.cuenta si no existe."""
    try:
        odoo_id = int(cuenta_id)
    except ValueError:
        raise HTTPException(400, "cuenta_id debe ser entero (odoo_id del partner)")

    async with safe_acquire() as conn:
        await conn.execute("""
            INSERT INTO crm.cuenta (cuenta_partner_odoo_id)
            VALUES ($1) ON CONFLICT (cuenta_partner_odoo_id) DO NOTHING
        """, odoo_id)

        row = await conn.fetchrow(
            "SELECT * FROM crm.cuenta WHERE cuenta_partner_odoo_id = $1", odoo_id
        )
        if not row:
            raise HTTPException(404, "Cuenta no encontrada")
        result = row_to_dict(row)

        partner = await conn.fetchrow(
            "SELECT * FROM odoo.res_partner"
            " WHERE odoo_id = $1 AND company_key = 'GLOBAL' LIMIT 1",
            odoo_id,
        )
        if partner:
            result["partner"] = row_to_dict(partner)

        # D4 v3: crédito usado calculado dinámicamente desde el saldo pendiente
        # real (account_invoice_credit.amount_residual). El usuario edita la
        # LÍNEA de crédito (cap manual), pero el USADO siempre refleja la
        # realidad de las facturas pendientes.
        partner_ids, _ = await _get_cuenta_partner_ids(conn, str(odoo_id))
        if partner_ids:
            credito_calc = await conn.fetchval("""
                SELECT COALESCE(SUM(amount_residual), 0)::float
                FROM odoo.account_invoice_credit
                WHERE partner_id = ANY($1)
                  AND COALESCE(state, '') NOT IN ('cancel', 'draft')
            """, partner_ids)
        else:
            credito_calc = 0.0
        result["credito_usado_real"] = float(credito_calc or 0)

        # D5: "Cliente desde" calculado dinámicamente como la PRIMERA venta real
        # registrada entre TODOS los partners vinculados a la cuenta. Si en el
        # futuro se vincula un contacto adicional con ventas previas, este valor
        # se ajusta automáticamente (no hay que escribirlo a mano).
        if partner_ids:
            cliente_desde_real = await conn.fetchval("""
                SELECT MIN(date_order)::date
                FROM odoo.v_pos_order_real
                WHERE partner_id = ANY($1)
                   OR x_cliente_principal = ANY($1)
            """, partner_ids)
        else:
            cliente_desde_real = None
        result["cliente_desde_real"] = (
            cliente_desde_real.isoformat() if cliente_desde_real else None
        )

    return result


@router.put("/{cuenta_id}")
async def update_cuenta(
    cuenta_id: str,
    data: CuentaUpdateInput,
    _user: dict = Depends(get_current_user),
):
    odoo_id = int(cuenta_id)
    async with safe_acquire() as conn:
        await conn.execute("""
            INSERT INTO crm.cuenta (cuenta_partner_odoo_id)
            VALUES ($1) ON CONFLICT (cuenta_partner_odoo_id) DO NOTHING
        """, odoo_id)

        sets = []
        params: list = []
        # Campos legacy
        for field, value in [
            ("estado_comercial", data.estado_comercial),
            ("clasificacion",    data.clasificacion),
            ("notas",            data.notas),
            ("asignado_a",       data.asignado_a),
        ]:
            if value is not None:
                params.append(value)
                sets.append(f"{field} = ${len(params)}")
        # D4 v2: perfil editable (sin email — negocio usa WhatsApp)
        for field, value in [
            ("telefono_crm",       data.telefono_crm),
            ("whatsapp_crm",       data.whatsapp_crm),
            ("tipo_negocio",       data.tipo_negocio),
            ("pais",               data.pais),
            ("departamento",       data.departamento),
            ("provincia",          data.provincia),
            ("distrito",           data.distrito),
            ("direccion_crm",      data.direccion_crm),
            ("credito_linea",      data.credito_linea),
            ("credito_usado",      data.credito_usado),
            ("terminos_pago_dias", data.terminos_pago_dias),
            ("canal_preferido",    data.canal_preferido),
            ("foto_url",           data.foto_url),
            ("cliente_desde",      data.cliente_desde),
            ("mayorista",          data.mayorista),
        ]:
            if value is not None:
                params.append(value)
                sets.append(f"{field} = ${len(params)}")

        if not sets:
            raise HTTPException(400, "No hay campos para actualizar")

        sets.append("updated_at = now()")
        params.append(odoo_id)
        row = await conn.fetchrow(
            f"UPDATE crm.cuenta SET {', '.join(sets)}"
            f" WHERE cuenta_partner_odoo_id = ${len(params)} RETURNING *",
            *params,
        )
        if not row:
            raise HTTPException(404, "Cuenta no encontrada")
    return row_to_dict(row)


@router.patch("/{cuenta_id}/active")
async def toggle_cuenta_active(
    cuenta_id: str,
    data: ToggleActiveInput,
    user: dict = Depends(get_current_user),
):
    """Activa/desactiva una cuenta con cascade a sus contactos."""
    odoo_id = int(cuenta_id)
    user_email = user.get("username", "unknown") if isinstance(user, dict) else "unknown"

    async with safe_acquire() as conn:
        await conn.execute(
            "INSERT INTO crm.cuenta (cuenta_partner_odoo_id) VALUES ($1)"
            " ON CONFLICT DO NOTHING", odoo_id
        )
        cuenta = await conn.fetchrow(
            "SELECT id FROM crm.cuenta WHERE cuenta_partner_odoo_id = $1", odoo_id
        )
        if not cuenta:
            raise HTTPException(404, "Cuenta no encontrada")

        if not data.is_active:
            await conn.execute("""
                UPDATE crm.cuenta
                SET is_active = false, manual_inactive = true,
                    inactive_reason = $2, inactive_at = now(), inactive_by = $3,
                    updated_at = now()
                WHERE cuenta_partner_odoo_id = $1
            """, odoo_id, data.reason or "MANUAL", user_email)

            affected = await conn.execute("""
                UPDATE crm.contacto
                SET is_active = false, manual_inactive = true,
                    inactive_reason = 'CASCADE_ACCOUNT', inactive_at = now(),
                    inactive_by = $2, updated_at = now()
                WHERE cuenta_partner_odoo_id = $1 AND is_active = true
            """, odoo_id, user_email)
            return {"ok": True, "is_active": False,
                    "contactos_affected": int(affected.split()[-1]) if affected else 0}
        else:
            await conn.execute("""
                UPDATE crm.cuenta
                SET is_active = true, manual_inactive = false,
                    inactive_reason = NULL, inactive_at = NULL, inactive_by = NULL,
                    updated_at = now()
                WHERE cuenta_partner_odoo_id = $1
            """, odoo_id)

            affected = await conn.execute("""
                UPDATE crm.contacto
                SET is_active = true, manual_inactive = false,
                    inactive_reason = NULL, inactive_at = NULL, inactive_by = NULL,
                    updated_at = now()
                WHERE cuenta_partner_odoo_id = $1 AND is_active = false
                  AND inactive_reason IN ('CASCADE_ACCOUNT', 'CASCADE_CONTACT')
            """, odoo_id)
            return {"ok": True, "is_active": True,
                    "contactos_reactivated": int(affected.split()[-1]) if affected else 0}


@router.get("/{cuenta_id}/contactos/count-active")
async def get_cuenta_contactos_active_count(
    cuenta_id: str,
    _user: dict = Depends(get_current_user),
):
    odoo_id = int(cuenta_id)
    async with safe_acquire() as conn:
        total = await conn.fetchval(
            "SELECT COUNT(*) FROM crm.contacto WHERE cuenta_partner_odoo_id = $1", odoo_id
        )
        active = await conn.fetchval(
            "SELECT COUNT(*) FROM crm.contacto"
            " WHERE cuenta_partner_odoo_id = $1 AND is_active = true", odoo_id
        )
    return {"total": total or 0, "active": active or 0}


@router.get("/{cuenta_id}/contactos")
async def get_cuenta_contactos(
    cuenta_id: str,
    include_inactive: bool = False,
    _user: dict = Depends(get_current_user),
):
    odoo_id = int(cuenta_id)
    inactive_filter = "" if include_inactive else "AND COALESCE(c.is_active, true) = true"

    async with safe_acquire() as conn:
        rows = await conn.fetch(f"""
            SELECT
                rp.odoo_id                            AS contacto_partner_odoo_id,
                rp.name                               AS partner_nombre,
                COALESCE(rp.phone::text, '')          AS partner_phone,
                COALESCE(rp.mobile::text, '')         AS partner_mobile,
                COALESCE(c.whatsapp, '')              AS whatsapp,
                COALESCE(c.rol, '')                   AS rol,
                COALESCE(c.is_active, true)           AS is_active,
                COALESCE(c.manual_inactive, false)    AS manual_inactive,
                c.inactive_reason,
                c.inactive_at,
                CASE WHEN rp.odoo_id = $1 THEN true ELSE false END AS is_principal
            FROM crm.v_partner_account_final m
            JOIN odoo.res_partner rp
              ON rp.odoo_id = m.contacto_partner_odoo_id AND rp.company_key = 'GLOBAL'
            LEFT JOIN crm.contacto c
              ON c.contacto_partner_odoo_id = m.contacto_partner_odoo_id
            WHERE m.cuenta_partner_odoo_id = $1
              AND m.contacto_partner_odoo_id <> $1
              {inactive_filter}
            ORDER BY rp.name
        """, odoo_id)
    return [row_to_dict(r) for r in rows]


@router.get("/{cuenta_id}/contactos-enriquecidos")
async def get_cuenta_contactos_enriquecidos(
    cuenta_id: str,
    _user: dict = Depends(get_current_user),
):
    """Lista de contactos vinculados a la cuenta + métricas de ventas atribuidas
    individualmente a cada partner_id (antes de la consolidación al cliente
    principal). Incluye al PRINCIPAL como primer item.

    Usado por el tab "Vinculados" (Sprint CRM-D4 v2). Devuelve el LTV total
    de la cuenta consolidada y la share aproximada de cada contacto basado
    en las órdenes que tenían ese partner_id como `po.partner_id` directo.
    """
    odoo_id = int(cuenta_id)

    async with safe_acquire() as conn:
        # 1) Lista de IDs de contactos (incluye al principal)
        miembros_rows = await conn.fetch("""
            SELECT DISTINCT
                rp.odoo_id AS contacto_partner_odoo_id,
                rp.name,
                rp.phone,
                rp.mobile,
                rp.vat,
                rp.city,
                rp.state_name,
                COALESCE(c.whatsapp, '')  AS whatsapp,
                COALESCE(c.rol, '')       AS rol,
                CASE WHEN rp.odoo_id = $1 THEN true ELSE false END AS is_principal,
                c.created_at AS vinculado_at
            FROM crm.v_partner_account_final m
            JOIN odoo.res_partner rp
                ON rp.odoo_id = m.contacto_partner_odoo_id
                AND rp.company_key = 'GLOBAL'
            LEFT JOIN crm.contacto c
                ON c.contacto_partner_odoo_id = m.contacto_partner_odoo_id
            WHERE m.cuenta_partner_odoo_id = $1
              AND COALESCE(c.is_active, true) = true
        """, odoo_id)

        ids = [r["contacto_partner_odoo_id"] for r in miembros_rows]

        # 2) Métricas por partner_id en UN solo agregado (no LATERAL)
        amounts_map = {}
        if ids:
            amount_rows = await conn.fetch("""
                SELECT
                    po.partner_id,
                    SUM(po.amount_total)::float        AS amount_12m,
                    SUM(agg.qty_total)::bigint         AS qty_12m,
                    COUNT(DISTINCT po.odoo_id)         AS orders_12m,
                    MAX(po.date_order)                 AS last_purchase_date
                FROM odoo.v_pos_order_real po
                JOIN (
                    SELECT order_id, SUM(qty) AS qty_total
                    FROM odoo.v_pos_line_real
                    WHERE order_id IN (
                        SELECT odoo_id FROM odoo.v_pos_order_real
                        WHERE partner_id = ANY($1::int[])
                          AND date_order >= CURRENT_DATE - 365
                    )
                    GROUP BY order_id
                ) agg ON agg.order_id = po.odoo_id
                WHERE po.partner_id = ANY($1::int[])
                  AND po.date_order >= CURRENT_DATE - 365
                GROUP BY po.partner_id
            """, ids)
            amounts_map = {r["partner_id"]: r for r in amount_rows}

        # 3) Combinar
        rows = []
        for m in miembros_rows:
            pid = m["contacto_partner_odoo_id"]
            a = amounts_map.get(pid)
            rows.append({
                **dict(m),
                "amount_12m": float(a["amount_12m"]) if a else 0.0,
                "qty_12m":    int(a["qty_12m"]) if a else 0,
                "orders_12m": int(a["orders_12m"]) if a else 0,
                "last_purchase_date": a["last_purchase_date"] if a else None,
            })
        # Sort: principal primero, luego por amount desc
        rows.sort(key=lambda x: (
            0 if x["is_principal"] else 1,
            -x["amount_12m"],
        ))

        miembros = []
        ltv_total = 0.0
        for r in rows:
            amt = float(r["amount_12m"] or 0)
            miembros.append({
                "contacto_partner_odoo_id": r["contacto_partner_odoo_id"],
                "name": r["name"],
                "phone": r["phone"],
                "mobile": r["mobile"],
                "vat": r["vat"],
                "city": r["city"],
                "state_name": r["state_name"],
                "whatsapp": r["whatsapp"],
                "rol": r["rol"],
                "is_principal": r["is_principal"],
                "amount_12m": amt,
                "qty_12m": int(r["qty_12m"] or 0),
                "orders_12m": int(r["orders_12m"] or 0),
                "estimado_mensual": round(amt / 12.0, 2),
                "last_purchase_date": r["last_purchase_date"].isoformat() if r["last_purchase_date"] else None,
                "vinculado_at": r["vinculado_at"].isoformat() if r["vinculado_at"] else None,
            })
            ltv_total += amt

        # Nombre del principal para mostrar en el header del grupo
        principal = next((m for m in miembros if m["is_principal"]), None)
        principal_nombre = principal["name"] if principal else None

    return {
        "principal": principal_nombre,
        "miembros": miembros,
        "totales": {
            "miembros_count": len(miembros),
            "ltv_12m_directo": round(ltv_total, 2),  # suma de ventas atribuidas
            "estimado_mensual": round(ltv_total / 12.0, 2),
        },
    }


@router.post("/{cuenta_id}/vincular-contacto")
async def vincular_contacto(
    cuenta_id: str,
    data: VincularContactoInput,
    _user: dict = Depends(get_current_user),
):
    cuenta_odoo_id = int(cuenta_id)
    contacto_odoo_id = data.contacto_partner_odoo_id

    async with safe_acquire() as conn:
        await conn.execute(
            "INSERT INTO crm.cuenta (cuenta_partner_odoo_id) VALUES ($1)"
            " ON CONFLICT DO NOTHING", cuenta_odoo_id
        )

        # WhatsApp: usar el del body si vino, si no, fallback al mobile del partner
        whatsapp_val = (data.whatsapp or "").strip() or None
        if not whatsapp_val:
            whatsapp_val = await conn.fetchval(
                "SELECT mobile::text FROM odoo.res_partner"
                " WHERE odoo_id = $1 AND company_key = 'GLOBAL' LIMIT 1",
                contacto_odoo_id,
            )

        rol_val = (data.rol or "").strip() or None

        await conn.execute("""
            INSERT INTO crm.contacto (contacto_partner_odoo_id, cuenta_partner_odoo_id, whatsapp, rol)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (contacto_partner_odoo_id) DO UPDATE SET
                cuenta_partner_odoo_id = $2,
                whatsapp = COALESCE($3, crm.contacto.whatsapp),
                rol      = COALESCE($4, crm.contacto.rol),
                updated_at = now()
        """, contacto_odoo_id, cuenta_odoo_id, whatsapp_val, rol_val)

        nota = data.nota or "Vinculado manualmente desde la cuenta"
        await conn.execute("""
            INSERT INTO crm.partner_principal_override
                (contacto_partner_odoo_id, cuenta_partner_odoo_id, nota)
            VALUES ($1, $2, $3)
            ON CONFLICT (contacto_partner_odoo_id) DO UPDATE SET
                cuenta_partner_odoo_id = $2, nota = $3, updated_at = now()
        """, contacto_odoo_id, cuenta_odoo_id, nota)

        # Si el contacto tenía su propia cuenta standalone, inactivarla
        # (ahora es secundario de otra, no debe aparecer como cuenta independiente)
        await conn.execute("""
            UPDATE crm.cuenta
            SET is_active = false, manual_inactive = true,
                inactive_reason = 'AUTO: vinculado como secundario a otra cuenta',
                inactive_at = now(), inactive_by = 'sistema', updated_at = now()
            WHERE cuenta_partner_odoo_id = $1
              AND COALESCE(is_active, true) = true
              AND COALESCE(manual_inactive, false) = false
        """, contacto_odoo_id)

        # Aplanar cadenas: si X → contacto → cuenta, actualizar X → cuenta directo
        await conn.execute("""
            UPDATE crm.partner_principal_override
            SET cuenta_partner_odoo_id = $2, updated_at = now()
            WHERE cuenta_partner_odoo_id = $1
              AND contacto_partner_odoo_id <> $2
        """, contacto_odoo_id, cuenta_odoo_id)
        await conn.execute("""
            UPDATE crm.contacto
            SET cuenta_partner_odoo_id = $2, updated_at = now()
            WHERE cuenta_partner_odoo_id = $1
              AND contacto_partner_odoo_id <> $2
        """, contacto_odoo_id, cuenta_odoo_id)

    return {
        "ok": True,
        "contacto_partner_odoo_id": contacto_odoo_id,
        "cuenta_partner_odoo_id": cuenta_odoo_id,
    }


# ── Ventas drill-down por cuenta ───────────────────────────────────────────────

@router.get("/{cuenta_id}/ventas/metrics")
async def get_cuenta_ventas_metrics(
    cuenta_id: str,
    doc_tipo: str = "SALE",
    fecha_desde: str = "",
    fecha_hasta: str = "",
    _user: dict = Depends(get_current_user),
):
    """Métricas globales de ventas. Usa crm.mv_pos_line_cuenta (matview con
    cuenta_partner_id pre-resuelto + override). doc_tipo=RESERVA devuelve 0
    (vistas reales no incluyen reservas)."""
    async with safe_acquire() as conn:
        partner_ids, _ = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids or doc_tipo == "RESERVA":
            return {"orders_count": 0, "qty_total": 0,
                    "last_order_date": None, "first_order_date": None}

        params: list = [partner_ids]
        extra = ""
        if fecha_desde:
            params.append(fecha_desde)
            extra += f" AND v.date_order >= ${len(params)}::text::timestamptz"
        if fecha_hasta:
            params.append(fecha_hasta + "T23:59:59")
            extra += f" AND v.date_order <= ${len(params)}::text::timestamptz"

        row = await conn.fetchrow(f"""
            SELECT COUNT(DISTINCT v.order_id)         AS orders_count,
                   COALESCE(SUM(v.qty), 0)            AS qty_total,
                   MAX(v.date_order)                   AS last_order_date,
                   MIN(v.date_order)                   AS first_order_date
            FROM crm.mv_pos_line_cuenta v
            WHERE v.cuenta_partner_id = ANY($1)
              {extra}
        """, *params)

    return {
        "orders_count": row["orders_count"],
        "qty_total": float(row["qty_total"]),
        "last_order_date": row["last_order_date"].isoformat() if row["last_order_date"] else None,
        "first_order_date": row["first_order_date"].isoformat() if row["first_order_date"] else None,
    }


@router.get("/{cuenta_id}/ventas/orders")
async def get_cuenta_ventas_orders(
    cuenta_id: str,
    doc_tipo: str = "SALE",
    fecha_desde: str = "",
    fecha_hasta: str = "",
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    _user: dict = Depends(get_current_user),
):
    """Lista de órdenes con metrics. Header desde odoo.v_pos_order_real,
    agg de qty/lines desde crm.mv_pos_line_cuenta (con override aplicado).
    doc_tipo=RESERVA → vacío."""
    async with safe_acquire() as conn:
        partner_ids, _ = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids or doc_tipo == "RESERVA":
            return {"metrics": {"orders_count": 0, "qty_total": 0},
                    "rows": [], "page": page, "limit": limit, "has_next": False}

        params: list = [partner_ids]
        extra = ""
        if fecha_desde:
            params.append(fecha_desde)
            extra += f" AND po.date_order >= ${len(params)}::text::timestamptz"
        if fecha_hasta:
            params.append(fecha_hasta + "T23:59:59")
            extra += f" AND po.date_order <= ${len(params)}::text::timestamptz"

        # Sólo cuenta órdenes con AL MENOS una línea válida en v_pos_line_real.
        # v_pos_order_real puede incluir órdenes "huérfanas" donde TODAS las
        # líneas son productos prohibidos (PANETON, PROVADOR, LAPICERO, etc.)
        # filtrados a nivel línea. Esas órdenes no son ventas reales.
        # Cuenta órdenes con AL MENOS una línea válida (no huérfanas).
        # mv_pos_line_cuenta ya excluye líneas inválidas + tiene cuenta_partner_id
        # con override aplicado, así que basta filtrar y contar DISTINCT.
        met = await conn.fetchrow(f"""
            SELECT COUNT(DISTINCT v.order_id) AS orders_count
            FROM crm.mv_pos_line_cuenta v
            JOIN odoo.v_pos_order_real po ON po.odoo_id = v.order_id
            WHERE v.cuenta_partner_id = ANY($1)
              {extra}
        """, *params)

        offset = (page - 1) * limit
        p2 = list(params) + [limit + 1, offset]
        rows = [row_to_dict(r) for r in await conn.fetch(f"""
            SELECT po.odoo_id AS order_id, po.name AS order_name,
                   po.tipo_comp, po.num_comp,
                   po.date_order, po.state, po.amount_total,
                   agg.cuenta_partner_id AS owner_partner_id,
                   rp.name AS owner_partner_name,
                   (ov_po.order_id IS NOT NULL) AS has_override,
                   CASE WHEN ov_po.order_id IS NOT NULL THEN rp_orig.name ELSE NULL END
                     AS original_partner_name,
                   agg.qty_total,
                   agg.lines_count,
                   {_TIENDA_EXPR}
            FROM odoo.v_pos_order_real po
            JOIN (
                SELECT v.order_id,
                       MAX(v.cuenta_partner_id) AS cuenta_partner_id,
                       SUM(v.qty)               AS qty_total,
                       COUNT(*)                  AS lines_count
                FROM crm.mv_pos_line_cuenta v
                WHERE v.cuenta_partner_id = ANY($1)
                GROUP BY v.order_id
            ) agg ON agg.order_id = po.odoo_id
            {_OVERRIDE_JOIN}
            {_TIENDA_JOIN}
            LEFT JOIN odoo.res_partner rp
              ON rp.odoo_id = agg.cuenta_partner_id AND rp.company_key = 'GLOBAL'
            LEFT JOIN odoo.res_partner rp_orig
              ON ov_po.order_id IS NOT NULL
              AND rp_orig.odoo_id = po.partner_id AND rp_orig.company_key = 'GLOBAL'
            WHERE TRUE
              {extra}
            ORDER BY po.date_order DESC, po.odoo_id DESC
            LIMIT ${len(p2) - 1} OFFSET ${len(p2)}
        """, *p2)]

    has_next = len(rows) > limit
    return {
        "metrics": {"orders_count": met["orders_count"], "qty_total": 0},
        "rows": rows[:limit], "page": page, "limit": limit, "has_next": has_next,
    }


@router.get("/{cuenta_id}/ventas/clasificacion")
async def get_cuenta_ventas_clasificacion(
    cuenta_id: str,
    fecha_desde: str = "",
    fecha_hasta: str = "",
    marca: str = "",
    tipo: str = "",
    entalle: str = "",
    sort_by: str = "ultima_fecha_compra",
    sort_dir: str = "desc",
    top: int = Query(200, ge=1, le=500),
    _user: dict = Depends(get_current_user),
):
    async with safe_acquire() as conn:
        partner_ids, _ = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return {"rows": []}

        params: list = [partner_ids]
        extra = ""
        if fecha_desde:
            params.append(fecha_desde)
            extra += f" AND v.date_order >= ${len(params)}::text::timestamptz"
        if fecha_hasta:
            params.append(fecha_hasta + "T23:59:59")
            extra += f" AND v.date_order <= ${len(params)}::text::timestamptz"
        # D4 v3: filtros usan la marca/tipo CANÓNICAS (del catálogo enriquecido)
        # con fallback al texto crudo de Odoo + matching case-insensitive en el
        # catálogo (para productos no-enriquecidos pero cuya marca SÍ está en
        # prod_marcas).
        if marca:
            params.append(marca)
            extra += (f" AND COALESCE(pm.nombre, pm_fb.nombre, INITCAP(v.marca))"
                      f" = ${len(params)}")
        if tipo:
            params.append(tipo)
            extra += (f" AND COALESCE(pti.nombre, pti_fb.nombre, INITCAP(v.tipo))"
                      f" = ${len(params)}")
        if entalle:
            params.append(entalle)
            extra += f" AND v.entalle = ${len(params)}"

        allowed_sort = {"ultima_fecha_compra", "dias_sin_comprar", "ventas", "cantidad", "compras"}
        col = sort_by if sort_by in allowed_sort else "ultima_fecha_compra"
        direction = "ASC" if sort_dir.lower() == "asc" else "DESC"
        nulls = "NULLS LAST" if direction == "DESC" else "NULLS FIRST"
        params.append(top)

        # Estrategia anti-duplicados:
        # 1) JOIN por marca_id (productos enriquecidos)
        # 2) JOIN fallback por UPPER(nombre) match (productos no-enriquecidos pero
        #    cuya marca/tipo está en el catálogo bajo otra capitalización)
        # 3) Último fallback: INITCAP del texto crudo (para que "ELEMENT PREMIUM"
        #    se agrupe con "Element Premium" cuando la marca no está en catálogo)
        rows = [row_to_dict(r) for r in await conn.fetch(f"""
            SELECT
                COALESCE(pm.nombre, pm_fb.nombre, INITCAP(v.marca), '')  AS marca,
                COALESCE(pti.nombre, pti_fb.nombre, INITCAP(v.tipo), '') AS tipo,
                COALESCE(v.entalle, '') AS entalle,
                MAX(v.date_order)       AS ultima_fecha_compra,
                (CURRENT_DATE - MAX(v.date_order)::date)::int AS dias_sin_comprar,
                COALESCE(SUM(v.qty), 0)            AS cantidad,
                COALESCE(SUM(v.price_subtotal), 0) AS ventas,
                COUNT(DISTINCT v.order_id)         AS compras
            FROM crm.mv_pos_line_cuenta v
            LEFT JOIN produccion.prod_odoo_productos_enriq pe
                ON pe.odoo_template_id = v.product_tmpl_id
            -- Match canónico por id (enriquecido)
            LEFT JOIN produccion.prod_marcas pm  ON pm.id  = pe.marca_id
            LEFT JOIN produccion.prod_tipos  pti ON pti.id = pe.tipo_id
            -- Match fallback por nombre case-insensitive (productos no-enriquecidos)
            LEFT JOIN produccion.prod_marcas pm_fb
                ON pe.marca_id IS NULL AND UPPER(pm_fb.nombre) = UPPER(v.marca)
            LEFT JOIN produccion.prod_tipos  pti_fb
                ON pe.tipo_id IS NULL AND UPPER(pti_fb.nombre) = UPPER(v.tipo)
            WHERE v.cuenta_partner_id = ANY($1)
              {extra}
            GROUP BY
                COALESCE(pm.nombre, pm_fb.nombre, INITCAP(v.marca), ''),
                COALESCE(pti.nombre, pti_fb.nombre, INITCAP(v.tipo), ''),
                v.entalle
            ORDER BY {col} {direction} {nulls}
            LIMIT ${len(params)}
        """, *params)]
    return {"rows": rows}


@router.get("/{cuenta_id}/ventas/clasificacion/detail")
async def get_cuenta_ventas_clasificacion_detail(
    cuenta_id: str,
    marca: str = "",
    tipo: str = "",
    entalle: str = "",
    fecha_desde: str = "",
    fecha_hasta: str = "",
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    _user: dict = Depends(get_current_user),
):
    async with safe_acquire() as conn:
        partner_ids, _ = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return {"rows": [], "page": page, "limit": limit, "has_next": False}

        params: list = [partner_ids]
        extra = ""
        if fecha_desde:
            params.append(fecha_desde)
            extra += f" AND v.date_order >= ${len(params)}::text::timestamptz"
        if fecha_hasta:
            params.append(fecha_hasta + "T23:59:59")
            extra += f" AND v.date_order <= ${len(params)}::text::timestamptz"
        # D4 v3: filtros usan marca/tipo CANÓNICAS (catálogo enriquecido)
        params.append(marca)
        extra += (f" AND COALESCE(pm.nombre, pe.odoo_marca_texto, v.marca, '')"
                  f" = ${len(params)}")
        params.append(tipo)
        extra += (f" AND COALESCE(pti.nombre, pe.odoo_tipo_texto, v.tipo, '')"
                  f" = ${len(params)}")
        params.append(entalle)
        extra += f" AND COALESCE(v.entalle, '') = ${len(params)}"

        offset = (page - 1) * limit
        params += [limit + 1, offset]
        rows = [row_to_dict(r) for r in await conn.fetch(f"""
            SELECT v.line_id,
                   v.order_id, po.name AS order_name,
                   v.date_order AS fecha,
                   COALESCE(pt.name, '') AS modelo_display,
                   v.talla, v.color, v.barcode,
                   v.qty, v.price_unit, v.price_subtotal AS subtotal
            FROM crm.mv_pos_line_cuenta v
            JOIN odoo.v_pos_order_real po ON po.odoo_id = v.order_id
            LEFT JOIN odoo.product_template pt
              ON pt.odoo_id = v.product_tmpl_id AND pt.company_key = 'GLOBAL'
            LEFT JOIN produccion.prod_odoo_productos_enriq pe
              ON pe.odoo_template_id = v.product_tmpl_id
            LEFT JOIN produccion.prod_marcas pm ON pm.id = pe.marca_id
            LEFT JOIN produccion.prod_tipos  pti ON pti.id = pe.tipo_id
            WHERE v.cuenta_partner_id = ANY($1)
              {extra}
            ORDER BY v.date_order DESC, v.line_id DESC
            LIMIT ${len(params) - 1} OFFSET ${len(params)}
        """, *params)]
    has_next = len(rows) > limit
    return {"rows": rows[:limit], "page": page, "limit": limit, "has_next": has_next}


@router.get("/{cuenta_id}/ventas/clasificacion/orders")
async def get_cuenta_ventas_clasificacion_orders(
    cuenta_id: str,
    marca: str = "",
    tipo: str = "",
    entalle: str = "",
    fecha_desde: str = "",
    fecha_hasta: str = "",
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    _user: dict = Depends(get_current_user),
):
    async with safe_acquire() as conn:
        partner_ids, _ = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return {"rows": [], "page": page, "limit": limit, "has_next": False}

        params: list = [partner_ids]
        extra = ""
        if fecha_desde:
            params.append(fecha_desde)
            extra += f" AND v.date_order >= ${len(params)}::text::timestamptz"
        if fecha_hasta:
            params.append(fecha_hasta + "T23:59:59")
            extra += f" AND v.date_order <= ${len(params)}::text::timestamptz"
        # D4 v3: filtros usan marca/tipo CANÓNICAS (catálogo enriquecido)
        params.append(marca)
        extra += (f" AND COALESCE(pm.nombre, pe.odoo_marca_texto, v.marca, '')"
                  f" = ${len(params)}")
        params.append(tipo)
        extra += (f" AND COALESCE(pti.nombre, pe.odoo_tipo_texto, v.tipo, '')"
                  f" = ${len(params)}")
        params.append(entalle)
        extra += f" AND COALESCE(v.entalle, '') = ${len(params)}"

        offset = (page - 1) * limit
        params += [limit + 1, offset]
        rows = [row_to_dict(r) for r in await conn.fetch(f"""
            SELECT v.order_id, po.name AS order_name,
                   MAX(v.date_order) AS date_order,
                   SUM(v.qty) AS qty_item,
                   SUM(v.price_subtotal) AS ventas_item,
                   COUNT(*) AS lines_count
            FROM crm.mv_pos_line_cuenta v
            JOIN odoo.v_pos_order_real po ON po.odoo_id = v.order_id
            LEFT JOIN produccion.prod_odoo_productos_enriq pe
              ON pe.odoo_template_id = v.product_tmpl_id
            LEFT JOIN produccion.prod_marcas pm ON pm.id = pe.marca_id
            LEFT JOIN produccion.prod_tipos  pti ON pti.id = pe.tipo_id
            WHERE v.cuenta_partner_id = ANY($1)
              {extra}
            GROUP BY v.order_id, po.name
            ORDER BY MAX(v.date_order) DESC
            LIMIT ${len(params) - 1} OFFSET ${len(params)}
        """, *params)]
    has_next = len(rows) > limit
    return {"rows": rows[:limit], "page": page, "limit": limit, "has_next": has_next}


@router.get("/{cuenta_id}/ventas/lines")
async def get_cuenta_ventas_lines(
    cuenta_id: str,
    doc_tipo: str = "SALE",
    fecha_desde: str = "",
    fecha_hasta: str = "",
    order_id: Optional[int] = None,  # D4 v3: filtrar por orden específica (drawer)
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    _user: dict = Depends(get_current_user),
):
    async with safe_acquire() as conn:
        partner_ids, _ = await _get_cuenta_partner_ids(conn, cuenta_id)
        # Vistas reales no incluyen reservas; doc_tipo=RESERVA → vacío.
        if not partner_ids or doc_tipo == "RESERVA":
            return {"rows": [], "page": page, "limit": limit, "has_next": False}

        params: list = [partner_ids]
        extra = ""
        if order_id is not None:
            params.append(int(order_id))
            extra += f" AND v.order_id = ${len(params)}"
        if fecha_desde:
            params.append(fecha_desde)
            extra += f" AND v.date_order >= ${len(params)}::text::timestamptz"
        if fecha_hasta:
            params.append(fecha_hasta + "T23:59:59")
            extra += f" AND v.date_order <= ${len(params)}::text::timestamptz"

        offset = (page - 1) * limit
        p2 = list(params) + [limit + 1, offset]
        # D4 v3: marca/tipo enriquecidos desde produccion.prod_marcas / prod_tipos
        # via prod_odoo_productos_enriq (joinea por product_tmpl_id). Fallback
        # al texto crudo (v.marca, v.tipo) si la enriquecida no existe.
        # Subtotal usa price_subtotal_incl (con IGV) — viene de v_pos_line_full.
        rows = [row_to_dict(r) for r in await conn.fetch(f"""
            SELECT v.line_id,
                   v.order_id, po.name AS order_name,
                   v.date_order AS fecha,
                   v.cuenta_partner_id AS owner_partner_id,
                   rp.name AS owner_partner_name,
                   (ov_po.order_id IS NOT NULL) AS has_override,
                   CASE WHEN ov_po.order_id IS NOT NULL THEN rp_orig.name ELSE NULL END
                     AS original_partner_name,
                   v.product_id AS product_product_id,
                   v.product_tmpl_id,
                   COALESCE(pt.name, '') AS modelo_display,
                   -- Enriquecimiento: prefiere catálogo canónico (prod_marcas/prod_tipos),
                   -- fallback a texto crudo de Odoo
                   COALESCE(pm.nombre, pe.odoo_marca_texto, v.marca) AS marca,
                   COALESCE(pti.nombre, pe.odoo_tipo_texto, v.tipo)  AS tipo,
                   v.entalle, v.tela,
                   COALESCE(pt.hilo::text, '') AS hilo,
                   v.talla, v.color, v.barcode,
                   v.qty,
                   COALESCE(vf.price_subtotal_incl, v.price_subtotal) AS subtotal,
                   v.price_subtotal AS subtotal_sin_igv,
                   v.price_unit,
                   {_TIENDA_EXPR}
            FROM crm.mv_pos_line_cuenta v
            JOIN odoo.v_pos_order_real po ON po.odoo_id = v.order_id
            -- price_subtotal_incl viene de v_pos_line_full (sin filtros de venta real,
            -- pero ya tenemos el line_id válido del MV). En v_pos_line_full la PK
            -- es pos_order_line_id (matchea con v.line_id del MV).
            LEFT JOIN odoo.v_pos_line_full vf
              ON vf.pos_order_line_id = v.line_id
            -- Producto enriquecido para marca/tipo canónicos
            LEFT JOIN produccion.prod_odoo_productos_enriq pe
              ON pe.odoo_template_id = v.product_tmpl_id
            LEFT JOIN produccion.prod_marcas pm ON pm.id = pe.marca_id
            LEFT JOIN produccion.prod_tipos  pti ON pti.id = pe.tipo_id
            {_OVERRIDE_JOIN}
            {_TIENDA_JOIN}
            LEFT JOIN odoo.res_partner rp
              ON rp.odoo_id = v.cuenta_partner_id AND rp.company_key = 'GLOBAL'
            LEFT JOIN odoo.res_partner rp_orig
              ON ov_po.order_id IS NOT NULL
              AND rp_orig.odoo_id = po.partner_id AND rp_orig.company_key = 'GLOBAL'
            LEFT JOIN odoo.product_template pt
              ON pt.odoo_id = v.product_tmpl_id AND pt.company_key = 'GLOBAL'
            WHERE v.cuenta_partner_id = ANY($1)
              {extra}
            ORDER BY v.date_order DESC, v.line_id DESC
            LIMIT ${len(p2) - 1} OFFSET ${len(p2)}
        """, *p2)]
    has_next = len(rows) > limit
    return {"rows": rows[:limit], "page": page, "limit": limit, "has_next": has_next}


# ── YoY ────────────────────────────────────────────────────────────────────────

@router.get("/{cuenta_id}/ventas/years-available")
async def get_years_available(
    cuenta_id: str,
    _user: dict = Depends(get_current_user),
):
    """Lista años con ventas reales para esta cuenta (descendente).

    Útil para poblar selectores YoY sin mostrar años vacíos. Consume
    v_pos_line_real (single source of truth de venta real, ya con override
    aplicado vía cuenta_partner_id + ov_po).
    """
    async with safe_acquire() as conn:
        partner_ids, _ = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            current = date.today().year
            return {"years": [], "min_year": None, "max_year": None,
                    "current_year": current}

        rows = await conn.fetch("""
            SELECT DISTINCT v.anio
            FROM crm.mv_pos_line_cuenta v
            WHERE v.cuenta_partner_id = ANY($1)
            ORDER BY v.anio DESC
        """, partner_ids)

    years = [r["anio"] for r in rows]
    return {
        "years": years,
        "min_year": min(years) if years else None,
        "max_year": max(years) if years else None,
        "current_year": date.today().year,
    }


def _safe_date(year: int, month: int, day: int) -> date:
    """Construye date(year, month, day). Si el día no existe en ese mes
    (típicamente 29-feb en año no bisiesto), cae al último día del mes."""
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(day, last_day))


def _calcular_cutoffs(mode: str, year_a: int, year_b: int):
    """Devuelve (cutoff_a, cutoff_b) según el modo de comparación.

    - 'full_year': (None, None) → sin truncamiento (año entero).
    - 'ytd':       same-day cutoff. cutoff_a = hoy del año year_a;
                   cutoff_b = mismo día/mes en year_b.
                   29-feb en año no bisiesto cae al último día del mes.
    """
    if mode == "full_year":
        return None, None
    if mode != "ytd":
        raise HTTPException(400, "mode debe ser 'ytd' o 'full_year'")
    today = date.today()
    return (
        _safe_date(year_a, today.month, today.day),
        _safe_date(year_b, today.month, today.day),
    )


def _build_yoy_base(params: list, year_a: int, year_b: int,
                    cutoff_a: Optional[date], cutoff_b: Optional[date]) -> str:
    """Construye FROM + WHERE para queries YoY consumiendo crm.mv_pos_line_cuenta.

    La matview ya pre-resuelve cuenta_partner_id (con override aplicado) y
    expone columnas anio/mes calculadas → no necesita JOINs adicionales para
    el partner. Se incluyen LEFT JOINs al catálogo enriquecido (Sprint D4 v3)
    para que las queries pueden usar pm/pti/pm_fb/pti_fb en SELECT/WHERE/GROUP.

    Asume al entrar: params == [partner_ids].
    Al salir:        params == [partner_ids, year_a, year_b]              (full_year)
                   o params == [partner_ids, year_a, year_b, cutoff_a, cutoff_b]  (ytd)

    Los SELECT pueden referirse a $2 (year_a) y $3 (year_b) consistentemente.
    """
    params.append(year_a)  # $2
    params.append(year_b)  # $3
    base = """
    FROM crm.mv_pos_line_cuenta v
    LEFT JOIN produccion.prod_odoo_productos_enriq pe
        ON pe.odoo_template_id = v.product_tmpl_id
    LEFT JOIN produccion.prod_marcas pm  ON pm.id  = pe.marca_id
    LEFT JOIN produccion.prod_tipos  pti ON pti.id = pe.tipo_id
    LEFT JOIN produccion.prod_marcas pm_fb
        ON pe.marca_id IS NULL AND UPPER(pm_fb.nombre) = UPPER(v.marca)
    LEFT JOIN produccion.prod_tipos  pti_fb
        ON pe.tipo_id IS NULL AND UPPER(pti_fb.nombre) = UPPER(v.tipo)
    WHERE v.cuenta_partner_id = ANY($1)
    """
    if cutoff_a is not None and cutoff_b is not None:
        params.append(cutoff_a)  # $4
        params.append(cutoff_b)  # $5
        base += """
      AND (
        (v.anio = $2 AND v.date_order::date <= $4)
        OR
        (v.anio = $3 AND v.date_order::date <= $5)
      )
        """
    else:
        base += " AND v.anio IN ($2, $3)"
    return base


def _yoy_month_extra(params: list, from_month: str, to_month: str) -> str:
    extra = ""
    if from_month:
        params.append(int(from_month))
        extra += f" AND v.mes >= ${len(params)}"
    if to_month:
        params.append(int(to_month))
        extra += f" AND v.mes <= ${len(params)}"
    return extra


@router.get("/{cuenta_id}/ventas/yoy/metrics")
async def get_yoy_metrics(
    cuenta_id: str,
    year_a: int = 0, year_b: int = 0,
    mode: str = "ytd",
    from_month: str = "", to_month: str = "",
    _user: dict = Depends(get_current_user),
):
    """KPIs YoY entre year_a y year_b.

    mode='ytd' (default): compara enero-hoy de year_a contra mismo período de year_b.
    mode='full_year':     compara año entero contra año entero (puede dar caídas
                          falsas si year_a aún no terminó).
    """
    if not year_a:
        year_a = date.today().year
    if not year_b:
        year_b = year_a - 1

    cutoff_a, cutoff_b = _calcular_cutoffs(mode, year_a, year_b)

    async with safe_acquire() as conn:
        partner_ids, _ = await _get_cuenta_partner_ids(conn, cuenta_id)
        empty = {"ventas": 0, "unidades": 0, "compras": 0}
        if not partner_ids:
            return {
                "mode": mode,
                "cutoff_date": cutoff_a.isoformat() if cutoff_a else None,
                "year_a": year_a, "year_b": year_b,
                "year_a_data": empty, "year_b_data": empty,
                "delta": {"ventas_pct": 0, "unidades_pct": 0, "compras_pct": 0},
            }

        params: list = [partner_ids]
        base = _build_yoy_base(params, year_a, year_b, cutoff_a, cutoff_b)
        extra = _yoy_month_extra(params, from_month, to_month)
        row = await conn.fetchrow(f"""
            SELECT
              COALESCE(SUM(CASE WHEN v.anio = $2 THEN v.price_subtotal ELSE 0 END), 0) AS ventas_a,
              COALESCE(SUM(CASE WHEN v.anio = $3 THEN v.price_subtotal ELSE 0 END), 0) AS ventas_b,
              COALESCE(SUM(CASE WHEN v.anio = $2 THEN v.qty ELSE 0 END), 0) AS unidades_a,
              COALESCE(SUM(CASE WHEN v.anio = $3 THEN v.qty ELSE 0 END), 0) AS unidades_b,
              COUNT(DISTINCT CASE WHEN v.anio = $2 THEN v.order_id END) AS compras_a,
              COUNT(DISTINCT CASE WHEN v.anio = $3 THEN v.order_id END) AS compras_b
            {base} {extra}
        """, *params)

    va, vb = float(row["ventas_a"]), float(row["ventas_b"])
    ua, ub = float(row["unidades_a"]), float(row["unidades_b"])
    ca, cb = int(row["compras_a"]), int(row["compras_b"])

    def pct(a, b):
        return round((a - b) / b * 100, 1) if b else (100.0 if a else 0)

    return {
        "mode": mode,
        "cutoff_date": cutoff_a.isoformat() if cutoff_a else None,
        "year_a": year_a, "year_b": year_b,
        "year_a_data": {"ventas": va, "unidades": ua, "compras": ca},
        "year_b_data": {"ventas": vb, "unidades": ub, "compras": cb},
        "delta": {"ventas_pct": pct(va, vb), "unidades_pct": pct(ua, ub),
                  "compras_pct": pct(ca, cb)},
    }


@router.get("/{cuenta_id}/ventas/yoy/by-month")
async def get_yoy_by_month(
    cuenta_id: str,
    year_a: int = 0, year_b: int = 0,
    mode: str = "ytd",
    from_month: str = "", to_month: str = "",
    _user: dict = Depends(get_current_user),
):
    if not year_a:
        year_a = date.today().year
    if not year_b:
        year_b = year_a - 1

    cutoff_a, cutoff_b = _calcular_cutoffs(mode, year_a, year_b)

    async with safe_acquire() as conn:
        partner_ids, _ = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return {"mode": mode,
                    "cutoff_date": cutoff_a.isoformat() if cutoff_a else None,
                    "year_a": year_a, "year_b": year_b, "months": []}

        params: list = [partner_ids]
        base = _build_yoy_base(params, year_a, year_b, cutoff_a, cutoff_b)
        extra = _yoy_month_extra(params, from_month, to_month)
        rows = [row_to_dict(r) for r in await conn.fetch(f"""
            SELECT
              v.mes AS month,
              COALESCE(SUM(CASE WHEN v.anio = $2 THEN v.price_subtotal ELSE 0 END), 0) AS ventas_a,
              COALESCE(SUM(CASE WHEN v.anio = $3 THEN v.price_subtotal ELSE 0 END), 0) AS ventas_b,
              COALESCE(SUM(CASE WHEN v.anio = $2 THEN v.qty ELSE 0 END), 0) AS unidades_a,
              COALESCE(SUM(CASE WHEN v.anio = $3 THEN v.qty ELSE 0 END), 0) AS unidades_b,
              COUNT(DISTINCT CASE WHEN v.anio = $2 THEN v.order_id END) AS compras_a,
              COUNT(DISTINCT CASE WHEN v.anio = $3 THEN v.order_id END) AS compras_b
            {base} {extra}
            GROUP BY v.mes
            ORDER BY month
        """, *params)]
    return {"mode": mode,
            "cutoff_date": cutoff_a.isoformat() if cutoff_a else None,
            "year_a": year_a, "year_b": year_b, "months": rows}


@router.get("/{cuenta_id}/ventas/yoy/by-item")
async def get_yoy_by_item(
    cuenta_id: str,
    year_a: int = 0, year_b: int = 0,
    mode: str = "ytd",
    from_month: str = "", to_month: str = "",
    sort_by: str = "ventas_a",
    sort_dir: str = "desc",
    top: int = Query(300, ge=1, le=500),
    _user: dict = Depends(get_current_user),
):
    if not year_a:
        year_a = date.today().year
    if not year_b:
        year_b = year_a - 1

    cutoff_a, cutoff_b = _calcular_cutoffs(mode, year_a, year_b)

    async with safe_acquire() as conn:
        partner_ids, _ = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return {"mode": mode,
                    "cutoff_date": cutoff_a.isoformat() if cutoff_a else None,
                    "year_a": year_a, "year_b": year_b, "rows": []}

        params: list = [partner_ids]
        base = _build_yoy_base(params, year_a, year_b, cutoff_a, cutoff_b)
        extra = _yoy_month_extra(params, from_month, to_month)
        allowed = {"ventas_a", "ventas_b", "var_abs", "unidades_a", "unidades_b",
                   "compras_a", "compras_b"}
        col = sort_by if sort_by in allowed else "ventas_a"
        direction = "ASC" if sort_dir.lower() == "asc" else "DESC"
        params.append(top)
        rows = [row_to_dict(r) for r in await conn.fetch(f"""
            SELECT
              COALESCE(pm.nombre, pm_fb.nombre, INITCAP(v.marca), '')  AS marca,
              COALESCE(pti.nombre, pti_fb.nombre, INITCAP(v.tipo), '') AS tipo,
              COALESCE(v.entalle, '') AS entalle,
              COALESCE(v.tela, '')    AS tela,
              COALESCE(SUM(CASE WHEN v.anio = $2 THEN v.price_subtotal ELSE 0 END), 0) AS ventas_a,
              COALESCE(SUM(CASE WHEN v.anio = $3 THEN v.price_subtotal ELSE 0 END), 0) AS ventas_b,
              COALESCE(SUM(CASE WHEN v.anio = $2 THEN v.price_subtotal ELSE 0 END), 0)
                - COALESCE(SUM(CASE WHEN v.anio = $3 THEN v.price_subtotal ELSE 0 END), 0) AS var_abs,
              COALESCE(SUM(CASE WHEN v.anio = $2 THEN v.qty ELSE 0 END), 0) AS unidades_a,
              COALESCE(SUM(CASE WHEN v.anio = $3 THEN v.qty ELSE 0 END), 0) AS unidades_b,
              COUNT(DISTINCT CASE WHEN v.anio = $2 THEN v.order_id END) AS compras_a,
              COUNT(DISTINCT CASE WHEN v.anio = $3 THEN v.order_id END) AS compras_b
            {base} {extra}
            GROUP BY
              COALESCE(pm.nombre, pm_fb.nombre, INITCAP(v.marca), ''),
              COALESCE(pti.nombre, pti_fb.nombre, INITCAP(v.tipo), ''),
              v.entalle, v.tela
            ORDER BY {col} {direction} NULLS LAST
            LIMIT ${len(params)}
        """, *params)]

    for r in rows:
        vb = r.get("ventas_b", 0)
        va = r.get("ventas_a", 0)
        r["var_pct"] = round((va - vb) / vb * 100, 1) if vb else (100.0 if va else 0)
    return {"mode": mode,
            "cutoff_date": cutoff_a.isoformat() if cutoff_a else None,
            "year_a": year_a, "year_b": year_b, "rows": rows}


@router.get("/{cuenta_id}/ventas/yoy/item-orders")
async def get_yoy_item_orders(
    cuenta_id: str,
    year: int = 0,
    mode: str = "ytd",
    marca: str = "", tipo: str = "", entalle: str = "", tela: str = "",
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    _user: dict = Depends(get_current_user),
):
    """Drill-down: órdenes de un año concreto para una marca/tipo/entalle/tela.

    mode='ytd' (default): trunca al día equivalente al de hoy. Si year=2025 y hoy
                          es 27-abr-2026, devuelve órdenes hasta 27-abr-2025.
    mode='full_year':     todas las órdenes del año.
    """
    if not year:
        year = date.today().year

    cutoff: Optional[date] = None
    if mode == "ytd":
        today = date.today()
        cutoff = _safe_date(year, today.month, today.day)
    elif mode != "full_year":
        raise HTTPException(400, "mode debe ser 'ytd' o 'full_year'")

    async with safe_acquire() as conn:
        partner_ids, _ = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return {"mode": mode,
                    "cutoff_date": cutoff.isoformat() if cutoff else None,
                    "year": year,
                    "rows": [], "page": page, "limit": limit, "has_next": False}

        params: list = [partner_ids, year]
        extra = ""
        if cutoff is not None:
            params.append(cutoff)
            extra += f" AND v.date_order::date <= ${len(params)}"
        # D4 v3: filtros marca/tipo usan canónica enriquecida; entalle/tela siguen raw
        if marca:
            params.append(marca)
            extra += (f" AND COALESCE(pm.nombre, pm_fb.nombre, INITCAP(v.marca), '')"
                      f" = ${len(params)}")
        else:
            extra += " AND COALESCE(pm.nombre, pm_fb.nombre, INITCAP(v.marca), '') = ''"
        if tipo:
            params.append(tipo)
            extra += (f" AND COALESCE(pti.nombre, pti_fb.nombre, INITCAP(v.tipo), '')"
                      f" = ${len(params)}")
        else:
            extra += " AND COALESCE(pti.nombre, pti_fb.nombre, INITCAP(v.tipo), '') = ''"
        for val, col in [(entalle, "v.entalle"), (tela, "v.tela")]:
            if val:
                params.append(val)
                extra += f" AND COALESCE({col}, '') = ${len(params)}"
            else:
                extra += f" AND COALESCE({col}, '') = ''"

        offset = (page - 1) * limit
        params += [limit + 1, offset]
        rows = [row_to_dict(r) for r in await conn.fetch(f"""
            SELECT v.order_id, po.name AS order_name,
                   MAX(v.date_order) AS date_order,
                   SUM(v.qty) AS qty_item,
                   SUM(v.price_subtotal) AS ventas_item,
                   COUNT(*) AS lines_count
            FROM crm.mv_pos_line_cuenta v
            JOIN odoo.v_pos_order_real po ON po.odoo_id = v.order_id
            LEFT JOIN produccion.prod_odoo_productos_enriq pe
                ON pe.odoo_template_id = v.product_tmpl_id
            LEFT JOIN produccion.prod_marcas pm  ON pm.id  = pe.marca_id
            LEFT JOIN produccion.prod_tipos  pti ON pti.id = pe.tipo_id
            LEFT JOIN produccion.prod_marcas pm_fb
                ON pe.marca_id IS NULL AND UPPER(pm_fb.nombre) = UPPER(v.marca)
            LEFT JOIN produccion.prod_tipos  pti_fb
                ON pe.tipo_id IS NULL AND UPPER(pti_fb.nombre) = UPPER(v.tipo)
            WHERE v.cuenta_partner_id = ANY($1)
              AND v.anio = $2
              {extra}
            GROUP BY v.order_id, po.name
            ORDER BY MAX(v.date_order) DESC
            LIMIT ${len(params) - 1} OFFSET ${len(params)}
        """, *params)]
    has_next = len(rows) > limit
    return {"mode": mode,
            "cutoff_date": cutoff.isoformat() if cutoff else None,
            "year": year,
            "rows": rows[:limit], "page": page, "limit": limit, "has_next": has_next}


# ── Analítica ──────────────────────────────────────────────────────────────────

_ANALITICA_BASE = """
    FROM crm.mv_pos_line_cuenta v
    WHERE v.cuenta_partner_id = ANY($1)
"""


@router.get("/{cuenta_id}/ventas/analitica/frecuencia")
async def get_analitica_frecuencia(
    cuenta_id: str,
    _user: dict = Depends(get_current_user),
):
    async with safe_acquire() as conn:
        partner_ids, _ = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return {
                "compras_30d": 0, "compras_60d": 0, "compras_90d": 0,
                "unidades_30d": 0, "unidades_60d": 0, "unidades_90d": 0,
                "dias_sin_comprar": None, "frecuencia_promedio": None,
            }
        row = await conn.fetchrow(f"""
            SELECT
              COUNT(DISTINCT CASE WHEN v.date_order >= CURRENT_DATE - 30
                                  THEN v.order_id END) AS compras_30d,
              COUNT(DISTINCT CASE WHEN v.date_order >= CURRENT_DATE - 60
                                  THEN v.order_id END) AS compras_60d,
              COUNT(DISTINCT CASE WHEN v.date_order >= CURRENT_DATE - 90
                                  THEN v.order_id END) AS compras_90d,
              COALESCE(SUM(CASE WHEN v.date_order >= CURRENT_DATE - 30
                               THEN v.qty ELSE 0 END), 0) AS unidades_30d,
              COALESCE(SUM(CASE WHEN v.date_order >= CURRENT_DATE - 60
                               THEN v.qty ELSE 0 END), 0) AS unidades_60d,
              COALESCE(SUM(CASE WHEN v.date_order >= CURRENT_DATE - 90
                               THEN v.qty ELSE 0 END), 0) AS unidades_90d,
              (CURRENT_DATE - MAX(v.date_order)::date)::int AS dias_sin_comprar,
              MAX(v.date_order) AS ultima_compra
            {_ANALITICA_BASE}
        """, partner_ids)

        dates_rows = await conn.fetch(f"""
            SELECT DISTINCT v.date_order::date AS d
            {_ANALITICA_BASE} AND v.date_order >= CURRENT_DATE - 365
            ORDER BY d
        """, partner_ids)
        dates = [r["d"] for r in dates_rows]
        freq = None
        if len(dates) >= 2:
            gaps = [(dates[i + 1] - dates[i]).days for i in range(len(dates) - 1)]
            freq = round(sum(gaps) / len(gaps), 1) if gaps else None

    return {
        "compras_30d": int(row["compras_30d"]),
        "compras_60d": int(row["compras_60d"]),
        "compras_90d": int(row["compras_90d"]),
        "unidades_30d": float(row["unidades_30d"]),
        "unidades_60d": float(row["unidades_60d"]),
        "unidades_90d": float(row["unidades_90d"]),
        "dias_sin_comprar": int(row["dias_sin_comprar"]) if row["dias_sin_comprar"] is not None else None,
        "ultima_compra": row["ultima_compra"].isoformat() if row["ultima_compra"] else None,
        "frecuencia_promedio": freq,
    }


@router.get("/{cuenta_id}/ventas/analitica/tops")
async def get_analitica_tops(
    cuenta_id: str,
    dias: int = Query(90, ge=1, le=730),
    top: int = Query(10, ge=1, le=50),
    _user: dict = Depends(get_current_user),
):
    async with safe_acquire() as conn:
        partner_ids, _ = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return {"modelos": [], "tallas": [], "colores": []}
        date_filter = f" AND v.date_order >= CURRENT_DATE - {int(dias)}"

        # Modelos: JOIN con product_template para `pt.name` (sólo enriquecimiento).
        modelos = [row_to_dict(r) for r in await conn.fetch(f"""
            SELECT COALESCE(pt.name, '') AS nombre,
                   COALESCE(SUM(v.qty), 0) AS qty,
                   COALESCE(SUM(v.price_subtotal), 0) AS ventas,
                   COUNT(DISTINCT v.order_id) AS ordenes
            FROM crm.mv_pos_line_cuenta v
            LEFT JOIN odoo.product_template pt
              ON pt.odoo_id = v.product_tmpl_id AND pt.company_key = 'GLOBAL'
            WHERE v.cuenta_partner_id = ANY($1)
              {date_filter}
            GROUP BY pt.name ORDER BY qty DESC LIMIT $2
        """, partner_ids, top)]

        tallas = [row_to_dict(r) for r in await conn.fetch(f"""
            SELECT COALESCE(v.talla, '') AS talla,
                   COALESCE(SUM(v.qty), 0) AS qty,
                   COALESCE(SUM(v.price_subtotal), 0) AS ventas
            {_ANALITICA_BASE} {date_filter}
              AND v.talla IS NOT NULL AND v.talla != ''
            GROUP BY v.talla ORDER BY qty DESC LIMIT $2
        """, partner_ids, top)]

        colores = [row_to_dict(r) for r in await conn.fetch(f"""
            SELECT COALESCE(v.color, '') AS color,
                   COALESCE(SUM(v.qty), 0) AS qty,
                   COALESCE(SUM(v.price_subtotal), 0) AS ventas
            {_ANALITICA_BASE} {date_filter}
              AND v.color IS NOT NULL AND v.color != ''
            GROUP BY v.color ORDER BY qty DESC LIMIT $2
        """, partner_ids, top)]

    return {"modelos": modelos, "tallas": tallas, "colores": colores}


# ── Créditos ───────────────────────────────────────────────────────────────────

@router.get("/{cuenta_id}/creditos/metrics")
async def get_cuenta_creditos_metrics(
    cuenta_id: str,
    fecha_desde: str = "",
    fecha_hasta: str = "",
    state: str = "",
    _user: dict = Depends(get_current_user),
):
    async with safe_acquire() as conn:
        partner_ids, _ = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return {"invoices_count": 0, "qty_total": 0, "saldo_total": 0,
                    "total_facturado": 0, "last_invoice_date": None}

        params: list = [partner_ids]
        extra = ""
        if state:
            params.append(state)
            extra += f" AND ic.state = ${len(params)}"
        if fecha_desde:
            params.append(fecha_desde)
            extra += f" AND ic.date_invoice >= ${len(params)}::text::date"
        if fecha_hasta:
            params.append(fecha_hasta)
            extra += f" AND ic.date_invoice <= ${len(params)}::text::date"

        row = await conn.fetchrow(f"""
            SELECT COUNT(*) AS invoices_count,
                   COALESCE(SUM(ic.amount_residual), 0) AS saldo_total,
                   COALESCE(SUM(ic.amount_total), 0) AS total_facturado,
                   MAX(ic.date_invoice) AS last_invoice_date,
                   -- Vencimiento más antiguo y más próximo entre facturas abiertas
                   -- (saldo>0). Útil para reportes de cobranzas.
                   MIN(ic.date_due) FILTER (WHERE ic.amount_residual > 0) AS earliest_due_date,
                   MAX(ic.date_due) FILTER (WHERE ic.amount_residual > 0) AS latest_due_date
            FROM odoo.account_invoice_credit ic
            WHERE ic.partner_id = ANY($1) {extra}
        """, *params)

        qty_row = await conn.fetchrow(f"""
            SELECT COALESCE(SUM(il.quantity), 0) AS qty_total
            FROM odoo.account_invoice_credit_line il
            JOIN odoo.account_invoice_credit ic ON il.invoice_id = ic.odoo_id
            WHERE ic.partner_id = ANY($1) {extra}
        """, *params)

    return {
        "invoices_count": row["invoices_count"],
        "qty_total": float(qty_row["qty_total"]),
        "saldo_total": float(row["saldo_total"]),
        "total_facturado": float(row["total_facturado"]),
        "last_invoice_date": row["last_invoice_date"].isoformat() if row["last_invoice_date"] else None,
        "earliest_due_date": row["earliest_due_date"].isoformat() if row["earliest_due_date"] else None,
        "latest_due_date":   row["latest_due_date"].isoformat()   if row["latest_due_date"]   else None,
    }


@router.get("/{cuenta_id}/creditos/invoices")
async def get_cuenta_creditos_invoices(
    cuenta_id: str,
    fecha_desde: str = "",
    fecha_hasta: str = "",
    state: str = "",
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    _user: dict = Depends(get_current_user),
):
    async with safe_acquire() as conn:
        partner_ids, _ = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return {"metrics": {"invoices_count": 0, "qty_total": 0, "saldo_total": 0},
                    "rows": [], "page": page, "limit": limit, "has_next": False}

        params: list = [partner_ids]
        extra = ""
        if state:
            params.append(state)
            extra += f" AND ic.state = ${len(params)}"
        if fecha_desde:
            params.append(fecha_desde)
            extra += f" AND ic.date_invoice >= ${len(params)}::text::date"
        if fecha_hasta:
            params.append(fecha_hasta)
            extra += f" AND ic.date_invoice <= ${len(params)}::text::date"

        met = await conn.fetchrow(f"""
            SELECT COUNT(*) AS invoices_count,
                   COALESCE(SUM(ic.amount_residual), 0) AS saldo_total
            FROM odoo.account_invoice_credit ic
            WHERE ic.partner_id = ANY($1) {extra}
        """, *params)

        offset = (page - 1) * limit
        p2 = list(params) + [limit + 1, offset]
        rows = [row_to_dict(r) for r in await conn.fetch(f"""
            SELECT ic.odoo_id AS invoice_id, ic.number AS invoice_number,
                   ic.date_invoice, ic.date_due, ic.state, ic.partner_id,
                   ic.company_key AS empresa,
                   rp.name AS partner_name, rp.name AS owner_partner_name,
                   ic.amount_total, ic.amount_residual,
                   COALESCE(agg.qty_total, 0) AS qty_total,
                   COALESCE(agg.lines_count, 0) AS lines_count
            FROM odoo.account_invoice_credit ic
            LEFT JOIN (
                SELECT invoice_id, SUM(quantity) AS qty_total, COUNT(*) AS lines_count
                FROM odoo.account_invoice_credit_line GROUP BY invoice_id
            ) agg ON agg.invoice_id = ic.odoo_id
            LEFT JOIN odoo.res_partner rp
              ON rp.odoo_id = ic.partner_id AND rp.company_key = 'GLOBAL'
            WHERE ic.partner_id = ANY($1) {extra}
            ORDER BY ic.date_invoice DESC, ic.odoo_id DESC
            LIMIT ${len(p2) - 1} OFFSET ${len(p2)}
        """, *p2)]

    has_next = len(rows) > limit
    return {
        "metrics": {
            "invoices_count": met["invoices_count"],
            "qty_total": 0,
            "saldo_total": float(met["saldo_total"]),
        },
        "rows": rows[:limit], "page": page, "limit": limit, "has_next": has_next,
    }


@router.get("/{cuenta_id}/creditos/lines")
async def get_cuenta_creditos_lines(
    cuenta_id: str,
    fecha_desde: str = "",
    fecha_hasta: str = "",
    state: str = "",
    invoice_id: Optional[int] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    _user: dict = Depends(get_current_user),
):
    async with safe_acquire() as conn:
        partner_ids, _ = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return {"rows": [], "page": page, "limit": limit, "has_next": False}

        params: list = [partner_ids]
        extra = ""
        if state:
            params.append(state)
            extra += f" AND ic.state = ${len(params)}"
        if fecha_desde:
            params.append(fecha_desde)
            extra += f" AND ic.date_invoice >= ${len(params)}::text::date"
        if fecha_hasta:
            params.append(fecha_hasta)
            extra += f" AND ic.date_invoice <= ${len(params)}::text::date"
        if invoice_id is not None:
            params.append(invoice_id)
            extra += f" AND ic.odoo_id = ${len(params)}"

        offset = (page - 1) * limit
        p2 = list(params) + [limit + 1, offset]
        rows = [row_to_dict(r) for r in await conn.fetch(f"""
            SELECT il.odoo_id AS line_id,
                   ic.odoo_id AS invoice_id, ic.number AS invoice_number,
                   ic.date_invoice, ic.date_due, ic.state,
                   ic.partner_id, rp.name AS partner_name,
                   ic.amount_total, ic.amount_residual,
                   il.product_id, il.name AS line_description,
                   il.quantity AS qty, il.price_unit, il.price_subtotal,
                   -- price_unit en este Odoo ya viene CON IGV → unit × qty da el monto
                   -- exacto que se facturó (calza con ic.amount_total al sumar líneas).
                   ROUND(il.price_unit * il.quantity * (1 - COALESCE(il.discount,0)/100), 2) AS price_subtotal_incl,
                   ROUND(il.price_unit * (1 - COALESCE(il.discount,0)/100), 2) AS price_unit_incl,
                   COALESCE(pt.name, il.name, '') AS modelo_display,
                   vv.product_tmpl_id, vv.barcode, vv.talla, vv.color,
                   COALESCE(pm.nombre, pm_fb.nombre, INITCAP(pt.marca), pt.marca, '') AS marca,
                   COALESCE(pti.nombre, pti_fb.nombre, INITCAP(pt.tipo), pt.tipo, '') AS tipo,
                   pt.entalle, pt.tela,
                   COALESCE(pt.hilo::text, '') AS hilo
            FROM odoo.account_invoice_credit_line il
            JOIN odoo.account_invoice_credit ic ON il.invoice_id = ic.odoo_id
            LEFT JOIN odoo.res_partner rp
              ON rp.odoo_id = ic.partner_id AND rp.company_key = 'GLOBAL'
            LEFT JOIN odoo.v_product_variant_flat vv
              ON vv.product_product_id = il.product_id AND vv.company_key = 'GLOBAL'
            LEFT JOIN odoo.product_template pt
              ON pt.odoo_id = vv.product_tmpl_id AND pt.company_key = 'GLOBAL'
            LEFT JOIN produccion.prod_odoo_productos_enriq pe
              ON pe.odoo_template_id = vv.product_tmpl_id
            LEFT JOIN produccion.prod_marcas pm  ON pm.id = pe.marca_id
            LEFT JOIN produccion.prod_tipos  pti ON pti.id = pe.tipo_id
            LEFT JOIN produccion.prod_marcas pm_fb
              ON pe.marca_id IS NULL AND UPPER(pm_fb.nombre) = UPPER(pt.marca)
            LEFT JOIN produccion.prod_tipos  pti_fb
              ON pe.tipo_id IS NULL AND UPPER(pti_fb.nombre) = UPPER(pt.tipo)
            WHERE ic.partner_id = ANY($1) {extra}
            ORDER BY ic.date_invoice DESC, il.odoo_id DESC
            LIMIT ${len(p2) - 1} OFFSET ${len(p2)}
        """, *p2)]

    has_next = len(rows) > limit
    return {"rows": rows[:limit], "page": page, "limit": limit, "has_next": has_next}


# ── Reservas ───────────────────────────────────────────────────────────────────
#
# "Reserva pendiente" = espejo EXACTO de venta real (v_pos_order_real)
# pero con `reserva = true` en lugar de false, MÁS la defensa NOT EXISTS de
# ventas/helpers.py para descartar reservas ya concretadas (el sync de Odoo a
# veces no actualiza reserva_use_id y deja "fantasmas").
#
# Filtros aplicados (idénticos a venta real, salvo flag invertido):
#   1. order_cancel = false     — orden no cancelada
#   2. is_cancel    = false     — header no cancelado
#   3. reserva      = TRUE      ← INVERTIDO vs venta real
#   4. reserva_use_id IS NULL/0 — flag no marcado como usada
#   5. NOT (NV+Factura espejo)  — anti-doble-conteo (igual que venta real)
#   6. NOT EXISTS concretada    — DEFENSA: si hay una NO-reserva del mismo
#                                  cliente/monto/tienda en ±7,+14 días con
#                                  state ∈ (invoiced,paid,done) → ya se concretó
#   7. producto válido          — sin correa/bolsa/paneton/etc. (línea)
#   8. NOT estado='excluido'    — clasificación productiva (línea)
#
# Health: ok < 30d, warn < 90d, crit > 90d (negocio textil — reservas viejas
# suelen ser olvidadas y conviene contactarlas).

_RESERVA_BUCKET_SQL = """
    CASE
        WHEN EXTRACT(DAY FROM (NOW() - po.date_order)) < 30 THEN 'ok'
        WHEN EXTRACT(DAY FROM (NOW() - po.date_order)) < 90 THEN 'warn'
        ELSE 'crit'
    END
""".strip()

# WHERE clause completo a nivel ORDEN para reservas pendientes.
# (filtro por partner_id va separado: `AND po.partner_id = ANY($N)`)
_RESERVA_PENDIENTE_ORDEN_WHERE = """
    -- 1,2: no cancelada
    (po.order_cancel = false OR po.order_cancel IS NULL)
    AND (po.is_cancel    = false OR po.is_cancel    IS NULL)
    -- 3,4: SÍ es reserva, no consumida
    AND po.reserva = true
    AND (po.reserva_use_id = 0 OR po.reserva_use_id IS NULL)
    -- 5: anti-doble-conteo NV+Factura (idéntico a v_pos_order_real)
    AND NOT (
        po.state = 'done'
        AND EXISTS (
            SELECT 1 FROM odoo.pos_order po2
            WHERE po2.state = 'invoiced'
              AND po2.amount_total = po.amount_total
              AND po2.location_id = po.location_id
              AND COALESCE(po2.x_cliente_principal, po2.partner_id)
                  = COALESCE(po.x_cliente_principal, po.partner_id)
              AND po2.date_order BETWEEN po.date_order - INTERVAL '7 days'
                                     AND po.date_order + INTERVAL '7 days'
              AND po2.odoo_id <> po.odoo_id
              AND po2.company_key = po.company_key
        )
    )
    -- 6: defensa anti-fantasma (helpers.py): la reserva ya se concretó
    AND NOT EXISTS (
        SELECT 1 FROM odoo.pos_order po_concretada
        WHERE po_concretada.amount_total = po.amount_total
          AND po_concretada.location_id = po.location_id
          AND COALESCE(po_concretada.x_cliente_principal, po_concretada.partner_id)
              = COALESCE(po.x_cliente_principal, po.partner_id)
          AND po_concretada.date_order BETWEEN po.date_order - INTERVAL '7 days'
                                           AND po.date_order + INTERVAL '14 days'
          AND po_concretada.odoo_id <> po.odoo_id
          AND po_concretada.company_key = po.company_key
          AND (po_concretada.reserva IS NOT TRUE)
          AND po_concretada.state IN ('invoiced', 'paid', 'done')
          AND (po_concretada.order_cancel IS NULL OR po_concretada.order_cancel = false)
    )
""".strip()

# Filtros a nivel línea (espejo de v_pos_line_real):
# 7,8: producto válido (no basura, no excluido)
_RESERVA_PENDIENTE_LINEA_WHERE = """
    pol.product_id NOT IN (
        SELECT pp.odoo_id
        FROM odoo.product_product pp
        JOIN odoo.product_template pt_ex ON pt_ex.odoo_id = pp.product_tmpl_id
                                        AND pt_ex.company_key = pp.company_key
        WHERE pt_ex.name ILIKE ANY (ARRAY[
            '%correa%', '%bolsa%', '%paneton%', '%probador%', '%provador%',
            '%saco%', '%lapicero%', '%publicitario%', '%envio%', '%envío%',
            '%tallero%'
        ])
        OR (pt_ex.purchase_ok = true AND (pt_ex.marca IS NULL OR pt_ex.marca = ''))
    )
    AND NOT EXISTS (
        SELECT 1 FROM produccion.prod_odoo_productos_enriq pe_excl
        JOIN odoo.product_product pp_excl ON pp_excl.odoo_id = pol.product_id
        WHERE pe_excl.odoo_template_id = pp_excl.product_tmpl_id
          AND pe_excl.estado = 'excluido'
    )
""".strip()


@router.get("/{cuenta_id}/reservas/metrics")
async def get_cuenta_reservas_metrics(
    cuenta_id: str,
    _user: dict = Depends(get_current_user),
):
    async with safe_acquire() as conn:
        partner_ids, _ = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return {"reservas_count": 0, "monto_total": 0,
                    "qty_total": 0, "dias_promedio": None,
                    "mas_antigua_dias": None, "mas_antigua_fecha": None}

        row = await conn.fetchrow(f"""
            SELECT COUNT(*) AS reservas_count,
                   COALESCE(SUM(po.amount_total), 0) AS monto_total,
                   COALESCE(AVG(EXTRACT(DAY FROM (NOW() - po.date_order))), 0) AS dias_promedio,
                   COALESCE(MAX(EXTRACT(DAY FROM (NOW() - po.date_order))), 0) AS mas_antigua_dias,
                   MIN(po.date_order) AS mas_antigua_fecha
            FROM odoo.pos_order po
            WHERE po.partner_id = ANY($1)
              AND {_RESERVA_PENDIENTE_ORDEN_WHERE}
        """, partner_ids)

        qty_row = await conn.fetchrow(f"""
            SELECT COALESCE(SUM(pol.qty), 0) AS qty_total
            FROM odoo.pos_order po
            JOIN odoo.pos_order_line pol ON pol.order_id = po.odoo_id
            WHERE po.partner_id = ANY($1)
              AND {_RESERVA_PENDIENTE_ORDEN_WHERE}
              AND {_RESERVA_PENDIENTE_LINEA_WHERE}
        """, partner_ids)

    return {
        "reservas_count": row["reservas_count"],
        "monto_total": float(row["monto_total"]),
        "qty_total": float(qty_row["qty_total"]),
        "dias_promedio": int(row["dias_promedio"]) if row["dias_promedio"] else None,
        "mas_antigua_dias": int(row["mas_antigua_dias"]) if row["mas_antigua_dias"] else None,
        "mas_antigua_fecha": row["mas_antigua_fecha"].isoformat() if row["mas_antigua_fecha"] else None,
    }


@router.get("/{cuenta_id}/reservas/orders")
async def get_cuenta_reservas_orders(
    cuenta_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    _user: dict = Depends(get_current_user),
):
    """Lista órdenes de reserva pendientes para esta cuenta.

    OPTIMIZACIÓN (anti-cascada-timeout): en vez de hacer NOT EXISTS contra
    toda `pos_order` (142k+ filas, seq scan 60s+), primero filtramos las
    reservas del partner (1-100 filas típicamente), y SOLO sobre ese set
    chico aplicamos el anti-doble-conteo. La query baja de >60s a <2s.
    """
    async with safe_acquire() as conn:
        partner_ids, _ = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return {"rows": [], "page": page, "limit": limit, "has_next": False}

        offset = (page - 1) * limit
        rows = [row_to_dict(r) for r in await conn.fetch(f"""
            WITH reservas_candidatas AS (
                -- Set chico: solo reservas pendientes de ESTE partner.
                -- Acá NO aplicamos anti-doble-conteo todavía (queda para el
                -- siguiente CTE) para no hacer scan completo prematuramente.
                SELECT po.*
                FROM odoo.pos_order po
                WHERE po.partner_id = ANY($1)
                  AND (po.order_cancel = false OR po.order_cancel IS NULL)
                  AND (po.is_cancel    = false OR po.is_cancel    IS NULL)
                  AND po.reserva = true
                  AND (po.reserva_use_id = 0 OR po.reserva_use_id IS NULL)
            ),
            con_lineas AS (
                -- Filtra reservas que tienen al menos una línea válida
                SELECT rc.*,
                       agg.lines_count, agg.qty_total
                FROM reservas_candidatas rc
                JOIN (
                    SELECT pol.order_id,
                           COUNT(*) AS lines_count,
                           SUM(pol.qty) AS qty_total
                    FROM odoo.pos_order_line pol
                    WHERE pol.order_id IN (SELECT odoo_id FROM reservas_candidatas)
                      AND {_RESERVA_PENDIENTE_LINEA_WHERE}
                    GROUP BY pol.order_id
                ) agg ON agg.order_id = rc.odoo_id
                WHERE agg.lines_count > 0
            ),
            sin_duplicados AS (
                -- Ahora aplicamos anti-doble-conteo solo sobre nuestro set
                -- chico (con_lineas), NO contra toda pos_order.
                SELECT po.*
                FROM con_lineas po
                WHERE NOT (
                    po.state = 'done' AND EXISTS (
                        SELECT 1 FROM odoo.pos_order po2
                        WHERE po2.state = 'invoiced'
                          AND po2.amount_total = po.amount_total
                          AND po2.location_id = po.location_id
                          AND COALESCE(po2.x_cliente_principal, po2.partner_id)
                              = COALESCE(po.x_cliente_principal, po.partner_id)
                          AND po2.date_order BETWEEN po.date_order - INTERVAL '7 days'
                                                 AND po.date_order + INTERVAL '7 days'
                          AND po2.odoo_id <> po.odoo_id
                          AND po2.company_key = po.company_key
                    )
                )
                AND NOT EXISTS (
                    SELECT 1 FROM odoo.pos_order po_concretada
                    WHERE po_concretada.amount_total = po.amount_total
                      AND po_concretada.location_id = po.location_id
                      AND COALESCE(po_concretada.x_cliente_principal, po_concretada.partner_id)
                          = COALESCE(po.x_cliente_principal, po.partner_id)
                      AND po_concretada.date_order BETWEEN po.date_order - INTERVAL '7 days'
                                                       AND po.date_order + INTERVAL '14 days'
                      AND po_concretada.odoo_id <> po.odoo_id
                      AND po_concretada.company_key = po.company_key
                      AND (po_concretada.reserva IS NOT TRUE)
                      AND po_concretada.state IN ('invoiced', 'paid', 'done')
                      AND (po_concretada.order_cancel IS NULL OR po_concretada.order_cancel = false)
                )
            )
            SELECT po.odoo_id AS order_id,
                   po.name AS order_name,
                   po.date_order,
                   po.amount_total,
                   po.tipo_comp,
                   po.num_comp,
                   po.state,
                   po.partner_id,
                   po.company_key AS empresa,
                   rp.name AS partner_name,
                   EXTRACT(DAY FROM (NOW() - po.date_order))::int AS dias_reserva,
                   {_RESERVA_BUCKET_SQL} AS estado_reserva,
                   COALESCE(uv_vend.name, uv_caj.name) AS vendedor,
                   {_TIENDA_EXPR.replace('AS tienda','').strip()} AS tienda,
                   po.lines_count,
                   po.qty_total
            FROM sin_duplicados po
            LEFT JOIN odoo.res_partner rp
              ON rp.odoo_id = po.partner_id AND rp.company_key = 'GLOBAL'
            LEFT JOIN odoo.res_users uv_vend ON uv_vend.odoo_id = po.vendedor_id
            LEFT JOIN odoo.res_users uv_caj  ON uv_caj.odoo_id  = po.user_id
            {_TIENDA_JOIN}
            ORDER BY po.date_order DESC, po.odoo_id DESC
            LIMIT $2 OFFSET $3
        """, partner_ids, limit + 1, offset)]

    has_next = len(rows) > limit
    return {"rows": rows[:limit], "page": page, "limit": limit, "has_next": has_next}


@router.get("/{cuenta_id}/reservas/lines")
async def get_cuenta_reservas_lines(
    cuenta_id: str,
    order_id: Optional[int] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    _user: dict = Depends(get_current_user),
):
    """Líneas de reserva. Si `order_id` viene, filtra a esa orden (drawer)."""
    async with safe_acquire() as conn:
        partner_ids, _ = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return {"rows": [], "page": page, "limit": limit, "has_next": False}

        params: list = [partner_ids]
        extra = ""
        if order_id is not None:
            params.append(int(order_id))
            extra += f" AND po.odoo_id = ${len(params)}"

        offset = (page - 1) * limit
        p2 = list(params) + [limit + 1, offset]
        rows = [row_to_dict(r) for r in await conn.fetch(f"""
            SELECT pol.odoo_id AS line_id,
                   po.odoo_id AS order_id,
                   po.name AS order_name,
                   po.date_order,
                   po.amount_total,
                   pol.product_id,
                   pol.qty,
                   pol.price_unit,
                   pol.discount,
                   COALESCE(vf.price_subtotal_incl, pol.price_subtotal) AS subtotal,
                   pol.price_subtotal AS subtotal_sin_igv,
                   COALESCE(pt.name, '') AS modelo_display,
                   vv.product_tmpl_id, vv.barcode, vv.talla, vv.color,
                   COALESCE(pm.nombre, pm_fb.nombre, INITCAP(pt.marca), pt.marca, '') AS marca,
                   COALESCE(pti.nombre, pti_fb.nombre, INITCAP(pt.tipo), pt.tipo, '') AS tipo,
                   pt.entalle, pt.tela
            FROM odoo.pos_order po
            JOIN odoo.pos_order_line pol ON pol.order_id = po.odoo_id
            LEFT JOIN odoo.v_pos_line_full vf
              ON vf.pos_order_line_id = pol.odoo_id
            LEFT JOIN odoo.v_product_variant_flat vv
              ON vv.product_product_id = pol.product_id AND vv.company_key = 'GLOBAL'
            LEFT JOIN odoo.product_template pt
              ON pt.odoo_id = vv.product_tmpl_id AND pt.company_key = 'GLOBAL'
            LEFT JOIN produccion.prod_odoo_productos_enriq pe
              ON pe.odoo_template_id = vv.product_tmpl_id
            LEFT JOIN produccion.prod_marcas pm  ON pm.id = pe.marca_id
            LEFT JOIN produccion.prod_tipos  pti ON pti.id = pe.tipo_id
            LEFT JOIN produccion.prod_marcas pm_fb
              ON pe.marca_id IS NULL AND UPPER(pm_fb.nombre) = UPPER(pt.marca)
            LEFT JOIN produccion.prod_tipos  pti_fb
              ON pe.tipo_id IS NULL AND UPPER(pti_fb.nombre) = UPPER(pt.tipo)
            WHERE po.partner_id = ANY($1)
              AND {_RESERVA_PENDIENTE_ORDEN_WHERE}
              AND {_RESERVA_PENDIENTE_LINEA_WHERE}
              {extra}
            ORDER BY po.date_order DESC, pol.odoo_id ASC
            LIMIT ${len(p2) - 1} OFFSET ${len(p2)}
        """, *p2)]

    has_next = len(rows) > limit
    return {"rows": rows[:limit], "page": page, "limit": limit, "has_next": has_next}


# ── Interacciones y tareas (CRUD operativo — lógica igual al crm-main) ─────────

@router.get("/{cuenta_id}/interacciones")
async def get_cuenta_interacciones(
    cuenta_id: str,
    limit: Optional[int] = Query(None, ge=1, le=500),  # CRM-D12: opcional, ej. ?limit=3
    _user: dict = Depends(get_current_user),
):
    odoo_id = int(cuenta_id)
    async with safe_acquire() as conn:
        cuenta = await conn.fetchrow(
            "SELECT id FROM crm.cuenta WHERE cuenta_partner_odoo_id = $1", odoo_id
        )
        if not cuenta:
            return []
        if limit is not None:
            rows = await conn.fetch(
                "SELECT * FROM crm.interaccion WHERE cuenta_id = $1 "
                "ORDER BY fecha DESC LIMIT $2",
                cuenta["id"], limit,
            )
        else:
            rows = await conn.fetch(
                "SELECT * FROM crm.interaccion WHERE cuenta_id = $1 ORDER BY fecha DESC",
                cuenta["id"],
            )
    return [row_to_dict(r) for r in rows]


@router.post("/{cuenta_id}/interacciones")
async def create_interaccion(
    cuenta_id: str,
    data: InteraccionInput,
    user: dict = Depends(get_current_user),
):
    from datetime import datetime as _dt
    odoo_id = int(cuenta_id)
    username = user.get("username", "unknown") if isinstance(user, dict) else "unknown"

    happened = None
    if data.happened_at:
        happened = _dt.fromisoformat(data.happened_at.replace("Z", "+00:00"))
    else:
        happened = _dt.utcnow()

    async with safe_acquire() as conn:
        await conn.execute(
            "INSERT INTO crm.cuenta (cuenta_partner_odoo_id) VALUES ($1)"
            " ON CONFLICT DO NOTHING", odoo_id
        )
        cuenta = await conn.fetchrow(
            "SELECT id FROM crm.cuenta WHERE cuenta_partner_odoo_id = $1", odoo_id
        )
        if not cuenta:
            raise HTTPException(404, "Cuenta no encontrada")

        # Resolver UUID del contacto: si vino partner_odoo_id, lookup; si vino UUID, úsalo.
        contacto_uuid = data.contacto_id
        if not contacto_uuid and data.contacto_partner_odoo_id:
            crow = await conn.fetchrow(
                "SELECT id FROM crm.contacto WHERE contacto_partner_odoo_id = $1",
                data.contacto_partner_odoo_id,
            )
            contacto_uuid = str(crow["id"]) if crow else None

        row = await conn.fetchrow(
            """
            INSERT INTO crm.interaccion (
                cuenta_id, contacto_id, tipo, channel, outcome,
                resumen, resultado, happened_at, fecha,
                created_by, updated_by, updated_at
            ) VALUES (
                $1, $2::uuid, $3, $4, $5,
                $6, $7, $8, $8,
                $9, $9, now()
            )
            RETURNING *
            """,
            cuenta["id"], contacto_uuid, data.tipo, data.channel, data.outcome,
            data.resumen, data.resultado, happened,
            username,
        )

        # ─── CRM-D11: auto-crear tarea DEVOLVER_LLAMADA ───────────────────
        # Trigger: outcome='NO_CONTESTA' + tipo de interacción es LLAMADA/WHATSAPP.
        # Best-effort: si falla por cualquier motivo (usuario sin permisos,
        # constraint, etc.) la interacción ya está guardada — solo loggeamos.
        # source_type=NULL porque la tarea es manual originada por interacción
        # (no del cron de Cobrar).
        tarea_auto_id: Optional[str] = None
        if (data.outcome == "NO_CONTESTA"
                and data.tipo in ("LLAMADA", "WHATSAPP")):
            try:
                # Validar que el username esté activo (mismo check que POST de tareas)
                ok = await conn.fetchval(
                    "SELECT EXISTS(SELECT 1 FROM produccion.prod_usuarios "
                    "WHERE username = $1 AND activo = true)",
                    username,
                )
                if not ok:
                    raise ValueError(f"Usuario '{username}' no activo")

                # due_at = mañana 09:00 hora Lima (UTC-5)
                from datetime import timezone, timedelta as _td
                tz_lima = timezone(_td(hours=-5))
                manana_9_lima = (
                    _dt.now(tz_lima) + _td(days=1)
                ).replace(hour=9, minute=0, second=0, microsecond=0)

                tarea_row = await conn.fetchrow(
                    """
                    INSERT INTO crm.tarea (
                        cuenta_id, contacto_id, tipo, descripcion,
                        due_at, prioridad, status, motivo,
                        created_by, updated_by, updated_at, asignado_a
                    ) VALUES (
                        $1, NULL, $2, 'Reintentar contacto',
                        $3, 2, 'PENDIENTE', 'DEVOLVER_LLAMADA',
                        $4, $4, now(), $4
                    )
                    RETURNING id
                    """,
                    cuenta["id"], data.tipo, manana_9_lima, username,
                )
                tarea_auto_id = str(tarea_row["id"])
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(
                    f"[interaccion-no-contesta] No se pudo auto-crear tarea "
                    f"DEVOLVER_LLAMADA para interaccion={row['id']} "
                    f"(cuenta={cuenta['id']}, user={username}): {e}"
                )

        # ─── CRM-D15: reasignar tareas de tiendas al usuario real ─────────
        # Las tareas POST_VENTA del cron caen al usuario CRM "Tienda XXX"
        # (gm209, gr238, gm207, taller, gm218, boosh, gr55). Cuando la
        # primera vendedora interactúa con esa cuenta, todas sus tareas
        # PENDIENTES asignadas a una "tienda" se reasignan al user real.
        # Cobrar también puede caer en estas tiendas si en el futuro
        # mapeamos otros user_id; este UPDATE las atrapa igual.
        try:
            reasignadas = await conn.fetchval(
                """
                WITH upd AS (
                    UPDATE crm.tarea
                    SET asignado_a = $1,
                        updated_at = now(),
                        updated_by = $1
                    WHERE cuenta_id = $2
                      AND status = 'PENDIENTE'
                      AND asignado_a IN
                          ('gm209','gr238','gm207','taller','gm218','boosh','gr55')
                      AND asignado_a <> $1
                    RETURNING 1
                )
                SELECT COUNT(*) FROM upd
                """,
                username, cuenta["id"],
            )
            if reasignadas and reasignadas > 0:
                import logging
                logging.getLogger(__name__).info(
                    f"[interaccion-reasignar] {reasignadas} tarea(s) PENDIENTE de "
                    f"tiendas reasignada(s) a '{username}' tras interaccion={row['id']} "
                    f"(cuenta={cuenta['id']})"
                )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(
                f"[interaccion-reasignar] Falla reasignación tras interaccion={row['id']}: {e}"
            )

    result = row_to_dict(row)
    result["tarea_auto_id"] = tarea_auto_id   # CRM-D11: null si no aplica o falló
    return result


@router.get("/{cuenta_id}/tareas")
async def get_cuenta_tareas(
    cuenta_id: str,
    _user: dict = Depends(get_current_user),
):
    odoo_id = int(cuenta_id)
    async with safe_acquire() as conn:
        cuenta = await conn.fetchrow(
            "SELECT id FROM crm.cuenta WHERE cuenta_partner_odoo_id = $1", odoo_id
        )
        if not cuenta:
            return []
        rows = await conn.fetch(
            "SELECT * FROM crm.tarea WHERE cuenta_id = $1 ORDER BY due_at",
            cuenta["id"],
        )
    return [row_to_dict(r) for r in rows]


@router.post("/{cuenta_id}/tareas")
async def create_tarea(
    cuenta_id: str,
    data: TareaInput,
    user: dict = Depends(get_current_user),
):
    odoo_id = int(cuenta_id)
    due_at = datetime.fromisoformat(data.due_at.replace("Z", "+00:00"))
    username = user.get("username", "unknown") if isinstance(user, dict) else "unknown"
    asignado = (data.asignado_a or "").strip() or username

    async with safe_acquire() as conn:
        await conn.execute(
            "INSERT INTO crm.cuenta (cuenta_partner_odoo_id) VALUES ($1)"
            " ON CONFLICT DO NOTHING", odoo_id
        )
        cuenta = await conn.fetchrow(
            "SELECT id FROM crm.cuenta WHERE cuenta_partner_odoo_id = $1", odoo_id
        )
        if not cuenta:
            raise HTTPException(404, "Cuenta no encontrada")

        # Validar asignado_a
        ok = await conn.fetchval(
            "SELECT EXISTS(SELECT 1 FROM produccion.prod_usuarios "
            "WHERE username = $1 AND activo = true)",
            asignado,
        )
        if not ok:
            raise HTTPException(400, f"Usuario '{asignado}' no encontrado")

        # Resolver contacto UUID
        contacto_uuid = data.contacto_id
        if not contacto_uuid and data.contacto_partner_odoo_id:
            crow = await conn.fetchrow(
                "SELECT id FROM crm.contacto WHERE contacto_partner_odoo_id = $1",
                data.contacto_partner_odoo_id,
            )
            contacto_uuid = str(crow["id"]) if crow else None

        # CRM-D9: validar motivo si viene. NULL es válido (compat retro).
        motivo = (data.motivo or "").strip().upper() or None
        if motivo is not None and motivo not in MOTIVOS_VALIDOS:
            raise HTTPException(400, f"motivo inválido: '{motivo}'. Permitidos: {sorted(MOTIVOS_VALIDOS)}")

        row = await conn.fetchrow(
            """
            INSERT INTO crm.tarea (
                cuenta_id, contacto_id, tipo, descripcion,
                due_at, prioridad, status, motivo,
                created_by, updated_by, updated_at, asignado_a
            ) VALUES (
                $1, $2::uuid, $3, $4,
                $5, $6, 'PENDIENTE', $9,
                $7, $7, now(), $8
            )
            RETURNING *
            """,
            cuenta["id"], contacto_uuid, data.tipo, data.descripcion,
            due_at, data.prioridad if data.prioridad is not None else 3,
            username, asignado, motivo,
        )
    return row_to_dict(row)
