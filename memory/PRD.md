# Stock Dashboard CRM B2B - PRD

## Original Problem Statement
Build a "Stock Dashboard" with a "Power BI Feel" for a B2B CRM application integrated with Odoo.

## Architecture
- **Frontend:** React + Shadcn/UI + Tailwind CSS (port 3000)
- **Backend:** FastAPI + PostgreSQL (asyncpg) (port 8001)
- **Database:** PostgreSQL with `crm` and `odoo` schemas
- **Integration:** Odoo XML-RPC for stock sync

## Code Structure
```
/app
├── backend/
│   ├── server.py
│   ├── db.py
│   └── routers/
│       ├── odoo_sync.py
│       ├── stock_balance.py
│       ├── reposicion.py
│       └── comercial.py       # NEW: Ventas y Reservas
├── frontend/
│   ├── src/
│   │   ├── App.js
│   │   ├── lib/api.js
│   │   ├── components/Layout.jsx
│   │   └── pages/
│   │       ├── StockDashboard.jsx
│   │       ├── ReposicionTab.jsx
│   │       ├── BalanceTallas.jsx
│   │       └── ComercialPage.jsx  # NEW: Ventas y Reservas
```

## Key Database Views
- `crm.v_stock_dashboard_base` - Stock dashboard data
- `crm.v_stock_balance_flat` - Balance de tallas
- `crm.v_comercial_mov_flat` - NEW: Unified sales + unused reservations

## Completed Features
1. **Stock Dashboard** - Interactive cross-filtering dashboard with store panels
2. **Reposicion Module v2** - SKU-level summary with drill-down
3. **Balance de Tallas** - Size matrix report with color drill-down
4. **Authentication** - JWT-based login/register
5. **Odoo Sync** - Stock quants synchronization
6. **Ventas y Reservas** (Feb 2026) - NEW
   - View: crm.v_comercial_mov_flat joining v_pos_line_full + res_partner + product_template
   - SALE filter: non-cancelled, non-reservation
   - RESERVA filter: non-cancelled, reservation=true, unused (reserva_use_id=0)
   - 3 endpoints: /api/comercial/summary, /filter-options, /detail
   - Parallel async queries with asyncio.gather
   - Frontend: tabs, date/catalog filters, KPIs, top 10 tables, paginated detail
   - Testing: Backend 15/15 (100%), Frontend 100%

## Backlog
### P1
- Refactor dashboard endpoints from server.py to dedicated router
- Persist filter state in URL for sharing
- Implement "Detalle de Stock" paginated table UI

### P2
- Implement "Por Arreglar" filter
- Fix recurring automated login test failure
- Add tienda info to comercial view if pos_session/pos_config become available
