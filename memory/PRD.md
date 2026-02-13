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
- Cascading filters with counts (tienda, marca, tipo, entalle, tela, hilo, talla, color)
- KPIs, charts, detail table

### 2. Balance de Tallas (DONE)
- Tallas report with pivot-style display

### 3. Reposicion v2 (DONE)
- Replenishment module

### 4. Ventas y Reservas (DONE - Feb 2026)
**Features implemented:**
- Tabs: Ventas (SALE) / Reservas (RESERVA)
- KPIs: Cantidad Total, Ordenes, Clientes (distinct owner_partner_id)
- Top 10 Productos: grouped by Marca+Tipo+Entalle+Tela+Hilo with Qty and Ordenes
- Top 10 Clientes: by owner_partner_name with Qty and Ordenes
- Detail table: Fecha, Orden, Cliente, Modelo, Marca, Tipo, Entalle, Tela, Hilo, Talla, Color, Qty, P.Unit, IDs
- Cascade filters with counts (marca, tipo, entalle, tela, hilo, talla, color)
- Modelo search (typeahead)
- Cliente search (by owner_partner_name / cuenta principal)
- "Excluir Clientes Varios" toggle
- modelo_display field with fallback for null product names
- IDs column (tmpl_id/var_id) with copy-to-clipboard in detail table
- CSV export
- Cursor-based pagination
- Owner/Account linking via crm.v_partner_account_final
- NULL product_id rows excluded from view

**NOT available:** Tienda filter (POS data lacks session/location info)

### 5. CRM Module (DONE)
- Cuentas, Contactos, Interacciones, Tareas, Agenda

## Key Views
- `crm.v_comercial_mov_flat` - Unified SALE+RESERVA view with owner mapping and modelo_display
- `crm.v_stock_dashboard_base` - Stock dashboard base
- `crm.v_partner_account_final` - Partner account linking
- `crm.v_stock_balance_flat` - Balance de tallas

## Backlog
- P1: Refactor stock dashboard endpoints from server.py to own router
- P1: Persist dashboard filter state in URL
- P1: Frontend UI for "Detalle de Stock" paginated table
- P2: "Por Arreglar" filter implementation
- P2: Fix automated login test (recurring)
