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
- Table `crm.pos_order_partner_override` with `active` flag, `updated_at`/`updated_by`, partial unique index `(order_id) WHERE active=true`
- All views (`v_comercial_mov_flat`, `v_comercial_order_header`) use `LEFT JOIN ... AND ov.active=true` + COALESCE for `owner_partner_id`
- `original_partner_name` exposed in views and endpoints
- All commercial endpoints (YoY, analytics, ventas, clasificacion, header-metrics, cuentas/list KPIs) refactored with `_OVERRIDE_JOIN` + `_EFFECTIVE_PARTNER`
- DELETE does soft-delete (`active=false`), POST re-activates existing records
- UI: "REASIGNADO" badge, original client shown as secondary text, customer search modal

## Architecture
```
/app
├── backend/
│   ├── db.py              # DB init, override table (bigserial, active flag, partial unique), views
│   ├── server.py          # FastAPI, _OVERRIDE_JOIN with AND ov_po.active=true
│   └── routers/
│       ├── orders.py      # Override CRUD (soft-delete) + customer search
│       ├── comercial.py   # has_override + original_partner_name in SELECT
│       ├── creditos.py
│       ├── contactos.py
│       ├── reposicion.py
│       └── stock_balance.py
└── frontend/src/
    ├── pages/
    │   ├── CuentasAirtable.jsx
    │   ├── ComercialPage.jsx      # Override buttons + REASIGNADO badge + orig text
    │   └── ...
    └── components/cuentas/
        ├── CustomerOverrideModal.jsx  # Search + reassign modal
        └── tabs/
            ├── VentasTab.jsx          # Override buttons + badge + orig text
            ├── ReservasTab.jsx        # Override buttons + badge + orig text
            └── ...
```

## Key DB Schema
- `crm.pos_order_partner_override`: { id BIGSERIAL PK, order_id INT, original_partner_id INT, new_owner_partner_id INT, reason TEXT, created_at, created_by, updated_at, updated_by, active BOOL DEFAULT true, UNIQUE(order_id) WHERE active=true }

## API Endpoints
### Override
- `POST /api/orders/{order_id}/override-customer` - Upsert (re-activates soft-deleted)
- `GET /api/orders/{order_id}/override-customer` - Active override only
- `DELETE /api/orders/{order_id}/override-customer` - Soft-delete (active=false)
- `GET /api/orders/search-customers?q=...` - Search accounts

## Backlog
- Performance optimization for ComercialPage with large date ranges (121K+ orders)
