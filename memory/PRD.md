# CRM B2B - Product Requirements Document

## Overview
B2B CRM application integrated with Odoo ERP via PostgreSQL. Manages accounts, contacts, sales, reservations, credits, interactions, and tasks.

## Architecture
- **Frontend**: React + Shadcn UI, hosted on port 3000
- **Backend**: FastAPI + asyncpg (PostgreSQL), hosted on port 8001
- **Database**: External Odoo PostgreSQL (read) + CRM schema (read/write) + MongoDB (auth)
- **Auth**: JWT-based with MongoDB user store

## Core Modules

### 1. Cuentas (Accounts) - Airtable Layout [DONE - Feb 2026]
Full Airtable-style split-view module at `/cuentas`:
- **Top Toolbar**: Search, filters (Estado/Clasificacion/Ciudad/Vendedor), "Mostrar inactivos" toggle, count badge
- **Left Pane (Directory Grid)**: Mini-table with columns, sorting, pagination, checkboxes for bulk selection, INACTIVA badge
- **Right Pane (Detail Panel)**: Compact header with KPIs + 11 tabs
- **URL State**: `?q=&estado=&selected=ID&tab=tabname&include_inactive=true` fully shareable

### 2. Soft-Disable (Inactivar) [DONE - Feb 2026]
Complete soft-disable system for Cuentas and Contactos:

**Data Model** (columns on `crm.cuenta` and `crm.contacto`):
- `is_active`, `manual_inactive`, `inactive_reason`, `inactive_at`, `inactive_by`

**Cascade Rules**:
- Inactivar Cuenta → cascades to ALL contactos (CASCADE_ACCOUNT)
- Activar Cuenta → only reactivates CASCADE_* contactos
- Inactivar Contacto Principal → cascades to Cuenta + other contactos (CASCADE_CONTACT)
- Sync Protection: `manual_inactive=true` prevents Odoo from reactivating

**Single Endpoints**: `PATCH /api/cuentas/{id}/active`, `PATCH /api/contactos/{id}/active`

### 3. Bulk Inactivar/Activar [DONE - Feb 2026]
Mass selection with checkboxes in both Cuentas directory and Contactos tab:
- Checkbox on each row + select-all in header
- Dark floating action bar: "N seleccionada(s)" + "Inactivar (N)" (red) + "Activar (N)" (green) + "Deseleccionar"
- Cascade rules apply equally to batch operations
- **Batch Endpoints**: `PATCH /api/cuentas/batch-active`, `PATCH /api/contactos/batch-active`
- Auto-clears selection and refreshes data after operation

### 4. Detail Panel Tabs [DONE]
Resumen, Ventas, Reservas, Creditos, Info Ventas, YoY, Analitica, Contactos, Interacciones, Tareas, Perfil

### 5. Previous Features [DONE]
- Product Catalog Filter, Info Ventas 2-level drill-down, Dias sin comprar
- Comparativo YoY, Analitica (frequency + top items)

## Key API Endpoints
- `PATCH /api/cuentas/batch-active` - Batch toggle with cascade
- `PATCH /api/contactos/batch-active` - Batch toggle with principal cascade
- `GET /api/cuentas/list?include_inactive=true` - Directory with inactive filter
- `GET /api/cuentas/{id}/contactos?include_inactive=true` - Contactos with inactive filter
- `GET /api/cuentas/{id}/contactos/count-active` - Count for confirmation modal

## Backlog (Prioritized)
### P1
- Data counters in directory menu items
- Column sorting by all KPI columns

### P2
- Dormancy semaphore, Reserves vs Sales, Credit summary
- Resizable left panel

### P3
- Export CSV, "Include excluded products" toggle
- Refactor stock dashboard to router

## File Structure
```
frontend/src/
  pages/CuentasAirtable.jsx
  components/cuentas/
    CuentasToolbar.jsx          # Filters + Inactivos toggle
    CuentasDirectoryGrid.jsx    # Grid + checkboxes + bulk bar
    CuentaDetailPanel.jsx       # Header + toggle active + tabs
    tabs/ (Resumen, Ventas, Reservas, Creditos, InfoVentas,
           Contactos [with bulk checkboxes], Interacciones,
           Tareas, Perfil)
```
