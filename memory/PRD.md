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
- **DB Schema**: Extended `crm.tarea` and `crm.interaccion`, created `crm.interaction_template`
- **Added to `crm.cuenta`**: `assigned_user_id`, `next_action_type/at/note`
- **Backend** (`routers/mi_dia.py`):
  - GET /api/my-day: Tasks overdue/today, next actions, risk accounts, stats
  - POST/GET/PATCH /api/tareas + POST /api/tareas/{id}/done
  - POST/GET /api/interacciones + GET /api/interaction-templates
  - PATCH /api/cuentas/{id}/next-action (auto-creates task)
  - GET /api/users
- **Frontend**:
  - `MiDiaPage.jsx`: 4-section dashboard (Vencidas, Hoy, Cuentas a contactar, En riesgo)
  - `InteractionModal.jsx`: 2-step flow (interaction -> next action) with templates
  - Sidebar: "Mi Dia" as first menu item (Sun icon)
  - Quick actions: WhatsApp link, register interaction per row

### 6. P0 Bug Fix: Pending Approval Detection (DONE - Mar 2026)
- **Root Cause**: New partners synced by ODS had no `crm.cuenta` row; `COALESCE(approval_status, 'APPROVED')` defaulted them to APPROVED
- **Fix**: Added `POST /api/approval/detect-new` endpoint that INSERTs PENDING rows for untracked partners
- **Integration**: SyncButton auto-calls detect-new after successful RES_PARTNER sync
- **Performance**: Optimized `_compute_suggestions` from N individual queries to 2 batch queries (12s -> 2.7s)

### 7. Ventas en Pendientes + Scroll Fix (DONE - Mar 2026)
- **Sales Summary in Pending Table**: Added VENTAS column showing order count + piece count from `mv_cuenta_sales_kpi`
- **Sales Detail Modal**: `GET /api/approval/partner/{id}/sales` endpoint returns POS orders with qty, lines, and total
- **Click-to-detail**: Clicking the ventas badge opens a modal with full order detail and totals
- **Horizontal Scroll Fix**: Changed table container from `overflow-hidden` to `overflow-x-auto` for small screens

## Architecture
```
backend/routers/
  mi_dia.py, approval.py, maintenance.py, ods_sync.py, orders.py, comercial.py, ...
frontend/src/
  pages/MiDiaPage.jsx, PendientesPage.jsx, CuentasAirtable.jsx, ComercialPage.jsx, ...
  components/InteractionModal.jsx, SyncButton.jsx, Layout.jsx, cuentas/...
```

## API Endpoints
- GET /api/my-day, POST/GET /api/tareas, POST /api/tareas/{id}/done
- POST/GET /api/interacciones, GET /api/interaction-templates
- PATCH /api/cuentas/{id}/next-action, GET /api/users
- GET /api/cuentas/list, POST /api/cuentas/refresh-kpis
- GET /api/approval/pending, POST /api/approval/{entity}/{id}/approve|reject
- POST /api/approval/detect-new
- GET /api/approval/partner/{id}/sales (NEW)
- POST/GET /api/ods-sync/run|job-status
- GET /api/maintenance/inactivate-no-sales/preview

## Backlog
- P1: Manual account assignment (user selector in cuenta profile)
- P2: Supervisor dashboard (team ranking by interactions/tasks)
- P2: Quick action buttons in cuenta detail panel (WhatsApp, Llamar, Registrar)
- P2: Toggle admin in /cuentas for pending accounts
- P2: KPI time range toggle (3m/6m/12m)
