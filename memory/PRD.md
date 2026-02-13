# PRD - CRM B2B

## Problem Statement
Build a B2B CRM application integrated with PostgreSQL (Odoo schema). CRM operates in `crm` schema, reading from `odoo`, writing only to `crm`.

## Architecture
- **Backend:** FastAPI + asyncpg → PostgreSQL
- **Frontend:** React + Shadcn/UI + Tailwind CSS
- **Auth:** JWT-based

## Core Features Implemented

### Phase 1 - CRM Base
1. JWT Auth (login/register)
2. Cuentas, Contactos, Cuenta Detalle, Vincular Contactos
3. Agenda (Tareas), Ventas

### Phase 2 - Catalogo con Stock
4. Auto-list products with stock, filters (Tela, Entalle, Marca, Tipo)
5. Price formatting S/, Stock matrix modal (Color x Talla)

### Phase 3 - Stock Dashboard - Power BI Style (Feb 2026)
6. Fixed 7-panel layout: Modelo x Talla (left), 2x3 store grid (center), ALMACEN (right)
7. Tienda canonical mapping, multi-select/toggle filters, KPIs
8. Collapsible sidebar

### Phase 3.1 - Cross-Filtering ✅
9. Click modelo/talla/color/cell → filter entire dashboard
10. Filter chips + "Limpiar todo"

### Phase 3.2 - Cascade/Dependent Filters ✅
11. `/filter-options-v2` endpoint: each field excludes itself from cascade
12. Auto-clean invalid filters + toast

### Phase 3.3 - Cube-Based Dashboard (Power BI Feel) ✅ (Feb 2026)
13. **modelo_base normalization**: Strip LQ suffixes (regex `\mLQ\d*\M`), flag_lq
    - VANDROS-LQ → modelo_base=VANDROS, flag_lq=true
    - 879 raw models → 700 modelo_base (179 LQ consolidated)
14. **`/cube` endpoint**: Pre-aggregated cube (tienda, modelo_base, lq, color, talla, qty)
    - TOP 300 modelos by stock when no modelo filter
    - ~11K rows, compact keys {t,m,lq,c,z,q}
15. **Local cross-filter**: Frontend stores cube in memory, selections filter locally (INSTANT)
    - selection state: {modelo, talla, color, tienda} - separate from bar filters
    - "Reset selección" button clears selection only
    - Blue selection chips bar
16. **`/detail` endpoint**: Paginated detail with both bar filters + selection params
17. **Negro rule expanded**: hilo ILIKE negro + color includes plomo/carbon/carbón/grafito
18. **Tested**: 100% backend (19/19), 100% frontend

## Key DB Views
- `crm.v_catalogo_stock_flat`: Flat denormalized (improved es_negro with carbón/grafito)
- `crm.v_stock_dashboard_base`: +modelo_base, +flag_lq, tienda_canonica mapping

## Key API Endpoints
- Auth: POST /api/auth/login, /register
- Catalogo: GET /api/catalogo, /telas, /entalles, /{tmpl_id}/matriz
- **Dashboard v2**: GET /api/stock-dashboard/cube, /detail, /filter-options-v2
- Dashboard legacy: /filters, /filter-options, /panels, /modelo-talla (unused)
- CRM: GET /api/cuentas, /contactos, /cuentas/{odoo_id}

## Backlog
### P1
- Persist filter + selection state in URL query string (shareable)
### P2
- "Por Arreglar" filter (pending data source)
- Multi-selection (SHIFT + click)
### P3
- Refactor `server.py` into multiple router files
