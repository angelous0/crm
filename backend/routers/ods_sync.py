"""ODS Sync Proxy – forwards sync requests to the ODS (Odoo) backend."""
import os, logging, httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ods-sync", tags=["ods-sync"])

ODS_BASE = os.environ.get("ODS_BASE_URL", "").rstrip("/")


def _get_auth():
    from server import get_current_user
    return get_current_user


class RunJobInput(BaseModel):
    job_code: str


class RunBatchInput(BaseModel):
    job_codes: list[str]


async def _ods_get(path: str, params: dict = None):
    if not ODS_BASE:
        raise HTTPException(503, "ODS_BASE_URL no configurado")
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{ODS_BASE}{path}", params=params)
        r.raise_for_status()
        return r.json()


async def _ods_post(path: str, json_body: dict):
    if not ODS_BASE:
        raise HTTPException(503, "ODS_BASE_URL no configurado")
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(f"{ODS_BASE}{path}", json=json_body)
        r.raise_for_status()
        return r.json()


@router.post("/run")
async def run_job(data: RunJobInput, user=Depends(_get_auth())):
    """Trigger a single sync job on the ODS."""
    try:
        result = await _ods_post("/api/odoo-sync/run", {"job_code": data.job_code})
        return result
    except httpx.HTTPStatusError as e:
        logger.error(f"ODS run error: {e.response.status_code} {e.response.text}")
        raise HTTPException(e.response.status_code, f"ODS error: {e.response.text[:200]}")
    except Exception as e:
        logger.error(f"ODS run error: {e}")
        raise HTTPException(502, f"No se pudo conectar al ODS: {str(e)[:200]}")


@router.post("/run-batch")
async def run_batch(data: RunBatchInput, user=Depends(_get_auth())):
    """Trigger multiple sync jobs on the ODS."""
    try:
        result = await _ods_post("/api/odoo-sync/run-batch", {"job_codes": data.job_codes})
        return result
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, f"ODS error: {e.response.text[:200]}")
    except Exception as e:
        raise HTTPException(502, f"No se pudo conectar al ODS: {str(e)[:200]}")


@router.get("/job-status")
async def get_job_status(job_code: str, user=Depends(_get_auth())):
    """Get the status of a sync job from the ODS."""
    try:
        result = await _ods_get("/api/odoo-sync/job-status", {"job_code": job_code})
        return result
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, f"ODS error: {e.response.text[:200]}")
    except Exception as e:
        raise HTTPException(502, f"No se pudo conectar al ODS: {str(e)[:200]}")
