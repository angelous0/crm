# PRD - CRM B2B

## Problem Statement
Build a B2B CRM application integrated with PostgreSQL (Odoo schema). CRM operates in `crm` schema, reading from `odoo`, writing only to `crm`.

## Architecture
- **Backend:** FastAPI + asyncpg → PostgreSQL + Odoo XML-RPC
- **Frontend:** React + Shadcn/UI + Tailwind CSS
- **Auth:** JWT-based

## Core Features Implemented

### Phase 1 - CRM Base
1. JWT Auth, Cuentas, Contactos, Cuenta Detalle, Vincular, Agenda, Ventas

### Phase 2 - Catalogo con Stock
2. Auto-list products with stock, filters, S/ prices, stock matrix modal

### Phase 3 - Stock Dashboard - Power BI Style (Feb 2026)
3. 7-panel layout, tienda canonical mapping, collapsible sidebar
4. Cross-filtering (click modelo/talla/color/cell)
5. Cascade/dependent filters (`/filter-options-v2`)

### Phase 3.3 - Cube-Based Dashboard
6. modelo_base normalization (LQ stripped), flag_lq
7. `/cube` endpoint with TOP 300 modelos, local cross-filter
8. `/detail` endpoint with pagination + selection params
9. Negro rule expanded (carbon/grafito)

### Phase 3.4 - Odoo Stock Sync Button (Feb 2026)
10. `POST /api/odoo-sync/run`: Triggers STOCK_QUANTS sync job
11. `GET /api/odoo-sync/job-status`: Returns job + last_run info
12. Frontend: Green "Actualizar stock" button with polling

### Phase 3.5 - Power BI Multi-Select & Attenuation (Feb 2026)
13. Multi-select: Click (replace), Ctrl/Cmd+Click (toggle), Shift+Click (range tallas)
14. Selection state: `Set<string>` per axis (modelos, tallas, colores, tiendas)
15. Attenuation: opacity-based dimming for non-matching items (AND across axes)
16. Selection bar always visible: summary chips ("Modelo: N seleccionados"), Reset button, hint text
17. Filter dropdowns with counts from `/filter-options-v2` (Xm Yv format)
18. KPIs update dynamically based on local selection
19. All cross-filter 100% local, no backend calls on clicks

## Key API Endpoints
- Auth: POST /api/auth/login, /register
- Dashboard: GET /api/stock-dashboard/cube, /detail, /filter-options-v2
- Sync: POST /api/odoo-sync/run, GET /api/odoo-sync/job-status
- CRM: /api/cuentas, /contactos, /catalogo

## Backlog
### P1
- Persist filter + selection state in URL query string
- UI for paginated "Detalle de Stock" table (backend exists)
### P2
- "Por Arreglar" filter (pending data source)
- Refactor `server.py` into multiple router files
