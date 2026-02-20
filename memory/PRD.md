# CRM B2B - Product Requirements Document

## Overview
B2B CRM application integrated with Odoo ERP via PostgreSQL. Manages accounts, contacts, sales, reservations, credits, interactions, and tasks.

## Architecture
- **Frontend**: React + Shadcn UI, hosted on port 3000
- **Backend**: FastAPI + asyncpg (PostgreSQL), hosted on port 8001
- **Database**: External Odoo PostgreSQL (read) + CRM schema (read/write) + MongoDB (auth)
- **Auth**: JWT-based with MongoDB user store

## Core Modules

### 1. Cuentas (Accounts) - Airtable Layout [DONE - Feb 2026]
Full Airtable-style split-view module at `/cuentas`:
- **Top Toolbar**: Search, filter (Estado/Clasificacion/Ciudad/Vendedor), count badge
- **Left Pane (Directory Grid)**: Mini-table with columns (Cuenta, Ciudad, Estado, Ult. compra, Dias, Vtas 12m, #). Sorting by name. Pagination (50/page). Color-coded days badges.
- **Right Pane (Detail Panel)**: Compact header (name, badges, KPIs) + 11 tabs
- **URL State**: `?q=&estado=&selected=ID&tab=tabname&page=N` fully shareable
- **Responsive**: Mobile shows directory list; tap row shows detail full-width

### 2. Tabs in Detail Panel
- **Resumen**: KPI cards (Ventas, Reservas, Creditos, Ultima compra) + quick nav links
- **Ventas**: Orders table with detail mode toggle (lines view)
- **Reservas**: Same as Ventas but for reservations
- **Creditos**: Invoices table with saldo display
- **Info Ventas**: Classification breakdown with 2-level drill-down (classification → orders → lines)
- **YoY**: Year-over-year comparison with KPIs, monthly series, item breakdown
- **Analitica**: Purchase frequency and top items analysis
- **Contactos**: Linked contacts list + link new contact search
- **Interacciones**: WhatsApp/call/visit/note log with create dialog
- **Tareas**: Task management with create/complete
- **Perfil**: Commercial data form (estado, clasificacion, asignado, notas)

### 3. Product Catalog Filter [DONE]
Global filter excluding non-essential products from commercial views.

### 4. Other Modules [DONE]
- Stock Dashboard, Balance de Tallas, Ventas y Reservas, Creditos, Catalogo, Contactos, Agenda

## Key API Endpoints
- `GET /api/cuentas/list` - Directory listing with filters, sorting, pagination, KPIs
- `GET /api/cuentas/list/filter-options` - Dropdown values for toolbar filters
- `GET /api/cuentas/{id}` - Account detail with partner info
- `GET /api/cuentas/{id}/header-metrics` - Compact header KPIs
- `GET /api/cuentas/{id}/ventas/metrics` - Sales/reservation metrics
- `GET /api/cuentas/{id}/ventas/orders` - Paginated orders
- `GET /api/cuentas/{id}/ventas/lines` - Paginated order lines
- `GET /api/cuentas/{id}/ventas/clasificacion` - Classification breakdown
- `GET /api/cuentas/{id}/ventas/clasificacion/orders` - Orders by classification
- `GET /api/cuentas/{id}/ventas/yoy/*` - YoY comparison endpoints
- `GET /api/cuentas/{id}/analytics/*` - Analytics endpoints
- `GET /api/cuentas/{id}/creditos/*` - Credit endpoints
- `GET /api/cuentas/{id}/contactos` - Linked contacts
- `GET/POST /api/cuentas/{id}/interacciones` - Interactions
- `GET/POST /api/cuentas/{id}/tareas` - Tasks

## Backlog (Prioritized)
### P1
- Add data counters to directory menu items (e.g., Ventas (282), Creditos (45))
- Column sorting in directory grid by all columns (last_purchase, sales_12m, days_since, orders_12m)

### P2
- Dormancy status semaphore in analytics
- Reserves vs. Sales comparison section
- Credit summary dashboard
- Resizable left panel with drag handle

### P3
- "Include excluded products" toggle for commercial views
- Refactor stock dashboard endpoints to dedicated router
- Persist stock dashboard filter state in URL
- Export directory list to CSV
- Fix recurring automated login test failure

## File Structure
```
frontend/src/
  pages/CuentasAirtable.jsx          # Main Airtable page
  components/cuentas/
    CuentasToolbar.jsx                # Search + filters toolbar
    CuentasDirectoryGrid.jsx          # Left pane mini-grid
    CuentaDetailPanel.jsx             # Right pane with header + tabs
    tabs/
      ResumenTab.jsx, VentasTab.jsx, ReservasTab.jsx, CreditosTab.jsx
      InfoVentasTab.jsx, ContactosTab.jsx, InteraccionesTab.jsx
      TareasTab.jsx, PerfilTab.jsx
  pages/YoYTab.jsx, AnaliticaTab.jsx  # Standalone tab components

backend/
  server.py                           # Main FastAPI app with all endpoints
  db.py                               # DB views and product catalog filter
  routers/yoy.py                      # YoY comparison endpoints
  routers/analytics.py                # Analytics endpoints
```
