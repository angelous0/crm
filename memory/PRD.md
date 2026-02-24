# CRM B2B - Product Requirements Document

## Overview
CRM B2B for managing accounts, contacts, sales, credits, stock, and analytics sourced from Odoo ERP.

## Core Requirements

### 1. Airtable-Style Cuentas Module (DONE)
- Full-screen 2-pane layout: directory grid (left) + detail panel (right)
- Server-side filtering, sorting, pagination
- URL state management for all filters and selections
- Compact header with key metrics

### 2. Account/Contact Soft Deactivation (DONE)
- Activate/deactivate accounts and contacts individually or in bulk
- `manual_inactive` flag prevents Odoo sync from re-activating records
- Cascading logic: deactivating account deactivates contacts, and vice versa

### 3. Sales Order Customer Override (DONE - Feb 2026)
- Allow users to reassign POS orders incorrectly assigned to generic customers (e.g., "CLIENTES VARIOS")
- `crm.pos_order_partner_override` table stores corrections
- `crm.v_comercial_order_lines` and `crm.v_comercial_order_header` views use COALESCE as single source of truth
- All commercial endpoints refactored to use override logic
- Frontend modal with customer search, override creation/deletion
- Override indicators (REASIGNADO badge) on order rows

## Architecture
```
/app
├── backend/
│   ├── db.py              # DB init, override table, views with COALESCE
│   ├── server.py          # Main FastAPI app, refactored with _OVERRIDE_JOIN, _EFFECTIVE_PARTNER
│   └── routers/
│       ├── orders.py      # Override CRUD + customer search
│       ├── comercial.py   # has_override in SELECT
│       ├── creditos.py
│       ├── contactos.py
│       ├── reposicion.py
│       └── stock_balance.py
└── frontend/
    └── src/
        ├── App.js
        ├── pages/
        │   ├── CuentasAirtable.jsx
        │   ├── ComercialPage.jsx      # Override buttons + modal
        │   └── ...
        └── components/
            ├── cuentas/
            │   ├── CustomerOverrideModal.jsx  # Search + reassign modal
            │   ├── CuentasDirectoryGrid.jsx
            │   ├── CuentaDetailPanel.jsx
            │   └── tabs/
            │       ├── VentasTab.jsx          # Override buttons + badge
            │       ├── ReservasTab.jsx        # Override buttons + badge
            │       └── ...
            └── layout/
                └── Sidebar.jsx
```

## Key DB Schema
- `crm.pos_order_partner_override`: { id UUID, order_id INT UNIQUE, original_partner_id INT, new_owner_partner_id INT, reason TEXT, created_at, created_by }
- `crm.cuenta`: { is_active, manual_inactive, inactive_reason, inactive_at, inactive_by }
- `crm.contacto_vinculado`: { is_active, manual_inactive, inactive_reason, inactive_at, inactive_by }

## API Endpoints
### Override (NEW)
- `POST /api/orders/{order_id}/override-customer` - Create/update override
- `GET /api/orders/{order_id}/override-customer` - Get current override
- `DELETE /api/orders/{order_id}/override-customer` - Remove override
- `GET /api/orders/search-customers?q=...` - Search accounts for reassignment

### Existing (Refactored)
- All commercial endpoints now use `COALESCE(ov_po.new_owner_partner_id, po.partner_id)` for partner matching
- Views `v_comercial_mov_flat` and `v_comercial_order_header` include `has_override` column

## Backlog
- No pending tasks defined by user
