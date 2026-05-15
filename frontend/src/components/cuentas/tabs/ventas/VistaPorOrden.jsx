/**
 * VistaPorOrden — lista de órdenes con side drawer al click (Sprint CRM-D4 v3).
 *
 * Cambios v3:
 * - Click en orden abre drawer lateral 560px (en vez de expandir inline).
 * - Subtotal usa price_subtotal_incl (con IGV).
 * - Marca/tipo enriquecidos del catálogo prod_marcas/prod_tipos.
 * - Tabla principal con columnas mejor distribuidas.
 */
import React, { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, AlertCircle, X as XIcon, MapPin, Calendar,
} from "lucide-react";

const fmtMoney = (n) =>
  "S/. " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMoneyShort = (n) =>
  "S/. " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";
const fmtDateLong = (d) =>
  d ? new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" }) : "—";
const fmtNum = (n) => Number(n || 0).toLocaleString("es-PE");

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

// ─────────────────────────────────────────────────────────────
// Side drawer con líneas de la orden
// ─────────────────────────────────────────────────────────────
function OrderDrawer({ order, partnerOdooId, onClose }) {
  const [lines, setLines] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!order) return;
    setLoading(true);
    setError(null);
    api.get(`/cuentas/${partnerOdooId}/ventas/lines`, {
      params: { order_id: order.order_id, limit: 200 },
    })
      .then((r) => {
        const items = Array.isArray(r.data) ? r.data : (r.data?.rows || r.data?.items || []);
        setLines(items);
      })
      .catch((e) => setError(e?.response?.data?.detail || e.message))
      .finally(() => setLoading(false));
  }, [order, partnerOdooId]);

  // ESC para cerrar
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!order) return null;

  const totalQty = (lines || []).reduce((s, l) => s + Number(l.qty || 0), 0);
  const totalSubInc = (lines || []).reduce((s, l) => s + Number(l.subtotal || 0), 0);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[55]"
        style={{ background: "rgba(31,26,20,.40)", backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />
      {/* Drawer */}
      <aside
        className="fixed top-0 right-0 bottom-0 z-[56] bg-white shadow-2xl flex flex-col animate-in slide-in-from-right"
        style={{ width: "min(640px, 95vw)", borderLeft: "1px solid var(--line)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-drawer-title"
        data-testid="order-drawer"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-mono mb-1">
                Detalle de venta
              </div>
              <h3
                id="order-drawer-title"
                className="text-lg font-semibold text-slate-900 leading-tight"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {order.order_name || "Sin código interno"}
              </h3>
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <ComprobanteCell tipo={order.tipo_comp} num={order.num_comp} size="lg" />
                {order.has_override && (
                  <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200">
                    cliente reasignado
                  </Badge>
                )}
              </div>
              <div className="mt-2 text-xs text-slate-500 flex items-center gap-3 flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {fmtDateLong(order.date_order)}
                </span>
                {order.tienda && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {order.tienda}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-500 hover:text-slate-900 shrink-0"
              data-testid="order-drawer-close"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Sub-totales del header */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="border border-slate-200 rounded-md px-3 py-2">
              <div
                className="text-lg font-semibold tabular-nums leading-none"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {order.lines_count}
              </div>
              <div className="text-[9px] mt-1.5 font-mono uppercase tracking-wider text-slate-500">Líneas</div>
            </div>
            <div className="border border-slate-200 rounded-md px-3 py-2">
              <div
                className="text-lg font-semibold tabular-nums leading-none"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {fmtNum(order.qty_total)}
              </div>
              <div className="text-[9px] mt-1.5 font-mono uppercase tracking-wider text-slate-500">Cantidad</div>
            </div>
            <div className="border border-slate-200 rounded-md px-3 py-2">
              <div
                className="text-lg font-semibold tabular-nums leading-none"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {fmtMoneyShort(order.amount_total)}
              </div>
              <div className="text-[9px] mt-1.5 font-mono uppercase tracking-wider text-slate-500">Total</div>
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
              Sin líneas en esta orden
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
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtMoneyShort(l.subtotal)}</td>
                  </tr>
                ))}
                {/* Footer totales */}
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td colSpan={4} className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-slate-500">
                    Total ({lines.length} líneas)
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtNum(totalQty)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold">{fmtMoneyShort(totalSubInc)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        {/* Footer info IGV */}
        <div className="px-5 py-2 border-t border-slate-100 text-[10px] text-slate-400 font-mono uppercase tracking-wider shrink-0 bg-slate-50/50">
          Subtotales con IGV incluido
        </div>
      </aside>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Vista principal — solo tabla de órdenes (drawer al click)
// ─────────────────────────────────────────────────────────────
export function VistaPorOrden({ partnerOdooId, fechaDesde, fechaHasta }) {
  const [rows, setRows]   = useState([]);
  const [page, setPage]   = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [openOrder, setOpenOrder] = useState(null);
  const limit = 50;

  const fetchPage = useCallback(async (p, append = false) => {
    if (append) setLoadingMore(true); else setLoading(true);
    setError(null);
    try {
      const params = { page: p, limit };
      if (fechaDesde) params.fecha_desde = fechaDesde;
      if (fechaHasta) params.fecha_hasta = fechaHasta;
      const r = await api.get(`/cuentas/${partnerOdooId}/ventas/orders`, { params });
      const items = r.data?.rows || [];
      if (append) {
        setRows((prev) => [...prev, ...items]);
      } else {
        setRows(items);
      }
      setHasNext(!!r.data?.has_next);
      setPage(p);
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [partnerOdooId, fechaDesde, fechaHasta]);

  useEffect(() => { fetchPage(1, false); }, [fetchPage]);

  if (loading) {
    return (
      <div className="space-y-1.5">
        {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}
      </div>
    );
  }
  if (error) {
    return (
      <div className="border rounded p-3 flex items-center gap-2 text-sm">
        <AlertCircle className="h-4 w-4 text-red-500" />
        <span className="text-slate-600 flex-1">{error}</span>
        <Button size="sm" variant="outline" onClick={() => fetchPage(1, false)}>Reintentar</Button>
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="px-3 py-8 text-center text-sm text-slate-400 italic border rounded-md">
        No hay órdenes en este rango de fechas
      </div>
    );
  }

  // Distribución de columnas optimizada (sin chevron, sin "Nº orden", con tienda + comprobante grande)
  // Fecha · Comprobante · Tienda · Líneas · Cant · Monto
  const cols = "92px minmax(220px,1fr) 110px 70px 80px 130px";

  return (
    <>
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        {/* Header */}
        <div
          className="grid items-center gap-3 px-4 py-2 border-b border-slate-100 bg-slate-50/60 text-[10px] uppercase tracking-wider text-slate-500 font-mono"
          style={{ gridTemplateColumns: cols }}
        >
          <div>Fecha</div>
          <div>Comprobante</div>
          <div>Tienda</div>
          <div className="text-right">Líneas</div>
          <div className="text-right">Cant.</div>
          <div className="text-right">Monto</div>
        </div>

        {/* Filas */}
        {rows.map((r) => (
          <div
            key={r.order_id}
            onClick={() => setOpenOrder(r)}
            className="grid items-center gap-3 px-4 py-2.5 border-b border-slate-100 last:border-b-0 text-sm cursor-pointer hover:bg-slate-50 transition-colors"
            style={{ gridTemplateColumns: cols }}
            data-testid={`order-row-${r.order_id}`}
          >
            <div className="text-xs text-slate-600 tabular-nums">{fmtDate(r.date_order)}</div>
            <div className="flex items-center gap-1.5 min-w-0">
              <ComprobanteCell tipo={r.tipo_comp} num={r.num_comp} />
              {r.has_override && (
                <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200 shrink-0 ml-1">
                  override
                </Badge>
              )}
            </div>
            <div className="text-xs text-slate-600 truncate font-medium">{r.tienda || "—"}</div>
            <div className="text-right text-xs text-slate-500 tabular-nums">{r.lines_count}</div>
            <div className="text-right text-xs text-slate-700 tabular-nums">{fmtNum(r.qty_total)}</div>
            <div className="text-right text-sm text-slate-900 tabular-nums font-semibold">{fmtMoney(r.amount_total)}</div>
          </div>
        ))}

        {hasNext && (
          <div className="px-3 py-2 border-t border-slate-100 flex justify-center">
            <Button
              size="sm" variant="outline"
              onClick={() => fetchPage(page + 1, true)}
              disabled={loadingMore}
            >
              {loadingMore && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Cargar más
            </Button>
          </div>
        )}
      </div>

      {/* Drawer */}
      {openOrder && (
        <OrderDrawer
          order={openOrder}
          partnerOdooId={partnerOdooId}
          onClose={() => setOpenOrder(null)}
        />
      )}
    </>
  );
}
