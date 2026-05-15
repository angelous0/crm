# Módulo CRM

Backend FastAPI en puerto **8004**. Auth compartido con `ventas/` (puerto 8003) vía JWT contra `produccion.prod_usuarios`.

## Arquitectura

**Decisión actualizada (2026-04-27): Frontends separados**

| Capa | Ventas | CRM |
|---|---|---|
| Backend | `:8003` | `:8004` |
| Frontend | `:3003` | `:3004` (separado, no integrado en ventas) |

Razón: ergonomía de desarrollo. La integración previa en el frontend de ventas (sección "CRM > Mi Día" en el sidebar) requería un refactor que se posterga; se eliminó del worktree y se reemplazó por un frontend independiente.

**Implicaciones:**

- 2 logins separados para los usuarios (mismo JWT funciona en ambos backends, pero la sesión del navegador es por origen — `localStorage` no se comparte entre puertos).
- Navegación cross-módulos requiere abrir nueva pestaña.
- Mantenimiento duplicado de UI components compartidos (shadcn/ui).
- Cambios de tema/branding deben aplicarse en ambos frontends.

## Estado del frontend CRM (`:3004`)

**Páginas implementadas (con endpoints validados):**

- ✓ Mi Día (KPIs + tareas + interacciones, estilo Airtable)
- ✓ Cuentas (lista de 8,898 cuentas paginada con filtros)
- ✓ Contactos (lista global)
- ✓ Agenda (tareas globales con vencimiento y prioridad)

**Páginas pendientes (próximo milestone):**

- [ ] Detalle de Cuenta con tabs (PerfilTab, ResumenTab, InteraccionesTab, TareasTab, ContactosTab, CreditosTab)
- [ ] Modal de edición de tarea
- [ ] Modal de creación de tarea
- [ ] Modal de creación de interacción
- [ ] Cadencia (motor de contacto inteligente, requiere `cadencia.py` en backend)
- [ ] Pendientes (módulo `approval` no migrado al backend)
- [ ] Créditos (endpoint `/api/creditos/filter-options` no migrado)

**Páginas descartadas** (vivían en el frontend del zip original pero llaman backends que no son CRM):

- Dashboard global → vive en `ventas/`
- Stock Dashboard, Catálogo, Balance Tallas → viven en `odoo/` o `ventas/`
- Reportes → vive en `ventas/`
- Ventas y Reservas → vive en `ventas/`

Las páginas descartadas siguen en disco bajo `crm/frontend/src/pages/` por si en el futuro se quieren restaurar (basta agregarlas a `App.js` y al sidebar).

## Estructura

| Archivo | Descripción |
|---|---|
| `backend/server.py` | Entry point FastAPI |
| `backend/db.py` | Pool a PG con `search_path=public,odoo,crm,produccion` |
| `backend/auth_utils.py` | JWT compartido con ventas (idéntico) |
| `backend/helpers.py` | `row_to_dict` (datetime/Decimal → JSON-safe) |
| `backend/migrations/startup_ddl.py` | Schema `crm.*` con bloque idempotente autocorrectivo de PK/UNIQUE/FK |
| `backend/routes/` | Routers organizados por dominio |

## Routers implementados

- `cuentas.py` (31 endpoints): directorio Airtable, ficha de cuenta, ventas drill-down, créditos, interacciones, tareas
- `contactos.py` (5 endpoints): listado/edición/soft-disable/revinculación
- `interacciones.py` (5 endpoints): CRUD global + plantillas activas
- `tareas.py` (5 endpoints): CRUD global + atajo /completar; auth diferenciada (creador / asignado / admin)
- `mi_dia.py` (3 endpoints): dashboard del vendedor (`/mi-dia`, `/mi-dia/kpis`, `/mi-dia/resumen-equipo`)
- `maintenance.py` (2 endpoints): inactivación masiva

## Pendientes técnicos

- `cadencia.py` (motor de contacto inteligente — pobla `urgente_proactivo` en Mi Día)
- Integración WhatsApp (Evolution API)

## Pendientes de Negocio (no técnicos)

### 1. Limpieza de números de WhatsApp en contactos

Estado actual de cobertura de teléfonos (medido 2026-04-27):

- `crm.contacto.whatsapp`: **0 / 11,590** (0%) — campo creado pero nunca poblado
- `odoo.res_partner.mobile`: **908 / 11,590** (7.8%)
- `odoo.res_partner.phone`: **4,092 / 11,590** (35.3%)

**Acción requerida antes de lanzar integración con WhatsApp:**

- [ ] Definir formato estándar de números (E.164 con +51 para Perú)
- [ ] Auditoría manual o por script de los números existentes
- [ ] Plan de captura de WhatsApp para nuevos contactos (campo obligatorio en formularios)
- [ ] Decidir si limpiar/normalizar `phone+mobile` existentes y migrar a `crm.contacto.whatsapp`

Sin números de WhatsApp suficientes, las plantillas masivas y el motor de cadencia no podrán contactar a los clientes vía WhatsApp.

## Schema CRM

Tablas operacionales (todas con PK + UNIQUE + FK):

- `cuenta`, `contacto` — cuentas y contactos del CRM
- `partner_principal_override` — reasignación manual contacto→cuenta
- `pos_order_partner_override` — reasignación manual de orden→cliente
- `cuenta_vinculo` — vínculos manuales partner→cuenta
- `interaccion`, `tarea` — actividad comercial
- `interaction_template`, `producto_aprobado` — auxiliares

Vistas:

- `v_partner_account_final` — partner→cuenta efectivo (con override)
- `v_cuenta_partners` — todos los partners de una cuenta (rollup commercial/parent)
- `v_cuentas_libres`, `v_contactos_vinculados` — particiones del directorio
- `v_comercial_order_header` — órdenes con override aplicado
- `mv_cuenta_sales_kpi` — KPIs por cuenta (materializada)

## Comandos útiles

Arrancar backend:

```bash
cd crm/backend
PORT=8004 python3 -m uvicorn server:app --host 0.0.0.0 --port 8004 --reload
```

Arrancar frontend:

```bash
cd crm/frontend
PORT=3004 npm start
```

(o usar `start-all.sh` en la raíz del repo, que levanta los 5 backends + 5 frontends.)

Backup del schema:

```bash
pg_dump "$DATABASE_URL" --schema=crm --no-owner --no-acl > /tmp/crm_backup_$(date +%Y%m%d).sql
```

Refresh MV:

```bash
psql "$DATABASE_URL" -c "REFRESH MATERIALIZED VIEW CONCURRENTLY crm.mv_cuenta_sales_kpi;"
```
