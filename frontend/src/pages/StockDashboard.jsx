import React, { useState, useEffect, useCallback, useRef } from "react";
import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  BarChart3, Loader2, Filter, Download, ChevronLeft, ChevronRight,
  Package, Store, Layers, Hash, Search, X, ChevronDown, ChevronUp
} from "lucide-react";

/* ── Multi-select filter popover ── */
function MultiFilter({ label, options, selected, onChange, testId }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = q ? options.filter(o => o.toLowerCase().includes(q.toLowerCase())) : options;
  const toggle = (val) => onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1 font-normal px-2.5" data-testid={testId}>
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="ml-0.5 px-1 py-0 text-[9px] leading-3.5 rounded-full">{selected.length}</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align="start">
        <div className="p-1.5 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
            <Input placeholder="Buscar..." className="h-6 text-[11px] pl-6" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
        {selected.length > 0 && (
          <div className="px-2 py-1 border-b border-border">
            <Button variant="ghost" size="sm" className="h-5 text-[10px] text-slate-500 px-1" onClick={() => onChange([])}>
              <X size={10} className="mr-0.5" /> Limpiar
            </Button>
          </div>
        )}
        <ScrollArea className="h-[180px]">
          <div className="p-1">
            {filtered.map(opt => (
              <label key={opt} className="flex items-center gap-1.5 px-2 py-1 rounded-sm cursor-pointer hover:bg-slate-50 text-[11px]">
                <Checkbox checked={selected.includes(opt)} onCheckedChange={() => toggle(opt)} className="h-3 w-3" />
                <span className="truncate">{opt}</span>
              </label>
            ))}
            {filtered.length === 0 && <p className="text-[11px] text-slate-400 text-center py-3">Sin resultados</p>}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function qtyClass(v) {
  if (v > 10) return "text-emerald-700 font-semibold";
  if (v > 0) return "text-amber-700 font-medium";
  return "text-slate-300";
}

function downloadCSV(rows, filename) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const header = cols.join(",");
  const body = rows.map(r => cols.map(c => { const v = r[c]; return typeof v === "string" && v.includes(",") ? `"${v}"` : (v ?? ""); }).join(",")).join("\n");
  const blob = new Blob([header + "\n" + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function StockDashboard() {
  const [filterOpts, setFilterOpts] = useState({});
  const [f, setF] = useState({
    tienda: [], marca: [], tipo: [], entalle: [], tela: [], talla: [], color: [],
    modelo: "", es_lq: "", es_negro: ""
  });
  const setFilter = (key, val) => setF(prev => ({ ...prev, [key]: val }));

  const [kpis, setKpis] = useState(null);
  const [pivotMT, setPivotMT] = useState(null); // Modelo x Tienda (main)
  const [pivotTalla, setPivotTalla] = useState(null); // Modelo x Talla (secondary)
  const [pivotTienda, setPivotTienda] = useState(null); // Color x Talla for 1 tienda
  const [detalle, setDetalle] = useState({ items: [], total: 0 });
  const [pivotTiendaName, setPivotTiendaName] = useState("");
  const [detallePage, setDetallePage] = useState(1);
  const [pivotPage, setPivotPage] = useState(1);
  const [loading, setLoading] = useState({});
  const [showTalla, setShowTalla] = useState(false);
  const [showDetalle, setShowDetalle] = useState(false);

  const debounceRef = useRef(null);

  const buildParams = useCallback(() => {
    const p = {};
    if (f.tienda.length) p.tienda = f.tienda.join(",");
    if (f.marca.length) p.marca = f.marca.join(",");
    if (f.tipo.length) p.tipo = f.tipo.join(",");
    if (f.entalle.length) p.entalle = f.entalle.join(",");
    if (f.tela.length) p.tela = f.tela.join(",");
    if (f.talla.length) p.talla = f.talla.join(",");
    if (f.color.length) p.color = f.color.join(",");
    if (f.modelo) p.modelo = f.modelo;
    if (f.es_lq) p.es_lq = f.es_lq;
    if (f.es_negro) p.es_negro = f.es_negro;
    return p;
  }, [f]);

  useEffect(() => {
    api.get("/stock-dashboard/filtros").then(r => setFilterOpts(r.data || {})).catch(() => {});
  }, []);

  const fetchAll = useCallback(async () => {
    const p = buildParams();
    setLoading(prev => ({ ...prev, kpis: true, mt: true }));

    try {
      const [kR, mtR] = await Promise.all([
        api.get("/stock-dashboard/kpis", { params: p }),
        api.get("/stock-dashboard/pivot-modelo-tienda", { params: { ...p, page: pivotPage, limit: 50 } })
      ]);
      setKpis(kR.data);
      setPivotMT(mtR.data);
    } catch { toast.error("Error al cargar datos"); }
    finally { setLoading(prev => ({ ...prev, kpis: false, mt: false })); }

    // Fetch secondary sections if open
    if (showTalla) {
      setLoading(prev => ({ ...prev, talla: true }));
      try {
        const tR = await api.get("/stock-dashboard/pivot-modelo", { params: { ...p, page: 1, limit: 50 } });
        setPivotTalla(tR.data);
      } catch {} finally { setLoading(prev => ({ ...prev, talla: false })); }
    }
    if (pivotTiendaName) {
      setLoading(prev => ({ ...prev, tienda: true }));
      try {
        const tR = await api.get("/stock-dashboard/pivot-tienda", { params: { ...p, pivot_tienda: pivotTiendaName } });
        setPivotTienda(tR.data);
      } catch {} finally { setLoading(prev => ({ ...prev, tienda: false })); }
    }
    if (showDetalle) {
      setLoading(prev => ({ ...prev, detalle: true }));
      try {
        const dR = await api.get("/stock-dashboard/detalle", { params: { ...p, page: detallePage, limit: 50 } });
        setDetalle({ items: dR.data.items || [], total: dR.data.total || 0 });
      } catch {} finally { setLoading(prev => ({ ...prev, detalle: false })); }
    }
  }, [buildParams, pivotPage, pivotTiendaName, showTalla, showDetalle, detallePage]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPivotPage(1); setDetallePage(1); fetchAll(); }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [f]); // eslint-disable-line

  useEffect(() => { fetchAll(); }, [pivotPage, detallePage]); // eslint-disable-line

  // Expand sections
  const toggleTalla = () => {
    const next = !showTalla;
    setShowTalla(next);
    if (next && !pivotTalla) {
      setLoading(prev => ({ ...prev, talla: true }));
      api.get("/stock-dashboard/pivot-modelo", { params: { ...buildParams(), page: 1, limit: 50 } })
        .then(r => setPivotTalla(r.data)).catch(() => {}).finally(() => setLoading(prev => ({ ...prev, talla: false })));
    }
  };

  const toggleDetalle = () => {
    const next = !showDetalle;
    setShowDetalle(next);
    if (next && !detalle.items.length) {
      setLoading(prev => ({ ...prev, detalle: true }));
      api.get("/stock-dashboard/detalle", { params: { ...buildParams(), page: 1, limit: 50 } })
        .then(r => setDetalle({ items: r.data.items || [], total: r.data.total || 0 })).catch(() => {}).finally(() => setLoading(prev => ({ ...prev, detalle: false })));
    }
  };

  const selectTienda = async (name) => {
    setPivotTiendaName(name);
    if (!name) { setPivotTienda(null); return; }
    setLoading(prev => ({ ...prev, tienda: true }));
    try {
      const r = await api.get("/stock-dashboard/pivot-tienda", { params: { ...buildParams(), pivot_tienda: name } });
      setPivotTienda(r.data);
    } catch {} finally { setLoading(prev => ({ ...prev, tienda: false })); }
  };

  const clearFilters = () => setF({ tienda: [], marca: [], tipo: [], entalle: [], tela: [], talla: [], color: [], modelo: "", es_lq: "", es_negro: "" });
  const hasFilters = f.tienda.length || f.marca.length || f.tipo.length || f.entalle.length || f.tela.length || f.talla.length || f.color.length || f.modelo || f.es_lq || f.es_negro;
  const pivotPages = pivotMT ? Math.ceil((pivotMT.total_modelos || 0) / 50) : 1;
  const detallePages = Math.ceil(detalle.total / 50);

  return (
    <div data-testid="stock-dashboard-page" className="min-h-screen">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-white/60 backdrop-blur-sm sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-xl font-semibold tracking-tight text-slate-900 flex items-center gap-2">
              <BarChart3 size={20} /> Stock Dashboard
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">Vista de stock por tienda, modelo, talla y color</p>
          </div>
          {kpis && <Badge variant="secondary" className="text-xs font-mono">{Number(kpis.total_stock).toLocaleString("es-PE")} uds</Badge>}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Filter Bar */}
        <div className="bg-white rounded-lg border border-border px-3 py-2.5 shadow-sm" data-testid="stock-filters">
          <div className="flex items-center gap-1.5 mb-2">
            <Filter size={12} className="text-slate-400" />
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Filtros</span>
            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-5 text-[10px] text-red-500 ml-auto px-1" onClick={clearFilters}>
                <X size={10} className="mr-0.5" /> Limpiar
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <MultiFilter label="Tienda" options={filterOpts.tiendas || []} selected={f.tienda} onChange={v => setFilter("tienda", v)} testId="filter-tienda" />
            <MultiFilter label="Marca" options={filterOpts.marcas || []} selected={f.marca} onChange={v => setFilter("marca", v)} testId="filter-marca" />
            <MultiFilter label="Tipo" options={filterOpts.tipos || []} selected={f.tipo} onChange={v => setFilter("tipo", v)} testId="filter-tipo" />
            <MultiFilter label="Entalle" options={filterOpts.entalles || []} selected={f.entalle} onChange={v => setFilter("entalle", v)} testId="filter-entalle" />
            <MultiFilter label="Tela" options={filterOpts.telas || []} selected={f.tela} onChange={v => setFilter("tela", v)} testId="filter-tela" />
            <MultiFilter label="Talla" options={filterOpts.tallas || []} selected={f.talla} onChange={v => setFilter("talla", v)} testId="filter-talla" />
            <MultiFilter label="Color" options={filterOpts.colors || []} selected={f.color} onChange={v => setFilter("color", v)} testId="filter-color" />
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={11} />
              <Input placeholder="Modelo..." className="h-7 w-[120px] text-[11px] pl-6" value={f.modelo} onChange={e => setFilter("modelo", e.target.value)} data-testid="filter-modelo" />
            </div>
            <Select value={f.es_lq || "ALL"} onValueChange={v => setFilter("es_lq", v === "ALL" ? "" : v)}>
              <SelectTrigger className="h-7 w-[90px] text-[11px]" data-testid="filter-es-lq"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">LQ: Todos</SelectItem>
                <SelectItem value="si">Solo LQ</SelectItem>
                <SelectItem value="no">No LQ</SelectItem>
              </SelectContent>
            </Select>
            <Select value={f.es_negro || "ALL"} onValueChange={v => setFilter("es_negro", v === "ALL" ? "" : v)}>
              <SelectTrigger className="h-7 w-[100px] text-[11px]" data-testid="filter-es-negro"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Negro: Todos</SelectItem>
                <SelectItem value="si">Solo Negro</SelectItem>
                <SelectItem value="no">No Negro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-3" data-testid="stock-kpis">
          <KpiCard icon={<Package size={16} />} label="Stock" value={kpis ? Number(kpis.total_stock).toLocaleString("es-PE") : "-"} loading={loading.kpis} testId="kpi-stock" />
          <KpiCard icon={<Layers size={16} />} label="Modelos" value={kpis?.modelos ?? "-"} loading={loading.kpis} testId="kpi-modelos" />
          <KpiCard icon={<Hash size={16} />} label="Variantes" value={kpis?.variantes ?? "-"} loading={loading.kpis} testId="kpi-variantes" />
          <KpiCard icon={<Store size={16} />} label="Tiendas" value={kpis?.tiendas_con_stock ?? "-"} loading={loading.kpis} testId="kpi-tiendas" />
        </div>

        {/* ── MAIN PIVOT: Modelo x Tienda ── */}
        <div className="bg-white rounded-lg border border-border shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center justify-between bg-slate-50/50">
            <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Store size={15} className="text-slate-500" /> Stock por Modelo x Tienda
            </h2>
            {pivotMT && <span className="text-[11px] text-slate-500">{pivotMT.total_modelos} modelos | Pag {pivotPage}</span>}
          </div>
          {loading.mt ? (
            <div className="h-48 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : pivotMT && pivotMT.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow className="bg-slate-800 hover:bg-slate-800">
                    <TableHead className="sticky left-0 z-10 bg-slate-800 text-white font-semibold text-[11px] min-w-[160px]">Modelo</TableHead>
                    <TableHead className="text-white font-semibold text-[11px] min-w-[60px]">Marca</TableHead>
                    {pivotMT.tiendas.map(t => (
                      <TableHead key={t} className="text-center text-white font-semibold text-[10px] min-w-[55px] px-1.5 whitespace-nowrap">{t}</TableHead>
                    ))}
                    <TableHead className="text-center text-white font-bold text-[11px] bg-slate-900 min-w-[60px]">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pivotMT.rows.map((row, i) => (
                    <TableRow key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                      <TableCell className="font-medium text-slate-900 sticky left-0 z-10 border-r border-slate-200 truncate max-w-[180px]"
                        style={{ backgroundColor: i % 2 === 0 ? "white" : "rgb(248 250 252 / 0.6)" }}>
                        {row.modelo}
                      </TableCell>
                      <TableCell className="text-slate-500 text-[10px]">{row.marca || "-"}</TableCell>
                      {pivotMT.tiendas.map(t => {
                        const v = row.values[t] || 0;
                        return (
                          <TableCell key={t} className={`text-center font-mono text-[11px] px-1.5 ${qtyClass(v)}`}>
                            {v > 0 ? Math.round(v) : <span className="text-slate-200">-</span>}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center font-mono text-[11px] font-bold bg-slate-100/80 border-l border-slate-200">
                        {Math.round(row.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Totals row */}
                  <TableRow className="bg-slate-800 hover:bg-slate-800 border-t-2 border-slate-600">
                    <TableCell className="font-bold text-white sticky left-0 z-10 bg-slate-800 border-r border-slate-600">Total</TableCell>
                    <TableCell></TableCell>
                    {pivotMT.tiendas.map(t => (
                      <TableCell key={t} className="text-center font-mono text-[11px] font-bold text-white px-1.5">
                        {Math.round(pivotMT.totals_by_tienda[t] || 0)}
                      </TableCell>
                    ))}
                    <TableCell className="text-center font-mono font-bold text-emerald-400 bg-slate-900 border-l border-slate-600 text-sm" data-testid="pivot-mt-grand-total">
                      {Math.round(pivotMT.grand_total)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="h-24 flex items-center justify-center text-slate-500 text-sm">Sin datos</div>
          )}
          {pivotPages > 1 && (
            <div className="px-4 py-1.5 border-t border-border flex items-center justify-between bg-slate-50/30">
              <span className="text-[11px] text-slate-500">Pag {pivotPage} de {pivotPages}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-6 w-6 p-0" disabled={pivotPage <= 1} onClick={() => setPivotPage(p => p - 1)}>
                  <ChevronLeft size={13} />
                </Button>
                <Button variant="outline" size="sm" className="h-6 w-6 p-0" disabled={pivotPage >= pivotPages} onClick={() => setPivotPage(p => p + 1)}>
                  <ChevronRight size={13} />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Pivot by Tienda (Color x Talla) ── */}
        <div className="bg-white rounded-lg border border-border shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-3 bg-slate-50/50">
            <Store size={15} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-800">Detalle Tienda: Color x Talla</h2>
            <Select value={pivotTiendaName || "NONE"} onValueChange={v => selectTienda(v === "NONE" ? "" : v)}>
              <SelectTrigger className="w-[180px] h-7 text-[11px] ml-auto" data-testid="pivot-tienda-select">
                <SelectValue placeholder="Seleccionar tienda..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Seleccionar tienda...</SelectItem>
                {(filterOpts.tiendas || []).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {loading.tienda ? (
            <div className="h-28 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : pivotTienda && pivotTienda.colores.length > 0 ? (
            <div className="overflow-x-auto">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow className="bg-slate-800 hover:bg-slate-800">
                    <TableHead className="sticky left-0 z-10 bg-slate-800 text-white font-semibold text-[11px] min-w-[110px]">Color</TableHead>
                    {pivotTienda.tallas.map(t => (
                      <TableHead key={t} className="text-center text-white font-semibold text-[10px] min-w-[45px] px-1">{t}</TableHead>
                    ))}
                    <TableHead className="text-center text-white font-bold text-[11px] bg-slate-900 min-w-[55px]">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pivotTienda.colores.map((color, i) => (
                    <TableRow key={color} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                      <TableCell className="font-medium text-slate-800 sticky left-0 z-10 border-r border-slate-200 text-[11px]"
                        style={{ backgroundColor: i % 2 === 0 ? "white" : "rgb(248 250 252 / 0.6)" }}>
                        {color}
                      </TableCell>
                      {pivotTienda.tallas.map(t => {
                        const v = pivotTienda.matrix[color]?.[t] || 0;
                        return <TableCell key={t} className={`text-center font-mono text-[11px] px-1 ${qtyClass(v)}`}>{v > 0 ? Math.round(v) : <span className="text-slate-200">-</span>}</TableCell>;
                      })}
                      <TableCell className="text-center font-mono text-[11px] font-bold bg-slate-100/80 border-l border-slate-200">
                        {Math.round(pivotTienda.totals.byColor[color] || 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-slate-800 hover:bg-slate-800 border-t-2">
                    <TableCell className="font-bold text-white sticky left-0 z-10 bg-slate-800 border-r border-slate-600">Total</TableCell>
                    {pivotTienda.tallas.map(t => (
                      <TableCell key={t} className="text-center font-mono text-[11px] font-bold text-white px-1">{Math.round(pivotTienda.totals.bySize[t] || 0)}</TableCell>
                    ))}
                    <TableCell className="text-center font-mono font-bold text-emerald-400 bg-slate-900 border-l border-slate-600">
                      {Math.round(pivotTienda.totals.grandTotal)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="h-16 flex items-center justify-center text-slate-400 text-[11px]">
              {pivotTiendaName ? "Sin datos" : "Selecciona una tienda para ver Color x Talla"}
            </div>
          )}
        </div>

        {/* ── Expandable: Modelo x Talla ── */}
        <div className="bg-white rounded-lg border border-border shadow-sm overflow-hidden">
          <button className="w-full px-4 py-2.5 flex items-center justify-between bg-slate-50/50 border-b border-border hover:bg-slate-100/50 transition-colors"
            onClick={toggleTalla} data-testid="toggle-pivot-talla">
            <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Layers size={15} className="text-slate-500" /> Stock por Modelo x Talla
            </h2>
            {showTalla ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
          </button>
          {showTalla && (
            loading.talla ? (
              <div className="h-32 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
            ) : pivotTalla && pivotTalla.rows.length > 0 ? (
              <div className="overflow-x-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="bg-slate-800 hover:bg-slate-800">
                      <TableHead className="sticky left-0 z-10 bg-slate-800 text-white font-semibold text-[11px] min-w-[160px]">Modelo</TableHead>
                      <TableHead className="text-white font-semibold text-[11px] min-w-[60px]">Marca</TableHead>
                      {pivotTalla.tallas.map(t => (
                        <TableHead key={t} className="text-center text-white font-semibold text-[10px] min-w-[45px] px-1">{t}</TableHead>
                      ))}
                      <TableHead className="text-center text-white font-bold text-[11px] bg-slate-900 min-w-[55px]">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pivotTalla.rows.map((row, i) => (
                      <TableRow key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                        <TableCell className="font-medium text-slate-900 sticky left-0 z-10 border-r border-slate-200 truncate max-w-[180px]"
                          style={{ backgroundColor: i % 2 === 0 ? "white" : "rgb(248 250 252 / 0.6)" }}>
                          {row.modelo}
                        </TableCell>
                        <TableCell className="text-slate-500 text-[10px]">{row.marca || "-"}</TableCell>
                        {pivotTalla.tallas.map(t => {
                          const v = row.values[t] || 0;
                          return <TableCell key={t} className={`text-center font-mono text-[11px] px-1 ${qtyClass(v)}`}>{v > 0 ? Math.round(v) : <span className="text-slate-200">-</span>}</TableCell>;
                        })}
                        <TableCell className="text-center font-mono text-[11px] font-bold bg-slate-100/80 border-l border-slate-200">{Math.round(row.total)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-slate-800 hover:bg-slate-800 border-t-2">
                      <TableCell className="font-bold text-white sticky left-0 z-10 bg-slate-800 border-r border-slate-600">Total</TableCell>
                      <TableCell></TableCell>
                      {pivotTalla.tallas.map(t => (
                        <TableCell key={t} className="text-center font-mono text-[11px] font-bold text-white px-1">{Math.round(pivotTalla.totals_by_talla[t] || 0)}</TableCell>
                      ))}
                      <TableCell className="text-center font-mono font-bold text-emerald-400 bg-slate-900 border-l border-slate-600">{Math.round(pivotTalla.grand_total)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            ) : <div className="h-16 flex items-center justify-center text-slate-400 text-[11px]">Sin datos</div>
          )}
        </div>

        {/* ── Expandable: Detail Table ── */}
        <div className="bg-white rounded-lg border border-border shadow-sm overflow-hidden">
          <button className="w-full px-4 py-2.5 flex items-center justify-between bg-slate-50/50 border-b border-border hover:bg-slate-100/50 transition-colors"
            onClick={toggleDetalle} data-testid="toggle-detalle">
            <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Hash size={15} className="text-slate-500" /> Detalle de Stock
              {detalle.total > 0 && <span className="text-[10px] text-slate-400 font-normal ml-1">{detalle.total} filas</span>}
            </h2>
            <div className="flex items-center gap-2">
              {showDetalle && detalle.items.length > 0 && (
                <Button variant="outline" size="sm" className="h-6 text-[10px] gap-0.5 px-2"
                  onClick={(e) => { e.stopPropagation(); downloadCSV(detalle.items, "stock_detalle.csv"); }}
                  data-testid="export-csv-btn">
                  <Download size={11} /> CSV
                </Button>
              )}
              {showDetalle ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
            </div>
          </button>
          {showDetalle && (
            loading.detalle ? (
              <div className="h-28 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow className="bg-slate-50/50">
                        <TableHead className="text-[11px]">Tienda</TableHead>
                        <TableHead className="text-[11px]">Modelo</TableHead>
                        <TableHead className="text-[11px]">Marca</TableHead>
                        <TableHead className="text-[11px]">Talla</TableHead>
                        <TableHead className="text-[11px]">Color</TableHead>
                        <TableHead className="text-[11px] font-mono">Barcode</TableHead>
                        <TableHead className="text-right text-[11px]">Disp.</TableHead>
                        <TableHead className="text-center text-[11px]">LQ</TableHead>
                        <TableHead className="text-center text-[11px]">Negro</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detalle.items.length === 0 ? (
                        <TableRow><TableCell colSpan={9} className="h-16 text-center text-slate-400 text-[11px]">Sin datos</TableCell></TableRow>
                      ) : detalle.items.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-[11px]">{r.tienda}</TableCell>
                          <TableCell className="text-[11px] font-medium">{r.modelo}</TableCell>
                          <TableCell className="text-[11px] text-slate-500">{r.marca || "-"}</TableCell>
                          <TableCell className="text-[11px]">{r.talla || "-"}</TableCell>
                          <TableCell className="text-[11px]">{r.color || "-"}</TableCell>
                          <TableCell className="font-mono text-[10px] text-slate-400">{r.barcode || "-"}</TableCell>
                          <TableCell className={`text-right font-mono text-[11px] ${qtyClass(Number(r.available_qty))}`}>{Math.round(Number(r.available_qty))}</TableCell>
                          <TableCell className="text-center text-[11px]">{r.es_lq ? "Si" : ""}</TableCell>
                          <TableCell className="text-center text-[11px]">{r.es_negro ? "Si" : ""}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {detallePages > 1 && (
                  <div className="px-4 py-1.5 border-t border-border flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">Pag {detallePage} de {detallePages}</span>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" className="h-6 w-6 p-0" disabled={detallePage <= 1} onClick={() => setDetallePage(p => p - 1)}>
                        <ChevronLeft size={13} />
                      </Button>
                      <Button variant="outline" size="sm" className="h-6 w-6 p-0" disabled={detallePage >= detallePages} onClick={() => setDetallePage(p => p + 1)}>
                        <ChevronRight size={13} />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, loading: ld, testId }) {
  return (
    <Card className="shadow-sm border-border" data-testid={testId}>
      <CardContent className="p-3 flex items-center gap-2.5">
        <div className="p-1.5 rounded-md bg-slate-100 text-slate-600">{icon}</div>
        <div>
          <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">{label}</p>
          {ld ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 mt-0.5" /> : (
            <p className="text-lg font-bold text-slate-900 font-mono leading-tight" data-testid={`${testId}-value`}>{value}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
