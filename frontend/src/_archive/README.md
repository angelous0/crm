# `_archive/` — código histórico no removido

Estos archivos fueron páginas/componentes del CRM que ya no están enrutados
en `App.js` y no son importados por nadie en el resto del código vivo.
Se mueven aquí en lugar de borrarlos por seguridad — algunas pueden
recuperarse en sprints futuros (ver `crm/AUDIT_HUERFANOS.md`).

**Reglas:**
- Estos archivos NO se compilan al build (CRA solo importa `src/` desde
  `App.js` por dependencias). Si nadie los importa, no agregan al bundle.
- Si querés recuperar uno, moverlo de vuelta a `pages/` y agregarlo en
  `App.js`.
- Si en el próximo sprint todavía no se necesitan, se pueden borrar
  definitivamente.

## Inventario archivado en Sprint CRM-D1 (2026-05-07)

| Archivo | Origen | Razón |
|---|---|---|
| `pages/Dashboard.jsx` | Fase 1 prototipo | Reemplazado por `MiDiaPage` (`/cola`). Endpoints `/stats` y `/bootstrap/inicializar` no existen en backend |
| `pages/ComercialPage.jsx` | Borrador | Funcionalidad migrada al concepto de Pipeline (placeholder en `/pipeline`) |
| `pages/StockDashboard.jsx` | Borrador | Duplica el módulo Ventas (`:8003`); se decidirá en CRM-D5 |
| `pages/BalanceTallas.jsx` | Borrador | No aplica al CRM (es del módulo Ventas) |
| `pages/Ventas.jsx` | Prototipo primitivo | Superado por `SalesTab` dentro de `CuentaDetalle`; usaba `$` en vez de `S/` |
| `pages/CreditosPage.jsx` | Borrador | Recuperar en CRM-D4 como `/cobranzas` (necesita backend `/api/creditos/*`) |
| `pages/PendientesPage.jsx` | Borrador | Recuperar en CRM-D4 (necesita backend `/api/approval/*`) |
| `pages/Catalogo.jsx` | Borrador | Recuperar en CRM-D5 (necesita backend `/api/catalogo/*`) |
| `pages/ReportesVentasPage.jsx` | Borrador | A evaluar en CRM-D5 (¿como tab en CuentaDetalle o como página global?) |
| `pages/ReposicionTab.jsx` | Duplicado | Ya existe `components/ReposicionTab.jsx` |
| `pages/Cuentas.jsx` | Versión vieja | Reemplazada por `pages/CuentasAirtable.jsx` |

**NO archivados** (siguen vivos):
- `pages/YoYTab.jsx` — usado por `components/cuentas/CuentaDetailPanel.jsx`
- `pages/AnaliticaTab.jsx` — usado por `components/cuentas/CuentaDetailPanel.jsx`
