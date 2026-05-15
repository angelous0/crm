"""Shared authentication utilities. Reusa tabla produccion.prod_usuarios.

La autenticación (password) se hace contra produccion.prod_usuarios para
mantener SSO con Ventas (:8003). El rol y metadata CRM-específica vive en
crm.usuario y se inyecta en el payload del JWT en login (auth.py).
"""
import os
from datetime import datetime, timezone, timedelta
from functools import wraps
from typing import List, Optional
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import bcrypt as _bcrypt
from jose import JWTError, jwt
from db import get_pool

SECRET_KEY = os.environ.get('JWT_SECRET_KEY')
if not SECRET_KEY:
    raise RuntimeError("FATAL: Variable JWT_SECRET_KEY no configurada.")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 8760

security = HTTPBearer(auto_error=False)


def verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))


def get_password_hash(password: str) -> str:
    return _bcrypt.hashpw(password.encode('utf-8'), _bcrypt.gensalt()).decode('utf-8')


def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def _enrich_with_crm_role(conn, base_user: dict) -> dict:
    """Lookup rol/iniciales/nombre_completo en crm.usuario.
    Si no existe, devuelve defaults (rol='vendedora').
    """
    row = await conn.fetchrow(
        """SELECT username, rol, iniciales, nombre_completo, whatsapp, email, activo
           FROM crm.usuario WHERE username = $1""",
        base_user.get("username"),
    )
    enriched = dict(base_user)
    if row:
        enriched["rol"] = row["rol"]
        enriched["iniciales"] = row["iniciales"] or _default_iniciales(base_user)
        enriched["nombre_completo"] = row["nombre_completo"] or base_user.get("nombre")
        enriched["whatsapp"] = row["whatsapp"]
        enriched["email_crm"] = row["email"]
    else:
        enriched["rol"] = "vendedora"
        enriched["iniciales"] = _default_iniciales(base_user)
        enriched["nombre_completo"] = base_user.get("nombre")
    return enriched


def _default_iniciales(user: dict) -> str:
    nombre = user.get("nombre") or user.get("username") or "??"
    parts = [p for p in str(nombre).strip().split() if p]
    if len(parts) >= 2:
        return (parts[0][0] + parts[1][0]).upper()
    return parts[0][:2].upper() if parts else "??"


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Resuelve usuario autenticado. Combina produccion.prod_usuarios (auth)
    con crm.usuario (rol/iniciales)."""
    if not credentials:
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Token inválido")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT * FROM produccion.prod_usuarios WHERE id = $1 AND activo = true",
            user_id,
        )
        if not user:
            raise HTTPException(status_code=401, detail="Usuario no encontrado o inactivo")
        return await _enrich_with_crm_role(conn, dict(user))


async def get_current_user_optional(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        return None
    try:
        return await get_current_user(credentials)
    except Exception:
        return None


def require_role(allowed_roles: List[str]):
    """Dependency factory. Uso:
        @router.post("/admin/...", dependencies=[Depends(require_role(['admin']))])
        async def endpoint(...): ...
    O dentro de la firma:
        async def endpoint(user: dict = Depends(require_role(['admin','supervisor']))): ...
    """
    async def _checker(current_user: dict = Depends(get_current_user)) -> dict:
        rol = (current_user or {}).get("rol", "vendedora")
        if rol not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Acceso denegado. Rol requerido: {' o '.join(allowed_roles)}.",
            )
        return current_user
    return _checker


def is_admin_or_supervisor(user: dict) -> bool:
    """Helper sin dependency. Útil dentro de queries para decidir si filtrar
    por cartera (vendedora) o devolver todo (admin/supervisor)."""
    rol = (user or {}).get("rol", "vendedora")
    return rol in ("admin", "supervisor")
