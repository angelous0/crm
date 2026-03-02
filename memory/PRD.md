# CRM B2B - Product Requirements Document

## Overview
CRM B2B for managing accounts, contacts, sales, credits, stock, and analytics sourced from Odoo ERP.

## Core Requirements

### 1. Airtable-Style Cuentas Module (DONE)
- Full-screen 2-pane layout: directory grid (left 800px) + detail panel (right)
- Server-side filtering, sorting, pagination

### 2. Account/Contact Soft Deactivation (DONE)
- Activate/deactivate accounts and contacts individually or in bulk
- `manual_inactive` flag prevents Odoo sync from re-activating records

### 3. Sales Order Customer Override (DONE - Feb 2026)
- Table `crm.pos_order_partner_override` with soft-delete
- UI: REASIGNADO badge, customer search modal

### 4. Directory Columns Enhancement (DONE - Feb 2026)
- **Columns**: Cuenta, Depto (state_name), Ult.compra (con año), Hace (dias), Cant., #Comp., Tel, %YTD
- **Materialized view** `crm.mv_cuenta_sales_kpi`
- **Resizable columns**: Drag header borders, widths saved in localStorage
- **Sorting**: All columns sortable

### 5. Approval Workflow for New Customers (DONE - Feb 2026)
- `approval_status` on `crm.cuenta` and `crm.contacto`
- `PendientesPage.jsx` with tabs, search, approve/reject/link modals
- Sidebar badge with 60s auto-refresh

### 6. Bulk Inactivation - Sin Ventas (DONE - Feb 2026)
- `backend/routers/maintenance.py` with preview and execute endpoints
- "Sin ventas" button in CuentasToolbar

### 7. ODS Sync Integration (DONE - Mar 2026)
- **Backend**: `backend/routers/ods_sync.py` - proxy to ODS (Odoo) backend
  - POST /api/ods-sync/run, POST /api/ods-sync/run-batch, GET /api/ods-sync/job-status
  - ODS_BASE_URL in .env
- **Frontend**: Reusable `SyncButton.jsx` component with status badge + polling (3s)
  - Pendientes: "Actualizar Clientes" (RES_PARTNER) → refreshes pending list
  - Ventas y Reservas: "Actualizar Ventas" (POS_ORDERS) → refreshes data
  - Créditos: "Actualizar Créditos" (AR_CREDIT_INVOICES) → refreshes data
- **Status**: ODS endpoints currently return 404 (not yet deployed). CRM proxy handles gracefully with 502 errors

## Architecture
```
/app
├── backend/
│   ├── db.py
│   ├── server.py
│   └── routers/
│       ├── approval.py
│       ├── maintenance.py
│       ├── ods_sync.py     # ODS sync proxy
│       ├── orders.py
│       ├── comercial.py
│       └── ...
└── frontend/src/
    ├── App.js
    ├── pages/
    │   ├── CuentasAirtable.jsx
    │   ├── PendientesPage.jsx   # + SyncButton RES_PARTNER
    │   ├── ComercialPage.jsx    # + SyncButton POS_ORDERS
    │   ├── CreditosPage.jsx     # + SyncButton AR_CREDIT_INVOICES
    │   └── ...
    └── components/
        ├── Layout.jsx
        ├── SyncButton.jsx       # Reusable sync component
        └── cuentas/...
```

## API Endpoints
- `GET /api/cuentas/list` - Directory with KPIs (APPROVED only)
- `POST /api/cuentas/refresh-kpis` - Refresh materialized view
- `GET /api/approval/pending` - List pending records
- `GET /api/approval/pending/count` - Badge count
- `POST /api/approval/{entity}/{id}/approve|reject` - Approve/Reject
- `POST /api/approval/cuenta/{id}/link-to` - Link/Merge
- `GET /api/maintenance/inactivate-no-sales/preview` - Preview candidates
- `POST /api/maintenance/inactivate-no-sales` - Execute bulk inactivation
- `POST /api/ods-sync/run` - Trigger sync job on ODS
- `POST /api/ods-sync/run-batch` - Trigger multiple sync jobs
- `GET /api/ods-sync/job-status` - Get sync job status

## Environment Variables
- `PG_URL` - PostgreSQL connection (Odoo data source)
- `ODS_BASE_URL` - ODS backend URL (https://odoo-erp-warehouse.preview.emergentagent.com)

## Backlog
- Toggle on `/cuentas` for admins to see pending accounts
- Time range toggle for KPIs (3m/6m/12m)
