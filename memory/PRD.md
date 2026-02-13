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
4. Cross-filtering (click modelo/talla/color/cell), Multi-select (Ctrl+Click, Shift+Click for tallas)
5. Cascade/dependent filters with counts (`/filter-options-v2`)
6. Selection bar with summary chips and always-visible Reset button
7. Attenuation: opacity-based dimming for non-matching items

### Phase 3.3 - Cube-Based Dashboard
8. modelo_base normalization (LQ stripped), flag_lq
9. `/cube` endpoint with TOP 300 modelos, local cross-filter
10. `/detail` endpoint with pagination

### Phase 3.4 - Odoo Stock Sync Button
11. `POST /api/odoo-sync/run` + `GET /api/odoo-sync/job-status`
12. Frontend: "Actualizar stock" button with polling

### Phase 3.6 - Reposición v2 (Feb 2026) - Pool Capping + Tallado
13. **SKU key**: (marca_norm, tipo, entalle, tela, hilo, color, talla)
14. **ITEM_BASE**: (marca_norm, tipo, entalle, tela, hilo) — for tallado
15. **Tallado**: COUNT DISTINCT (color,talla) per store per ITEM_BASE
16. **Pool capping**: qty_sugerida capped by available stock at origin. Sum across destinations <= pool.
17. **Priority sorting**: Brand prevalence rules + tallado tiebreaker
18. **ELEMENT PREMIUM competition**: GAMARRA 209 vs GRAU by tallado, winner first
19. **Marca prevalencia**: QEPO→BOOSH/GAMARRA207, BOOSH→BOOSH, ELEMENT PREMIUM→GAMARRA209/GM218/GRAU
20. **KPIs**: total_faltantes, con_asignacion, total_qty_sugerida, desde_almacen, entre_tiendas, sin_stock
21. **Drilldown**: Click row → distribution by store + suggestion badge
22. **Zero-qty rows**: opacity-50, motivo "Sin stock para asignar"

### Phase 4 - Balance de Tallas (Feb 2026)
23. **DB View**: `crm.v_stock_balance_flat` - filtered join of stock, locations, variants, templates
24. **GET /api/stock-balance/matrix**: Item x Tallas matrix (MARCA-TIPO-ENTALLE-TELA-HILO), paginated, with filter_opts
25. **GET /api/stock-balance/colors-matrix**: Color x Tallas detail for selected item
26. **Frontend**: `/balance-tallas` page with filter bar, 2-column layout (70/30), color coding, CSV export
27. **Features**: Click row to see color breakdown, attenuation for non-selected, cascade filters
28. **Performance**: Single query + Python aggregation (~2s), 229 items x 13 tallas from 15K source rows

## Key API Endpoints
- Auth: POST /api/auth/login, /register
- Dashboard: GET /api/stock-dashboard/cube, /detail, /filter-options-v2
- Reposición: GET /api/stock-dashboard/reposicion (with pool capping), /reposicion-detalle (with hilo)
- Balance Tallas: GET /api/stock-balance/matrix, /api/stock-balance/colors-matrix
- Sync: POST /api/odoo-sync/run, GET /api/odoo-sync/job-status

## Backlog
### P1
- Persist filter + selection state in URL query string
- UI for paginated "Detalle de Stock" table improvements
- CSV export for replenishment recommendations
### P2
- "Por Arreglar" filter (pending data source)
- Refactor `server.py` into multiple router files
