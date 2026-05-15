"""Equipo de ventas — CRUD de vendedoras/supervisores/admins.

Modelo:
    - Login: produccion.prod_usuarios (compartido con Ventas, mismo password)
    - Perfil CRM: crm.usuario (rol, iniciales, color, tiendas, marcas, metas)

Solo admin/supervisor pueden gestionar el equipo. Las vendedoras pueden ver la
lista pero no editar.

Tiendas y marcas vienen como dropdowns cerrados (catálogo de Odoo + producción).
"""
import calendar
import uuid
from datetime import date as _date, datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth_utils import get_current_user, get_password_hash
from db import safe_acquire
from helpers import row_to_dict


router = APIRouter(prefix="/api/equipo")


# ── Modelos ─────────────────────────────────────────────────────────────────

class UsuarioCreateInput(BaseModel):
    username: str
    password: str            # plain — se hashea aquí
    nombre_completo: str
    rol: str = "vendedora"   # admin | supervisor | vendedora
    email: Optional[str] = None
    telefono: Optional[str] = None
    whatsapp: Optional[str] = None
    color_hex: Optional[str] = None  # "#E11D48"
    iniciales: Optional[str] = None  # auto si no viene
    tiendas: Optional[List[str]] = None
    marcas: Optional[List[str]] = None
    fecha_ingreso: Optional[str] = None  # ISO YYYY-MM-DD
    meta_mensual: Optional[float] = None
    notas: Optional[str] = None
    es_equipo_ventas: bool = True  # nuevos por defecto van al equipo CRM


class AgregarAEquipoInput(BaseModel):
    """Para añadir usuarios EXISTENTES del sistema al equipo CRM."""
    usernames: List[str]
    rol: Optional[str] = None  # opcional: actualizar rol al agregar
    color_hex: Optional[str] = None
    tiendas: Optional[List[str]] = None
    marcas: Optional[List[str]] = None


class UsuarioUpdateInput(BaseModel):
    nombre_completo: Optional[str] = None
    rol: Optional[str] = None
    email: Optional[str] = None
    telefono: Optional[str] = None
    whatsapp: Optional[str] = None
    color_hex: Optional[str] = None
    iniciales: Optional[str] = None
    tiendas: Optional[List[str]] = None
    marcas: Optional[List[str]] = None
    fecha_ingreso: Optional[str] = None
    meta_mensual: Optional[float] = None
    notas: Optional[str] = None


class ResetPasswordInput(BaseModel):
    new_password: str


# ── Helpers ────────────────────────────────────────────────────────────────

def _solo_admin(user: dict):
    if user.get("rol") not in ("admin", "supervisor"):
        raise HTTPException(403, "Solo admin o supervisor")


def _generar_iniciales(nombre: str) -> str:
    if not nombre:
        return "??"
    partes = nombre.strip().split()
    if len(partes) >= 2:
        return (partes[0][0] + partes[1][0]).upper()
    return (partes[0][:2]).upper()


# Paleta de colores predefinida (Hilo style)
PALETA_COLORES = [
    "#DC2626",  # rojo
    "#EA580C",  # naranja
    "#D97706",  # ámbar
    "#65A30D",  # lima
    "#16A34A",  # verde
    "#0891B2",  # cian
    "#2563EB",  # azul
    "#7C3AED",  # violeta
    "#C026D3",  # fucsia
    "#E11D48",  # rosa
]


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.get("/opciones")
async def get_opciones(_user: dict = Depends(get_current_user)):
    """Catálogos cerrados para dropdowns (tiendas + marcas)."""
    async with safe_acquire() as conn:
        tiendas_rows = await conn.fetch("""
            SELECT DISTINCT sl.x_nombre AS nombre
            FROM odoo.stock_location sl
            WHERE sl.usage = 'internal'
              AND sl.active = true
              AND sl.x_nombre IS NOT NULL
              AND btrim(sl.x_nombre) <> ''
            ORDER BY sl.x_nombre
        """)
        marcas_rows = await conn.fetch("""
            SELECT pm.nombre
            FROM produccion.prod_marcas pm
            WHERE EXISTS (
                SELECT 1 FROM produccion.prod_odoo_productos_enriq pe
                WHERE pe.marca_id = pm.id
            )
            ORDER BY pm.nombre
        """)
    return {
        "tiendas": [r["nombre"] for r in tiendas_rows],
        "marcas":  [r["nombre"] for r in marcas_rows],
        "roles":   ["admin", "supervisor", "vendedora"],
        "colores": PALETA_COLORES,
    }


@router.get("/usuarios")
async def listar_usuarios(_user: dict = Depends(get_current_user)):
    """Lista los usuarios DEL EQUIPO CRM (filtrado por es_equipo_ventas=true)."""
    async with safe_acquire() as conn:
        rows = await conn.fetch("""
            SELECT
                u.username, u.rol, u.nombre_completo, u.iniciales,
                u.email, u.whatsapp, u.telefono, u.color_hex,
                u.tiendas, u.marcas, u.fecha_ingreso, u.meta_mensual, u.notas,
                u.activo, u.es_equipo_ventas, u.created_at, u.ultimo_login,
                (SELECT COUNT(*) FROM crm.asignacion_seguimiento a
                 WHERE a.asignado_a = u.username AND a.cerrada = false) AS asignaciones_activas,
                (SELECT COUNT(*) FROM crm.asignacion_seguimiento a
                 WHERE a.asignado_a = u.username
                   AND a.cerrada = true
                   AND a.closed_at >= date_trunc('month', NOW())) AS cerradas_mes,
                (SELECT COUNT(*) FROM crm.cuenta c
                 WHERE c.asignado_a = u.username) AS carteras_size
            FROM crm.usuario u
            WHERE u.es_equipo_ventas = true
            ORDER BY u.activo DESC,
                     CASE u.rol WHEN 'admin' THEN 0 WHEN 'supervisor' THEN 1 ELSE 2 END,
                     u.nombre_completo NULLS LAST
        """)
        return [row_to_dict(r) for r in rows]


@router.get("/dashboard")
async def dashboard_equipo(_user: dict = Depends(get_current_user)):
    """Dashboard rico del equipo de ventas (Sprint CRM-D8 v1).

    Devuelve métricas accionables por vendedora + KPIs agregados de equipo,
    todo en una sola query con CTEs sobre las tablas y matviews vivas.

    Fuentes:
      - cartera, dormidos, monto_mes:   crm.cuenta JOIN crm.mv_cuenta_estado
      - asignaciones / vencidas / cerr.: crm.asignacion_seguimiento
      - conversion:                     cerradas con estado='compro' / total cerradas (90d)
      - actividad / ultima_act:         crm.interaccion (created_by + happened_at)
      - cuota_pct:                      SUM(amount_mtd) / meta_mensual
      - proyeccion_mes:                 lineal: monto / dia_actual * dias_total_mes

    Alertas generadas:
      - "Sin actividad Nd" (≥7 días sin interacción)
      - "Sin actividad registrada" (nunca interactuó)
      - "N tarea(s) vencida(s)" (reprogramar_para < hoy)
      - "Cuota en riesgo" (proyección <70% después del día 10)
      - "N cuentas dormidas" (≥10 dormidas)

    Severidad:
      - 'atencion' si hay alerta crítica (cuota en riesgo o vencidas)
      - 'revisar'  si hay alertas no críticas
      - 'ok'       en otro caso
    """
    async with safe_acquire() as conn:
        rows = await conn.fetch("""
            WITH cartera AS (
                -- Cartera + estado por vendedora (cruzando cuenta + matview).
                SELECT
                    c.asignado_a,
                    COUNT(*)                                                          AS cartera_total,
                    COUNT(*) FILTER (WHERE ce.estado_auto IN ('dormido', 'perdido'))  AS dormidos,
                    COUNT(*) FILTER (WHERE ce.estado_auto = 'en_riesgo')              AS en_riesgo,
                    COUNT(*) FILTER (WHERE ce.estado_auto IN ('activo', 'vip'))       AS activos,
                    COUNT(*) FILTER (WHERE ce.estado_auto = 'nuevo')                  AS nuevos,
                    COALESCE(SUM(ce.amount_mtd), 0)::numeric(14,2)                    AS monto_mes_actual,
                    COALESCE(SUM(ce.amount_12m), 0)::numeric(14,2)                    AS monto_12m
                FROM crm.cuenta c
                LEFT JOIN crm.mv_cuenta_estado ce
                       ON ce.cuenta_partner_odoo_id = c.cuenta_partner_odoo_id
                WHERE c.asignado_a IS NOT NULL
                  AND COALESCE(c.is_active, true) = true
                  AND COALESCE(c.manual_inactive, false) = false
                GROUP BY c.asignado_a
            ),
            asignaciones AS (
                -- Pipeline de seguimientos por vendedora.
                SELECT
                    a.asignado_a,
                    COUNT(*) FILTER (WHERE a.cerrada = false)                            AS asignaciones_activas,
                    COUNT(*) FILTER (
                        WHERE a.cerrada = false
                          AND a.reprogramar_para IS NOT NULL
                          AND a.reprogramar_para < CURRENT_DATE
                    )                                                                    AS vencidas,
                    COUNT(*) FILTER (
                        WHERE a.cerrada = true
                          AND a.closed_at >= date_trunc('month', NOW())
                    )                                                                    AS cerradas_mes,
                    COUNT(*) FILTER (
                        WHERE a.cerrada = true
                          AND a.estado = 'compro'
                          AND a.closed_at >= NOW() - INTERVAL '90 days'
                    )                                                                    AS compro_90d,
                    COUNT(*) FILTER (
                        WHERE a.cerrada = true
                          AND a.closed_at >= NOW() - INTERVAL '90 days'
                    )                                                                    AS cerradas_90d
                FROM crm.asignacion_seguimiento a
                WHERE a.asignado_a IS NOT NULL
                GROUP BY a.asignado_a
            ),
            interacciones AS (
                -- Actividad real: llamadas, mensajes, visitas registradas.
                SELECT
                    i.created_by                                                AS username,
                    COUNT(*) FILTER (WHERE i.happened_at::date = CURRENT_DATE)  AS hoy,
                    COUNT(*) FILTER (WHERE i.happened_at >= NOW() - INTERVAL '7 days') AS semana,
                    MAX(i.happened_at)                                          AS ultima
                FROM crm.interaccion i
                WHERE i.created_by IS NOT NULL
                GROUP BY i.created_by
            )
            SELECT
                u.username, u.rol, u.nombre_completo, u.iniciales,
                u.color_hex, u.email, u.whatsapp, u.telefono,
                u.tiendas, u.marcas, u.fecha_ingreso, u.activo,
                u.ultimo_login,
                COALESCE(u.meta_mensual, 0)::numeric(14,2)     AS meta_mensual,
                COALESCE(c.cartera_total, 0)                   AS cartera_total,
                COALESCE(c.activos, 0)                         AS cartera_activos,
                COALESCE(c.nuevos, 0)                          AS cartera_nuevos,
                COALESCE(c.dormidos, 0)                        AS dormidos,
                COALESCE(c.en_riesgo, 0)                       AS en_riesgo,
                COALESCE(c.monto_mes_actual, 0)::numeric(14,2) AS monto_mes_actual,
                COALESCE(c.monto_12m, 0)::numeric(14,2)        AS monto_12m,
                COALESCE(a.asignaciones_activas, 0)            AS asignaciones_activas,
                COALESCE(a.vencidas, 0)                        AS vencidas,
                COALESCE(a.cerradas_mes, 0)                    AS cerradas_mes,
                COALESCE(a.compro_90d, 0)                      AS compro_90d,
                COALESCE(a.cerradas_90d, 0)                    AS cerradas_90d,
                COALESCE(i.hoy, 0)                             AS actividad_hoy,
                COALESCE(i.semana, 0)                          AS actividad_semana,
                i.ultima                                       AS ultima_actividad
            FROM crm.usuario u
            LEFT JOIN cartera       c ON c.asignado_a = u.username
            LEFT JOIN asignaciones  a ON a.asignado_a = u.username
            LEFT JOIN interacciones i ON i.username   = u.username
            WHERE u.es_equipo_ventas = true
            ORDER BY u.activo DESC,
                     CASE u.rol WHEN 'admin' THEN 0 WHEN 'supervisor' THEN 1 ELSE 2 END,
                     u.nombre_completo NULLS LAST
        """)

        # ── Post-procesamiento en Python: porcentajes, proyección, alertas ──
        hoy = _date.today()
        dia_actual = hoy.day
        dias_total_mes = calendar.monthrange(hoy.year, hoy.month)[1]
        ahora = datetime.now(timezone.utc)
        pct_mes_transcurrido = (dia_actual / dias_total_mes) * 100

        vendedoras = []
        for r in rows:
            # Capturar datetime ANTES de row_to_dict (que serializa a string)
            ultima_raw = r["ultima_actividad"]

            d = row_to_dict(r)

            meta  = float(d.get("meta_mensual")     or 0)
            monto = float(d.get("monto_mes_actual") or 0)

            # Cuota: avance real vs meta (en PEN)
            d["cuota_pct"] = (monto / meta * 100) if meta > 0 else None

            # Proyección lineal a fin de mes
            if dia_actual > 0 and monto > 0:
                d["proyeccion_mes"] = round(monto / dia_actual * dias_total_mes, 2)
            else:
                d["proyeccion_mes"] = None

            d["proyeccion_pct"] = (
                d["proyeccion_mes"] / meta * 100
                if meta > 0 and d["proyeccion_mes"] is not None else None
            )

            # Conversión 90d
            cerradas_90d = int(d.get("cerradas_90d") or 0)
            compro_90d   = int(d.get("compro_90d")   or 0)
            d["conversion_pct"] = (
                (compro_90d / cerradas_90d * 100) if cerradas_90d > 0 else None
            )

            # Días sin actividad (uso raw datetime, no el ISO-string de d)
            if ultima_raw is not None:
                if ultima_raw.tzinfo is None:
                    ultima_raw = ultima_raw.replace(tzinfo=timezone.utc)
                delta = ahora - ultima_raw
                d["dias_sin_actividad"] = max(delta.days, 0)
            else:
                d["dias_sin_actividad"] = None

            # ── Alertas (solo para vendedoras activas) ──
            alertas = []
            severidad = "ok"

            if d.get("activo") and d.get("rol") == "vendedora":
                if d["dias_sin_actividad"] is None:
                    alertas.append("Sin actividad registrada")
                elif d["dias_sin_actividad"] >= 7:
                    alertas.append(f"Sin actividad {d['dias_sin_actividad']}d")

                if int(d.get("vencidas") or 0) > 0:
                    alertas.append(f"{int(d['vencidas'])} tarea(s) vencida(s)")

                # Cuota en riesgo: pasada la mitad del mes y proyección <70%
                if (d["proyeccion_pct"] is not None
                        and pct_mes_transcurrido > 33
                        and d["proyeccion_pct"] < 70):
                    alertas.append("Cuota en riesgo")

                if int(d.get("dormidos") or 0) >= 10:
                    alertas.append(f"{int(d['dormidos'])} cuentas dormidas")

                # Severidad
                tiene_critica = any(
                    ("riesgo" in a or "vencida" in a) for a in alertas
                )
                if tiene_critica:
                    severidad = "atencion"
                elif alertas:
                    severidad = "revisar"

            d["alertas"]   = alertas
            d["severidad"] = severidad

            # Cast a float para JSON friendly
            for k in ("meta_mensual", "monto_mes_actual", "monto_12m"):
                if d.get(k) is not None:
                    d[k] = float(d[k])

            vendedoras.append(d)

        # ── Promedio del equipo (solo vendedoras activas con cuota válida) ──
        cuotas_validas = [
            v["cuota_pct"] for v in vendedoras
            if v.get("cuota_pct") is not None
               and v.get("rol")     == "vendedora"
               and v.get("activo")
        ]
        avg_cuota = (sum(cuotas_validas) / len(cuotas_validas)) if cuotas_validas else 0.0

        for v in vendedoras:
            v["diff_vs_avg"] = (
                (v["cuota_pct"] - avg_cuota) if v.get("cuota_pct") is not None else None
            )

        # ── KPIs agregados del equipo (solo vendedoras activas) ──
        activas = [v for v in vendedoras if v.get("activo") and v.get("rol") == "vendedora"]

        meta_equipo  = sum(float(v.get("meta_mensual")     or 0) for v in activas)
        monto_equipo = sum(float(v.get("monto_mes_actual") or 0) for v in activas)

        equipo_kpis = {
            "total":                len(activas),
            "online_hoy":           sum(1 for v in activas if int(v.get("actividad_hoy") or 0) > 0),
            "con_atencion":         sum(1 for v in activas if v.get("severidad") == "atencion"),
            "con_revisar":          sum(1 for v in activas if v.get("severidad") == "revisar"),
            "meta_total":           meta_equipo,
            "monto_mes_total":      monto_equipo,
            "cuota_equipo_pct":     (monto_equipo / meta_equipo * 100) if meta_equipo > 0 else None,
            "actividad_hoy_total":  sum(int(v.get("actividad_hoy") or 0) for v in activas),
            "actividad_semana_total": sum(int(v.get("actividad_semana") or 0) for v in activas),
            "vencidas_total":       sum(int(v.get("vencidas") or 0) for v in activas),
            "dormidos_total":       sum(int(v.get("dormidos") or 0) for v in activas),
            "cartera_total":        sum(int(v.get("cartera_total") or 0) for v in activas),
            "avg_cuota_pct":        avg_cuota,
        }

        return {
            "vendedoras":  vendedoras,
            "equipo":      equipo_kpis,
            "generado_en": ahora.isoformat(),
            "mes_actual": {
                "anio":                  hoy.year,
                "mes":                   hoy.month,
                "dia":                   dia_actual,
                "dias_total":            dias_total_mes,
                "pct_mes_transcurrido":  pct_mes_transcurrido,
            },
        }


@router.get("/usuarios-disponibles")
async def listar_disponibles(_user: dict = Depends(get_current_user)):
    """Usuarios del sistema que NO están en el equipo CRM todavía.
    Para el modal 'Añadir desde sistema'."""
    async with safe_acquire() as conn:
        rows = await conn.fetch("""
            SELECT u.username, u.nombre_completo, u.rol, u.iniciales,
                   u.email, u.activo, u.ultimo_login
            FROM crm.usuario u
            WHERE COALESCE(u.es_equipo_ventas, false) = false
              AND u.activo = true
            ORDER BY u.nombre_completo NULLS LAST, u.username
        """)
        return [row_to_dict(r) for r in rows]


@router.post("/usuarios")
async def crear_usuario(data: UsuarioCreateInput, user: dict = Depends(get_current_user)):
    _solo_admin(user)
    if data.rol not in ("admin", "supervisor", "vendedora"):
        raise HTTPException(400, "Rol inválido")
    if len(data.password) < 4:
        raise HTTPException(400, "Password muy corto (mínimo 4 caracteres)")

    iniciales = (data.iniciales or _generar_iniciales(data.nombre_completo))[:4].upper()
    password_hash = get_password_hash(data.password)

    async with safe_acquire() as conn:
        # Verificar duplicado
        existing = await conn.fetchval(
            "SELECT 1 FROM produccion.prod_usuarios WHERE username = $1", data.username
        )
        if existing:
            raise HTTPException(400, f"Username '{data.username}' ya existe")

        # 1. Crear en prod_usuarios (login)
        new_id = str(uuid.uuid4())
        await conn.execute("""
            INSERT INTO produccion.prod_usuarios
                (id, username, password_hash, nombre_completo, email, rol, activo)
            VALUES ($1, $2, $3, $4, $5, $6, true)
        """, new_id, data.username, password_hash, data.nombre_completo,
             data.email, data.rol)

        # 2. Crear en crm.usuario (perfil CRM)
        from datetime import date as _date
        fecha_ingreso = None
        if data.fecha_ingreso:
            try:
                fecha_ingreso = _date.fromisoformat(data.fecha_ingreso)
            except ValueError:
                fecha_ingreso = None

        await conn.execute("""
            INSERT INTO crm.usuario
                (username, password_hash, nombre_completo, rol, email, whatsapp,
                 telefono, iniciales, color_hex, tiendas, marcas,
                 fecha_ingreso, meta_mensual, notas, activo, es_equipo_ventas)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                    $12, $13, $14, true, $15)
            ON CONFLICT (username) DO UPDATE SET
                rol = EXCLUDED.rol,
                nombre_completo = EXCLUDED.nombre_completo,
                email = EXCLUDED.email,
                whatsapp = EXCLUDED.whatsapp,
                telefono = EXCLUDED.telefono,
                iniciales = EXCLUDED.iniciales,
                color_hex = EXCLUDED.color_hex,
                tiendas = EXCLUDED.tiendas,
                marcas = EXCLUDED.marcas,
                fecha_ingreso = EXCLUDED.fecha_ingreso,
                meta_mensual = EXCLUDED.meta_mensual,
                notas = EXCLUDED.notas,
                activo = true,
                es_equipo_ventas = EXCLUDED.es_equipo_ventas
        """, data.username, password_hash, data.nombre_completo, data.rol,
             data.email, data.whatsapp, data.telefono, iniciales, data.color_hex,
             data.tiendas, data.marcas,
             fecha_ingreso, data.meta_mensual, data.notas, data.es_equipo_ventas)

    return {"ok": True, "username": data.username}


@router.patch("/usuarios/{username}")
async def actualizar_usuario(username: str, data: UsuarioUpdateInput,
                              user: dict = Depends(get_current_user)):
    _solo_admin(user)

    # Solo enviar campos que vienen
    cambios_crm: list = []
    valores_crm: list = []
    cambios_prod: list = []
    valores_prod: list = []

    field_map_crm = {
        "nombre_completo": data.nombre_completo,
        "rol": data.rol,
        "email": data.email,
        "telefono": data.telefono,
        "whatsapp": data.whatsapp,
        "color_hex": data.color_hex,
        "iniciales": data.iniciales,
        "tiendas": data.tiendas,
        "marcas": data.marcas,
        "fecha_ingreso": data.fecha_ingreso,
        "meta_mensual": data.meta_mensual,
        "notas": data.notas,
    }
    for f, v in field_map_crm.items():
        if v is not None:
            valores_crm.append(v)
            cambios_crm.append(f"{f} = ${len(valores_crm)}")

    # En prod_usuarios solo replicamos nombre, email, rol
    for f, v in [("nombre_completo", data.nombre_completo),
                 ("email", data.email),
                 ("rol", data.rol)]:
        if v is not None:
            valores_prod.append(v)
            cambios_prod.append(f"{f} = ${len(valores_prod)}")

    if not cambios_crm and not cambios_prod:
        return {"ok": True, "nochange": True}

    async with safe_acquire() as conn:
        existing = await conn.fetchval(
            "SELECT 1 FROM crm.usuario WHERE username = $1", username
        )
        if not existing:
            raise HTTPException(404, "Usuario no encontrado")

        if cambios_crm:
            # Convertir fecha_ingreso string ISO a date object si vino como str
            if data.fecha_ingreso and isinstance(data.fecha_ingreso, str):
                from datetime import date as _date
                try:
                    idx = next(i for i, c in enumerate(cambios_crm) if c.startswith("fecha_ingreso"))
                    valores_crm[idx] = _date.fromisoformat(data.fecha_ingreso)
                except (StopIteration, ValueError):
                    pass
            valores_crm.append(username)
            sql_crm = (f"UPDATE crm.usuario SET {', '.join(cambios_crm)} "
                       f"WHERE username = ${len(valores_crm)}")
            await conn.execute(sql_crm, *valores_crm)

        if cambios_prod:
            valores_prod.append(username)
            await conn.execute(
                f"UPDATE produccion.prod_usuarios SET {', '.join(cambios_prod)} "
                f"WHERE username = ${len(valores_prod)}",
                *valores_prod,
            )

    return {"ok": True, "username": username}


@router.post("/usuarios/{username}/reset-password")
async def reset_password(username: str, data: ResetPasswordInput,
                          user: dict = Depends(get_current_user)):
    _solo_admin(user)
    if len(data.new_password) < 4:
        raise HTTPException(400, "Password muy corto (mínimo 4)")

    password_hash = get_password_hash(data.new_password)
    async with safe_acquire() as conn:
        # Update en ambas tablas
        await conn.execute(
            "UPDATE produccion.prod_usuarios SET password_hash = $1 WHERE username = $2",
            password_hash, username,
        )
        await conn.execute(
            "UPDATE crm.usuario SET password_hash = $1 WHERE username = $2",
            password_hash, username,
        )
    return {"ok": True}


@router.post("/usuarios/agregar-a-equipo")
async def agregar_a_equipo(data: AgregarAEquipoInput, user: dict = Depends(get_current_user)):
    """Marca uno o más usuarios EXISTENTES como parte del equipo CRM.
    Opcionalmente actualiza color/tiendas/marcas comunes a todos."""
    _solo_admin(user)
    if not data.usernames:
        raise HTTPException(400, "Lista de usernames vacía")

    extra_sets = ["es_equipo_ventas = true"]
    extra_vals: list = []
    if data.rol:
        extra_vals.append(data.rol)
        extra_sets.append(f"rol = ${len(extra_vals)}")
    if data.color_hex:
        extra_vals.append(data.color_hex)
        extra_sets.append(f"color_hex = ${len(extra_vals)}")
    if data.tiendas is not None:
        extra_vals.append(data.tiendas)
        extra_sets.append(f"tiendas = ${len(extra_vals)}")
    if data.marcas is not None:
        extra_vals.append(data.marcas)
        extra_sets.append(f"marcas = ${len(extra_vals)}")

    async with safe_acquire() as conn:
        extra_vals.append(data.usernames)
        await conn.execute(
            f"UPDATE crm.usuario SET {', '.join(extra_sets)} WHERE username = ANY(${len(extra_vals)})",
            *extra_vals,
        )
        # Si actualizamos el rol, propagar a prod_usuarios
        if data.rol:
            await conn.execute(
                "UPDATE produccion.prod_usuarios SET rol = $1 WHERE username = ANY($2)",
                data.rol, data.usernames,
            )
    return {"ok": True, "agregados": len(data.usernames)}


@router.post("/usuarios/{username}/quitar-de-equipo")
async def quitar_de_equipo(username: str, user: dict = Depends(get_current_user)):
    """Quita un usuario del equipo CRM (NO borra el usuario del sistema)."""
    _solo_admin(user)
    if username == user.get("username"):
        raise HTTPException(400, "No puedes quitarte a ti mismo del equipo")
    async with safe_acquire() as conn:
        await conn.execute(
            "UPDATE crm.usuario SET es_equipo_ventas = false WHERE username = $1",
            username,
        )
    return {"ok": True}


@router.post("/usuarios/{username}/toggle-activo")
async def toggle_activo(username: str, user: dict = Depends(get_current_user)):
    _solo_admin(user)
    if username == user.get("username"):
        raise HTTPException(400, "No puedes desactivarte a ti mismo")
    async with safe_acquire() as conn:
        row = await conn.fetchrow(
            "SELECT activo FROM crm.usuario WHERE username = $1", username
        )
        if not row:
            raise HTTPException(404, "Usuario no encontrado")
        nuevo_estado = not row["activo"]
        await conn.execute(
            "UPDATE crm.usuario SET activo = $1 WHERE username = $2",
            nuevo_estado, username,
        )
        await conn.execute(
            "UPDATE produccion.prod_usuarios SET activo = $1 WHERE username = $2",
            nuevo_estado, username,
        )
    return {"ok": True, "activo": nuevo_estado}
