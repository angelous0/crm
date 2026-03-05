# CRM B2B - Product Requirements Document

## Overview
CRM B2B for managing accounts, contacts, sales, credits, stock, analytics, and salesperson workflows sourced from Odoo ERP.

## Core Features (Completed)

### 1-4. Foundation (DONE)
- Airtable-style Cuentas with resizable columns, "Hace" days, semaphore
- Account/Contact soft deactivation, Sales Order Override
- Directory with Depto (state_name), materialized view KPIs
- Approval workflow, bulk inactivation, ODS sync integration

### 5. Mi Dia + Tareas + Interacciones (DONE - Mar 2026)
- DB Schema: Extended crm.tarea and crm.interaccion
- Backend: GET /api/my-day, CRUD tareas, interacciones, next-action
- Frontend: MiDiaPage.jsx, InteractionModal.jsx

### 6. P0 Bug Fix: Pending Approval Detection (DONE - Mar 2026)
- Root Cause: New partners had no crm.cuenta row, COALESCE defaulted to APPROVED
- Fix: POST /api/approval/detect-new creates PENDING rows for untracked partners
- SyncButton auto-calls detect-new after RES_PARTNER sync
- Optimized _compute_suggestions to batch queries (12s -> 2.7s)

### 7. Ventas en Pendientes (DONE - Mar 2026)
- Sales summary in pending table row (live query, not materialized view)
- Sales detail modal with expandable orders showing pos.order.line level detail (producto, talla, color, qty, precio, subtotal)
- Horizontal scroll fix for small screens
- ODS_BASE_URL corrected to catalog-archive

## Architecture
```
backend/routers/
  approval.py, mi_dia.py, maintenance.py, ods_sync.py, orders.py, comercial.py
frontend/src/
  pages/PendientesPage.jsx, MiDiaPage.jsx, CuentasAirtable.jsx
  components/SyncButton.jsx, InteractionModal.jsx, Layout.jsx
```

## Key API Endpoints
- GET /api/approval/pending, POST /api/approval/{entity}/{id}/approve|reject
- POST /api/approval/detect-new
- GET /api/approval/partner/{id}/sales (orders + lines with product detail)
- GET /api/my-day, POST/GET /api/tareas, POST /api/interacciones
- POST/GET /api/ods-sync/run|job-status

### 8. Tienda Column in Cuentas Directory & Filters (DONE - Mar 2026)
- Materialized view mv_cuenta_sales_kpi includes tienda (hybrid: location_id > name-based fallback)
- Filter dropdown with "Sin tienda" option
- Labels added to all filter dropdowns

### 9. Total Lifetime Columns (DONE - Mar 2026)
- Added CANT. TOTAL and #COMP. TOTAL columns to directory
- Resizable splitter between directory and detail panel (react-resizable-panels)

### 10. Tienda Column in Detail Tabs (DONE - Mar 2026)
- Added "Tienda" column to Ventas and Reservas tabs (order + detail modes)
- Uses _TIENDA_JOIN (stock_location via location_id) + _TIENDA_EXPR (COALESCE with CASE fallback)
- Créditos tab excluded: account_invoice_credit lacks location_id field

### 11. Tienda + Usuario in Pendientes Page (DONE - Mar 2026)
- Added Tienda and Usuario Creador columns to pending approval list
- Fallback to UID:XX when res_users sync is incomplete

### 12. Reportes > Ventas Module (DONE - Mar 2026)
- **Materialized view** `crm.mv_ventas_reporte`: Pre-computes flat reporting data with tienda, assigned_user_id (~0.7s queries vs 14s with raw views)
- **Backend**: 4 endpoints in `/api/reportes/ventas/` (summary, by-day, top, filter-options)
  - Summary: KPIs + YoY comparison (current vs same period last year)
  - By-day: Daily series for chart (current + previous year)
  - Top: Rankings by clientes/modelos/items/tallas/colores/tiendas with pagination
  - Filter-options: Optimized dropdown values from base tables
- **Frontend**: `ReportesVentasPage.jsx` with:
  - Tab "Resumen": 4 KPI cards with YoY%, daily area chart (recharts) overlaying actual vs previous year
  - Tab "Top": Ranked table with group-by selector + CSV export
  - Filter bar: Range (YTD/MTD/Custom), Tienda, Vendedor, Marca, Tipo, Entalle, Tela, Hilo, Talla, Color
- **Sidebar**: Collapsible "Reportes" section with "Ventas" sub-item
- MV refreshes automatically when `/api/cuentas/refresh-kpis` is called (after sync)

## Backlog
- P1: Manual account assignment (user selector in cuenta profile)
- P1: Reportes > Stock, Créditos, Clientes (future sub-reports)
- P2: Supervisor dashboard (team ranking)
- P2: Quick action buttons in cuenta detail
- P2: KPI time range toggle
- Known: Some res_users UIDs (92, 108) show as "UID:XX" - needs ODS sync fix
- Known: CASE fallback for tienda is temporary - ODS should fully backfill location_id
