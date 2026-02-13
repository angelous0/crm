"""Stock Balance (Balance de Tallas) router."""
from fastapi import APIRouter, Depends
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


def _get_auth_dep():
    from server import get_current_user
    return get_current_user


@router.get("/matrix")
async def stock_balance_matrix(
    tienda: str = "", marca: str = "", tipo: str = "", entalle: str = "",
    tela: str = "", hilo: str = "", color: str = "", talla: str = "",
    modelo: str = "",
    limit: int = 300, page: int = 1,
    user=Depends(_get_auth_dep())
):
    """Item x Tallas matrix: rows=MARCA-TIPO-ENTALLE-TELA-HILO, cols=tallas."""
    p = await get_pool()
    async with p.acquire() as conn:
        try:
            where, params = _build_where(tienda, marca, tipo, entalle, tela, hilo, color, talla, modelo)

            # Fetch all filtered rows in one query (view has ~15K rows max)
            rows = await conn.fetch(f"""
                SELECT marca::text, tipo::text, entalle::text, tela::text,
                       COALESCE(hilo::text,'SIN_HILO') as hilo,
                       talla::text, color::text, tienda::text,
                       available_qty
                FROM {VIEW} {where}
            """, *params, timeout=120)

            # Process everything in Python (fast for <20K rows)
            item_map = {}
            tallas_set = set()
            fopts = {"tienda": set(), "marca": set(), "tipo": set(),
                     "entalle": set(), "tela": set(), "hilo": set(), "color": set()}

            for r in rows:
                marca_v = r['marca'] or ''
                tipo_v = r['tipo'] or ''
                entalle_v = r['entalle'] or ''
                tela_v = r['tela'] or ''
                hilo_v = r['hilo'] or 'SIN_HILO'
                t = r['talla']
                qty = float(r['available_qty'] or 0)

                # Collect filter options
                if r['tienda']: fopts['tienda'].add(r['tienda'])
                if r['marca']: fopts['marca'].add(r['marca'])
                if r['tipo']: fopts['tipo'].add(r['tipo'])
                if r['entalle']: fopts['entalle'].add(r['entalle'])
                if r['tela']: fopts['tela'].add(r['tela'])
                if r['hilo']: fopts['hilo'].add(r['hilo'])
                if r['color']: fopts['color'].add(r['color'])

                key = f"{marca_v}|{tipo_v}|{entalle_v}|{tela_v}|{hilo_v}"
                if key not in item_map:
                    item_map[key] = {
                        "marca": marca_v, "tipo": tipo_v,
                        "entalle": entalle_v, "tela": tela_v,
                        "hilo": hilo_v,
                        "values": {}, "total": 0
                    }
                if t:
                    tallas_set.add(t)
                    item_map[key]["values"][t] = item_map[key]["values"].get(t, 0) + round(qty)
                    item_map[key]["total"] += qty

            tallas = sorted(tallas_set, key=_talla_sort_key)

            # Sort by total desc, paginate
            all_items = sorted(item_map.values(), key=lambda x: -x['total'])
            total_items = len(all_items)
            offset = (page - 1) * limit
            page_items = all_items[offset:offset + limit]
            for row in page_items:
                row["total"] = round(row["total"])

            # Totals for current page
            totals_by_talla = {}
            grand_total = 0
            for row in page_items:
                grand_total += row["total"]
                for t in tallas:
                    totals_by_talla[t] = totals_by_talla.get(t, 0) + row["values"].get(t, 0)

            # Build filter options
            filter_opts = {k: sorted(v) for k, v in fopts.items()}
            filter_opts['talla'] = tallas

            return {
                "tallas": tallas,
                "rows": page_items,
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
    user=Depends(_get_auth_dep())
):
    """Color detail for a selected item: rows=COLOR, cols=tallas."""
    if not any([marca, tipo, entalle, tela, hilo]):
        return {"tallas": [], "rows": [], "totals_by_talla": {}, "grand_total": 0}

    p = await get_pool()
    async with p.acquire() as conn:
        try:
            where, params = _build_where(tienda, marca, tipo, entalle, tela, hilo, color, talla, modelo)

            rows = await conn.fetch(f"""
                SELECT COALESCE(color,'Sin color') as color, talla::text as talla,
                       SUM(available_qty) as qty
                FROM {VIEW} {where}
                GROUP BY color, talla
            """, *params, timeout=60)

            tallas_set = set()
            color_map = {}
            for r in rows:
                c, t = r['color'], r['talla']
                if t:
                    tallas_set.add(t)
                if c not in color_map:
                    color_map[c] = {"color": c, "values": {}, "total": 0}
                qty = float(r['qty'] or 0)
                if t:
                    color_map[c]["values"][t] = round(qty)
                color_map[c]["total"] += qty

            tallas = sorted(tallas_set, key=_talla_sort_key)
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
