import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle, Filter, FileText, Loader2, X as XIcon, Calendar, Building2,
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

const STATE_BADGE = {
  open:   "bg-amber-100 text-amber-700 border-amber-200",
  paid:   "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancel: "bg-slate-100 text-slate-500 border-slate-200",
  draft:  "bg-blue-100 text-blue-700 border-blue-200",
};

const STATE_LABEL = {
  open: "Pendiente", paid: "Pagada", cancel: "Cancelada", draft: "Borrador",
};

const EMPRESA_BADGE = {
  Ambission:    "bg-indigo-50 text-indigo-700 border-indigo-200",
  ProyectoModa: "bg-rose-50 text-rose-700 border-rose-200",
};

const FILTERS = [
  { key: "open",     label: "Pendientes" },
  { key: "paid",     label: "Pagadas" },
  { key: "ALL",      label: "Todas" },
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
      {[0,1,2].map(i => <div key={i} className="h-14 w-40 bg-slate-100 rounded animate-pulse" />)}
    </div>
    {[0,1,2,3,4].map(i => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}
  </div>
);

// ─────────────────────────────────────────────────────────────
// Side drawer con detalle de la factura crédito + sus líneas
// ─────────────────────────────────────────────────────────────
function CreditoDrawer({ factura, partnerOdooId, onClose }) {
  const [lines, setLines] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!factura) return;
    setLoading(true);
    setError(null);
    api.get(`/cuentas/${partnerOdooId}/creditos/lines`, {
      params: { invoice_id: factura.invoice_id, limit: 200 },
    })
      .then((r) => {
        const items = Array.isArray(r.data) ? r.data : (r.data?.rows || r.data?.items || []);
        setLines(items);
      })
      .catch((e) => setError(e?.response?.data?.detail || e.message))
      .finally(() => setLoading(false));
  }, [factura, partnerOdooId]);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!factura) return null;

  const pagado = (factura.amount_total || 0) - (factura.amount_residual || 0);
  const diasVencido = factura.date_invoice
    ? Math.floor((Date.now() - new Date(factura.date_invoice).getTime()) / 86400000)
    : 0;
  const isVencida = factura.state === "open" && diasVencido > 0;

  const totalQty = (lines || []).reduce((s, l) => s + Number(l.qty || 0), 0);
  const totalSub = (lines || []).reduce(
    (s, l) => s + Number(l.price_subtotal_incl ?? (Number(l.price_subtotal || 0) * 1.18)),
    0
  );
  const empresaCls = EMPRESA_BADGE[factura.empresa] || "bg-slate-50 text-slate-700 border-slate-200";

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
        aria-labelledby="credito-drawer-title"
        data-testid="credito-drawer"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-mono mb-1 flex items-center gap-1.5">
                <FileText className="h-3 w-3" /> Factura crédito
              </div>
              <h3
                id="credito-drawer-title"
                className="text-lg font-semibold text-slate-900 leading-tight tabular-nums"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {factura.invoice_number || "—"}
              </h3>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={`text-[10px] font-semibold ${STATE_BADGE[factura.state] || ""}`}>
                  {STATE_LABEL[factura.state] || factura.state}
                </Badge>
                {factura.empresa && (
                  <Badge variant="outline" className={`text-[10px] font-semibold ${empresaCls}`}>
                    <Building2 className="h-2.5 w-2.5 mr-1" /> {factura.empresa}
                  </Badge>
                )}
                {isVencida && (
                  <Badge variant="outline" className="text-[10px] font-semibold bg-red-50 text-red-700 border-red-200">
                    {diasVencido}d vencida
                  </Badge>
                )}
              </div>
              <div className="mt-2 text-xs text-slate-500 flex items-center gap-3 flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {fmtDateLong(factura.date_invoice)}
                </span>
                {factura.partner_name && (
                  <span className="text-slate-600 truncate max-w-[260px]">
                    {factura.partner_name}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-500 hover:text-slate-900 shrink-0"
              data-testid="credito-drawer-close"
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
                {fmtMoney(factura.amount_total)}
              </div>
              <div className="text-[9px] mt-1.5 font-mono uppercase tracking-wider text-slate-500">Monto</div>
            </div>
            <div className="border border-slate-200 rounded-md px-3 py-2">
              <div
                className="text-lg font-semibold tabular-nums leading-none text-emerald-700"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {fmtMoney(pagado)}
              </div>
              <div className="text-[9px] mt-1.5 font-mono uppercase tracking-wider text-slate-500">Pagado</div>
            </div>
            <div className="border border-slate-200 rounded-md px-3 py-2">
              <div
                className={`text-lg font-semibold tabular-nums leading-none ${
                  (factura.amount_residual || 0) > 0 ? "text-red-600" : "text-slate-900"
                }`}
                style={{ fontFamily: "var(--font-display)" }}
              >
                {fmtMoney(factura.amount_residual)}
              </div>
              <div className="text-[9px] mt-1.5 font-mono uppercase tracking-wider text-slate-500">Saldo</div>
            </div>
          </div>
        </div>

        {/* Body: tabla de líneas */}
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
              Sin líneas en esta factura
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
                      {l.modelo_display || l.line_description || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-slate-700 truncate max-w-[170px]">{l.marca || "—"}</div>
                      <div className="text-[10px] text-slate-500 truncate max-w-[170px]">{l.tipo || "—"}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-600 tabular-nums">{l.talla || "—"}</td>
                    <td className="px-3 py-2 text-slate-600 truncate max-w-[110px]">{l.color || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(l.qty)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {fmtMoneyDec(l.price_subtotal_incl ?? (Number(l.price_subtotal || 0) * 1.18))}
                    </td>
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
// Pestaña Créditos
// ─────────────────────────────────────────────────────────────
export function CreditosTab({ partnerOdooId, active, staleKey }) {
  const fetchAll = useCallback(async () => {
    const [m, inv] = await Promise.all([
      api.get(`/cuentas/${partnerOdooId}/creditos/metrics`).catch(() => ({ data: null })),
      api.get(`/cuentas/${partnerOdooId}/creditos/invoices?limit=200`),
    ]);
    const rows = Array.isArray(inv.data) ? inv.data : (inv.data?.rows || inv.data?.items || []);
    return { metrics: m.data, rows };
  }, [partnerOdooId]);

  const { data, loading, error, reload } = useTabData(fetchAll, { enabled: active, staleKey });

  // Por defecto: solo pendientes (estado open)
  const [filter, setFilter] = useState("open");
  const [selected, setSelected] = useState(null);

  const metrics = data?.metrics || {};
  const allRows = data?.rows || [];

  const diasPromedio = "—";

  const sorted = useMemo(() => {
    const list = [...allRows];
    return list.sort((a, b) => {
      const aOpen = a.state === "open" ? 0 : 1;
      const bOpen = b.state === "open" ? 0 : 1;
      if (aOpen !== bOpen) return aOpen - bOpen;
      return new Date(a.date_invoice || 0) - new Date(b.date_invoice || 0);
    });
  }, [allRows]);

  const filtered = useMemo(() => {
    if (filter === "ALL") return sorted;
    return sorted.filter(r => r.state === filter);
  }, [sorted, filter]);

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

  const filterCount = (key) => key === "ALL" ? sorted.length : sorted.filter(r => r.state === key).length;

  const saldoPendiente = metrics.saldo_total ?? 0;
  const totalFacturado = metrics.total_facturado ?? 0;

  // Grid: Número | Empresa | Estado | Fecha | Monto | Pagado | Saldo | Vencida
  const gridCols = "minmax(140px,1fr) 110px 70px 90px 110px 110px 110px 70px";

  return (
    <div className="space-y-3">
      {/* KPIs */}
      <div className="flex flex-wrap gap-2">
        <Kpi
          label="Saldo pendiente"
          value={fmtMoney(saldoPendiente)}
          accent={saldoPendiente > 0 ? "text-red-600" : "text-emerald-600"}
        />
        <Kpi label="Total facturado" value={fmtMoney(totalFacturado)} />
        <Kpi label="Días promedio pago" value={diasPromedio} />
        {metrics.invoices_count != null && (
          <Kpi label="N° facturas" value={metrics.invoices_count} />
        )}
      </div>

      {/* Filtros */}
      {sorted.length > 0 && (
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
      )}

      {/* Tabla */}
      {filtered.length === 0 ? (
        <div className="px-3 py-8 text-center text-sm text-slate-400 italic border rounded-md">
          {sorted.length === 0
            ? "Este cliente no tiene facturas a crédito"
            : `Sin facturas con filtro "${FILTERS.find(f => f.key === filter)?.label}".`}
        </div>
      ) : (
        <div className="border rounded-md overflow-hidden">
          {/* Header */}
          <div
            className="grid items-center gap-2 px-3 py-1.5 border-b bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"
            style={{ gridTemplateColumns: gridCols }}
          >
            <div>Número</div>
            <div>Empresa</div>
            <div className="text-center">Estado</div>
            <div className="text-right">Fecha</div>
            <div className="text-right">Monto</div>
            <div className="text-right">Pagado</div>
            <div className="text-right">Saldo</div>
            <div className="text-right">Vencida</div>
          </div>

          {filtered.map((r) => {
            const pagado = (r.amount_total || 0) - (r.amount_residual || 0);
            const diasVencido = r.date_invoice
              ? Math.floor((Date.now() - new Date(r.date_invoice).getTime()) / 86400000)
              : 0;
            const isVencida = r.state === "open" && diasVencido > 0;
            const empresaCls = EMPRESA_BADGE[r.empresa] || "bg-slate-50 text-slate-700 border-slate-200";
            return (
              <div
                key={r.invoice_id || r.invoice_number}
                onClick={() => setSelected(r)}
                className="group grid items-center gap-2 px-3 py-2 border-b last:border-0 text-sm hover:bg-slate-50 transition-colors cursor-pointer"
                style={{ gridTemplateColumns: gridCols }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <FileText className="h-3 w-3 text-slate-400 shrink-0" />
                  <span className="truncate font-medium tabular-nums">{r.invoice_number || "—"}</span>
                </div>
                <div className="min-w-0">
                  {r.empresa ? (
                    <Badge variant="outline" className={`text-[9px] font-semibold truncate ${empresaCls}`}>
                      {r.empresa}
                    </Badge>
                  ) : (
                    <span className="text-slate-300 text-xs">—</span>
                  )}
                </div>
                <div className="text-center">
                  <Badge variant="outline" className={`text-[9px] font-semibold ${STATE_BADGE[r.state] || ""}`}>
                    {r.state}
                  </Badge>
                </div>
                <div className="text-right text-xs text-slate-600 tabular-nums">{fmtDate(r.date_invoice)}</div>
                <div className="text-right text-xs text-slate-700 tabular-nums">{fmtMoneyDec(r.amount_total)}</div>
                <div className="text-right text-xs text-emerald-700 tabular-nums">{fmtMoneyDec(pagado)}</div>
                <div className={`text-right text-xs tabular-nums font-medium ${
                  (r.amount_residual || 0) > 0 ? "text-red-600" : "text-slate-400"
                }`}>
                  {fmtMoneyDec(r.amount_residual)}
                </div>
                <div className={`text-right text-xs tabular-nums ${
                  isVencida ? "text-red-600 font-medium" : "text-slate-400"
                }`}>
                  {isVencida ? `${diasVencido}d` : "—"}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <CreditoDrawer
          factura={selected}
          partnerOdooId={partnerOdooId}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
