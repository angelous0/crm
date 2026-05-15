"""Pool de conexiones asyncpg con recovery agresivo.

Lecciones aprendidas (bugs reales que tuvimos):
  1. `pool.close()` es GRACIOSO: espera a que cada connection.reset() termine.
     Si una conexión está muerta (red caída, DB lejos), reset() cuelga >60s
     → el close() entra en estado "closing" del que NO sale → todas las
     queries futuras fallan con "pool is closing".

     Fix: usar `pool.terminate()` (force-kill) o envolver close() con
     asyncio.wait_for() para no esperar más de N segundos.

  2. asyncpg detecta connections muertas solo cuando intenta usarlas.
     Si la laptop hace sleep o hay un blip de red, el pool tiene zombies
     hasta el próximo acquire(). Mitigamos con tcp_keepalives agresivos.
"""
from __future__ import annotations
import asyncpg
import asyncio
import os
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

DATABASE_URL = os.environ.get('DATABASE_URL')
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL no configurado en .env")

pool: asyncpg.Pool | None = None
_pool_lock = asyncio.Lock()


async def _force_kill_pool() -> None:
    """Mata el pool actual SIN esperar grace period.

    Llama `terminate()` (cierra sockets de inmediato) en vez de `close()`
    (que espera resets graciosos y se cuelga con conexiones muertas).
    """
    global pool
    if pool is None:
        return
    try:
        pool.terminate()  # NO es coroutine — sync, force-kill instantáneo
    except Exception as e:
        logger.warning(f"terminate() falló (ignorado): {e}")
    pool = None


async def get_pool() -> asyncpg.Pool:
    """Devuelve el pool, creándolo si no existe o está cerrado.

    El _pool_lock evita stampede: si 50 requests piden pool al mismo tiempo
    cuando recién se está creando, solo uno lo crea y los demás esperan.
    """
    global pool
    if pool is not None and not pool._closed:
        return pool

    async with _pool_lock:
        # Re-check después del lock (otro request pudo haberlo creado)
        if pool is not None and not pool._closed:
            return pool

        try:
            pool = await asyncio.wait_for(
                asyncpg.create_pool(
                    DATABASE_URL,
                    min_size=2,
                    max_size=10,
                    # timeout para ADQUIRIR conexión nueva (handshake completo)
                    timeout=10,
                    # timeout para CADA query individual. 120s da margen
                    # extra para queries con subqueries pesados (reservas con
                    # anti-doble-conteo) sobre la DB remota. En producción
                    # (backend en mismo VPS que DB) baja a <1s.
                    command_timeout=120,
                    # Conexiones idle mueren rápido — evita zombies tras sleep
                    max_inactive_connection_lifetime=30,
                    server_settings={
                        "search_path": "public,odoo,crm,produccion",
                        # TCP keepalive a nivel libpq — detecta conexión muerta
                        # antes que la app intente usarla
                        "tcp_keepalives_idle": "10",
                        "tcp_keepalives_interval": "5",
                        "tcp_keepalives_count": "3",
                    },
                ),
                timeout=20,  # hard timeout para crear el pool completo
            )
            logger.info("Pool asyncpg creado (min=2 max=10)")
            return pool
        except (asyncio.TimeoutError, Exception) as e:
            logger.error(f"create_pool falló: {e}")
            pool = None
            raise


@asynccontextmanager
async def safe_acquire(max_retries: int = 2):
    """Acquire defensivo: si la conexión está muerta, recrea el pool y reintenta.

    Reintenta hasta 3 veces (intento inicial + 2 reintentos) con backoff
    exponencial corto (0.5s, 1s).
    """
    global pool
    last_error = None
    for attempt in range(max_retries + 1):
        try:
            p = await get_pool()
            # acquire con timeout: si el pool está caliente pero no hay
            # connections libres, esperar máximo 8s antes de fallar
            async with p.acquire(timeout=8) as conn:
                yield conn
                return
        except (asyncpg.exceptions.ConnectionDoesNotExistError,
                asyncpg.exceptions.InterfaceError,
                asyncpg.exceptions.ConnectionFailureError,
                asyncpg.exceptions.PostgresConnectionError,
                asyncio.TimeoutError,
                OSError) as e:
            last_error = e
            logger.warning(
                f"Conexión BD perdida (intento {attempt+1}/{max_retries+1}): "
                f"{type(e).__name__}: {str(e)[:120]}"
            )
            # FORCE-KILL el pool en vez de close gracioso.
            # close() se cuelga con conexiones muertas → terminate() es seguro.
            await _force_kill_pool()
            if attempt < max_retries:
                await asyncio.sleep(0.5 * (attempt + 1))
    if last_error:
        raise last_error
    raise RuntimeError("safe_acquire agotó reintentos sin error explícito")


async def close_pool():
    """Cierra el pool en shutdown del backend.

    Usa terminate() con un fallback a wait_for(close()) para no colgar
    el shutdown si las conexiones están bloqueadas.
    """
    global pool
    if pool is None:
        return
    try:
        # Intento gracioso 5s; si no termina, force-kill
        await asyncio.wait_for(pool.close(), timeout=5)
        logger.info("Pool cerrado graciosamente")
    except asyncio.TimeoutError:
        logger.warning("Pool.close() timeout 5s — terminate() force-kill")
        try:
            pool.terminate()
        except Exception:
            pass
    except Exception as e:
        logger.warning(f"close_pool error (ignorado): {e}")
    pool = None
