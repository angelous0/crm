"""Reposición v3 – SKU Summary + Model Drilldown router."""
from fastapi import APIRouter, Depends
import logging

from db import get_pool

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/reposicion", tags=["reposicion"])

VIEW = "crm.v_stock_balance_flat"

# Tienda group mapping: raw x_nombre → canonical group
TIENDA_MAP = {
    'TALLER': 'ALMACEN',
    'GM209': 'GM209',
    'GM207': 'GM207',
    'GM218': 'GM218',
    'GR238': 'GR238',
    'GR55': 'GR55',
    'AP': 'AP',
    'BOOSH': 'BOOSH',
    'REMATE': 'REMATE',
    'ZAP': 'ZAP',
    'Fallados Qepo': 'FALLADOS',
}

# GRAU 238 / GRAU 55 = combined GR238 + GR55
GRAU_GROUP = 'GRAU 238 / GRAU 55'
GRAU_MEMBERS = {'GR238', 'GR55'}

# Fixed destination columns for display
DEST_COLUMNS = ['GM209', 'GM218', GRAU_GROUP, 'GM207', 'BOOSH']

# Marca → target destinations
MARCA_TARGETS = {
    'QEPO': {'BOOSH', 'GM207'},
    'BOOSH': {'BOOSH'},
    'ELEMENT PREMIUM': {'GM209', 'GM218', GRAU_GROUP},
}

TALLA_LETTER_ORDER = {'XXS': 1, 'XS': 2, 'S': 3, 'M': 4, 'L': 5, 'XL': 6, 'XXL': 7, 'XXXL': 8}


def _talla_sort_key(t):
    if t in TALLA_LETTER_ORDER:
        return (1, TALLA_LETTER_ORDER[t])
    try:
        return (0, int(t))
    except (ValueError, TypeError):
        return (2, t or '')


def _map_tienda(raw):
    """Map raw tienda name to tienda_group."""
    return TIENDA_MAP.get(raw, raw)


def _dest_stock(stores, dest):
    """Get stock for a destination (handles GRAU combo)."""
    if dest == GRAU_GROUP:
        return stores.get('GR238', 0) + stores.get('GR55', 0)
    return stores.get(dest, 0)


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


@router.get("/sku-summary")
async def sku_summary(
    tienda: str = "", marca: str = "", tipo: str = "", entalle: str = "",
    tela: str = "", hilo: str = "", color: str = "", talla: str = "",
    modelo: str = "",
    umbral_destino: int = 0,
    objetivo_destino: int = 2,
    umbral_min_origen: int = 0,
    solo_objetivo: bool = True,
    page: int = 1, limit: int = 200,
    user=Depends(_get_auth_dep())
):
    """Level 1: SKU summary with store columns and allocation."""
    p = await get_pool()
    async with p.acquire() as conn:
        try:
            where, params = _build_where(tienda, marca, tipo, entalle, tela, hilo, color, talla, modelo)

            rows = await conn.fetch(f"""
                SELECT marca::text, tipo::text, entalle::text, tela::text,
                       COALESCE(hilo::text,'SIN_HILO') as hilo,
                       talla::text, color::text, tienda::text,
                       modelo::text, available_qty
                FROM {VIEW} {where}
            """, *params, timeout=120)

            # Group by SKU = (marca, tipo, entalle, tela, color, talla)
            # Also track tallado per item_base per tienda_group
            skus = {}
            tallado_sets = {}  # (item_base, tienda_group) -> set of (color, talla)

            for r in rows:
                marca_v = (r['marca'] or '').strip()
                tipo_v = (r['tipo'] or '').strip()
                entalle_v = (r['entalle'] or '').strip()
                tela_v = (r['tela'] or '').strip()
                hilo_v = (r['hilo'] or 'SIN_HILO').strip()
                color_v = (r['color'] or '').strip()
                talla_v = (r['talla'] or '').strip()
                tienda_raw = (r['tienda'] or '').strip()
                qty = float(r['available_qty'] or 0)

                tg = _map_tienda(tienda_raw)

                sku_key = f"{marca_v}|{tipo_v}|{entalle_v}|{tela_v}|{color_v}|{talla_v}"
                if sku_key not in skus:
                    skus[sku_key] = {
                        'marca': marca_v, 'tipo': tipo_v, 'entalle': entalle_v,
                        'tela': tela_v, 'color': color_v, 'talla': talla_v,
                        'stores': {},
                    }
                skus[sku_key]['stores'][tg] = skus[sku_key]['stores'].get(tg, 0) + qty

                # Track tallado at item_base level (marca, tipo, entalle, tela)
                if qty > 0:
                    # Map to display group for tallado
                    display_tg = GRAU_GROUP if tg in GRAU_MEMBERS else tg
                    ib = f"{marca_v}|{tipo_v}|{entalle_v}|{tela_v}"
                    tall_key = (ib, display_tg)
                    if tall_key not in tallado_sets:
                        tallado_sets[tall_key] = set()
                    tallado_sets[tall_key].add((color_v, talla_v))

            tallado = {k: len(v) for k, v in tallado_sets.items()}
            del tallado_sets

            # Build SKU result list
            results = []
            for sku_key, sku in skus.items():
                stores = sku['stores']
                stock_almacen = int(stores.get('ALMACEN', 0))
                stock_ap = int(stores.get('AP', 0))
                stock_total = int(sum(stores.values()))

                marca_n = sku['marca'].upper().strip()
                ib = f"{sku['marca']}|{sku['tipo']}|{sku['entalle']}|{sku['tela']}"

                targets = MARCA_TARGETS.get(marca_n, set())

                # Build destination info
                destinos = []
                for dest in DEST_COLUMNS:
                    st = int(_dest_stock(stores, dest))
                    is_obj = dest in targets
                    score = tallado.get((ib, dest), 0)
                    destinos.append({
                        'tienda_group': dest,
                        'stock': st,
                        'score_tallado': score,
                        'es_objetivo': is_obj,
                    })

                # Determine which destinations need replenishment
                if solo_objetivo and targets:
                    need_dests = [d for d in destinos if d['es_objetivo'] and d['stock'] <= umbral_destino]
                else:
                    need_dests = [d for d in destinos if d['stock'] <= umbral_destino]

                if not need_dests:
                    continue  # No replenishment needed

                # Sort destinations by priority
                need_dests_sorted = _sort_dests(need_dests, marca_n, tallado, ib)

                # Allocation
                recomendaciones = []
                pool = max(0, stock_almacen - umbral_min_origen)

                for d in need_dests_sorted:
                    need = max(0, objetivo_destino - d['stock'])
                    assign = min(need, pool)
                    pool -= assign

                    motivo_parts = []
                    if assign > 0:
                        motivo_parts.append('Desde ALMACEN')
                        if d['es_objetivo']:
                            motivo_parts.append('Prioridad marca')
                        if assign < need:
                            motivo_parts.append('Cap por stock')
                    else:
                        motivo_parts.append('Sin stock para asignar')

                    recomendaciones.append({
                        'destino': d['tienda_group'],
                        'stock_destino': d['stock'],
                        'origen': 'ALMACEN',
                        'qty_sugerida': need,
                        'qty_asignada': assign,
                        'motivo': ' · '.join(motivo_parts),
                    })

                # Determine estado
                any_faltante = any(d['stock'] == 0 for d in need_dests)
                estado = 'FALTANTE' if any_faltante else 'BAJO'

                # Primary recommendation text
                assigned_recs = [r for r in recomendaciones if r['qty_asignada'] > 0]
                rec_text = ""
                if assigned_recs:
                    parts = [f"ALMACEN → {r['destino']}: {r['qty_asignada']}" for r in assigned_recs]
                    rec_text = " | ".join(parts)
                else:
                    rec_text = "Sin stock disponible"

                results.append({
                    'sku_key': sku_key,
                    'marca': sku['marca'], 'tipo': sku['tipo'], 'entalle': sku['entalle'],
                    'tela': sku['tela'], 'color': sku['color'], 'talla': sku['talla'],
                    'stock_total': stock_total,
                    'stock_almacen': stock_almacen,
                    'stock_ap': stock_ap,
                    'destinos': destinos,
                    'recomendaciones': recomendaciones,
                    'rec_text': rec_text,
                    'estado': estado,
                })

            # Sort: FALTANTE first, then BAJO; within: stock_total ASC, stock_almacen DESC
            results.sort(key=lambda r: (
                0 if r['estado'] == 'FALTANTE' else 1,
                r['stock_total'],
                -r['stock_almacen'],
                -max((d['score_tallado'] for d in r['destinos'] if d['es_objetivo']), default=0),
                r['marca'], r['tipo'], r['tela'], r['color'],
                _talla_sort_key(r['talla']),
            ))

            total = len(results)
            offset = (page - 1) * limit
            page_items = results[offset:offset + limit]

            # KPIs
            total_asignada = sum(sum(r['qty_asignada'] for r in s['recomendaciones']) for s in results)
            con_asig = sum(1 for s in results if any(r['qty_asignada'] > 0 for r in s['recomendaciones']))
            sin_stock = sum(1 for s in results if all(r['qty_asignada'] == 0 for r in s['recomendaciones']))
            faltantes = sum(1 for s in results if s['estado'] == 'FALTANTE')
            bajos = sum(1 for s in results if s['estado'] == 'BAJO')

            return {
                "items": page_items,
                "total": total,
                "kpis": {
                    "total_skus": total,
                    "faltantes": faltantes,
                    "bajos": bajos,
                    "con_asignacion": con_asig,
                    "total_qty_asignada": total_asignada,
                    "sin_stock": sin_stock,
                },
            }
        except Exception as e:
            logger.error(f"sku_summary error: {e}")
            import traceback; traceback.print_exc()
            return {"items": [], "total": 0, "kpis": {}}


@router.get("/sku-models")
async def sku_models(
    marca: str = "", tipo: str = "", entalle: str = "",
    tela: str = "", color: str = "", talla: str = "",
    tienda: str = "", hilo: str = "", modelo: str = "",
    user=Depends(_get_auth_dep())
):
    """Level 2: Models for a specific SKU with per-store stock."""
    if not any([marca, tipo, color, talla]):
        return {"models": []}

    p = await get_pool()
    async with p.acquire() as conn:
        try:
            where, params = _build_where(tienda, marca, tipo, entalle, tela, hilo, color, talla, modelo)

            rows = await conn.fetch(f"""
                SELECT modelo::text, product_tmpl_id, tienda::text, SUM(available_qty) as qty
                FROM {VIEW} {where}
                GROUP BY modelo, product_tmpl_id, tienda
            """, *params, timeout=60)

            model_map = {}
            for r in rows:
                mid = r['modelo'] or '?'
                tg = _map_tienda(r['tienda'] or '')
                qty = float(r['qty'] or 0)

                if mid not in model_map:
                    model_map[mid] = {
                        'modelo': mid,
                        'product_tmpl_id': r['product_tmpl_id'],
                        'stores': {},
                    }
                display_tg = GRAU_GROUP if tg in GRAU_MEMBERS else tg
                model_map[mid]['stores'][display_tg] = model_map[mid]['stores'].get(display_tg, 0) + qty

            result = []
            for m in model_map.values():
                stores = m['stores']
                stock_almacen = int(stores.get('ALMACEN', 0))
                stock_total = int(sum(stores.values()))

                por_tienda = []
                for dest in DEST_COLUMNS:
                    por_tienda.append({
                        'tienda_group': dest,
                        'stock': int(stores.get(dest, 0)),
                    })

                result.append({
                    'modelo': m['modelo'],
                    'product_tmpl_id': m['product_tmpl_id'],
                    'stock_total': stock_total,
                    'stock_almacen': stock_almacen,
                    'por_tienda': por_tienda,
                })

            result.sort(key=lambda x: (-x['stock_almacen'], x['stock_total'], x['modelo']))

            return {"models": result}
        except Exception as e:
            logger.error(f"sku_models error: {e}")
            import traceback; traceback.print_exc()
            return {"models": []}


def _sort_dests(dests, marca_n, tallado, ib):
    """Sort destinations by priority: tallado DESC, then rules."""
    def sort_key(d):
        is_target = d['es_objetivo']
        score = d['score_tallado']

        # For ELEMENT PREMIUM: GM209 vs GRAU by tallado, then GRAU as tiebreaker
        if marca_n == 'ELEMENT PREMIUM':
            grau_bonus = 1 if d['tienda_group'] == GRAU_GROUP else 0
            return (-int(is_target), -score, -grau_bonus, d['tienda_group'])

        return (-int(is_target), -score, d['tienda_group'])

    return sorted(dests, key=sort_key)
