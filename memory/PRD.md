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
│   ├── server.py        # Main FastAPI app, auth, dashboard endpoints
│   ├── db.py            # DB connection, views creation
│   └── routers/
│       ├── odoo_sync.py
│       ├── stock_balance.py  # Balance de Tallas endpoints
│       └── reposicion_v2.py  # Reposicion SKU endpoints
├── frontend/
│   ├── src/
│   │   ├── App.js
│   │   ├── lib/api.js
│   │   └── pages/
│   │       ├── StockDashboard.jsx
│   │       ├── ReposicionTab.jsx
│   │       ├── BalanceTallas.jsx
│   │       └── ... (Dashboard, Login, Catalogo, etc.)
```

## Completed Features
1. **Stock Dashboard** - Interactive cross-filtering dashboard with store panels, modelo x talla matrix
2. **Reposicion Module v2** - SKU-level summary with drill-down to models, allocation recommendations
3. **Balance de Tallas** - Size matrix report with color drill-down, in-memory processing optimization
4. **Authentication** - JWT-based login/register
5. **Odoo Sync** - Stock quants synchronization

## P0 Bug Investigation (Feb 2026)
- User reported "stock dashboard not loading"
- Investigation: Could NOT reproduce. All features working correctly
- Testing: Backend 27/27 tests pass, Frontend all pages verified
- Likely cause: transient issue (session expiry, network, or cache)

## Backlog
### P1
- Refactor dashboard endpoints from server.py to dedicated router
- Persist filter state in URL for sharing
- Implement "Detalle de Stock" paginated table UI

### P2
- Implement "Por Arreglar" filter
- Fix recurring automated login test failure
