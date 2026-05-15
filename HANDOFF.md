# CRM B2B — Handoff

> Documento de referencia para retomar el trabajo del CRM en cualquier sesión.
> Última actualización: **2026-05-06**.

---

## ¿Qué es esto?

CRM B2B integrado al ERP Textil. **Backend FastAPI en `:8004`**, **frontend React (CRA) en `:3004`**. Comparte JWT con el módulo Ventas (`:8003`) vía `produccion.prod_usuarios`. Lee y escribe en PostgreSQL `72.60.241.216:9595/datos`, schemas `crm.*`, `odoo.*`, `produccion.*`.

```
crm/
├── backend/                    ← FastAPI :8004 (uvicorn)
│   ├── server.py               ← entrypoint + scheduler nocturno de matviews
│   ├── db.py                   ← pool asyncpg
│   ├── helpers.py              ← row_to_dict
│   ├── auth_utils.py           ← JWT compartido con Ventas
│   ├── migrations/
│   │   └── startup_ddl.py      ← schema crm.* + matviews + índices
│   └── routes/
│       ├── auth.py
│       ├── cuentas.py          ← Ficha de Cuenta + YoY (el más grande, ~1700 líneas)
│       ├── contactos.py
│       ├── interacciones.py
│       ├── tareas.py
│       ├── mi_dia.py
│       ├── partners.py
│       └── maintenance.py
└── frontend/                   ← React (CRA + craco) :3004
    ├── package.json
    ├── public/index.html       ← branding propio (CRM B2B · ERP Textil)
    └── src/
        ├── pages/              ← rutas top-level
        ├── components/
        │   ├── ui/             ← shadcn/ui
        │   └── cuentas/        ← VistaPorOrden, VistaClasificacion, VistaYoY
        ├── hooks/              ← useTabData, etc.
        └── lib/                ← api.js (axios)
```

---

## Cómo arrancar

```bash
# Backend
cd /Users/eduardcardenas/Documents/erp-textil/crm/backend
python3 -m uvicorn server:app --host 0.0.0.0 --port 8004 --reload --log-level info

# Frontend (en otra terminal)
cd /Users/eduardcardenas/Documents/erp-textil/crm/frontend
PORT=3004 npm start

# Login
# http://localhost:3004 — usar usuario/pass de produccion.prod_usuarios
# (los mismos credenciales que ventas:8003)
```

Variables de entorno: `crm/backend/.env` y `crm/frontend/.env`. La `JWT_SECRET_KEY` y `DATABASE_URL` son críticas; comparten con Ventas.

---

## Arquitectura clave

### "Venta real" como single source of truth

Todas las queries POS del CRM consumen las **vistas centralizadas** (single source of truth para "venta real"):

- `odoo.v_pos_order_real` — órdenes POS filtradas (no canceladas, no reservas, no NV-duplicada).
- `odoo.v_pos_line_real` — líneas POS filtradas (todos los filtros del header + palabras prohibidas + productos basura + estado='excluido').

**No replicar filtros de venta real en código del CRM**. Si querés cambiar la definición de "venta real", se cambia en las vistas y todos los módulos quedan sincronizados.

### Matview de performance (`crm.mv_pos_line_cuenta`)

Las queries por cuenta sobre `v_pos_line_real` directa son lentas (~12s en YoY) porque PostgreSQL no puede empujar el filtro `cuenta_partner_id` dentro de la vista (la columna es calculada). Solución: matview con `cuenta_partner_id` pre-resuelto + override aplicado.

```sql
crm.mv_pos_line_cuenta:
- 851k filas, 131 MB datos + 41 MB índices = 172 MB total
- Índice principal: (cuenta_partner_id, anio)
- Otros: (cuenta_partner_id, date_order), (cuenta_partner_id, marca, tipo, entalle)
- Refresh nocturno: scheduler asyncio en server.py a las 3am Lima
- Safety check al startup si la matview lleva >25h sin refresh
```

**Resultado**: `/yoy/metrics?mode=full_year` pasó de 12s → 1s (12x más rápido). El bottleneck restante (~1s) es overhead HTTP + asyncpg al DB remoto, no la query SQL.

### Override de partner por orden

`crm.pos_order_partner_override` permite reasignar manualmente el dueño de una orden POS desde el CRM (cuando el partner_id de Odoo está mal). Todas las queries de "cuenta efectiva" hacen:

```sql
COALESCE(ov_po.new_owner_partner_id, v.cuenta_partner_id)
```

La matview ya pre-resuelve esto, así que las queries del CRM filtran por `cuenta_partner_id` directamente sin LEFT JOIN extra.

---

## Estado del repo

- **Branch activo:** `produccion2` (rama por defecto del repo principal).
- **Últimos commits del CRM:**
  ```
  ffb76c2  fix(crm): resilencia ante restart de odoo + CRM en start-all.sh
  547ba04  feat(crm): CRM B2B completo — Fase 1 + Fase 2 Cadencia
  ```
- La carpeta `crm/` está commiteada en `produccion2` desde el 2026-05-01.

### Estado del merge

El CRM está commiteado en `produccion2` desde el 2026-05-01. No hay rama separada pendiente de merge.

---

## Motor de Cadencia (Fase 2) — 2026-05-01

### Qué hace
Detecta cuentas asignadas a un vendedor cuya frecuencia de compra ha caído por debajo de su ciclo histórico. Aparece en "Mi Día" → sección naranja "Contactar hoy".

### Algoritmo
```
avg_freq_dias = 365 / orders_12m   (frecuencia implícita de los últimos 12 meses)
ratio_overdue = dias_desde_ultima / avg_freq_dias
Alerta si ratio_overdue > 1 AND dias_desde_ultima >= 7
```
- Umbral mínimo: `orders_12m >= 2` (necesita patrón confiable).
- Urgencia: `ratio >= 3` → "urgente" · `ratio >= 1.8` → "alta" · resto → "media".
- Ordenado por `ratio_overdue DESC` (los más atrasados primero). Límite 15.

### Archivos modificados
| Archivo | Cambio |
|---|---|
| `backend/routes/mi_dia.py` | `_get_cadencia_alerts()` + `_get_cadencia_count()` + wire-up en `/mi-dia` y `/mi-dia/kpis` |
| `backend/migrations/startup_ddl.py` | Índice `idx_cuenta_asignado_a` + `IF NOT EXISTS` en `mv_cuenta_sales_kpi` (evita drop en cada restart) |
| `frontend/src/pages/MiDiaPage.jsx` | Componente `CadenciaRow` + KPI "Contactar hoy" + render de la sección |

### Limitación actual
El motor solo detecta cuentas con `crm.cuenta.asignado_a` asignado. Si los vendedores no tienen cuentas asignadas, el motor devuelve 0. **Próximo paso**: asignar cuentas a vendedores en la tabla `crm.cuenta`.

### Próximos pasos de Cadencia
- [ ] Asignar cuentas a vendedores (campo `asignado_a` en `crm.cuenta`)
- [ ] Sugerir acción específica (llamar, visitar, WhatsApp) según canal histórico de interacciones
- [ ] Mostrar botón de acción rápida en `CadenciaRow` (WhatsApp, llamar)
- [ ] Silenciar alertas individuales (snooze por N días)

---

## Cambios destacables del 2026-04-29 / 04-30

### 1. Refactor a vistas centralizadas
Eliminada toda lógica replicada de "venta real" en `cuentas.py`. Todo consume `odoo.v_pos_*_real`. APAZA (1712) coincide entre CRM y Ventas: 227 órdenes / 16 692 unidades.

### 2. Fix órdenes huérfanas
`v_pos_order_real` incluía órdenes cuyas TODAS las líneas eran productos prohibidos (PANETON, PROVADOR, LAPICERO). Agregado `EXISTS (SELECT 1 FROM v_pos_line_real …)` o `INNER JOIN agg` en endpoints relevantes. La MV `mv_cuenta_sales_kpi` ahora agrupa por `cliente_efectivo_id` (no por `partner_id`).

### 3. YoY con modo YTD vs FULL_YEAR
Bug: comparar año entero vs año entero daba caídas falsas durante el primer trimestre. Solución:
- Backend: parámetro `mode=ytd|full_year` (default `ytd`) en `/yoy/metrics`, `/yoy/by-month`, `/yoy/by-item`, `/yoy/item-orders`.
- `_calcular_cutoffs` maneja edge case 29-feb año no bisiesto.
- `/ventas/years-available` lista años con data para selector multi-año.
- Frontend: toggle YTD/Año completo persistido en `localStorage` + 2 selectores de año + swap automático si `yearA < yearB`.

APAZA (1712) al 28 abr 2026:
- `mode=full_year` → −63.8% (lectura incorrecta: 4 meses vs 12 meses)
- `mode=ytd` → +26.0% (lectura correcta: enero–hoy vs mismo período año anterior)

### 4. Performance crítica (12s → 1s)
Creada `crm.mv_pos_line_cuenta` + scheduler asyncio en `server.py` para refresh nocturno 3am Lima. Detalles en sección "Arquitectura clave".

### 5. Branding propio
- Title: `CRM B2B · ERP Textil`
- Favicon: SVG inline (C blanca sobre círculo `slate-900`)
- Eliminados scripts de `emergent.sh`, badge "Made with Emergent" y PostHog tracking.

---

## Endpoints clave

| Endpoint | Notas |
|---|---|
| `GET /api/cuentas/{id}` | Ficha de cuenta (datos del partner + estado comercial CRM) |
| `GET /api/cuentas/{id}/header-metrics` | Sub-KPIs del header (ventas 12m, órdenes 12m, última compra) |
| `GET /api/cuentas/{id}/ventas/metrics` | Métricas globales de ventas |
| `GET /api/cuentas/{id}/ventas/orders` | Lista paginada de órdenes |
| `GET /api/cuentas/{id}/ventas/clasificacion` | Tabla por marca/tipo/entalle |
| `GET /api/cuentas/{id}/ventas/yoy/metrics?mode=ytd\|full_year&year_a=&year_b=` | KPIs YoY |
| `GET /api/cuentas/{id}/ventas/yoy/by-month?mode=…` | YoY por mes (gráfico) |
| `GET /api/cuentas/{id}/ventas/yoy/by-item?mode=…` | YoY por item (top productos) |
| `GET /api/cuentas/{id}/ventas/yoy/item-orders?year=&mode=…` | Drill-down órdenes de un item |
| `GET /api/cuentas/{id}/ventas/years-available` | Años con data para selector |

---

## Pendientes

- [x] **Validación visual** YoY YTD + selector de años → ✅ validado 2026-05-01.
- [x] **Validación visual** performance YoY → ✅ ~700ms steady-state validado 2026-05-01.
- [x] **Validación visual** branding → ✅ title, favicon "C", sin badge Emergent.
- [x] **Merge a `produccion2`** → ✅ commiteado 2026-05-01 (commit `547ba04`).
- [x] **Fase 2: Cadencia** — implementada 2026-05-01. Ver sección "Motor de Cadencia" más abajo.
- [x] **Resilencia ante restart de odoo** → ✅ 2026-05-06. `startup_ddl.py` Step 0 recrea `odoo.v_pos_line_real` si el backend odoo la borró con CASCADE. Commit `ffb76c2`.
- [x] **CRM en `start-all.sh`** → ✅ 2026-05-06. `./start-all.sh` arranca :8004 y :3004 junto con el resto del ERP.

---

## Atajos útiles

```bash
# Logs del backend
tail -f /tmp/crm-backend.log

# Refrescar matviews manualmente (sin esperar 3am)
psql "postgresql://admin:admin@72.60.241.216:9595/datos" -c "
  REFRESH MATERIALIZED VIEW CONCURRENTLY crm.mv_pos_line_cuenta;
  REFRESH MATERIALIZED VIEW CONCURRENTLY crm.mv_cuenta_sales_kpi;
  ANALYZE crm.mv_pos_line_cuenta;
  ANALYZE crm.mv_cuenta_sales_kpi;
"

# Health check
curl -s http://localhost:8004/api/health

# Ver el plan SQL de un endpoint (para optimización)
# Generar JWT desde Python (admin user) y curl con Authorization Bearer
```

---

## Decisiones arquitectónicas (no repetir)

- **Frontend separado** en su propio puerto (`:3004`), no integrado al de Ventas. Decisión "Camino B" del 2026-04-something.
- **Single source of truth en SQL**, no en helpers de Python. Si se cambia la definición de "venta real", solo se modifican las vistas `odoo.v_pos_*_real`.
- **Matviews refrescadas por scheduler asyncio interno** (no APScheduler, no cron del SO). Sin dependencias nuevas.
- **No mergear a `produccion2` automáticamente**. Decisión humana cuando la rama base esté limpia.
