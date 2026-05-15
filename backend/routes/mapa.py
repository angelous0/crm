"""Mapa del Perú — distribución geográfica de cartera (Sprint CRM-D7).

Endpoints:
- GET  /api/mapa/resumen
    → lista de departamentos con KPIs agregados (clientes, locales, ventas 12m)
- GET  /api/mapa/departamento/{nombre}
    → detalle de un depto: clientes con sus locales (coords + KPIs)
- GET  /api/mapa/geocode-pendientes/count
    → cuántos locales principales faltan geocodificar
- POST /api/mapa/geocode-pendientes
    → corre Nominatim sobre N locales principales sin coords, guarda lat/lng
      y auto-rellena distrito/departamento si faltaban
"""
import asyncio
import os
import re
from typing import Optional
from decimal import Decimal
import httpx
from fastapi import APIRouter, Depends, HTTPException

from auth_utils import get_current_user
from db import safe_acquire
from utils.depto_normalize import normalize_depto
from routes.admin_ai import get_active_ai_config, log_ai_call


router = APIRouter(prefix="/api/mapa")


# ─── Normalizador de direcciones (espejo del JS en LocalModal.jsx) ───
def _normalizar_direccion(raw: str) -> str:
    """Limpia abreviaciones, números de interior y repeticiones."""
    if not raw:
        return ""
    q = raw.strip()
    # Quitar prefijos de número (NRO. / N° / Nº / No. / NUMERO)
    q = re.sub(r"\b(NRO\.?|N°|Nº|No\.?|NUM(?:ERO)?\.?)\s*", "", q, flags=re.I)
    # Quitar interior/dpto/piso/manzana/lote
    q = re.sub(r"\bINT(?:ERIOR)?\.?\s*[A-Z0-9\-]+", "", q, flags=re.I)
    q = re.sub(r"\bDPTO\.?\s*[A-Z0-9\-]+", "", q, flags=re.I)
    q = re.sub(r"\bDEPTO\.?\s*[A-Z0-9\-]+", "", q, flags=re.I)
    q = re.sub(r"\bPISO\s*[A-Z0-9\-]+", "", q, flags=re.I)
    q = re.sub(r"\bMZ(?:A|NA)?\.?\s*[A-Z0-9\-]+", "", q, flags=re.I)
    q = re.sub(r"\bLT\.?\s*[A-Z0-9\-]+", "", q, flags=re.I)
    q = re.sub(r"\bSEC(?:TOR)?\.?\s*[A-Z0-9\-]+", "", q, flags=re.I)
    # Expandir abreviaciones (con lookahead para consumir el dot)
    q = re.sub(r"\bAV\.?(?=\s|$|[,;])",   "Avenida",      q, flags=re.I)
    q = re.sub(r"\bJR\.?(?=\s|$|[,;])",   "Jirón",        q, flags=re.I)
    q = re.sub(r"\bCA\.?(?=\s|$|[,;])",   "Calle",        q, flags=re.I)
    q = re.sub(r"\bPSJE\.?(?=\s|$|[,;])", "Pasaje",       q, flags=re.I)
    q = re.sub(r"\bPSJ\.?(?=\s|$|[,;])",  "Pasaje",       q, flags=re.I)
    q = re.sub(r"\bPROL\.?(?=\s|$|[,;])", "Prolongación", q, flags=re.I)
    q = re.sub(r"\bURB\.?(?=\s|$|[,;])",  "Urbanización", q, flags=re.I)
    # Aplanar guiones y comas
    q = re.sub(r"\s*[-,]\s*", " ", q)
    # Dedup tokens consecutivos
    tokens = q.split()
    dedup = []
    last_lower = None
    for t in tokens:
        low = re.sub(r"[^\wáéíóúñ]", "", t, flags=re.I).lower()
        if low and low == last_lower:
            continue
        dedup.append(t)
        if low:
            last_lower = low
    return " ".join(dedup).strip()


def _armar_query(direccion: str, distrito: Optional[str], depto: Optional[str]) -> str:
    """Combina dirección normalizada + distrito + depto (sin duplicar)."""
    dir_norm = _normalizar_direccion(direccion or "")
    partes = [dir_norm] if dir_norm else []
    dir_low = dir_norm.lower()
    if distrito and distrito.lower() not in dir_low:
        partes.append(distrito.strip())
    if depto and depto.lower() not in dir_low:
        partes.append(depto.strip())
    return ", ".join(p for p in partes if p)


async def _nominatim(client: httpx.AsyncClient, query: str, pais: str = "PE") -> list:
    """Llama Nominatim con la query dada. Devuelve list de resultados."""
    country = "bo" if pais == "BO" else "pe"
    try:
        r = await client.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "q":            query,
                "format":       "jsonv2",
                "limit":        3,
                "countrycodes": country,
                "addressdetails": 1,
            },
            headers={
                "Accept-Language": "es",
                "User-Agent":      "ERPTextilCRM/1.0 (geocoding internal)",
            },
            timeout=10.0,
        )
        if r.status_code != 200:
            return []
        return r.json() or []
    except Exception:
        return []


def _extract_distrito_depto(addr: dict) -> tuple:
    """Extrae distrito y departamento canónicos del bloque address de Nominatim."""
    if not addr:
        return (None, None)
    # Distrito: probar city_district → suburb → town → city
    distrito = (
        addr.get("city_district") or addr.get("suburb")
        or addr.get("town") or addr.get("village")
        or addr.get("city")
    )
    # Departamento: state es lo más confiable para Perú
    depto_raw = addr.get("state") or addr.get("province") or addr.get("region")
    depto_canon = normalize_depto(depto_raw, "PE") if depto_raw else None
    return (distrito, depto_canon or depto_raw)


def _num(v):
    """Decimal/None → float seguro para JSON."""
    if v is None:
        return 0.0
    if isinstance(v, Decimal):
        return float(v)
    return float(v)


@router.get("/resumen")
async def resumen_mapa(_user: dict = Depends(get_current_user)):
    """Devuelve la lista de departamentos con stats agregados.

    Solo cuenta cuentas con al menos 1 local activo. Para cada depto:
      - total_clientes: cuentas únicas en el depto
      - total_locales: locales activos en el depto
      - locales_activos: locales activos cuya cuenta tiene estado_auto activo/vip/nuevo
      - amount_12m: ventas últimos 12m sumadas de las cuentas del depto
      - amount_ytd: ventas year-to-date (este año calendario)
    """
    async with safe_acquire() as conn:
        rows = await conn.fetch("""
            -- Cuentas únicas por departamento (deduplicado antes de sumar ventas)
            -- Solo cuentas ACTIVAS (excluye inactivas / manual_inactive)
            WITH cuentas_depto AS (
                SELECT DISTINCT
                    COALESCE(NULLIF(cl.departamento, ''), 'Sin definir') AS departamento,
                    cl.cuenta_partner_odoo_id
                FROM crm.cuenta_local cl
                LEFT JOIN crm.cuenta c ON c.cuenta_partner_odoo_id = cl.cuenta_partner_odoo_id
                WHERE cl.activo = true
                  AND COALESCE(c.is_active, true) = true
                  AND COALESCE(c.manual_inactive, false) = false
            ),
            locales_por_depto AS (
                SELECT
                    COALESCE(NULLIF(cl.departamento, ''), 'Sin definir') AS departamento,
                    COUNT(*) AS total_locales
                FROM crm.cuenta_local cl
                LEFT JOIN crm.cuenta c ON c.cuenta_partner_odoo_id = cl.cuenta_partner_odoo_id
                WHERE cl.activo = true
                  AND COALESCE(c.is_active, true) = true
                  AND COALESCE(c.manual_inactive, false) = false
                GROUP BY cl.departamento
            ),
            ventas_depto AS (
                -- Suma de ventas 12m por depto, sin duplicar cuentas multi-local
                SELECT
                    cd.departamento,
                    COUNT(*) AS total_clientes,
                    COALESCE(SUM(estado.amount_12m), 0) AS amount_12m,
                    COUNT(*) FILTER (
                        WHERE estado.estado_auto IN ('vip','activo','nuevo')
                    ) AS clientes_activos
                FROM cuentas_depto cd
                LEFT JOIN crm.mv_cuenta_estado estado
                       ON estado.cuenta_partner_odoo_id = cd.cuenta_partner_odoo_id
                GROUP BY cd.departamento
            ),
            ventas_ytd AS (
                -- YTD por depto (suma sobre las cuentas del depto)
                SELECT
                    cd.departamento,
                    COALESCE(SUM(li.price_subtotal), 0) AS amount_ytd
                FROM cuentas_depto cd
                LEFT JOIN crm.mv_pos_line_cuenta li
                       ON li.cuenta_partner_id = cd.cuenta_partner_odoo_id
                      AND li.date_order >= date_trunc('year', CURRENT_DATE)
                GROUP BY cd.departamento
            )
            SELECT
                v.departamento,
                v.total_clientes,
                COALESCE(lp.total_locales, 0) AS total_locales,
                v.clientes_activos,
                v.amount_12m::numeric(14,2)        AS amount_12m,
                COALESCE(y.amount_ytd, 0)::numeric(14,2) AS amount_ytd
            FROM ventas_depto v
            LEFT JOIN locales_por_depto lp USING (departamento)
            LEFT JOIN ventas_ytd       y USING (departamento)
            ORDER BY v.amount_12m DESC NULLS LAST, v.total_clientes DESC
        """)

    departamentos = [{
        "nombre":           r["departamento"],
        "total_clientes":   int(r["total_clientes"]),
        "total_locales":    int(r["total_locales"]),
        "clientes_activos": int(r["clientes_activos"]),
        "amount_12m":       _num(r["amount_12m"]),
        "amount_ytd":       _num(r["amount_ytd"]),
    } for r in rows]

    return {"departamentos": departamentos, "total": len(departamentos)}


@router.get("/departamento/{nombre}")
async def departamento_detalle(
    nombre: str,
    _user: dict = Depends(get_current_user),
):
    """Detalle de un depto: clientes (cuentas) con sus locales y KPIs."""
    async with safe_acquire() as conn:
        rows = await conn.fetch("""
            SELECT
                cl.id            AS local_id,
                cl.cuenta_partner_odoo_id,
                cl.nombre        AS local_nombre,
                cl.tipo,
                cl.es_principal,
                cl.direccion,
                cl.distrito,
                cl.latitud,
                cl.longitud,
                rp.name          AS cliente_nombre,
                rp.vat           AS cliente_vat,
                estado.amount_12m,
                estado.estado_auto,
                estado.last_purchase_date,
                estado.tier
            FROM crm.cuenta_local cl
            LEFT JOIN crm.cuenta c ON c.cuenta_partner_odoo_id = cl.cuenta_partner_odoo_id
            LEFT JOIN odoo.res_partner rp
                   ON rp.odoo_id = cl.cuenta_partner_odoo_id
                  AND rp.company_key = 'GLOBAL'
            LEFT JOIN crm.mv_cuenta_estado estado
                   ON estado.cuenta_partner_odoo_id = cl.cuenta_partner_odoo_id
            WHERE cl.activo = true
              AND COALESCE(NULLIF(cl.departamento, ''), 'Sin definir') = $1
              AND COALESCE(c.is_active, true) = true
              AND COALESCE(c.manual_inactive, false) = false
            ORDER BY cl.es_principal DESC, rp.name NULLS LAST
        """, nombre)

    # Ventas YTD por cuenta dentro del depto (para mostrar en sidebar)
    cuentas_ids = list({r["cuenta_partner_odoo_id"] for r in rows})
    ventas_ytd_map: dict = {}
    if cuentas_ids:
        async with safe_acquire() as conn2:
            yt = await conn2.fetch("""
                SELECT cuenta_partner_id, COALESCE(SUM(price_subtotal),0)::numeric(14,2) AS ytd
                FROM crm.mv_pos_line_cuenta
                WHERE cuenta_partner_id = ANY($1)
                  AND date_order >= date_trunc('year', CURRENT_DATE)
                GROUP BY cuenta_partner_id
            """, cuentas_ids)
        ventas_ytd_map = {r["cuenta_partner_id"]: _num(r["ytd"]) for r in yt}

    # Agrupar locales por cliente
    clientes: dict = {}
    for r in rows:
        cid = r["cuenta_partner_odoo_id"]
        if cid not in clientes:
            clientes[cid] = {
                "cuenta_partner_odoo_id": cid,
                "nombre":                 r["cliente_nombre"] or f"Cliente #{cid}",
                "vat":                    r["cliente_vat"],
                "amount_12m":             _num(r["amount_12m"]),
                "amount_ytd":             ventas_ytd_map.get(cid, 0.0),
                "estado_auto":            r["estado_auto"],
                "tier":                   r["tier"],
                "last_purchase_date":     r["last_purchase_date"].isoformat() if r["last_purchase_date"] else None,
                "locales":                [],
            }
        clientes[cid]["locales"].append({
            "id":           str(r["local_id"]),
            "nombre":       r["local_nombre"],
            "tipo":         r["tipo"],
            "es_principal": bool(r["es_principal"]),
            "direccion":    r["direccion"],
            "distrito":     r["distrito"],
            "latitud":      _num(r["latitud"]) if r["latitud"] is not None else None,
            "longitud":     _num(r["longitud"]) if r["longitud"] is not None else None,
        })

    clientes_list = sorted(
        clientes.values(),
        key=lambda c: (-(c["amount_12m"] or 0), c["nombre"] or ""),
    )

    # KPIs agregados del depto
    total_amount_12m = sum(c["amount_12m"] for c in clientes_list)
    total_amount_ytd = sum(c["amount_ytd"] for c in clientes_list)
    total_locales = sum(len(c["locales"]) for c in clientes_list)
    activos = sum(1 for c in clientes_list if c["estado_auto"] in ("vip", "activo", "nuevo"))

    # Bounds para zoom: min/max de lat/lng de locales geocoded
    coords = [
        (l["latitud"], l["longitud"])
        for c in clientes_list for l in c["locales"]
        if l["latitud"] is not None and l["longitud"] is not None
    ]
    bounds = None
    if coords:
        lats = [c[0] for c in coords]
        lngs = [c[1] for c in coords]
        bounds = {
            "min_lat": min(lats), "max_lat": max(lats),
            "min_lng": min(lngs), "max_lng": max(lngs),
        }

    return {
        "departamento": nombre,
        "kpis": {
            "amount_12m":     total_amount_12m,
            "amount_ytd":     total_amount_ytd,
            "total_clientes": len(clientes_list),
            "total_locales":  total_locales,
            "activos":        activos,
            "ticket_promedio": (total_amount_12m / total_locales) if total_locales > 0 else 0,
        },
        "bounds":   bounds,
        "clientes": clientes_list,
    }


# ─── Helper: encontrar mejor dirección entre cuenta + odoo principal + vinculados ───
async def _find_best_address(conn, cuenta_partner_odoo_id: int) -> Optional[dict]:
    """Busca dirección en cascada para una cuenta:

      1) crm.cuenta (direccion_crm + distrito + departamento) — override CRM
      2) odoo.res_partner del partner principal (street, district_name, state_name)
      3) odoo.res_partner de los vinculados via crm.v_cuenta_partners
         (otros partners enlazados al mismo cuenta_id)

    Retorna dict con dirección/distrito/depto/source/nombre o None si no hay nada.
    """
    # 1) CRM override
    cu = await conn.fetchrow("""
        SELECT direccion_crm, distrito, departamento
        FROM crm.cuenta
        WHERE cuenta_partner_odoo_id = $1
    """, cuenta_partner_odoo_id)
    if cu and any(cu[k] and str(cu[k]).strip() for k in ("direccion_crm", "distrito", "departamento")):
        return {
            "direccion":    cu["direccion_crm"],
            "distrito":     cu["distrito"],
            "departamento": cu["departamento"],
            "source":       "crm.cuenta",
        }

    # 2) Partner principal en Odoo
    rp = await conn.fetchrow("""
        SELECT street, district_name, state_name::text AS state_name, name
        FROM odoo.res_partner
        WHERE odoo_id = $1 AND company_key = 'GLOBAL'
    """, cuenta_partner_odoo_id)
    if rp and any(rp[k] and str(rp[k]).strip() for k in ("street", "district_name", "state_name")):
        return {
            "direccion":    rp["street"],
            "distrito":     rp["district_name"],
            "departamento": rp["state_name"],
            "source":       "odoo.principal",
        }

    # 3) Vinculados — buscar entre todos los partners enlazados al mismo cuenta_id
    #    Priorizar los que tienen street completo
    vinc = await conn.fetchrow("""
        SELECT rp.odoo_id, rp.street, rp.district_name,
               rp.state_name::text AS state_name, rp.name
        FROM crm.cuenta c
        JOIN crm.v_cuenta_partners vcp ON vcp.cuenta_id = c.id
        JOIN odoo.res_partner rp
              ON rp.odoo_id = vcp.partner_id
             AND rp.company_key = 'GLOBAL'
        WHERE c.cuenta_partner_odoo_id = $1
          AND rp.odoo_id <> $1
          AND (
            COALESCE(NULLIF(rp.street, ''), '') <> '' OR
            COALESCE(NULLIF(rp.district_name, ''), '') <> '' OR
            COALESCE(NULLIF(rp.state_name::text, ''), '') <> ''
          )
        ORDER BY
          (NULLIF(rp.street, '') IS NOT NULL)::int DESC,
          (NULLIF(rp.district_name, '') IS NOT NULL)::int DESC,
          (NULLIF(rp.state_name::text, '') IS NOT NULL)::int DESC
        LIMIT 1
    """, cuenta_partner_odoo_id)
    if vinc:
        return {
            "direccion":    vinc["street"],
            "distrito":     vinc["district_name"],
            "departamento": vinc["state_name"],
            "source":       f"vinculado (partner #{vinc['odoo_id']})",
        }

    return None


# ─── Geocodificación batch ───
@router.get("/geocode-pendientes/count")
async def geocode_pendientes_count(_user: dict = Depends(get_current_user)):
    """Cuenta cuántos pendientes hay para geocodificar.

    Suma dos categorías:
      A) Locales principales existentes sin coords
      B) Cuentas en crm.cuenta sin local principal (que podríamos crear si
         encontramos dirección en cuenta/odoo/vinculados)
    """
    async with safe_acquire() as conn:
        # Locales sin coords — pero solo de cuentas ACTIVAS (no inactivas)
        locales_sin_coords = await conn.fetchval("""
            SELECT COUNT(*)
            FROM crm.cuenta_local cl
            JOIN crm.cuenta c ON c.cuenta_partner_odoo_id = cl.cuenta_partner_odoo_id
            WHERE cl.activo = true
              AND cl.es_principal = true
              AND (cl.latitud IS NULL OR cl.longitud IS NULL)
              AND COALESCE(NULLIF(cl.direccion, ''), NULLIF(cl.distrito, ''), NULLIF(cl.departamento, '')) IS NOT NULL
              AND COALESCE(c.is_active, true) = true
              AND COALESCE(c.manual_inactive, false) = false
        """)
        # Cuentas ACTIVAS que NO tienen ningún local activo
        cuentas_sin_local = await conn.fetchval("""
            SELECT COUNT(*)
            FROM crm.cuenta c
            WHERE COALESCE(c.is_active, true) = true
              AND COALESCE(c.manual_inactive, false) = false
              AND NOT EXISTS (
                SELECT 1 FROM crm.cuenta_local cl
                WHERE cl.cuenta_partner_odoo_id = c.cuenta_partner_odoo_id
                  AND cl.activo = true
              )
        """)
    return {
        "pendientes":         int(locales_sin_coords or 0) + int(cuentas_sin_local or 0),
        "locales_sin_coords": int(locales_sin_coords or 0),
        "cuentas_sin_local":  int(cuentas_sin_local or 0),
    }


async def _ai_clean_address(
    direccion_raw: str,
    distrito: Optional[str],
    depto: Optional[str],
    cuenta_id: Optional[int] = None,
    created_by: Optional[str] = None,
) -> Optional[str]:
    """Pide a un LLM que limpie una dirección mal escrita.

    Lee la configuración desde crm.app_config (admin_ai.py) o fallback a env.
    Registra cada llamada en crm.ai_usage para tracking de gasto.
    Devuelve la dirección sugerida o None si no hay API key / falla.
    """
    cfg = await get_active_ai_config()
    if not cfg.get("api_key") or not cfg.get("provider"):
        return None

    provider = cfg["provider"]
    api_key = cfg["api_key"]
    model = cfg["model"]

    sys_prompt = (
        "Eres un experto en direcciones de Perú. Recibirás una dirección posiblemente "
        "mal escrita o con abreviaciones raras, junto con su distrito y departamento. "
        "Devuelve SOLO la dirección corregida en formato 'Tipo de vía + Nombre + Número, "
        "Distrito, Departamento'. Sin explicaciones. Si no estás seguro, devuelve el "
        "texto original limpio."
    )
    user_msg = (
        f"Dirección: {direccion_raw}\n"
        f"Distrito: {distrito or '(desconocido)'}\n"
        f"Departamento: {depto or '(desconocido)'}\n"
        "Corregida:"
    )

    in_tok = 0
    out_tok = 0
    success = False
    respuesta = None

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if provider == "anthropic":
                r = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": model,
                        "max_tokens": 200,
                        "system": sys_prompt,
                        "messages": [{"role": "user", "content": user_msg}],
                    },
                )
                if r.status_code == 200:
                    data = r.json()
                    usage = data.get("usage", {})
                    in_tok = usage.get("input_tokens", 0)
                    out_tok = usage.get("output_tokens", 0)
                    respuesta = data["content"][0]["text"].strip()
                    success = True
            elif provider == "openai":
                r = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model,
                        "messages": [
                            {"role": "system", "content": sys_prompt},
                            {"role": "user", "content": user_msg},
                        ],
                        "max_tokens": 200,
                    },
                )
                if r.status_code == 200:
                    data = r.json()
                    usage = data.get("usage", {})
                    in_tok = usage.get("prompt_tokens", 0)
                    out_tok = usage.get("completion_tokens", 0)
                    respuesta = data["choices"][0]["message"]["content"].strip()
                    success = True
    except Exception:
        pass

    # Log de la llamada (incluso si falla, para auditar problemas)
    try:
        await log_ai_call(
            provider=provider, model=model,
            input_tokens=in_tok, output_tokens=out_tok,
            purpose="geocode-address", cuenta_id=cuenta_id,
            success=success, created_by=created_by,
        )
    except Exception:
        pass

    return respuesta


@router.post("/geocode-pendientes")
async def geocode_pendientes(
    limit: int = 25,
    user: dict = Depends(get_current_user),
):
    """Procesa hasta `limit` cuentas/locales pendientes en 2 fases:

    FASE A: Cuentas sin local principal
      - Busca dirección en cascada: crm.cuenta → odoo.res_partner principal →
        vinculados (via v_cuenta_partners).
      - Si encuentra, crea el local principal.
      - Si no encuentra dirección en ningún lado, marca como skipped.

    FASE B: Locales principales sin coords
      - Normaliza dirección + agrega distrito/depto.
      - Busca en Nominatim. Si encuentra → guarda lat/lng + auto-rellena
        distrito/depto vacíos.
      - Fallbacks: sin número → IA si está configurada → solo localidad.

    Rate limit: 1.1s entre requests a Nominatim (usage policy).
    El `limit` se reparte entre las dos fases (mitad cada una).
    """
    if limit > 100:
        limit = 100  # safety cap
    user_name = (user.get("username") if isinstance(user, dict) else None) or "system"

    # ─── FASE A: crear locales para cuentas sin ninguno ─────────────────────
    cuotas_a = max(1, limit // 2)
    creados_a = []
    skipped_a = []

    async with safe_acquire() as conn:
        cuentas_pendientes = await conn.fetch("""
            SELECT c.cuenta_partner_odoo_id, rp.name AS cliente_nombre
            FROM crm.cuenta c
            LEFT JOIN odoo.res_partner rp
                   ON rp.odoo_id = c.cuenta_partner_odoo_id
                  AND rp.company_key = 'GLOBAL'
            WHERE COALESCE(c.is_active, true) = true
              AND COALESCE(c.manual_inactive, false) = false
              AND NOT EXISTS (
                SELECT 1 FROM crm.cuenta_local cl
                WHERE cl.cuenta_partner_odoo_id = c.cuenta_partner_odoo_id
                  AND cl.activo = true
              )
            ORDER BY c.created_at DESC
            LIMIT $1
        """, cuotas_a)

        for c in cuentas_pendientes:
            cuenta_id = c["cuenta_partner_odoo_id"]
            best = await _find_best_address(conn, cuenta_id)
            if not best or not any([best.get("direccion"), best.get("distrito"), best.get("departamento")]):
                skipped_a.append({
                    "cuenta_id": cuenta_id,
                    "cliente":   c["cliente_nombre"],
                    "reason":    "sin dirección en cuenta/odoo/vinculados",
                })
                continue

            # Normalizar depto al canónico (Cusco vs CUSCO)
            depto_canon = normalize_depto(best.get("departamento"), "PE") if best.get("departamento") else None
            nuevo = await conn.fetchrow("""
                INSERT INTO crm.cuenta_local (
                    cuenta_partner_odoo_id, nombre, tipo, direccion,
                    distrito, departamento, pais, es_principal,
                    created_by, updated_by
                ) VALUES (
                    $1, $2, 'calle', $3, $4, $5, 'PE', true, $6, $6
                ) RETURNING id
            """,
                cuenta_id,
                f"{c['cliente_nombre']} · Principal" if c["cliente_nombre"] else "Local principal",
                best.get("direccion"),
                best.get("distrito"),
                depto_canon or best.get("departamento"),
                user_name,
            )
            creados_a.append({
                "local_id":  str(nuevo["id"]),
                "cuenta_id": cuenta_id,
                "cliente":   c["cliente_nombre"],
                "source":    best["source"],
                "direccion": best.get("direccion"),
            })

    # ─── FASE B: geocodificar locales sin coords (incluye los recién creados) ───
    cuotas_b = limit - len(creados_a) - len(skipped_a)
    if cuotas_b < 1:
        cuotas_b = max(1, limit // 2)

    async with safe_acquire() as conn:
        rows = await conn.fetch("""
            SELECT cl.id, cl.cuenta_partner_odoo_id,
                   cl.direccion, cl.distrito, cl.departamento, cl.pais,
                   rp.name AS cliente_nombre
            FROM crm.cuenta_local cl
            JOIN crm.cuenta c ON c.cuenta_partner_odoo_id = cl.cuenta_partner_odoo_id
            LEFT JOIN odoo.res_partner rp
                   ON rp.odoo_id = cl.cuenta_partner_odoo_id
                  AND rp.company_key = 'GLOBAL'
            WHERE cl.activo = true
              AND cl.es_principal = true
              AND (cl.latitud IS NULL OR cl.longitud IS NULL)
              AND COALESCE(NULLIF(cl.direccion, ''), NULLIF(cl.distrito, ''), NULLIF(cl.departamento, '')) IS NOT NULL
              AND COALESCE(c.is_active, true) = true
              AND COALESCE(c.manual_inactive, false) = false
            ORDER BY cl.created_at DESC
            LIMIT $1
        """, cuotas_b)

    # Detectar IA disponible (DB config o env)
    ai_cfg = await get_active_ai_config()
    has_ai = bool(ai_cfg.get("api_key") and ai_cfg.get("provider"))
    results = []

    async with httpx.AsyncClient() as client:
        for row in rows:
            local_id   = str(row["id"])
            cuenta_id  = row["cuenta_partner_odoo_id"]
            direccion  = row["direccion"] or ""
            distrito   = row["distrito"]
            depto      = row["departamento"]
            pais       = row["pais"] or "PE"

            # 1) Query principal
            query = _armar_query(direccion, distrito, depto)
            data = await _nominatim(client, query, pais) if query else []
            await asyncio.sleep(1.1)

            # 2) Fallback: sin número
            if not data and direccion:
                sin_num = re.sub(r"\b\d{1,5}[A-Z]?\b", "", _normalizar_direccion(direccion))
                sin_num = re.sub(r"\s+", " ", sin_num).strip()
                if sin_num:
                    query_fb = _armar_query(sin_num, distrito, depto)
                    data = await _nominatim(client, query_fb, pais)
                    await asyncio.sleep(1.1)

            # 3) Fallback IA si está configurada y aún no hay match
            usado_ia = False
            if not data and has_ai:
                sugerida = await _ai_clean_address(
                    direccion, distrito, depto,
                    cuenta_id=cuenta_id, created_by=user_name,
                )
                if sugerida and sugerida.lower() != direccion.lower():
                    usado_ia = True
                    data = await _nominatim(client, sugerida, pais)
                    await asyncio.sleep(1.1)

            # 4) Fallback final: solo distrito + depto (centroide)
            if not data:
                solo_loc = ", ".join(p for p in (distrito, depto) if p)
                if solo_loc:
                    data = await _nominatim(client, solo_loc, pais)
                    await asyncio.sleep(1.1)

            if data:
                r0 = data[0]
                lat = float(r0["lat"])
                lng = float(r0["lon"])
                addr = r0.get("address", {})
                d_nominatim, p_nominatim = _extract_distrito_depto(addr)
                preciso = r0.get("addresstype") in ("house", "building")

                # Solo rellenamos distrito/depto si estaban vacíos
                nuevo_distrito = distrito if (distrito and distrito.strip()) else d_nominatim
                nuevo_depto = depto if (depto and depto.strip()) else p_nominatim

                async with safe_acquire() as conn2:
                    await conn2.execute("""
                        UPDATE crm.cuenta_local
                        SET latitud      = $1,
                            longitud     = $2,
                            distrito     = COALESCE(NULLIF($3, ''), distrito),
                            departamento = COALESCE(NULLIF($4, ''), departamento),
                            updated_at   = now(),
                            updated_by   = $5
                        WHERE id = $6
                    """, lat, lng, nuevo_distrito or "", nuevo_depto or "", user_name, local_id)

                results.append({
                    "local_id":  local_id,
                    "cuenta_id": cuenta_id,
                    "cliente":   row["cliente_nombre"],
                    "ok":        True,
                    "lat":       lat,
                    "lng":       lng,
                    "preciso":   preciso,
                    "usado_ia":  usado_ia,
                    "distrito_fill":     bool(d_nominatim and not (distrito and distrito.strip())),
                    "departamento_fill": bool(p_nominatim and not (depto and depto.strip())),
                })
            else:
                results.append({
                    "local_id":  local_id,
                    "cuenta_id": cuenta_id,
                    "cliente":   row["cliente_nombre"],
                    "ok":        False,
                    "direccion": direccion,
                    "query":     query,
                })

    ok_count = sum(1 for r in results if r["ok"])
    return {
        "total":      len(rows) + len(creados_a) + len(skipped_a),
        "ok":         ok_count,
        "failed":     len(rows) - ok_count,
        "has_ai":     has_ai,
        "fase_a": {
            "creados": creados_a,
            "skipped": skipped_a,
        },
        "fase_b_results": results,
        "results":    results,  # alias para compatibilidad con UI vieja
    }
