"""Stock Balance (Balance de Tallas) router."""
from fastapi import APIRouter, Depends, Query
from typing import Optional
import logging

from db import get_pool

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/stock-balance", tags=["stock-balance"])

VIEW = "crm.v_stock_balance_flat"

TALLA_LETTER_ORDER = {'XXS': 1, 'XS': 2, 'S': 3, 'M': 4, 'L': 5, 'XL': 6, 'XXL': 7, 'XXXL': 8}


def _talla_sort_key(t):
    if t in TALLA_LETTER_ORDER:
        return (1, TALLA_LETTER_ORDER[t])
    try:
        return (0, int(t))
    except (ValueError, TypeError):
        return (2, t or '')


def _build_where(tienda, marca, tipo, entalle, tela, hilo, color, talla, modelo):
    parts = []
    params = []

    def _add(col, val):
        if not val:
            return
        vals = [v.strip() for v in val.split(',') if v.strip()]
        if vals:
            params.append(vals)
            parts.append(f"{col} = ANY(${len(params)})")

    _add('tienda', tienda)
    _add('marca', marca)
    _add('tipo', tipo)
    _add('entalle', entalle)
    _add('tela', tela)
    _add('hilo', hilo)
    _add('color', color)
    _add('talla', talla)

    if modelo:
        params.append(f"%{modelo}%")
        parts.append(f"modelo ILIKE ${len(params)}")

    where = "WHERE " + (" AND ".join(parts) if parts else "1=1")
    return where, params


# Import get_current_user from server module
async def _get_user(authorization: str = None):
    """Minimal auth dependency - imports from main server."""
    from server import get_current_user
    from fastapi import Header
    return await get_current_user(authorization=authorization)


@router.get("/matrix")
async def stock_balance_matrix(
    tienda: str = "", marca: str = "", tipo: str = "", entalle: str = "",
    tela: str = "", hilo: str = "", color: str = "", talla: str = "",
    modelo: str = "",
    limit: int = 300, page: int = 1,
    authorization: str = None
):
    """Item x Tallas matrix: rows=MARCA-TIPO-ENTALLE-TELA-HILO, cols=tallas."""
    from server import get_current_user
    from fastapi import Header
    await get_current_user(authorization=authorization)

    p = await get_pool()
    async with p.acquire() as conn:
        try:
            where, params = _build_where(tienda, marca, tipo, entalle, tela, hilo, color, talla, modelo)
            offset = (page - 1) * limit

            # Get all distinct tallas
            t_rows = await conn.fetch(
                f"SELECT DISTINCT talla::text as t FROM {VIEW} {where} AND talla IS NOT NULL",
                *params
            )
            tallas = sorted([r['t'] for r in t_rows], key=_talla_sort_key)

            # Count total distinct items
            total_items = await conn.fetchval(
                f"""SELECT COUNT(*) FROM (
                    SELECT 1 FROM {VIEW} {where}
                    GROUP BY COALESCE(marca::text,''), COALESCE(tipo::text,''), COALESCE(entalle::text,''), COALESCE(tela::text,''), COALESCE(hilo::text,'')
                ) sub""",
                *params
            )

            # Get top items by total stock, paginated
            item_params = list(params)
            item_params.extend([limit, offset])
            items_sql = f"""
                WITH item_totals AS (
                    SELECT
                        COALESCE(marca::text,'') as marca,
                        COALESCE(tipo::text,'') as tipo,
                        COALESCE(entalle::text,'') as entalle,
                        COALESCE(tela::text,'') as tela,
                        COALESCE(hilo::text,'SIN_HILO') as hilo,
                        SUM(available_qty) as total
                    FROM {VIEW} {where}
                    GROUP BY marca, tipo, entalle, tela, hilo
                    ORDER BY total DESC
                    LIMIT ${len(item_params)-1} OFFSET ${len(item_params)}
                )
                SELECT
                    it.marca, it.tipo, it.entalle, it.tela, it.hilo,
                    f.talla::text as talla,
                    SUM(f.available_qty) as qty
                FROM {VIEW} f
                JOIN item_totals it
                    ON COALESCE(f.marca::text,'') = it.marca
                    AND COALESCE(f.tipo::text,'') = it.tipo
                    AND COALESCE(f.entalle::text,'') = it.entalle
                    AND COALESCE(f.tela::text,'') = it.tela
                    AND COALESCE(f.hilo::text,'SIN_HILO') = it.hilo
                {where.replace("WHERE", "AND") if "1=1" not in where else ""}
                GROUP BY it.marca, it.tipo, it.entalle, it.tela, it.hilo, f.talla
            """
            rows = await conn.fetch(items_sql, *item_params)

            # Build matrix
            item_map = {}
            for r in rows:
                key = f"{r['marca']}|{r['tipo']}|{r['entalle']}|{r['tela']}|{r['hilo']}"
                if key not in item_map:
                    item_map[key] = {
                        "marca": r['marca'], "tipo": r['tipo'],
                        "entalle": r['entalle'], "tela": r['tela'],
                        "hilo": r['hilo'],
                        "values": {}, "total": 0
                    }
                qty = float(r['qty'] or 0)
                item_map[key]["values"][r['talla']] = round(qty)
                item_map[key]["total"] += qty

            result_rows = sorted(item_map.values(), key=lambda x: -x['total'])
            for row in result_rows:
                row["total"] = round(row["total"])

            # Totals by talla
            totals_by_talla = {}
            grand_total = 0
            for row in result_rows:
                grand_total += row["total"]
                for t in tallas:
                    totals_by_talla[t] = totals_by_talla.get(t, 0) + row["values"].get(t, 0)

            # Filter options for cascade
            filter_opts = {}
            for col in ['tienda', 'marca', 'tipo', 'entalle', 'tela', 'hilo']:
                f_rows = await conn.fetch(
                    f"SELECT DISTINCT {col}::text as v FROM {VIEW} {where} AND {col} IS NOT NULL ORDER BY v",
                    *params
                )
                filter_opts[col] = [r['v'] for r in f_rows]
            # Talla and color options
            filter_opts['talla'] = tallas
            c_rows = await conn.fetch(
                f"SELECT DISTINCT color::text as v FROM {VIEW} {where} AND color IS NOT NULL ORDER BY v",
                *params
            )
            filter_opts['color'] = [r['v'] for r in c_rows]

            return {
                "tallas": tallas,
                "rows": result_rows,
                "totals_by_talla": totals_by_talla,
                "grand_total": round(grand_total),
                "total_items": total_items,
                "page": page,
                "limit": limit,
                "filter_opts": filter_opts
            }
        except Exception as e:
            logger.error(f"stock_balance_matrix error: {e}")
            import traceback
            traceback.print_exc()
            return {
                "tallas": [], "rows": [], "totals_by_talla": {},
                "grand_total": 0, "total_items": 0,
                "page": page, "limit": limit, "filter_opts": {}
            }


@router.get("/colors-matrix")
async def stock_balance_colors(
    marca: str = "", tipo: str = "", entalle: str = "",
    tela: str = "", hilo: str = "",
    tienda: str = "", color: str = "", talla: str = "",
    modelo: str = "",
    authorization: str = None
):
    """Color detail for a selected item: rows=COLOR, cols=tallas."""
    from server import get_current_user
    await get_current_user(authorization=authorization)

    if not any([marca, tipo, entalle, tela, hilo]):
        return {"tallas": [], "rows": [], "totals_by_talla": {}, "grand_total": 0}

    p = await get_pool()
    async with p.acquire() as conn:
        try:
            where, params = _build_where(tienda, marca, tipo, entalle, tela, hilo, color, talla, modelo)

            # Get tallas for this item
            t_rows = await conn.fetch(
                f"SELECT DISTINCT talla::text as t FROM {VIEW} {where} AND talla IS NOT NULL",
                *params
            )
            tallas = sorted([r['t'] for r in t_rows], key=_talla_sort_key)

            # Get color x talla matrix
            rows = await conn.fetch(f"""
                SELECT COALESCE(color,'Sin color') as color, talla::text as talla,
                       SUM(available_qty) as qty
                FROM {VIEW} {where}
                GROUP BY color, talla
                ORDER BY color, talla
            """, *params)

            color_map = {}
            for r in rows:
                c = r['color']
                if c not in color_map:
                    color_map[c] = {"color": c, "values": {}, "total": 0}
                qty = float(r['qty'] or 0)
                color_map[c]["values"][r['talla']] = round(qty)
                color_map[c]["total"] += qty

            result_rows = sorted(color_map.values(), key=lambda x: -x['total'])
            for row in result_rows:
                row["total"] = round(row["total"])

            totals_by_talla = {}
            grand_total = 0
            for row in result_rows:
                grand_total += row["total"]
                for t in tallas:
                    totals_by_talla[t] = totals_by_talla.get(t, 0) + row["values"].get(t, 0)

            return {
                "tallas": tallas,
                "rows": result_rows,
                "totals_by_talla": totals_by_talla,
                "grand_total": round(grand_total)
            }
        except Exception as e:
            logger.error(f"stock_balance_colors error: {e}")
            import traceback
            traceback.print_exc()
            return {"tallas": [], "rows": [], "totals_by_talla": {}, "grand_total": 0}
