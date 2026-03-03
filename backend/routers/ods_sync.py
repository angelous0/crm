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
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.get(f"{ODS_BASE}{path}", params=params)
            if r.status_code == 404:
                raise HTTPException(503, "El servidor ODS no tiene este endpoint activo. Verifica que el backend ODS este corriendo.")
            r.raise_for_status()
            return r.json()
    except httpx.ConnectError:
        raise HTTPException(503, "No se pudo conectar al servidor ODS. Verifica que este activo.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Error de conexion con ODS: {str(e)[:200]}")


async def _ods_post(path: str, json_body: dict):
    if not ODS_BASE:
        raise HTTPException(503, "ODS_BASE_URL no configurado")
    try:
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(f"{ODS_BASE}{path}", json=json_body)
            if r.status_code == 404:
                raise HTTPException(503, "El servidor ODS no tiene este endpoint activo. Verifica que el backend ODS este corriendo.")
            r.raise_for_status()
            return r.json()
    except httpx.ConnectError:
        raise HTTPException(503, "No se pudo conectar al servidor ODS. Verifica que este activo.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Error de conexion con ODS: {str(e)[:200]}")


def _normalize_status(raw: dict) -> dict:
    """Normalize the ODS job-status response to a flat format for the frontend."""
    job = raw.get("job", {})
    last_run = raw.get("last_run", {})
    run_status = last_run.get("status", "")
    status_map = {"OK": "SUCCESS", "RUNNING": "RUNNING", "ERROR": "ERROR"}
    return {
        "status": status_map.get(run_status, "IDLE"),
        "last_success_at": job.get("last_success_at"),
        "last_error": job.get("last_error") or last_run.get("error_message"),
        "last_run_at": job.get("last_run_at"),
        "rows_upserted": last_run.get("rows_upserted", 0),
        "rows_updated": last_run.get("rows_updated", 0),
        "job_code": job.get("job_code"),
    }


@router.post("/run")
async def run_job(data: RunJobInput, user=Depends(_get_auth())):
    """Trigger a single sync job on the ODS."""
    return await _ods_post("/api/odoo-sync/run", {"job_code": data.job_code})


@router.post("/run-batch")
async def run_batch(data: RunBatchInput, user=Depends(_get_auth())):
    """Trigger multiple sync jobs on the ODS."""
    return await _ods_post("/api/odoo-sync/run-batch", {"job_codes": data.job_codes})


@router.get("/job-status")
async def get_job_status(job_code: str, user=Depends(_get_auth())):
    """Get the status of a sync job from the ODS, normalized for frontend."""
    raw = await _ods_get("/api/odoo-sync/job-status", {"job_code": job_code})
    return _normalize_status(raw)
