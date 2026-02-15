# PRD - CRM B2B Stock Dashboard

## Original Problem Statement
Build a "Stock Dashboard" with "Power BI Feel" for a B2B CRM managing stock, sales, and reservations from Odoo POS data.

## Architecture
- **Frontend:** React + Shadcn/UI + Tailwind CSS
- **Backend:** FastAPI + PostgreSQL (asyncpg)
- **Database:** PostgreSQL with Odoo schema + CRM schema views

## Modules

### 1. Stock Dashboard (DONE)
- Interactive dashboard with cube aggregation
- Cascading filters with counts
- KPIs, charts, detail table

### 2. Balance de Tallas (DONE)

### 3. Reposicion v2 (DONE)

### 4. Ventas y Reservas (DONE - Feb 2026)
- Tabs: Ventas/Reservas, cascade filters, KPIs (Qty, Ordenes, Clientes)
- Top 10 Productos grouped by Marca+Tipo+Entalle+Tela+Hilo
- Top 10 Clientes, "Excluir Clientes Varios" toggle
- Detail table with modelo_display, IDs copy, CSV export
- No subtotal shown, no contacto column

### 5. CRM Module (DONE)
- Cuentas, Contactos, Interacciones, Tareas, Agenda

### 6. Ventas/Reservas/Creditos - "Power BI feel" (DONE - Feb 2026)
**Architecture:**
- Header views: `crm.v_comercial_order_header` (1 row per POS order), `crm.v_credito_invoice_header` (1 row per invoice)
- Line views: `crm.v_comercial_mov_flat` (POS lines), `crm.v_credito_flat` (invoice lines)
- Per-cuenta endpoints use direct queries (not views) for performance

**Global pages:**
- /comercial: Order headers table + KPIs (Ordenes, Unidades, Clientes) + Drawer for lines
- /creditos: Invoice headers table + KPIs (Facturas, Unidades, Saldo, Clientes) + Drawer for lines
- Click any row -> Drawer opens on right with on-demand line detail

**Cuenta detail tabs:**
- Ventas: Order headers (doc_tipo=SALE) + click -> drawer
- Reservas: Order headers (doc_tipo=RESERVA) + click -> drawer
- Creditos: Invoice headers + click -> drawer
- Tab labels: "Ventas (Ordenes: N)" chip "Uds: N", "Creditos (Facturas: N)" chip "Uds: N" + "Saldo: S/ N"

**Endpoints:**
- GET /api/comercial/orders (global headers)
- GET /api/comercial/orders/{order_id}/lines (on-demand detail)
- GET /api/creditos/invoices (global headers)
- GET /api/creditos/invoices/{invoice_id}/lines (on-demand detail)
- GET /api/cuentas/{id}/ventas/metrics, /ventas/orders (per-cuenta, direct SQL)
- GET /api/cuentas/{id}/creditos/metrics, /creditos/invoices (per-cuenta, direct SQL)

## Key Views
- `crm.v_comercial_mov_flat` - Unified SALE+RESERVA with owner mapping, modelo_display
- `crm.v_cuenta_partners` - All partner_ids for a cuenta (main + manual + auto-linked)
- `crm.v_partner_account_final` - Partner account linking
- `crm.v_stock_dashboard_base` - Stock dashboard base

### 7. Detail Mode Toggle (DONE - Feb 2026)
**Feature:** Toggle "Modo detalle (lineas)" on all data pages to switch between header and line-level views.

**Global pages (ComercialPage, CreditosPage):**
- Toggle in filter bar switches between header table (orders/invoices) and lines table (individual product lines)
- KPIs remain consistent in both modes (computed from header view)
- Drawer only available in header mode
- "LINEAS" badge visible when detail mode active

**Cuenta detail (CuentaDetalle):**
- Single toggle bar affects Ventas, Reservas, and Creditos tabs
- Header mode: order/invoice headers with drawer
- Detail mode: product-level line data directly in table

**New Endpoints:**
- GET /api/comercial/lines (global paginated lines)
- GET /api/creditos/lines (global paginated lines)
- GET /api/cuentas/{id}/ventas/lines (account-specific, direct SQL)
- GET /api/cuentas/{id}/creditos/lines (account-specific, direct SQL)

### 8. Info Ventas Tab - Clasificacion (DONE - Feb 2026)
**Feature:** New "Info Ventas" tab in CuentaDetalle showing sales summary by classification (marca, tipo, entalle).

**Data:**
- Only SALE orders (no reservas, no cancelled)
- Aggregated: marca, tipo, entalle, ultima_fecha_compra (MAX), cantidad (SUM qty), ventas (SUM subtotal), compras (COUNT DISTINCT orders)
- Sorted by ventas DESC
- Click row -> drawer with drilldown individual lines (paginated)
- Date filters (fecha_desde, fecha_hasta)

**New Endpoints:**
- GET /api/cuentas/{id}/ventas/clasificacion (aggregated by marca/tipo/entalle)
- GET /api/cuentas/{id}/ventas/clasificacion/detail (drilldown lines for specific item)

### 9. Product Catalog Filter (DONE - Feb 2026)
**Feature:** Global filter excluding "unimportant" products from all commercial views and endpoints.

**Filter criteria (on product_template pt):**
- `pt.sale_ok = true`
- `pt.purchase_ok = false`
- `pt.name NOT ILIKE '%correa%'`
- `pt.name NOT ILIKE '%saco%'`
- `pt.name NOT ILIKE '%bolsa%'`
- `pt.name NOT ILIKE '%probador%'`
- `pt.name NOT ILIKE '%paneton%'`
- `pt.name NOT ILIKE '%publicitario%'`
- Lines with `product_id IS NULL` are excluded
- Orders with 0 remaining lines after filter are excluded

**Modified Views (db.py):**
- `crm.v_comercial_mov_flat` - Added INNER JOINs + catalog filter in WHERE
- `crm.v_comercial_order_header` - Aggregates from filtered lines only (INNER JOIN + catalog filter in subquery)

**Modified Endpoints (server.py):**
- Uses reusable `_CATALOG_JOIN` and `_CATALOG_FILTER` constants
- `/api/cuentas/{id}/ventas/metrics` - Combined query with catalog filter
- `/api/cuentas/{id}/ventas/orders` - Filtered agg subquery (INNER JOIN)
- `/api/cuentas/{id}/ventas/clasificacion` - INNER JOIN + catalog filter
- `/api/cuentas/{id}/ventas/clasificacion/detail` - INNER JOIN + catalog filter
- `/api/cuentas/{id}/ventas/lines` - INNER JOIN + catalog filter

**No toggle** - filter always active by default (toggle deferred).

### 10. Info Ventas 2-Level Drill-Down (DONE - Feb 2026)
**Feature:** 2-level navigation in Info Ventas tab: Item -> Orders -> Lines

**Level 1 - Orders by Classification:**
- New endpoint: `GET /api/cuentas/{id}/ventas/clasificacion/orders`
- Params: marca, tipo, entalle (required), fecha_desde, fecha_hasta (optional), page, limit
- Returns: order_id, order_name, date_order, qty_item, ventas_item, lines_count
- Groups by order_id from raw tables with catalog filter
- Ordered by date_order DESC, paginated

**Level 2 - Order Lines:**
- Reuses: `GET /api/comercial/orders/{order_id}/lines`
- Returns: modelo_display, talla, color, qty, price_unit, subtotal

**Frontend (CuentaDetalle.jsx):**
- ClasifDetailDrawer rewritten with 2-level navigation
- Breadcrumb: "Ordenes > OrderName"
- Back button to return from Level 2 to Level 1
- Pagination at both levels

## Backlog
- P1: Enhance drill-down drawer in "Info Ventas" tab (order-level summary first, then expand to lines) - deferred by user
- P1: Toggle "Incluir productos excluidos" for auditoría (deferred by user)
- P2: Refactor stock dashboard endpoints from server.py to own router
- P2: Persist dashboard filter state in URL
- P2: Frontend UI for "Detalle de Stock" paginated table
- P2: "Por Arreglar" filter implementation
- P2: Tienda filter for Ventas y Reservas (blocked: no POS location data)
- P3: Persist "Modo detalle" toggle state in localStorage
