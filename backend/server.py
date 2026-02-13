from fastapi import FastAPI, APIRouter, Depends, HTTPException, Header, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import bcrypt
from datetime import datetime, timezone, timedelta
from jose import jwt, JWTError
from pydantic import BaseModel
from typing import Optional, List
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from db import get_pool, close_pool, init_database, record_to_dict, records_to_list

# Config
JWT_SECRET = os.environ.get('JWT_SECRET', 'crm-default-secret')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRE_HOURS = 48

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ─── JWT HELPERS ───────────────────────────────────────────────────────────────

def create_token(user_id: str, email: str) -> str:
    payload = {
        'sub': user_id,
        'email': email,
        'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(401, 'Token requerido')
    token = authorization.split(' ')[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(401, 'Token invalido o expirado')


# ─── PYDANTIC MODELS ──────────────────────────────────────────────────────────

class RegisterInput(BaseModel):
    email: str
    password: str
    nombre: Optional[str] = None

class LoginInput(BaseModel):
    email: str
    password: str

class AprobarProductoInput(BaseModel):
    product_tmpl_odoo_id: int
    aprobado: bool
    motivo: Optional[str] = None

class CuentaUpdateInput(BaseModel):
    estado_comercial: Optional[str] = None
    clasificacion: Optional[str] = None
    notas: Optional[str] = None
    asignado_a: Optional[str] = None

class InteraccionInput(BaseModel):
    contacto_id: Optional[str] = None
    tipo: str
    resumen: str
    resultado: Optional[str] = None

class TareaInput(BaseModel):
    contacto_id: Optional[str] = None
    tipo: str
    due_at: str
    prioridad: Optional[int] = 3
    descripcion: str

class ContactoUpdateInput(BaseModel):
    rol: Optional[str] = None
    whatsapp: Optional[str] = None

class RevincularInput(BaseModel):
    cuenta_partner_odoo_id: int


# ─── APP SETUP ─────────────────────────────────────────────────────────────────

app = FastAPI(title="CRM B2B")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    try:
        await init_database()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Database init failed: {e}")


@app.on_event("shutdown")
async def shutdown():
    await close_pool()


# ─── AUTH ROUTES ───────────────────────────────────────────────────────────────

auth_router = APIRouter(prefix="/api/auth", tags=["auth"])


@auth_router.post("/register")
async def register(data: RegisterInput):
    p = await get_pool()
    async with p.acquire() as conn:
        existing = await conn.fetchrow("SELECT id FROM crm.usuario WHERE email = $1", data.email)
        if existing:
            raise HTTPException(400, "Email ya registrado")
        pw_hash = bcrypt.hashpw(data.password.encode(), bcrypt.gensalt()).decode()
        row = await conn.fetchrow(
            "INSERT INTO crm.usuario (email, password_hash, nombre) VALUES ($1, $2, $3) RETURNING id, email, nombre, rol",
            data.email, pw_hash, data.nombre
        )
        user = record_to_dict(row)
        token = create_token(user['id'], user['email'])
        return {"token": token, "user": user}


@auth_router.post("/login")
async def login(data: LoginInput):
    p = await get_pool()
    async with p.acquire() as conn:
        row = await conn.fetchrow("SELECT id, email, nombre, rol, password_hash FROM crm.usuario WHERE email = $1", data.email)
        if not row:
            raise HTTPException(401, "Credenciales incorrectas")
        if not bcrypt.checkpw(data.password.encode(), row['password_hash'].encode()):
            raise HTTPException(401, "Credenciales incorrectas")
        user = record_to_dict(row)
        del user['password_hash']
        token = create_token(user['id'], user['email'])
        return {"token": token, "user": user}


@auth_router.get("/me")
async def me(user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        row = await conn.fetchrow("SELECT id, email, nombre, rol FROM crm.usuario WHERE id = $1::uuid", user['sub'])
        if not row:
            raise HTTPException(404, "Usuario no encontrado")
        return record_to_dict(row)


# ─── PRODUCTOS ROUTES ─────────────────────────────────────────────────────────

productos_router = APIRouter(prefix="/api/productos", tags=["productos"])


@productos_router.get("/elegibles")
async def get_productos_elegibles(
    search: str = "", page: int = 1, limit: int = 50,
    user=Depends(get_current_user)
):
    p = await get_pool()
    async with p.acquire() as conn:
        offset = (page - 1) * limit
        try:
            # Check if view exists
            view_exists = await conn.fetchval("""
                SELECT EXISTS(SELECT 1 FROM information_schema.views 
                WHERE table_schema='crm' AND table_name='v_productos_elegibles')
            """)
            if not view_exists:
                return {"items": [], "total": 0, "page": page, "message": "Vista de productos no disponible. Verifique la conexion con Odoo."}

            where = "WHERE 1=1"
            params = []
            if search:
                params.append(f"%{search}%")
                idx = len(params)
                where += f" AND (name ILIKE ${idx} OR COALESCE(marca::text,'') ILIKE ${idx} OR COALESCE(tipo::text,'') ILIKE ${idx} OR COALESCE(tela::text,'') ILIKE ${idx} OR COALESCE(entalle::text,'') ILIKE ${idx})"

            count = await conn.fetchval(f"SELECT COUNT(*) FROM crm.v_productos_elegibles {where}", *params)
            params.extend([limit, offset])
            rows = await conn.fetch(
                f"SELECT *, (SELECT aprobado FROM crm.producto_aprobado WHERE product_tmpl_odoo_id = odoo_id) as aprobado FROM crm.v_productos_elegibles {where} ORDER BY name LIMIT ${len(params)-1} OFFSET ${len(params)}",
                *params
            )
            return {"items": records_to_list(rows), "total": count, "page": page}
        except Exception as e:
            logger.error(f"Error fetching productos elegibles: {e}")
            return {"items": [], "total": 0, "page": page, "error": str(e)}


@productos_router.post("/aprobar")
async def aprobar_producto(data: AprobarProductoInput, user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        await conn.execute("""
            INSERT INTO crm.producto_aprobado (product_tmpl_odoo_id, aprobado, motivo, updated_at)
            VALUES ($1, $2, $3, now())
            ON CONFLICT (product_tmpl_odoo_id) 
            DO UPDATE SET aprobado = $2, motivo = $3, updated_at = now()
        """, data.product_tmpl_odoo_id, data.aprobado, data.motivo)
        return {"ok": True}


@productos_router.get("/aprobados")
async def get_productos_aprobados(user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM crm.producto_aprobado WHERE aprobado = true ORDER BY created_at DESC")
        return records_to_list(rows)


# ─── CUENTAS ROUTES ───────────────────────────────────────────────────────────

cuentas_router = APIRouter(prefix="/api/cuentas", tags=["cuentas"])


@cuentas_router.get("")
async def get_cuentas(
    estado: str = "", clasificacion: str = "", asignado: str = "",
    search: str = "", page: int = 1, limit: int = 50,
    user=Depends(get_current_user)
):
    p = await get_pool()
    async with p.acquire() as conn:
        offset = (page - 1) * limit
        where = "WHERE 1=1"
        params = []

        if estado:
            params.append(estado)
            where += f" AND c.estado_comercial = ${len(params)}"
        if clasificacion:
            params.append(clasificacion)
            where += f" AND c.clasificacion = ${len(params)}"
        if asignado:
            params.append(f"%{asignado}%")
            where += f" AND c.asignado_a ILIKE ${len(params)}"

        # Try to join with odoo.res_partner for name
        try:
            partner_join = ""
            partner_select = "'Sin nombre' as partner_nombre, '' as partner_phone, '' as partner_email, '' as partner_city"
            rp_exists = await conn.fetchval("""
                SELECT EXISTS(SELECT 1 FROM information_schema.tables 
                WHERE table_schema='odoo' AND table_name='res_partner')
            """)
            if rp_exists:
                rp_cols = await conn.fetch("SELECT column_name FROM information_schema.columns WHERE table_schema='odoo' AND table_name='res_partner'")
                rp_col_names = [r['column_name'] for r in rp_cols]
                has_ck = 'company_key' in rp_col_names
                ck_filter = "AND rp.company_key = 'GLOBAL'" if has_ck else ""
                name_col = 'name' if 'name' in rp_col_names else "'Sin nombre'"
                phone_col = 'phone' if 'phone' in rp_col_names else "NULL"
                email_col = 'email' if 'email' in rp_col_names else "NULL"
                city_col = 'city' if 'city' in rp_col_names else "NULL"
                partner_join = f"LEFT JOIN odoo.res_partner rp ON rp.odoo_id = c.cuenta_partner_odoo_id {ck_filter}"
                partner_select = f"COALESCE(rp.{name_col}, 'Sin nombre') as partner_nombre, COALESCE(rp.{phone_col}::text, '') as partner_phone, COALESCE(rp.{email_col}::text, '') as partner_email, COALESCE(rp.{city_col}::text, '') as partner_city"

                if search:
                    params.append(f"%{search}%")
                    where += f" AND (rp.{name_col} ILIKE ${len(params)} OR c.asignado_a ILIKE ${len(params)})"

            count = await conn.fetchval(f"SELECT COUNT(*) FROM crm.cuenta c {partner_join} {where}", *params)
            params.extend([limit, offset])
            rows = await conn.fetch(
                f"""SELECT c.id, c.cuenta_partner_odoo_id, c.estado_comercial, c.clasificacion, 
                    c.notas, c.asignado_a, c.created_at, c.updated_at,
                    {partner_select}
                FROM crm.cuenta c {partner_join} {where}
                ORDER BY c.updated_at DESC NULLS LAST
                LIMIT ${len(params)-1} OFFSET ${len(params)}""",
                *params
            )
            return {"items": records_to_list(rows), "total": count, "page": page}
        except Exception as e:
            logger.error(f"Error fetching cuentas: {e}")
            return {"items": [], "total": 0, "page": page, "error": str(e)}


@cuentas_router.get("/{cuenta_id}")
async def get_cuenta(cuenta_id: str, user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM crm.cuenta WHERE id = $1::uuid", cuenta_id)
        if not row:
            raise HTTPException(404, "Cuenta no encontrada")
        result = record_to_dict(row)

        # Get partner info from odoo
        try:
            rp_exists = await conn.fetchval("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='odoo' AND table_name='res_partner')")
            if rp_exists:
                rp_cols = await conn.fetch("SELECT column_name FROM information_schema.columns WHERE table_schema='odoo' AND table_name='res_partner'")
                rp_col_names = [r['column_name'] for r in rp_cols]
                has_ck = 'company_key' in rp_col_names
                ck_filter = "AND company_key = 'GLOBAL'" if has_ck else ""
                partner = await conn.fetchrow(
                    f"SELECT * FROM odoo.res_partner WHERE odoo_id = $1 {ck_filter} LIMIT 1",
                    row['cuenta_partner_odoo_id']
                )
                if partner:
                    pd = record_to_dict(partner)
                    result['partner'] = pd
        except Exception as e:
            logger.warning(f"Could not fetch partner info: {e}")

        return result


@cuentas_router.put("/{cuenta_id}")
async def update_cuenta(cuenta_id: str, data: CuentaUpdateInput, user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        sets = []
        params = []
        if data.estado_comercial is not None:
            params.append(data.estado_comercial)
            sets.append(f"estado_comercial = ${len(params)}")
        if data.clasificacion is not None:
            params.append(data.clasificacion)
            sets.append(f"clasificacion = ${len(params)}")
        if data.notas is not None:
            params.append(data.notas)
            sets.append(f"notas = ${len(params)}")
        if data.asignado_a is not None:
            params.append(data.asignado_a)
            sets.append(f"asignado_a = ${len(params)}")

        if not sets:
            raise HTTPException(400, "No hay campos para actualizar")

        sets.append("updated_at = now()")
        params.append(cuenta_id)
        query = f"UPDATE crm.cuenta SET {', '.join(sets)} WHERE id = ${len(params)}::uuid RETURNING *"
        row = await conn.fetchrow(query, *params)
        if not row:
            raise HTTPException(404, "Cuenta no encontrada")
        return record_to_dict(row)


@cuentas_router.get("/{cuenta_id}/contactos")
async def get_cuenta_contactos(cuenta_id: str, user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        cuenta = await conn.fetchrow("SELECT cuenta_partner_odoo_id FROM crm.cuenta WHERE id = $1::uuid", cuenta_id)
        if not cuenta:
            raise HTTPException(404, "Cuenta no encontrada")

        rows = await conn.fetch(
            "SELECT * FROM crm.contacto WHERE cuenta_partner_odoo_id = $1 ORDER BY created_at",
            cuenta['cuenta_partner_odoo_id']
        )
        items = records_to_list(rows)

        # Enrich with odoo partner data
        try:
            rp_exists = await conn.fetchval("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='odoo' AND table_name='res_partner')")
            if rp_exists:
                rp_cols = await conn.fetch("SELECT column_name FROM information_schema.columns WHERE table_schema='odoo' AND table_name='res_partner'")
                rp_col_names = [r['column_name'] for r in rp_cols]
                has_ck = 'company_key' in rp_col_names
                for item in items:
                    ck_filter = "AND company_key = 'GLOBAL'" if has_ck else ""
                    partner = await conn.fetchrow(
                        f"SELECT name, phone, mobile, email FROM odoo.res_partner WHERE odoo_id = $1 {ck_filter} LIMIT 1",
                        item['contacto_partner_odoo_id']
                    )
                    if partner:
                        item['partner_nombre'] = partner['name']
                        item['partner_phone'] = partner.get('phone', '')
                        item['partner_mobile'] = partner.get('mobile', '')
                        item['partner_email'] = partner.get('email', '')
        except Exception as e:
            logger.warning(f"Could not enrich contactos: {e}")

        return items


@cuentas_router.get("/{cuenta_id}/ventas")
async def get_cuenta_ventas(cuenta_id: str, page: int = 1, limit: int = 50, user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        cuenta = await conn.fetchrow("SELECT cuenta_partner_odoo_id FROM crm.cuenta WHERE id = $1::uuid", cuenta_id)
        if not cuenta:
            raise HTTPException(404, "Cuenta no encontrada")

        try:
            view_exists = await conn.fetchval("SELECT EXISTS(SELECT 1 FROM information_schema.views WHERE table_schema='crm' AND table_name='v_ventas_pos_filtradas')")
            if not view_exists:
                return {"items": [], "total": 0}

            await conn.execute("SET statement_timeout = '15s'")
            offset = (page - 1) * limit
            rows = await conn.fetch(
                "SELECT * FROM crm.v_ventas_pos_filtradas WHERE cuenta_partner_id = $1 ORDER BY date_order DESC LIMIT $2 OFFSET $3",
                cuenta['cuenta_partner_odoo_id'], limit, offset
            )
            count = len(rows) if len(rows) < limit else offset + limit + 1
            await conn.execute("SET statement_timeout = '0'")
            return {"items": records_to_list(rows), "total": count}
        except Exception as e:
            logger.warning(f"Error fetching ventas for cuenta: {e}")
            return {"items": [], "total": 0, "error": str(e)}


@cuentas_router.get("/{cuenta_id}/interacciones")
async def get_cuenta_interacciones(cuenta_id: str, user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM crm.interaccion WHERE cuenta_id = $1::uuid ORDER BY fecha DESC",
            cuenta_id
        )
        return records_to_list(rows)


@cuentas_router.post("/{cuenta_id}/interacciones")
async def create_interaccion(cuenta_id: str, data: InteraccionInput, user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        cuenta = await conn.fetchrow("SELECT id FROM crm.cuenta WHERE id = $1::uuid", cuenta_id)
        if not cuenta:
            raise HTTPException(404, "Cuenta no encontrada")

        contacto_id = data.contacto_id if data.contacto_id else None
        row = await conn.fetchrow(
            """INSERT INTO crm.interaccion (cuenta_id, contacto_id, tipo, resumen, resultado)
            VALUES ($1::uuid, $2::uuid, $3, $4, $5) RETURNING *""",
            cuenta_id, contacto_id, data.tipo, data.resumen, data.resultado
        )
        return record_to_dict(row)


@cuentas_router.get("/{cuenta_id}/tareas")
async def get_cuenta_tareas(cuenta_id: str, user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM crm.tarea WHERE cuenta_id = $1::uuid ORDER BY due_at",
            cuenta_id
        )
        return records_to_list(rows)


@cuentas_router.post("/{cuenta_id}/tareas")
async def create_tarea(cuenta_id: str, data: TareaInput, user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        cuenta = await conn.fetchrow("SELECT id FROM crm.cuenta WHERE id = $1::uuid", cuenta_id)
        if not cuenta:
            raise HTTPException(404, "Cuenta no encontrada")

        contacto_id = data.contacto_id if data.contacto_id else None
        due_at = datetime.fromisoformat(data.due_at.replace('Z', '+00:00'))
        row = await conn.fetchrow(
            """INSERT INTO crm.tarea (cuenta_id, contacto_id, tipo, due_at, prioridad, descripcion)
            VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6) RETURNING *""",
            cuenta_id, contacto_id, data.tipo, due_at, data.prioridad, data.descripcion
        )
        return record_to_dict(row)


# ─── CONTACTOS ROUTES ─────────────────────────────────────────────────────────

contactos_router = APIRouter(prefix="/api/contactos", tags=["contactos"])


@contactos_router.get("")
async def get_contactos(search: str = "", page: int = 1, limit: int = 50, user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        offset = (page - 1) * limit
        try:
            rp_exists = await conn.fetchval("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='odoo' AND table_name='res_partner')")
            if rp_exists:
                rp_cols = await conn.fetch("SELECT column_name FROM information_schema.columns WHERE table_schema='odoo' AND table_name='res_partner'")
                rp_col_names = [r['column_name'] for r in rp_cols]
                has_ck = 'company_key' in rp_col_names
                ck_filter = "AND rp.company_key = 'GLOBAL'" if has_ck else ""

                where = "WHERE 1=1"
                params = []
                if search:
                    params.append(f"%{search}%")
                    where += f" AND (rp.name ILIKE ${len(params)} OR c.whatsapp ILIKE ${len(params)})"

                count = await conn.fetchval(
                    f"SELECT COUNT(*) FROM crm.contacto c LEFT JOIN odoo.res_partner rp ON rp.odoo_id = c.contacto_partner_odoo_id {ck_filter} {where}",
                    *params
                )
                params.extend([limit, offset])
                rows = await conn.fetch(
                    f"""SELECT c.*, 
                        COALESCE(rp.name, 'Sin nombre') as partner_nombre,
                        COALESCE(rp.phone::text, '') as partner_phone,
                        COALESCE(rp.mobile::text, '') as partner_mobile,
                        COALESCE(rp.email::text, '') as partner_email
                    FROM crm.contacto c 
                    LEFT JOIN odoo.res_partner rp ON rp.odoo_id = c.contacto_partner_odoo_id {ck_filter}
                    {where}
                    ORDER BY rp.name
                    LIMIT ${len(params)-1} OFFSET ${len(params)}""",
                    *params
                )
                return {"items": records_to_list(rows), "total": count, "page": page}
            else:
                count = await conn.fetchval("SELECT COUNT(*) FROM crm.contacto")
                rows = await conn.fetch(
                    "SELECT * FROM crm.contacto ORDER BY created_at DESC LIMIT $1 OFFSET $2",
                    limit, offset
                )
                return {"items": records_to_list(rows), "total": count, "page": page}
        except Exception as e:
            logger.error(f"Error fetching contactos: {e}")
            return {"items": [], "total": 0, "page": page, "error": str(e)}


@contactos_router.put("/{contacto_id}")
async def update_contacto(contacto_id: str, data: ContactoUpdateInput, user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        sets = []
        params = []
        if data.rol is not None:
            params.append(data.rol)
            sets.append(f"rol = ${len(params)}")
        if data.whatsapp is not None:
            params.append(data.whatsapp)
            sets.append(f"whatsapp = ${len(params)}")
        if not sets:
            raise HTTPException(400, "No hay campos para actualizar")
        sets.append("updated_at = now()")
        params.append(contacto_id)
        row = await conn.fetchrow(
            f"UPDATE crm.contacto SET {', '.join(sets)} WHERE id = ${len(params)}::uuid RETURNING *",
            *params
        )
        if not row:
            raise HTTPException(404, "Contacto no encontrado")
        return record_to_dict(row)


@contactos_router.post("/{contacto_id}/revincular")
async def revincular_contacto(contacto_id: str, data: RevincularInput, user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        contacto = await conn.fetchrow("SELECT * FROM crm.contacto WHERE id = $1::uuid", contacto_id)
        if not contacto:
            raise HTTPException(404, "Contacto no encontrado")

        # Upsert override
        await conn.execute("""
            INSERT INTO crm.partner_principal_override (contacto_partner_odoo_id, cuenta_partner_odoo_id)
            VALUES ($1, $2)
            ON CONFLICT (contacto_partner_odoo_id) 
            DO UPDATE SET cuenta_partner_odoo_id = $2, updated_at = now()
        """, contacto['contacto_partner_odoo_id'], data.cuenta_partner_odoo_id)

        # Update contacto
        await conn.execute(
            "UPDATE crm.contacto SET cuenta_partner_odoo_id = $1, updated_at = now() WHERE id = $2::uuid",
            data.cuenta_partner_odoo_id, contacto_id
        )

        # Ensure cuenta exists
        await conn.execute("""
            INSERT INTO crm.cuenta (cuenta_partner_odoo_id)
            VALUES ($1)
            ON CONFLICT (cuenta_partner_odoo_id) DO NOTHING
        """, data.cuenta_partner_odoo_id)

        return {"ok": True}


# ─── TAREAS ROUTES ─────────────────────────────────────────────────────────────

tareas_router = APIRouter(prefix="/api/tareas", tags=["tareas"])


@tareas_router.get("")
async def get_tareas(
    status: str = "", desde: str = "", hasta: str = "",
    page: int = 1, limit: int = 50,
    user=Depends(get_current_user)
):
    p = await get_pool()
    async with p.acquire() as conn:
        offset = (page - 1) * limit
        where = "WHERE 1=1"
        params = []

        if status:
            params.append(status)
            where += f" AND t.status = ${len(params)}"
        if desde:
            params.append(datetime.fromisoformat(desde.replace('Z', '+00:00')))
            where += f" AND t.due_at >= ${len(params)}"
        if hasta:
            params.append(datetime.fromisoformat(hasta.replace('Z', '+00:00')))
            where += f" AND t.due_at <= ${len(params)}"

        # Join with cuenta to get partner name
        try:
            rp_exists = await conn.fetchval("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='odoo' AND table_name='res_partner')")
            partner_join = ""
            partner_select = "'Sin nombre' as cuenta_nombre"
            if rp_exists:
                rp_cols = await conn.fetch("SELECT column_name FROM information_schema.columns WHERE table_schema='odoo' AND table_name='res_partner'")
                rp_col_names = [r['column_name'] for r in rp_cols]
                has_ck = 'company_key' in rp_col_names
                ck_filter = "AND rp.company_key = 'GLOBAL'" if has_ck else ""
                partner_join = f"LEFT JOIN crm.cuenta cu ON cu.id = t.cuenta_id LEFT JOIN odoo.res_partner rp ON rp.odoo_id = cu.cuenta_partner_odoo_id {ck_filter}"
                partner_select = "COALESCE(rp.name, 'Sin nombre') as cuenta_nombre"

            count = await conn.fetchval(f"SELECT COUNT(*) FROM crm.tarea t {partner_join} {where}", *params)
            params.extend([limit, offset])
            rows = await conn.fetch(
                f"""SELECT t.*, {partner_select}
                FROM crm.tarea t {partner_join} {where}
                ORDER BY t.due_at ASC
                LIMIT ${len(params)-1} OFFSET ${len(params)}""",
                *params
            )
            return {"items": records_to_list(rows), "total": count, "page": page}
        except Exception as e:
            logger.error(f"Error fetching tareas: {e}")
            return {"items": [], "total": 0, "page": page, "error": str(e)}


@tareas_router.put("/{tarea_id}/completar")
async def completar_tarea(tarea_id: str, user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE crm.tarea SET status = 'HECHO', done_at = now() WHERE id = $1::uuid RETURNING *",
            tarea_id
        )
        if not row:
            raise HTTPException(404, "Tarea no encontrada")
        return record_to_dict(row)


@tareas_router.put("/{tarea_id}/cancelar")
async def cancelar_tarea(tarea_id: str, user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE crm.tarea SET status = 'CANCELADO' WHERE id = $1::uuid RETURNING *",
            tarea_id
        )
        if not row:
            raise HTTPException(404, "Tarea no encontrada")
        return record_to_dict(row)


# ─── VENTAS ROUTES ─────────────────────────────────────────────────────────────

ventas_router = APIRouter(prefix="/api/ventas", tags=["ventas"])


@ventas_router.get("")
async def get_ventas(
    company_key: str = "", desde: str = "", hasta: str = "",
    excluir_canceladas: bool = True,
    marca: str = "", tipo: str = "", tela: str = "", entalle: str = "",
    page: int = 1, limit: int = 100,
    user=Depends(get_current_user)
):
    p = await get_pool()
    async with p.acquire() as conn:
        try:
            view_exists = await conn.fetchval("SELECT EXISTS(SELECT 1 FROM information_schema.views WHERE table_schema='crm' AND table_name='v_ventas_pos_filtradas')")
            if not view_exists:
                return {"items": [], "total": 0, "page": page, "message": "Vista de ventas no disponible"}

            # Set query timeout for slow external DB
            await conn.execute("SET statement_timeout = '15s'")

            offset = (page - 1) * limit
            where = "WHERE 1=1"
            params = []

            # Get available columns (cached-like, fast query)
            vcols = await conn.fetch("SELECT column_name FROM information_schema.columns WHERE table_schema='crm' AND table_name='v_ventas_pos_filtradas'")
            available_cols = [r['column_name'] for r in vcols]

            if company_key and 'company_key' in available_cols:
                params.append(company_key)
                where += f" AND company_key = ${len(params)}"
            if desde and 'date_order' in available_cols:
                params.append(datetime.fromisoformat(desde.replace('Z', '+00:00')))
                where += f" AND date_order >= ${len(params)}"
            if hasta and 'date_order' in available_cols:
                params.append(datetime.fromisoformat(hasta.replace('Z', '+00:00')))
                where += f" AND date_order <= ${len(params)}"
            if excluir_canceladas and 'is_cancelled' in available_cols:
                where += " AND is_cancelled = false"
            if marca and 'marca' in available_cols:
                params.append(f"%{marca}%")
                where += f" AND marca::text ILIKE ${len(params)}"
            if tipo and 'tipo' in available_cols:
                params.append(f"%{tipo}%")
                where += f" AND tipo::text ILIKE ${len(params)}"
            if tela and 'tela' in available_cols:
                params.append(f"%{tela}%")
                where += f" AND tela::text ILIKE ${len(params)}"
            if entalle and 'entalle' in available_cols:
                params.append(f"%{entalle}%")
                where += f" AND entalle::text ILIKE ${len(params)}"

            order_col = 'date_order' if 'date_order' in available_cols else '1'

            # Fetch data first (with LIMIT), then estimate count
            data_params = params.copy()
            data_params.extend([limit, offset])
            rows = await conn.fetch(
                f"SELECT * FROM crm.v_ventas_pos_filtradas {where} ORDER BY {order_col} DESC LIMIT ${len(data_params)-1} OFFSET ${len(data_params)}",
                *data_params
            )

            # Get count - use a faster approach if no filters
            try:
                count = await conn.fetchval(f"SELECT COUNT(*) FROM crm.v_ventas_pos_filtradas {where}", *params)
            except Exception:
                # If count times out, estimate from rows returned
                count = offset + len(rows) + (limit if len(rows) == limit else 0)

            await conn.execute("SET statement_timeout = '0'")
            return {"items": records_to_list(rows), "total": count, "page": page}
        except Exception as e:
            logger.error(f"Error fetching ventas: {e}")
            return {"items": [], "total": 0, "page": page, "error": str(e)}


# ─── BOOTSTRAP ROUTES ─────────────────────────────────────────────────────────

bootstrap_router = APIRouter(prefix="/api/bootstrap", tags=["bootstrap"])


@bootstrap_router.post("/inicializar")
async def inicializar_crm(user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        try:
            view_exists = await conn.fetchval("SELECT EXISTS(SELECT 1 FROM information_schema.views WHERE table_schema='crm' AND table_name='v_ventas_pos_filtradas')")
            
            contactos_created = 0
            cuentas_created = 0

            if view_exists:
                # Get all unique contacts from filtered sales
                contacts = await conn.fetch("""
                    SELECT DISTINCT contacto_partner_id, cuenta_partner_id 
                    FROM crm.v_ventas_pos_filtradas 
                    WHERE contacto_partner_id IS NOT NULL
                """)
            else:
                # Fallback: use partner_account_final if available
                paf_exists = await conn.fetchval("SELECT EXISTS(SELECT 1 FROM information_schema.views WHERE table_schema='crm' AND table_name='v_partner_account_final')")
                if paf_exists:
                    contacts = await conn.fetch("SELECT contacto_partner_odoo_id as contacto_partner_id, cuenta_partner_odoo_id as cuenta_partner_id FROM crm.v_partner_account_final")
                else:
                    contacts = []

            for c in contacts:
                cp_id = c['contacto_partner_id']
                acc_id = c['cuenta_partner_id'] or cp_id

                # Upsert cuenta
                result = await conn.execute("""
                    INSERT INTO crm.cuenta (cuenta_partner_odoo_id)
                    VALUES ($1)
                    ON CONFLICT (cuenta_partner_odoo_id) DO NOTHING
                """, acc_id)
                if 'INSERT' in result and result.split()[-1] != '0':
                    cuentas_created += 1

                # Upsert contacto
                result = await conn.execute("""
                    INSERT INTO crm.contacto (contacto_partner_odoo_id, cuenta_partner_odoo_id)
                    VALUES ($1, $2)
                    ON CONFLICT (contacto_partner_odoo_id) DO NOTHING
                """, cp_id, acc_id)
                if 'INSERT' in result and result.split()[-1] != '0':
                    contactos_created += 1

            return {
                "ok": True,
                "cuentas_creadas": cuentas_created,
                "contactos_creados": contactos_created,
                "total_procesados": len(contacts)
            }
        except Exception as e:
            logger.error(f"Bootstrap error: {e}")
            raise HTTPException(500, f"Error en inicializacion: {str(e)}")


# ─── STATS ENDPOINT ───────────────────────────────────────────────────────────

@app.get("/api/stats")
async def get_stats(user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        cuentas = await conn.fetchval("SELECT COUNT(*) FROM crm.cuenta")
        contactos = await conn.fetchval("SELECT COUNT(*) FROM crm.contacto")
        tareas_pendientes = await conn.fetchval("SELECT COUNT(*) FROM crm.tarea WHERE status = 'PENDIENTE'")
        interacciones = await conn.fetchval("SELECT COUNT(*) FROM crm.interaccion")
        productos_aprobados = await conn.fetchval("SELECT COUNT(*) FROM crm.producto_aprobado WHERE aprobado = true")

        return {
            "cuentas": cuentas,
            "contactos": contactos,
            "tareas_pendientes": tareas_pendientes,
            "interacciones": interacciones,
            "productos_aprobados": productos_aprobados
        }


# Health check (no auth required)
@app.get("/api/health")
async def health():
    try:
        p = await get_pool()
        async with p.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return {"status": "error", "database": str(e)}


# ─── INCLUDE ROUTERS ──────────────────────────────────────────────────────────

app.include_router(auth_router)
app.include_router(productos_router)
app.include_router(cuentas_router)
app.include_router(contactos_router)
app.include_router(tareas_router)
app.include_router(ventas_router)
app.include_router(bootstrap_router)
