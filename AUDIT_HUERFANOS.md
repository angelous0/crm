# Auditoría de Código Huérfano — CRM Frontend
> Generado: 2026-05-06 · Sin modificaciones al código fuente.

---

## Hallazgos clave antes de la tabla

Antes de auditar archivo por archivo, tres datos que cambian el diagnóstico:

1. **`YoYTab.jsx` y `AnaliticaTab.jsx` NO son huérfanos reales.** Ambos son importados y usados por `src/components/cuentas/CuentaDetailPanel.jsx` como sub-tabs de la ficha de cuenta. Están en `pages/` por convención, no por error.

2. **`ReposicionTab.jsx` existe en dos lugares.** Copia en `pages/ReposicionTab.jsx` (original) y copia en `components/ReposicionTab.jsx`. La segunda es la que se usa en producción. La de `pages/` es código duplicado.

3. **Ninguno de los backends que requieren estas páginas existe en el CRM.** Los únicos routers registrados en `server.py` son: `auth`, `cuentas`, `contactos`, `interacciones`, `tareas`, `mi_dia`, `partners`, `maintenance`. Todo lo demás (`/comercial`, `/reportes`, `/stock-dashboard`, `/approval`, `/creditos`, `/catalogo`, `/ventas`, `/stock-balance`, `/reposicion`) produce 404 al llamarlo.

---

## Tabla resumen

| Página | Propósito | Backend que llama | Estado | Recomendación |
|---|---|---|---|---|
| `Dashboard.jsx` | Landing + bootstrap CRM (Fase 1) | `/stats`, `/bootstrap/inicializar` | ❌ MUERTO — endpoints inexistentes | **ELIMINAR** |
| `ComercialPage.jsx` | Gestión POS órdenes/líneas + reasignación de cliente | `/comercial/orders`, `/comercial/lines` | ❌ MUERTO — endpoints inexistentes | **EVALUAR-CON-USUARIO** |
| `ReportesVentasPage.jsx` | Analítica global multi-año con gráficos Recharts | `/reportes/ventas/summary`, `/by-day`, `/by-month`, `/top`, `/filter-options` | ❌ MUERTO — endpoints inexistentes | **EVALUAR-CON-USUARIO** |
| `StockDashboard.jsx` | Dashboard de stock por tienda (cubo color/talla) | `/stock-dashboard/cube`, `/filter-options-v2`, `/detail`, `/odoo-sync/*` | ❌ MUERTO — endpoints inexistentes | **EVALUAR-CON-USUARIO** |
| `PendientesPage.jsx` | Flujo de aprobación de nuevas cuentas/contactos desde Odoo | `/approval/pending`, `/approve`, `/reject`, `/link-to`, `/partner/{id}/sales` | ❌ MUERTO — endpoints inexistentes | **EVALUAR-CON-USUARIO** |
| `CreditosPage.jsx` | Facturas a crédito (AR) con saldo pendiente | `/creditos/invoices`, `/creditos/lines`, `/creditos/filter-options` | ❌ MUERTO — endpoints inexistentes | **EVALUAR-CON-USUARIO** |
| `Catalogo.jsx` | Catálogo de productos con stock y matriz color/talla | `/catalogo`, `/catalogo/{id}/matriz`, `/catalogo/{id}/variantes`, `/catalogo/marcas` | ❌ MUERTO — endpoints inexistentes en CRM | **EVALUAR-CON-USUARIO** |
| `Ventas.jsx` | Prototipo primitivo de ventas POS | `/ventas` | ❌ MUERTO — superado por ComercialPage; usa `$` en vez de `S/` | **ELIMINAR** |
| `BalanceTallas.jsx` | Matriz de balance de stock por ítem × talla | `/stock-balance/matrix`, `/stock-balance/colors-matrix` | ❌ MUERTO — endpoints inexistentes | **EVALUAR-CON-USUARIO** |
| `YoYTab.jsx` | Tab YoY para ficha de cuenta (recibe `cuentaId` prop) | `/cuentas/{id}/ventas/yoy/*`, `/comercial/orders/{id}/lines` | ⚠️ VIVO (usado en `CuentaDetailPanel`) — drill-down de líneas roto | **RECUPERAR** (fix 1 endpoint) |
| `AnaliticaTab.jsx` | Tab analítica por cuenta (frecuencia + top modelos/tallas/colores) | `/cuentas/{id}/ventas/analitica/frecuencia`, `/analitica/tops` | ✅ VIVO — todos los endpoints existen | **NO APLICA** |
| `ReposicionTab.jsx` | Reposición almacén → tiendas por SKU | `/reposicion/sku-summary`, `/reposicion/sku-models` | ❌ MUERTO (duplicado en `components/`) — endpoints inexistentes | **ELIMINAR** (la copia en pages/) |

---

## Detalle por página

### 1. `Dashboard.jsx`
**Qué hace:** Era la pantalla de bienvenida de la Fase 1 del CRM. Muestra 5 KPIs globales (cuentas libres, partners totales, contactos vinculados, tareas pendientes, productos aprobados) y tiene un botón "Inicializar CRM" que invoca un endpoint de bootstrap masivo para crear cuentas/contactos desde ventas POS históricas. También explica el flujo de trabajo en 4 pasos.

**Endpoints:** `GET /api/stats` y `POST /api/bootstrap/inicializar`. Ninguno existe en el backend actual.

**Vale la pena recuperar:** No. El flujo de "inicializar CRM" nunca llegó a producción y es conceptualmente reemplazado por la sincronización continua de Odoo. Los KPIs globales tampoco tienen un lugar en la navegación actual (que usa "Mi Día" como home). Es código de arranque de prototipo.

---

### 2. `ComercialPage.jsx`
**Qué hace:** Página operativa muy completa para explorar órdenes POS (ventas + reservas). Tiene filtros por fecha, tipo doc, cliente, toggle "Excluir Varios"; modo cabecera (por orden) y modo detalle (por línea de producto); paginación; exportación CSV; botón de sync (`SyncButton` con jobCode `POS_ORDERS`); y un `CustomerOverrideModal` para reasignar el cliente de una orden. Al click en una orden se abre `OrderLinesDrawer`.

**Endpoints:** `GET /api/comercial/orders`, `GET /api/comercial/lines`. Ambos producen 404.

**Vale la pena recuperar:** Alta probabilidad. La funcionalidad de reasignación de clientes (`pos_order_partner_override`) ya existe en la BD y en el backend de cuentas. Lo que falta es el router `/comercial` con las queries. La UI está completamente terminada y testeable — solo le falta el backend. Si el usuario quiere una vista global de órdenes POS con capacidad de corrección, esta página es la base.

---

### 3. `ReportesVentasPage.jsx`
**Qué hace:** Dashboard de analítica global (no por cuenta específica). Tiene tres tabs: "Resumen" (4 KPIs con variación YoY + gráfico de área diario vs año anterior), "Comparación Anual" (gráfico líneas/barras multi-año 2019–2026 + tabla mensual con CSV), y "Top" (ranking configurable por clientes/modelos/items/tallas/colores/tiendas, top N ajustable). La barra de filtros tiene 9 dimensiones (rango YTD/MTD/Custom, tienda, vendedor, marca, tipo, entalle, tela, hilo, talla, color). Usa Recharts para visualización.

**Endpoints:** 5 endpoints bajo `/api/reportes/ventas/*`. Ninguno existe.

**Vale la pena recuperar:** Alta probabilidad. Esta página es una versión global del análisis que ya existe en la Ficha de Cuenta (YoY) pero a nivel de toda la operación. El módulo de Ventas (`:8003`) tiene queries muy similares. La pregunta para el usuario: ¿quiere este análisis global en el CRM, o lo cubre el módulo Ventas? Si sí, el backend sería relativamente rápido de implementar usando `odoo.v_pos_line_real` ya disponible.

---

### 4. `StockDashboard.jsx`
**Qué hace:** Dashboard de stock en tiempo real con visualización matricial tipo pivot. La pantalla se divide en 3 paneles: izquierda (Modelo × Talla, todos los modelos), centro (6 paneles de tienda en grid 3×2: GRAU, GM209, GM218, BOOSH, GM207, TOTAL), derecha (ALMACEN). Cada panel muestra stock por Color × Talla. Soporta selección múltiple con Ctrl/Cmd (multi-select) y Shift (rango de tallas) que atenúa los paneles no seleccionados. Tiene filtros slicers en barra oscura, tabla de detalle expandible con CSV, y botón de sync de stock. Embebe `ReposicionTab` como segunda pestaña.

**Endpoints:** `/api/stock-dashboard/cube`, `/stock-dashboard/filter-options-v2`, `/stock-dashboard/detail`, `/odoo-sync/job-status`, `/odoo-sync/run`. Ninguno existe en el CRM backend.

**Vale la pena recuperar:** Muy alta probabilidad — es la herramienta de stock más completa del repo. Sin embargo, el módulo Odoo (`:8002`) o Ventas (`:8003`) probablemente ya tiene endpoints similares. La decisión clave es: ¿este dashboard vive en el CRM o en otro módulo? Si se quiere en el CRM, el backend requiere trabajo considerable (queries al `stock.quant` de Odoo).

---

### 5. `PendientesPage.jsx`
**Qué hace:** Flujo de revisión y aprobación de cuentas y contactos nuevos sincronizados desde Odoo. Lista registros "pendientes" con su nombre, DNI/RUC, ciudad, teléfono (con link a WhatsApp), tienda de origen, usuario que creó, resumen de ventas (órdenes + piezas, clickeable para ver detalle), y una sugerencia de duplicado automática (match por DNI, teléfono o nombre similar). Acciones: Aprobar (activa inmediatamente), Aprobar inactiva, Rechazar (con nota obligatoria), Vincular/Fusionar a cuenta existente. La acción de vincular/fusionar permite buscar la cuenta destino y elegir modo LINK (ambas activas, ventas se suman) o MERGE (la nueva se oculta).

**Endpoints:** `GET /api/approval/pending`, `/pending/count`, `POST /approval/{entity}/{id}/approve`, `/reject`, `/cuenta/{id}/link-to`, `GET /approval/partner/{id}/sales`. Ninguno existe.

**Vale la pena recuperar:** Alta probabilidad si el usuario tiene vendedores creando clientes en Odoo que necesitan revisión antes de aparecer en el CRM. El flujo de duplicados es especialmente valioso. Sin embargo, requiere que el CRM implemente la lógica de estados `approval_status` en `crm.cuenta` (la columna ya existe en startup_ddl.py).

---

### 6. `CreditosPage.jsx`
**Qué hace:** Visualización de facturas a crédito (cuentas por cobrar AR). Misma arquitectura que ComercialPage: modo cabecera (por factura: número, estado open/paid/cancel, total, saldo pendiente, unidades) y modo líneas (por producto facturado). Filtros por fecha, estado, cliente, toggle "Solo con saldo". KPIs: facturas, unidades, saldo pendiente (destacado en rojo), clientes. Botón sync con jobCode `AR_CREDIT_INVOICES`.

**Endpoints:** `GET /api/creditos/invoices`, `/creditos/lines`, `/creditos/filter-options`. Ninguno existe (existe `/cuentas/{id}/creditos/metrics` en cuentas.py, pero es diferente endpoint — por cuenta, no global).

**Vale la pena recuperar:** Media probabilidad. La gestión de créditos es crucial para una textilera, pero depende de si el cliente usa facturas a crédito en Odoo y si quiere gestionarlas desde el CRM en vez de desde Finanzas (`:8001`). El módulo Finanzas podría cubrir esto. Preguntar al usuario.

---

### 7. `Catalogo.jsx`
**Qué hace:** Catálogo de productos "elegibles" (con stock disponible). Lista con filtros por marca/tipo/tela/entalle/stock mínimo/ordenamiento. Al hacer click en un producto abre un modal con la matriz Color × Talla de stock, filtrable por ubicación (tienda). También tiene drill-down a variantes individuales (barcode + disponible). Bien terminado, UI similar a la ficha de cuenta.

**Endpoints:** `GET /api/catalogo`, `/catalogo/marcas`, `/catalogo/tipos`, `/catalogo/telas`, `/catalogo/entalles`, `/catalogo/{id}/matriz`, `/catalogo/{id}/variantes`. Ninguno existe en CRM backend.

**Vale la pena recuperar:** Media probabilidad. El módulo Odoo/Ventas probablemente expone esta información. La pregunta es si el vendedor del CRM necesita consultar el catálogo mientras revisa una cuenta — si sí, se podría recuperar y vincular a la ficha de cuenta (ej: "¿qué tenemos en stock para sugerirle a este cliente?"). Requiere backend.

---

### 8. `Ventas.jsx`
**Qué hace:** Prototipo muy primitivo de lista de ventas POS filtradas. Muestra filas de líneas de venta con fecha, empresa, orden, producto (barcode), talla, color, marca, cantidad, precio (usa `$` en vez de `S/` — error), descuento, subtotal, estado (badge cancelada/OK). Sin KPIs, sin paginación real, sin export, sin modo detalle.

**Endpoints:** `GET /api/ventas`. No existe.

**Vale la pena recuperar:** No. Es un prototipo de 225 líneas reemplazado completamente por `ComercialPage.jsx` (296 líneas de UI, más CSV export, KPIs, doble modo, sync, reasignación). Incluso usa dólar en vez de soles. Código muerto que confunde.

---

### 9. `BalanceTallas.jsx`
**Qué hace:** Herramienta de balance de stock focalizada en la dimensión de tallas. Pantalla dividida: izquierda (tabla Item × Tallas, donde "item" es la combinación Marca/Tipo/Entalle/Tela/Hilo), derecha (aparece al seleccionar un item: detalle por Color × Tallas). Filtros: tienda, marca, tipo, entalle, tela, hilo, modelo, talla, color. Seleccionar una fila atenúa el resto (análisis focalizado). Exporta CSV de ambas vistas. Paginación en lado izquierdo (300 items/pág). Color-coding de celdas (rojo=0, naranja=1-4, verde=5+).

**Endpoints:** `GET /api/stock-balance/matrix`, `/stock-balance/colors-matrix`. Ninguno existe.

**Vale la pena recuperar:** Alta probabilidad. Es complementaria a `StockDashboard` — mientras ese muestra el stock por tienda, esta muestra el balance por clasificación de producto. Es ideal para detectar roturas de talla (cuántas tallas tiene stock de un ítem). Si se recupera StockDashboard, conviene recuperar también esta.

---

### 10. `YoYTab.jsx` *(no es huérfano — vive en CuentaDetailPanel)*
**Qué hace:** Tab de comparación Año-sobre-Año dentro de la ficha de cuenta. Muestra: controles de año A/B + rango de meses; 3 KPIs (ventas, unidades, compras) con variación; tabla mensual con 8 columnas; tabla de mix por clasificación (Marca/Tipo/Entalle/Tela) con ordenamiento clickeable. Al hacer click en un ítem del mix abre un drawer (`YoYOrdersDrawer`) con las órdenes de ese ítem para ese año, y al clickear una orden muestra sus líneas.

**Endpoints:** `/cuentas/{id}/ventas/yoy/metrics`, `/by-month`, `/by-item`, `/item-orders` (todos existen en cuentas.py). El drawer también llama a `/api/comercial/orders/{orderId}/lines` para el drill-down de líneas — **este endpoint NO existe**, lo que hace que el segundo nivel del drawer falle silenciosamente.

**Vale la pena arreglar:** Sí, y es simple. El endpoint faltante `/comercial/orders/{orderId}/lines` ya está implementado visualmente en el código; solo falta agregar la query al backend de CRM. Alternativa: redirigir a `/cuentas/{id}/ventas/lines?order_id=X` que sí existe.

---

### 11. `AnaliticaTab.jsx` *(no es huérfano — vive en CuentaDetailPanel)*
**Qué hace:** Tab de analítica de comportamiento de compra dentro de la ficha de cuenta. Sección 1: Frecuencia de Compra — badge de dormancia (verde <14d, ámbar <45d, rojo >45d), frecuencia promedio en días, conteo de órdenes y unidades en 30/60/90 días. Sección 2: Top Modelos/Tallas/Colores configurable por período (30/60/90/180/365 días), con mini-barras proporcionales en la tabla.

**Endpoints:** `/cuentas/{id}/ventas/analitica/frecuencia` y `/cuentas/{id}/ventas/analitica/tops`. Ambos existen y están implementados en `cuentas.py` (líneas 1478 y 1534).

**Estado:** Totalmente vivo y funcional. No aplica recomendación.

---

### 12. `ReposicionTab.jsx` *(huérfano en pages/ — copia viva en components/)*
**Qué hace:** Herramienta de reposición de stock almacén → tiendas. Muestra una tabla de SKUs (Marca/Tipo/Entalle/Tela/Color/Talla) con stock en ALMACEN y en cada tienda destino (GM209, GM218, GRAU, GM207, BOOSH), badge de estado (FALTANTE/BAJO/OK) y texto de recomendación de movimiento. Al seleccionar un SKU muestra el drill-down de modelos exactos que componen ese SKU. Controles de umbral destino, objetivo, umbral origen, filtro por marca. Export CSV.

**Endpoints:** `GET /api/reposicion/sku-summary`, `GET /api/reposicion/sku-models`. Ninguno existe en CRM backend.

**Vale la pena:** La copia en `pages/ReposicionTab.jsx` es código duplicado (existe en `components/ReposicionTab.jsx`). La de `components/` es la que usa `StockDashboard`. Eliminar la copia de `pages/`. En cuanto a recuperar la funcionalidad: igual que StockDashboard, requiere backend. Alta valor operativo para el área de logística/tiendas.

---

## Mapa de dependencias backend

```
Endpoints CRM que SÍ existen (server.py registrado):
  /api/auth/*
  /api/cuentas/*  ← incluye /yoy/*, /analitica/*, /creditos/metrics
  /api/contactos/*
  /api/interacciones/*
  /api/tareas/*
  /api/mi-dia/*
  /api/partners/*
  /api/maintenance/*

Endpoints que requieren las páginas huérfanas y NO existen en CRM:
  /api/stats                    ← Dashboard.jsx
  /api/bootstrap/inicializar    ← Dashboard.jsx
  /api/comercial/*              ← ComercialPage.jsx, YoYTab.jsx (drill-down líneas)
  /api/reportes/ventas/*        ← ReportesVentasPage.jsx
  /api/stock-dashboard/*        ← StockDashboard.jsx
  /api/odoo-sync/*              ← StockDashboard.jsx
  /api/approval/*               ← PendientesPage.jsx
  /api/creditos/*               ← CreditosPage.jsx (≠ /cuentas/{id}/creditos/metrics)
  /api/catalogo/*               ← Catalogo.jsx
  /api/ventas                   ← Ventas.jsx
  /api/stock-balance/*          ← BalanceTallas.jsx
  /api/reposicion/*             ← ReposicionTab.jsx
```

---

## Decisión resumida

### ELIMINAR ahora (código inútil, sin valor de recuperación):
- `pages/Dashboard.jsx` — prototipo de bootstrap obsoleto
- `pages/Ventas.jsx` — prototipo primitivo, superado por ComercialPage
- `pages/ReposicionTab.jsx` — duplicado exacto de `components/ReposicionTab.jsx`

### RECUPERAR (backend existe o es trivial de agregar):
- `pages/YoYTab.jsx` — vivo pero el drill-down de líneas llama a `/comercial/orders/{id}/lines` que no existe; fix de 1 endpoint

### EVALUAR-CON-USUARIO (UI completa, backend falta):
- `pages/ComercialPage.jsx` — gestión global de órdenes POS con reasignación
- `pages/ReportesVentasPage.jsx` — analítica multi-año global con gráficos
- `pages/StockDashboard.jsx` — dashboard de stock en tiempo real
- `pages/BalanceTallas.jsx` — balance de tallas por ítem
- `pages/PendientesPage.jsx` — flujo de aprobación de nuevas cuentas
- `pages/CreditosPage.jsx` — gestión de créditos/facturas AR
- `pages/Catalogo.jsx` — catálogo de productos con stock
- `pages/ReposicionTab.jsx` (la funcionalidad, no el archivo duplicado)

### NO APLICA (no son huérfanos):
- `pages/AnaliticaTab.jsx` — vivo y funcional, usado en CuentaDetailPanel
