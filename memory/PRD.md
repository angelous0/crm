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
12. **Power BI-style dashboard** with all panels visible simultaneously:
    - Dark filter bar with slicers at top
    - Left: Modelo x Talla pivot
    - Center: 2x3 grid (GRAU 238/GRAU 55, GAMARRA 209, GM218, BOOSH, GAMARRA 207, TOTAL)
    - Right: ALMACEN panel
13. Tienda canonical mapping (TALLER→ALMACEN, GM209→GAMARRA 209, GR238+GR55→GRAU 238/GRAU 55, etc.)
14. Multi-select filters: Tienda, Marca, Tipo, Entalle, Tela, Talla, Color
15. Toggle filters: Es LQ, Es Negro, Por Arreglar (placeholder)
16. KPIs in filter bar: Stock, Modelos, Variantes
17. Each panel: Color x Talla matrix with amber total rows
18. TOTAL panel = sum of all canonical stores
19. PROBADOR models excluded
20. Expandable detail table with CSV export
21. **Collapsible sidebar** (persists in localStorage)

### Phase 3.1 - Cross-Filtering (Feb 2026) ✅
22. **Interactive cross-filtering** on Stock Dashboard:
    - Click modelo name → filters entire dashboard by that modelo
    - Click talla header → filters by talla (amber highlight)
    - Click color name → filters by color (blue highlight)
    - Click cell → toggles both color and talla filters
    - Active filter chips with individual remove (X) buttons
    - "Limpiar todo" button resets all filters
    - 300ms debounce on filter changes
    - All panels + KPIs update reactively
    - Tested: 100% backend (17/17), 100% frontend

## Key DB Views
- `crm.v_partner_account_final` - Maps contacts to accounts
- `crm.v_cuentas_libres` - Free accounts
- `crm.v_catalogo_con_stock` - Products with stock (tiendas only)
- `crm.v_catalogo_con_stock_variantes` - Variant-level stock (tiendas only)
- `crm.v_catalogo_con_stock_variantes_loc` - Variant stock by location
- `crm.v_catalogo_stock_flat` - Flat denormalized view for catalog/stock
- `crm.v_stock_dashboard_base` - Dashboard base with tienda_canonica mapping, probador excluded

## Key API Endpoints
- Auth: `POST /api/auth/login`, `POST /api/auth/register`
- Catalogo: `GET /api/catalogo`, `/telas`, `/entalles`, `/{tmpl_id}/matriz`
- Stock Dashboard: `GET /api/stock-dashboard/filters`, `/panels`, `/modelo-talla`, `/detalle`
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
