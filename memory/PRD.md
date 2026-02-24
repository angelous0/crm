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
- **New columns**: Departamento (city fallback), Última compra, Cantidad (qty 12m), #Compras (orders 12m), Teléfono unificado, %YTD
- **Materialized view** `crm.mv_cuenta_sales_kpi` for fast KPI sorting (<1s)
- **Phone normalization**: strips non-digits, mobile priority, WhatsApp link (wa.me) with +51 prefix for Peru 9-digit numbers
- **%YTD**: (qty_ytd_current / avg(qty_ytd_prev1, qty_ytd_prev2)) - 1, green/red/grey colors
- **Sorting**: all columns sortable via click headers
- **Refresh endpoint**: POST /api/cuentas/refresh-kpis

## Architecture
```
/app
├── backend/
│   ├── db.py              # DB init, override table, views, mv_cuenta_sales_kpi materialized view
│   ├── server.py          # FastAPI, _apply_phone(), /api/cuentas/list with MV join
│   └── routers/
│       ├── orders.py      # Override CRUD (soft-delete) + customer search
│       ├── comercial.py   # has_override + original_partner_name
│       └── ...
└── frontend/src/
    ├── pages/
    │   ├── CuentasAirtable.jsx    # 740px left pane
    │   ├── ComercialPage.jsx
    │   └── ...
    └── components/cuentas/
        ├── CuentasDirectoryGrid.jsx  # 7 columns: Cuenta|Depto|Últ.compra|Cant.|#Comp.|Tel|%YTD
        ├── CuentasToolbar.jsx
        ├── CustomerOverrideModal.jsx
        └── tabs/
            ├── VentasTab.jsx
            ├── ReservasTab.jsx
            └── ...
```

## Key DB Schema
- `crm.pos_order_partner_override`: soft-delete, partial unique index
- `crm.mv_cuenta_sales_kpi`: materialized view (cuenta_id, last_purchase_date, qty_12m, orders_12m, qty_ytd_cur/p1/p2)

## API Endpoints
- `GET /api/cuentas/list` - Directory with KPIs via materialized view
- `POST /api/cuentas/refresh-kpis` - Refresh materialized view
- `POST/GET/DELETE /api/orders/{order_id}/override-customer` - Override CRUD
- `GET /api/orders/search-customers?q=...` - Customer search

## Backlog
- Sync `odoo.res_country_state` for proper department names (currently using city as fallback)
- Time range toggle for KPIs (3m/6m/12m, currently 12m default)
