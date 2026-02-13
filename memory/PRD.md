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

### Phase 3.3 - Cube-Based Dashboard ✅
6. modelo_base normalization (LQ stripped), flag_lq
7. `/cube` endpoint with TOP 300 modelos, local cross-filter
8. `/detail` endpoint with pagination + selection params
9. Negro rule expanded (carbón/grafito)

### Phase 3.4 - Odoo Stock Sync Button ✅ (Feb 2026)
10. **`POST /api/odoo-sync/run`**: Triggers STOCK_QUANTS sync job
    - Validates job exists + enabled
    - Creates sync_run_log entry (RUNNING)
    - Background task: XML-RPC to Odoo → upsert odoo.stock_quant
    - Updates sync_run_log (OK/FAILED) + sync_job (cursor, timestamps)
    - Global _sync_running flag prevents concurrent syncs
11. **`GET /api/odoo-sync/job-status`**: Returns job + last_run info
12. **Frontend**: Green "Actualizar stock" button in filter bar
    - Click → POST /run → polling every 3s → toast result → refresh cube
    - Shows "Sync: dd/mm, hh:mm" last sync time
    - Button disabled + spinner during sync
    - Tested: 100% backend (9/9), 100% frontend

## Key API Endpoints
- Auth: POST /api/auth/login, /register
- Dashboard: GET /api/stock-dashboard/cube, /detail, /filter-options-v2
- **Sync**: POST /api/odoo-sync/run, GET /api/odoo-sync/job-status
- CRM: /api/cuentas, /contactos, /catalogo

## Backlog
### P1
- Persist filter + selection state in URL query string
### P2
- "Por Arreglar" filter (pending data source)
- Multi-selection (SHIFT + click)
### P3
- Refactor `server.py` into multiple router files
