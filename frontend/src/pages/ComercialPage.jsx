import React, { useState, useEffect, useCallback, useRef } from "react";
import api from "@/lib/api";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { OrderLinesDrawer } from "@/components/DetailDrawers";
import { CustomerOverrideModal } from "@/components/cuentas/CustomerOverrideModal";
import {
  Loader2, Calendar, Hash, Users, ShoppingBag,
  ChevronLeft, ChevronRight, Download, List, ArrowRightLeft
} from "lucide-react";

function fmtNum(n) { return Number(n || 0).toLocaleString("es-PE"); }
function fmtMoney(n) { return "S/ " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(d) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function KpiCard({ icon: Icon, label, value, color }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${color} bg-white shadow-sm`} data-testid={`kpi-${label.toLowerCase().replace(/\s/g, '-')}`}>
      <div className="p-2 rounded-md bg-slate-100"><Icon size={16} className="text-slate-600" /></div>
      <div>
        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">{label}</p>
        <p className="text-lg font-bold text-slate-900 leading-tight">{value}</p>
      </div>
    </div>
  );
}

function downloadCSV(rows, filename) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const lines = [cols.join(","), ...rows.map(r => cols.map(c => {
    const v = r[c]; return typeof v === "string" && v.includes(",") ? `"${v}"` : (v ?? "");
  }).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

export default function ComercialPage() {
  const now = new Date();
  const [docTipo, setDocTipo] = useState("SALE");
  const [fechaDesde, setFechaDesde] = useState(new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()).toISOString().slice(0, 10));
  const [fechaHasta, setFechaHasta] = useState(now.toISOString().slice(0, 10));
  const [excludeVarios, setExcludeVarios] = useState(false);
  const [cliente, setCliente] = useState("");
  const [detailMode, setDetailMode] = useState(false);

  const [data, setData] = useState({ metrics: {}, rows: [], has_next: false });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const debounceRef = useRef(null);
  const LIMIT = 50;

  const fetchData = useCallback(async (pg) => {
    setLoading(true);
    try {
      const params = { doc_tipo: docTipo, page: pg, limit: LIMIT };
      if (fechaDesde) params.fecha_desde = fechaDesde;
      if (fechaHasta) params.fecha_hasta = fechaHasta;
      if (excludeVarios) params.exclude_varios = true;
      if (cliente) params.cliente = cliente;
      const endpoint = detailMode ? "/comercial/lines" : "/comercial/orders";
      const r = await api.get(endpoint, { params });
      setData(r.data || { metrics: {}, rows: [], has_next: false });
      setPage(pg);
    } catch { toast.error("Error cargando datos"); }
    finally { setLoading(false); }
  }, [docTipo, fechaDesde, fechaHasta, excludeVarios, cliente, detailMode]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchData(1), 400);
    return () => clearTimeout(debounceRef.current);
  }, [docTipo, fechaDesde, fechaHasta, excludeVarios, cliente, detailMode]); // eslint-disable-line

  const metrics = data.metrics || {};
  const rows = data.rows || [];

  return (
    <div data-testid="comercial-page" className="h-screen flex flex-col bg-slate-100 overflow-hidden">
      {/* Filter bar */}
      <div className="bg-slate-900 px-3 py-2 flex items-center gap-2 flex-wrap shrink-0" data-testid="comercial-filter-bar">
        <span className={`text-[11px] font-bold uppercase tracking-wider ${docTipo === "SALE" ? "text-emerald-400" : "text-amber-400"}`}>
          {docTipo === "SALE" ? "VENTAS" : "RESERVAS"}
        </span>
        <div className="w-px h-5 bg-slate-700" />

        <div className="flex items-center gap-1">
          <Calendar size={10} className="text-slate-400" />
          <input type="date" className="h-6 text-[10px] rounded px-1.5 bg-slate-700 text-white border-0 outline-none"
            value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} data-testid="filter-fecha-desde" />
          <span className="text-[9px] text-slate-500">a</span>
          <input type="date" className="h-6 text-[10px] rounded px-1.5 bg-slate-700 text-white border-0 outline-none"
            value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} data-testid="filter-fecha-hasta" />
        </div>
        <div className="w-px h-5 bg-slate-700" />

        <div className="relative">
          <Users className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400" size={10} />
          <input className={`h-6 w-[120px] text-[10px] rounded pl-5 pr-1 border-0 outline-none placeholder:text-slate-500 ${cliente ? "bg-amber-500 text-black font-semibold" : "bg-slate-700 text-white"}`}
            placeholder="Cliente..." value={cliente} onChange={e => setCliente(e.target.value)} data-testid="filter-cliente" />
        </div>

        <label className="flex items-center gap-1.5 text-[10px] text-slate-400 cursor-pointer" data-testid="toggle-excl-varios">
          <Switch checked={excludeVarios} onCheckedChange={setExcludeVarios} className="h-4 w-7 data-[state=checked]:bg-amber-500" />
          <span>Excluir Varios</span>
        </label>

        <div className="w-px h-5 bg-slate-700" />

        <label className="flex items-center gap-1.5 text-[10px] cursor-pointer" data-testid="toggle-detail-mode">
          <Switch checked={detailMode} onCheckedChange={setDetailMode} className="h-4 w-7 data-[state=checked]:bg-cyan-500" />
          <span className={detailMode ? "text-cyan-400 font-semibold" : "text-slate-400"}>
            <List size={10} className="inline mr-0.5 -mt-px" />Modo detalle
          </span>
        </label>

        <div className="ml-auto flex items-center gap-3 text-[10px]">
          <span className="text-slate-400">Pag <b className="text-white">{page}</b></span>
        </div>
      </div>

      {/* Doc tipo tabs */}
      <div className="px-3 pt-2 flex gap-1 shrink-0">
        {[["SALE", "Ventas"], ["RESERVA", "Reservas"]].map(([v, label]) => (
          <button key={v} onClick={() => setDocTipo(v)} data-testid={`tab-${v.toLowerCase()}`}
            className={`px-3 py-1.5 rounded-t text-[11px] font-medium transition-colors ${docTipo === v ? "bg-white text-slate-900 border border-b-0 border-slate-200 shadow-sm" : "bg-slate-200/50 text-slate-500 hover:bg-slate-200"}`}>
            {label}
          </button>
        ))}
        {detailMode && <span className="ml-2 self-end text-[9px] text-cyan-600 font-semibold bg-cyan-50 px-2 py-1 rounded-t border border-b-0 border-cyan-200">LINEAS</span>}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-3 p-3 shrink-0" data-testid="comercial-kpis">
            <KpiCard icon={ShoppingBag} label="Ordenes" value={fmtNum(metrics.orders_count)} color="border-slate-200" />
            <KpiCard icon={Hash} label="Unidades" value={fmtNum(metrics.qty_total)} color="border-slate-200" />
            <KpiCard icon={Users} label="Clientes" value={fmtNum(metrics.clientes_count)} color="border-slate-200" />
          </div>

          {/* Table */}
          <div className="flex-1 flex flex-col min-h-0 px-3 pb-3">
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="px-3 py-1.5 bg-slate-800 text-white text-[10px] font-bold flex items-center justify-between shrink-0">
                <span>{detailMode ? "Lineas de producto" : "Ordenes"} ({docTipo === "SALE" ? "Ventas" : "Reservas"})</span>
                {rows.length > 0 && (
                  <button className="flex items-center gap-0.5 text-slate-300 hover:text-white px-1"
                    onClick={() => downloadCSV(rows, `${detailMode ? "lineas" : "ordenes"}_${docTipo.toLowerCase()}.csv`)} data-testid="export-csv-btn">
                    <Download size={10} /> CSV
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-auto min-h-0">
                {detailMode ? (
                  <LinesTable rows={rows} />
                ) : (
                  <HeadersTable rows={rows} onSelect={setSelectedOrder} />
                )}
              </div>
              {(page > 1 || data.has_next) && (
                <div className="flex items-center justify-between px-3 py-1.5 border-t text-[10px] text-slate-500 shrink-0">
                  <span>Pagina {page}</span>
                  <div className="flex gap-1">
                    <button className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40" disabled={page <= 1} onClick={() => fetchData(page - 1)} data-testid="prev-page">
                      <ChevronLeft size={12} />
                    </button>
                    <button className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40" disabled={!data.has_next} onClick={() => fetchData(page + 1)} data-testid="next-page">
                      <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Order detail drawer (only in header mode) */}
      {!detailMode && selectedOrder && <OrderLinesDrawer order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
    </div>
  );
}

function HeadersTable({ rows, onSelect }) {
  return (
    <table className="w-full text-[10px] border-collapse" data-testid="orders-table">
      <thead className="sticky top-0 bg-slate-100 z-10">
        <tr>
          <th className="text-left px-2 py-1.5 font-semibold">Fecha</th>
          <th className="text-left px-2 py-1.5 font-semibold">Orden</th>
          <th className="text-left px-2 py-1.5 font-semibold">Estado</th>
          <th className="text-left px-2 py-1.5 font-semibold">Cliente</th>
          <th className="text-right px-2 py-1.5 font-semibold">Total</th>
          <th className="text-right px-2 py-1.5 font-semibold">Uds</th>
          <th className="text-right px-2 py-1.5 font-semibold">Lineas</th>
        </tr>
      </thead>
      <tbody>
        {!rows.length ? (
          <tr><td colSpan={7} className="text-center py-8 text-slate-400">Sin datos</td></tr>
        ) : rows.map((r, i) => (
          <tr key={`${r.order_id}-${i}`} className={`cursor-pointer ${i % 2 ? "bg-slate-50/50" : ""} hover:bg-blue-50 transition-colors`}
            onClick={() => onSelect(r)} data-testid={`order-row-${r.order_id}`}>
            <td className="px-2 py-1 whitespace-nowrap">{fmtDate(r.date_order)}</td>
            <td className="px-2 py-1 font-mono text-slate-600 text-[9px]">{r.order_name || r.order_id}</td>
            <td className="px-2 py-1">
              <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium ${r.state === "paid" ? "bg-emerald-100 text-emerald-700" : r.state === "done" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                {r.state}
              </span>
            </td>
            <td className="px-2 py-1 font-medium truncate max-w-[200px]">{r.owner_partner_name || "-"}</td>
            <td className="px-2 py-1 text-right font-mono">{fmtMoney(r.amount_total)}</td>
            <td className="px-2 py-1 text-right font-mono font-semibold">{fmtNum(r.qty_total)}</td>
            <td className="px-2 py-1 text-right text-slate-500">{r.lines_count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LinesTable({ rows }) {
  return (
    <table className="w-full text-[10px] border-collapse" data-testid="lines-table">
      <thead className="sticky top-0 bg-cyan-50 z-10">
        <tr>
          <th className="text-left px-2 py-1.5 font-semibold">Fecha</th>
          <th className="text-left px-2 py-1.5 font-semibold">Orden</th>
          <th className="text-left px-2 py-1.5 font-semibold">Cliente</th>
          <th className="text-left px-2 py-1.5 font-semibold">Modelo</th>
          <th className="text-left px-2 py-1.5 font-semibold">Marca</th>
          <th className="text-left px-2 py-1.5 font-semibold">Talla</th>
          <th className="text-left px-2 py-1.5 font-semibold">Color</th>
          <th className="text-right px-2 py-1.5 font-semibold">Qty</th>
          <th className="text-right px-2 py-1.5 font-semibold">P.Unit</th>
          <th className="text-right px-2 py-1.5 font-semibold">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        {!rows.length ? (
          <tr><td colSpan={10} className="text-center py-8 text-slate-400">Sin lineas</td></tr>
        ) : rows.map((r, i) => (
          <tr key={`${r.order_id}-${r.line_id}`} className={`${i % 2 ? "bg-slate-50/50" : ""} hover:bg-cyan-50/50`}>
            <td className="px-2 py-1 whitespace-nowrap">{fmtDate(r.fecha)}</td>
            <td className="px-2 py-1 font-mono text-slate-500 text-[9px]">{r.order_id}</td>
            <td className="px-2 py-1 font-medium truncate max-w-[140px]">{r.owner_partner_name || "-"}</td>
            <td className="px-2 py-1 truncate max-w-[140px]">{r.modelo_display || "-"}</td>
            <td className="px-2 py-1 text-slate-500">{r.marca || "-"}</td>
            <td className="px-2 py-1">{r.talla || "-"}</td>
            <td className="px-2 py-1">{r.color || "-"}</td>
            <td className="px-2 py-1 text-right font-mono font-semibold">{fmtNum(r.qty)}</td>
            <td className="px-2 py-1 text-right font-mono">{fmtMoney(r.price_unit)}</td>
            <td className="px-2 py-1 text-right font-mono">{fmtMoney(r.subtotal)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
