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

### 6. Ventas Tab in Cuentas (DONE - Feb 2026)
- **crm.cuenta_vinculo** table for manual partner linking
- **crm.v_cuenta_partners** view combining: main partner + manual links + Odoo auto-links
- Endpoint: GET /api/cuentas/{cuenta_id}/ventas/metrics (orders_count, lines_count, qty_total, date range)
- Endpoint: GET /api/cuentas/{cuenta_id}/ventas (paginated line detail)
- Tab labels: "Ventas (Ordenes: N)" + chip "Uds: N", same for Reservas
- Metrics loaded on mount via lightweight /metrics calls, detail loaded on tab click
- Debug info: partners_count, partner_ids

### Key KPI Definitions
- orders_count = COUNT(DISTINCT order_id) — primary counter
- lines_count = COUNT(*) — informational only
- qty_total = SUM(qty) — units
- Ventas y Reservas module KPIs: Ordenes, Unidades, Clientes (no Subtotal)

### 7. Creditos Module (DONE - Feb 2026)
- **crm.v_credito_flat** view: invoice credit lines joined with cuenta partners + products
  - Deduped via DISTINCT ON (partner_id) to avoid multiplied rows
  - Includes: invoice_id, number, date, state, partner, amount_total/residual, product info (marca, tipo, entalle, tela, hilo, talla, color)
- **Cuenta tab**: "Creditos (Facturas: N)" with chips "Uds: N" and "Saldo: S/ N"
  - Endpoints: GET /api/cuentas/{id}/creditos/metrics + GET /api/cuentas/{id}/creditos
- **Global page**: /creditos with filterable KPIs + paginated detail table
  - Endpoints: GET /api/creditos/metrics + GET /api/creditos + GET /api/creditos/filter-options
  - Filters: fecha, state, marca, tipo, entalle, tela, hilo, modelo, cliente, solo_con_saldo
  - Click on client name navigates to cuenta detail

## Key Views
- `crm.v_comercial_mov_flat` - Unified SALE+RESERVA with owner mapping, modelo_display
- `crm.v_cuenta_partners` - All partner_ids for a cuenta (main + manual + auto-linked)
- `crm.v_partner_account_final` - Partner account linking
- `crm.v_stock_dashboard_base` - Stock dashboard base

## Backlog
- P1: Refactor stock dashboard endpoints from server.py to own router
- P1: Persist dashboard filter state in URL
- P1: Frontend UI for "Detalle de Stock" paginated table
- P2: "Por Arreglar" filter implementation
- P2: Tienda filter for Ventas y Reservas (blocked: no POS location data)
