"""Admin AI — configuración de proveedor de IA + tracking de gasto (Sprint CRM-D7).

Permite que el admin configure desde el frontend la API key de Anthropic u OpenAI
sin tener que editar el .env. La key se guarda en crm.app_config y la consumen
los endpoints que necesiten LLM (ej: geocoding fallback en mapa.py).

Endpoints:
- GET  /api/admin/ai-config        → estado actual (provider, has_key, spend)
- POST /api/admin/ai-config        → guardar provider + key
- POST /api/admin/ai-config/test   → validar key con una llamada pequeña
- GET  /api/admin/ai-usage         → historial de llamadas para auditar
"""
import os
from typing import Optional, Literal
from decimal import Decimal
from datetime import datetime, date, timedelta
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth_utils import get_current_user
from db import safe_acquire


router = APIRouter(prefix="/api/admin")


# Precios actualizados Mayo 2025 (USD por millón de tokens)
PRICING = {
    # Anthropic
    "claude-3-5-haiku-20241022":  {"in": 0.80,  "out": 4.00},
    "claude-3-5-sonnet-20241022": {"in": 3.00,  "out": 15.00},
    "claude-3-haiku-20240307":    {"in": 0.25,  "out": 1.25},
    # OpenAI
    "gpt-4o-mini":                {"in": 0.15,  "out": 0.60},
    "gpt-4o":                     {"in": 2.50,  "out": 10.00},
}

DEFAULT_MODEL = {
    "anthropic": "claude-3-5-haiku-20241022",
    "openai":    "gpt-4o-mini",
}


def _solo_admin(user: dict):
    if not isinstance(user, dict):
        raise HTTPException(403, "Solo admin")
    if user.get("rol") not in ("admin", "superadmin"):
        raise HTTPException(403, "Solo admin")


def _mask_key(k: Optional[str]) -> Optional[str]:
    """Muestra solo primeros 6 + últimos 4 caracteres."""
    if not k or len(k) < 12:
        return None
    return f"{k[:6]}…{k[-4:]}"


async def _get_config(conn) -> dict:
    """Lee la configuración guardada en crm.app_config + fallback a env."""
    rows = await conn.fetch("""
        SELECT key, value FROM crm.app_config
        WHERE key IN ('ai_provider', 'ai_api_key', 'ai_model')
    """)
    db_cfg = {r["key"]: r["value"] for r in rows}

    provider = db_cfg.get("ai_provider") or (
        "anthropic" if os.getenv("ANTHROPIC_API_KEY")
        else "openai" if os.getenv("OPENAI_API_KEY")
        else None
    )
    api_key = db_cfg.get("ai_api_key") or (
        os.getenv("ANTHROPIC_API_KEY") if provider == "anthropic"
        else os.getenv("OPENAI_API_KEY") if provider == "openai"
        else None
    )
    model = db_cfg.get("ai_model") or DEFAULT_MODEL.get(provider)
    return {
        "provider": provider,
        "api_key":  api_key,
        "model":    model,
        "from_db":  "ai_api_key" in db_cfg,
    }


async def get_active_ai_config() -> dict:
    """Helper público para que otros routes consuman la config."""
    async with safe_acquire() as conn:
        return await _get_config(conn)


async def log_ai_call(
    provider: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    purpose: str,
    cuenta_id: Optional[int] = None,
    success: bool = True,
    created_by: Optional[str] = None,
):
    """Registra una llamada al LLM con cost estimado para tracking."""
    p = PRICING.get(model, {"in": 0, "out": 0})
    cost = ((input_tokens / 1_000_000) * p["in"]) + ((output_tokens / 1_000_000) * p["out"])
    async with safe_acquire() as conn:
        await conn.execute("""
            INSERT INTO crm.ai_usage (
                provider, model, input_tokens, output_tokens, cost_usd,
                purpose, cuenta_id, success, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        """, provider, model, input_tokens, output_tokens, cost,
            purpose, cuenta_id, success, created_by)
    return cost


@router.get("/ai-config")
async def get_ai_config(user: dict = Depends(get_current_user)):
    _solo_admin(user)
    async with safe_acquire() as conn:
        cfg = await _get_config(conn)

        # Stats de gasto
        stats = await conn.fetchrow("""
            SELECT
                COUNT(*)                  AS total_calls,
                COUNT(*) FILTER (WHERE success = true) AS calls_ok,
                COALESCE(SUM(cost_usd), 0)::numeric(10,6) AS total_cost,
                COALESCE(SUM(cost_usd) FILTER (
                    WHERE created_at >= date_trunc('month', CURRENT_DATE)
                ), 0)::numeric(10,6) AS cost_this_month,
                COALESCE(SUM(cost_usd) FILTER (
                    WHERE created_at >= CURRENT_DATE
                ), 0)::numeric(10,6) AS cost_today,
                COALESCE(SUM(input_tokens), 0)  AS total_in_tokens,
                COALESCE(SUM(output_tokens), 0) AS total_out_tokens,
                MAX(created_at) AS last_call_at
            FROM crm.ai_usage
        """)

    return {
        "provider":    cfg["provider"],
        "model":       cfg["model"],
        "has_key":     bool(cfg["api_key"]),
        "key_masked":  _mask_key(cfg["api_key"]),
        "from_db":     cfg["from_db"],
        "stats": {
            "total_calls":     int(stats["total_calls"]),
            "calls_ok":        int(stats["calls_ok"]),
            "total_cost":      float(stats["total_cost"]),
            "cost_this_month": float(stats["cost_this_month"]),
            "cost_today":      float(stats["cost_today"]),
            "total_in_tokens": int(stats["total_in_tokens"]),
            "total_out_tokens": int(stats["total_out_tokens"]),
            "last_call_at":    stats["last_call_at"].isoformat() if stats["last_call_at"] else None,
        },
        "dashboards": {
            "anthropic": "https://console.anthropic.com/settings/usage",
            "openai":    "https://platform.openai.com/usage",
        },
    }


class AIConfigInput(BaseModel):
    provider: Literal["anthropic", "openai"]
    api_key:  Optional[str] = None  # null o "" = mantener la actual
    model:    Optional[str] = None


@router.post("/ai-config")
async def set_ai_config(data: AIConfigInput, user: dict = Depends(get_current_user)):
    _solo_admin(user)
    user_name = (user.get("username") if isinstance(user, dict) else None) or "system"

    # Validar provider
    if data.provider not in ("anthropic", "openai"):
        raise HTTPException(400, "provider debe ser 'anthropic' u 'openai'")

    async with safe_acquire() as conn:
        await conn.execute("""
            INSERT INTO crm.app_config (key, value, updated_by)
            VALUES ('ai_provider', $1, $2)
            ON CONFLICT (key) DO UPDATE
            SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by
        """, data.provider, user_name)

        # Solo actualizar la key si vino una nueva
        if data.api_key and data.api_key.strip():
            await conn.execute("""
                INSERT INTO crm.app_config (key, value, updated_by)
                VALUES ('ai_api_key', $1, $2)
                ON CONFLICT (key) DO UPDATE
                SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by
            """, data.api_key.strip(), user_name)

        model = data.model or DEFAULT_MODEL.get(data.provider)
        if model:
            await conn.execute("""
                INSERT INTO crm.app_config (key, value, updated_by)
                VALUES ('ai_model', $1, $2)
                ON CONFLICT (key) DO UPDATE
                SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by
            """, model, user_name)

    return {"ok": True, "provider": data.provider, "model": data.model or DEFAULT_MODEL.get(data.provider)}


@router.delete("/ai-config")
async def delete_ai_config(user: dict = Depends(get_current_user)):
    """Borra la configuración de IA guardada en DB (revierte a env si existe)."""
    _solo_admin(user)
    async with safe_acquire() as conn:
        await conn.execute("""
            DELETE FROM crm.app_config
            WHERE key IN ('ai_provider', 'ai_api_key', 'ai_model')
        """)
    return {"ok": True}


@router.post("/ai-config/test")
async def test_ai_config(user: dict = Depends(get_current_user)):
    """Hace una llamada chica al LLM para validar que la key funciona."""
    _solo_admin(user)
    cfg = await get_active_ai_config()
    if not cfg["api_key"]:
        raise HTTPException(400, "No hay API key configurada")

    provider = cfg["provider"]
    model = cfg["model"]
    test_prompt = "Responde solo con la palabra OK"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if provider == "anthropic":
                r = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": cfg["api_key"],
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": model,
                        "max_tokens": 10,
                        "messages": [{"role": "user", "content": test_prompt}],
                    },
                )
                if r.status_code != 200:
                    err = r.json().get("error", {}).get("message", r.text[:200])
                    raise HTTPException(400, f"Anthropic rechazó la key: {err}")
                data = r.json()
                usage = data.get("usage", {})
                in_tok = usage.get("input_tokens", 0)
                out_tok = usage.get("output_tokens", 0)
                respuesta = data["content"][0]["text"] if data.get("content") else ""

            elif provider == "openai":
                r = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {cfg['api_key']}",
                        "Content-Type":  "application/json",
                    },
                    json={
                        "model": model,
                        "max_tokens": 10,
                        "messages": [{"role": "user", "content": test_prompt}],
                    },
                )
                if r.status_code != 200:
                    err = r.json().get("error", {}).get("message", r.text[:200])
                    raise HTTPException(400, f"OpenAI rechazó la key: {err}")
                data = r.json()
                usage = data.get("usage", {})
                in_tok = usage.get("prompt_tokens", 0)
                out_tok = usage.get("completion_tokens", 0)
                respuesta = data["choices"][0]["message"]["content"]
            else:
                raise HTTPException(400, "Provider desconocido")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Error contactando al proveedor: {e}")

    # Log la llamada de prueba
    cost = await log_ai_call(
        provider=provider, model=model,
        input_tokens=in_tok, output_tokens=out_tok,
        purpose="test", created_by=user.get("username", "system"),
    )

    return {
        "ok": True,
        "provider": provider,
        "model": model,
        "respuesta": respuesta.strip(),
        "tokens": {"input": in_tok, "output": out_tok},
        "cost_usd": cost,
    }


@router.get("/ai-usage")
async def get_ai_usage(
    days: int = 30,
    limit: int = 100,
    user: dict = Depends(get_current_user),
):
    """Historial reciente de llamadas al LLM."""
    _solo_admin(user)
    if limit > 500:
        limit = 500
    desde = date.today() - timedelta(days=max(days, 1))

    async with safe_acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, provider, model, input_tokens, output_tokens,
                   cost_usd, purpose, cuenta_id, success, created_at, created_by
            FROM crm.ai_usage
            WHERE created_at >= $1
            ORDER BY created_at DESC
            LIMIT $2
        """, desde, limit)

        # Agregado por día
        daily = await conn.fetch("""
            SELECT
                DATE(created_at) AS dia,
                COUNT(*)         AS calls,
                COALESCE(SUM(cost_usd), 0)::numeric(10,6) AS cost,
                COALESCE(SUM(input_tokens), 0)  AS in_tokens,
                COALESCE(SUM(output_tokens), 0) AS out_tokens
            FROM crm.ai_usage
            WHERE created_at >= $1
            GROUP BY DATE(created_at)
            ORDER BY dia DESC
        """, desde)

    return {
        "calls": [{
            "id":            int(r["id"]),
            "provider":      r["provider"],
            "model":         r["model"],
            "input_tokens":  int(r["input_tokens"] or 0),
            "output_tokens": int(r["output_tokens"] or 0),
            "cost_usd":      float(r["cost_usd"] or 0),
            "purpose":       r["purpose"],
            "cuenta_id":     r["cuenta_id"],
            "success":       r["success"],
            "created_at":    r["created_at"].isoformat() if r["created_at"] else None,
            "created_by":    r["created_by"],
        } for r in rows],
        "daily": [{
            "dia":        r["dia"].isoformat(),
            "calls":      int(r["calls"]),
            "cost_usd":   float(r["cost"]),
            "in_tokens":  int(r["in_tokens"]),
            "out_tokens": int(r["out_tokens"]),
        } for r in daily],
    }
