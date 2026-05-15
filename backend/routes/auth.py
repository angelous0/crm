"""Auth endpoints. Reusa produccion.prod_usuarios + mismo SECRET_KEY que ventas
(el JWT generado aquí sirve para ventas:8003 y viceversa).

El JWT lleva sub=user_id (compat ventas). En login también devolvemos los
atributos CRM (rol, iniciales, nombre_completo) leídos de crm.usuario.
"""
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from auth_utils import (
    verify_password, create_access_token, get_current_user,
    _enrich_with_crm_role,
)
from db import safe_acquire
from helpers import row_to_dict


router = APIRouter(prefix="/api")


class UserLogin(BaseModel):
    username: str
    password: str


@router.post("/auth/login")
async def login(credentials: UserLogin):
    async with safe_acquire() as conn:
        user = await conn.fetchrow(
            "SELECT * FROM produccion.prod_usuarios WHERE username = $1 AND activo = true",
            credentials.username,
        )
        if not user or not verify_password(credentials.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")

        # Token: sub=user_id (compat con ventas). Rol/iniciales se leen
        # cada request desde crm.usuario en get_current_user (no se cachean
        # en el token para que cambios de rol surjan efecto sin re-login).
        token = create_access_token(data={"sub": user["id"]})

        # Marca último login en crm.usuario (best-effort)
        try:
            await conn.execute(
                "UPDATE crm.usuario SET ultimo_login = now() WHERE username = $1",
                credentials.username,
            )
        except Exception:
            pass

        enriched = await _enrich_with_crm_role(conn, dict(user))
        enriched.pop("password_hash", None)
        return {"access_token": token, "token_type": "bearer", "user": enriched}


@router.get("/auth/me")
async def me(current_user: dict = Depends(get_current_user)):
    user_dict = dict(current_user)
    user_dict.pop("password_hash", None)
    return user_dict
