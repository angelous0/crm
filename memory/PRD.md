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

## Backlog
- P1: Manual account assignment (user selector in cuenta profile)
- P2: Supervisor dashboard (team ranking)
- P2: Quick action buttons in cuenta detail
- P2: KPI time range toggle
