import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ChevronRight, ChevronDown, ArrowUp, ArrowDown, Loader2, AlertCircle, Info, RefreshCw,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { useTabData } from "@/hooks/useTabData";

const fmtMoney = (n) =>
  "S/. " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtMoneyDec = (n) =>
  "S/. " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (n) =>
  Number(n || 0).toLocaleString("es-PE");
const fmtPct = (n) => {
  if (n == null) return "—";
  const v = Number(n);
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
};
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

// "2026-04-28" → "28 abr"
const fmtCutoffShort = (iso) => {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-PE", { day: "numeric", month: "short" }).replace(".", "");
};

const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

const deltaColor = (pct) => {
  if (pct == null) return "text-slate-500";
  if (pct > 5)  return "text-emerald-600";
  if (pct < -5) return "text-red-600";
  return "text-slate-500";
};

function DeltaCell({ pct }) {
  const cls = deltaColor(pct);
  const Icon = pct > 0 ? ArrowUp : (pct < 0 ? ArrowDown : null);
  return (
    <span className={`inline-flex items-center gap-0.5 tabular-nums ${cls}`}>
      {Icon && <Icon className="h-3 w-3" />}
      {fmtPct(pct)}
    </span>
  );
}

function ModeToggle({ mode, cutoffDate, onChange }) {
  const cutoffLabel = mode === "ytd" && cutoffDate ? `YTD al ${fmtCutoffShort(cutoffDate)}` : "YTD";
  const tooltipText =
    mode === "ytd"
      ? "YTD compara enero–hoy con el mismo período del año anterior. Lectura justa cuando el año en curso aún no terminó."
      : "Año completo compara los 12 meses de cada año. Da caídas falsas durante el primer trimestre del año en curso.";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] uppercase tracking-wider text-slate-400">Comparativa:</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange("ytd")}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            mode === "ytd"
              ? "bg-slate-900 text-white"
              : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
          }`}
          title="Comparar enero–hoy vs mismo período del año anterior"
        >
          {cutoffLabel}
        </button>
        <button
          onClick={() => onChange("full_year")}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            mode === "full_year"
              ? "bg-slate-900 text-white"
              : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
          }`}
          title="Comparar año entero vs año entero"
        >
          Año completo
        </button>
      </div>
      <span
        className="inline-flex items-center text-slate-400 hover:text-slate-600 cursor-help"
        title={tooltipText}
      >
        <Info className="h-3.5 w-3.5" />
      </span>
    </div>
  );
}

function MetricsTable({ year_a_data, year_b_data, delta, currentYear, prevYear }) {
  const rows = [
    { label: "Ventas",    a: fmtMoney(year_a_data?.ventas),    b: fmtMoney(year_b_data?.ventas),    pct: delta?.ventas_pct },
    { label: "Unidades",  a: fmtNum(year_a_data?.unidades),    b: fmtNum(year_b_data?.unidades),    pct: delta?.unidades_pct },
    { label: "Órdenes",   a: fmtNum(year_a_data?.compras),     b: fmtNum(year_b_data?.compras),     pct: delta?.compras_pct },
  ];
  return (
    <div className="border rounded-md overflow-hidden">
      <div
        className="grid items-center gap-2 px-3 py-1.5 border-b bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"
        style={{ gridTemplateColumns: "minmax(120px,1.2fr) 110px 110px 100px" }}
      >
        <div></div>
        <div className="text-right">{currentYear}</div>
        <div className="text-right">{prevYear}</div>
        <div className="text-right">Δ</div>
      </div>
      {rows.map((r, i) => (
        <div
          key={i}
          className="grid items-center gap-2 px-3 py-2 border-b last:border-0 text-sm"
          style={{ gridTemplateColumns: "minmax(120px,1.2fr) 110px 110px 100px" }}
        >
          <div className="font-medium text-slate-700">{r.label}</div>
          <div className="text-right tabular-nums font-semibold">{r.a}</div>
          <div className="text-right tabular-nums text-slate-500">{r.b}</div>
          <div className="text-right text-xs"><DeltaCell pct={r.pct} /></div>
        </div>
      ))}
    </div>
  );
}

function MonthlyChart({ months, currentYear, prevYear, mode }) {
  if (!months || months.length === 0) {
    return (
      <div className="px-3 py-8 text-center text-sm text-slate-400 italic border rounded-md">
        Sin datos mensuales para esta cuenta
      </div>
    );
  }

  const data = months.map(m => ({
    name: MONTHS[m.month - 1] || `M${m.month}`,
    [String(currentYear)]: m.ventas_a || 0,
    [String(prevYear)]:    m.ventas_b || 0,
  }));

  return (
    <div className="border rounded-md p-3">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[11px] font-semibold tracking-wider uppercase text-slate-500">
          Ventas mensuales · {currentYear} vs {prevYear}
        </div>
        <div className="text-[10px] text-slate-400">
          {mode === "ytd" ? "YTD" : "Año completo"}
        </div>
      </div>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => v >= 1000 ? `${Math.round(v/1000)}k` : v}
            />
            <Tooltip
              cursor={{ fill: "rgba(15,23,42,0.04)" }}
              formatter={(v) => fmtMoneyDec(v)}
              labelClassName="text-xs"
              contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #e2e8f0" }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
            <Bar dataKey={String(currentYear)} fill="#0f172a" radius={[3,3,0,0]} />
            <Bar dataKey={String(prevYear)}    fill="#cbd5e1" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ItemRow({ item, expanded, onToggle, partnerOdooId, currentYear, prevYear, mode, cutoffDate }) {
  const isOnlyA = (item.ventas_a > 0) && (!item.ventas_b);
  const isOnlyB = (!item.ventas_a) && (item.ventas_b > 0);

  const [yearView, setYearView] = useState(currentYear);
  const [orders, setOrders] = useState({});
  const [loadingOrders, setLoading] = useState(false);
  const [errOrders, setErr] = useState(null);

  // Si el modo o cutoff cambia, invalida el caché de órdenes ya cargadas.
  useEffect(() => {
    setOrders({});
  }, [mode, cutoffDate]);

  const loadOrdersForYear = useCallback(async (yr) => {
    if (orders[yr]) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await api.get(`/cuentas/${partnerOdooId}/ventas/yoy/item-orders`, {
        params: {
          year: yr,
          mode,
          marca:   item.marca   || "",
          tipo:    item.tipo    || "",
          entalle: item.entalle || "",
          tela:    item.tela    || "",
          limit: 100,
        },
      });
      setOrders(prev => ({ ...prev, [yr]: r.data?.rows || [] }));
    } catch (e) {
      setErr(e.response?.data?.detail || e.message);
    } finally { setLoading(false); }
  }, [partnerOdooId, item, orders, mode]);

  const handleToggle = () => {
    onToggle();
    if (!expanded) loadOrdersForYear(yearView);
  };

  const switchYear = (yr) => {
    setYearView(yr);
    if (!orders[yr]) loadOrdersForYear(yr);
  };

  const cols = "20px minmax(160px,1.4fr) 90px 90px 90px 90px 100px 80px";

  // Subtítulo del drill-down según el modo
  const drilldownSubtitle = mode === "ytd" && cutoffDate
    ? `Órdenes (YTD al ${fmtCutoffShort(cutoffDate)}):`
    : "Órdenes (año completo):";

  return (
    <>
      <div
        onClick={handleToggle}
        className="grid items-center gap-2 px-3 py-1.5 border-b text-sm hover:bg-slate-50 transition-colors cursor-pointer"
        style={{ gridTemplateColumns: cols }}
      >
        <div className="text-slate-400">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </div>
        <div className="min-w-0">
          <div className="text-slate-900 font-medium truncate">{item.marca || "—"}</div>
          <div className="text-[11px] text-slate-500 truncate">
            {[item.tipo, item.entalle, item.tela].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
        <div className="text-right text-slate-700 tabular-nums">{fmtMoney(item.ventas_a)}</div>
        <div className="text-right text-slate-500 tabular-nums">{fmtMoney(item.ventas_b)}</div>
        <div className="text-right text-xs"><DeltaCell pct={item.var_pct} /></div>
        <div className={`text-right tabular-nums text-xs ${item.var_abs < 0 ? "text-red-600" : item.var_abs > 0 ? "text-emerald-600" : "text-slate-500"}`}>
          {item.var_abs > 0 ? "+" : ""}{fmtMoney(item.var_abs)}
        </div>
        <div className="text-right text-[11px] text-slate-500 tabular-nums">
          {fmtNum(item.unidades_a)} / {fmtNum(item.unidades_b)}
        </div>
        <div className="text-right">
          {isOnlyA && <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200">Nuevo</Badge>}
          {isOnlyB && <Badge variant="outline" className="text-[9px] bg-red-50 text-red-700 border-red-200">Perdido</Badge>}
        </div>
      </div>

      {expanded && (
        <div className="border-b bg-slate-50/50 px-3 py-2">
          {/* Toggle de año */}
          <div className="flex items-center gap-1 mb-2">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 mr-1">{drilldownSubtitle}</span>
            {[currentYear, prevYear].map(yr => (
              <button
                key={yr}
                onClick={() => switchYear(yr)}
                className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${
                  yearView === yr
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                }`}
              >
                {yr}
              </button>
            ))}
          </div>

          {loadingOrders ? (
            <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Cargando órdenes...
            </div>
          ) : errOrders ? (
            <div className="text-xs text-red-600">Error: {errOrders}</div>
          ) : orders[yearView] && orders[yearView].length === 0 ? (
            <div className="text-xs text-slate-500 italic">Sin órdenes en {yearView}</div>
          ) : orders[yearView] ? (
            <div className="space-y-0.5">
              <div
                className="grid items-center gap-2 px-2 py-1 text-[10px] uppercase tracking-wider text-slate-400"
                style={{ gridTemplateColumns: "90px minmax(120px,1fr) 70px 90px 70px" }}
              >
                <div>Fecha</div>
                <div>N° Orden</div>
                <div className="text-right">Cant.</div>
                <div className="text-right">Subtotal</div>
                <div className="text-right">Líneas</div>
              </div>
              {orders[yearView].map((o) => (
                <div
                  key={o.order_id}
                  className="grid items-center gap-2 px-2 py-1 text-xs hover:bg-white rounded"
                  style={{ gridTemplateColumns: "90px minmax(120px,1fr) 70px 90px 70px" }}
                >
                  <div className="text-slate-600 tabular-nums">{fmtDate(o.date_order)}</div>
                  <div className="font-medium tabular-nums truncate">{o.order_name || "—"}</div>
                  <div className="text-right text-slate-700 tabular-nums">{fmtNum(o.qty_item)}</div>
                  <div className="text-right text-slate-900 tabular-nums font-medium">{fmtMoneyDec(o.ventas_item)}</div>
                  <div className="text-right text-slate-500 tabular-nums">{o.lines_count}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}

const DEFAULT_MODE = "ytd";
const VALID_MODES = ["ytd", "full_year"];
const LS_KEY = "crm_yoy_mode";

export function VistaYoY({ partnerOdooId }) {
  const thisYear = new Date().getFullYear();

  const [yoyMode, setYoyMode] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_MODE;
    const stored = window.localStorage.getItem(LS_KEY);
    return VALID_MODES.includes(stored) ? stored : DEFAULT_MODE;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LS_KEY, yoyMode);
  }, [yoyMode]);

  // Selectores de años custom (no se persiste — cada cuenta es un análisis distinto)
  const [yearA, setYearA] = useState(thisYear);
  const [yearB, setYearB] = useState(thisYear - 1);

  // Reset de años al cambiar de cuenta (cada cuenta empieza con default)
  useEffect(() => {
    setYearA(thisYear);
    setYearB(thisYear - 1);
  }, [partnerOdooId, thisYear]);

  // Años disponibles (años con ventas reales para esta cuenta)
  const [yearsAvailable, setYearsAvailable] = useState([]);
  useEffect(() => {
    let alive = true;
    api.get(`/cuentas/${partnerOdooId}/ventas/years-available`)
      .then(r => {
        if (!alive) return;
        const ys = r.data?.years || [];
        setYearsAvailable(ys);
      })
      .catch(() => { /* fallback: hardcoded en handlers */ });
    return () => { alive = false; };
  }, [partnerOdooId]);

  // Lista para los Selects: años con data, o fallback a 7 últimos años si endpoint falló.
  // Siempre incluye thisYear y thisYear-1 aunque la cuenta no tenga ventas allí.
  const yearOptions = useMemo(() => {
    const fallback = Array.from({ length: 7 }, (_, i) => thisYear - i);
    const set = new Set([
      ...(yearsAvailable.length ? yearsAvailable : fallback),
      thisYear, thisYear - 1,
    ]);
    return Array.from(set).sort((a, b) => b - a);
  }, [yearsAvailable, thisYear]);

  // Validación: si yearA < yearB, swap automático.
  // (year "actual" debe ser >= year "comparar contra")
  useEffect(() => {
    if (yearA < yearB) {
      setYearA(yearB);
      setYearB(yearA);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearA, yearB]);

  const resetYears = useCallback(() => {
    setYearA(thisYear);
    setYearB(thisYear - 1);
  }, [thisYear]);

  const yearsAtDefault = yearA === thisYear && yearB === thisYear - 1;

  const fetchAll = useCallback(async () => {
    const params = { mode: yoyMode, year_a: yearA, year_b: yearB };
    const [m, mo, items] = await Promise.all([
      api.get(`/cuentas/${partnerOdooId}/ventas/yoy/metrics`,  { params }).catch(() => ({ data: null })),
      api.get(`/cuentas/${partnerOdooId}/ventas/yoy/by-month`, { params }).catch(() => ({ data: { months: [] } })),
      api.get(`/cuentas/${partnerOdooId}/ventas/yoy/by-item`,  { params: { ...params, limit: 50 } }).catch(() => ({ data: { rows: [] } })),
    ]);
    return {
      metrics: m.data,
      months:  mo.data?.months || [],
      items:   items.data?.rows || [],
    };
  }, [partnerOdooId, yoyMode, yearA, yearB]);

  // staleKey incluye los 3 (modo + ambos años) → cualquier cambio refetchea
  const { data, loading, error, reload } = useTabData(fetchAll, {
    enabled: true,
    staleKey: `${yoyMode}-${yearA}-${yearB}`,
  });

  const [sortBy, setSortBy] = useState("var_pct"); // 'var_pct' | 'var_abs' | 'ventas_a'
  const [expandedKey, setExpandedKey] = useState(null);

  // Cierra cualquier drill-down al cambiar modo o años (los datos viejos no aplican)
  useEffect(() => {
    setExpandedKey(null);
  }, [yoyMode, yearA, yearB]);

  const m = data?.metrics;
  // year_a y year_b ahora son enteros; fallback a yearA/yearB del cliente si aún no llegó.
  const currentYear = m?.year_a ?? yearA;
  const prevYear    = m?.year_b ?? yearB;
  const mode = m?.mode ?? yoyMode;
  const cutoffDate = m?.cutoff_date ?? null;

  const items = data?.items || [];
  const sortedItems = useMemo(() => {
    const list = [...items];
    return list.sort((a, b) => {
      const av = Number(a[sortBy] || 0);
      const bv = Number(b[sortBy] || 0);
      // Para var_pct/var_abs: ascending = peores arriba (más negativos)
      // Para ventas_a: descending (más vendido arriba)
      if (sortBy === "ventas_a") return bv - av;
      return av - bv;
    });
  }, [items, sortBy]);

  if (loading && !data) {
    return (
      <div className="space-y-3">
        {/* Toggle skeleton + secciones */}
        <div className="h-7 w-72 bg-slate-100 rounded animate-pulse" />
        <div className="h-32 bg-slate-100 rounded animate-pulse" />
        <div className="h-64 bg-slate-100 rounded animate-pulse" />
        <div className="h-48 bg-slate-100 rounded animate-pulse" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-3">
        <ModeToggle mode={yoyMode} cutoffDate={null} onChange={setYoyMode} />
        <div className="border rounded p-3 flex items-center gap-2 text-sm">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <span className="text-slate-600 flex-1">{error}</span>
          <Button size="sm" variant="outline" onClick={reload}>Reintentar</Button>
        </div>
      </div>
    );
  }

  const noData =
    !m ||
    ((m.year_a_data?.ventas == null || m.year_a_data.ventas === 0) &&
     (m.year_b_data?.ventas == null || m.year_b_data.ventas === 0));

  // Microcopy de período usado por subtítulos
  const periodoLabel = mode === "ytd" && cutoffDate
    ? `YTD al ${fmtCutoffShort(cutoffDate)}`
    : "Año completo";

  return (
    <div className="space-y-4">
      {/* Toggle siempre visible */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <ModeToggle mode={yoyMode} cutoffDate={cutoffDate} onChange={setYoyMode} />
        {loading && data && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Loader2 className="h-3 w-3 animate-spin" /> actualizando…
          </div>
        )}
      </div>

      {/* Selectores de años custom */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] uppercase tracking-wider text-slate-400">Año actual:</span>
        <Select value={String(yearA)} onValueChange={(v) => setYearA(Number(v))}>
          <SelectTrigger className="h-7 w-[88px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {yearOptions.map(y => (
              <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-[11px] uppercase tracking-wider text-slate-400 ml-2">Comparar contra:</span>
        <Select value={String(yearB)} onValueChange={(v) => setYearB(Number(v))}>
          <SelectTrigger className="h-7 w-[88px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {yearOptions.filter(y => y <= yearA).map(y => (
              <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          size="sm" variant="ghost"
          className="h-7 text-xs gap-1 text-slate-500"
          onClick={resetYears}
          disabled={yearsAtDefault}
          title={`Restaurar a ${thisYear} vs ${thisYear - 1}`}
        >
          <RefreshCw className="h-3 w-3" /> Resetear
        </Button>

        <span
          className="inline-flex items-center text-slate-400 hover:text-slate-600 cursor-help ml-1"
          title="Compara las ventas del cliente entre dos años cualesquiera. Útil para ver tendencias multi-año (ej: 2026 vs 2024)."
        >
          <Info className="h-3.5 w-3.5" />
        </span>
      </div>

      {noData ? (
        <div className="px-3 py-8 text-center text-sm text-slate-400 italic border rounded-md">
          No hay datos comparativos para esta cuenta en {periodoLabel.toLowerCase()}
        </div>
      ) : (
        <>
          {/* Sección 1: Tabla de KPIs comparativos */}
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <div className="text-[11px] font-semibold tracking-wider uppercase text-slate-500">
                Comparativo {currentYear} vs {prevYear}
              </div>
              <div className="text-[10px] text-slate-400">{periodoLabel}</div>
            </div>
            <MetricsTable
              year_a_data={m.year_a_data}
              year_b_data={m.year_b_data}
              delta={m.delta}
              currentYear={currentYear}
              prevYear={prevYear}
            />
          </div>

          {/* Sección 2: Gráfico mensual */}
          <MonthlyChart
            months={data.months}
            currentYear={currentYear}
            prevYear={prevYear}
            mode={mode}
          />

          {/* Sección 3: Top productos comparativo */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <div className="text-[11px] font-semibold tracking-wider uppercase text-slate-500">
                Top productos · {currentYear} vs {prevYear}
                <span className="text-slate-400 font-normal ml-1">· {sortedItems.length}</span>
                <span className="text-slate-400 font-normal ml-2 normal-case tracking-normal">
                  ({periodoLabel})
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 mr-1">Ordenar:</span>
                {[
                  { key: "var_pct", label: "Δ%" },
                  { key: "var_abs", label: "Δ S/." },
                  { key: "ventas_a", label: `Ventas ${currentYear}` },
                ].map(s => (
                  <button
                    key={s.key}
                    onClick={() => setSortBy(s.key)}
                    className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                      sortBy === s.key
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {sortedItems.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-slate-400 italic border rounded-md">
                Sin productos comparables
              </div>
            ) : (
              <div className="border rounded-md overflow-hidden">
                <div
                  className="grid items-center gap-2 px-3 py-1.5 border-b bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"
                  style={{ gridTemplateColumns: "20px minmax(160px,1.4fr) 90px 90px 90px 90px 100px 80px" }}
                >
                  <div></div>
                  <div>Producto</div>
                  <div className="text-right">{currentYear}</div>
                  <div className="text-right">{prevYear}</div>
                  <div className="text-right">Δ%</div>
                  <div className="text-right">Δ S/.</div>
                  <div className="text-right">Unid {currentYear}/{prevYear}</div>
                  <div className="text-right">Estado</div>
                </div>
                {sortedItems.map((it, idx) => {
                  const k = `${it.marca}|${it.tipo}|${it.entalle}|${it.tela}|${idx}`;
                  return (
                    <ItemRow
                      key={k}
                      item={it}
                      expanded={expandedKey === k}
                      onToggle={() => setExpandedKey(expandedKey === k ? null : k)}
                      partnerOdooId={partnerOdooId}
                      currentYear={currentYear}
                      prevYear={prevYear}
                      mode={mode}
                      cutoffDate={cutoffDate}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
