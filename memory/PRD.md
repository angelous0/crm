# PRD - CRM B2B

## Problem Statement
Build a B2B CRM application that integrates with an existing PostgreSQL database containing an `odoo` schema. The CRM operates within its own `crm` schema, reading data from `odoo` but only writing to `crm`.

## Architecture
- **Backend:** FastAPI + asyncpg connecting to PostgreSQL
- **Frontend:** React + Shadcn/UI + Tailwind CSS
- **Database:** PostgreSQL with `odoo` (read-only) and `crm` (read-write) schemas
- **Auth:** JWT-based authentication

## Core Features

### Implemented
1. **Authentication** - JWT login/register
2. **Cuentas (Accounts)** - Lists "free" accounts (partners who are their own principal)
3. **Contactos** - Lists all Odoo partners with assigned account info
4. **Cuenta Detalle** - Account details, contacts, sales, link contacts
5. **Vincular Contactos** - Link Odoo partners to CRM accounts via override table
6. **Catalogo con Stock** - Auto-lists eligible products with available stock
7. **Catalogo Enhanced (Feb 2026)**:
   - Dropdown filters for Tela and Entalle (matching Marca/Tipo style)
   - Price displayed in Peruvian Soles "S/ 00.00"
   - Stock matrix modal: Color (rows) x Talla (columns)
   - Location/tienda filter in matrix
   - Totals per color, per talla, and grand total
   - Optional variant detail table for auditing
8. **Agenda (Tareas)** - Task management per account
9. **Ventas** - POS sales filtered by approved products
10. **Bootstrap** - Initialize CRM from Odoo sales data

## Key DB Views
- `crm.v_partner_account_final` - Maps contacts to accounts
- `crm.v_cuentas_libres` - Free accounts (principal = self)
- `crm.v_catalogo_con_stock` - Products with stock (template level)
- `crm.v_catalogo_con_stock_variantes` - Variant-level stock
- `crm.v_catalogo_con_stock_variantes_loc` - Variant stock by location

## Key API Endpoints
- `POST /api/auth/login`, `POST /api/auth/register`
- `GET /api/catalogo` - Products with filters
- `GET /api/catalogo/telas`, `/entalles`, `/marcas`, `/tipos` - Filter options
- `GET /api/catalogo/{tmpl_id}/matriz?location_id=ALL|{id}` - Stock matrix
- `GET /api/catalogo/{tmpl_id}/variantes` - Variant details
- `GET /api/cuentas`, `GET /api/contactos`
- `GET /api/cuentas/{odoo_id}` - Account detail
- `POST /api/cuentas/{odoo_id}/vincular-contacto`

## Backlog
- No pending tasks from user
