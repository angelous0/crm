# CRM B2B - Product Requirements Document

## Overview
CRM B2B for managing accounts, contacts, sales, credits, stock, analytics, and salesperson workflows sourced from Odoo ERP.

## Core Features (Completed)

### 1-4. Foundation (DONE)
- Airtable-style Cuentas with resizable columns, "Hace" days, semaphore
- Account/Contact soft deactivation, Sales Order Override
- Directory with Depto (state_name), materialized view KPIs
- Approval workflow, bulk inactivation, ODS sync integration

### 5. Mi Día + Tareas + Interacciones (DONE - Mar 2026)
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
  - `InteractionModal.jsx`: 2-step flow (interaction → next action) with templates
  - Sidebar: "Mi Día" as first menu item (Sun icon)
  - Quick actions: WhatsApp link, register interaction per row

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
- POST/GET /api/ods-sync/run|job-status
- GET /api/maintenance/inactivate-no-sales/preview

## Backlog
- Phase 3: Quick action buttons in cuenta detail panel (WhatsApp, Llamar, Registrar)
- Phase 3: Assign user selector in cuenta profile
- Supervisor view: Team ranking by interactions/tasks
- Toggle admin in /cuentas for pending accounts
- KPI time range toggle (3m/6m/12m)
