"""Endpoint /api/sync/status — freshness de todas las fuentes de datos.

Sprint CRM-D4 v3. Para que el usuario sepa desde la UI hasta qué fecha está
actualizado cada dato (matviews CRM, sync Odoo, catálogo enriquecido).

Usado por el sync-pill del topbar. No requiere rol admin — todos los users
autenticados pueden ver el estado.

OPTIMIZACIÓN: la respuesta se cachea 30s en memoria. Como el dato muestra
"hace 12m" o similar, no necesita ser fresco al segundo. Reduce ~10 queries
seriales × N usuarios por minuto a ~10 queries × 2/minuto.
"""
import asyncio
import time
from datetime import datetime, timezone
from fastapi import APIRouter, Depends

from auth_utils import get_current_user
from db import safe_acquire


router = APIRouter(prefix="/api/sync")

# Cache simple en memoria: (timestamp_de_cache, payload)
_CACHE_TTL_SECS = 30
_cache_state = {"ts": 0.0, "payload": None}
_cache_lock = asyncio.Lock()


def _seconds_ago(dt: datetime) -> int:
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int((datetime.now(timezone.utc) - dt).total_seconds())


def _format_relativo(seconds: int) -> str:
    if seconds is None:
        return "—"
    if seconds < 60:
        return f"hace {seconds}s"
    if seconds < 3600:
        return f"hace {seconds // 60}m"
    if seconds < 86400:
        return f"hace {seconds // 3600}h"
    return f"hace {seconds // 86400}d"


def _bucket(seconds: int, ok_max: int, warn_max: int) -> str:
    """Devuelve 'ok' / 'warn' / 'crit' según los umbrales."""
    if seconds is None:
        return "crit"
    if seconds < ok_max:
        return "ok"
    if seconds < warn_max:
        return "warn"
    return "crit"


@router.get("/status")
async def get_sync_status(_user: dict = Depends(get_current_user)):
    """Retorna el estado de sincronización de cada fuente de datos.

    Resultado cacheado 30s en memoria (es info que cambia lento).

    Buckets de salud:
    - ok:   datos frescos
    - warn: datos un poco viejos pero usables
    - crit: datos muy viejos, hay que investigar
    """
    # Cache hit: si tenemos respuesta fresca <30s, devolvemos sin tocar DB
    now = time.time()
    if _cache_state["payload"] is not None and (now - _cache_state["ts"]) < _CACHE_TTL_SECS:
        return _cache_state["payload"]

    # Lock para evitar stampede: si 5 usuarios pegan al mismo tiempo,
    # solo uno hace las queries, los otros esperan y reciben el resultado cacheado.
    async with _cache_lock:
        # Re-check después del lock (otro request pudo haberlo poblado)
        now = time.time()
        if _cache_state["payload"] is not None and (now - _cache_state["ts"]) < _CACHE_TTL_SECS:
            return _cache_state["payload"]

        payload = await _compute_sync_status()
        _cache_state["payload"] = payload
        _cache_state["ts"] = time.time()
        return payload


async def _compute_sync_status():
    """Ejecuta las queries de freshness. Llamado por get_sync_status() solo
    cuando el caché vence."""
    items = []
    async with safe_acquire() as conn:
        # ─── 1. Matviews CRM (refresh nocturno 3am Lima) ───
        # Threshold: ok < 26h, warn < 30h, crit > 30h (cron diario + buffer)
        mv_rows = await conn.fetch("""
            SELECT m.matviewname AS name,
                   GREATEST(s.last_analyze, s.last_autoanalyze) AS ts,
                   s.n_live_tup AS filas,
                   pg_total_relation_size(quote_ident(m.schemaname)||'.'||quote_ident(m.matviewname)) AS bytes
            FROM pg_matviews m
            LEFT JOIN pg_stat_user_tables s
                ON s.schemaname = m.schemaname AND s.relname = m.matviewname
            WHERE m.schemaname = 'crm'
            ORDER BY m.matviewname
        """)
        for r in mv_rows:
            secs = _seconds_ago(r["ts"])
            items.append({
                "categoria": "Matviews CRM",
                "tabla": r["name"],
                "descripcion": "Refresh nocturno 3am Lima",
                "ultima_actualizacion": r["ts"].isoformat() if r["ts"] else None,
                "hace": _format_relativo(secs),
                "seconds_ago": secs,
                "estado": _bucket(secs, ok_max=26 * 3600, warn_max=30 * 3600),
                "filas": int(r["filas"] or 0),
                "size_mb": round((r["bytes"] or 0) / 1024 / 1024, 1),
            })

        # ─── 2. Sincronización Odoo ───
        # Para cada tabla mostramos DOS datos:
        #   - last_sync_at   = última corrida exitosa del job (sync_job.last_success_at)
        #   - last_data_at   = última fila modificada (MAX(odoo_write_date))
        # El bucket de salud se basa en last_sync_at (¿corrió el job?), no en
        # last_data_at (que puede estar viejo simplemente porque no hubo movimiento
        # en Odoo). Threshold: ok < 26h, warn < 48h, crit > 48h.
        odoo_tables = [
            ("v_pos_order_real",       "Órdenes POS",         "POS_ORDERS",         "odoo.v_pos_order_real",       "odoo_write_date", None),
            ("res_partner",            "Clientes (partners)", "RES_PARTNER",        "odoo.res_partner",            "odoo_write_date", "company_key='GLOBAL'"),
            ("product_template",       "Catálogo productos",  "PRODUCTS",           "odoo.product_template",       "odoo_write_date", "company_key='GLOBAL'"),
            ("account_invoice_credit", "Facturas crédito",    "AR_CREDIT_INVOICES", "odoo.account_invoice_credit", "odoo_write_date", None),
        ]
        for short, desc, job_code, full, ts_col, where in odoo_tables:
            # last_data_at = MAX(write_date) de la tabla
            try:
                where_clause = f"WHERE {where}" if where else ""
                last_data_at = await conn.fetchval(
                    f"SELECT MAX({ts_col}) FROM {full} {where_clause}"
                )
            except Exception:
                last_data_at = None

            # last_sync_at = última corrida exitosa del job
            try:
                job_row = await conn.fetchrow(
                    "SELECT last_success_at, last_run_at, last_error, run_time, enabled "
                    "FROM odoo.sync_job WHERE job_code = $1",
                    job_code,
                )
            except Exception:
                job_row = None

            last_sync_at = job_row["last_success_at"] if job_row else None
            sync_secs = _seconds_ago(last_sync_at)
            data_secs = _seconds_ago(last_data_at)

            items.append({
                "categoria": "Sync Odoo",
                "tabla": short,
                "descripcion": desc,
                "job_code": job_code,
                "schedule": (
                    f"diario {job_row['run_time'].strftime('%H:%M')} UTC"
                    if job_row and job_row.get("run_time") else None
                ),
                # Última actualización del DATO (write_date Odoo)
                "ultima_actualizacion": last_data_at.isoformat() if last_data_at else None,
                "hace": _format_relativo(data_secs),
                # Último JOB exitoso
                "last_sync_at": last_sync_at.isoformat() if last_sync_at else None,
                "last_sync_hace": _format_relativo(sync_secs),
                "seconds_ago": sync_secs,  # health basado en sync, no en data
                "estado": _bucket(sync_secs, ok_max=26 * 3600, warn_max=48 * 3600),
                "ultimo_error": job_row["last_error"] if job_row else None,
            })

        # ─── 3. Productos enriquecidos (módulo Producción) ───
        try:
            row = await conn.fetchrow("""
                SELECT MAX(updated_at) AS ts,
                       COUNT(*) AS total,
                       COUNT(*) FILTER (WHERE marca_id IS NOT NULL) AS con_marca,
                       COUNT(*) FILTER (WHERE tipo_id IS NOT NULL) AS con_tipo
                FROM produccion.prod_odoo_productos_enriq
            """)
            secs = _seconds_ago(row["ts"])
            items.append({
                "categoria": "Catálogo enriquecido",
                "tabla": "prod_odoo_productos_enriq",
                "descripcion": "Marca/tipo canónicos del módulo Producción",
                "ultima_actualizacion": row["ts"].isoformat() if row["ts"] else None,
                "hace": _format_relativo(secs),
                "seconds_ago": secs,
                "estado": _bucket(secs, ok_max=7 * 86400, warn_max=30 * 86400),
                "filas": int(row["total"]),
                "con_marca": int(row["con_marca"]),
                "con_tipo": int(row["con_tipo"]),
            })
        except Exception:
            pass

    # Resumen global: peor estado define el global
    estados = {it["estado"] for it in items}
    if "crit" in estados:
        global_estado = "crit"
        global_label = "Algunas tablas atrasadas"
    elif "warn" in estados:
        global_estado = "warn"
        global_label = "Algunas tablas envejecidas"
    else:
        global_estado = "ok"
        global_label = "Todo sincronizado"

    # "Más reciente" entre las matviews CRM (la más representativa de "venta real")
    matviews_secs = [it["seconds_ago"] for it in items
                     if it["categoria"] == "Matviews CRM" and it["seconds_ago"] is not None]
    venta_real_hace = _format_relativo(min(matviews_secs)) if matviews_secs else "—"

    return {
        "global": {
            "estado": global_estado,
            "label": global_label,
            "venta_real_hace": venta_real_hace,
        },
        "items": items,
    }
