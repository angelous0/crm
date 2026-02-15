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
- Endpoint: GET /api/cuentas/{cuenta_id}/ventas with doc_tipo, pagination, total_rows
- KPIs per cuenta: qty_total, orders, clientes_distintos
- Tabs: Ventas + Reservas in cuenta detail with row counts in tab labels
- Debug info: partners_count, partner_ids
- Tab counters loaded on mount via lightweight limit=1 calls

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
