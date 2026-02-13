# PRD - CRM B2B

## Problem Statement
Build a B2B CRM application that integrates with an existing PostgreSQL database containing an `odoo` schema. The CRM operates within its own `crm` schema, reading data from `odoo` but only writing to `crm`.

## Architecture
- **Backend:** FastAPI + asyncpg connecting to PostgreSQL
- **Frontend:** React + Shadcn/UI + Tailwind CSS
- **Database:** PostgreSQL with `odoo` (read-only) and `crm` (read-write) schemas
- **Auth:** JWT-based authentication

## Core Features Implemented

### Phase 1 - CRM Base
1. JWT Authentication (login/register)
2. Cuentas - Lists "free" accounts (partners who are their own principal)
3. Contactos - Lists all Odoo partners with assigned account info
4. Cuenta Detalle - Account details, contacts, sales, link contacts
5. Vincular Contactos - Link Odoo partners to CRM accounts
6. Agenda (Tareas) - Task management per account
7. Ventas - POS sales filtered by approved products

### Phase 2 - Catalogo con Stock
8. Auto-lists eligible products with available stock (tiendas only filter)
9. Dropdown filters for Tela, Entalle, Marca, Tipo
10. Price in Peruvian Soles "S/ 00.00"
11. Stock matrix modal: Color x Talla with location filter + totals

### Phase 3 - Stock Dashboard (Feb 2026) - Power BI Layout
12. Power BI-style dashboard with all panels visible simultaneously
13. Tienda canonical mapping (TALLER→ALMACEN, etc.)
14-21. Multi-select/toggle filters, KPIs, Color x Talla matrices, collapsible sidebar

### Phase 3.1 - Cross-Filtering (Feb 2026) ✅
22. Interactive cross-filtering: click modelo/talla/color/cell → filters entire dashboard
23. Filter chips with remove buttons + "Limpiar todo"
24. 300ms debounce, reactive KPIs

### Phase 3.2 - Cascade/Dependent Filters (Feb 2026) ✅
25. **Cascade filter options**: selecting any filter reduces other dropdowns to valid values only
26. New endpoint `GET /api/stock-dashboard/filter-options` with "exclude self" logic per field
27. Auto-clean invalid filters with toast notification
28. 60s backend cache for repeated filter combinations
29. LIMIT 500 per field, tallas sorted by size order
30. Tested: 100% backend (11/11), 100% frontend

## Key DB Views
- `crm.v_partner_account_final`, `crm.v_cuentas_libres`
- `crm.v_catalogo_con_stock`, `crm.v_catalogo_con_stock_variantes`, `crm.v_catalogo_con_stock_variantes_loc`
- `crm.v_catalogo_stock_flat` - Flat denormalized view
- `crm.v_stock_dashboard_base` - Dashboard base with tienda_canonica mapping

## Key API Endpoints
- Auth: `POST /api/auth/login`, `POST /api/auth/register`
- Catalogo: `GET /api/catalogo`, `/telas`, `/entalles`, `/{tmpl_id}/matriz`
- Stock Dashboard: `GET /api/stock-dashboard/filters`, `/filter-options`, `/panels`, `/modelo-talla`, `/detalle`
- CRM: `GET /api/cuentas`, `/contactos`, `/cuentas/{odoo_id}`, `POST /cuentas/{odoo_id}/vincular-contacto`

## Tienda Rule
Only locations with `x_nombre IS NOT NULL AND btrim(x_nombre) <> ''` are considered real stores.

## Backlog (Prioritized)
### P1
- Persist dashboard filter state in URL query string (shareable/reloadable)
### P2
- "Por Arreglar" filter (pending data source definition)
- Multi-selection of filters (SHIFT + click)
### P3
- Refactor `backend/server.py` into multiple router files
