/**
 * CalidadDatos — vista admin de problemas de calidad de datos.
 *
 * Layout:
 *   ┌─ 5 KPI cards (clickables → filtro por severidad) ──────┐
 *   ├─ Chips por regla específica con conteo ─────────────────┤
 *   ├─ Tabla ordenada por severidad ──────────────────────────┤
 *   │   cuenta · severidad · problemas · datos actuales · 🔧 │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Endpoint: GET /api/cuentas/admin/calidad-datos
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle, Filter, Loader2, RefreshCw, ArrowRight, AlertTriangle,
  CircleAlert, CircleHelp, Sparkles,
} from "lucide-react";
import { CorregirDrawer } from "@/components/cuentas/CorregirDrawer";

const fmtMoney = (n) =>
  "S/ " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtNum = (n) => Number(n || 0).toLocaleString("es-PE");

const SEVERIDAD_STYLE = {
  critico:    { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-200",    dot: "bg-red-500",    label: "Crítico" },
  sucio:      { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200",  dot: "bg-amber-500",  label: "Sucio" },
  incompleto: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", dot: "bg-purple-400", label: "Incompleto" },
};

// ─────────────────────────────────────────────────────────────
// KPI card grande (clickable como filtro)
// ─────────────────────────────────────────────────────────────
function KpiCard({ label, sublabel, value, accent, dotColor, onClick, active }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col text-left bg-white border rounded-lg px-4 py-3 transition-all ${
        active ? "border-slate-900 shadow-md ring-2 ring-slate-900/5" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        {dotColor && <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />}
        <span className="text-[9px] uppercase tracking-[0.14em] font-mono text-slate-500">
          {label}
        </span>
      </div>
      <span
        className={`text-2xl font-semibold tabular-nums leading-none ${accent || "text-slate-900"}`}
        style={{ fontFamily: "var(--font-display)" }}
      >
        {fmtNum(value)}
      </span>
      {sublabel && (
        <span className="text-[10px] text-slate-500 mt-2 truncate">{sublabel}</span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Severidad badge
// ─────────────────────────────────────────────────────────────
function SeveridadBadge({ severidad }) {
  const s = SEVERIDAD_STYLE[severidad];
  if (!s) return null;
  const Icon = severidad === "critico" ? CircleAlert
             : severidad === "sucio"   ? AlertTriangle
             : CircleHelp;
  return (
    <Badge variant="outline" className={`text-[10px] font-semibold gap-1 ${s.bg} ${s.text} ${s.border}`}>
      <Icon className="h-3 w-3" /> {s.label}
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────
export default function CalidadDatos() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [severidadFilter, setSeveridadFilter] = useState(""); // "" = todos
  const [ruleFilter, setRuleFilter] = useState("");
  const [corregirItem, setCorregirItem] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get("/cuentas/admin/calidad-datos", {
        params: {
          severidad: severidadFilter || undefined,
          rule: ruleFilter || undefined,
          limit: 500,
        },
      });
      setData(r.data);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  }, [severidadFilter, ruleFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const summary = data?.summary || {};
  const items = data?.items || [];
  const ruleCounts = data?.rule_counts || [];

  const setSeveridad = (sev) => {
    setSeveridadFilter(prev => prev === sev ? "" : sev);
    setRuleFilter("");
  };
  const setRule = (rule) => setRuleFilter(prev => prev === rule ? "" : rule);

  return (
    <div className="px-6 py-4 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            Calidad de datos
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Cuentas con datos sucios, mal puestos o incompletos · revisar manualmente
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={fetchData}
          disabled={loading}
          className="h-8 gap-1.5"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Re-validar todo
        </Button>
      </div>

      {/* KPI cards */}
      {loading && !data ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mb-4">
          {[0,1,2,3,4].map(i => <div key={i} className="h-20 bg-slate-100 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mb-4">
          <KpiCard
            label="Con problemas"
            sublabel={`${summary.pct_problemas}% del total`}
            value={summary.con_problemas}
            active={!severidadFilter}
            onClick={() => setSeveridadFilter("")}
          />
          <KpiCard
            label="Críticos"
            sublabel="Bloquean seguimiento"
            value={summary.criticos}
            accent="text-red-600"
            dotColor="bg-red-500"
            active={severidadFilter === "critico"}
            onClick={() => setSeveridad("critico")}
          />
          <KpiCard
            label="Datos sucios"
            sublabel="Campo equivocado"
            value={summary.sucios}
            accent="text-amber-700"
            dotColor="bg-amber-500"
            active={severidadFilter === "sucio"}
            onClick={() => setSeveridad("sucio")}
          />
          <KpiCard
            label="Incompletos"
            sublabel="Faltan datos"
            value={summary.incompletos}
            accent="text-purple-700"
            dotColor="bg-purple-400"
            active={severidadFilter === "incompleto"}
            onClick={() => setSeveridad("incompleto")}
          />
          <KpiCard
            label="Nuevos sin datos"
            sublabel="<90d sin tel/depto"
            value={summary.nuevos_sin_datos}
            accent={summary.nuevos_sin_datos > 0 ? "text-orange-700" : "text-slate-500"}
            dotColor="bg-orange-400"
          />
        </div>
      )}

      {/* Chips de severidad — filtro primario */}
      <div className="flex items-center gap-1 flex-wrap mb-2">
        <span className="text-[9px] uppercase tracking-[0.14em] font-mono text-slate-500 mr-2">
          Severidad:
        </span>
        <button
          onClick={() => { setSeveridadFilter(""); setRuleFilter(""); }}
          className={`px-2 py-0.5 rounded-full text-[11px] border transition-colors ${
            !severidadFilter
              ? "bg-slate-900 text-white border-slate-900"
              : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
          }`}
        >
          Todas
          <span className={!severidadFilter ? "text-slate-300 ml-1" : "text-slate-400 ml-1"}>
            · {summary.con_problemas ?? 0}
          </span>
        </button>
        {[
          { key: "critico",    label: "Crítico",    count: summary.criticos    ?? 0, dotCls: "bg-red-500"    },
          { key: "sucio",      label: "Sucio",      count: summary.sucios      ?? 0, dotCls: "bg-amber-500"  },
          { key: "incompleto", label: "Incompleto", count: summary.incompletos ?? 0, dotCls: "bg-purple-400" },
        ].map(s => {
          const isActive = severidadFilter === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setSeveridad(s.key)}
              className={`px-2 py-0.5 rounded-full text-[11px] border transition-colors inline-flex items-center gap-1.5 ${
                isActive
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              }`}
              data-testid={`severidad-chip-${s.key}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${s.dotCls}`} />
              {s.label}
              <span className={isActive ? "text-slate-300" : "text-slate-400"}>· {s.count}</span>
            </button>
          );
        })}
      </div>

      {/* Chips de reglas específicas — filtro secundario */}
      {ruleCounts.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap mb-3">
          <Filter className="h-3 w-3 text-slate-400 mr-1" />
          <span className="text-[9px] uppercase tracking-[0.14em] font-mono text-slate-500 mr-1">
            Regla:
          </span>
          <button
            onClick={() => setRuleFilter("")}
            className={`px-2 py-0.5 rounded-full text-[11px] border transition-colors ${
              !ruleFilter
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
            }`}
          >
            Todas
          </button>
          {ruleCounts.map(rc => {
            const isActive = ruleFilter === rc.rule;
            return (
              <button
                key={rc.rule}
                onClick={() => setRule(rc.rule)}
                className={`px-2 py-0.5 rounded-full text-[11px] border transition-colors ${
                  isActive
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                }`}
              >
                {rc.label} <span className={isActive ? "text-slate-300" : "text-slate-400"}>· {rc.count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Tabla */}
      {loading && !data ? (
        <div className="space-y-1.5">
          {[0,1,2,3,4].map(i => <div key={i} className="h-14 bg-slate-100 rounded animate-pulse" />)}
        </div>
      ) : error ? (
        <div className="border rounded p-3 flex items-center gap-2 text-sm">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <span className="text-slate-600 flex-1">{error}</span>
          <Button size="sm" variant="outline" onClick={fetchData}>Reintentar</Button>
        </div>
      ) : items.length === 0 ? (
        <div className="border rounded-md px-3 py-12 text-center text-sm text-slate-400 italic">
          ✓ Sin problemas detectados con los filtros actuales
        </div>
      ) : (
        <div className="border rounded-md overflow-hidden bg-white">
          {/* Header — Última compra movida al final, junto a Acción */}
          <div
            className="grid items-center gap-3 px-3 py-1.5 border-b bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"
            style={{ gridTemplateColumns: "minmax(200px,1.4fr) 100px minmax(260px,1.8fr) minmax(180px,1.1fr) 90px 90px" }}
          >
            <div>Cuenta</div>
            <div>Severidad</div>
            <div>Problema(s) detectado(s)</div>
            <div>Datos actuales</div>
            <div className="text-right">Última compra</div>
            <div className="text-right">Acción</div>
          </div>

          {items.map(it => {
            const top3 = it.problemas.slice(0, 3);
            // Días desde última compra para colorear
            const dias = it.last_purchase_date
              ? Math.floor((Date.now() - new Date(it.last_purchase_date).getTime()) / 86400000)
              : null;
            const ultimaCls = dias == null ? "text-slate-300"
              : dias <= 30  ? "text-emerald-700"
              : dias <= 90  ? "text-slate-600"
              : dias <= 180 ? "text-amber-700"
              : "text-red-600";
            return (
              <div
                key={it.cuenta_partner_odoo_id}
                className="grid items-start gap-3 px-3 py-3 border-b last:border-0 text-sm hover:bg-slate-50/40"
                style={{ gridTemplateColumns: "minmax(200px,1.4fr) 100px minmax(260px,1.8fr) minmax(180px,1.1fr) 90px 90px" }}
                data-testid={`calidad-row-${it.cuenta_partner_odoo_id}`}
              >
                {/* Cuenta */}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium text-slate-900 truncate">
                      {it.nombre || `#${it.cuenta_partner_odoo_id}`}
                    </span>
                    {it.es_nuevo && (
                      <Badge
                        variant="outline"
                        className="text-[8px] font-bold bg-blue-50 text-blue-700 border-blue-200 px-1 py-0"
                        title="Cuenta creada en Odoo hace menos de 90 días"
                      >
                        NUEVO
                      </Badge>
                    )}
                  </div>
                  {it.tier && (
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5 uppercase">
                      {it.tier}
                    </div>
                  )}
                </div>

                {/* Severidad */}
                <div className="pt-0.5">
                  <SeveridadBadge severidad={it.severidad} />
                </div>

                {/* Problemas */}
                <div className="space-y-1">
                  {top3.map((p, i) => {
                    const s = SEVERIDAD_STYLE[p.severidad];
                    return (
                      <div key={i} className="flex items-start gap-1.5 text-[12px] leading-snug">
                        <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${s.dot}`} />
                        <span>
                          <span className={`font-mono uppercase text-[9px] tracking-wider ${s.text} mr-1`}>
                            {p.label}:
                          </span>
                          <span className="text-slate-600">{p.detalle}</span>
                        </span>
                      </div>
                    );
                  })}
                  {it.problemas.length > 3 && (
                    <div className="text-[10px] text-slate-400 italic ml-3">
                      + {it.problemas.length - 3} problema{it.problemas.length - 3 === 1 ? "" : "s"} más
                    </div>
                  )}
                </div>

                {/* Datos actuales — solo phone + depto (lo que importa) */}
                <div className="text-[11px] font-mono text-slate-600 space-y-1 min-w-0">
                  {/* Teléfono */}
                  <div className="flex items-center flex-wrap">
                    <span className="text-slate-400 w-12 shrink-0">tel:</span>
                    <span className={`truncate ${it.phone ? "" : "text-red-500 italic"}`}>
                      {it.phone || "—"}
                    </span>
                    {it.phone_source === "mobile" && (
                      <span
                        className="ml-1.5 text-[8px] font-bold uppercase tracking-wider px-1 py-0 rounded bg-blue-50 text-blue-700 border border-blue-200"
                        title="El número está en el campo 'mobile' de Odoo (no en 'phone')"
                      >
                        móv
                      </span>
                    )}
                  </div>
                  {/* Referencia phone desde vinculado */}
                  {it.phone_referencia && (
                    <div
                      className="flex items-start gap-1 pl-12 text-[10px] text-amber-700 leading-tight"
                      title={`Este teléfono está en el contacto vinculado "${it.phone_referencia_partner}". Puedes copiarlo al principal.`}
                    >
                      <span className="text-amber-500">↳</span>
                      <span className="truncate">
                        ref: <b>{it.phone_referencia}</b>
                        <span className="text-amber-500 not-italic"> (de {(it.phone_referencia_partner || "").split(" ").slice(0,2).join(" ")})</span>
                      </span>
                    </div>
                  )}
                  {/* Departamento */}
                  <div className="flex">
                    <span className="text-slate-400 w-12 shrink-0">depto:</span>
                    <span className={`truncate ${it.depto_actual ? "" : "text-red-500 italic"}`}>
                      {it.depto_actual || "—"}
                    </span>
                  </div>
                  {/* Referencia depto desde vinculado */}
                  {it.depto_referencia && (
                    <div
                      className="flex items-start gap-1 pl-12 text-[10px] text-amber-700 leading-tight"
                      title={`Este depto está en el contacto vinculado "${it.depto_referencia_partner}".`}
                    >
                      <span className="text-amber-500">↳</span>
                      <span className="truncate">
                        ref: <b>{it.depto_referencia}</b>
                        <span className="text-amber-500"> (de {(it.depto_referencia_partner || "").split(" ").slice(0,2).join(" ")})</span>
                      </span>
                    </div>
                  )}
                </div>

                {/* Última compra */}
                <div className={`text-right text-xs font-mono tabular-nums whitespace-nowrap ${ultimaCls}`}>
                  {it.last_purchase_date ? (
                    <>
                      <div>{dias === 0 ? "hoy" : dias === 1 ? "ayer" : `${dias}d`}</div>
                      <div className="text-[9px] text-slate-400 mt-0.5">
                        {new Date(it.last_purchase_date).toLocaleDateString("es-PE", { day:"2-digit", month:"short", year:"2-digit" })}
                      </div>
                    </>
                  ) : (
                    <span className="text-slate-300 italic">—</span>
                  )}
                </div>

                {/* Acción */}
                <div className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCorregirItem(it)}
                    className="h-7 text-[11px] gap-1"
                    data-testid={`corregir-${it.cuenta_partner_odoo_id}`}
                    title="Abrir drawer para corregir solo los campos rotos"
                  >
                    <Sparkles className="h-3 w-3" /> Corregir
                  </Button>
                </div>
              </div>
            );
          })}

          {data?.items_truncated && (
            <div className="px-3 py-2 border-t bg-slate-50/50 text-[10px] text-slate-500 font-mono uppercase tracking-wider text-center">
              Mostrando primeros 500 resultados — usa filtros para refinar
            </div>
          )}
        </div>
      )}

      {/* Cómo funciona */}
      <div className="mt-6 px-4 py-3 bg-slate-50/60 border border-slate-200 rounded-lg text-[11px] text-slate-600 leading-relaxed">
        <span className="font-semibold text-slate-700">Cómo funciona:</span>{" "}
        al sincronizar con Odoo, el CRM aplica reglas de validación. Las{" "}
        <span className="text-red-700 font-semibold">críticas</span> bloquean el seguimiento (no se puede llamar sin tel ni
        asignar ruta sin depto), las <span className="text-amber-700 font-semibold">sucias</span> detectan datos en el campo
        equivocado (ej. un país en "Departamento"), y las{" "}
        <span className="text-purple-700 font-semibold">incompletas</span> son nice-to-have. Click en{" "}
        <b>Corregir</b> para abrir un drawer focalizado solo en los campos rotos.
      </div>

      {/* Drawer para corregir */}
      {corregirItem && (
        <CorregirDrawer
          cuentaItem={corregirItem}
          onClose={() => setCorregirItem(null)}
          onSaved={() => fetchData()}
        />
      )}
    </div>
  );
}
