from fastapi import FastAPI
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import asyncio
import asyncpg
import logging
import os
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from routes.auth import router as auth_router
from routes.cuentas import router as cuentas_router
from routes.contactos import router as contactos_router
from routes.interacciones import router as interacciones_router
from routes.tareas import router as tareas_router
from routes.mi_dia import router as mi_dia_router
from routes.partners import router as partners_router
from routes.maintenance import router as maintenance_router
from routes.admin import router as admin_router
from routes.cola import router as cola_router
from routes.grupos import router as grupos_router
from routes.sync_status import router as sync_status_router
from routes.pipeline import router as pipeline_router
from routes.equipo import router as equipo_router
from routes.locales import router as locales_router
from routes.mapa import router as mapa_router
from routes.admin_ai import router as admin_ai_router
from routes.vinculos_revision import router as vinculos_revision_router
from routes.reparto import router as reparto_router
from routes.cobranzas import router as cobranzas_router
from migrations.startup_ddl import ensure_startup_ddl
from db import get_pool, close_pool, safe_acquire
import auth_utils  # noqa: F401

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Logging básico: que todos los mensajes del scheduler salgan al stdout de uvicorn.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="CRM API", version="0.1.0")

# ── Scheduler de refresh nocturno de matviews (3am Lima) ───────────────────────
LIMA_TZ = ZoneInfo("America/Lima")


async def _refresh_matviews_once() -> bool:
    """Ejecuta refresh CONCURRENTLY de las matviews del CRM + ANALYZE.

    Llamada por el loop nocturno y por el safety check de startup.
    Retorna True si fue OK, False si falló (no propaga la excepción).
    """
    logger.info("[matview-refresh] Iniciando refresh de matviews…")
    start = datetime.now(LIMA_TZ)
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "REFRESH MATERIALIZED VIEW CONCURRENTLY crm.mv_pos_line_cuenta"
            )
            await conn.execute(
                "REFRESH MATERIALIZED VIEW CONCURRENTLY crm.mv_cuenta_sales_kpi"
            )
            # mv_cuenta_estado depende de las dos anteriores; va al final.
            try:
                await conn.execute(
                    "REFRESH MATERIALIZED VIEW CONCURRENTLY crm.mv_cuenta_estado"
                )
            except Exception:
                # Primera vez: aún no tiene UNIQUE index → fallback non-CONCURRENT
                await conn.execute(
                    "REFRESH MATERIALIZED VIEW crm.mv_cuenta_estado"
                )
            await conn.execute("ANALYZE crm.mv_pos_line_cuenta")
            await conn.execute("ANALYZE crm.mv_cuenta_sales_kpi")
            await conn.execute("ANALYZE crm.mv_cuenta_estado")
        elapsed = (datetime.now(LIMA_TZ) - start).total_seconds()
        logger.info(f"[matview-refresh] OK en {elapsed:.1f}s")
        return True
    except Exception as e:
        logger.error(f"[matview-refresh] FALLO: {e}", exc_info=True)
        return False


async def _matviews_refresh_loop() -> None:
    """Loop infinito: duerme hasta la próxima 3am Lima y refresca."""
    while True:
        try:
            now = datetime.now(LIMA_TZ)
            next_3am = now.replace(hour=3, minute=0, second=0, microsecond=0)
            if next_3am <= now:
                next_3am += timedelta(days=1)
            sleep_secs = (next_3am - now).total_seconds()
            logger.info(
                f"[matview-refresh] Próximo refresh: {next_3am.isoformat()} "
                f"(en {sleep_secs/3600:.1f}h)"
            )
            await asyncio.sleep(sleep_secs)
            await _refresh_matviews_once()
        except asyncio.CancelledError:
            logger.info("[matview-refresh] Loop cancelado (shutdown)")
            raise
        except Exception as e:
            # No romper el loop por errores transitorios; reintentar en 1h.
            logger.error(f"[matview-refresh] Error inesperado en loop: {e}",
                         exc_info=True)
            await asyncio.sleep(3600)


async def _safety_check_matview_freshness() -> None:
    """Si la matview lleva >25h sin refresh/analyze, refresca ahora.

    Útil cuando el backend estuvo caído >24h y el job nocturno se perdió.
    """
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT EXTRACT(EPOCH FROM (NOW() - GREATEST(
                    COALESCE(last_vacuum,    '1970-01-01'::timestamptz),
                    COALESCE(last_autovacuum,'1970-01-01'::timestamptz),
                    COALESCE(last_analyze,   '1970-01-01'::timestamptz),
                    COALESCE(last_autoanalyze,'1970-01-01'::timestamptz)
                )))::int AS seconds_since_refresh
                FROM pg_stat_user_tables
                WHERE schemaname = 'crm' AND relname = 'mv_pos_line_cuenta'
            """)
        if row and row["seconds_since_refresh"] is not None:
            hours_old = row["seconds_since_refresh"] / 3600
            logger.info(
                f"[matview-refresh] Matview tiene {hours_old:.1f}h "
                f"desde último refresh/analyze"
            )
            if hours_old > 25:
                logger.warning(
                    "[matview-refresh] >25h sin refresh — refrescando ahora…"
                )
                await _refresh_matviews_once()
        else:
            logger.info(
                "[matview-refresh] Sin datos de freshness — omitiendo safety check"
            )
    except Exception as e:
        logger.error(f"[matview-refresh] Error en safety check: {e}")


@app.exception_handler(asyncpg.exceptions.ConnectionDoesNotExistError)
async def db_connection_error_handler(request, exc):
    import db as _db
    try:
        if _db.pool and not _db.pool._closed:
            await _db.pool.close()
    except Exception:
        pass
    _db.pool = None
    return JSONResponse(status_code=503, content={"detail": "Conexión BD perdida. Reintente."})


@app.exception_handler(asyncpg.exceptions.InterfaceError)
async def db_interface_error_handler(request, exc):
    import db as _db
    try:
        if _db.pool and not _db.pool._closed:
            await _db.pool.close()
    except Exception:
        pass
    _db.pool = None
    return JSONResponse(status_code=503, content={"detail": "Error BD. Reintente."})


# ── Ventas en vivo: poll Odoo periódicamente para sync incremental ────────────
# Patrón: el CRM dispara syncs incrementales al backend de Odoo cada N segundos.
#
# Anti-carrera del cursor (importante):
#   - Mutex local _ventas_vivo_lock previene que 2 iteraciones del loop se
#     solapen. Si el sync anterior aún corre, la nueva iteración se salta.
#   - Los 3 syncs (POS Ambission, POS ProyectoModa, RES_PARTNER) corren en
#     SERIE para no competir por el advisory lock del Odoo backend
#     (pg_advisory_lock 777777). Si corrieran en paralelo, 2 de 3 fallan.
#   - Timeout de 50s por iteración: si algo se atasca, descartamos y seguimos.
#
# Resultado: latencia ~15-45s end-to-end con cero carreras de cursor.

import httpx

ODOO_BACKEND_URL = os.environ.get("ODOO_BACKEND_URL", "http://localhost:8002")
VENTAS_VIVO_INTERVAL = int(os.environ.get("VENTAS_VIVO_INTERVAL", "15"))
VENTAS_VIVO_TIMEOUT = int(os.environ.get("VENTAS_VIVO_TIMEOUT", "50"))

_ventas_vivo_lock = asyncio.Lock()


async def _disparar_sync(client: "httpx.AsyncClient", job_code: str,
                          company_key: str = None) -> None:
    """POST individual a /api/sync/run con manejo silencioso de errores."""
    body = {"job_code": job_code, "mode": "INCREMENTAL"}
    if company_key:
        body["company_key"] = company_key
    try:
        r = await client.post(f"{ODOO_BACKEND_URL}/api/sync/run", json=body, timeout=20.0)
        if r.status_code == 200:
            data = r.json()
            if not data.get("success"):
                # "Otra sincronización en curso" no es error grave — siguiente intento
                msg = data.get("message", "")
                if "Otra sincronización" not in msg:
                    logger.debug(f"[ventas-vivo] {job_code}/{company_key}: {msg}")
    except Exception as e:
        # Timeout, conexión rechazada, etc. — no romper el loop
        logger.debug(f"[ventas-vivo] {job_code}/{company_key} skip: {e}")


async def _ventas_en_vivo_loop() -> None:
    """Cada N segundos dispara sync incremental al Odoo backend.
    Mutex previene solapamiento; los 3 syncs corren en serie."""
    logger.info(f"[ventas-vivo] Iniciado · interval={VENTAS_VIVO_INTERVAL}s · "
                f"timeout={VENTAS_VIVO_TIMEOUT}s · odoo={ODOO_BACKEND_URL}")
    while True:
        # Saltar esta iteración si la anterior aún no termina
        if _ventas_vivo_lock.locked():
            logger.debug("[ventas-vivo] Sync anterior aún corriendo, skip")
        else:
            try:
                async with _ventas_vivo_lock:
                    # asyncio.wait_for soportado en Python 3.9 (vs asyncio.timeout
                    # que es 3.11+)
                    async def _ronda():
                        async with httpx.AsyncClient(timeout=20.0) as client:
                            # Serie: 3 syncs uno tras otro para no competir
                            # por el advisory lock del Odoo backend
                            await _disparar_sync(client, "POS_ORDERS", "Ambission")
                            await _disparar_sync(client, "POS_ORDERS", "ProyectoModa")
                            await _disparar_sync(client, "RES_PARTNER")
                    await asyncio.wait_for(_ronda(), timeout=VENTAS_VIVO_TIMEOUT)
            except asyncio.TimeoutError:
                logger.warning(f"[ventas-vivo] Ronda excedió {VENTAS_VIVO_TIMEOUT}s, "
                               "se descarta")
            except asyncio.CancelledError:
                logger.info("[ventas-vivo] Loop cancelado (shutdown)")
                raise
            except Exception as e:
                logger.warning(f"[ventas-vivo] Error en loop (ignorado): {e}")
        try:
            await asyncio.sleep(VENTAS_VIVO_INTERVAL)
        except asyncio.CancelledError:
            raise


# ── Cobrar automation: crea tareas COBRAR desde créditos Odoo (CRM-D10) ───────
# Mismo patrón que matview/ventas-vivo: loop while True + mutex local + sleep.
# Intervalo: 15 min. Llama a automation.cobrar.run_cobrar_automation() que es
# idempotente (NOT EXISTS sobre source_type/source_ref garantiza no duplicar).

COBRAR_AUTOMATION_INTERVAL = int(os.environ.get("COBRAR_AUTOMATION_INTERVAL", "900"))  # 15 min

_cobrar_automation_lock = asyncio.Lock()


async def _cobrar_automation_loop() -> None:
    """Cada COBRAR_AUTOMATION_INTERVAL segundos llama a run_cobrar_automation.
    Mutex previene solapamiento; el loop nunca rompe ante excepciones."""
    from automation.cobrar import run_cobrar_automation

    logger.info(
        f"[cobrar-automation] Iniciado · interval={COBRAR_AUTOMATION_INTERVAL}s"
    )
    # Pequeño delay inicial: dejar que el resto del startup termine antes de
    # tocar tablas. 30s es suficiente para que ddl/matviews queden listas.
    try:
        await asyncio.sleep(30)
    except asyncio.CancelledError:
        return

    while True:
        if _cobrar_automation_lock.locked():
            logger.debug("[cobrar-automation] Pasada anterior aún corriendo, skip")
        else:
            try:
                async with _cobrar_automation_lock:
                    metrics = await run_cobrar_automation()
                logger.info(
                    f"[cobrar-automation] candidatos={metrics['candidatos']} "
                    f"creadas={metrics['creadas']} "
                    f"sin_mapeo={metrics['sin_mapeo']} "
                    f"sin_user={metrics['sin_user']} "
                    f"errores={metrics['errores']}"
                )
            except asyncio.CancelledError:
                logger.info("[cobrar-automation] Loop cancelado (shutdown)")
                raise
            except Exception as e:
                logger.exception(f"[cobrar-automation] Error en loop (ignorado): {e}")
        try:
            await asyncio.sleep(COBRAR_AUTOMATION_INTERVAL)
        except asyncio.CancelledError:
            raise


# ── Post-venta automation: crea tareas POST_VENTA desde ventas POS (CRM-D14) ──
# Mismo patrón que cobrar: loop while True + mutex local + sleep.
# Intervalo: 15 min. Llama a automation.postventa.run_postventa_automation().
# Idempotente vía NOT EXISTS sobre source_type='ODOO_SALE' + source_ref.
# Filtro: date_order >= CURRENT_DATE → NO hace backfill de ventas viejas.

POSTVENTA_AUTOMATION_INTERVAL = int(os.environ.get("POSTVENTA_AUTOMATION_INTERVAL", "900"))  # 15 min

_postventa_automation_lock = asyncio.Lock()


async def _postventa_automation_loop() -> None:
    """Cada POSTVENTA_AUTOMATION_INTERVAL segundos llama a run_postventa_automation.
    Mutex previene solapamiento; el loop nunca rompe ante excepciones."""
    from automation.postventa import run_postventa_automation

    logger.info(
        f"[postventa-automation] Iniciado · interval={POSTVENTA_AUTOMATION_INTERVAL}s"
    )
    # Mismo delay inicial que Cobrar (30s) para que el resto del startup termine.
    try:
        await asyncio.sleep(30)
    except asyncio.CancelledError:
        return

    while True:
        if _postventa_automation_lock.locked():
            logger.debug("[postventa-automation] Pasada anterior aún corriendo, skip")
        else:
            try:
                async with _postventa_automation_lock:
                    metrics = await run_postventa_automation()
                logger.info(
                    f"[postventa-automation] candidatos={metrics['candidatos']} "
                    f"creadas={metrics['creadas']} "
                    f"sin_mapeo={metrics['sin_mapeo']} "
                    f"sin_vendor={metrics['sin_vendor']} "
                    f"errores={metrics['errores']}"
                )
            except asyncio.CancelledError:
                logger.info("[postventa-automation] Loop cancelado (shutdown)")
                raise
            except Exception as e:
                logger.exception(f"[postventa-automation] Error en loop (ignorado): {e}")
        try:
            await asyncio.sleep(POSTVENTA_AUTOMATION_INTERVAL)
        except asyncio.CancelledError:
            raise


@app.on_event("startup")
async def startup():
    await get_pool()
    await ensure_startup_ddl()
    # Safety check: si la matview lleva >25h sin refresh, refrescar ya
    await _safety_check_matview_freshness()
    # Lanzar loop nocturno (refresh a las 3am Lima)
    app.state.matview_task = asyncio.create_task(_matviews_refresh_loop())
    logger.info("[matview-refresh] Scheduler iniciado")
    # Lanzar loop de ventas en vivo (sync incremental cada 5s)
    app.state.ventas_vivo_task = asyncio.create_task(_ventas_en_vivo_loop())
    # Lanzar loop de automatización Cobrar (cada 15 min, CRM-D10)
    app.state.cobrar_task = asyncio.create_task(_cobrar_automation_loop())
    # Lanzar loop de automatización Post-venta (cada 15 min, CRM-D14)
    app.state.postventa_task = asyncio.create_task(_postventa_automation_loop())


@app.on_event("shutdown")
async def shutdown():
    for task_name in ("matview_task", "ventas_vivo_task", "cobrar_task", "postventa_task"):
        task = getattr(app.state, task_name, None)
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
    await close_pool()


_cors_origins_raw = os.environ.get("CORS_ORIGINS", "*")
_cors_origins = [o.strip() for o in _cors_origins_raw.split(",") if o.strip()]

if _cors_origins == ["*"]:
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r".*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(auth_router)
app.include_router(cuentas_router)
app.include_router(contactos_router)
app.include_router(interacciones_router)
app.include_router(tareas_router)
app.include_router(mi_dia_router)
app.include_router(partners_router)
app.include_router(maintenance_router)
app.include_router(admin_router)
app.include_router(cola_router)
app.include_router(grupos_router)
app.include_router(sync_status_router)
app.include_router(pipeline_router)
app.include_router(equipo_router)
app.include_router(locales_router)
app.include_router(mapa_router)
app.include_router(admin_ai_router)
app.include_router(vinculos_revision_router)
app.include_router(reparto_router)
app.include_router(cobranzas_router)


@app.get("/api/health")
async def health_check():
    try:
        async with safe_acquire() as conn:
            await conn.fetchval("SELECT 1")
        return {"status": "ok", "db": "connected", "module": "crm"}
    except Exception as e:
        return {"status": "degraded", "db": str(e)}

