/**
 * ReservasTab — pos_order con reserva=true que aún no se concretaron.
 *
 * Lógica canónica: ventas/backend/helpers.py RESERVA_PENDIENTE_WHERE.
 * Endpoint CRM: /cuentas/{id}/reservas/{metrics,orders,lines}
 *
 * UX igual a Créditos: KPIs arriba, tabla con click → drawer lateral con líneas.
 * Health buckets: ok < 30d, warn < 90d, crit > 90d.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle, Filter, Bookmark, Loader2, X as XIcon, Calendar,
  Building2, Store, User as UserIcon, Clock,
} from "lucide-react";
import { useTabData } from "@/hooks/useTabData";

const fmtMoney = (n) =>
  "S/. " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtMoneyDec = (n) =>
  "S/. " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";
const fmtDateLong = (d) =>
  d ? new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" }) : "—";
const fmtNum = (n) => Number(n || 0).toLocaleString("es-PE");

const ESTADO_BADGE = {
  ok:   "bg-emerald-100 text-emerald-700 border-emerald-200",
  warn: "bg-amber-100 text-amber-700 border-amber-200",
  crit: "bg-red-100 text-red-700 border-red-200",
};

const ESTADO_LABEL = {
  ok: "Reciente", warn: "Envejecida", crit: "Antigua",
};

const EMPRESA_BADGE = {
  Ambission:    "bg-indigo-50 text-indigo-700 border-indigo-200",
  ProyectoModa: "bg-rose-50 text-rose-700 border-rose-200",
};

const COMP_LABEL = {
  FE: { label: "Factura", color: "text-blue-700",    bg: "bg-blue-50",    border: "border-blue-200" },
  BE: { label: "Boleta",  color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
  NV: { label: "Nota Venta", color: "text-slate-600", bg: "bg-slate-100", border: "border-slate-200" },
  TK: { label: "Ticket",  color: "text-slate-600",   bg: "bg-slate-100",  border: "border-slate-200" },
};

function ComprobanteCell({ tipo, num, size = "sm" }) {
  if (!num && !tipo) return <span className="text-slate-300">—</span>;
  const cfg = COMP_LABEL[tipo] || { label: tipo || "Doc", color: "text-slate-600", bg: "bg-slate-100", border: "border-slate-200" };
  const tipoSize = size === "lg" ? "text-[10px] px-2 py-0.5" : "text-[9px] px-1.5 py-0.5";
  const numSize = size === "lg" ? "text-sm" : "text-xs";
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className={`${tipoSize} font-bold uppercase tracking-wider rounded border ${cfg.bg} ${cfg.color} ${cfg.border}`} title={cfg.label}>
        {tipo || "—"}
      </span>
      <span className={`${numSize} font-mono text-slate-700 tabular-nums truncate`}>{num || "—"}</span>
    </div>
  );
}

const FILTERS = [
  { key: "ALL",  label: "Todas" },
  { key: "ok",   label: "Recientes (<30d)" },
  { key: "warn", label: "Envejecidas (30-90d)" },
  { key: "crit", label: "Antiguas (>90d)" },
];

const Kpi = ({ label, value, accent = "text-slate-900" }) => (
  <div className="flex flex-col px-3 py-2 border rounded-md bg-white min-w-[150px]">
    <span className={`text-base font-semibold leading-none tabular-nums ${accent}`}>{value}</span>
    <span className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">{label}</span>
  </div>
);

const Skeleton = () => (
  <div className="space-y-1.5">
    <div className="flex gap-2 mb-3">
      {[0,1,2,3].map(i => <div key={i} className="h-14 w-40 bg-slate-100 rounded animate-pulse" />)}
    </div>
    {[0,1,2,3,4].map(i => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}
  </div>
);

// ─────────────────────────────────────────────────────────────
// Drawer lateral con líneas de la reserva
// ─────────────────────────────────────────────────────────────
function ReservaDrawer({ orden, partnerOdooId, onClose }) {
  const [lines, setLines] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!orden) return;
    setLoading(true);
    setError(null);
    api.get(`/cuentas/${partnerOdooId}/reservas/lines`, {
      params: { order_id: orden.order_id, limit: 200 },
    })
      .then((r) => {
        const items = Array.isArray(r.data) ? r.data : (r.data?.rows || r.data?.items || []);
        setLines(items);
      })
      .catch((e) => setError(e?.response?.data?.detail || e.message))
      .finally(() => setLoading(false));
  }, [orden, partnerOdooId]);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!orden) return null;

  const totalQty = (lines || []).reduce((s, l) => s + Number(l.qty || 0), 0);
  const totalSub = (lines || []).reduce((s, l) => s + Number(l.subtotal || 0), 0);
  const empresaCls = EMPRESA_BADGE[orden.empresa] || "bg-slate-50 text-slate-700 border-slate-200";
  const estadoCls = ESTADO_BADGE[orden.estado_reserva] || "";

  return (
    <>
      <div
        className="fixed inset-0 z-[55]"
        style={{ background: "rgba(31,26,20,.40)", backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />
      <aside
        className="fixed top-0 right-0 bottom-0 z-[56] bg-white shadow-2xl flex flex-col animate-in slide-in-from-right"
        style={{ width: "min(640px, 95vw)", borderLeft: "1px solid var(--line)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reserva-drawer-title"
        data-testid="reserva-drawer"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-mono mb-1 flex items-center gap-1.5">
                <Bookmark className="h-3 w-3" /> Reserva pendiente
              </div>
              <h3
                id="reserva-drawer-title"
                className="text-lg font-semibold text-slate-900 leading-tight"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {orden.order_name || "Sin código"}
              </h3>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <ComprobanteCell tipo={orden.tipo_comp} num={orden.num_comp} size="lg" />
                <Badge variant="outline" className={`text-[10px] font-semibold ${estadoCls}`}>
                  {ESTADO_LABEL[orden.estado_reserva]} · {orden.dias_reserva}d
                </Badge>
                {orden.empresa && (
                  <Badge variant="outline" className={`text-[10px] font-semibold ${empresaCls}`}>
                    <Building2 className="h-2.5 w-2.5 mr-1" /> {orden.empresa}
                  </Badge>
                )}
              </div>
              <div className="mt-2 text-xs text-slate-500 flex items-center gap-3 flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {fmtDateLong(orden.date_order)}
                </span>
                {orden.tienda && (
                  <span className="inline-flex items-center gap-1">
                    <Store className="h-3 w-3" />
                    {orden.tienda}
                  </span>
                )}
                {orden.vendedor && (
                  <span className="inline-flex items-center gap-1">
                    <UserIcon className="h-3 w-3" />
                    {orden.vendedor}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-500 hover:text-slate-900 shrink-0"
              data-testid="reserva-drawer-close"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="border border-slate-200 rounded-md px-3 py-2">
              <div
                className="text-lg font-semibold tabular-nums leading-none"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {orden.lines_count}
              </div>
              <div className="text-[9px] mt-1.5 font-mono uppercase tracking-wider text-slate-500">Líneas</div>
            </div>
            <div className="border border-slate-200 rounded-md px-3 py-2">
              <div
                className="text-lg font-semibold tabular-nums leading-none"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {fmtNum(orden.qty_total)}
              </div>
              <div className="text-[9px] mt-1.5 font-mono uppercase tracking-wider text-slate-500">Cantidad</div>
            </div>
            <div className="border border-slate-200 rounded-md px-3 py-2">
              <div
                className="text-lg font-semibold tabular-nums leading-none"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {fmtMoney(orden.amount_total)}
              </div>
              <div className="text-[9px] mt-1.5 font-mono uppercase tracking-wider text-slate-500">Reservado</div>
            </div>
          </div>
        </div>

        {/* Body: tabla líneas */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Cargando líneas…
            </div>
          ) : error ? (
            <div className="m-4 border rounded p-3 flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <span className="text-slate-600">{error}</span>
            </div>
          ) : !lines || lines.length === 0 ? (
            <div className="px-4 py-12 text-sm text-slate-400 italic text-center">
              Sin líneas en esta reserva
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-slate-50 z-10">
                <tr className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                  <th className="text-left px-3 py-2 font-medium">Modelo</th>
                  <th className="text-left px-3 py-2 font-medium">Marca / Tipo</th>
                  <th className="text-left px-3 py-2 font-medium">Talla</th>
                  <th className="text-left px-3 py-2 font-medium">Color</th>
                  <th className="text-right px-3 py-2 font-medium">Cant.</th>
                  <th className="text-right px-3 py-2 font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.line_id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-3 py-2 font-medium text-slate-900 truncate max-w-[140px]">
                      {l.modelo_display || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-slate-700 truncate max-w-[170px]">{l.marca || "—"}</div>
                      <div className="text-[10px] text-slate-500 truncate max-w-[170px]">{l.tipo || "—"}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-600 tabular-nums">{l.talla || "—"}</td>
                    <td className="px-3 py-2 text-slate-600 truncate max-w-[110px]">{l.color || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(l.qty)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtMoneyDec(l.subtotal)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td colSpan={4} className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-slate-500">
                    Total ({lines.length} líneas)
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtNum(totalQty)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold">{fmtMoneyDec(totalSub)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-2 border-t border-slate-100 text-[10px] text-slate-400 font-mono uppercase tracking-wider shrink-0 bg-slate-50/50">
          Subtotales con IGV incluido
        </div>
      </aside>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Pestaña Reservas
// ─────────────────────────────────────────────────────────────
export function ReservasTab({ partnerOdooId, active, staleKey }) {
  const fetchAll = useCallback(async () => {
    const [m, ord] = await Promise.all([
      api.get(`/cuentas/${partnerOdooId}/reservas/metrics`).catch(() => ({ data: null })),
      api.get(`/cuentas/${partnerOdooId}/reservas/orders?limit=200`),
    ]);
    const rows = Array.isArray(ord.data) ? ord.data : (ord.data?.rows || ord.data?.items || []);
    return { metrics: m.data, rows };
  }, [partnerOdooId]);

  const { data, loading, error, reload } = useTabData(fetchAll, { enabled: active, staleKey });

  const [filter, setFilter] = useState("ALL");
  const [selected, setSelected] = useState(null);

  const metrics = data?.metrics || {};
  const allRows = data?.rows || [];

  const filtered = useMemo(() => {
    if (filter === "ALL") return allRows;
    return allRows.filter((r) => r.estado_reserva === filter);
  }, [allRows, filter]);

  if (loading && !data) return <Skeleton />;
  if (error) {
    return (
      <div className="border rounded p-3 flex items-center gap-2 text-sm">
        <AlertCircle className="h-4 w-4 text-red-500" />
        <span className="text-slate-600 flex-1">{error}</span>
        <Button size="sm" variant="outline" onClick={reload}>Reintentar</Button>
      </div>
    );
  }

  if (!loading && allRows.length === 0) {
    return (
      <div className="border rounded-md px-3 py-12 text-center">
        <Bookmark className="h-8 w-8 text-slate-300 mx-auto mb-2" />
        <div className="text-sm text-slate-500">Esta cuenta no tiene reservas pendientes</div>
        <div className="text-[11px] text-slate-400 mt-1">
          Las reservas son órdenes POS marcadas como "reserva" que aún no se concretaron.
        </div>
      </div>
    );
  }

  const filterCount = (key) => key === "ALL" ? allRows.length : allRows.filter(r => r.estado_reserva === key).length;

  // Grid: Orden | Comprobante | Empresa | Tienda | Fecha | Días | Líneas | Cant | Monto
  const gridCols = "minmax(120px,1fr) 130px 100px 90px 80px 70px 60px 60px 110px";

  return (
    <div className="space-y-3">
      {/* KPIs */}
      <div className="flex flex-wrap gap-2">
        <Kpi
          label="Reservas pendientes"
          value={metrics.reservas_count ?? 0}
          accent={(metrics.reservas_count ?? 0) > 0 ? "text-amber-700" : "text-slate-900"}
        />
        <Kpi
          label="Monto total"
          value={fmtMoney(metrics.monto_total)}
          accent="text-slate-900"
        />
        {metrics.qty_total != null && (
          <Kpi label="Unidades" value={fmtNum(metrics.qty_total)} />
        )}
        {metrics.dias_promedio != null && (
          <Kpi
            label="Días promedio"
            value={`${metrics.dias_promedio}d`}
            accent={
              metrics.dias_promedio < 30 ? "text-emerald-700"
              : metrics.dias_promedio < 90 ? "text-amber-700"
              : "text-red-600"
            }
          />
        )}
        {metrics.mas_antigua_dias != null && (
          <Kpi
            label="Más antigua"
            value={`${metrics.mas_antigua_dias}d`}
            accent={metrics.mas_antigua_dias > 90 ? "text-red-600" : "text-slate-700"}
          />
        )}
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-1 flex-wrap">
        <Filter className="h-3 w-3 text-slate-400 mr-1" />
        {FILTERS.map(f => {
          const c = filterCount(f.key);
          const isActive = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-2 py-0.5 rounded-full text-[11px] border transition-colors ${
                isActive
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              }`}
            >
              {f.label} {c > 0 && <span className={isActive ? "text-slate-300" : "text-slate-400"}>· {c}</span>}
            </button>
          );
        })}
      </div>

      {/* Tabla */}
      {filtered.length === 0 ? (
        <div className="px-3 py-8 text-center text-sm text-slate-400 italic border rounded-md">
          Sin reservas con filtro "{FILTERS.find(f => f.key === filter)?.label}".
        </div>
      ) : (
        <div className="border rounded-md overflow-hidden">
          {/* Header */}
          <div
            className="grid items-center gap-2 px-3 py-1.5 border-b bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"
            style={{ gridTemplateColumns: gridCols }}
          >
            <div>Orden</div>
            <div>Comprobante</div>
            <div>Empresa</div>
            <div>Tienda</div>
            <div className="text-right">Fecha</div>
            <div className="text-right">Días</div>
            <div className="text-right">Líneas</div>
            <div className="text-right">Cant.</div>
            <div className="text-right">Monto</div>
          </div>

          {filtered.map((r) => {
            const empresaCls = EMPRESA_BADGE[r.empresa] || "bg-slate-50 text-slate-700 border-slate-200";
            const estadoCls = ESTADO_BADGE[r.estado_reserva] || "";
            return (
              <div
                key={r.order_id}
                onClick={() => setSelected(r)}
                className="group grid items-center gap-2 px-3 py-2 border-b last:border-0 text-sm hover:bg-slate-50 transition-colors cursor-pointer"
                style={{ gridTemplateColumns: gridCols }}
                data-testid={`reserva-row-${r.order_id}`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Bookmark className="h-3 w-3 text-slate-400 shrink-0" />
                  <span className="truncate font-medium tabular-nums text-xs">
                    {r.order_name || `#${r.order_id}`}
                  </span>
                </div>
                <div className="min-w-0">
                  <ComprobanteCell tipo={r.tipo_comp} num={r.num_comp} />
                </div>
                <div className="min-w-0">
                  {r.empresa ? (
                    <Badge variant="outline" className={`text-[9px] font-semibold truncate ${empresaCls}`}>
                      {r.empresa}
                    </Badge>
                  ) : <span className="text-slate-300 text-xs">—</span>}
                </div>
                <div className="text-xs text-slate-600 truncate">
                  {r.tienda || <span className="text-slate-300">—</span>}
                </div>
                <div className="text-right text-xs text-slate-600 tabular-nums">{fmtDate(r.date_order)}</div>
                <div className="text-right">
                  <Badge variant="outline" className={`text-[9px] font-semibold tabular-nums ${estadoCls}`}>
                    {r.dias_reserva}d
                  </Badge>
                </div>
                <div className="text-right text-xs text-slate-600 tabular-nums">{r.lines_count}</div>
                <div className="text-right text-xs text-slate-600 tabular-nums">{fmtNum(r.qty_total)}</div>
                <div className="text-right text-sm font-semibold tabular-nums">{fmtMoneyDec(r.amount_total)}</div>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <ReservaDrawer
          orden={selected}
          partnerOdooId={partnerOdooId}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
