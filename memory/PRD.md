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
│       └── comercial.py       # Ventas y Reservas + Owner mapping
├── frontend/
│   ├── src/
│   │   ├── App.js
│   │   ├── lib/api.js
│   │   ├── components/Layout.jsx
│   │   └── pages/
│   │       ├── StockDashboard.jsx
│   │       ├── ReposicionTab.jsx
│   │       ├── BalanceTallas.jsx
│   │       └── ComercialPage.jsx  # Ventas y Reservas
```

## Key Database Views
- `crm.v_stock_dashboard_base` - Stock dashboard data
- `crm.v_stock_balance_flat` - Balance de tallas
- `crm.v_comercial_mov_flat` - Unified sales + unused reservations with OWNER mapping
- `crm.v_partner_account_final` - Partner → cuenta principal mapping (used by comercial)

## Completed Features
1. **Stock Dashboard** - Interactive cross-filtering dashboard with store panels
2. **Reposicion Module v2** - SKU-level summary with drill-down
3. **Balance de Tallas** - Size matrix report with color drill-down
4. **Authentication** - JWT-based login/register
5. **Odoo Sync** - Stock quants synchronization
6. **Ventas y Reservas** (Feb 2026)
   - View crm.v_comercial_mov_flat with SALE/RESERVA filters
   - 3 endpoints: /api/comercial/summary, /filter-options, /detail
   - Parallel async queries with asyncio.gather
   - Frontend: tabs, filters, KPIs, top 10 tables, paginated detail
7. **Owner Mapping** (Feb 2026)
   - Uses crm.v_partner_account_final for contacto → cuenta principal
   - owner_partner_id = COALESCE(paf.cuenta_partner_odoo_id, contacto_partner_id)
   - Top clientes groups by owner, detail shows Cuenta + Contacto columns
   - 87K+ rows have different owner vs contact
   - Testing: Backend 13/13 (100%), Frontend 100%

## Backlog
### P1
- Refactor dashboard endpoints from server.py to dedicated router
- Persist filter state in URL for sharing
- Implement "Detalle de Stock" paginated table UI

### P2
- Implement "Por Arreglar" filter
- Fix recurring automated login test failure
- Add tienda info if pos_session/pos_config become available
