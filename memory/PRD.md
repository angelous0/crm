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

### Phase 3 - Stock Dashboard (Feb 2026)
12. **Power BI-style dashboard** with main pivot: Modelo x Tienda (stores as columns)
13. Multi-select filters: Tienda, Marca, Tipo, Entalle, Tela, Talla, Color
14. Toggle filters: Es LQ (si/no), Es Negro (si/no)
15. Text search: Modelo
16. KPI cards: Total stock, Modelos, Variantes, Tiendas con stock
17. Pivot by Tienda: Color x Talla matrix for selected store
18. Expandable Modelo x Talla pivot
19. Expandable Detail table with CSV export
20. **Collapsible sidebar** (persists state in localStorage)

## Key DB Views
- `crm.v_partner_account_final` - Maps contacts to accounts
- `crm.v_cuentas_libres` - Free accounts
- `crm.v_catalogo_con_stock` - Products with stock (tiendas only)
- `crm.v_catalogo_con_stock_variantes` - Variant-level stock (tiendas only)
- `crm.v_catalogo_con_stock_variantes_loc` - Variant stock by location
- `crm.v_catalogo_stock_flat` - Flat denormalized view for Stock Dashboard (includes es_lq, es_negro flags)

## Key API Endpoints
- Auth: `POST /api/auth/login`, `POST /api/auth/register`
- Catalogo: `GET /api/catalogo`, `/telas`, `/entalles`, `/{tmpl_id}/matriz`
- Stock Dashboard: `GET /api/stock-dashboard/filtros`, `/kpis`, `/pivot-modelo`, `/pivot-modelo-tienda`, `/pivot-tienda`, `/detalle`
- CRM: `GET /api/cuentas`, `/contactos`, `/cuentas/{odoo_id}`, `POST /cuentas/{odoo_id}/vincular-contacto`

## Tienda Rule
Only locations with `x_nombre IS NOT NULL AND btrim(x_nombre) <> ''` are considered real stores. Internal locations without x_nombre are excluded from all stock calculations and dropdowns.

## Backlog
- No pending tasks from user
