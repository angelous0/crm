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
- **Left Pane (Directory Grid)**: Mini-table with columns, sorting, pagination, INACTIVA badge
- **Right Pane (Detail Panel)**: Compact header with KPIs + 11 tabs
- **URL State**: `?q=&estado=&selected=ID&tab=tabname&include_inactive=true` fully shareable

### 2. Soft-Disable (Inactivar) [DONE - Feb 2026]
Complete soft-disable system for Cuentas and Contactos:

**Data Model** (columns added to `crm.cuenta` and `crm.contacto`):
- `is_active` BOOLEAN (default true)
- `manual_inactive` BOOLEAN (default false) - prevents sync from reactivating
- `inactive_reason` TEXT (MANUAL / CASCADE_ACCOUNT / CASCADE_CONTACT)
- `inactive_at` TIMESTAMPTZ
- `inactive_by` TEXT

**Cascade Rules**:
- Inactivar Cuenta → cascades to ALL contactos (reason: CASCADE_ACCOUNT)
- Activar Cuenta → only reactivates contactos with CASCADE_* reason (not manually inactivated)
- Inactivar Contacto Principal (contacto_partner_odoo_id = cuenta_partner_odoo_id) → cascades to Cuenta + other contactos

**Sync Protection**: `manual_inactive=true` prevents Odoo sync from overwriting `is_active`

**API Endpoints**:
- `PATCH /api/cuentas/{id}/active` - Toggle cuenta active with cascade
- `PATCH /api/contactos/{id}/active` - Toggle contacto active (cascade if principal)
- `GET /api/cuentas/{id}/contactos/count-active` - Count for confirmation modal
- `GET /api/cuentas/list?include_inactive=true` - Include inactive in directory
- `GET /api/cuentas/{id}/contactos?include_inactive=true` - Include inactive contactos

**UI**:
- "Inactivos" toggle in toolbar (default: hidden)
- "INACTIVA" badge in directory grid rows
- Red "Inactivar" / Green "Activar" button in detail header
- Confirmation modal with affected contacto count + reason textarea
- Contactos tab: "Mostrar inactivos" toggle + per-contacto Inactivar/Activar buttons

### 3. Detail Panel Tabs [DONE]
Resumen, Ventas, Reservas, Creditos, Info Ventas, YoY, Analitica, Contactos, Interacciones, Tareas, Perfil

### 4. Previous Features [DONE]
- Product Catalog Filter, Info Ventas 2-level drill-down, Dias sin comprar
- Comparativo YoY, Analitica (frequency + top items)
- Stock Dashboard, Balance de Tallas, Ventas y Reservas, Creditos, Catalogo

## Backlog (Prioritized)
### P1
- Data counters in directory menu items
- Column sorting by all KPI columns (last_purchase, sales_12m, days_since)

### P2
- Dormancy status semaphore
- Reserves vs. Sales comparison
- Credit summary dashboard
- Resizable left panel with drag handle

### P3
- "Include excluded products" toggle
- Refactor stock dashboard endpoints to dedicated router
- Persist stock dashboard filter state in URL
- Export directory list to CSV

## File Structure
```
frontend/src/
  pages/CuentasAirtable.jsx
  components/cuentas/
    CuentasToolbar.jsx          # Search + filters + Inactivos toggle
    CuentasDirectoryGrid.jsx    # Left pane mini-grid + INACTIVA badge
    CuentaDetailPanel.jsx       # Right pane: header + toggle active + tabs
    tabs/
      ResumenTab, VentasTab, ReservasTab, CreditosTab,
      InfoVentasTab, ContactosTab (with active/inactive toggle per contacto),
      InteraccionesTab, TareasTab, PerfilTab

backend/
  server.py    # PATCH active endpoints, list with include_inactive
  db.py        # ALTER TABLE for soft-disable columns
  routers/yoy.py, analytics.py
```
