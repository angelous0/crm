from fastapi import FastAPI, APIRouter, Depends, HTTPException, Header, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import time
from collections import OrderedDict
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

class VincularContactoInput(BaseModel):
    contacto_partner_odoo_id: int
    nota: Optional[str] = None


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


# ─── CATALOGO ROUTES (STOCK-BASED) ─────────────────────────────────────────────

catalogo_router = APIRouter(prefix="/api/catalogo", tags=["catalogo"])


@catalogo_router.get("")
async def get_catalogo(
    search: str = "", page: int = 1, limit: int = 50,
    marca: str = "", tipo: str = "", tela: str = "", entalle: str = "",
    stock_min: float = 0,
    orden: str = "stock",
    user=Depends(get_current_user)
):
    """Catalog: eligible products with stock from crm.v_catalogo_con_stock"""
    p = await get_pool()
    async with p.acquire() as conn:
        offset = (page - 1) * limit
        try:
            view_exists = await conn.fetchval(
                "SELECT EXISTS(SELECT 1 FROM information_schema.views WHERE table_schema='crm' AND table_name='v_catalogo_con_stock')"
            )
            if not view_exists:
                return {"items": [], "total": 0, "page": page, "message": "Vista de catalogo no disponible"}

            where = "WHERE 1=1"
            params = []

            if search:
                params.append(f"%{search}%")
                idx = len(params)
                where += f" AND (nombre ILIKE ${idx} OR COALESCE(marca::text,'') ILIKE ${idx} OR COALESCE(tipo::text,'') ILIKE ${idx} OR COALESCE(tela::text,'') ILIKE ${idx} OR COALESCE(entalle::text,'') ILIKE ${idx})"
            if marca:
                params.append(f"%{marca}%")
                where += f" AND marca::text ILIKE ${len(params)}"
            if tipo:
                params.append(f"%{tipo}%")
                where += f" AND tipo::text ILIKE ${len(params)}"
            if tela:
                params.append(f"%{tela}%")
                where += f" AND tela::text ILIKE ${len(params)}"
            if entalle:
                params.append(f"%{entalle}%")
                where += f" AND entalle::text ILIKE ${len(params)}"
            if stock_min > 0:
                params.append(stock_min)
                where += f" AND stock_total_disponible >= ${len(params)}"

            order_by = "stock_total_disponible DESC" if orden == "stock" else "nombre ASC"

            count = await conn.fetchval(
                f"SELECT COUNT(*) FROM crm.v_catalogo_con_stock {where}", *params
            )

            data_params = params.copy()
            data_params.extend([limit, offset])
            rows = await conn.fetch(
                f"SELECT * FROM crm.v_catalogo_con_stock {where} ORDER BY {order_by} LIMIT ${len(data_params)-1} OFFSET ${len(data_params)}",
                *data_params
            )
            return {"items": records_to_list(rows), "total": count, "page": page}
        except Exception as e:
            logger.error(f"Error fetching catalogo: {e}")
            return {"items": [], "total": 0, "page": page, "error": str(e)}


@catalogo_router.get("/marcas")
async def get_marcas(user=Depends(get_current_user)):
    """Get distinct marcas from catalog for filter dropdowns"""
    p = await get_pool()
    async with p.acquire() as conn:
        try:
            rows = await conn.fetch(
                "SELECT DISTINCT marca::text as marca FROM crm.v_catalogo_con_stock WHERE marca IS NOT NULL ORDER BY marca"
            )
            return [r['marca'] for r in rows]
        except Exception:
            return []


@catalogo_router.get("/tipos")
async def get_tipos(user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        try:
            rows = await conn.fetch(
                "SELECT DISTINCT tipo::text as tipo FROM crm.v_catalogo_con_stock WHERE tipo IS NOT NULL ORDER BY tipo"
            )
            return [r['tipo'] for r in rows]
        except Exception:
            return []


@catalogo_router.get("/telas")
async def get_telas(user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        try:
            rows = await conn.fetch(
                "SELECT DISTINCT tela::text as tela FROM crm.v_catalogo_con_stock WHERE tela IS NOT NULL ORDER BY tela"
            )
            return [r['tela'] for r in rows]
        except Exception:
            return []


@catalogo_router.get("/entalles")
async def get_entalles(user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        try:
            rows = await conn.fetch(
                "SELECT DISTINCT entalle::text as entalle FROM crm.v_catalogo_con_stock WHERE entalle IS NOT NULL ORDER BY entalle"
            )
            return [r['entalle'] for r in rows]
        except Exception:
            return []


@catalogo_router.get("/{tmpl_id}/matriz")
async def get_matriz(tmpl_id: int, location_id: str = "ALL", user=Depends(get_current_user)):
    """Get color x talla matrix with stock, optionally filtered by location"""
    p = await get_pool()
    async with p.acquire() as conn:
        try:
            # Determine which view to use
            loc_view_exists = await conn.fetchval(
                "SELECT EXISTS(SELECT 1 FROM information_schema.views WHERE table_schema='crm' AND table_name='v_catalogo_con_stock_variantes_loc')"
            )

            # Get locations for the dropdown (only tiendas with x_nombre)
            locations = []
            try:
                loc_rows = await conn.fetch("""
                    SELECT odoo_id as id, x_nombre as nombre
                    FROM odoo.stock_location
                    WHERE usage = 'internal'
                      AND COALESCE(active, true) = true
                      AND x_nombre IS NOT NULL
                      AND btrim(x_nombre) <> ''
                    ORDER BY x_nombre
                """)
                locations = [{"id": r['id'], "nombre": r['nombre']} for r in loc_rows]
            except Exception:
                pass

            # Build matrix query
            if loc_view_exists and location_id != "ALL":
                loc_id = int(location_id)
                rows = await conn.fetch("""
                    SELECT COALESCE(color, 'Sin color') as color, COALESCE(talla, 'Sin talla') as talla,
                           SUM(available_qty) as qty
                    FROM crm.v_catalogo_con_stock_variantes_loc
                    WHERE product_tmpl_id = $1 AND location_id = $2
                    GROUP BY color, talla
                """, tmpl_id, loc_id)
            elif loc_view_exists:
                rows = await conn.fetch("""
                    SELECT COALESCE(color, 'Sin color') as color, COALESCE(talla, 'Sin talla') as talla,
                           SUM(available_qty) as qty
                    FROM crm.v_catalogo_con_stock_variantes_loc
                    WHERE product_tmpl_id = $1
                    GROUP BY color, talla
                """, tmpl_id)
            else:
                rows = await conn.fetch("""
                    SELECT COALESCE(color, 'Sin color') as color, COALESCE(talla, 'Sin talla') as talla,
                           SUM(available_qty) as qty
                    FROM crm.v_catalogo_con_stock_variantes
                    WHERE product_tmpl_id = $1
                    GROUP BY color, talla
                """, tmpl_id)

            # Build matrix structure
            colors_set = set()
            sizes_set = set()
            matrix = {}
            for r in rows:
                c = r['color']
                t = r['talla']
                q = float(r['qty'])
                colors_set.add(c)
                sizes_set.add(t)
                if c not in matrix:
                    matrix[c] = {}
                matrix[c][t] = q

            # Smart talla ordering
            def talla_sort_key(t):
                order_map = {'XXS': 1, 'XS': 2, 'S': 3, 'M': 4, 'L': 5, 'XL': 6, 'XXL': 7, 'XXXL': 8}
                if t in order_map:
                    return (1, order_map[t])
                try:
                    return (0, int(t))
                except (ValueError, TypeError):
                    return (2, t)

            tallas = sorted(sizes_set, key=talla_sort_key)
            colores = sorted(colors_set)

            # Compute totals
            by_color = {}
            by_size = {}
            grand_total = 0
            for c in colores:
                by_color[c] = sum(matrix.get(c, {}).get(t, 0) for t in tallas)
                grand_total += by_color[c]
            for t in tallas:
                by_size[t] = sum(matrix.get(c, {}).get(t, 0) for c in colores)

            return {
                "tallas": tallas,
                "colores": colores,
                "matrix": matrix,
                "totals": {
                    "byColor": by_color,
                    "bySize": by_size,
                    "grandTotal": grand_total
                },
                "locations": locations
            }
        except Exception as e:
            logger.error(f"Error fetching matriz: {e}")
            return {"tallas": [], "colores": [], "matrix": {}, "totals": {"byColor": {}, "bySize": {}, "grandTotal": 0}, "locations": []}


@catalogo_router.get("/{tmpl_id}/variantes")
async def get_variantes(tmpl_id: int, user=Depends(get_current_user)):
    """Get variant-level stock detail for a product template"""
    p = await get_pool()
    async with p.acquire() as conn:
        try:
            view_exists = await conn.fetchval(
                "SELECT EXISTS(SELECT 1 FROM information_schema.views WHERE table_schema='crm' AND table_name='v_catalogo_con_stock_variantes')"
            )
            if not view_exists:
                return []

            rows = await conn.fetch(
                "SELECT * FROM crm.v_catalogo_con_stock_variantes WHERE product_tmpl_id = $1 ORDER BY talla, color",
                tmpl_id
            )
            return records_to_list(rows)
        except Exception as e:
            logger.error(f"Error fetching variantes: {e}")
            return []


# ─── PRODUCTOS ROUTES (LEGACY - kept for ventas) ──────────────────────────────

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
    """List only 'free' accounts from crm.v_cuentas_libres (principal = self)"""
    p = await get_pool()
    async with p.acquire() as conn:
        offset = (page - 1) * limit

        try:
            where = "WHERE 1=1"
            params = []

            # CRM data filters (LEFT JOIN crm.cuenta)
            if estado:
                params.append(estado)
                where += f" AND cu.estado_comercial = ${len(params)}"
            if clasificacion:
                params.append(clasificacion)
                where += f" AND cu.clasificacion = ${len(params)}"
            if asignado:
                params.append(f"%{asignado}%")
                where += f" AND cu.asignado_a ILIKE ${len(params)}"
            if search:
                params.append(f"%{search}%")
                idx = len(params)
                where += f" AND (rp.name ILIKE ${idx} OR COALESCE(rp.vat,'') ILIKE ${idx} OR COALESCE(cu.asignado_a,'') ILIKE ${idx})"

            count = await conn.fetchval(
                f"""SELECT COUNT(*)
                FROM crm.v_cuentas_libres cl
                JOIN odoo.res_partner rp ON rp.odoo_id = cl.cuenta_partner_odoo_id AND rp.company_key='GLOBAL'
                LEFT JOIN crm.cuenta cu ON cu.cuenta_partner_odoo_id = cl.cuenta_partner_odoo_id
                {where}""",
                *params
            )

            data_params = params.copy()
            data_params.extend([limit, offset])
            rows = await conn.fetch(
                f"""SELECT
                    cl.cuenta_partner_odoo_id,
                    rp.name as partner_nombre,
                    COALESCE(rp.vat, '') as partner_vat,
                    COALESCE(rp.phone::text, '') as partner_phone,
                    COALESCE(rp.mobile::text, '') as partner_mobile,
                    COALESCE(rp.city::text, '') as partner_city,
                    cu.id as cuenta_id,
                    COALESCE(cu.estado_comercial, 'ACTIVO') as estado_comercial,
                    cu.clasificacion,
                    cu.asignado_a,
                    cu.notas
                FROM crm.v_cuentas_libres cl
                JOIN odoo.res_partner rp ON rp.odoo_id = cl.cuenta_partner_odoo_id AND rp.company_key='GLOBAL'
                LEFT JOIN crm.cuenta cu ON cu.cuenta_partner_odoo_id = cl.cuenta_partner_odoo_id
                {where}
                ORDER BY rp.name
                LIMIT ${len(data_params)-1} OFFSET ${len(data_params)}""",
                *data_params
            )
            return {"items": records_to_list(rows), "total": count, "page": page}
        except Exception as e:
            logger.error(f"Error fetching cuentas: {e}")
            return {"items": [], "total": 0, "page": page, "error": str(e)}


@cuentas_router.get("/{cuenta_id}")
async def get_cuenta(cuenta_id: str, user=Depends(get_current_user)):
    """Get cuenta by cuenta_partner_odoo_id (int). On-demand upsert crm.cuenta if not exists."""
    p = await get_pool()
    async with p.acquire() as conn:
        try:
            odoo_id = int(cuenta_id)
        except ValueError:
            raise HTTPException(400, "cuenta_id debe ser un entero (odoo_id del partner)")

        # On-demand upsert: create crm.cuenta row if missing
        await conn.execute("""
            INSERT INTO crm.cuenta (cuenta_partner_odoo_id)
            VALUES ($1)
            ON CONFLICT (cuenta_partner_odoo_id) DO NOTHING
        """, odoo_id)

        row = await conn.fetchrow(
            "SELECT * FROM crm.cuenta WHERE cuenta_partner_odoo_id = $1", odoo_id
        )
        if not row:
            raise HTTPException(404, "Cuenta no encontrada")
        result = record_to_dict(row)

        # Get partner info from odoo
        try:
            partner = await conn.fetchrow(
                "SELECT * FROM odoo.res_partner WHERE odoo_id = $1 AND company_key = 'GLOBAL' LIMIT 1",
                odoo_id
            )
            if partner:
                result['partner'] = record_to_dict(partner)
        except Exception as e:
            logger.warning(f"Could not fetch partner info: {e}")

        return result


@cuentas_router.put("/{cuenta_id}")
async def update_cuenta(cuenta_id: str, data: CuentaUpdateInput, user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        odoo_id = int(cuenta_id)
        # Ensure row exists
        await conn.execute("""
            INSERT INTO crm.cuenta (cuenta_partner_odoo_id)
            VALUES ($1)
            ON CONFLICT (cuenta_partner_odoo_id) DO NOTHING
        """, odoo_id)

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
        params.append(odoo_id)
        query = f"UPDATE crm.cuenta SET {', '.join(sets)} WHERE cuenta_partner_odoo_id = ${len(params)} RETURNING *"
        row = await conn.fetchrow(query, *params)
        if not row:
            raise HTTPException(404, "Cuenta no encontrada")
        return record_to_dict(row)


@cuentas_router.get("/{cuenta_id}/contactos")
async def get_cuenta_contactos(cuenta_id: str, user=Depends(get_current_user)):
    """Get all partners whose v_partner_account_final.cuenta = this cuenta"""
    p = await get_pool()
    async with p.acquire() as conn:
        odoo_id = int(cuenta_id)

        rows = await conn.fetch("""
            SELECT
                rp.odoo_id as contacto_partner_odoo_id,
                rp.name as partner_nombre,
                COALESCE(rp.phone::text, '') as partner_phone,
                COALESCE(rp.mobile::text, '') as partner_mobile,
                COALESCE(c.whatsapp, '') as whatsapp,
                COALESCE(c.rol, '') as rol
            FROM crm.v_partner_account_final m
            JOIN odoo.res_partner rp ON rp.odoo_id = m.contacto_partner_odoo_id AND rp.company_key='GLOBAL'
            LEFT JOIN crm.contacto c ON c.contacto_partner_odoo_id = m.contacto_partner_odoo_id
            WHERE m.cuenta_partner_odoo_id = $1
              AND m.contacto_partner_odoo_id <> $1
            ORDER BY rp.name
        """, odoo_id)

        return records_to_list(rows)


@cuentas_router.get("/{cuenta_id}/ventas")
async def get_cuenta_ventas(cuenta_id: str, page: int = 1, limit: int = 50, user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        odoo_id = int(cuenta_id)

        try:
            view_exists = await conn.fetchval("SELECT EXISTS(SELECT 1 FROM information_schema.views WHERE table_schema='crm' AND table_name='v_ventas_pos_filtradas')")
            if not view_exists:
                return {"items": [], "total": 0}

            await conn.execute("SET statement_timeout = '15s'")
            offset = (page - 1) * limit
            rows = await conn.fetch(
                "SELECT * FROM crm.v_ventas_pos_filtradas WHERE cuenta_partner_id = $1 ORDER BY date_order DESC LIMIT $2 OFFSET $3",
                odoo_id, limit, offset
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
        odoo_id = int(cuenta_id)
        # Get crm.cuenta.id by odoo_id
        cuenta = await conn.fetchrow("SELECT id FROM crm.cuenta WHERE cuenta_partner_odoo_id = $1", odoo_id)
        if not cuenta:
            return []
        rows = await conn.fetch(
            "SELECT * FROM crm.interaccion WHERE cuenta_id = $1 ORDER BY fecha DESC",
            cuenta['id']
        )
        return records_to_list(rows)


@cuentas_router.post("/{cuenta_id}/interacciones")
async def create_interaccion(cuenta_id: str, data: InteraccionInput, user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        odoo_id = int(cuenta_id)
        # Ensure cuenta exists
        await conn.execute("INSERT INTO crm.cuenta (cuenta_partner_odoo_id) VALUES ($1) ON CONFLICT DO NOTHING", odoo_id)
        cuenta = await conn.fetchrow("SELECT id FROM crm.cuenta WHERE cuenta_partner_odoo_id = $1", odoo_id)
        if not cuenta:
            raise HTTPException(404, "Cuenta no encontrada")

        contacto_id = data.contacto_id if data.contacto_id else None
        row = await conn.fetchrow(
            """INSERT INTO crm.interaccion (cuenta_id, contacto_id, tipo, resumen, resultado)
            VALUES ($1, $2::uuid, $3, $4, $5) RETURNING *""",
            cuenta['id'], contacto_id, data.tipo, data.resumen, data.resultado
        )
        return record_to_dict(row)


@cuentas_router.get("/{cuenta_id}/tareas")
async def get_cuenta_tareas(cuenta_id: str, user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        odoo_id = int(cuenta_id)
        cuenta = await conn.fetchrow("SELECT id FROM crm.cuenta WHERE cuenta_partner_odoo_id = $1", odoo_id)
        if not cuenta:
            return []
        rows = await conn.fetch(
            "SELECT * FROM crm.tarea WHERE cuenta_id = $1 ORDER BY due_at",
            cuenta['id']
        )
        return records_to_list(rows)


@cuentas_router.post("/{cuenta_id}/tareas")
async def create_tarea(cuenta_id: str, data: TareaInput, user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        odoo_id = int(cuenta_id)
        await conn.execute("INSERT INTO crm.cuenta (cuenta_partner_odoo_id) VALUES ($1) ON CONFLICT DO NOTHING", odoo_id)
        cuenta = await conn.fetchrow("SELECT id FROM crm.cuenta WHERE cuenta_partner_odoo_id = $1", odoo_id)
        if not cuenta:
            raise HTTPException(404, "Cuenta no encontrada")

        contacto_id = data.contacto_id if data.contacto_id else None
        due_at = datetime.fromisoformat(data.due_at.replace('Z', '+00:00'))
        row = await conn.fetchrow(
            """INSERT INTO crm.tarea (cuenta_id, contacto_id, tipo, due_at, prioridad, descripcion)
            VALUES ($1, $2::uuid, $3, $4, $5, $6) RETURNING *""",
            cuenta['id'], contacto_id, data.tipo, due_at, data.prioridad, data.descripcion
        )
        return record_to_dict(row)


# ─── CONTACTOS ROUTES ─────────────────────────────────────────────────────────

contactos_router = APIRouter(prefix="/api/contactos", tags=["contactos"])


@contactos_router.get("")
async def get_contactos(
    search: str = "", page: int = 1, limit: int = 50,
    solo_dni: bool = False, solo_telefono: bool = False,
    user=Depends(get_current_user)
):
    """List ALL odoo.res_partner (GLOBAL, active) with 'cuenta asignada' from v_partner_account_final"""
    p = await get_pool()
    async with p.acquire() as conn:
        offset = (page - 1) * limit
        try:
            where = "WHERE rp.company_key = 'GLOBAL' AND COALESCE(rp.active, true) = true"
            params = []

            if search:
                search_parts = [f"rp.name ILIKE ${len(params)+1}"]
                params.append(f"%{search}%")
                idx = len(params)
                search_parts.append(f"COALESCE(rp.vat,'') ILIKE ${idx}")
                search_parts.append(f"COALESCE(rp.phone::text,'') ILIKE ${idx}")
                search_parts.append(f"COALESCE(rp.mobile::text,'') ILIKE ${idx}")
                where += f" AND ({' OR '.join(search_parts)})"

            if solo_dni:
                where += " AND rp.vat IS NOT NULL AND rp.vat <> ''"
            if solo_telefono:
                where += " AND (rp.phone IS NOT NULL AND rp.phone::text <> '' OR rp.mobile IS NOT NULL AND rp.mobile::text <> '')"

            count = await conn.fetchval(
                f"SELECT COUNT(*) FROM odoo.res_partner rp {where}", *params
            )

            data_params = params.copy()
            data_params.extend([limit, offset])
            rows = await conn.fetch(
                f"""SELECT
                    rp.odoo_id,
                    rp.name,
                    COALESCE(rp.vat, '') as vat,
                    COALESCE(rp.phone::text, '') as phone,
                    COALESCE(rp.mobile::text, '') as mobile,
                    COALESCE(rp.city::text, '') as city,
                    m.cuenta_partner_odoo_id,
                    CASE WHEN m.cuenta_partner_odoo_id = rp.odoo_id THEN NULL
                         ELSE rp_cuenta.name END as cuenta_nombre
                FROM odoo.res_partner rp
                LEFT JOIN crm.v_partner_account_final m ON m.contacto_partner_odoo_id = rp.odoo_id
                LEFT JOIN odoo.res_partner rp_cuenta
                    ON rp_cuenta.odoo_id = m.cuenta_partner_odoo_id
                    AND rp_cuenta.company_key = 'GLOBAL'
                {where}
                ORDER BY rp.name
                LIMIT ${len(data_params)-1} OFFSET ${len(data_params)}""",
                *data_params
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
            await conn.execute("SET statement_timeout = '60s'")
            
            view_exists = await conn.fetchval("SELECT EXISTS(SELECT 1 FROM information_schema.views WHERE table_schema='crm' AND table_name='v_ventas_pos_filtradas')")

            if view_exists:
                # Batch upsert cuentas from distinct cuenta_partner_id
                cuentas_result = await conn.execute("""
                    INSERT INTO crm.cuenta (cuenta_partner_odoo_id)
                    SELECT DISTINCT COALESCE(cuenta_partner_id, contacto_partner_id)
                    FROM crm.v_ventas_pos_filtradas 
                    WHERE contacto_partner_id IS NOT NULL
                    ON CONFLICT (cuenta_partner_odoo_id) DO NOTHING
                """)
                cuentas_created = int(cuentas_result.split()[-1]) if cuentas_result else 0

                # Batch upsert contactos
                contactos_result = await conn.execute("""
                    INSERT INTO crm.contacto (contacto_partner_odoo_id, cuenta_partner_odoo_id)
                    SELECT DISTINCT contacto_partner_id, COALESCE(cuenta_partner_id, contacto_partner_id)
                    FROM crm.v_ventas_pos_filtradas 
                    WHERE contacto_partner_id IS NOT NULL
                    ON CONFLICT (contacto_partner_odoo_id) DO NOTHING
                """)
                contactos_created = int(contactos_result.split()[-1]) if contactos_result else 0
            else:
                # Fallback: use partner_account_final
                paf_exists = await conn.fetchval("SELECT EXISTS(SELECT 1 FROM information_schema.views WHERE table_schema='crm' AND table_name='v_partner_account_final')")
                if paf_exists:
                    cuentas_result = await conn.execute("""
                        INSERT INTO crm.cuenta (cuenta_partner_odoo_id)
                        SELECT DISTINCT cuenta_partner_odoo_id FROM crm.v_partner_account_final
                        ON CONFLICT (cuenta_partner_odoo_id) DO NOTHING
                    """)
                    cuentas_created = int(cuentas_result.split()[-1]) if cuentas_result else 0
                    
                    contactos_result = await conn.execute("""
                        INSERT INTO crm.contacto (contacto_partner_odoo_id, cuenta_partner_odoo_id)
                        SELECT contacto_partner_odoo_id, cuenta_partner_odoo_id FROM crm.v_partner_account_final
                        ON CONFLICT (contacto_partner_odoo_id) DO NOTHING
                    """)
                    contactos_created = int(contactos_result.split()[-1]) if contactos_result else 0
                else:
                    cuentas_created = 0
                    contactos_created = 0

            await conn.execute("SET statement_timeout = '0'")

            return {
                "ok": True,
                "cuentas_creadas": cuentas_created,
                "contactos_creados": contactos_created
            }
        except Exception as e:
            logger.error(f"Bootstrap error: {e}")
            raise HTTPException(500, f"Error en inicializacion: {str(e)}")


# ─── PARTNERS (UNLINKED) ROUTES ────────────────────────────────────────────────

partners_router = APIRouter(prefix="/api/partners", tags=["partners"])


@partners_router.get("/unlinked")
async def get_unlinked_partners(
    q: str = "", page: int = 1, pageSize: int = 20,
    solo_dni: bool = False, solo_telefono: bool = False,
    exclude_cuenta: int = 0,
    user=Depends(get_current_user)
):
    """Search 'free' partners: those whose principal in v_partner_account_final is themselves.
    Excludes the current cuenta's own partner."""
    p = await get_pool()
    async with p.acquire() as conn:
        try:
            offset = (page - 1) * pageSize
            where = """WHERE rp.company_key = 'GLOBAL'
                AND COALESCE(rp.active, true) = true
                AND m.cuenta_partner_odoo_id = rp.odoo_id
                AND rp.name IS NOT NULL AND rp.name <> ''
                AND rp.name NOT ILIKE '%cliente varios%'
                AND rp.name NOT ILIKE '%publico general%'"""
            params = []

            if exclude_cuenta > 0:
                params.append(exclude_cuenta)
                where += f" AND rp.odoo_id <> ${len(params)}"

            if q:
                search_parts = [f"rp.name ILIKE ${len(params)+1}"]
                params.append(f"%{q}%")
                idx = len(params)
                search_parts.append(f"COALESCE(rp.vat,'') ILIKE ${idx}")
                search_parts.append(f"COALESCE(rp.phone::text,'') ILIKE ${idx}")
                search_parts.append(f"COALESCE(rp.mobile::text,'') ILIKE ${idx}")
                where += f" AND ({' OR '.join(search_parts)})"

            if solo_dni:
                where += " AND rp.vat IS NOT NULL AND rp.vat <> ''"
            if solo_telefono:
                where += " AND (rp.phone IS NOT NULL AND rp.phone::text <> '' OR rp.mobile IS NOT NULL AND rp.mobile::text <> '')"

            base_from = """FROM odoo.res_partner rp
                JOIN crm.v_partner_account_final m ON m.contacto_partner_odoo_id = rp.odoo_id"""

            count = await conn.fetchval(
                f"SELECT COUNT(*) {base_from} {where}", *params
            )

            data_params = params.copy()
            data_params.extend([pageSize, offset])
            rows = await conn.fetch(
                f"""SELECT rp.odoo_id, rp.name,
                    COALESCE(rp.vat, '') as vat,
                    COALESCE(rp.phone::text, '') as phone,
                    COALESCE(rp.mobile::text, '') as mobile,
                    COALESCE(rp.city::text, '') as city
                {base_from} {where}
                ORDER BY rp.name
                LIMIT ${len(data_params)-1} OFFSET ${len(data_params)}""",
                *data_params
            )

            return {"items": records_to_list(rows), "total": count, "page": page}
        except Exception as e:
            logger.error(f"Error fetching unlinked partners: {e}")
            return {"items": [], "total": 0, "page": page, "error": str(e)}


# ─── VINCULAR CONTACTO A CUENTA ───────────────────────────────────────────────

@cuentas_router.post("/{cuenta_id}/vincular-contacto")
async def vincular_contacto(cuenta_id: str, data: VincularContactoInput, user=Depends(get_current_user)):
    """Link an odoo partner to a CRM cuenta: upserts override + contacto"""
    p = await get_pool()
    async with p.acquire() as conn:
        cuenta_odoo_id = int(cuenta_id)
        contacto_odoo_id = data.contacto_partner_odoo_id

        # Ensure cuenta crm row exists
        await conn.execute(
            "INSERT INTO crm.cuenta (cuenta_partner_odoo_id) VALUES ($1) ON CONFLICT DO NOTHING",
            cuenta_odoo_id
        )

        # Try to get whatsapp from odoo
        whatsapp_val = None
        try:
            val = await conn.fetchval(
                "SELECT mobile::text FROM odoo.res_partner WHERE odoo_id = $1 AND company_key = 'GLOBAL' LIMIT 1",
                contacto_odoo_id
            )
            if val:
                whatsapp_val = str(val)
        except Exception:
            pass

        # Upsert contacto
        await conn.execute(
            """INSERT INTO crm.contacto (contacto_partner_odoo_id, cuenta_partner_odoo_id, whatsapp)
            VALUES ($1, $2, $3)
            ON CONFLICT (contacto_partner_odoo_id) DO UPDATE SET 
                cuenta_partner_odoo_id = $2, whatsapp = COALESCE(crm.contacto.whatsapp, $3), updated_at = now()""",
            contacto_odoo_id, cuenta_odoo_id, whatsapp_val
        )

        # Upsert partner_principal_override
        nota = data.nota or "Vinculado manualmente desde la cuenta"
        await conn.execute(
            """INSERT INTO crm.partner_principal_override (contacto_partner_odoo_id, cuenta_partner_odoo_id, nota)
            VALUES ($1, $2, $3)
            ON CONFLICT (contacto_partner_odoo_id) DO UPDATE SET 
                cuenta_partner_odoo_id = $2, nota = $3, updated_at = now()""",
            contacto_odoo_id, cuenta_odoo_id, nota
        )

        return {"ok": True, "contacto_partner_odoo_id": contacto_odoo_id, "cuenta_partner_odoo_id": cuenta_odoo_id}


# ─── STATS ENDPOINT ───────────────────────────────────────────────────────────

@app.get("/api/stats")
async def get_stats(user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        try:
            cuentas_libres = await conn.fetchval("SELECT COUNT(*) FROM crm.v_cuentas_libres")
        except Exception:
            cuentas_libres = 0
        try:
            contactos_vinculados = await conn.fetchval("SELECT COUNT(*) FROM crm.v_contactos_vinculados")
        except Exception:
            contactos_vinculados = 0
        total_partners = await conn.fetchval("SELECT COUNT(*) FROM odoo.res_partner WHERE company_key='GLOBAL' AND COALESCE(active,true)=true")
        tareas_pendientes = await conn.fetchval("SELECT COUNT(*) FROM crm.tarea WHERE status = 'PENDIENTE'")
        interacciones = await conn.fetchval("SELECT COUNT(*) FROM crm.interaccion")
        productos_aprobados = await conn.fetchval("SELECT COUNT(*) FROM crm.producto_aprobado WHERE aprobado = true")

        return {
            "cuentas_libres": cuentas_libres,
            "contactos_vinculados": contactos_vinculados,
            "total_partners": total_partners,
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


# ─── STOCK DASHBOARD ROUTES ────────────────────────────────────────────────────

stock_dash_router = APIRouter(prefix="/api/stock-dashboard", tags=["stock-dashboard"])

STOCK_FLAT_VIEW = "crm.v_catalogo_stock_flat"


def _stock_filters(tienda, marca, tipo, entalle, tela, modelo, talla, color, es_lq, es_negro):
    """Build WHERE clause + params list for stock dashboard queries."""
    parts = []
    params = []

    def _add_multi(col, val):
        if not val:
            return
        vals = [v.strip() for v in val.split(',') if v.strip()]
        if vals:
            params.append(vals)
            parts.append(f"{col} = ANY(${len(params)})")

    _add_multi('tienda', tienda)
    _add_multi('marca', marca)
    _add_multi('tipo', tipo)
    _add_multi('entalle', entalle)
    _add_multi('tela', tela)
    _add_multi('talla', talla)
    _add_multi('color', color)

    if modelo:
        params.append(f"%{modelo}%")
        parts.append(f"modelo ILIKE ${len(params)}")
    if es_lq == 'si':
        parts.append("es_lq = true")
    elif es_lq == 'no':
        parts.append("es_lq = false")
    if es_negro == 'si':
        parts.append("es_negro = true")
    elif es_negro == 'no':
        parts.append("es_negro = false")

    where = "WHERE " + (" AND ".join(parts) if parts else "1=1")
    return where, params


def _talla_sort_key(t):
    order_map = {'XXS': 1, 'XS': 2, 'S': 3, 'M': 4, 'L': 5, 'XL': 6, 'XXL': 7, 'XXXL': 8}
    if t in order_map:
        return (1, order_map[t])
    try:
        return (0, int(t))
    except (ValueError, TypeError):
        return (2, t)


DASH_BASE = "crm.v_stock_dashboard_base"
STORE_ORDER = ["GRAU 238 / GRAU 55", "GAMARRA 209", "GM218", "BOOSH", "GAMARRA 207", "TOTAL", "ALMACEN"]
STORE_REAL = ["GRAU 238 / GRAU 55", "GAMARRA 209", "GM218", "BOOSH", "GAMARRA 207", "ALMACEN"]


def _dash_filters(tienda, marca, tipo, entalle, tela, modelo, talla, color, es_lq, es_negro):
    """Build WHERE for dashboard base view (uses tienda_canonica)."""
    parts = ["tienda_canonica IS NOT NULL"]
    params = []

    def _add(col, val):
        if not val:
            return
        vals = [v.strip() for v in val.split(',') if v.strip()]
        if vals:
            params.append(vals)
            parts.append(f"{col} = ANY(${len(params)})")

    _add('tienda_canonica', tienda)
    _add('marca', marca)
    _add('tipo', tipo)
    _add('entalle', entalle)
    _add('tela', tela)
    _add('talla', talla)
    _add('color', color)

    if modelo:
        params.append(f"%{modelo}%")
        parts.append(f"modelo ILIKE ${len(params)}")
    if es_lq == 'si':
        parts.append("es_lq = true")
    elif es_lq == 'no':
        parts.append("es_lq = false")
    if es_negro == 'si':
        parts.append("es_negro = true")
    elif es_negro == 'no':
        parts.append("es_negro = false")

    return "WHERE " + " AND ".join(parts), params


@stock_dash_router.get("/filters")
async def dash_filters(user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        try:
            cols = {'tienda_canonicas': 'tienda_canonica', 'marcas': 'marca', 'tipos': 'tipo',
                    'entalles': 'entalle', 'telas': 'tela', 'tallas': 'talla', 'colores': 'color'}
            result = {}
            for key, col in cols.items():
                rows = await conn.fetch(
                    f"SELECT DISTINCT {col}::text as v FROM {DASH_BASE} WHERE tienda_canonica IS NOT NULL AND {col} IS NOT NULL ORDER BY v"
                )
                result[key] = [r['v'] for r in rows]
            result['tallas'] = sorted(result['tallas'], key=_talla_sort_key)
            return result
        except Exception as e:
            logger.error(f"dash_filters error: {e}")
            return {}


# ── Cascade filter options (dependent filters) ──────────────────────────────
_fopts_cache: OrderedDict = OrderedDict()
_FOPTS_TTL = 60
_FOPTS_MAX = 100


def _fopts_get(key):
    if key in _fopts_cache:
        val, ts = _fopts_cache[key]
        if time.time() - ts < _FOPTS_TTL:
            _fopts_cache.move_to_end(key)
            return val
        del _fopts_cache[key]
    return None


def _fopts_set(key, val):
    _fopts_cache[key] = (val, time.time())
    while len(_fopts_cache) > _FOPTS_MAX:
        _fopts_cache.popitem(last=False)


def _cascade_where(all_f, exclude_col):
    """WHERE clause applying all filters EXCEPT exclude_col (for cascade options)."""
    parts = ["tienda_canonica IS NOT NULL"]
    params = []
    multi = [
        ('tienda_canonica', all_f.get('tienda', '')),
        ('marca', all_f.get('marca', '')),
        ('tipo', all_f.get('tipo', '')),
        ('entalle', all_f.get('entalle', '')),
        ('tela', all_f.get('tela', '')),
        ('talla', all_f.get('talla', '')),
        ('color', all_f.get('color', '')),
    ]
    for col, val in multi:
        if col == exclude_col or not val:
            continue
        vals = [v.strip() for v in val.split(',') if v.strip()]
        if vals:
            params.append(vals)
            parts.append(f"{col} = ANY(${len(params)})")
    modelo = all_f.get('modelo', '')
    if exclude_col != 'modelo' and modelo:
        params.append(f"%{modelo}%")
        parts.append(f"modelo ILIKE ${len(params)}")
    es_lq = all_f.get('es_lq', '')
    if exclude_col != 'es_lq':
        if es_lq == 'si':
            parts.append("es_lq = true")
        elif es_lq == 'no':
            parts.append("es_lq = false")
    es_negro = all_f.get('es_negro', '')
    if exclude_col != 'es_negro':
        if es_negro == 'si':
            parts.append("es_negro = true")
        elif es_negro == 'no':
            parts.append("es_negro = false")
    return "WHERE " + " AND ".join(parts), params


_CASCADE_FIELDS = [
    ('tienda_canonicas', 'tienda_canonica'),
    ('marcas', 'marca'),
    ('tipos', 'tipo'),
    ('entalles', 'entalle'),
    ('telas', 'tela'),
    ('tallas', 'talla'),
    ('colores', 'color'),
]


@stock_dash_router.get("/filter-options")
async def dash_filter_options(
    tienda: str = "", marca: str = "", tipo: str = "", entalle: str = "",
    tela: str = "", modelo: str = "", talla: str = "", color: str = "",
    es_lq: str = "", es_negro: str = "",
    user=Depends(get_current_user)
):
    ck = f"fo|{tienda}|{marca}|{tipo}|{entalle}|{tela}|{modelo}|{talla}|{color}|{es_lq}|{es_negro}"
    cached = _fopts_get(ck)
    if cached:
        return cached
    all_f = dict(tienda=tienda, marca=marca, tipo=tipo, entalle=entalle,
                 tela=tela, modelo=modelo, talla=talla, color=color,
                 es_lq=es_lq, es_negro=es_negro)
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            result = {}
            for resp_key, db_col in _CASCADE_FIELDS:
                where, params = _cascade_where(all_f, exclude_col=db_col)
                rows = await conn.fetch(
                    f"SELECT DISTINCT {db_col}::text as v FROM {DASH_BASE} {where} AND {db_col} IS NOT NULL ORDER BY v LIMIT 500",
                    *params
                )
                result[resp_key] = [r['v'] for r in rows]
            result['tallas'] = sorted(result['tallas'], key=_talla_sort_key)
            _fopts_set(ck, result)
            return result
        except Exception as e:
            logger.error(f"dash_filter_options error: {e}")
            return {}


# ── Cube-based dashboard (v2) ────────────────────────────────────────────────

def _cube_where(tienda, marca, tipo, entalle, tela, modelo, talla, color, lq, negro):
    """WHERE clause for cube queries. Uses modelo_base, flag_lq, improved es_negro."""
    parts = ["tienda_canonica IS NOT NULL"]
    params = []

    def _add(col, val):
        if not val:
            return
        vals = [v.strip() for v in val.split(',') if v.strip()]
        if vals:
            params.append(vals)
            parts.append(f"{col} = ANY(${len(params)})")

    _add('tienda_canonica', tienda)
    _add('marca', marca)
    _add('tipo', tipo)
    _add('entalle', entalle)
    _add('tela', tela)
    _add('talla', talla)
    _add('color', color)

    if modelo:
        params.append(f"%{modelo}%")
        parts.append(f"modelo_base ILIKE ${len(params)}")
    if lq == 'yes':
        parts.append("flag_lq = true")
    elif lq == 'no':
        parts.append("flag_lq = false")
    if negro == 'yes':
        parts.append("es_negro = true")
    elif negro == 'no':
        parts.append("es_negro = false")

    return "WHERE " + " AND ".join(parts), params


def _cascade_where_v2(all_f, exclude_col):
    """Cascade WHERE using modelo_base + flag_lq for the v2 dashboard."""
    parts = ["tienda_canonica IS NOT NULL"]
    params = []
    multi = [
        ('tienda_canonica', all_f.get('tienda', '')),
        ('marca', all_f.get('marca', '')),
        ('tipo', all_f.get('tipo', '')),
        ('entalle', all_f.get('entalle', '')),
        ('tela', all_f.get('tela', '')),
        ('talla', all_f.get('talla', '')),
        ('color', all_f.get('color', '')),
    ]
    for col, val in multi:
        if col == exclude_col or not val:
            continue
        vals = [v.strip() for v in val.split(',') if v.strip()]
        if vals:
            params.append(vals)
            parts.append(f"{col} = ANY(${len(params)})")
    modelo = all_f.get('modelo', '')
    if exclude_col != 'modelo_base' and modelo:
        params.append(f"%{modelo}%")
        parts.append(f"modelo_base ILIKE ${len(params)}")
    lq = all_f.get('lq', '')
    if exclude_col != 'flag_lq':
        if lq == 'yes':
            parts.append("flag_lq = true")
        elif lq == 'no':
            parts.append("flag_lq = false")
    negro = all_f.get('negro', '')
    if exclude_col != 'es_negro':
        if negro == 'yes':
            parts.append("es_negro = true")
        elif negro == 'no':
            parts.append("es_negro = false")
    return "WHERE " + " AND ".join(parts), params


_CASCADE_FIELDS_V2 = [
    ('tienda_canonicas', 'tienda_canonica'),
    ('marcas', 'marca'),
    ('tipos', 'tipo'),
    ('entalles', 'entalle'),
    ('telas', 'tela'),
    ('tallas', 'talla'),
    ('colores', 'color'),
]


@stock_dash_router.get("/filter-options-v2")
async def dash_filter_options_v2(
    tienda: str = "", marca: str = "", tipo: str = "", entalle: str = "",
    tela: str = "", modelo: str = "", talla: str = "", color: str = "",
    lq: str = "", negro: str = "",
    user=Depends(get_current_user)
):
    ck = f"fo2|{tienda}|{marca}|{tipo}|{entalle}|{tela}|{modelo}|{talla}|{color}|{lq}|{negro}"
    cached = _fopts_get(ck)
    if cached:
        return cached
    all_f = dict(tienda=tienda, marca=marca, tipo=tipo, entalle=entalle,
                 tela=tela, modelo=modelo, talla=talla, color=color,
                 lq=lq, negro=negro)
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            result = {}
            for resp_key, db_col in _CASCADE_FIELDS_V2:
                where, params = _cascade_where_v2(all_f, exclude_col=db_col)
                rows = await conn.fetch(
                    f"SELECT DISTINCT {db_col}::text as v FROM {DASH_BASE} {where} AND {db_col} IS NOT NULL ORDER BY v LIMIT 500",
                    *params
                )
                result[resp_key] = [r['v'] for r in rows]
            result['tallas'] = sorted(result['tallas'], key=_talla_sort_key)
            _fopts_set(ck, result)
            return result
        except Exception as e:
            logger.error(f"dash_filter_options_v2 error: {e}")
            return {}


@stock_dash_router.get("/cube")
async def dash_cube(
    tienda: str = "", marca: str = "", tipo: str = "", entalle: str = "",
    tela: str = "", modelo: str = "", talla: str = "", color: str = "",
    lq: str = "", negro: str = "",
    user=Depends(get_current_user)
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            where, params = _cube_where(tienda, marca, tipo, entalle, tela, modelo, talla, color, lq, negro)
            modelo_limit = 300 if not modelo else 5000

            cube_rows = await conn.fetch(f"""
                WITH filtered AS (
                    SELECT tienda_canonica as tienda, modelo_base as modelo,
                           flag_lq as lq, color, talla::text as talla, available_qty as qty
                    FROM {DASH_BASE} {where}
                ),
                ranked AS (
                    SELECT modelo, SUM(qty) as ts
                    FROM filtered GROUP BY modelo ORDER BY ts DESC LIMIT {modelo_limit}
                )
                SELECT f.tienda, f.modelo, f.lq, f.color, f.talla, SUM(f.qty) as qty
                FROM filtered f JOIN ranked r ON r.modelo = f.modelo
                GROUP BY f.tienda, f.modelo, f.lq, f.color, f.talla
                HAVING SUM(f.qty) > 0
            """, *params)

            cube = []
            for r in cube_rows:
                cube.append({
                    "t": r['tienda'], "m": r['modelo'], "lq": r['lq'],
                    "c": r['color'], "z": r['talla'], "q": float(r['qty'])
                })

            kpi = await conn.fetchrow(f"""
                SELECT COALESCE(SUM(available_qty),0) as total_stock,
                       COUNT(DISTINCT modelo_base) as modelos,
                       COUNT(DISTINCT product_product_id) as variantes,
                       COUNT(DISTINCT tienda_canonica) as tiendas
                FROM {DASH_BASE} {where}
            """, *params)

            return {
                "cube": cube,
                "kpis": {
                    "total_stock": float(kpi['total_stock']),
                    "modelos": kpi['modelos'],
                    "variantes": kpi['variantes'],
                    "tiendas": kpi['tiendas']
                }
            }
        except Exception as e:
            logger.error(f"dash_cube error: {e}")
            import traceback
            traceback.print_exc()
            return {"cube": [], "kpis": {"total_stock": 0, "modelos": 0, "variantes": 0, "tiendas": 0}}


@stock_dash_router.get("/detail")
async def dash_detail(
    tienda: str = "", marca: str = "", tipo: str = "", entalle: str = "",
    tela: str = "", modelo: str = "", talla: str = "", color: str = "",
    lq: str = "", negro: str = "",
    sel_modelo: str = "", sel_talla: str = "", sel_color: str = "", sel_tienda: str = "",
    page: int = 1, limit: int = 50,
    user=Depends(get_current_user)
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            where, params = _cube_where(tienda, marca, tipo, entalle, tela, modelo, talla, color, lq, negro)

            if sel_modelo:
                params.append(sel_modelo)
                where += f" AND modelo_base = ${len(params)}"
            if sel_talla:
                params.append(sel_talla)
                where += f" AND talla::text = ${len(params)}"
            if sel_color:
                params.append(sel_color)
                where += f" AND color = ${len(params)}"
            if sel_tienda:
                params.append(sel_tienda)
                where += f" AND tienda_canonica = ${len(params)}"

            cnt = await conn.fetchval(f"SELECT COUNT(*) FROM {DASH_BASE} {where}", *params)
            offset = (page - 1) * limit
            rows = await conn.fetch(f"""
                SELECT tienda_canonica as tienda, modelo_base as modelo, modelo as modelo_raw,
                       flag_lq as lq, talla::text as talla, color, barcode,
                       available_qty as qty, es_negro, marca
                FROM {DASH_BASE} {where}
                ORDER BY modelo_base, tienda_canonica, color, talla
                LIMIT {limit} OFFSET {offset}
            """, *params)

            items = []
            for r in rows:
                items.append({
                    "tienda": r['tienda'], "modelo": r['modelo'], "modelo_raw": r['modelo_raw'],
                    "lq": r['lq'], "talla": r['talla'], "color": r['color'],
                    "barcode": r['barcode'], "qty": float(r['qty']),
                    "es_negro": r['es_negro'], "marca": r['marca']
                })
            return {"items": items, "total": cnt}
        except Exception as e:
            logger.error(f"dash_detail error: {e}")
            return {"items": [], "total": 0}
async def dash_modelo_talla(
    tienda: str = "", marca: str = "", tipo: str = "", entalle: str = "",
    tela: str = "", modelo: str = "", talla: str = "", color: str = "",
    es_lq: str = "", es_negro: str = "", limit: int = 50,
    user=Depends(get_current_user)
):
    p = await get_pool()
    async with p.acquire() as conn:
        try:
            where, params = _dash_filters(tienda, marca, tipo, entalle, tela, modelo, talla, color, es_lq, es_negro)
            rows = await conn.fetch(f"""
                SELECT modelo, talla::text as talla, SUM(available_qty) as qty
                FROM {DASH_BASE} {where}
                GROUP BY modelo, talla
            """, *params)

            # Build modelo totals, pick top N
            modelo_totals = {}
            for r in rows:
                m = r['modelo']
                modelo_totals[m] = modelo_totals.get(m, 0) + float(r['qty'])
            top_modelos = sorted(modelo_totals.keys(), key=lambda m: -modelo_totals[m])[:limit]
            top_set = set(top_modelos)

            tallas_set = set()
            modelo_map = {}
            for r in rows:
                m, t, q = r['modelo'], r['talla'], float(r['qty'])
                if m not in top_set:
                    continue
                tallas_set.add(t)
                modelo_map.setdefault(m, {})[t] = q

            tallas = sorted(tallas_set, key=_talla_sort_key)
            result_rows = []
            totals_by_talla = {}
            grand_total = 0
            for m in top_modelos:
                cells = modelo_map.get(m, {})
                total = sum(cells.values())
                result_rows.append({"modelo": m, "cells": cells, "total": round(total)})
                grand_total += total
                for t in tallas:
                    totals_by_talla[t] = totals_by_talla.get(t, 0) + cells.get(t, 0)

            return {"tallas": tallas, "rows": result_rows,
                    "totals_by_talla": {t: round(v) for t, v in totals_by_talla.items()},
                    "grand_total": round(grand_total), "total_modelos": len(modelo_totals)}
        except Exception as e:
            logger.error(f"dash_modelo_talla error: {e}")
            return {"tallas": [], "rows": [], "totals_by_talla": {}, "grand_total": 0, "total_modelos": 0}


@stock_dash_router.get("/panels")
async def dash_panels(
    tienda: str = "", marca: str = "", tipo: str = "", entalle: str = "",
    tela: str = "", modelo: str = "", talla: str = "", color: str = "",
    es_lq: str = "", es_negro: str = "",
    user=Depends(get_current_user)
):
    """Return Color x Talla matrices for ALL store panels + TOTAL."""
    p = await get_pool()
    async with p.acquire() as conn:
        try:
            where, params = _dash_filters(tienda, marca, tipo, entalle, tela, modelo, talla, color, es_lq, es_negro)

            # KPIs
            kpi = await conn.fetchrow(f"""
                SELECT COALESCE(SUM(available_qty),0) as total_stock,
                       COUNT(DISTINCT product_tmpl_id) as modelos,
                       COUNT(DISTINCT product_product_id) as variantes,
                       COUNT(DISTINCT tienda_canonica) as tiendas
                FROM {DASH_BASE} {where}
            """, *params)

            # One query for all panels
            rows = await conn.fetch(f"""
                SELECT tienda_canonica, COALESCE(color,'Sin color') as color,
                       COALESCE(talla::text,'?') as talla, SUM(available_qty) as qty
                FROM {DASH_BASE} {where}
                GROUP BY tienda_canonica, color, talla
            """, *params)

            # Build per-store data
            store_data = {}
            all_tallas = set()
            for r in rows:
                s, c, t, q = r['tienda_canonica'], r['color'], r['talla'], float(r['qty'])
                all_tallas.add(t)
                store_data.setdefault(s, {}).setdefault(c, {})[t] = \
                    store_data.get(s, {}).get(c, {}).get(t, 0) + q

            tallas = sorted(all_tallas, key=_talla_sort_key)

            def build_panel(data):
                colores = sorted(data.keys())
                matrix = {}
                by_color = {}
                by_size = {}
                gt = 0
                for c in colores:
                    matrix[c] = {}
                    row_total = 0
                    for t in tallas:
                        v = data.get(c, {}).get(t, 0)
                        matrix[c][t] = round(v)
                        by_size[t] = by_size.get(t, 0) + v
                        row_total += v
                    by_color[c] = round(row_total)
                    gt += row_total
                return {"colores": colores, "matrix": matrix,
                        "totals": {"byColor": by_color,
                                   "bySize": {t: round(v) for t, v in by_size.items()},
                                   "grandTotal": round(gt)}}

            # Build individual store panels
            stores = {}
            for s in STORE_REAL:
                stores[s] = build_panel(store_data.get(s, {}))

            # Build TOTAL (sum all real stores)
            total_data = {}
            for s in STORE_REAL:
                for c, sizes in store_data.get(s, {}).items():
                    for t, q in sizes.items():
                        total_data.setdefault(c, {})[t] = total_data.get(c, {}).get(t, 0) + q
            stores["TOTAL"] = build_panel(total_data)

            return {
                "tallas": tallas, "stores": stores,
                "kpis": {
                    "total_stock": float(kpi['total_stock']),
                    "modelos": kpi['modelos'],
                    "variantes": kpi['variantes'],
                    "tiendas": kpi['tiendas']
                }
            }
        except Exception as e:
            logger.error(f"dash_panels error: {e}")
            return {"tallas": [], "stores": {}, "kpis": {"total_stock": 0, "modelos": 0, "variantes": 0, "tiendas": 0}}



def _stock_filters_aliased(alias, tienda, marca, tipo, entalle, tela, modelo, talla, color, es_lq, es_negro):
    """Build WHERE clause with table alias prefix for JOIN queries."""
    parts = []
    params = []
    a = f"{alias}." if alias else ""

    def _add_multi(col, val):
        if not val:
            return
        vals = [v.strip() for v in val.split(',') if v.strip()]
        if vals:
            params.append(vals)
            parts.append(f"{a}{col} = ANY(${len(params)})")

    _add_multi('tienda', tienda)
    _add_multi('marca', marca)
    _add_multi('tipo', tipo)
    _add_multi('entalle', entalle)
    _add_multi('tela', tela)
    _add_multi('talla', talla)
    _add_multi('color', color)

    if modelo:
        params.append(f"%{modelo}%")
        parts.append(f"{a}modelo ILIKE ${len(params)}")
    if es_lq == 'si':
        parts.append(f"{a}es_lq = true")
    elif es_lq == 'no':
        parts.append(f"{a}es_lq = false")
    if es_negro == 'si':
        parts.append(f"{a}es_negro = true")
    elif es_negro == 'no':
        parts.append(f"{a}es_negro = false")

    where = "WHERE " + (" AND ".join(parts) if parts else "1=1")
    return where, params


@stock_dash_router.get("/filtros")
async def stock_filtros(user=Depends(get_current_user)):
    """Get distinct filter values for dropdowns."""
    p = await get_pool()
    async with p.acquire() as conn:
        try:
            cols = ['tienda', 'marca', 'tipo', 'entalle', 'tela', 'talla', 'color']
            result = {}
            for col in cols:
                rows = await conn.fetch(
                    f"SELECT DISTINCT {col}::text as val FROM {STOCK_FLAT_VIEW} WHERE {col} IS NOT NULL ORDER BY val"
                )
                result[col + 's'] = [r['val'] for r in rows]
            # Sort tallas intelligently
            result['tallas'] = sorted(result['tallas'], key=_talla_sort_key)
            # Modelos separately (name-based)
            mrows = await conn.fetch(
                f"SELECT DISTINCT modelo as val FROM {STOCK_FLAT_VIEW} WHERE modelo IS NOT NULL ORDER BY val"
            )
            result['modelos'] = [r['val'] for r in mrows]
            return result
        except Exception as e:
            logger.error(f"Error fetching stock filtros: {e}")
            return {}


@stock_dash_router.get("/kpis")
async def stock_kpis(
    tienda: str = "", marca: str = "", tipo: str = "", entalle: str = "",
    tela: str = "", modelo: str = "", talla: str = "", color: str = "",
    es_lq: str = "", es_negro: str = "",
    user=Depends(get_current_user)
):
    p = await get_pool()
    async with p.acquire() as conn:
        try:
            where, params = _stock_filters(tienda, marca, tipo, entalle, tela, modelo, talla, color, es_lq, es_negro)
            row = await conn.fetchrow(f"""
                SELECT
                    COALESCE(SUM(available_qty), 0) as total_stock,
                    COUNT(DISTINCT product_tmpl_id) as modelos,
                    COUNT(DISTINCT product_product_id) as variantes,
                    COUNT(DISTINCT tienda) as tiendas_con_stock
                FROM {STOCK_FLAT_VIEW} {where}
            """, *params)
            return {
                "total_stock": float(row['total_stock']),
                "modelos": row['modelos'],
                "variantes": row['variantes'],
                "tiendas_con_stock": row['tiendas_con_stock']
            }
        except Exception as e:
            logger.error(f"Error fetching stock KPIs: {e}")
            return {"total_stock": 0, "modelos": 0, "variantes": 0, "tiendas_con_stock": 0}


@stock_dash_router.get("/pivot-modelo")
async def stock_pivot_modelo(
    tienda: str = "", marca: str = "", tipo: str = "", entalle: str = "",
    tela: str = "", modelo: str = "", talla: str = "", color: str = "",
    es_lq: str = "", es_negro: str = "",
    limit: int = 50, page: int = 1,
    user=Depends(get_current_user)
):
    """Pivot: rows=modelo+marca, cols=talla, values=SUM(available_qty)."""
    p = await get_pool()
    async with p.acquire() as conn:
        try:
            where, params = _stock_filters(tienda, marca, tipo, entalle, tela, modelo, talla, color, es_lq, es_negro)
            where_f, params_f = _stock_filters_aliased("f", tienda, marca, tipo, entalle, tela, modelo, talla, color, es_lq, es_negro)
            offset = (page - 1) * limit

            # Get distinct tallas for columns
            t_rows = await conn.fetch(
                f"SELECT DISTINCT talla::text as t FROM {STOCK_FLAT_VIEW} {where} AND talla IS NOT NULL", *params
            )
            tallas = sorted([r['t'] for r in t_rows], key=_talla_sort_key)

            # Get total count of distinct modelos
            total_modelos = await conn.fetchval(
                f"SELECT COUNT(DISTINCT (modelo, COALESCE(marca::text,''))) FROM {STOCK_FLAT_VIEW} {where}", *params
            )

            # Get pivot data: modelo, marca, talla, qty - top N by total stock
            piv_params = list(params_f)
            piv_params.extend([limit, offset])
            rows = await conn.fetch(f"""
                WITH modelo_totals AS (
                    SELECT modelo, COALESCE(marca::text,'') as marca, SUM(available_qty) as total
                    FROM {STOCK_FLAT_VIEW} {where}
                    GROUP BY modelo, marca
                    ORDER BY total DESC
                    LIMIT ${len(piv_params)-1} OFFSET ${len(piv_params)}
                )
                SELECT f.modelo, COALESCE(f.marca::text,'') as marca, f.talla::text as talla, SUM(f.available_qty) as qty
                FROM {STOCK_FLAT_VIEW} f
                JOIN modelo_totals mt ON mt.modelo = f.modelo AND COALESCE(f.marca::text,'') = mt.marca
                {where_f.replace("WHERE", "AND") if where_f != "WHERE 1=1" else ""}
                GROUP BY f.modelo, f.marca, f.talla
            """, *piv_params)

            # Build matrix
            modelo_map = {}
            for r in rows:
                key = f"{r['modelo']}||{r['marca']}"
                if key not in modelo_map:
                    modelo_map[key] = {"modelo": r['modelo'], "marca": r['marca'], "values": {}, "total": 0}
                qty = float(r['qty'])
                modelo_map[key]["values"][r['talla']] = qty
                modelo_map[key]["total"] += qty

            result_rows = sorted(modelo_map.values(), key=lambda x: -x['total'])

            totals_by_talla = {}
            grand_total = 0
            for row_data in result_rows:
                for t in tallas:
                    v = row_data["values"].get(t, 0)
                    totals_by_talla[t] = totals_by_talla.get(t, 0) + v
                grand_total += row_data["total"]

            return {
                "tallas": tallas,
                "rows": result_rows,
                "totals_by_talla": totals_by_talla,
                "grand_total": grand_total,
                "total_modelos": total_modelos,
                "page": page
            }
        except Exception as e:
            logger.error(f"Error fetching stock pivot modelo: {e}")
            return {"tallas": [], "rows": [], "totals_by_talla": {}, "grand_total": 0, "total_modelos": 0, "page": page}


@stock_dash_router.get("/pivot-modelo-tienda")
async def stock_pivot_modelo_tienda(
    tienda: str = "", marca: str = "", tipo: str = "", entalle: str = "",
    tela: str = "", modelo: str = "", talla: str = "", color: str = "",
    es_lq: str = "", es_negro: str = "",
    limit: int = 50, page: int = 1,
    user=Depends(get_current_user)
):
    """Pivot: rows=modelo+marca, cols=tienda, values=SUM(available_qty)."""
    p = await get_pool()
    async with p.acquire() as conn:
        try:
            where, params = _stock_filters(tienda, marca, tipo, entalle, tela, modelo, talla, color, es_lq, es_negro)
            where_f, params_f = _stock_filters_aliased("f", tienda, marca, tipo, entalle, tela, modelo, talla, color, es_lq, es_negro)
            offset = (page - 1) * limit

            # Get distinct tiendas
            t_rows = await conn.fetch(
                f"SELECT DISTINCT tienda as t FROM {STOCK_FLAT_VIEW} {where} AND tienda IS NOT NULL ORDER BY tienda", *params
            )
            tiendas_list = [r['t'] for r in t_rows]

            total_modelos = await conn.fetchval(
                f"SELECT COUNT(DISTINCT (modelo, COALESCE(marca::text,''))) FROM {STOCK_FLAT_VIEW} {where}", *params
            )

            piv_params = list(params_f)
            piv_params.extend([limit, offset])
            rows = await conn.fetch(f"""
                WITH modelo_totals AS (
                    SELECT modelo, COALESCE(marca::text,'') as marca, SUM(available_qty) as total
                    FROM {STOCK_FLAT_VIEW} {where}
                    GROUP BY modelo, marca
                    ORDER BY total DESC
                    LIMIT ${len(piv_params)-1} OFFSET ${len(piv_params)}
                )
                SELECT f.modelo, COALESCE(f.marca::text,'') as marca, f.tienda, SUM(f.available_qty) as qty
                FROM {STOCK_FLAT_VIEW} f
                JOIN modelo_totals mt ON mt.modelo = f.modelo AND COALESCE(f.marca::text,'') = mt.marca
                {where_f.replace("WHERE", "AND") if where_f != "WHERE 1=1" else ""}
                GROUP BY f.modelo, f.marca, f.tienda
            """, *piv_params)

            modelo_map = {}
            for r in rows:
                key = f"{r['modelo']}||{r['marca']}"
                if key not in modelo_map:
                    modelo_map[key] = {"modelo": r['modelo'], "marca": r['marca'], "values": {}, "total": 0}
                qty = float(r['qty'])
                modelo_map[key]["values"][r['tienda']] = qty
                modelo_map[key]["total"] += qty

            result_rows = sorted(modelo_map.values(), key=lambda x: -x['total'])

            totals_by_tienda = {}
            grand_total = 0
            for rd in result_rows:
                for t in tiendas_list:
                    v = rd["values"].get(t, 0)
                    totals_by_tienda[t] = totals_by_tienda.get(t, 0) + v
                grand_total += rd["total"]

            return {
                "tiendas": tiendas_list,
                "rows": result_rows,
                "totals_by_tienda": totals_by_tienda,
                "grand_total": grand_total,
                "total_modelos": total_modelos,
                "page": page
            }
        except Exception as e:
            logger.error(f"Error fetching stock pivot modelo-tienda: {e}")
            return {"tiendas": [], "rows": [], "totals_by_tienda": {}, "grand_total": 0, "total_modelos": 0, "page": page}



@stock_dash_router.get("/pivot-tienda")
async def stock_pivot_tienda(
    pivot_tienda: str = "",
    tienda: str = "", marca: str = "", tipo: str = "", entalle: str = "",
    tela: str = "", modelo: str = "", talla: str = "", color: str = "",
    es_lq: str = "", es_negro: str = "",
    user=Depends(get_current_user)
):
    """Pivot for a specific tienda: rows=color, cols=talla, values=SUM(available_qty)."""
    p = await get_pool()
    async with p.acquire() as conn:
        try:
            where, params = _stock_filters(tienda, marca, tipo, entalle, tela, modelo, talla, color, es_lq, es_negro)

            if pivot_tienda:
                params.append(pivot_tienda)
                extra = f" AND tienda = ${len(params)}"
            else:
                extra = ""

            rows = await conn.fetch(f"""
                SELECT COALESCE(color, 'Sin color') as color, COALESCE(talla::text, 'Sin talla') as talla,
                       SUM(available_qty) as qty
                FROM {STOCK_FLAT_VIEW} {where}{extra}
                GROUP BY color, talla
            """, *params)

            colors_set = set()
            sizes_set = set()
            matrix = {}
            for r in rows:
                c, t, q = r['color'], r['talla'], float(r['qty'])
                colors_set.add(c)
                sizes_set.add(t)
                matrix.setdefault(c, {})[t] = q

            tallas = sorted(sizes_set, key=_talla_sort_key)
            colores = sorted(colors_set)
            by_color = {c: sum(matrix.get(c, {}).get(t, 0) for t in tallas) for c in colores}
            by_size = {t: sum(matrix.get(c, {}).get(t, 0) for c in colores) for t in tallas}
            grand_total = sum(by_color.values())

            return {
                "tallas": tallas, "colores": colores, "matrix": matrix,
                "totals": {"byColor": by_color, "bySize": by_size, "grandTotal": grand_total}
            }
        except Exception as e:
            logger.error(f"Error fetching stock pivot tienda: {e}")
            return {"tallas": [], "colores": [], "matrix": {}, "totals": {"byColor": {}, "bySize": {}, "grandTotal": 0}}


@stock_dash_router.get("/detalle")
async def stock_detalle(
    tienda: str = "", marca: str = "", tipo: str = "", entalle: str = "",
    tela: str = "", modelo: str = "", talla: str = "", color: str = "",
    es_lq: str = "", es_negro: str = "",
    page: int = 1, limit: int = 50, orden: str = "qty_desc",
    user=Depends(get_current_user)
):
    """Paginated detail rows."""
    p = await get_pool()
    async with p.acquire() as conn:
        try:
            where, params = _stock_filters(tienda, marca, tipo, entalle, tela, modelo, talla, color, es_lq, es_negro)
            offset = (page - 1) * limit

            order_map = {"qty_desc": "available_qty DESC", "qty_asc": "available_qty ASC",
                         "modelo": "modelo ASC", "tienda": "tienda ASC"}
            order_by = order_map.get(orden, "available_qty DESC")

            count = await conn.fetchval(f"SELECT COUNT(*) FROM {STOCK_FLAT_VIEW} {where}", *params)

            d_params = list(params)
            d_params.extend([limit, offset])
            rows = await conn.fetch(f"""
                SELECT tienda, modelo, marca::text as marca, talla::text as talla, color, barcode,
                       available_qty, es_lq, es_negro
                FROM {STOCK_FLAT_VIEW} {where}
                ORDER BY {order_by}
                LIMIT ${len(d_params)-1} OFFSET ${len(d_params)}
            """, *d_params)

            return {"items": records_to_list(rows), "total": count, "page": page}
        except Exception as e:
            logger.error(f"Error fetching stock detalle: {e}")
            return {"items": [], "total": 0, "page": page}


# ─── INCLUDE ROUTERS ──────────────────────────────────────────────────────────

app.include_router(auth_router)
app.include_router(catalogo_router)
app.include_router(productos_router)
app.include_router(cuentas_router)
app.include_router(contactos_router)
app.include_router(tareas_router)
app.include_router(ventas_router)
app.include_router(bootstrap_router)
app.include_router(partners_router)
app.include_router(stock_dash_router)
