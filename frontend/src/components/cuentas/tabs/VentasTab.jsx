/**
 * VentasTab — refactor visual Hilo (Sprint CRM-D4 v3).
 *
 * Layout:
 *   ┌──────┬──────┬──────┬──────┐
 *   │ KPI1 │ KPI2 │ KPI3 │ KPI4 │   números grandes Fraunces + mono labels
 *   └──────┴──────┴──────┴──────┘
 *
 *   ┌─ Período ── [yyyy-mm-dd] ── [yyyy-mm-dd] ─ [Reset] ──── [⊟⊟⊟] ─┐
 *
 *   <Vista activa: Por orden / Por clasificación / YoY>
 */
import React, { useCallback, useState } from "react";
import api from "@/lib/api";
import { useTabData } from "@/hooks/useTabData";
import { AlertCircle, RefreshCw } from "lucide-react";
import { VistaPorOrden } from "@/components/cuentas/tabs/ventas/VistaPorOrden";
import { VistaClasificacion } from "@/components/cuentas/tabs/ventas/VistaClasificacion";
import { VistaYoY } from "@/components/cuentas/tabs/ventas/VistaYoY";

const fmtNum = (n) => Number(n || 0).toLocaleString("es-PE");
const fmtDateShort = (d) =>
  d ? new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit" }) : "—";

const VISTAS = [
  { key: "orden",         label: "Por orden" },
  { key: "clasificacion", label: "Por clasificación" },
  { key: "yoy",           label: "YoY" },
];

// ── KPI estilo Hilo: número grande Fraunces + label mono uppercase ──
function HiloKpi({ label, value, sub, accent }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 min-w-[140px]">
      <div
        className="text-2xl leading-none font-semibold tracking-tight tabular-nums"
        style={{ fontFamily: "var(--font-display)", color: accent || "var(--ink)" }}
        data-testid={`kpi-${label.toLowerCase().replace(/\s/g, "-")}`}
      >
        {value}
      </div>
      <div
        className="text-[10px] mt-2 font-mono font-medium uppercase"
        style={{ color: "var(--ink-3)", letterSpacing: "0.14em" }}
      >
        {label}
      </div>
      {sub && (
        <div className="text-[11px] mt-0.5" style={{ color: "var(--ink-3)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Segmented toggle minimal (Por orden / Por clasificación / YoY) ──
function SegmentedToggle({ value, options, onChange }) {
  return (
    <div
      className="inline-flex p-0.5 rounded-lg bg-slate-100 border border-slate-200"
      role="tablist"
    >
      {options.map((opt) => {
        const on = value === opt.key;
        return (
          <button
            key={opt.key}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(opt.key)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
              on
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
            data-testid={`vista-${opt.key}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// Default: desde enero 2024 hasta hoy
const today = () => new Date().toISOString().slice(0, 10);
const monthsAgo = (n) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
};
const DEFAULT_DESDE = "2024-01-01";

const dateInputCls = "h-8 px-2.5 rounded-md border border-slate-200 text-xs bg-white outline-none focus:border-slate-400 transition-colors";

export function VentasTab({ partnerOdooId, active, staleKey }) {
  const [vista, setVista]      = useState("orden");
  const [fechaDesde, setDesde] = useState(DEFAULT_DESDE);
  const [fechaHasta, setHasta] = useState(today());

  // Sub-KPIs combinan /metrics + /analitica/frecuencia
  const fetchHeader = useCallback(async () => {
    const [m, f] = await Promise.all([
      api.get(`/cuentas/${partnerOdooId}/ventas/metrics`).catch(() => ({ data: null })),
      api.get(`/cuentas/${partnerOdooId}/ventas/analitica/frecuencia`).catch(() => ({ data: null })),
    ]);
    return { metrics: m.data, frecuencia: f.data };
  }, [partnerOdooId]);

  const { data: header, loading: loadingHeader, error: errHeader } = useTabData(
    fetchHeader, { enabled: active, staleKey }
  );

  const limpiarFiltros = () => {
    setDesde(DEFAULT_DESDE);
    setHasta(today());
  };

  const metrics    = header?.metrics    || {};
  const frecuencia = header?.frecuencia || {};

  const totalOrdenes  = metrics.orders_count ?? 0;
  const totalUnidades = metrics.qty_total    ?? 0;
  const frecuenciaDias = frecuencia.frecuencia_promedio
    ? `cada ${Math.round(frecuencia.frecuencia_promedio)}d`
    : "—";
  const diasSinComprar = frecuencia.dias_sin_comprar;
  const ultimaCompra = diasSinComprar != null
    ? (diasSinComprar === 0 ? "hoy" : `hace ${diasSinComprar}d`)
    : "—";
  const ultimaCompraSub = frecuencia.ultima_compra ? fmtDateShort(frecuencia.ultima_compra) : null;

  if (errHeader) {
    return (
      <div className="border rounded-lg p-3 flex items-center gap-2 text-sm">
        <AlertCircle className="h-4 w-4 text-red-500" />
        <span className="text-slate-600 flex-1">{errHeader}</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ─── 4 KPIs estilo Hilo ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="ventas-kpis">
        {loadingHeader && !header ? (
          [0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[88px] bg-slate-100 rounded-lg animate-pulse" />
          ))
        ) : (
          <>
            <HiloKpi label="Total órdenes"  value={fmtNum(totalOrdenes)} />
            <HiloKpi label="Total unidades" value={fmtNum(totalUnidades)} />
            <HiloKpi label="Frecuencia"     value={frecuenciaDias} />
            <HiloKpi
              label="Última compra"
              value={ultimaCompra}
              sub={ultimaCompraSub}
              accent={
                diasSinComprar > 90 ? "var(--crit)" :
                diasSinComprar > 30 ? "var(--warn)" : null
              }
            />
          </>
        )}
      </div>

      {/* ─── Toolbar: período + segmented vista ─── */}
      <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-mono uppercase font-medium"
            style={{ color: "var(--ink-3)", letterSpacing: "0.14em" }}
          >
            Desde
          </span>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setDesde(e.target.value)}
            className={dateInputCls}
            data-testid="ventas-fecha-desde"
          />
          <span
            className="text-[10px] font-mono uppercase font-medium ml-1"
            style={{ color: "var(--ink-3)", letterSpacing: "0.14em" }}
          >
            Hasta
          </span>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setHasta(e.target.value)}
            className={dateInputCls}
            data-testid="ventas-fecha-hasta"
          />
          <button
            onClick={limpiarFiltros}
            className="h-8 px-2 rounded-md text-xs text-slate-500 hover:text-slate-900 hover:bg-slate-100 inline-flex items-center gap-1 transition-colors"
            data-testid="ventas-reset"
          >
            <RefreshCw className="h-3 w-3" /> Reset
          </button>
        </div>

        <div className="ml-auto">
          <SegmentedToggle value={vista} options={VISTAS} onChange={setVista} />
        </div>
      </div>

      {/* ─── Vista activa ─── */}
      <div className="min-h-[300px]">
        {vista === "orden" && (
          <VistaPorOrden
            partnerOdooId={partnerOdooId}
            fechaDesde={fechaDesde}
            fechaHasta={fechaHasta}
          />
        )}
        {vista === "clasificacion" && (
          <VistaClasificacion
            partnerOdooId={partnerOdooId}
            fechaDesde={fechaDesde}
            fechaHasta={fechaHasta}
          />
        )}
        {vista === "yoy" && (
          <VistaYoY partnerOdooId={partnerOdooId} />
        )}
      </div>
    </div>
  );
}
