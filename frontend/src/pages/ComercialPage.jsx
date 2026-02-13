import React, { useState, useEffect, useCallback, useRef } from "react";
import api from "@/lib/api";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Loader2, Search, X, ChevronDown, ChevronUp, Download,
  ShoppingBag, Bookmark, Calendar, DollarSign, Hash, Users
} from "lucide-react";

/* ── Helpers ── */
function fmtNum(n) { return Number(n || 0).toLocaleString("es-PE"); }
function fmtMoney(n) { return "S/ " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(d) {
  if (!d) return "-";
  const dt = new Date(d);
  return dt.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
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

/* ── Slicer Filter ── */
function SlicerFilter({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = q ? options.filter(o => o.toLowerCase().includes(q.toLowerCase())) : options;
  const toggle = (v) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  const count = selected.length;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors min-w-0 ${count > 0 ? "bg-amber-600 text-white" : "bg-slate-700 hover:bg-slate-600 text-white/90"}`}
          data-testid={`slicer-${label.toLowerCase().replace(/\s/g, '-')}`}>
          <span className="truncate">{label}</span>
          {count > 0 && <span className="bg-white/30 rounded-full px-1 text-[9px] font-bold">{count}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0 shadow-xl" align="start">
        <div className="p-1.5 border-b">
          <div className="relative">
            <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400" size={11} />
            <Input placeholder="Buscar..." className="h-6 text-[10px] pl-6" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
        {count > 0 && (
          <button className="w-full text-left px-2 py-1 text-[10px] text-red-500 hover:bg-red-50 flex items-center gap-1 border-b" onClick={() => onChange([])}>
            <X size={10} /> Limpiar
          </button>
        )}
        <ScrollArea className="h-[200px]">
          <div className="p-0.5">
            {filtered.map(o => (
              <label key={o} className="flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer hover:bg-slate-50 text-[10px]">
                <Checkbox checked={selected.includes(o)} onCheckedChange={() => toggle(o)} className="h-3 w-3" />
                <span className="truncate">{o}</span>
              </label>
            ))}
            {!filtered.length && <p className="text-[10px] text-slate-400 text-center py-3">Sin resultados</p>}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

/* ── KPI Card ── */
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

/* ══════════════════════════════════════════════════════ */
export default function ComercialPage() {
  const [tab, setTab] = useState("SALE");
  const [fechaDesde, setFechaDesde] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [fechaHasta, setFechaHasta] = useState(() => new Date().toISOString().slice(0, 10));
  const [filters, setFilters] = useState({ marca: [], tipo: [], entalle: [], tela: [], hilo: [], talla: [], color: [] });
  const [modelo, setModelo] = useState("");
  const [cliente, setCliente] = useState("");

  const [summary, setSummary] = useState(null);
  const [filterOpts, setFilterOpts] = useState({});
  const [detail, setDetail] = useState({ items: [], has_next: false });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const debounceRef = useRef(null);
  const LIMIT = 50;

  const sf = (k, v) => setFilters(prev => ({ ...prev, [k]: v }));

  const buildParams = useCallback(() => {
    const p = { doc_tipo: tab };
    if (fechaDesde) p.fecha_desde = fechaDesde;
    if (fechaHasta) p.fecha_hasta = fechaHasta;
    if (filters.marca.length) p.marca = filters.marca.join(",");
    if (filters.tipo.length) p.tipo = filters.tipo.join(",");
    if (filters.entalle.length) p.entalle = filters.entalle.join(",");
    if (filters.tela.length) p.tela = filters.tela.join(",");
    if (filters.hilo.length) p.hilo = filters.hilo.join(",");
    if (filters.talla.length) p.talla = filters.talla.join(",");
    if (filters.color.length) p.color = filters.color.join(",");
    if (modelo) p.modelo = modelo;
    if (cliente) p.cliente = cliente;
    return p;
  }, [tab, fechaDesde, fechaHasta, filters, modelo, cliente]);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/comercial/summary", { params: buildParams() });
      setSummary(r.data);
    } catch { toast.error("Error cargando resumen"); }
    finally { setLoading(false); }
  }, [buildParams]);

  const fetchFilterOpts = useCallback(async () => {
    try {
      const r = await api.get("/comercial/filter-options", { params: { doc_tipo: tab, fecha_desde: fechaDesde, fecha_hasta: fechaHasta } });
      setFilterOpts(r.data || {});
    } catch {}
  }, [tab, fechaDesde, fechaHasta]);

  const fetchDetail = useCallback(async (pg) => {
    setDetailLoading(true);
    try {
      const r = await api.get("/comercial/detail", { params: { ...buildParams(), page: pg, limit: LIMIT } });
      setDetail({ items: r.data.items || [], has_next: r.data.has_next || false });
      setPage(pg);
    } catch { toast.error("Error cargando detalle"); }
    finally { setDetailLoading(false); }
  }, [buildParams]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSummary();
      fetchDetail(1);
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [tab, fechaDesde, fechaHasta, filters, modelo, cliente]); // eslint-disable-line

  useEffect(() => { fetchFilterOpts(); }, [tab, fechaDesde, fechaHasta]); // eslint-disable-line

  const opts = filterOpts || {};
  const kpis = summary?.kpis || {};
  const isSale = tab === "SALE";

  const clearAll = () => {
    setFilters({ marca: [], tipo: [], entalle: [], tela: [], hilo: [], talla: [], color: [] });
    setModelo(""); setCliente(""); setFechaDesde(""); setFechaHasta("");
  };
  const hasFilters = Object.values(filters).some(v => v.length > 0) || modelo || cliente || fechaDesde || fechaHasta;

  return (
    <div data-testid="comercial-page" className="h-screen flex flex-col bg-slate-100 overflow-hidden">
      {/* ── FILTER BAR ── */}
      <div className="bg-slate-900 px-3 py-2 flex items-center gap-2 flex-wrap shrink-0" data-testid="comercial-filter-bar">
        <span className={`text-[11px] font-bold uppercase tracking-wider ${isSale ? "text-emerald-400" : "text-amber-400"}`}>
          {isSale ? "VENTAS" : "RESERVAS"}
        </span>
        <div className="w-px h-5 bg-slate-700" />

        {/* Date filters */}
        <div className="flex items-center gap-1">
          <Calendar size={10} className="text-slate-400" />
          <input type="date" className="h-6 text-[10px] rounded px-1.5 bg-slate-700 text-white border-0 outline-none"
            value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} data-testid="filter-fecha-desde" />
          <span className="text-[9px] text-slate-500">a</span>
          <input type="date" className="h-6 text-[10px] rounded px-1.5 bg-slate-700 text-white border-0 outline-none"
            value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} data-testid="filter-fecha-hasta" />
        </div>
        <div className="w-px h-5 bg-slate-700" />

        <SlicerFilter label="Marca" options={opts.marca || []} selected={filters.marca} onChange={v => sf("marca", v)} />
        <SlicerFilter label="Tipo" options={opts.tipo || []} selected={filters.tipo} onChange={v => sf("tipo", v)} />
        <SlicerFilter label="Entalle" options={opts.entalle || []} selected={filters.entalle} onChange={v => sf("entalle", v)} />
        <SlicerFilter label="Tela" options={opts.tela || []} selected={filters.tela} onChange={v => sf("tela", v)} />
        <SlicerFilter label="Hilo" options={opts.hilo || []} selected={filters.hilo} onChange={v => sf("hilo", v)} />
        <SlicerFilter label="Talla" options={opts.talla || []} selected={filters.talla} onChange={v => sf("talla", v)} />
        <SlicerFilter label="Color" options={opts.color || []} selected={filters.color} onChange={v => sf("color", v)} />

        <div className="relative">
          <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400" size={10} />
          <input className={`h-6 w-[90px] text-[10px] rounded pl-5 pr-1 border-0 outline-none placeholder:text-slate-500 ${modelo ? "bg-amber-500 text-black font-semibold" : "bg-slate-700 text-white"}`}
            placeholder="Modelo..." value={modelo} onChange={e => setModelo(e.target.value)} data-testid="filter-modelo" />
        </div>
        <div className="relative">
          <Users className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400" size={10} />
          <input className={`h-6 w-[100px] text-[10px] rounded pl-5 pr-1 border-0 outline-none placeholder:text-slate-500 ${cliente ? "bg-amber-500 text-black font-semibold" : "bg-slate-700 text-white"}`}
            placeholder="Cliente..." value={cliente} onChange={e => setCliente(e.target.value)} data-testid="filter-cliente" />
        </div>

        {hasFilters && (
          <button className="text-[9px] text-red-400 hover:text-red-300 underline ml-1" onClick={clearAll} data-testid="clear-all-filters">
            Limpiar todo
          </button>
        )}

        <div className="ml-auto flex items-center gap-3 text-[10px]">
          <span className="text-slate-400">Registros: <b className="text-white">{fmtNum(detail.total)}</b></span>
        </div>
      </div>

      {/* ── TAB BAR ── */}
      <div className="bg-slate-800 px-3 flex items-center gap-0 shrink-0 border-b border-slate-700" data-testid="comercial-tabs">
        <button className={`px-4 py-1.5 text-[10px] font-semibold transition-colors border-b-2 flex items-center gap-1 ${tab === "SALE" ? "text-white border-emerald-500" : "text-slate-400 border-transparent hover:text-white hover:border-slate-500"}`}
          onClick={() => setTab("SALE")} data-testid="tab-ventas">
          <ShoppingBag size={11} /> Ventas
        </button>
        <button className={`px-4 py-1.5 text-[10px] font-semibold transition-colors border-b-2 flex items-center gap-1 ${tab === "RESERVA" ? "text-white border-amber-500" : "text-slate-400 border-transparent hover:text-white hover:border-slate-500"}`}
          onClick={() => setTab("RESERVA")} data-testid="tab-reservas">
          <Bookmark size={11} /> Reservas
        </button>
      </div>

      {/* ── KPIs ── */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 p-3 shrink-0" data-testid="comercial-kpis">
            <KpiCard icon={Hash} label="Cantidad Total" value={fmtNum(kpis.total_qty)} color="border-slate-200" />
            <KpiCard icon={DollarSign} label="Subtotal" value={fmtMoney(kpis.total_subtotal)} color="border-slate-200" />
            <KpiCard icon={ShoppingBag} label="Ordenes" value={fmtNum(kpis.count_orders)} color="border-slate-200" />
          </div>

          {/* ── Top Sections ── */}
          <div className="grid grid-cols-2 gap-3 px-3 pb-2 shrink-0">
            {/* Top Productos */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-3 py-1.5 bg-slate-800 text-white text-[10px] font-bold">Top 10 Productos</div>
              <div className="max-h-[140px] overflow-auto">
                <table className="w-full text-[10px] border-collapse">
                  <thead className="sticky top-0 bg-slate-100">
                    <tr>
                      <th className="text-left px-2 py-1 font-semibold">Modelo</th>
                      <th className="text-left px-2 py-1 font-semibold">Marca</th>
                      <th className="text-left px-2 py-1 font-semibold">Talla</th>
                      <th className="text-left px-2 py-1 font-semibold">Color</th>
                      <th className="text-right px-2 py-1 font-semibold">Qty</th>
                      <th className="text-right px-2 py-1 font-semibold">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary?.top_productos || []).map((r, i) => (
                      <tr key={i} className={i % 2 ? "bg-slate-50/50" : ""}>
                        <td className="px-2 py-0.5 font-medium truncate max-w-[120px]">{r.modelo || "-"}</td>
                        <td className="px-2 py-0.5 text-slate-500">{r.marca || "-"}</td>
                        <td className="px-2 py-0.5">{r.talla || "-"}</td>
                        <td className="px-2 py-0.5">{r.color || "-"}</td>
                        <td className="px-2 py-0.5 text-right font-mono">{fmtNum(r.qty)}</td>
                        <td className="px-2 py-0.5 text-right font-mono">{fmtMoney(r.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {/* Top Clientes */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-3 py-1.5 bg-slate-800 text-white text-[10px] font-bold">Top 10 Clientes</div>
              <div className="max-h-[140px] overflow-auto">
                <table className="w-full text-[10px] border-collapse">
                  <thead className="sticky top-0 bg-slate-100">
                    <tr>
                      <th className="text-left px-2 py-1 font-semibold">Cliente</th>
                      <th className="text-right px-2 py-1 font-semibold">Qty</th>
                      <th className="text-right px-2 py-1 font-semibold">Subtotal</th>
                      <th className="text-right px-2 py-1 font-semibold">Ordenes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary?.top_clientes || []).map((r, i) => (
                      <tr key={i} className={i % 2 ? "bg-slate-50/50" : ""}>
                        <td className="px-2 py-0.5 font-medium truncate max-w-[180px]">{r.partner_name || `ID: ${r.partner_id}`}</td>
                        <td className="px-2 py-0.5 text-right font-mono">{fmtNum(r.qty)}</td>
                        <td className="px-2 py-0.5 text-right font-mono">{fmtMoney(r.subtotal)}</td>
                        <td className="px-2 py-0.5 text-right font-mono">{fmtNum(r.orders)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ── Detail Table ── */}
          <div className="flex-1 flex flex-col min-h-0 px-3 pb-3">
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="px-3 py-1.5 bg-slate-800 text-white text-[10px] font-bold flex items-center justify-between shrink-0">
                <span>Detalle</span>
                <div className="flex items-center gap-2">
                  {detail.items.length > 0 && (
                    <button className="flex items-center gap-0.5 text-[10px] text-slate-300 hover:text-white px-1"
                      onClick={() => downloadCSV(detail.items, `${tab.toLowerCase()}_detalle.csv`)} data-testid="export-csv-btn">
                      <Download size={10} /> CSV
                    </button>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-auto min-h-0">
                {detailLoading ? (
                  <div className="h-20 flex items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
                ) : (
                  <table className="w-full text-[10px] border-collapse">
                    <thead className="sticky top-0 bg-slate-100 z-10">
                      <tr>
                        {["Fecha", "Orden", "Cliente", "Modelo", "Marca", "Tipo", "Entalle", "Tela", "Talla", "Color", "Qty", "P.Unit", "Subtotal"].map(h => (
                          <th key={h} className={`text-left px-2 py-1 font-semibold whitespace-nowrap ${h === "Qty" || h === "P.Unit" || h === "Subtotal" ? "text-right" : ""}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {!detail.items.length ? (
                        <tr><td colSpan={13} className="text-center py-8 text-slate-400">Sin datos para los filtros seleccionados</td></tr>
                      ) : detail.items.map((r, i) => (
                        <tr key={i} className={i % 2 ? "bg-slate-50/50" : ""}>
                          <td className="px-2 py-0.5 whitespace-nowrap">{fmtDate(r.fecha)}</td>
                          <td className="px-2 py-0.5 font-mono text-slate-500">{r.order_id}</td>
                          <td className="px-2 py-0.5 truncate max-w-[140px]">{r.partner_name || "-"}</td>
                          <td className="px-2 py-0.5 font-medium truncate max-w-[100px]">{r.modelo || "-"}</td>
                          <td className="px-2 py-0.5 text-slate-500">{r.marca || "-"}</td>
                          <td className="px-2 py-0.5 text-slate-500">{r.tipo || "-"}</td>
                          <td className="px-2 py-0.5 text-slate-500">{r.entalle || "-"}</td>
                          <td className="px-2 py-0.5 text-slate-500">{r.tela || "-"}</td>
                          <td className="px-2 py-0.5">{r.talla || "-"}</td>
                          <td className="px-2 py-0.5">{r.color || "-"}</td>
                          <td className="px-2 py-0.5 text-right font-mono">{fmtNum(r.qty)}</td>
                          <td className="px-2 py-0.5 text-right font-mono">{fmtMoney(r.price_unit)}</td>
                          <td className="px-2 py-0.5 text-right font-mono font-medium">{fmtMoney(r.subtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              {/* Pagination */}
              {(page > 1 || detail.has_next) && (
                <div className="flex items-center justify-between px-3 py-1.5 border-t text-[10px] text-slate-500 shrink-0">
                  <span>Pagina {page}</span>
                  <div className="flex gap-1">
                    <button className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40" disabled={page <= 1} onClick={() => fetchDetail(page - 1)} data-testid="prev-page">Ant</button>
                    <button className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40" disabled={!detail.has_next} onClick={() => fetchDetail(page + 1)} data-testid="next-page">Sig</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
