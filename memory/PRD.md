# CRM B2B - Product Requirements Document

## Overview
CRM B2B for managing accounts, contacts, sales, credits, stock, and analytics sourced from Odoo ERP.

## Core Requirements

### 1. Airtable-Style Cuentas Module (DONE)
- Full-screen 2-pane layout: directory grid (left 800px) + detail panel (right)
- Server-side filtering, sorting, pagination
- URL state management for all filters and selections

### 2. Account/Contact Soft Deactivation (DONE)
- Activate/deactivate accounts and contacts individually or in bulk
- `manual_inactive` flag prevents Odoo sync from re-activating records

### 3. Sales Order Customer Override (DONE - Feb 2026)
- Table `crm.pos_order_partner_override` with `active` flag, soft-delete
- UI: REASIGNADO badge, customer search modal

### 4. Directory Columns Enhancement (DONE - Feb 2026)
- **Columns**: Cuenta, Depto, Ult.compra (con año), Hace (dias), Cant., #Comp., Tel, %YTD
- **Materialized view** `crm.mv_cuenta_sales_kpi` for fast KPI sorting (<1s)
- **"Hace" column**: Days since last purchase with color coding (green ≤30d, blue ≤90d, amber ≤180d, red >180d)
- **Resizable columns**: Drag header borders to resize, widths saved in localStorage
- **Phone**: WhatsApp link with +51 prefix for Peru numbers
- **Sorting**: All columns sortable by click headers (Cant. and #Comp. for strongest customers)
- **Refresh endpoint**: POST /api/cuentas/refresh-kpis

### 5. Approval Workflow for New Customers (DONE - Feb 2026)
- `approval_status` on `crm.cuenta` and `crm.contacto` (PENDING/APPROVED/REJECTED)
- Main `/cuentas` filters APPROVED only
- `PendientesPage.jsx` with tabs, search, approve/reject/link modals
- Sidebar badge with 60s auto-refresh

### 6. Bulk Inactivation - Sin Ventas (DONE - Feb 2026)
- `backend/routers/maintenance.py` with preview and execute endpoints
- Inactivates accounts with 0 sales; contacts only if unlinked
- "Sin ventas" button in CuentasToolbar with preview modal

## Architecture
```
/app
├── backend/
│   ├── db.py              # DB init, views, materialized views
│   ├── server.py          # FastAPI main, registers all routers
│   └── routers/
│       ├── approval.py    # Approval workflow
│       ├── maintenance.py # Bulk inactivation
│       ├── orders.py      # Override CRUD
│       ├── comercial.py   # Commercial reports
│       └── ...
└── frontend/src/
    ├── App.js
    ├── pages/
    │   ├── CuentasAirtable.jsx
    │   ├── PendientesPage.jsx
    │   └── ...
    └── components/
        ├── Layout.jsx
        └── cuentas/
            ├── CuentasDirectoryGrid.jsx   # Resizable columns, Hace column
            ├── CuentasToolbar.jsx         # "Sin ventas" button
            ├── InactivateNoSalesModal.jsx
            ├── CustomerOverrideModal.jsx
            └── tabs/...
```

## API Endpoints
- `GET /api/cuentas/list` - Directory with KPIs (APPROVED only)
- `POST /api/cuentas/refresh-kpis` - Refresh materialized view
- `POST/DELETE /api/orders/{order_id}/override-customer` - Override CRUD
- `GET /api/approval/pending` - List pending records
- `GET /api/approval/pending/count` - Badge count
- `POST /api/approval/{entity}/{id}/approve|reject` - Approve/Reject
- `POST /api/approval/cuenta/{id}/link-to` - Link/Merge
- `GET /api/maintenance/inactivate-no-sales/preview` - Preview candidates
- `POST /api/maintenance/inactivate-no-sales` - Execute bulk inactivation

## Backlog
- Toggle on `/cuentas` for admins to see pending accounts
- Sync `odoo.res_country_state` for department names
- Time range toggle for KPIs (3m/6m/12m)
