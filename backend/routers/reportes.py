"""Reportes module – sales reporting with YoY, daily series, and top rankings."""
from fastapi import APIRouter, Depends, Query
from typing import Optional
import logging
from datetime import date, timedelta
from db import get_pool, records_to_list, record_to_dict

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/reportes", tags=["reportes"])


def _get_auth():
    from server import get_current_user
    return get_current_user


# ── Tienda resolution (hybrid: location_id > name-based fallback) ──

_TIENDA_CASE = """
    CASE SPLIT_PART(po.name, '/', 1)
        WHEN 'BOSH GAMARRA' THEN 'BOOSH'
        WHEN 'G209' THEN 'GM209'
        WHEN 'GaleriaAzul' THEN 'AZUL'
        WHEN 'Gamarra207A' THEN 'GM207'
        WHEN 'Grau 238' THEN 'GR238'
        WHEN 'Grau238' THEN 'GR238'
        WHEN 'Grau 555-' THEN 'GR55'
        WHEN 'Sebastian Barranca 1556' THEN 'GM218'
        WHEN 'Venta Taller' THEN 'TALLER'
        WHEN 'Zapaton' THEN 'ZAP'
        ELSE NULL
    END
"""

_TIENDA_EXPR = "r.tienda"

_BASE_FROM_MINIMAL = """
    FROM crm.mv_ventas_reporte r
"""

_BASE_FROM_FULL = _BASE_FROM_MINIMAL


def _needs_full_join(tienda="", vendedor=""):
    """Kept for API compat - no longer needed since MV has everything."""
    return False


def _date_range(range_type: str, date_from: str, date_to: str):
    """Return (start_cur, end_cur, start_prev, end_prev) as date strings."""
    today = date.today()
    if range_type == "MTD":
        start_cur = today.replace(day=1)
        end_cur = today
    elif range_type == "CUSTOM" and date_from and date_to:
        start_cur = date.fromisoformat(date_from)
        end_cur = date.fromisoformat(date_to)
    else:  # YTD default
        start_cur = today.replace(month=1, day=1)
        end_cur = today

    # YoY: same range but previous year
    start_prev = start_cur.replace(year=start_cur.year - 1)
    end_prev = end_cur.replace(year=end_cur.year - 1)

    return (
        start_cur.isoformat(),
        end_cur.isoformat() + "T23:59:59",
        start_prev.isoformat(),
        end_prev.isoformat() + "T23:59:59",
    )


def _build_filters(params, tienda="", vendedor="", marca="", tipo="",
                   entalle="", tela="", hilo="", modelo="", talla="", color=""):
    """Build WHERE extras for optional filters. Returns SQL fragment."""
    extra = ""
    if tienda:
        if tienda == "Sin tienda":
            extra += " AND r.tienda IS NULL"
        else:
            params.append(tienda)
            extra += f" AND r.tienda = ${len(params)}"
    if vendedor:
        if vendedor == "Sin asignar":
            extra += " AND r.assigned_user_id IS NULL"
        else:
            params.append(vendedor)
            extra += f" AND r.assigned_user_id::text = ${len(params)}"
    if marca:
        params.append(marca)
        extra += f" AND r.marca = ${len(params)}"
    if tipo:
        params.append(tipo)
        extra += f" AND r.tipo = ${len(params)}"
    if entalle:
        params.append(entalle)
        extra += f" AND r.entalle = ${len(params)}"
    if tela:
        params.append(tela)
        extra += f" AND r.tela = ${len(params)}"
    if hilo:
        params.append(hilo)
        extra += f" AND r.hilo = ${len(params)}"
    if modelo:
        params.append(f"%{modelo}%")
        extra += f" AND r.modelo_display ILIKE ${len(params)}"
    if talla:
        params.append(talla)
        extra += f" AND r.talla = ${len(params)}"
    if color:
        params.append(color)
        extra += f" AND r.color = ${len(params)}"
    return extra


def _kpi_select():
    return """
        COALESCE(SUM(r.subtotal), 0) AS ventas_soles,
        COALESCE(SUM(r.qty), 0) AS unidades,
        COUNT(DISTINCT r.order_id) AS ordenes,
        COUNT(DISTINCT r.owner_partner_id) AS clientes
    """


# ── 1) Summary with YoY ──

@router.get("/ventas/summary")
async def ventas_summary(
    range: str = Query("YTD", alias="range"),
    date_from: str = "",
    date_to: str = "",
    tienda: str = "",
    vendedor: str = "",
    marca: str = "",
    tipo: str = "",
    entalle: str = "",
    tela: str = "",
    hilo: str = "",
    modelo: str = "",
    talla: str = "",
    color: str = "",
    user=Depends(_get_auth()),
):
    start_cur, end_cur, start_prev, end_prev = _date_range(range, date_from, date_to)
    p = await get_pool()
    async with p.acquire() as conn:
        base_from = _BASE_FROM_FULL if _needs_full_join(tienda, vendedor) else _BASE_FROM_MINIMAL
        # Current period
        params_cur = [start_cur, end_cur]
        filter_extra = _build_filters(
            params_cur, tienda, vendedor, marca, tipo, entalle, tela, hilo, modelo, talla, color
        )
        row_cur = await conn.fetchrow(f"""
            SELECT {_kpi_select()}
            {base_from}
            WHERE r.dia >= ($1::text::date) AND r.dia <= ($2::text::date)
              {filter_extra}
        """, *params_cur)

        # Previous period (same filters)
        params_prev = [start_prev, end_prev]
        filter_extra_prev = _build_filters(
            params_prev, tienda, vendedor, marca, tipo, entalle, tela, hilo, modelo, talla, color
        )
        row_prev = await conn.fetchrow(f"""
            SELECT {_kpi_select()}
            {base_from}
            WHERE r.dia >= ($1::text::date) AND r.dia <= ($2::text::date)
              {filter_extra_prev}
        """, *params_prev)

        def safe_pct(cur, prev):
            if prev and prev > 0:
                return round((cur / prev) - 1, 4)
            return None

        cur = record_to_dict(row_cur)
        prev = record_to_dict(row_prev)

        return {
            "range": range,
            "date_from": start_cur.split("T")[0] if "T" in start_cur else start_cur,
            "date_to": end_cur.split("T")[0],
            "kpis": {
                "ventas_soles": float(cur["ventas_soles"]),
                "unidades": float(cur["unidades"]),
                "ordenes": int(cur["ordenes"]),
                "clientes": int(cur["clientes"]),
            },
            "yoy": {
                "ventas_soles_prev": float(prev["ventas_soles"]),
                "unidades_prev": float(prev["unidades"]),
                "ordenes_prev": int(prev["ordenes"]),
                "clientes_prev": int(prev["clientes"]),
            },
            "yoy_pct": {
                "ventas_soles": safe_pct(float(cur["ventas_soles"]), float(prev["ventas_soles"])),
                "unidades": safe_pct(float(cur["unidades"]), float(prev["unidades"])),
                "ordenes": safe_pct(int(cur["ordenes"]), int(prev["ordenes"])),
                "clientes": safe_pct(int(cur["clientes"]), int(prev["clientes"])),
            },
        }


# ── 2) Daily series ──

@router.get("/ventas/by-day")
async def ventas_by_day(
    range: str = Query("YTD", alias="range"),
    date_from: str = "",
    date_to: str = "",
    tienda: str = "",
    vendedor: str = "",
    marca: str = "",
    tipo: str = "",
    entalle: str = "",
    tela: str = "",
    hilo: str = "",
    modelo: str = "",
    talla: str = "",
    color: str = "",
    user=Depends(_get_auth()),
):
    start_cur, end_cur, start_prev, end_prev = _date_range(range, date_from, date_to)
    p = await get_pool()
    async with p.acquire() as conn:
        base_from = _BASE_FROM_FULL if _needs_full_join(tienda, vendedor) else _BASE_FROM_MINIMAL
        # Current period
        params_cur = [start_cur, end_cur]
        flt = _build_filters(params_cur, tienda, vendedor, marca, tipo, entalle, tela, hilo, modelo, talla, color)
        rows_cur = await conn.fetch(f"""
            SELECT r.dia,
                   COALESCE(SUM(r.subtotal), 0) AS ventas_soles,
                   COALESCE(SUM(r.qty), 0) AS unidades
            {base_from}
            WHERE r.dia >= ($1::text::date) AND r.dia <= ($2::text::date)
              {flt}
            GROUP BY r.dia ORDER BY r.dia
        """, *params_cur)

        # Previous period
        params_prev = [start_prev, end_prev]
        flt_prev = _build_filters(params_prev, tienda, vendedor, marca, tipo, entalle, tela, hilo, modelo, talla, color)
        rows_prev = await conn.fetch(f"""
            SELECT r.dia,
                   COALESCE(SUM(r.subtotal), 0) AS ventas_soles,
                   COALESCE(SUM(r.qty), 0) AS unidades
            {base_from}
            WHERE r.dia >= ($1::text::date) AND r.dia <= ($2::text::date)
              {flt_prev}
            GROUP BY r.dia ORDER BY r.dia
        """, *params_prev)

        return {
            "current": [{"date": str(r["dia"]), "ventas_soles": float(r["ventas_soles"]), "unidades": float(r["unidades"])} for r in rows_cur],
            "previous": [{"date": str(r["dia"]), "ventas_soles": float(r["ventas_soles"]), "unidades": float(r["unidades"])} for r in rows_prev],
        }


# ── 3) Top rankings ──

@router.get("/ventas/top")
async def ventas_top(
    range: str = Query("YTD", alias="range"),
    date_from: str = "",
    date_to: str = "",
    group_by: str = "clientes",
    top_n: int = 20,
    page: int = 1,
    tienda: str = "",
    vendedor: str = "",
    marca: str = "",
    tipo: str = "",
    entalle: str = "",
    tela: str = "",
    hilo: str = "",
    modelo: str = "",
    talla: str = "",
    color: str = "",
    user=Depends(_get_auth()),
):
    start_cur, end_cur, _, _ = _date_range(range, date_from, date_to)
    p = await get_pool()
    async with p.acquire() as conn:
        params = [start_cur, end_cur]
        flt = _build_filters(params, tienda, vendedor, marca, tipo, entalle, tela, hilo, modelo, talla, color)

        group_configs = {
            "clientes": {
                "select": "r.owner_partner_id AS id, MAX(r.owner_partner_name) AS nombre",
                "group": "r.owner_partner_id",
            },
            "modelos": {
                "select": "COALESCE(r.modelo_display, 'Sin modelo') AS nombre, r.product_tmpl_id AS id",
                "group": "r.product_tmpl_id, COALESCE(r.modelo_display, 'Sin modelo')",
            },
            "items": {
                "select": "COALESCE(r.marca::text, '') AS marca, COALESCE(r.tipo::text, '') AS tipo, COALESCE(r.entalle::text, '') AS entalle, COALESCE(r.tela::text, '') AS tela",
                "group": "r.marca, r.tipo, r.entalle, r.tela",
            },
            "tallas": {
                "select": "COALESCE(r.talla, 'Sin talla') AS nombre",
                "group": "r.talla",
            },
            "colores": {
                "select": "COALESCE(r.color, 'Sin color') AS nombre",
                "group": "r.color",
            },
            "tiendas": {
                "select": "COALESCE(r.tienda, 'Sin tienda') AS nombre",
                "group": "r.tienda",
            },
        }

        cfg = group_configs.get(group_by, group_configs["clientes"])
        offset = (page - 1) * top_n

        # Use full join only when tienda/vendedor filter or tiendas grouping
        needs_full = _needs_full_join(tienda, vendedor) or group_by == "tiendas"
        base_from = _BASE_FROM_FULL if needs_full else _BASE_FROM_MINIMAL

        params.append(top_n)
        params.append(offset)
        rows = await conn.fetch(f"""
            SELECT {cfg['select']},
                   COALESCE(SUM(r.subtotal), 0) AS ventas_soles,
                   COALESCE(SUM(r.qty), 0) AS unidades,
                   COUNT(DISTINCT r.order_id) AS ordenes
            {base_from}
            WHERE r.dia >= ($1::text::date) AND r.dia <= ($2::text::date)
              {flt}
            GROUP BY {cfg['group']}
            ORDER BY ventas_soles DESC
            LIMIT ${len(params) - 1} OFFSET ${len(params)}
        """, *params)

        result = []
        for r in rows:
            d = record_to_dict(r)
            d["ventas_soles"] = float(d.get("ventas_soles", 0))
            d["unidades"] = float(d.get("unidades", 0))
            d["ordenes"] = int(d.get("ordenes", 0))
            result.append(d)

        return {"rows": result, "group_by": group_by, "page": page, "top_n": top_n}


# ── Filter options ──

@router.get("/ventas/filter-options")
async def ventas_filter_options(user=Depends(_get_auth())):
    """Distinct values for filter dropdowns (using base tables for performance)."""
    p = await get_pool()
    async with p.acquire() as conn:
        # Use product_template (3.6K rows) instead of view (842K rows) for catalog filters
        tiendas = [r["x_nombre"] for r in await conn.fetch("""
            SELECT DISTINCT x_nombre FROM odoo.stock_location
            WHERE company_key='GLOBAL' AND x_nombre IS NOT NULL AND btrim(x_nombre)<>''
              AND COALESCE(active,true)=true AND usage='internal'
            ORDER BY x_nombre
        """)]
        tiendas.append("Sin tienda")

        marcas = [r[0] for r in await conn.fetch("""
            SELECT DISTINCT marca::text FROM odoo.product_template
            WHERE company_key='GLOBAL' AND sale_ok=true AND purchase_ok=false
              AND marca IS NOT NULL AND btrim(marca::text)<>'' ORDER BY marca::text
        """)]
        tipos = [r[0] for r in await conn.fetch("""
            SELECT DISTINCT tipo::text FROM odoo.product_template
            WHERE company_key='GLOBAL' AND sale_ok=true AND purchase_ok=false
              AND tipo IS NOT NULL AND btrim(tipo::text)<>'' ORDER BY tipo::text
        """)]
        entalles = [r[0] for r in await conn.fetch("""
            SELECT DISTINCT entalle::text FROM odoo.product_template
            WHERE company_key='GLOBAL' AND sale_ok=true AND purchase_ok=false
              AND entalle IS NOT NULL AND btrim(entalle::text)<>'' ORDER BY entalle::text
        """)]
        telas = [r[0] for r in await conn.fetch("""
            SELECT DISTINCT tela::text FROM odoo.product_template
            WHERE company_key='GLOBAL' AND sale_ok=true AND purchase_ok=false
              AND tela IS NOT NULL AND btrim(tela::text)<>'' ORDER BY tela::text
        """)]
        hilos = [r[0] for r in await conn.fetch("""
            SELECT DISTINCT hilo::text FROM odoo.product_template
            WHERE company_key='GLOBAL' AND sale_ok=true AND purchase_ok=false
              AND hilo IS NOT NULL AND btrim(hilo::text)<>'' ORDER BY hilo::text
        """)]

        # talla/color from variant flat (much smaller than full view)
        tallas = [r[0] for r in await conn.fetch("""
            SELECT DISTINCT talla FROM odoo.v_product_variant_flat
            WHERE company_key='GLOBAL' AND talla IS NOT NULL AND btrim(talla)<>''
            ORDER BY talla
        """)]
        colores = [r[0] for r in await conn.fetch("""
            SELECT DISTINCT color FROM odoo.v_product_variant_flat
            WHERE company_key='GLOBAL' AND color IS NOT NULL AND btrim(color)<>''
            ORDER BY color
        """)]

        vendedores = []
        try:
            vendedores = [{"id": str(r["id"]), "nombre": r["nombre"] or r["usuario"]} for r in await conn.fetch("""
                SELECT id, nombre, usuario FROM crm.usuario ORDER BY nombre, usuario
            """)]
        except Exception:
            pass

        return {
            "tiendas": tiendas,
            "marcas": marcas,
            "tipos": tipos,
            "entalles": entalles,
            "telas": telas,
            "hilos": hilos,
            "tallas": tallas,
            "colores": colores,
            "vendedores": vendedores,
        }
