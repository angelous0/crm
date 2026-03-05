from fastapi import FastAPI, APIRouter, Depends, HTTPException, Header, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import time
import asyncio
import xmlrpc.client
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

def create_token(user_id: str, usuario: str) -> str:
    payload = {
        'sub': user_id,
        'usuario': usuario,
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
    usuario: str
    password: str
    nombre: Optional[str] = None

class LoginInput(BaseModel):
    usuario: str
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

class ToggleActiveInput(BaseModel):
    is_active: bool
    reason: Optional[str] = None

class BatchToggleActiveInput(BaseModel):
    ids: list
    is_active: bool
    reason: Optional[str] = None


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
        existing = await conn.fetchrow("SELECT id FROM crm.usuario WHERE usuario = $1", data.usuario)
        if existing:
            raise HTTPException(400, "Usuario ya registrado")
        pw_hash = bcrypt.hashpw(data.password.encode(), bcrypt.gensalt()).decode()
        row = await conn.fetchrow(
            "INSERT INTO crm.usuario (usuario, password_hash, nombre) VALUES ($1, $2, $3) RETURNING id, usuario, nombre, rol",
            data.usuario, pw_hash, data.nombre
        )
        user = record_to_dict(row)
        token = create_token(user['id'], user['usuario'])
        return {"token": token, "user": user}


@auth_router.post("/login")
async def login(data: LoginInput):
    p = await get_pool()
    async with p.acquire() as conn:
        row = await conn.fetchrow("SELECT id, usuario, nombre, rol, password_hash FROM crm.usuario WHERE usuario = $1", data.usuario)
        if not row:
            raise HTTPException(401, "Credenciales incorrectas")
        if not bcrypt.checkpw(data.password.encode(), row['password_hash'].encode()):
            raise HTTPException(401, "Credenciales incorrectas")
        user = record_to_dict(row)
        del user['password_hash']
        token = create_token(user['id'], user['usuario'])
        return {"token": token, "user": user}


@auth_router.get("/me")
async def me(user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        row = await conn.fetchrow("SELECT id, usuario, nombre, rol FROM crm.usuario WHERE id = $1::uuid", user['sub'])
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


import re as _re

def _normalize_phone(raw):
    """Strip non-digits from a phone string."""
    if not raw:
        return ""
    return _re.sub(r'[^0-9]', '', str(raw))

def _apply_phone(row):
    """Compute phone_display and phone_whatsapp from raw_phone/raw_mobile."""
    rp = _normalize_phone(row.get('raw_phone', ''))
    rm = _normalize_phone(row.get('raw_mobile', ''))
    # Dedup: if both are the same normalized, treat as one
    if rp and rm and rp == rm:
        rp = ""  # keep mobile only
    # Priority: mobile > phone
    if rm:
        primary_norm = rm
        primary_display = str(row.get('raw_mobile', '')).strip()
    elif rp:
        primary_norm = rp
        primary_display = str(row.get('raw_phone', '')).strip()
    else:
        row['phone_display'] = ""
        row['phone_whatsapp'] = ""
        row.pop('raw_phone', None)
        row.pop('raw_mobile', None)
        return
    row['phone_display'] = primary_display
    # Build wa.me number
    wa = ""
    if len(primary_norm) == 9 and primary_norm[0] == '9':
        wa = f"51{primary_norm}"
    elif primary_norm.startswith("51") and len(primary_norm) >= 11:
        wa = primary_norm
    elif len(primary_norm) >= 10:
        wa = primary_norm
    row['phone_whatsapp'] = wa
    row.pop('raw_phone', None)
    row.pop('raw_mobile', None)


@cuentas_router.get("/list")
async def get_cuentas_list(
    q: str = "", estado: str = "", clasificacion: str = "",
    ciudad: str = "", asignado: str = "", tienda: str = "",
    sort: str = "name", dir: str = "asc",
    page: int = 1, limit: int = 50,
    include_inactive: bool = False,
    approval_status: str = "APPROVED",
    user=Depends(get_current_user)
):
    """Airtable-style directory listing with KPIs, phone, %YTD."""
    p = await get_pool()
    async with p.acquire() as conn:
        offset = (page - 1) * limit
        try:
            where = "WHERE 1=1"
            params = []

            # Approval filter (default: only APPROVED)
            if approval_status:
                params.append(approval_status)
                where += f" AND COALESCE(cu.approval_status, 'APPROVED') = ${len(params)}"

            if not include_inactive:
                where += " AND COALESCE(cu.is_active, true) = true"

            if q:
                params.append(f"%{q}%")
                idx = len(params)
                where += f" AND (rp.name ILIKE ${idx} OR COALESCE(rp.vat,'') ILIKE ${idx} OR COALESCE(rp.phone::text,'') ILIKE ${idx} OR COALESCE(rp.mobile::text,'') ILIKE ${idx} OR COALESCE(rp.state_name::text,'') ILIKE ${idx})"
            if estado:
                params.append(estado)
                where += f" AND COALESCE(cu.estado_comercial, 'ACTIVO') = ${len(params)}"
            if clasificacion:
                params.append(clasificacion)
                where += f" AND cu.clasificacion = ${len(params)}"
            if ciudad:
                params.append(f"%{ciudad}%")
                where += f" AND rp.state_name::text ILIKE ${len(params)}"
            if asignado:
                params.append(f"%{asignado}%")
                where += f" AND cu.asignado_a ILIKE ${len(params)}"
            if tienda:
                if tienda == "Sin tienda":
                    where += " AND k.tienda IS NULL"
                else:
                    params.append(tienda)
                    where += f" AND k.tienda = ${len(params)}"

            base_from = """
                FROM crm.v_cuentas_libres cl
                JOIN odoo.res_partner rp ON rp.odoo_id = cl.cuenta_partner_odoo_id AND rp.company_key='GLOBAL'
                LEFT JOIN crm.cuenta cu ON cu.cuenta_partner_odoo_id = cl.cuenta_partner_odoo_id
                LEFT JOIN crm.mv_cuenta_sales_kpi k ON k.cuenta_id = cl.cuenta_partner_odoo_id
            """

            count = await conn.fetchval(
                f"SELECT COUNT(*) {base_from} {where}", *params
            )

            sort_map = {
                "name": "CASE WHEN rp.name IS NULL OR btrim(rp.name) = '' THEN 1 ELSE 0 END, rp.name",
                "depto": "rp.state_name",
                "last_purchase": "k.last_purchase_date",
                "qty_12m": "k.qty_12m",
                "orders_12m": "k.orders_12m",
                "qty_total": "k.qty_total",
                "orders_total": "k.orders_total",
                "pct_ytd": "pct_vs_avg_ytd",
                "tienda": "k.tienda",
            }
            order_col = sort_map.get(sort, "rp.name")
            order_dir = "ASC" if dir.lower() == "asc" else "DESC"
            nulls = "NULLS LAST" if order_dir == "DESC" else "NULLS FIRST"

            data_params = params.copy()
            data_params.extend([limit, offset])
            rows = await conn.fetch(
                f"""SELECT
                    cl.cuenta_partner_odoo_id AS id,
                    rp.name AS nombre,
                    COALESCE(rp.state_name::text, '') AS depto_name,
                    COALESCE(cu.estado_comercial, 'ACTIVO') AS estado,
                    COALESCE(cu.is_active, true) AS is_active,
                    COALESCE(rp.phone::text, '') AS raw_phone,
                    COALESCE(rp.mobile::text, '') AS raw_mobile,
                    k.last_purchase_date,
                    COALESCE(k.qty_12m, 0)::bigint AS qty_12m,
                    COALESCE(k.orders_12m, 0)::bigint AS orders_12m,
                    COALESCE(k.qty_total, 0)::bigint AS qty_total,
                    COALESCE(k.orders_total, 0)::bigint AS orders_total,
                    CASE WHEN (COALESCE(k.qty_ytd_p1, 0) + COALESCE(k.qty_ytd_p2, 0)) > 0
                         THEN (COALESCE(k.qty_ytd_cur, 0)::float
                               / ((COALESCE(k.qty_ytd_p1, 0) + COALESCE(k.qty_ytd_p2, 0))::float / 2.0)) - 1.0
                         ELSE NULL END AS pct_vs_avg_ytd,
                    k.tienda
                {base_from}
                {where}
                ORDER BY {order_col} {order_dir} {nulls}
                LIMIT ${len(data_params)-1} OFFSET ${len(data_params)}""",
                *data_params
            )
            result_rows = records_to_list(rows)

            for r in result_rows:
                # Format dates
                if r.get('last_purchase_date'):
                    r['last_purchase_date'] = str(r['last_purchase_date'])
                # Format pct
                if r.get('pct_vs_avg_ytd') is not None:
                    r['pct_vs_avg_ytd'] = round(r['pct_vs_avg_ytd'], 4)
                # Phone normalization
                _apply_phone(r)

            return {"rows": result_rows, "total_rows": count, "page": page, "limit": limit}
        except Exception as e:
            import traceback
            logger.error(f"Error fetching cuentas list: {e}\n{traceback.format_exc()}")
            return {"rows": [], "total_rows": 0, "page": page, "limit": limit, "error": str(e)}


@cuentas_router.post("/refresh-kpis")
async def refresh_cuenta_kpis(user=Depends(get_current_user)):
    """Refresh the materialized view for directory KPIs."""
    p = await get_pool()
    async with p.acquire() as conn:
        await conn.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY crm.mv_cuenta_sales_kpi")
    return {"ok": True, "message": "KPIs actualizados"}



@cuentas_router.get("/list/filter-options")
async def get_cuentas_filter_options(user=Depends(get_current_user)):
    """Get distinct filter values for the toolbar dropdowns."""
    p = await get_pool()
    async with p.acquire() as conn:
        try:
            ciudades = [r['state_name'] for r in await conn.fetch("""
                SELECT DISTINCT rp.state_name::text AS state_name
                FROM crm.v_cuentas_libres cl
                JOIN odoo.res_partner rp ON rp.odoo_id = cl.cuenta_partner_odoo_id AND rp.company_key='GLOBAL'
                WHERE rp.state_name IS NOT NULL AND btrim(rp.state_name::text) <> ''
                ORDER BY state_name
            """)]
            asignados = [r['asignado_a'] for r in await conn.fetch("""
                SELECT DISTINCT cu.asignado_a
                FROM crm.cuenta cu
                WHERE cu.asignado_a IS NOT NULL AND btrim(cu.asignado_a) <> ''
                ORDER BY cu.asignado_a
            """)]
            tiendas = [r['x_nombre'] for r in await conn.fetch("""
                SELECT DISTINCT x_nombre
                FROM odoo.stock_location
                WHERE company_key = 'GLOBAL' AND x_nombre IS NOT NULL AND btrim(x_nombre) <> ''
                  AND COALESCE(active, true) = true AND usage = 'internal'
                ORDER BY x_nombre
            """)]
            tiendas.append("Sin tienda")
            return {"ciudades": ciudades, "asignados": asignados, "tiendas": tiendas}
        except Exception as e:
            logger.error(f"Error fetching filter options: {e}")
            return {"ciudades": [], "asignados": []}


@cuentas_router.patch("/batch-active")
async def batch_toggle_cuentas_active(data: BatchToggleActiveInput, user=Depends(get_current_user)):
    """Batch activate/deactivate cuentas with cascade to contactos."""
    p = await get_pool()
    async with p.acquire() as conn:
        user_email = user.get("usuario", "unknown") if isinstance(user, dict) else "unknown"
        ids = [int(i) for i in data.ids]
        if not ids:
            return {"ok": True, "cuentas_affected": 0, "contactos_affected": 0}

        cuentas_affected = 0
        contactos_affected = 0

        if not data.is_active:
            reason = data.reason or 'MANUAL'
            for oid in ids:
                await conn.execute(
                    "INSERT INTO crm.cuenta (cuenta_partner_odoo_id) VALUES ($1) ON CONFLICT DO NOTHING", oid
                )
            res = await conn.execute("""
                UPDATE crm.cuenta SET is_active = false, manual_inactive = true,
                    inactive_reason = $2, inactive_at = now(), inactive_by = $3, updated_at = now()
                WHERE cuenta_partner_odoo_id = ANY($1) AND is_active = true
            """, ids, reason, user_email)
            cuentas_affected = int(res.split()[-1]) if res else 0

            res2 = await conn.execute("""
                UPDATE crm.contacto SET is_active = false, manual_inactive = true,
                    inactive_reason = 'CASCADE_ACCOUNT', inactive_at = now(), inactive_by = $2, updated_at = now()
                WHERE cuenta_partner_odoo_id = ANY($1) AND is_active = true
            """, ids, user_email)
            contactos_affected = int(res2.split()[-1]) if res2 else 0
        else:
            res = await conn.execute("""
                UPDATE crm.cuenta SET is_active = true, manual_inactive = false,
                    inactive_reason = NULL, inactive_at = NULL, inactive_by = NULL, updated_at = now()
                WHERE cuenta_partner_odoo_id = ANY($1) AND is_active = false
            """, ids)
            cuentas_affected = int(res.split()[-1]) if res else 0

            res2 = await conn.execute("""
                UPDATE crm.contacto SET is_active = true, manual_inactive = false,
                    inactive_reason = NULL, inactive_at = NULL, inactive_by = NULL, updated_at = now()
                WHERE cuenta_partner_odoo_id = ANY($1) AND is_active = false
                    AND inactive_reason IN ('CASCADE_ACCOUNT', 'CASCADE_CONTACT')
            """, ids)
            contactos_affected = int(res2.split()[-1]) if res2 else 0

        return {"ok": True, "is_active": data.is_active,
                "cuentas_affected": cuentas_affected, "contactos_affected": contactos_affected}


@cuentas_router.get("/{cuenta_id}/header-metrics")
async def get_cuenta_header_metrics(cuenta_id: str, user=Depends(get_current_user)):
    """Compact header metrics for the detail panel."""
    p = await get_pool()
    async with p.acquire() as conn:
        partner_ids, odoo_id = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return {"last_purchase_date": None, "days_since_last_purchase": None,
                    "sales_12m_amount": 0, "orders_12m_count": 0}
        row = await conn.fetchrow(f"""
            SELECT MAX(po.date_order) AS last_purchase_date,
                   CASE WHEN MAX(po.date_order) IS NOT NULL
                        THEN (CURRENT_DATE - MAX(po.date_order)::date)::int
                        ELSE NULL END AS days_since_last_purchase,
                   COALESCE(SUM(CASE WHEN po.date_order >= CURRENT_DATE - 365 THEN pol.price_subtotal ELSE 0 END), 0) AS sales_12m_amount,
                   COUNT(DISTINCT CASE WHEN po.date_order >= CURRENT_DATE - 365 THEN po.odoo_id END) AS orders_12m_count
            FROM odoo.pos_order_line pol
            JOIN odoo.pos_order po ON pol.order_id = po.odoo_id
            {_OVERRIDE_JOIN}
            {_CATALOG_JOIN}
            WHERE {_EFFECTIVE_PARTNER} = ANY($1)
              AND COALESCE(po.is_cancel, false) = false
              AND COALESCE(po.order_cancel, false) = false
              AND COALESCE(po.reserva, false) = false
              {_CATALOG_FILTER}
        """, partner_ids)
        return {
            "last_purchase_date": str(row['last_purchase_date']) if row['last_purchase_date'] else None,
            "days_since_last_purchase": int(row['days_since_last_purchase']) if row['days_since_last_purchase'] is not None else None,
            "sales_12m_amount": float(row['sales_12m_amount']),
            "orders_12m_count": int(row['orders_12m_count']),
        }


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


@cuentas_router.patch("/{cuenta_id}/active")
async def toggle_cuenta_active(cuenta_id: str, data: ToggleActiveInput, user=Depends(get_current_user)):
    """Activate/deactivate a cuenta with cascade to contactos."""
    p = await get_pool()
    async with p.acquire() as conn:
        odoo_id = int(cuenta_id)
        user_email = user.get("usuario", "unknown") if isinstance(user, dict) else "unknown"

        await conn.execute(
            "INSERT INTO crm.cuenta (cuenta_partner_odoo_id) VALUES ($1) ON CONFLICT DO NOTHING", odoo_id
        )
        cuenta = await conn.fetchrow("SELECT id FROM crm.cuenta WHERE cuenta_partner_odoo_id = $1", odoo_id)
        if not cuenta:
            raise HTTPException(404, "Cuenta no encontrada")

        if not data.is_active:
            # DEACTIVATE cuenta
            await conn.execute("""
                UPDATE crm.cuenta SET is_active = false, manual_inactive = true,
                    inactive_reason = $2, inactive_at = now(), inactive_by = $3, updated_at = now()
                WHERE cuenta_partner_odoo_id = $1
            """, odoo_id, data.reason or 'MANUAL', user_email)

            # CASCADE: deactivate all contactos of this cuenta
            affected = await conn.execute("""
                UPDATE crm.contacto SET is_active = false, manual_inactive = true,
                    inactive_reason = 'CASCADE_ACCOUNT', inactive_at = now(), inactive_by = $2, updated_at = now()
                WHERE cuenta_partner_odoo_id = $1 AND is_active = true
            """, odoo_id, user_email)
            cascade_count = int(affected.split()[-1]) if affected else 0

            return {"ok": True, "is_active": False, "contactos_affected": cascade_count}
        else:
            # ACTIVATE cuenta
            await conn.execute("""
                UPDATE crm.cuenta SET is_active = true, manual_inactive = false,
                    inactive_reason = NULL, inactive_at = NULL, inactive_by = NULL, updated_at = now()
                WHERE cuenta_partner_odoo_id = $1
            """, odoo_id)

            # CASCADE: reactivate contactos that were deactivated ONLY by cascade (not manually by user)
            affected = await conn.execute("""
                UPDATE crm.contacto SET is_active = true, manual_inactive = false,
                    inactive_reason = NULL, inactive_at = NULL, inactive_by = NULL, updated_at = now()
                WHERE cuenta_partner_odoo_id = $1 AND is_active = false
                    AND inactive_reason IN ('CASCADE_ACCOUNT', 'CASCADE_CONTACT')
            """, odoo_id)
            cascade_count = int(affected.split()[-1]) if affected else 0

            return {"ok": True, "is_active": True, "contactos_reactivated": cascade_count}


@cuentas_router.get("/{cuenta_id}/contactos/count-active")
async def get_cuenta_contactos_active_count(cuenta_id: str, user=Depends(get_current_user)):
    """Count active contactos for cascade confirmation UI."""
    p = await get_pool()
    async with p.acquire() as conn:
        odoo_id = int(cuenta_id)
        total = await conn.fetchval(
            "SELECT COUNT(*) FROM crm.contacto WHERE cuenta_partner_odoo_id = $1", odoo_id
        )
        active = await conn.fetchval(
            "SELECT COUNT(*) FROM crm.contacto WHERE cuenta_partner_odoo_id = $1 AND is_active = true", odoo_id
        )
        return {"total": total or 0, "active": active or 0}


@cuentas_router.get("/{cuenta_id}/contactos")
async def get_cuenta_contactos(cuenta_id: str, include_inactive: bool = False, user=Depends(get_current_user)):
    """Get all partners whose v_partner_account_final.cuenta = this cuenta"""
    p = await get_pool()
    async with p.acquire() as conn:
        odoo_id = int(cuenta_id)

        inactive_filter = "" if include_inactive else "AND COALESCE(c.is_active, true) = true"

        rows = await conn.fetch(f"""
            SELECT
                rp.odoo_id as contacto_partner_odoo_id,
                rp.name as partner_nombre,
                COALESCE(rp.phone::text, '') as partner_phone,
                COALESCE(rp.mobile::text, '') as partner_mobile,
                COALESCE(c.whatsapp, '') as whatsapp,
                COALESCE(c.rol, '') as rol,
                COALESCE(c.is_active, true) as is_active,
                COALESCE(c.manual_inactive, false) as manual_inactive,
                c.inactive_reason,
                c.inactive_at,
                CASE WHEN rp.odoo_id = $1 THEN true ELSE false END as is_principal
            FROM crm.v_partner_account_final m
            JOIN odoo.res_partner rp ON rp.odoo_id = m.contacto_partner_odoo_id AND rp.company_key='GLOBAL'
            LEFT JOIN crm.contacto c ON c.contacto_partner_odoo_id = m.contacto_partner_odoo_id
            WHERE m.cuenta_partner_odoo_id = $1
              AND m.contacto_partner_odoo_id <> $1
              {inactive_filter}
            ORDER BY rp.name
        """, odoo_id)

        return records_to_list(rows)


async def _get_cuenta_partner_ids(conn, cuenta_id: str):
    """Shared helper: ensure cuenta exists, return (partner_ids, odoo_id) or ([], odoo_id)."""
    odoo_id = int(cuenta_id)
    await conn.execute("""
        INSERT INTO crm.cuenta (cuenta_partner_odoo_id)
        VALUES ($1) ON CONFLICT (cuenta_partner_odoo_id) DO NOTHING
    """, odoo_id)
    cuenta_row = await conn.fetchrow(
        "SELECT id FROM crm.cuenta WHERE cuenta_partner_odoo_id = $1", odoo_id
    )
    if not cuenta_row:
        return [], odoo_id
    rows = await conn.fetch(
        "SELECT DISTINCT partner_id FROM crm.v_cuenta_partners WHERE cuenta_id = $1",
        cuenta_row['id']
    )
    return [r['partner_id'] for r in rows], odoo_id


def _cuenta_where(params, partner_ids, doc_tipo, fecha_desde="", fecha_hasta=""):
    """Build WHERE clause for cuenta ventas queries."""
    params.append(partner_ids)
    params.append(doc_tipo)
    where = f"WHERE partner_id = ANY(${len(params)-1}) AND doc_tipo = ${len(params)}"
    if fecha_desde:
        params.append(fecha_desde)
        where += f" AND fecha >= ${len(params)}::text::timestamptz"
    if fecha_hasta:
        params.append(fecha_hasta + "T23:59:59")
        where += f" AND fecha <= ${len(params)}::text::timestamptz"
    return where



# Optimized: query pos_order directly for cuenta-level endpoints (faster than scanning the full view)
_OVERRIDE_JOIN = "LEFT JOIN crm.pos_order_partner_override ov_po ON ov_po.order_id = po.odoo_id AND ov_po.active = true"
_EFFECTIVE_PARTNER = "COALESCE(ov_po.new_owner_partner_id, po.partner_id)"

_POS_CUENTA_BASE = """
    FROM odoo.pos_order po
    LEFT JOIN crm.pos_order_partner_override ov_po ON ov_po.order_id = po.odoo_id AND ov_po.active = true
    WHERE COALESCE(ov_po.new_owner_partner_id, po.partner_id) = ANY($1)
      AND COALESCE(po.is_cancel, false) = false
      AND COALESCE(po.order_cancel, false) = false
"""
_POS_SALE_FILTER = " AND (COALESCE(po.reserva, false) = false)"
_POS_RESERVA_FILTER = " AND (COALESCE(po.reserva, false) = true AND COALESCE(po.reserva_use_id, 0) = 0)"

_CATALOG_JOIN = """
    JOIN odoo.v_product_variant_flat vv ON vv.product_product_id = pol.product_id AND vv.company_key = 'GLOBAL'
    JOIN odoo.product_template pt ON pt.odoo_id = vv.product_tmpl_id AND pt.company_key = 'GLOBAL'"""
_CATALOG_FILTER = """
    AND pol.product_id IS NOT NULL
    AND pt.sale_ok = true AND pt.purchase_ok = false
    AND pt.name NOT ILIKE '%correa%'
    AND pt.name NOT ILIKE '%saco%'
    AND pt.name NOT ILIKE '%bolsa%'
    AND pt.name NOT ILIKE '%probador%'
    AND pt.name NOT ILIKE '%paneton%'
    AND pt.name NOT ILIKE '%publicitario%'"""

_TIENDA_JOIN = """LEFT JOIN odoo.stock_location sl_tienda
    ON sl_tienda.odoo_id = po.location_id AND sl_tienda.company_key = 'GLOBAL'
    AND sl_tienda.x_nombre IS NOT NULL AND btrim(sl_tienda.x_nombre) <> ''"""

_TIENDA_EXPR = """COALESCE(
                    sl_tienda.x_nombre,
                    CASE SPLIT_PART(po.name, '/', 1)
                        WHEN 'BOSH GAMARRA' THEN 'BOOSH'
                        WHEN 'G209' THEN 'GM209'
                        WHEN 'GaleriaAzul' THEN 'AZUL'
                        WHEN 'Gamarra207A' THEN 'GM207'
                        WHEN 'Grau 238' THEN 'GR238'
                        WHEN 'Grau238' THEN 'GR238'
                        WHEN 'Grau 555-' THEN 'GR55'
                        WHEN 'Sebastian Barranca 1556' THEN 'GM218'
                        WHEN 'Venta Taller' THEN 'TALLER'
                        WHEN 'Zapaton' THEN 'ZAP'
                        ELSE NULL
                    END
                ) AS tienda"""


@cuentas_router.get("/{cuenta_id}/ventas/metrics")
async def get_cuenta_ventas_metrics(
    cuenta_id: str,
    doc_tipo: str = "SALE",
    fecha_desde: str = "",
    fecha_hasta: str = "",
    user=Depends(get_current_user)
):
    empty = {"orders_count": 0, "qty_total": 0,
             "last_order_date": None, "first_order_date": None}
    p = await get_pool()
    async with p.acquire() as conn:
        partner_ids, odoo_id = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return empty
        params = [partner_ids]
        doc_filter = _POS_RESERVA_FILTER if doc_tipo == "RESERVA" else _POS_SALE_FILTER
        extra = ""
        if fecha_desde:
            params.append(fecha_desde)
            extra += f" AND po.date_order >= ${len(params)}::text::timestamptz"
        if fecha_hasta:
            params.append(fecha_hasta + "T23:59:59")
            extra += f" AND po.date_order <= ${len(params)}::text::timestamptz"
        row = await conn.fetchrow(f"""
            SELECT COUNT(DISTINCT po.odoo_id) AS orders_count,
                   COALESCE(SUM(pol.qty), 0) AS qty_total,
                   MAX(po.date_order) AS last_order_date,
                   MIN(po.date_order) AS first_order_date
            FROM odoo.pos_order_line pol
            JOIN odoo.pos_order po ON pol.order_id = po.odoo_id
            {_OVERRIDE_JOIN}
            {_CATALOG_JOIN}
            WHERE {_EFFECTIVE_PARTNER} = ANY($1)
              AND COALESCE(po.is_cancel, false) = false
              AND COALESCE(po.order_cancel, false) = false
              {_CATALOG_FILTER}
              {doc_filter} {extra}
        """, *params)
        return {
            "orders_count": row['orders_count'],
            "qty_total": float(row['qty_total']),
            "last_order_date": str(row['last_order_date']) if row['last_order_date'] else None,
            "first_order_date": str(row['first_order_date']) if row['first_order_date'] else None,
        }


@cuentas_router.get("/{cuenta_id}/ventas/orders")
async def get_cuenta_ventas_orders(
    cuenta_id: str,
    doc_tipo: str = "SALE",
    fecha_desde: str = "",
    fecha_hasta: str = "",
    page: int = 1,
    limit: int = 50,
    user=Depends(get_current_user)
):
    p = await get_pool()
    async with p.acquire() as conn:
        partner_ids, odoo_id = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return {"metrics": {"orders_count": 0, "qty_total": 0},
                    "rows": [], "page": page, "limit": limit, "has_next": False}
        params = [partner_ids]
        doc_filter = _POS_RESERVA_FILTER if doc_tipo == "RESERVA" else _POS_SALE_FILTER
        extra = ""
        if fecha_desde:
            params.append(fecha_desde)
            extra += f" AND po.date_order >= ${len(params)}::text::timestamptz"
        if fecha_hasta:
            params.append(fecha_hasta + "T23:59:59")
            extra += f" AND po.date_order <= ${len(params)}::text::timestamptz"

        met = await conn.fetchrow(f"""
            SELECT COUNT(DISTINCT po.odoo_id) AS orders_count
            FROM odoo.pos_order_line pol
            JOIN odoo.pos_order po ON pol.order_id = po.odoo_id
            {_OVERRIDE_JOIN}
            {_CATALOG_JOIN}
            WHERE {_EFFECTIVE_PARTNER} = ANY($1)
              AND COALESCE(po.is_cancel, false) = false
              AND COALESCE(po.order_cancel, false) = false
              {_CATALOG_FILTER}
              {doc_filter} {extra}
        """, *params)

        offset = (page - 1) * limit
        p2 = list(params)
        p2.append(limit + 1)
        p2.append(offset)
        rows = records_to_list(await conn.fetch(f"""
            SELECT po.odoo_id AS order_id, po.name AS order_name,
                   po.date_order, po.state, po.amount_total,
                   {_EFFECTIVE_PARTNER} AS owner_partner_id,
                   rp.name AS owner_partner_name,
                   (ov_po.order_id IS NOT NULL) AS has_override,
                   CASE WHEN ov_po.order_id IS NOT NULL THEN rp_orig.name ELSE NULL END AS original_partner_name,
                   agg.qty_total,
                   agg.lines_count,
                   {_TIENDA_EXPR}
            FROM odoo.pos_order po
            {_OVERRIDE_JOIN}
            {_TIENDA_JOIN}
            JOIN (
                SELECT pol2.order_id, COALESCE(SUM(pol2.qty), 0) AS qty_total, COUNT(*) AS lines_count
                FROM odoo.pos_order_line pol2
                JOIN odoo.v_product_variant_flat vv2 ON vv2.product_product_id = pol2.product_id AND vv2.company_key = 'GLOBAL'
                JOIN odoo.product_template pt2 ON pt2.odoo_id = vv2.product_tmpl_id AND pt2.company_key = 'GLOBAL'
                WHERE pol2.product_id IS NOT NULL
                  AND pt2.sale_ok = true AND pt2.purchase_ok = false
                  AND pt2.name NOT ILIKE '%correa%'
                  AND pt2.name NOT ILIKE '%saco%'
                  AND pt2.name NOT ILIKE '%bolsa%'
                  AND pt2.name NOT ILIKE '%probador%'
                  AND pt2.name NOT ILIKE '%paneton%'
                  AND pt2.name NOT ILIKE '%publicitario%'
                GROUP BY pol2.order_id
            ) agg ON agg.order_id = po.odoo_id
            LEFT JOIN odoo.res_partner rp ON rp.odoo_id = {_EFFECTIVE_PARTNER} AND rp.company_key = 'GLOBAL'
            LEFT JOIN odoo.res_partner rp_orig ON ov_po.order_id IS NOT NULL AND rp_orig.odoo_id = po.partner_id AND rp_orig.company_key = 'GLOBAL'
            WHERE {_EFFECTIVE_PARTNER} = ANY($1)
              AND COALESCE(po.is_cancel, false) = false
              AND COALESCE(po.order_cancel, false) = false
              {doc_filter} {extra}
            ORDER BY po.date_order DESC, po.odoo_id DESC
            LIMIT ${len(p2)-1} OFFSET ${len(p2)}
        """, *p2))
        has_next = len(rows) > limit
        return {
            "metrics": {"orders_count": met['orders_count'], "qty_total": 0},
            "rows": rows[:limit], "page": page, "limit": limit, "has_next": has_next,
        }


@cuentas_router.get("/{cuenta_id}/ventas/clasificacion")
async def get_cuenta_ventas_clasificacion(
    cuenta_id: str,
    fecha_desde: str = "",
    fecha_hasta: str = "",
    marca: str = "",
    tipo: str = "",
    entalle: str = "",
    sort_by: str = "ultima_fecha_compra",
    sort_dir: str = "desc",
    top: int = 200,
    user=Depends(get_current_user)
):
    p = await get_pool()
    async with p.acquire() as conn:
        partner_ids, odoo_id = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return {"rows": []}
        params = [partner_ids]
        extra = ""
        if fecha_desde:
            params.append(fecha_desde)
            extra += f" AND po.date_order >= ${len(params)}::text::timestamptz"
        if fecha_hasta:
            params.append(fecha_hasta + "T23:59:59")
            extra += f" AND po.date_order <= ${len(params)}::text::timestamptz"
        if marca:
            params.append(marca)
            extra += f" AND pt.marca = ${len(params)}"
        if tipo:
            params.append(tipo)
            extra += f" AND pt.tipo = ${len(params)}"
        if entalle:
            params.append(entalle)
            extra += f" AND pt.entalle = ${len(params)}"
        allowed_sort = {"ultima_fecha_compra", "dias_sin_comprar", "ventas", "cantidad", "compras"}
        col = sort_by if sort_by in allowed_sort else "ultima_fecha_compra"
        direction = "ASC" if sort_dir.lower() == "asc" else "DESC"
        nulls = "NULLS LAST" if direction == "DESC" else "NULLS FIRST"
        params.append(top)
        rows = records_to_list(await conn.fetch(f"""
            SELECT COALESCE(pt.marca, '') AS marca,
                   COALESCE(pt.tipo, '') AS tipo,
                   COALESCE(pt.entalle, '') AS entalle,
                   MAX(po.date_order) AS ultima_fecha_compra,
                   (CURRENT_DATE - MAX(po.date_order)::date)::int AS dias_sin_comprar,
                   COALESCE(SUM(pol.qty), 0) AS cantidad,
                   COALESCE(SUM(pol.price_subtotal), 0) AS ventas,
                   COUNT(DISTINCT po.odoo_id) AS compras
            FROM odoo.pos_order_line pol
            JOIN odoo.pos_order po ON pol.order_id = po.odoo_id
            {_OVERRIDE_JOIN}
            {_CATALOG_JOIN}
            WHERE {_EFFECTIVE_PARTNER} = ANY($1)
              AND COALESCE(po.is_cancel, false) = false
              AND COALESCE(po.order_cancel, false) = false
              AND COALESCE(po.reserva, false) = false
              {_CATALOG_FILTER}
              {extra}
            GROUP BY pt.marca, pt.tipo, pt.entalle
            ORDER BY {col} {direction} {nulls}
            LIMIT ${len(params)}
        """, *params))
        return {"rows": rows}


@cuentas_router.get("/{cuenta_id}/ventas/clasificacion/detail")
async def get_cuenta_ventas_clasificacion_detail(
    cuenta_id: str,
    marca: str = "",
    tipo: str = "",
    entalle: str = "",
    fecha_desde: str = "",
    fecha_hasta: str = "",
    page: int = 1,
    limit: int = 50,
    user=Depends(get_current_user)
):
    p = await get_pool()
    async with p.acquire() as conn:
        partner_ids, odoo_id = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return {"rows": [], "page": page, "limit": limit, "has_next": False}
        params = [partner_ids]
        extra = ""
        if fecha_desde:
            params.append(fecha_desde)
            extra += f" AND po.date_order >= ${len(params)}::text::timestamptz"
        if fecha_hasta:
            params.append(fecha_hasta + "T23:59:59")
            extra += f" AND po.date_order <= ${len(params)}::text::timestamptz"
        # Match classification (use IS NOT DISTINCT FROM to handle NULLs)
        if marca:
            params.append(marca)
            extra += f" AND COALESCE(pt.marca, '') = ${len(params)}"
        else:
            extra += " AND COALESCE(pt.marca, '') = ''"
        if tipo:
            params.append(tipo)
            extra += f" AND COALESCE(pt.tipo, '') = ${len(params)}"
        else:
            extra += " AND COALESCE(pt.tipo, '') = ''"
        if entalle:
            params.append(entalle)
            extra += f" AND COALESCE(pt.entalle, '') = ${len(params)}"
        else:
            extra += " AND COALESCE(pt.entalle, '') = ''"

        offset = (page - 1) * limit
        params.append(limit + 1)
        params.append(offset)
        rows = records_to_list(await conn.fetch(f"""
            SELECT pol.odoo_id AS line_id,
                   po.odoo_id AS order_id, po.name AS order_name,
                   po.date_order AS fecha,
                   COALESCE(pt.name, '') AS modelo_display,
                   vv.talla, vv.color, vv.barcode,
                   pol.qty, pol.price_unit, pol.price_subtotal AS subtotal
            FROM odoo.pos_order_line pol
            JOIN odoo.pos_order po ON pol.order_id = po.odoo_id
            {_OVERRIDE_JOIN}
            {_CATALOG_JOIN}
            WHERE {_EFFECTIVE_PARTNER} = ANY($1)
              AND COALESCE(po.is_cancel, false) = false
              AND COALESCE(po.order_cancel, false) = false
              AND COALESCE(po.reserva, false) = false
              {_CATALOG_FILTER}
              {extra}
            ORDER BY po.date_order DESC, pol.odoo_id DESC
            LIMIT ${len(params)-1} OFFSET ${len(params)}
        """, *params))
        has_next = len(rows) > limit
        return {"rows": rows[:limit], "page": page, "limit": limit, "has_next": has_next}


@cuentas_router.get("/{cuenta_id}/ventas/clasificacion/orders")
async def get_cuenta_ventas_clasificacion_orders(
    cuenta_id: str,
    marca: str = "",
    tipo: str = "",
    entalle: str = "",
    fecha_desde: str = "",
    fecha_hasta: str = "",
    page: int = 1,
    limit: int = 50,
    user=Depends(get_current_user)
):
    p = await get_pool()
    async with p.acquire() as conn:
        partner_ids, odoo_id = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return {"rows": [], "page": page, "limit": limit, "has_next": False}
        params = [partner_ids]
        extra = ""
        if fecha_desde:
            params.append(fecha_desde)
            extra += f" AND po.date_order >= ${len(params)}::text::timestamptz"
        if fecha_hasta:
            params.append(fecha_hasta + "T23:59:59")
            extra += f" AND po.date_order <= ${len(params)}::text::timestamptz"
        if marca:
            params.append(marca)
            extra += f" AND COALESCE(pt.marca, '') = ${len(params)}"
        else:
            extra += " AND COALESCE(pt.marca, '') = ''"
        if tipo:
            params.append(tipo)
            extra += f" AND COALESCE(pt.tipo, '') = ${len(params)}"
        else:
            extra += " AND COALESCE(pt.tipo, '') = ''"
        if entalle:
            params.append(entalle)
            extra += f" AND COALESCE(pt.entalle, '') = ${len(params)}"
        else:
            extra += " AND COALESCE(pt.entalle, '') = ''"

        offset = (page - 1) * limit
        params.append(limit + 1)
        params.append(offset)
        rows = records_to_list(await conn.fetch(f"""
            SELECT po.odoo_id AS order_id,
                   po.name AS order_name,
                   MAX(po.date_order) AS date_order,
                   SUM(pol.qty) AS qty_item,
                   SUM(pol.price_subtotal) AS ventas_item,
                   COUNT(*) AS lines_count
            FROM odoo.pos_order_line pol
            JOIN odoo.pos_order po ON pol.order_id = po.odoo_id
            {_OVERRIDE_JOIN}
            {_CATALOG_JOIN}
            WHERE {_EFFECTIVE_PARTNER} = ANY($1)
              AND COALESCE(po.is_cancel, false) = false
              AND COALESCE(po.order_cancel, false) = false
              AND COALESCE(po.reserva, false) = false
              {_CATALOG_FILTER}
              {extra}
            GROUP BY po.odoo_id, po.name
            ORDER BY MAX(po.date_order) DESC
            LIMIT ${len(params)-1} OFFSET ${len(params)}
        """, *params))
        has_next = len(rows) > limit
        return {"rows": rows[:limit], "page": page, "limit": limit, "has_next": has_next}


@cuentas_router.get("/{cuenta_id}/ventas/lines")
async def get_cuenta_ventas_lines(
    cuenta_id: str,
    doc_tipo: str = "SALE",
    fecha_desde: str = "",
    fecha_hasta: str = "",
    page: int = 1,
    limit: int = 50,
    user=Depends(get_current_user)
):
    p = await get_pool()
    async with p.acquire() as conn:
        partner_ids, odoo_id = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return {"rows": [], "page": page, "limit": limit, "has_next": False}
        params = [partner_ids]
        doc_filter = _POS_RESERVA_FILTER if doc_tipo == "RESERVA" else _POS_SALE_FILTER
        extra = ""
        if fecha_desde:
            params.append(fecha_desde)
            extra += f" AND po.date_order >= ${len(params)}::text::timestamptz"
        if fecha_hasta:
            params.append(fecha_hasta + "T23:59:59")
            extra += f" AND po.date_order <= ${len(params)}::text::timestamptz"

        offset = (page - 1) * limit
        p2 = list(params)
        p2.append(limit + 1)
        p2.append(offset)
        rows = records_to_list(await conn.fetch(f"""
            SELECT pol.odoo_id AS line_id,
                   po.odoo_id AS order_id, po.name AS order_name,
                   po.date_order AS fecha,
                   {_EFFECTIVE_PARTNER} AS owner_partner_id,
                   rp.name AS owner_partner_name,
                   (ov_po.order_id IS NOT NULL) AS has_override,
                   CASE WHEN ov_po.order_id IS NOT NULL THEN rp_orig.name ELSE NULL END AS original_partner_name,
                   pol.product_id AS product_product_id,
                   vv.product_tmpl_id,
                   COALESCE(pt.name, '') AS modelo_display,
                   pt.marca, pt.tipo, pt.entalle, pt.tela,
                   COALESCE(pt.hilo::text, '') AS hilo,
                   vv.talla, vv.color, vv.barcode,
                   pol.qty, pol.price_unit, pol.price_subtotal AS subtotal,
                   {_TIENDA_EXPR}
            FROM odoo.pos_order_line pol
            JOIN odoo.pos_order po ON pol.order_id = po.odoo_id
            {_OVERRIDE_JOIN}
            {_TIENDA_JOIN}
            LEFT JOIN odoo.res_partner rp ON rp.odoo_id = {_EFFECTIVE_PARTNER} AND rp.company_key = 'GLOBAL'
            LEFT JOIN odoo.res_partner rp_orig ON ov_po.order_id IS NOT NULL AND rp_orig.odoo_id = po.partner_id AND rp_orig.company_key = 'GLOBAL'
            {_CATALOG_JOIN}
            WHERE {_EFFECTIVE_PARTNER} = ANY($1)
              AND COALESCE(po.is_cancel, false) = false
              AND COALESCE(po.order_cancel, false) = false
              {_CATALOG_FILTER}
              {doc_filter} {extra}
            ORDER BY po.date_order DESC, pol.odoo_id DESC
            LIMIT ${len(p2)-1} OFFSET ${len(p2)}
        """, *p2))
        has_next = len(rows) > limit
        return {"rows": rows[:limit], "page": page, "limit": limit, "has_next": has_next}


# ── YoY (Year-over-Year) endpoints ──

_YOY_BASE = """
    FROM odoo.pos_order_line pol
    JOIN odoo.pos_order po ON pol.order_id = po.odoo_id
    LEFT JOIN crm.pos_order_partner_override ov_po ON ov_po.order_id = po.odoo_id AND ov_po.active = true
    {catalog_join}
    WHERE COALESCE(ov_po.new_owner_partner_id, po.partner_id) = ANY($1)
      AND COALESCE(po.is_cancel, false) = false
      AND COALESCE(po.order_cancel, false) = false
      AND COALESCE(po.reserva, false) = false
      {catalog_filter}
      AND EXTRACT(YEAR FROM po.date_order) IN ($2, $3)
"""


def _yoy_month_extra(params, from_month, to_month):
    extra = ""
    if from_month:
        params.append(int(from_month))
        extra += f" AND EXTRACT(MONTH FROM po.date_order) >= ${len(params)}"
    if to_month:
        params.append(int(to_month))
        extra += f" AND EXTRACT(MONTH FROM po.date_order) <= ${len(params)}"
    return extra


@cuentas_router.get("/{cuenta_id}/ventas/yoy/metrics")
async def get_yoy_metrics(
    cuenta_id: str,
    year_a: int = 0, year_b: int = 0,
    from_month: str = "", to_month: str = "",
    user=Depends(get_current_user)
):
    from datetime import date
    if not year_a:
        year_a = date.today().year
    if not year_b:
        year_b = year_a - 1
    p = await get_pool()
    async with p.acquire() as conn:
        partner_ids, _ = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            empty = {"ventas": 0, "unidades": 0, "compras": 0}
            return {"year_a": empty, "year_b": empty, "delta": {"ventas_pct": 0, "unidades_pct": 0, "compras_pct": 0}}
        params = [partner_ids, year_a, year_b]
        extra = _yoy_month_extra(params, from_month, to_month)
        row = await conn.fetchrow(f"""
            SELECT
              COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM po.date_order) = $2 THEN pol.price_subtotal ELSE 0 END), 0) AS ventas_a,
              COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM po.date_order) = $3 THEN pol.price_subtotal ELSE 0 END), 0) AS ventas_b,
              COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM po.date_order) = $2 THEN pol.qty ELSE 0 END), 0) AS unidades_a,
              COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM po.date_order) = $3 THEN pol.qty ELSE 0 END), 0) AS unidades_b,
              COUNT(DISTINCT CASE WHEN EXTRACT(YEAR FROM po.date_order) = $2 THEN po.odoo_id END) AS compras_a,
              COUNT(DISTINCT CASE WHEN EXTRACT(YEAR FROM po.date_order) = $3 THEN po.odoo_id END) AS compras_b
            {_YOY_BASE.format(catalog_join=_CATALOG_JOIN, catalog_filter=_CATALOG_FILTER)}
            {extra}
        """, *params)
        va, vb = float(row['ventas_a']), float(row['ventas_b'])
        ua, ub = float(row['unidades_a']), float(row['unidades_b'])
        ca, cb = int(row['compras_a']), int(row['compras_b'])
        def pct(a, b):
            return round((a - b) / b * 100, 1) if b else (100.0 if a else 0)
        return {
            "year_a": {"ventas": va, "unidades": ua, "compras": ca},
            "year_b": {"ventas": vb, "unidades": ub, "compras": cb},
            "delta": {"ventas_pct": pct(va, vb), "unidades_pct": pct(ua, ub), "compras_pct": pct(ca, cb)}
        }


@cuentas_router.get("/{cuenta_id}/ventas/yoy/by-month")
async def get_yoy_by_month(
    cuenta_id: str,
    year_a: int = 0, year_b: int = 0,
    from_month: str = "", to_month: str = "",
    user=Depends(get_current_user)
):
    from datetime import date
    if not year_a:
        year_a = date.today().year
    if not year_b:
        year_b = year_a - 1
    p = await get_pool()
    async with p.acquire() as conn:
        partner_ids, _ = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return {"months": []}
        params = [partner_ids, year_a, year_b]
        extra = _yoy_month_extra(params, from_month, to_month)
        rows = records_to_list(await conn.fetch(f"""
            SELECT
              EXTRACT(MONTH FROM po.date_order)::int AS month,
              COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM po.date_order) = $2 THEN pol.price_subtotal ELSE 0 END), 0) AS ventas_a,
              COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM po.date_order) = $3 THEN pol.price_subtotal ELSE 0 END), 0) AS ventas_b,
              COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM po.date_order) = $2 THEN pol.qty ELSE 0 END), 0) AS unidades_a,
              COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM po.date_order) = $3 THEN pol.qty ELSE 0 END), 0) AS unidades_b,
              COUNT(DISTINCT CASE WHEN EXTRACT(YEAR FROM po.date_order) = $2 THEN po.odoo_id END) AS compras_a,
              COUNT(DISTINCT CASE WHEN EXTRACT(YEAR FROM po.date_order) = $3 THEN po.odoo_id END) AS compras_b
            {_YOY_BASE.format(catalog_join=_CATALOG_JOIN, catalog_filter=_CATALOG_FILTER)}
            {extra}
            GROUP BY EXTRACT(MONTH FROM po.date_order)
            ORDER BY month
        """, *params))
        return {"months": rows}


@cuentas_router.get("/{cuenta_id}/ventas/yoy/by-item")
async def get_yoy_by_item(
    cuenta_id: str,
    year_a: int = 0, year_b: int = 0,
    from_month: str = "", to_month: str = "",
    sort_by: str = "ventas_a", sort_dir: str = "desc",
    top: int = 300,
    user=Depends(get_current_user)
):
    from datetime import date
    if not year_a:
        year_a = date.today().year
    if not year_b:
        year_b = year_a - 1
    p = await get_pool()
    async with p.acquire() as conn:
        partner_ids, _ = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return {"rows": []}
        params = [partner_ids, year_a, year_b]
        extra = _yoy_month_extra(params, from_month, to_month)
        allowed = {"ventas_a", "ventas_b", "var_abs", "unidades_a", "unidades_b", "compras_a", "compras_b"}
        col = sort_by if sort_by in allowed else "ventas_a"
        direction = "ASC" if sort_dir.lower() == "asc" else "DESC"
        params.append(top)
        rows = records_to_list(await conn.fetch(f"""
            SELECT
              COALESCE(pt.marca, '') AS marca,
              COALESCE(pt.tipo, '') AS tipo,
              COALESCE(pt.entalle, '') AS entalle,
              COALESCE(pt.tela, '') AS tela,
              COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM po.date_order) = $2 THEN pol.price_subtotal ELSE 0 END), 0) AS ventas_a,
              COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM po.date_order) = $3 THEN pol.price_subtotal ELSE 0 END), 0) AS ventas_b,
              COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM po.date_order) = $2 THEN pol.price_subtotal ELSE 0 END), 0)
                - COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM po.date_order) = $3 THEN pol.price_subtotal ELSE 0 END), 0) AS var_abs,
              COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM po.date_order) = $2 THEN pol.qty ELSE 0 END), 0) AS unidades_a,
              COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM po.date_order) = $3 THEN pol.qty ELSE 0 END), 0) AS unidades_b,
              COUNT(DISTINCT CASE WHEN EXTRACT(YEAR FROM po.date_order) = $2 THEN po.odoo_id END) AS compras_a,
              COUNT(DISTINCT CASE WHEN EXTRACT(YEAR FROM po.date_order) = $3 THEN po.odoo_id END) AS compras_b
            {_YOY_BASE.format(catalog_join=_CATALOG_JOIN, catalog_filter=_CATALOG_FILTER)}
            {extra}
            GROUP BY pt.marca, pt.tipo, pt.entalle, pt.tela
            ORDER BY {col} {direction} NULLS LAST
            LIMIT ${len(params)}
        """, *params))
        # compute var_pct in Python
        for r in rows:
            vb = r.get("ventas_b", 0)
            va = r.get("ventas_a", 0)
            r["var_pct"] = round((va - vb) / vb * 100, 1) if vb else (100.0 if va else 0)
        return {"rows": rows}


@cuentas_router.get("/{cuenta_id}/ventas/yoy/item-orders")
async def get_yoy_item_orders(
    cuenta_id: str,
    year: int = 0,
    marca: str = "", tipo: str = "", entalle: str = "", tela: str = "",
    page: int = 1, limit: int = 50,
    user=Depends(get_current_user)
):
    from datetime import date
    if not year:
        year = date.today().year
    p = await get_pool()
    async with p.acquire() as conn:
        partner_ids, _ = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return {"rows": [], "page": page, "limit": limit, "has_next": False}
        params = [partner_ids, year]
        extra = ""
        if marca:
            params.append(marca)
            extra += f" AND COALESCE(pt.marca, '') = ${len(params)}"
        else:
            extra += " AND COALESCE(pt.marca, '') = ''"
        if tipo:
            params.append(tipo)
            extra += f" AND COALESCE(pt.tipo, '') = ${len(params)}"
        else:
            extra += " AND COALESCE(pt.tipo, '') = ''"
        if entalle:
            params.append(entalle)
            extra += f" AND COALESCE(pt.entalle, '') = ${len(params)}"
        else:
            extra += " AND COALESCE(pt.entalle, '') = ''"
        if tela:
            params.append(tela)
            extra += f" AND COALESCE(pt.tela, '') = ${len(params)}"
        else:
            extra += " AND COALESCE(pt.tela, '') = ''"
        offset = (page - 1) * limit
        params.append(limit + 1)
        params.append(offset)
        rows = records_to_list(await conn.fetch(f"""
            SELECT po.odoo_id AS order_id,
                   po.name AS order_name,
                   MAX(po.date_order) AS date_order,
                   SUM(pol.qty) AS qty_item,
                   SUM(pol.price_subtotal) AS ventas_item,
                   COUNT(*) AS lines_count
            FROM odoo.pos_order_line pol
            JOIN odoo.pos_order po ON pol.order_id = po.odoo_id
            {_OVERRIDE_JOIN}
            {_CATALOG_JOIN}
            WHERE {_EFFECTIVE_PARTNER} = ANY($1)
              AND COALESCE(po.is_cancel, false) = false
              AND COALESCE(po.order_cancel, false) = false
              AND COALESCE(po.reserva, false) = false
              {_CATALOG_FILTER}
              AND EXTRACT(YEAR FROM po.date_order) = $2
              {extra}
            GROUP BY po.odoo_id, po.name
            ORDER BY MAX(po.date_order) DESC
            LIMIT ${len(params)-1} OFFSET ${len(params)}
        """, *params))
        has_next = len(rows) > limit
        return {"rows": rows[:limit], "page": page, "limit": limit, "has_next": has_next}



# ── Analitica endpoints ──

_ANALITICA_BASE = """
    FROM odoo.pos_order_line pol
    JOIN odoo.pos_order po ON pol.order_id = po.odoo_id
    LEFT JOIN crm.pos_order_partner_override ov_po ON ov_po.order_id = po.odoo_id AND ov_po.active = true
    {cj}
    WHERE COALESCE(ov_po.new_owner_partner_id, po.partner_id) = ANY($1)
      AND COALESCE(po.is_cancel, false) = false
      AND COALESCE(po.order_cancel, false) = false
      AND COALESCE(po.reserva, false) = false
      {cf}
"""


@cuentas_router.get("/{cuenta_id}/ventas/analitica/frecuencia")
async def get_analitica_frecuencia(cuenta_id: str, user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        partner_ids, _ = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return {"compras_30d": 0, "compras_60d": 0, "compras_90d": 0, "unidades_30d": 0, "unidades_60d": 0, "unidades_90d": 0, "dias_sin_comprar": None, "frecuencia_promedio": None}
        base = _ANALITICA_BASE.format(cj=_CATALOG_JOIN, cf=_CATALOG_FILTER)
        row = await conn.fetchrow(f"""
            SELECT
              COUNT(DISTINCT CASE WHEN po.date_order >= CURRENT_DATE - 30 THEN po.odoo_id END) AS compras_30d,
              COUNT(DISTINCT CASE WHEN po.date_order >= CURRENT_DATE - 60 THEN po.odoo_id END) AS compras_60d,
              COUNT(DISTINCT CASE WHEN po.date_order >= CURRENT_DATE - 90 THEN po.odoo_id END) AS compras_90d,
              COALESCE(SUM(CASE WHEN po.date_order >= CURRENT_DATE - 30 THEN pol.qty ELSE 0 END), 0) AS unidades_30d,
              COALESCE(SUM(CASE WHEN po.date_order >= CURRENT_DATE - 60 THEN pol.qty ELSE 0 END), 0) AS unidades_60d,
              COALESCE(SUM(CASE WHEN po.date_order >= CURRENT_DATE - 90 THEN pol.qty ELSE 0 END), 0) AS unidades_90d,
              (CURRENT_DATE - MAX(po.date_order)::date)::int AS dias_sin_comprar,
              MAX(po.date_order) AS ultima_compra
            {base}
        """, partner_ids)
        # Calculate average frequency from last 12 months of distinct order dates
        dates_rows = await conn.fetch(f"""
            SELECT DISTINCT po.date_order::date AS d
            {base} AND po.date_order >= CURRENT_DATE - 365
            ORDER BY d
        """, partner_ids)
        dates = [r['d'] for r in dates_rows]
        freq = None
        if len(dates) >= 2:
            gaps = [(dates[i+1] - dates[i]).days for i in range(len(dates)-1)]
            freq = round(sum(gaps) / len(gaps), 1) if gaps else None
        return {
            "compras_30d": int(row['compras_30d']),
            "compras_60d": int(row['compras_60d']),
            "compras_90d": int(row['compras_90d']),
            "unidades_30d": float(row['unidades_30d']),
            "unidades_60d": float(row['unidades_60d']),
            "unidades_90d": float(row['unidades_90d']),
            "dias_sin_comprar": int(row['dias_sin_comprar']) if row['dias_sin_comprar'] is not None else None,
            "ultima_compra": str(row['ultima_compra']) if row['ultima_compra'] else None,
            "frecuencia_promedio": freq,
        }


@cuentas_router.get("/{cuenta_id}/ventas/analitica/tops")
async def get_analitica_tops(cuenta_id: str, dias: int = 90, top: int = 10, user=Depends(get_current_user)):
    p = await get_pool()
    async with p.acquire() as conn:
        partner_ids, _ = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return {"modelos": [], "tallas": [], "colores": []}
        base = _ANALITICA_BASE.format(cj=_CATALOG_JOIN, cf=_CATALOG_FILTER)
        date_filter = f" AND po.date_order >= CURRENT_DATE - {int(dias)}"
        modelos = records_to_list(await conn.fetch(f"""
            SELECT COALESCE(pt.name, '') AS nombre, COALESCE(SUM(pol.qty), 0) AS qty,
                   COALESCE(SUM(pol.price_subtotal), 0) AS ventas, COUNT(DISTINCT po.odoo_id) AS ordenes
            {base} {date_filter}
            GROUP BY pt.name ORDER BY qty DESC LIMIT $2
        """, partner_ids, top))
        tallas = records_to_list(await conn.fetch(f"""
            SELECT COALESCE(vv.talla, '') AS talla, COALESCE(SUM(pol.qty), 0) AS qty,
                   COALESCE(SUM(pol.price_subtotal), 0) AS ventas
            {base} {date_filter} AND vv.talla IS NOT NULL AND vv.talla != ''
            GROUP BY vv.talla ORDER BY qty DESC LIMIT $2
        """, partner_ids, top))
        colores = records_to_list(await conn.fetch(f"""
            SELECT COALESCE(vv.color, '') AS color, COALESCE(SUM(pol.qty), 0) AS qty,
                   COALESCE(SUM(pol.price_subtotal), 0) AS ventas
            {base} {date_filter} AND vv.color IS NOT NULL AND vv.color != ''
            GROUP BY vv.color ORDER BY qty DESC LIMIT $2
        """, partner_ids, top))
        return {"modelos": modelos, "tallas": tallas, "colores": colores}



@cuentas_router.get("/{cuenta_id}/creditos/lines")
async def get_cuenta_creditos_lines(
    cuenta_id: str,
    fecha_desde: str = "",
    fecha_hasta: str = "",
    state: str = "",
    page: int = 1,
    limit: int = 50,
    user=Depends(get_current_user)
):
    p = await get_pool()
    async with p.acquire() as conn:
        partner_ids, odoo_id = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return {"rows": [], "page": page, "limit": limit, "has_next": False}
        params = [partner_ids]
        extra = ""
        if state:
            params.append(state)
            extra += f" AND ic.state = ${len(params)}"
        if fecha_desde:
            params.append(fecha_desde)
            extra += f" AND ic.date_invoice >= ${len(params)}::text::date"
        if fecha_hasta:
            params.append(fecha_hasta)
            extra += f" AND ic.date_invoice <= ${len(params)}::text::date"

        offset = (page - 1) * limit
        p2 = list(params)
        p2.append(limit + 1)
        p2.append(offset)
        rows = records_to_list(await conn.fetch(f"""
            SELECT il.odoo_id AS line_id,
                   ic.odoo_id AS invoice_id, ic.number AS invoice_number,
                   ic.date_invoice, ic.state,
                   ic.partner_id, rp.name AS partner_name,
                   ic.amount_total, ic.amount_residual,
                   il.product_id, il.name AS line_description,
                   il.quantity AS qty, il.price_unit, il.price_subtotal,
                   COALESCE(pt.name, il.name, '') AS modelo_display,
                   vv.product_tmpl_id, vv.barcode, vv.talla, vv.color,
                   pt.marca, pt.tipo, pt.entalle, pt.tela,
                   COALESCE(pt.hilo::text, '') AS hilo
            FROM odoo.account_invoice_credit_line il
            JOIN odoo.account_invoice_credit ic ON il.invoice_id = ic.odoo_id
            LEFT JOIN odoo.res_partner rp ON rp.odoo_id = ic.partner_id AND rp.company_key = 'GLOBAL'
            LEFT JOIN odoo.v_product_variant_flat vv ON vv.product_product_id = il.product_id AND vv.company_key = 'GLOBAL'
            LEFT JOIN odoo.product_template pt ON pt.odoo_id = vv.product_tmpl_id AND pt.company_key = 'GLOBAL'
            WHERE ic.partner_id = ANY($1) {extra}
            ORDER BY ic.date_invoice DESC, il.odoo_id DESC
            LIMIT ${len(p2)-1} OFFSET ${len(p2)}
        """, *p2))
        has_next = len(rows) > limit
        return {"rows": rows[:limit], "page": page, "limit": limit, "has_next": has_next}


@cuentas_router.get("/{cuenta_id}/creditos/metrics")
async def get_cuenta_creditos_metrics(
    cuenta_id: str,
    fecha_desde: str = "",
    fecha_hasta: str = "",
    state: str = "",
    user=Depends(get_current_user)
):
    empty = {"invoices_count": 0, "qty_total": 0, "saldo_total": 0,
             "total_facturado": 0, "last_invoice_date": None}
    p = await get_pool()
    async with p.acquire() as conn:
        partner_ids, odoo_id = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return empty
        params = [partner_ids]
        extra = ""
        if state:
            params.append(state)
            extra += f" AND ic.state = ${len(params)}"
        if fecha_desde:
            params.append(fecha_desde)
            extra += f" AND ic.date_invoice >= ${len(params)}::text::date"
        if fecha_hasta:
            params.append(fecha_hasta)
            extra += f" AND ic.date_invoice <= ${len(params)}::text::date"
        row = await conn.fetchrow(f"""
            SELECT COUNT(*) AS invoices_count,
                   COALESCE(SUM(ic.amount_residual), 0) AS saldo_total,
                   COALESCE(SUM(ic.amount_total), 0) AS total_facturado,
                   MAX(ic.date_invoice) AS last_invoice_date
            FROM odoo.account_invoice_credit ic
            WHERE ic.partner_id = ANY($1) {extra}
        """, *params)
        qty_row = await conn.fetchrow(f"""
            SELECT COALESCE(SUM(il.quantity), 0) AS qty_total
            FROM odoo.account_invoice_credit_line il
            JOIN odoo.account_invoice_credit ic ON il.invoice_id = ic.odoo_id
            WHERE ic.partner_id = ANY($1) {extra}
        """, *params)
        return {
            "invoices_count": row['invoices_count'],
            "qty_total": float(qty_row['qty_total']),
            "saldo_total": float(row['saldo_total']),
            "total_facturado": float(row['total_facturado']),
            "last_invoice_date": str(row['last_invoice_date']) if row['last_invoice_date'] else None,
        }


@cuentas_router.get("/{cuenta_id}/creditos/invoices")
async def get_cuenta_creditos_invoices(
    cuenta_id: str,
    fecha_desde: str = "",
    fecha_hasta: str = "",
    state: str = "",
    page: int = 1,
    limit: int = 50,
    user=Depends(get_current_user)
):
    p = await get_pool()
    async with p.acquire() as conn:
        partner_ids, odoo_id = await _get_cuenta_partner_ids(conn, cuenta_id)
        if not partner_ids:
            return {"metrics": {"invoices_count": 0, "qty_total": 0, "saldo_total": 0},
                    "rows": [], "page": page, "limit": limit, "has_next": False}
        params = [partner_ids]
        extra = ""
        if state:
            params.append(state)
            extra += f" AND ic.state = ${len(params)}"
        if fecha_desde:
            params.append(fecha_desde)
            extra += f" AND ic.date_invoice >= ${len(params)}::text::date"
        if fecha_hasta:
            params.append(fecha_hasta)
            extra += f" AND ic.date_invoice <= ${len(params)}::text::date"

        met = await conn.fetchrow(f"""
            SELECT COUNT(*) AS invoices_count,
                   COALESCE(SUM(ic.amount_residual), 0) AS saldo_total
            FROM odoo.account_invoice_credit ic
            WHERE ic.partner_id = ANY($1) {extra}
        """, *params)

        p2 = list(params)
        offset = (page - 1) * limit
        p2.append(limit + 1)
        p2.append(offset)
        rows = records_to_list(await conn.fetch(f"""
            SELECT ic.odoo_id AS invoice_id, ic.number AS invoice_number,
                   ic.date_invoice, ic.state, ic.partner_id,
                   rp.name AS partner_name, rp.name AS owner_partner_name,
                   ic.amount_total, ic.amount_residual,
                   COALESCE(agg.qty_total, 0) AS qty_total,
                   COALESCE(agg.lines_count, 0) AS lines_count
            FROM odoo.account_invoice_credit ic
            LEFT JOIN (
                SELECT invoice_id, SUM(quantity) AS qty_total, COUNT(*) AS lines_count
                FROM odoo.account_invoice_credit_line GROUP BY invoice_id
            ) agg ON agg.invoice_id = ic.odoo_id
            LEFT JOIN odoo.res_partner rp ON rp.odoo_id = ic.partner_id AND rp.company_key = 'GLOBAL'
            WHERE ic.partner_id = ANY($1) {extra}
            ORDER BY ic.date_invoice DESC, ic.odoo_id DESC
            LIMIT ${len(p2)-1} OFFSET ${len(p2)}
        """, *p2))
        has_next = len(rows) > limit
        return {
            "metrics": {"invoices_count": met['invoices_count'], "qty_total": 0, "saldo_total": float(met['saldo_total'])},
            "rows": rows[:limit], "page": page, "limit": limit, "has_next": has_next,
        }


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


@contactos_router.patch("/batch-active")
async def batch_toggle_contactos_active(data: BatchToggleActiveInput, user=Depends(get_current_user)):
    """Batch activate/deactivate contactos with cascade if principal."""
    p = await get_pool()
    async with p.acquire() as conn:
        user_email = user.get("usuario", "unknown") if isinstance(user, dict) else "unknown"
        ids = [int(i) for i in data.ids]
        if not ids:
            return {"ok": True, "contactos_affected": 0, "cuentas_affected": 0}

        contactos_affected = 0
        cuentas_affected = 0

        if not data.is_active:
            reason = data.reason or 'MANUAL'
            res = await conn.execute("""
                UPDATE crm.contacto SET is_active = false, manual_inactive = true,
                    inactive_reason = $2, inactive_at = now(), inactive_by = $3, updated_at = now()
                WHERE contacto_partner_odoo_id = ANY($1) AND is_active = true
            """, ids, reason, user_email)
            contactos_affected = int(res.split()[-1]) if res else 0

            # Cascade: if any principal contacto → deactivate their cuentas
            principal_cuentas = await conn.fetch("""
                SELECT DISTINCT c.cuenta_partner_odoo_id
                FROM crm.contacto c
                WHERE c.contacto_partner_odoo_id = ANY($1)
                  AND c.contacto_partner_odoo_id = c.cuenta_partner_odoo_id
            """, ids)
            if principal_cuentas:
                cuenta_ids = [r['cuenta_partner_odoo_id'] for r in principal_cuentas]
                res2 = await conn.execute("""
                    UPDATE crm.cuenta SET is_active = false, manual_inactive = true,
                        inactive_reason = 'CASCADE_CONTACT', inactive_at = now(), inactive_by = $2, updated_at = now()
                    WHERE cuenta_partner_odoo_id = ANY($1) AND is_active = true
                """, cuenta_ids, user_email)
                cuentas_affected = int(res2.split()[-1]) if res2 else 0

                # Also cascade to sibling contactos
                await conn.execute("""
                    UPDATE crm.contacto SET is_active = false, manual_inactive = true,
                        inactive_reason = 'CASCADE_CONTACT', inactive_at = now(), inactive_by = $2, updated_at = now()
                    WHERE cuenta_partner_odoo_id = ANY($1)
                      AND contacto_partner_odoo_id <> ALL($3)
                      AND is_active = true
                """, cuenta_ids, user_email, ids)
        else:
            res = await conn.execute("""
                UPDATE crm.contacto SET is_active = true, manual_inactive = false,
                    inactive_reason = NULL, inactive_at = NULL, inactive_by = NULL, updated_at = now()
                WHERE contacto_partner_odoo_id = ANY($1) AND is_active = false
            """, ids)
            contactos_affected = int(res.split()[-1]) if res else 0

        return {"ok": True, "is_active": data.is_active,
                "contactos_affected": contactos_affected, "cuentas_affected": cuentas_affected}


@contactos_router.patch("/{contacto_odoo_id}/active")
async def toggle_contacto_active(contacto_odoo_id: str, data: ToggleActiveInput, user=Depends(get_current_user)):
    """Activate/deactivate a contacto. If principal contact, cascades to cuenta."""
    p = await get_pool()
    async with p.acquire() as conn:
        odoo_id = int(contacto_odoo_id)
        user_email = user.get("usuario", "unknown") if isinstance(user, dict) else "unknown"

        contacto = await conn.fetchrow(
            "SELECT * FROM crm.contacto WHERE contacto_partner_odoo_id = $1", odoo_id
        )
        if not contacto:
            raise HTTPException(404, "Contacto no encontrado en CRM")

        cuenta_odoo_id = contacto['cuenta_partner_odoo_id']
        is_principal = (odoo_id == cuenta_odoo_id)

        if not data.is_active:
            # DEACTIVATE contacto
            await conn.execute("""
                UPDATE crm.contacto SET is_active = false, manual_inactive = true,
                    inactive_reason = $2, inactive_at = now(), inactive_by = $3, updated_at = now()
                WHERE contacto_partner_odoo_id = $1
            """, odoo_id, data.reason or 'MANUAL', user_email)

            cascade_cuenta = False
            cascade_contacts = 0
            if is_principal:
                # CASCADE: deactivate the cuenta
                await conn.execute("""
                    UPDATE crm.cuenta SET is_active = false, manual_inactive = true,
                        inactive_reason = 'CASCADE_CONTACT', inactive_at = now(), inactive_by = $2, updated_at = now()
                    WHERE cuenta_partner_odoo_id = $1 AND is_active = true
                """, cuenta_odoo_id, user_email)
                cascade_cuenta = True

                # CASCADE: deactivate other contactos of the same cuenta
                affected = await conn.execute("""
                    UPDATE crm.contacto SET is_active = false, manual_inactive = true,
                        inactive_reason = 'CASCADE_CONTACT', inactive_at = now(), inactive_by = $3, updated_at = now()
                    WHERE cuenta_partner_odoo_id = $1 AND contacto_partner_odoo_id <> $2 AND is_active = true
                """, cuenta_odoo_id, odoo_id, user_email)
                cascade_contacts = int(affected.split()[-1]) if affected else 0

            return {"ok": True, "is_active": False, "is_principal": is_principal,
                    "cascade_cuenta": cascade_cuenta, "cascade_contacts": cascade_contacts}
        else:
            # ACTIVATE contacto
            await conn.execute("""
                UPDATE crm.contacto SET is_active = true, manual_inactive = false,
                    inactive_reason = NULL, inactive_at = NULL, inactive_by = NULL, updated_at = now()
                WHERE contacto_partner_odoo_id = $1
            """, odoo_id)

            return {"ok": True, "is_active": True, "is_principal": is_principal}


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
                    f"""SELECT {db_col}::text as value,
                               COUNT(DISTINCT product_tmpl_id) as count_modelos,
                               COUNT(DISTINCT product_product_id) as count_variantes,
                               COALESCE(SUM(available_qty),0)::bigint as sum_stock
                        FROM {DASH_BASE} {where} AND {db_col} IS NOT NULL
                        GROUP BY {db_col} ORDER BY value LIMIT 500""",
                    *params
                )
                result[resp_key] = [
                    {"value": r['value'], "count_modelos": r['count_modelos'],
                     "count_variantes": r['count_variantes'], "sum_stock": int(r['sum_stock'])}
                    for r in rows
                ]
            result['tallas'] = sorted(result['tallas'], key=lambda x: _talla_sort_key(x['value']))
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


# ── Reposición / Faltantes por tienda (v2 - Pool Capping + Tallado) ───────────

MARCA_PREVALENCIA = {
    'QEPO': ['BOOSH', 'GAMARRA 207'],
    'BOOSH': ['BOOSH'],
    'ELEMENT PREMIUM': ['GAMARRA 209', 'GM218', 'GRAU 238 / GRAU 55'],
}
TIENDAS_DESTINO_ALL = ['GRAU 238 / GRAU 55', 'GAMARRA 209', 'GM218', 'BOOSH', 'GAMARRA 207']


def _sort_dests_by_priority(dests, marca_n, tallado_map, sku_key):
    """Sort destination list by brand-specific priority + tallado."""
    import hashlib

    def _tallado(d):
        return tallado_map.get(d['dest'], 0)

    if marca_n == 'ELEMENT PREMIUM':
        g209 = next((d for d in dests if d['dest'] == 'GAMARRA 209'), None)
        grau = next((d for d in dests if d['dest'] == 'GRAU 238 / GRAU 55'), None)
        gm218 = next((d for d in dests if d['dest'] == 'GM218'), None)
        others = [d for d in dests if d['dest'] not in ('GAMARRA 209', 'GRAU 238 / GRAU 55', 'GM218')]

        competitors = [x for x in [g209, grau] if x]
        if len(competitors) == 2:
            t0, t1 = _tallado(competitors[0]), _tallado(competitors[1])
            if t0 != t1:
                competitors.sort(key=lambda d: -_tallado(d))
            else:
                h = hashlib.md5(str(sku_key).encode()).hexdigest()
                if int(h, 16) % 2 == 0:
                    competitors = [competitors[0], competitors[1]]
                else:
                    competitors = [competitors[1], competitors[0]]

        ordered = competitors + ([gm218] if gm218 else []) + others
        return ordered

    objetivo_set = set(MARCA_PREVALENCIA.get(marca_n, []))
    obj = [d for d in dests if d['dest'] in objetivo_set]
    non_obj = [d for d in dests if d['dest'] not in objetivo_set]
    obj.sort(key=lambda d: -_tallado(d))
    non_obj.sort(key=lambda d: -_tallado(d))
    return obj + non_obj


@stock_dash_router.get("/reposicion")
async def dash_reposicion(
    tienda: str = "", marca: str = "", tipo: str = "", entalle: str = "",
    tela: str = "", modelo: str = "", talla: str = "", color: str = "",
    lq: str = "", negro: str = "",
    umbral_destino: int = 0,
    umbral_origen: int = 2,
    objetivo_destino: int = 2,
    solo_objetivo: bool = True,
    tienda_destino: str = "",
    marca_repo: str = "",
    page: int = 1, limit: int = 100,
    user=Depends(get_current_user)
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            where, params = _cube_where(tienda, marca, tipo, entalle, tela, modelo, talla, color, lq, negro)

            if marca_repo:
                vals = [v.strip().upper() for v in marca_repo.split(',') if v.strip()]
                if vals:
                    params.append(vals)
                    where += f" AND UPPER(TRIM(COALESCE(marca,''))) = ANY(${len(params)})"

            rows = await conn.fetch(f"""
                SELECT
                    UPPER(TRIM(COALESCE(marca,''))) as marca_norm,
                    COALESCE(marca,'') as marca_display,
                    COALESCE(tipo,'') as tipo,
                    COALESCE(entalle,'') as entalle,
                    COALESCE(tela,'') as tela,
                    COALESCE(hilo,'') as hilo,
                    color, talla::text as talla,
                    tienda_canonica as tienda,
                    SUM(available_qty)::int as stock
                FROM {DASH_BASE} {where}
                GROUP BY 1,2,3,4,5,6,7,8,9
            """, *params)

            # --- Build data structures ---
            skus = {}          # sku_key -> {stores, meta}
            tallado_sets = {}  # (item_base_key, tienda) -> set of (color,talla)

            for r in rows:
                sku_key = (r['marca_norm'], r['tipo'], r['entalle'], r['tela'], r['hilo'], r['color'], r['talla'])
                if sku_key not in skus:
                    skus[sku_key] = {
                        'stores': {},
                        'marca_norm': r['marca_norm'], 'marca': r['marca_display'],
                        'tipo': r['tipo'], 'entalle': r['entalle'], 'tela': r['tela'],
                        'hilo': r['hilo'], 'color': r['color'], 'talla': r['talla'],
                    }
                skus[sku_key]['stores'][r['tienda']] = skus[sku_key]['stores'].get(r['tienda'], 0) + r['stock']

                if r['stock'] > 0:
                    ib_key = (r['marca_norm'], r['tipo'], r['entalle'], r['tela'], r['hilo'], r['tienda'])
                    if ib_key not in tallado_sets:
                        tallado_sets[ib_key] = set()
                    tallado_sets[ib_key].add((r['color'], r['talla']))

            # Pre-compute tallado counts
            tallado = {k: len(v) for k, v in tallado_sets.items()}
            del tallado_sets

            dest_filter = [v.strip() for v in tienda_destino.split(',') if v.strip()] if tienda_destino else None
            recs = []

            for sku_key, sku in skus.items():
                stores = sku['stores']
                stock_total = sum(stores.values())
                stock_almacen = stores.get('ALMACEN', 0)
                if stock_total <= 0:
                    continue

                marca_n = sku['marca_norm']
                item_base = (marca_n, sku['tipo'], sku['entalle'], sku['tela'], sku['hilo'])

                if solo_objetivo and marca_n in MARCA_PREVALENCIA:
                    targets = list(MARCA_PREVALENCIA[marca_n])
                else:
                    targets = list(TIENDAS_DESTINO_ALL)
                if dest_filter:
                    targets = [t for t in targets if t in dest_filter]

                # Collect destinations needing replenishment
                dests_needing = []
                for dest in targets:
                    stock_dest = stores.get(dest, 0)
                    if stock_dest > umbral_destino:
                        continue
                    tall = tallado.get((*item_base, dest), 0)
                    dests_needing.append({
                        'dest': dest, 'stock_dest': stock_dest,
                        'tallado': tall, 'need': max(0, objetivo_destino - stock_dest),
                    })

                if not dests_needing:
                    continue

                # Build tallado map for priority sorting
                tall_map = {t: tallado.get((*item_base, t), 0) for t in targets}
                dests_sorted = _sort_dests_by_priority(dests_needing, marca_n, tall_map, sku_key)

                # --- Phase 1: ALMACEN allocation ---
                if stock_almacen > 0:
                    remaining = stock_almacen
                    for d in dests_sorted:
                        assign = min(d['need'], remaining)
                        remaining -= assign
                        is_target = marca_n in MARCA_PREVALENCIA and d['dest'] in MARCA_PREVALENCIA.get(marca_n, [])
                        motivo_parts = ['Desde ALMACEN']
                        if is_target:
                            motivo_parts.append('Prioridad marca')
                        if assign < d['need'] and assign > 0:
                            motivo_parts.append('Cap por stock')
                        if assign == 0:
                            motivo_parts = ['Sin stock para asignar']
                        recs.append({
                            'tienda_destino': d['dest'],
                            'marca': sku['marca'], 'tipo': sku['tipo'],
                            'entalle': sku['entalle'], 'tela': sku['tela'],
                            'hilo': sku['hilo'], 'color': sku['color'], 'talla': sku['talla'],
                            'stock_destino': d['stock_dest'],
                            'stock_almacen': stock_almacen,
                            'stock_total': stock_total,
                            'origen_recomendado': 'ALMACEN',
                            'stock_origen': stock_almacen,
                            'qty_sugerida': assign,
                            'tallado_destino': d['tallado'],
                            'motivo': ' · '.join(motivo_parts),
                        })
                else:
                    # --- Phase 2: Inter-store allocation ---
                    dest_names = set(d['dest'] for d in dests_sorted)
                    best_store, best_stock = None, 0
                    for st, stk in stores.items():
                        if st == 'ALMACEN' or st in dest_names:
                            continue
                        if marca_n in MARCA_PREVALENCIA and st in MARCA_PREVALENCIA.get(marca_n, []):
                            if stk <= umbral_origen:
                                continue
                        if stk > best_stock:
                            best_stock = stk
                            best_store = st

                    if not best_store:
                        for d in dests_sorted:
                            is_target = marca_n in MARCA_PREVALENCIA and d['dest'] in MARCA_PREVALENCIA.get(marca_n, [])
                            recs.append({
                                'tienda_destino': d['dest'],
                                'marca': sku['marca'], 'tipo': sku['tipo'],
                                'entalle': sku['entalle'], 'tela': sku['tela'],
                                'hilo': sku['hilo'], 'color': sku['color'], 'talla': sku['talla'],
                                'stock_destino': d['stock_dest'],
                                'stock_almacen': 0, 'stock_total': stock_total,
                                'origen_recomendado': '-',
                                'stock_origen': 0, 'qty_sugerida': 0,
                                'tallado_destino': d['tallado'],
                                'motivo': 'Sin stock para asignar' + (' · Prioridad marca' if is_target else ''),
                            })
                        continue

                    remaining = best_stock
                    for d in dests_sorted:
                        assign = min(d['need'], remaining)
                        remaining -= assign
                        is_target = marca_n in MARCA_PREVALENCIA and d['dest'] in MARCA_PREVALENCIA.get(marca_n, [])
                        motivo_parts = [f'Transferencia ({best_store})']
                        if is_target:
                            motivo_parts.append('Prioridad marca')
                        if assign < d['need'] and assign > 0:
                            motivo_parts.append('Cap por stock')
                        if assign == 0:
                            motivo_parts = ['Sin stock para asignar']
                        recs.append({
                            'tienda_destino': d['dest'],
                            'marca': sku['marca'], 'tipo': sku['tipo'],
                            'entalle': sku['entalle'], 'tela': sku['tela'],
                            'hilo': sku['hilo'], 'color': sku['color'], 'talla': sku['talla'],
                            'stock_destino': d['stock_dest'],
                            'stock_almacen': 0, 'stock_total': stock_total,
                            'origen_recomendado': best_store,
                            'stock_origen': best_stock,
                            'qty_sugerida': assign,
                            'tallado_destino': d['tallado'],
                            'motivo': ' · '.join(motivo_parts),
                        })

            # --- Sort final list ---
            recs.sort(key=lambda r: (
                r['stock_destino'],
                r['stock_total'],
                -(1 if r['stock_almacen'] > 0 else 0),
                -(r['tallado_destino']),
                r['marca'], r['tipo'], r['entalle'], r['tela'], r['hilo'], r['color'],
                _talla_sort_key(r['talla']),
            ))

            total = len(recs)
            offset = (page - 1) * limit
            page_recs = recs[offset:offset + limit]

            with_qty = [r for r in recs if r['qty_sugerida'] > 0]
            kpis = {
                'total_faltantes': total,
                'con_asignacion': len(with_qty),
                'total_qty_sugerida': sum(r['qty_sugerida'] for r in recs),
                'desde_almacen': sum(1 for r in with_qty if r['origen_recomendado'] == 'ALMACEN'),
                'entre_tiendas': sum(1 for r in with_qty if r['origen_recomendado'] not in ('ALMACEN', '-')),
                'sin_stock': sum(1 for r in recs if r['qty_sugerida'] == 0),
                'skus_unicos': len(set((r['marca'], r['tipo'], r['entalle'], r['tela'], r['hilo'], r['color'], r['talla']) for r in recs)),
            }
            return {"items": page_recs, "total": total, "kpis": kpis}
        except Exception as e:
            logger.error(f"dash_reposicion error: {e}")
            import traceback
            traceback.print_exc()
            return {"items": [], "total": 0, "kpis": {}}


@stock_dash_router.get("/reposicion-detalle")
async def dash_reposicion_detalle(
    marca_norm: str = "", tipo: str = "", entalle: str = "",
    tela: str = "", hilo: str = "", color: str = "", talla: str = "",
    tienda: str = "", marca_f: str = "", tipo_f: str = "", entalle_f: str = "",
    tela_f: str = "", modelo: str = "", talla_f: str = "", color_f: str = "",
    lq: str = "", negro: str = "",
    user=Depends(get_current_user)
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            where, params = _cube_where(tienda, marca_f, tipo_f, entalle_f, tela_f, modelo, talla_f, color_f, lq, negro)

            if marca_norm:
                params.append(marca_norm.upper().strip())
                where += f" AND UPPER(TRIM(COALESCE(marca,''))) = ${len(params)}"
            if tipo:
                params.append(tipo)
                where += f" AND COALESCE(tipo,'') = ${len(params)}"
            if entalle:
                params.append(entalle)
                where += f" AND COALESCE(entalle,'') = ${len(params)}"
            if tela:
                params.append(tela)
                where += f" AND COALESCE(tela,'') = ${len(params)}"
            if hilo:
                params.append(hilo)
                where += f" AND COALESCE(hilo,'') = ${len(params)}"
            if color:
                params.append(color)
                where += f" AND color = ${len(params)}"
            if talla:
                params.append(talla)
                where += f" AND talla::text = ${len(params)}"

            rows = await conn.fetch(f"""
                SELECT tienda_canonica as tienda, SUM(available_qty)::int as stock
                FROM {DASH_BASE} {where}
                GROUP BY tienda_canonica ORDER BY tienda_canonica
            """, *params)

            return {"distribucion": [{"tienda": r['tienda'], "stock": r['stock']} for r in rows]}
        except Exception as e:
            logger.error(f"dash_reposicion_detalle error: {e}")
            return {"distribucion": []}


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


# ─── ODOO SYNC ROUTER ────────────────────────────────────────────────────────

sync_router = APIRouter(prefix="/api/odoo-sync", tags=["odoo-sync"])

_sync_running = False


def _xmlrpc_fetch_stock_quants(url, db, uid, password, last_cursor, chunk_size):
    """Synchronous XML-RPC call to fetch stock.quant records (runs in thread)."""
    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object", allow_none=True)
    domain = []
    if last_cursor:
        cursor_str = last_cursor.strftime('%Y-%m-%d %H:%M:%S')
        domain.append(['write_date', '>', cursor_str])
    records = models.execute_kw(
        db, uid, password, 'stock.quant', 'search_read',
        [domain],
        {'fields': ['product_id', 'location_id', 'quantity', 'reserved_quantity',
                     'in_date', 'create_date', 'create_uid', 'write_date', 'write_uid'],
         'limit': chunk_size}
    )
    return records


def _parse_dt(val):
    if not val or val is False:
        return None
    return datetime.strptime(val, '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc)


def _parse_m2o(val):
    """Parse Odoo many2one field: [id, name] or False."""
    if isinstance(val, (list, tuple)) and len(val) >= 1:
        return val[0]
    if isinstance(val, int):
        return val
    return None


async def _do_stock_sync(pool, run_id):
    """Background task: fetch from Odoo XML-RPC → upsert to PG."""
    global _sync_running
    try:
        async with pool.acquire() as conn:
            config = await conn.fetchrow("""
                SELECT url, db_name, username, password
                FROM finanzas3.x_odoo_config
                WHERE config_key='ambission' AND activo=true LIMIT 1
            """)
            if not config:
                raise Exception("No se encontró configuración Odoo activa")

            job = await conn.fetchrow(
                "SELECT last_cursor, chunk_size FROM odoo.sync_job WHERE job_code='STOCK_QUANTS'"
            )
            last_cursor = job['last_cursor']
            chunk_size = job['chunk_size'] or 5000

            url = config['url']
            common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common")
            uid = await asyncio.to_thread(
                common.authenticate, config['db_name'], config['username'], config['password'], {}
            )
            if not uid:
                raise Exception("Autenticación con Odoo falló")

            records = await asyncio.to_thread(
                _xmlrpc_fetch_stock_quants, url, config['db_name'], uid,
                config['password'], last_cursor, chunk_size
            )

            rows_upserted = 0
            max_wd = last_cursor
            for rec in records:
                wd = _parse_dt(rec.get('write_date'))
                cd = _parse_dt(rec.get('create_date'))
                ind = _parse_dt(rec.get('in_date'))
                pid = _parse_m2o(rec.get('product_id'))
                lid = _parse_m2o(rec.get('location_id'))
                cuid = _parse_m2o(rec.get('create_uid'))
                wuid = _parse_m2o(rec.get('write_uid'))

                await conn.execute("""
                    INSERT INTO odoo.stock_quant
                        (company_key, odoo_id, product_id, location_id, qty, reserved_qty,
                         in_date, odoo_create_date, odoo_create_uid, odoo_write_date, odoo_write_uid, synced_at)
                    VALUES ('GLOBAL', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
                    ON CONFLICT (company_key, odoo_id) DO UPDATE SET
                        product_id=EXCLUDED.product_id, location_id=EXCLUDED.location_id,
                        qty=EXCLUDED.qty, reserved_qty=EXCLUDED.reserved_qty,
                        in_date=EXCLUDED.in_date, odoo_write_date=EXCLUDED.odoo_write_date,
                        odoo_write_uid=EXCLUDED.odoo_write_uid, synced_at=now()
                """, rec['id'], pid, lid,
                    rec.get('quantity', 0) or 0, rec.get('reserved_quantity', 0) or 0,
                    ind, cd, cuid, wd, wuid)
                rows_upserted += 1
                if wd and (not max_wd or wd > max_wd):
                    max_wd = wd

            await conn.execute("""
                UPDATE odoo.sync_run_log
                SET ended_at=now(), status='OK', rows_upserted=$1, rows_updated=0
                WHERE id=$2
            """, rows_upserted, run_id)

            if max_wd and max_wd != last_cursor:
                await conn.execute("""
                    UPDATE odoo.sync_job
                    SET last_run_at=now(), last_success_at=now(), last_error=NULL, last_cursor=$1
                    WHERE job_code='STOCK_QUANTS'
                """, max_wd)
            else:
                await conn.execute("""
                    UPDATE odoo.sync_job
                    SET last_run_at=now(), last_success_at=now(), last_error=NULL
                    WHERE job_code='STOCK_QUANTS'
                """)

            logger.info(f"STOCK_QUANTS sync done: {rows_upserted} rows")

    except Exception as e:
        logger.error(f"STOCK_QUANTS sync failed: {e}")
        try:
            async with pool.acquire() as conn:
                await conn.execute("""
                    UPDATE odoo.sync_run_log SET ended_at=now(), status='FAILED', error_message=$1 WHERE id=$2
                """, str(e)[:2000], run_id)
                await conn.execute("""
                    UPDATE odoo.sync_job SET last_run_at=now(), last_error=$1 WHERE job_code='STOCK_QUANTS'
                """, str(e)[:2000])
        except Exception:
            pass
    finally:
        _sync_running = False


class SyncRunInput(BaseModel):
    job_code: str


@sync_router.post("/run")
async def odoo_sync_run(body: SyncRunInput, user=Depends(get_current_user)):
    global _sync_running
    if _sync_running:
        raise HTTPException(409, "Ya hay un sync en progreso")

    pool = await get_pool()
    async with pool.acquire() as conn:
        job = await conn.fetchrow("SELECT * FROM odoo.sync_job WHERE job_code=$1", body.job_code)
        if not job:
            raise HTTPException(404, "Job no encontrado")
        if not job['enabled']:
            raise HTTPException(409, "Job deshabilitado")

        run_id = await conn.fetchval("""
            INSERT INTO odoo.sync_run_log (job_code, company_key, started_at, status)
            VALUES ($1, $2, now(), 'RUNNING') RETURNING id
        """, body.job_code, job.get('company_scope', 'GLOBAL') or 'GLOBAL')

    _sync_running = True
    asyncio.create_task(_do_stock_sync(pool, run_id))
    return {"ok": True, "run_id": run_id, "status": "RUNNING"}


@sync_router.get("/job-status")
async def odoo_sync_status(job_code: str = "STOCK_QUANTS", user=Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        job = await conn.fetchrow("SELECT * FROM odoo.sync_job WHERE job_code=$1", job_code)
        if not job:
            raise HTTPException(404, "Job no encontrado")

        last_run = await conn.fetchrow("""
            SELECT id, started_at, ended_at, status, rows_upserted, rows_updated, error_message
            FROM odoo.sync_run_log WHERE job_code=$1 ORDER BY started_at DESC LIMIT 1
        """, job_code)

        return {
            "job": {
                "job_code": job['job_code'],
                "enabled": job['enabled'],
                "last_run_at": job['last_run_at'].isoformat() if job['last_run_at'] else None,
                "last_success_at": job['last_success_at'].isoformat() if job['last_success_at'] else None,
                "last_error": job['last_error'],
                "last_cursor": job['last_cursor'].isoformat() if job['last_cursor'] else None,
            },
            "last_run": {
                "id": last_run['id'],
                "started_at": last_run['started_at'].isoformat(),
                "ended_at": last_run['ended_at'].isoformat() if last_run['ended_at'] else None,
                "status": last_run['status'],
                "rows_upserted": last_run['rows_upserted'],
                "rows_updated": last_run['rows_updated'],
                "error_message": last_run['error_message'],
            } if last_run else None,
        }


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
from routers.stock_balance import router as stock_balance_router
app.include_router(stock_balance_router)
from routers.reposicion import router as reposicion_router
app.include_router(reposicion_router)
from routers.comercial import router as comercial_router
app.include_router(comercial_router)
app.include_router(sync_router)

from routers.creditos import router as creditos_router
app.include_router(creditos_router)
from routers.orders import router as orders_router
app.include_router(orders_router)
from routers.approval import router as approval_router
app.include_router(approval_router)
from routers.maintenance import router as maintenance_router
app.include_router(maintenance_router)
from routers.ods_sync import router as ods_sync_router
app.include_router(ods_sync_router)
from routers.mi_dia import router as mi_dia_router
app.include_router(mi_dia_router)
