# CRM B2B - Product Requirements Document

## Overview
CRM B2B for managing accounts, contacts, sales, credits, stock, and analytics sourced from Odoo ERP.

## Core Requirements

### 1. Airtable-Style Cuentas Module (DONE)
- Full-screen 2-pane layout: directory grid (left) + detail panel (right)
- Server-side filtering, sorting, pagination
- URL state management for all filters and selections

### 2. Account/Contact Soft Deactivation (DONE)
- Activate/deactivate accounts and contacts individually or in bulk
- `manual_inactive` flag prevents Odoo sync from re-activating records
- Cascading logic

### 3. Sales Order Customer Override (DONE - Feb 2026)
- Table `crm.pos_order_partner_override` with `active` flag, soft-delete
- All views and endpoints use COALESCE with `AND ov.active=true`
- UI: REASIGNADO badge, original client in secondary text, customer search modal

### 4. Directory Columns Enhancement (DONE - Feb 2026)
- **New columns**: Departamento, Ultima compra, Cantidad (qty 12m), #Compras, Telefono unificado, %YTD
- **Materialized view** `crm.mv_cuenta_sales_kpi` for fast KPI sorting (<1s)
- **Phone normalization**: WhatsApp link (wa.me) with +51 prefix
- **Refresh endpoint**: POST /api/cuentas/refresh-kpis

### 5. Approval Workflow for New Customers (DONE - Feb 2026)
- **Database**: `approval_status` on `crm.cuenta` and `crm.contacto` (PENDING/APPROVED/REJECTED)
- **Visibility**: Main `/cuentas` filters APPROVED only
- **Backend**: `backend/routers/approval.py` - pending list, count, approve, reject, link
- **Suggestions**: Auto-detects duplicates by DOC, TEL, NAME
- **Frontend**: `PendientesPage.jsx` with tabs, search, action buttons, modals
- **Sidebar badge**: Pending count with 60s auto-refresh

### 6. Bulk Inactivation - Sin Ventas (DONE - Feb 2026)
- **Backend**: `backend/routers/maintenance.py` with preview and execute endpoints
- **Logic**: Inactivates accounts with 0 sales (SALE doc_tipo). Contacts only if unlinked (cuenta_partner_odoo_id IS NULL)
- **Period filter**: Optional months parameter (3/6/12/24 or all history)
- **Scope**: cuentas, contactos, or ambos
- **Frontend**: "Sin ventas" button in CuentasToolbar, `InactivateNoSalesModal.jsx` with preview + confirm
- **Safety**: Warning message, sample list, total count shown before execution

## Architecture
```
/app
├── backend/
│   ├── db.py              # DB init, views, materialized views
│   ├── server.py          # FastAPI main, registers all routers
│   └── routers/
│       ├── approval.py    # Approval workflow
│       ├── maintenance.py # Bulk inactivation (sin ventas)
│       ├── orders.py      # Override CRUD + customer search
│       ├── comercial.py   # Commercial reports
│       └── ...
└── frontend/src/
    ├── App.js             # Routes
    ├── pages/
    │   ├── CuentasAirtable.jsx    # Account directory
    │   ├── PendientesPage.jsx     # Approval workflow page
    │   └── ...
    └── components/
        ├── Layout.jsx             # Sidebar with pending badge
        └── cuentas/
            ├── CuentasDirectoryGrid.jsx
            ├── CuentasToolbar.jsx         # Includes "Sin ventas" button
            ├── InactivateNoSalesModal.jsx # Bulk inactivation modal
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
- Toggle on `/cuentas` page for admins to see pending accounts optionally
- Sync `odoo.res_country_state` for proper department names
- Time range toggle for KPIs (3m/6m/12m)
