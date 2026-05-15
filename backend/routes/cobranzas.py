"""Cobranzas — listado de cuentas con saldo pendiente (Sprint CRM-D8).

Datos reales desde `odoo.account_invoice_credit` (facturas a crédito) agregados
por cuenta CRM. Si el cliente es un secundario (vinculado), su saldo se acumula
en el PRINCIPAL — usando la vista `crm.v_cuenta_partners` que ya hace el rollup.

Nota: `date_due` SÍ existe en `odoo.account_invoice_credit` (se sincroniza
desde `account.invoice.date_due` de Odoo 10) y se expone en los endpoints
`/api/cuentas/{id}/creditos/*` para reportes. Sin embargo, este módulo de
cobranzas mantiene el cálculo aproximado `date_invoice + terminos_pago_dias`
(default 30 días) porque la regla de negocio acordada usa los términos de la
cuenta CRM en lugar del payment_term original de la factura.

────────────────────────────────────────────────────────────────────────────
FILTRO ODOO QUE DEBE USAR EL SYNC para `account.invoice`:
    [('is_credit', '=', True),
     ('type',      '=', 'out_invoice'),
     ('state',     '=', 'open')]      # solo NO PAGADAS

  - is_credit=True   → ventas a crédito (no contado/POS)
  - type=out_invoice → factura de venta (no compras ni notas de crédito)
  - state=open       → solo las que tienen saldo pendiente (paid/cancel/draft
                       no nos interesan acá)

Aquí filtramos defensivamente por state='open' por si llegan otros estados.
────────────────────────────────────────────────────────────────────────────

Endpoints:
  - GET /api/cobranzas/resumen → KPIs agregados
  - GET /api/cobranzas/cuentas → listado con saldo, estado y vencimiento
"""
from typing import Optional
from fastapi import APIRouter, Depends, Query

from auth_utils import get_current_user
from db import safe_acquire
from helpers import row_to_dict


router = APIRouter(prefix="/api/cobranzas", tags=["cobranzas"])


# Política de antigüedad de cobranzas:
#   - Por defecto: solo facturas con date_invoice >= FECHA_CORTE_ANTIGUO (deudas viejas se "olvidan")
#   - EXCEPCIÓN: si la cuenta tiene compras recientes (≤ MESES_ACTIVO), se conservan
#     TODAS sus facturas viejas (porque el cliente sigue activo y se puede cobrar).
FECHA_CORTE_ANTIGUO = "2025-01-01"
MESES_ACTIVO = 6


# CTE compartida: agrega saldo + vencimientos por cuenta CRM (con rollup
# de partners vinculados via v_cuenta_partners).
_CTE_CUENTAS_SALDO = f"""
WITH cuentas_activas_recientes AS (
    -- Cuentas cuyo grupo (principal+secundarios) compró en los últimos
    -- {MESES_ACTIVO} meses. Para estos NO aplicamos el corte de antigüedad.
    SELECT DISTINCT vcp.cuenta_id
    FROM crm.v_cuenta_partners vcp
    JOIN crm.mv_cuenta_sales_kpi kpi ON kpi.cuenta_id = vcp.partner_id
    WHERE kpi.last_purchase_date >= NOW() - INTERVAL '{MESES_ACTIVO} months'
),
cuentas_saldo AS (
    SELECT
        cu.id                                            AS cuenta_id,
        cu.cuenta_partner_odoo_id                        AS partner_odoo_id,
        rp.name                                          AS nombre,
        COALESCE(rp.vat, '')                             AS vat,
        COALESCE(rp.phone::text, '')                     AS phone,
        COALESCE(rp.mobile::text, '')                    AS mobile,
        COALESCE(NULLIF(cu.departamento, ''), rp.state_name::text, '') AS depto,
        COALESCE(NULLIF(cu.distrito, ''),    rp.district_name)         AS distrito,
        cu.asignado_a,
        u.color_hex                                      AS asignado_color,
        u.nombre_completo                                AS asignado_nombre,
        COALESCE(cu.credito_linea, 0)::float             AS credito_linea,
        COALESCE(cu.terminos_pago_dias, 30)              AS plazo_dias,
        -- CRM-D13: tiendas distintas donde compra el grupo de la cuenta.
        -- Como vcp.partner_id puede ser principal o cualquier secundario,
        -- y mv_cuenta_sales_kpi.tienda es por partner_id (1:1), un cliente
        -- consolidado puede listar varias tiendas. Ordenadas alfabéticamente.
        COALESCE(
            ARRAY_AGG(DISTINCT k.tienda ORDER BY k.tienda)
                FILTER (WHERE k.tienda IS NOT NULL AND k.tienda <> ''),
            ARRAY[]::text[]
        )                                                AS tiendas,
        -- Agregados de facturas a crédito (todos los partners vinculados)
        COALESCE(SUM(aic.amount_residual), 0)::float     AS saldo_total,
        COALESCE(SUM(aic.amount_residual) FILTER (
            WHERE (aic.date_invoice + COALESCE(cu.terminos_pago_dias, 30))::date < CURRENT_DATE
        ), 0)::float                                     AS saldo_vencido,
        COALESCE(SUM(aic.amount_residual) FILTER (
            WHERE (aic.date_invoice + COALESCE(cu.terminos_pago_dias, 30))::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '5 days'
        ), 0)::float                                     AS saldo_por_vencer,
        COUNT(DISTINCT aic.odoo_id)                      AS n_facturas,
        COUNT(DISTINCT aic.odoo_id) FILTER (
            WHERE (aic.date_invoice + COALESCE(cu.terminos_pago_dias, 30))::date < CURRENT_DATE
        )                                                AS n_facturas_vencidas,
        -- ::date va DENTRO del MIN, antes del FILTER (Postgres lo exige así)
        MIN((aic.date_invoice + COALESCE(cu.terminos_pago_dias, 30))::date) FILTER (
            WHERE (aic.date_invoice + COALESCE(cu.terminos_pago_dias, 30))::date < CURRENT_DATE
        )                                                AS vencimiento_mas_antiguo,
        MIN((aic.date_invoice + COALESCE(cu.terminos_pago_dias, 30))::date) FILTER (
            WHERE (aic.date_invoice + COALESCE(cu.terminos_pago_dias, 30))::date >= CURRENT_DATE
        )                                                AS proximo_vencimiento
    FROM crm.cuenta cu
    JOIN odoo.res_partner rp
      ON rp.odoo_id = cu.cuenta_partner_odoo_id
     AND rp.company_key = 'GLOBAL'
    LEFT JOIN crm.usuario u
      ON u.username = cu.asignado_a
    -- Rollup: todos los partners (principal + secundarios) de esta cuenta
    JOIN crm.v_cuenta_partners vcp
      ON vcp.cuenta_id = cu.id
    -- CRM-D13: tienda dominante por cada partner (matview pre-calculada)
    LEFT JOIN crm.mv_cuenta_sales_kpi k
      ON k.cuenta_id = vcp.partner_id
    LEFT JOIN odoo.account_invoice_credit aic
      ON aic.partner_id = vcp.partner_id
     -- OJO: NO filtramos por company_key. Las facturas pueden venir de
     -- cualquier empresa (Ambission, ProyectoModa, etc.) pero el partner_id
     -- las une al mismo cliente. Esto consolida la deuda total del cliente
     -- cruzando empresas.
     AND COALESCE(aic.amount_residual, 0) > 0
     -- Solo facturas NO PAGADAS (alineado con filtro Odoo state='open').
     AND aic.state = 'open'
     -- Política de antigüedad: corte FECHA_CORTE_ANTIGUO, salvo que el cliente
     -- siga activo (compras en los últimos MESES_ACTIVO meses).
     AND (
       aic.date_invoice >= '{FECHA_CORTE_ANTIGUO}'::date
       OR cu.id IN (SELECT cuenta_id FROM cuentas_activas_recientes)
     )
    WHERE COALESCE(cu.is_active, true) = true
      AND COALESCE(cu.manual_inactive, false) = false
      AND COALESCE(cu.approval_status, 'APPROVED') = 'APPROVED'
    GROUP BY cu.id, cu.cuenta_partner_odoo_id, rp.name, rp.vat, rp.phone, rp.mobile,
             cu.departamento, rp.state_name, cu.distrito, rp.district_name,
             cu.asignado_a, u.color_hex, u.nombre_completo,
             cu.credito_linea, cu.terminos_pago_dias
    HAVING COALESCE(SUM(aic.amount_residual), 0) > 0
),
cuentas_clasificadas AS (
    SELECT *,
        CASE
            WHEN credito_linea > 0
                THEN ROUND((saldo_total / credito_linea * 100)::numeric, 1)::float
            ELSE NULL
        END AS pct_ocupacion,
        CASE
            WHEN saldo_vencido > 0                                       THEN 'vencido'
            WHEN credito_linea > 0 AND saldo_total >= credito_linea      THEN 'linea_tope'
            WHEN saldo_por_vencer > 0                                    THEN 'por_vencer'
            WHEN credito_linea > 0 AND saldo_total >= credito_linea * 0.6 THEN 'linea_alta'
            ELSE 'al_dia'
        END AS estado_credito
    FROM cuentas_saldo
)
"""


@router.get("/resumen")
async def resumen_cobranzas(_user: dict = Depends(get_current_user)):
    """KPIs agregados: total por cobrar, vencido, por vencer ≤5d, línea tope/alta.

    Devuelve también conteos por estado para los chips de filtro.
    """
    async with safe_acquire() as conn:
        r = await conn.fetchrow(_CTE_CUENTAS_SALDO + """
            SELECT
                COUNT(*)                                                              AS total_clientes,
                COALESCE(SUM(saldo_total), 0)::float                                  AS total_por_cobrar,
                COALESCE(SUM(saldo_vencido), 0)::float                                AS total_vencido,
                COUNT(*) FILTER (WHERE saldo_vencido > 0)                             AS n_vencidos,
                COALESCE(SUM(saldo_por_vencer), 0)::float                             AS total_por_vencer,
                COUNT(*) FILTER (WHERE saldo_por_vencer > 0 AND saldo_vencido = 0)    AS n_por_vencer,
                COUNT(*) FILTER (WHERE estado_credito = 'linea_tope')                 AS n_linea_tope,
                COUNT(*) FILTER (WHERE estado_credito = 'linea_alta')                 AS n_linea_alta,
                COUNT(*) FILTER (WHERE estado_credito = 'al_dia')                     AS n_al_dia
            FROM cuentas_clasificadas
        """)
        return {
            "total_clientes":    int(r["total_clientes"] or 0),
            "total_por_cobrar":  float(r["total_por_cobrar"] or 0),
            "total_vencido":     float(r["total_vencido"] or 0),
            "n_vencidos":        int(r["n_vencidos"] or 0),
            "total_por_vencer":  float(r["total_por_vencer"] or 0),
            "n_por_vencer":      int(r["n_por_vencer"] or 0),
            "n_linea_tope":      int(r["n_linea_tope"] or 0),
            "n_linea_alta":      int(r["n_linea_alta"] or 0),
            "n_al_dia":          int(r["n_al_dia"] or 0),
        }


@router.get("/cuentas")
async def listar_cuentas_cobranzas(
    estado: str = "",   # '' | vencido | por_vencer | linea_tope | linea_alta | al_dia
    q: str = "",
    asignado_a: str = "",
    depto: str = "",
    sort: str = "saldo_total",  # saldo_total | saldo_vencido | pct_ocupacion | nombre | vence
    dir: str = "desc",
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=500),
    _user: dict = Depends(get_current_user),
):
    """Listado paginado de cuentas con saldo, filtrable por estado/búsqueda.

    El orden por defecto pone primero VENCIDOS y de más antiguos a más recientes.
    """
    async with safe_acquire() as conn:
        offset = (page - 1) * limit
        params: list = []
        where_outer = []

        if estado:
            params.append(estado)
            where_outer.append(f"estado_credito = ${len(params)}")

        if q:
            params.append(f"%{q}%")
            idx = len(params)
            where_outer.append(
                f"(nombre ILIKE ${idx} OR vat ILIKE ${idx} OR phone ILIKE ${idx} OR mobile ILIKE ${idx})"
            )

        if asignado_a:
            params.append(asignado_a)
            where_outer.append(f"asignado_a = ${len(params)}")

        if depto:
            params.append(f"%{depto}%")
            where_outer.append(f"depto ILIKE ${len(params)}")

        where_sql = (" WHERE " + " AND ".join(where_outer)) if where_outer else ""

        sort_map = {
            "saldo_total":     "saldo_total",
            "saldo_vencido":   "saldo_vencido",
            "pct_ocupacion":   "pct_ocupacion",
            "nombre":          "nombre",
            "vence":           "COALESCE(vencimiento_mas_antiguo, proximo_vencimiento)",
        }
        order_col = sort_map.get(sort, "saldo_total")
        order_dir = "ASC" if dir.lower() == "asc" else "DESC"
        nulls = "NULLS LAST" if order_dir == "DESC" else "NULLS FIRST"

        # Default: vencidos primero (más antiguo → más reciente), luego por saldo
        order_by = f"""
            CASE estado_credito
              WHEN 'vencido' THEN 1
              WHEN 'linea_tope' THEN 2
              WHEN 'por_vencer' THEN 3
              WHEN 'linea_alta' THEN 4
              ELSE 5
            END,
            {order_col} {order_dir} {nulls}
        """

        data_params = params + [limit, offset]
        rows = await conn.fetch(
            _CTE_CUENTAS_SALDO + f"""
            SELECT *, COUNT(*) OVER() AS _total
            FROM cuentas_clasificadas
            {where_sql}
            ORDER BY {order_by}
            LIMIT ${len(data_params) - 1} OFFSET ${len(data_params)}
            """,
            *data_params,
        )

        total = int(rows[0]["_total"]) if rows else 0
        items = []
        for r in rows:
            d = row_to_dict(r)
            d.pop("_total", None)
            d["cuenta_id"]       = str(d["cuenta_id"])
            d["partner_odoo_id"] = int(d["partner_odoo_id"])
            items.append(d)

        return {
            "items":  items,
            "total":  total,
            "page":   page,
            "limit":  limit,
        }
