# CRM B2B - PRD (Product Requirements Document)

## Problem Statement
CRM B2B module integrated with Odoo PostgreSQL ODS database. Reads clients and sales from `odoo` schema (read-only), writes CRM-specific data to `crm` schema. Features product catalog approval, client account management with commercial status/classification, contact re-linking, interaction tracking (WhatsApp/calls/visits), task management, and filtered POS sales.

## Architecture
- **Backend**: FastAPI + asyncpg (PostgreSQL)
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Database**: PostgreSQL (external) with schemas `odoo` (read-only) and `crm` (CRM data)
- **Auth**: JWT-based authentication

## Database Schema
### CRM Tables
- `crm.usuario` - Auth users
- `crm.producto_aprobado` - Approved product catalog
- `crm.partner_principal_override` - Manual account re-linking
- `crm.cuenta` - Client accounts with commercial data
- `crm.contacto` - Individual contacts
- `crm.interaccion` - Interaction logs (WhatsApp/calls/visits)
- `crm.tarea` - Tasks/agenda

### CRM Views (reading from Odoo)
- `crm.v_partner_account_final` - Consolidated partner-account mapping
- `crm.v_productos_elegibles` - Eligible product catalog from Odoo
- `crm.v_productos_crm` - Approved products only
- `crm.v_ventas_pos_filtradas` - POS sales filtered by approved products

## What's Been Implemented (2026-02-13)
- Full backend with PostgreSQL (asyncpg) - all CRUD endpoints
- JWT authentication (register/login)
- CRM schema, tables, and views auto-created on startup
- Dynamic column detection for Odoo tables (handles missing columns)
- 7 frontend pages: Login, Dashboard, Catalogo, Cuentas, CuentaDetalle, Contactos, Agenda, Ventas
- Product approval with checkbox (2034 products available)
- Bootstrap/initialize CRM from POS sales data
- Account detail with tabs (Contactos, Ventas, Interacciones, Tareas)
- Contact re-linking dialog
- Task management (create, complete, cancel)
- Interaction logging (WhatsApp, Llamada, Visita, Nota)
- **Vincular contacto existente** (2026-02-13): Search + link unlinked Odoo partners to CRM accounts
- **CRM Restructuring** (2026-02-13):
  - Contactos = ALL odoo.res_partner (GLOBAL, active) with "Cuenta asignada" column
  - Cuentas = Only "free" partners (principal = self) via crm.v_cuentas_libres view
  - Vincular removes partner from Cuentas but keeps in Contactos
  - v_partner_account_final covers ALL odoo partners (override > map > self)
  - Cuentas use odoo_id (int) routing instead of UUID
  - On-demand upsert crm.cuenta on detail page open
  - Stats: cuentas_libres (11,008), total_partners (11,592), contactos_vinculados (584)
- **Catalogo con Stock** (2026-02-13):
  - Replaced manual approval with stock-based catalog
  - Views: crm.v_catalogo_con_stock (template-level), crm.v_catalogo_con_stock_variantes (variant-level)
  - 759+ eligible products with available stock
  - Filters: marca, tipo, tela, entalle, stock_min, orden (stock desc / nombre)
  - Variant detail dialog: barcode, talla, color, disponible, total, reservado
  - Endpoints: GET /api/catalogo, /api/catalogo/marcas, /api/catalogo/tipos, /api/catalogo/{id}/variantes
- All UI in Spanish

## User Credentials
- admin@crm.com / admin123

## Core Stats (after bootstrap)
- 115 Cuentas
- 120 Contactos
- 6 Productos Aprobados
- 847 Ventas Filtradas

## Prioritized Backlog
### P0 (Critical)
- All core features implemented ✅

### P1 (Important)
- Search/filter on Cuentas list page - search by partner name
- Ventas page performance optimization (view queries can be slow on large datasets)
- Bulk product approval (select all / approve all)

### P2 (Nice to Have)
- Export data to CSV/Excel
- WhatsApp message templates
- Sales analytics/charts
- Role-based access control (admin vs vendedor)
- Audit trail for changes
- Auto-mark overdue tasks as VENCIDO

## Next Tasks
1. Optimize Ventas view query performance
2. Add batch product approval
3. Add sales summary/charts to Dashboard
4. Implement role-based permissions
