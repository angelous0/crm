import React, { useState, useEffect, useCallback, useRef } from "react";
import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Package, Store, Layers, Hash, Search, X
} from "lucide-react";

/* ── Multi-select filter popover ── */
function MultiFilter({ label, options, selected, onChange, testId }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = q ? options.filter(o => o.toLowerCase().includes(q.toLowerCase())) : options;
  const toggle = (val) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 font-normal" data-testid={testId}>
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px] leading-4 rounded-full">
              {selected.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
            <Input
              placeholder="Buscar..."
              className="h-7 text-xs pl-7"
              value={q}
              onChange={e => setQ(e.target.value)}
              data-testid={`${testId}-search`}
            />
          </div>
        </div>
        {selected.length > 0 && (
          <div className="px-2 py-1 border-b border-border">
            <Button variant="ghost" size="sm" className="h-6 text-[10px] text-slate-500 px-1"
              onClick={() => onChange([])}
            >
              <X size={12} className="mr-1" /> Limpiar
            </Button>
          </div>
        )}
        <ScrollArea className="h-[200px]">
          <div className="p-1">
            {filtered.map(opt => (
              <label key={opt}
                className="flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer hover:bg-slate-50 text-xs"
              >
                <Checkbox
                  checked={selected.includes(opt)}
                  onCheckedChange={() => toggle(opt)}
                  className="h-3.5 w-3.5"
                />
                <span className="truncate">{opt}</span>
              </label>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-4">Sin resultados</p>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

/* ── Qty cell color helper ── */
function qtyClass(v) {
  if (v > 10) return "text-emerald-700 font-semibold";
  if (v > 0) return "text-amber-700";
  return "text-slate-300";
}

/* ── CSV export helper ── */
function downloadCSV(rows, filename) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const header = cols.join(",");
  const body = rows.map(r => cols.map(c => {
    const v = r[c];
    return typeof v === "string" && v.includes(",") ? `"${v}"` : (v ?? "");
  }).join(",")).join("\n");
  const blob = new Blob([header + "\n" + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function StockDashboard() {
  // Filter options (fetched once)
  const [filterOpts, setFilterOpts] = useState({});
  // Selected filters
  const [f, setF] = useState({
    tienda: [], marca: [], tipo: [], entalle: [], tela: [], talla: [], color: [],
    modelo: "", es_lq: "", es_negro: ""
  });
  const setFilter = (key, val) => setF(prev => ({ ...prev, [key]: val }));

  // Data states
  const [kpis, setKpis] = useState(null);
  const [pivotModelo, setPivotModelo] = useState(null);
  const [pivotTienda, setPivotTienda] = useState(null);
  const [detalle, setDetalle] = useState({ items: [], total: 0 });
  const [pivotTiendaName, setPivotTiendaName] = useState("");
  const [detallePage, setDetallePage] = useState(1);
  const [pivotPage, setPivotPage] = useState(1);
  const [loading, setLoading] = useState({ kpis: false, pivot: false, tienda: false, detalle: false });

  const debounceRef = useRef(null);

  // Build query params from filters
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

  // Fetch filter options once
  useEffect(() => {
    api.get("/stock-dashboard/filtros").then(r => setFilterOpts(r.data || {})).catch(() => {});
  }, []);

  // Fetch all data when filters change
  const fetchAll = useCallback(async () => {
    const p = buildParams();

    setLoading(prev => ({ ...prev, kpis: true, pivot: true, detalle: true }));
    try {
      const [kR, pR, dR] = await Promise.all([
        api.get("/stock-dashboard/kpis", { params: p }),
        api.get("/stock-dashboard/pivot-modelo", { params: { ...p, page: pivotPage, limit: 50 } }),
        api.get("/stock-dashboard/detalle", { params: { ...p, page: detallePage, limit: 50 } })
      ]);
      setKpis(kR.data);
      setPivotModelo(pR.data);
      setDetalle({ items: dR.data.items || [], total: dR.data.total || 0 });
    } catch {
      toast.error("Error al cargar datos del dashboard");
    } finally {
      setLoading(prev => ({ ...prev, kpis: false, pivot: false, detalle: false }));
    }

    // Also refresh tienda pivot if one is selected
    if (pivotTiendaName) {
      setLoading(prev => ({ ...prev, tienda: true }));
      try {
        const tR = await api.get("/stock-dashboard/pivot-tienda", { params: { ...p, pivot_tienda: pivotTiendaName } });
        setPivotTienda(tR.data);
      } catch { /* ignore */ } finally {
        setLoading(prev => ({ ...prev, tienda: false }));
      }
    }
  }, [buildParams, pivotPage, detallePage, pivotTiendaName]);

  // Debounce modelo text input, immediate for others
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDetallePage(1);
      setPivotPage(1);
      fetchAll();
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [f]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch when pages change
  useEffect(() => { fetchAll(); }, [pivotPage, detallePage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch tienda pivot
  const selectTienda = async (name) => {
    setPivotTiendaName(name);
    if (!name) { setPivotTienda(null); return; }
    setLoading(prev => ({ ...prev, tienda: true }));
    try {
      const p = buildParams();
      const r = await api.get("/stock-dashboard/pivot-tienda", { params: { ...p, pivot_tienda: name } });
      setPivotTienda(r.data);
    } catch { toast.error("Error al cargar pivot tienda"); } finally {
      setLoading(prev => ({ ...prev, tienda: false }));
    }
  };

  const clearFilters = () => {
    setF({ tienda: [], marca: [], tipo: [], entalle: [], tela: [], talla: [], color: [], modelo: "", es_lq: "", es_negro: "" });
  };

  const hasFilters = f.tienda.length || f.marca.length || f.tipo.length || f.entalle.length ||
    f.tela.length || f.talla.length || f.color.length || f.modelo || f.es_lq || f.es_negro;

  const detallePages = Math.ceil(detalle.total / 50);
  const pivotPages = pivotModelo ? Math.ceil((pivotModelo.total_modelos || 0) / 50) : 1;

  return (
    <div data-testid="stock-dashboard-page" className="min-h-screen">
      {/* Header */}
      <div className="px-8 py-5 border-b border-border bg-white/50 backdrop-blur-sm sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-slate-900 flex items-center gap-2">
              <BarChart3 size={24} /> Stock Dashboard
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Analisis de stock por tienda, modelo, talla y color</p>
          </div>
          {kpis && (
            <Badge variant="secondary" className="text-sm font-mono">
              {Number(kpis.total_stock).toLocaleString("es-PE")} uds. en stock
            </Badge>
          )}
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* ── Filter Bar ── */}
        <div className="bg-white rounded-lg border border-border p-4 shadow-sm" data-testid="stock-filters">
          <div className="flex items-center gap-2 mb-3">
            <Filter size={14} className="text-slate-500" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Filtros</span>
            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-6 text-[10px] text-red-500 ml-auto" onClick={clearFilters}>
                <X size={12} className="mr-1" /> Limpiar todo
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <MultiFilter label="Tienda" options={filterOpts.tiendas || []} selected={f.tienda}
              onChange={v => setFilter("tienda", v)} testId="filter-tienda" />
            <MultiFilter label="Marca" options={filterOpts.marcas || []} selected={f.marca}
              onChange={v => setFilter("marca", v)} testId="filter-marca" />
            <MultiFilter label="Tipo" options={filterOpts.tipos || []} selected={f.tipo}
              onChange={v => setFilter("tipo", v)} testId="filter-tipo" />
            <MultiFilter label="Entalle" options={filterOpts.entalles || []} selected={f.entalle}
              onChange={v => setFilter("entalle", v)} testId="filter-entalle" />
            <MultiFilter label="Tela" options={filterOpts.telas || []} selected={f.tela}
              onChange={v => setFilter("tela", v)} testId="filter-tela" />
            <MultiFilter label="Talla" options={filterOpts.tallas || []} selected={f.talla}
              onChange={v => setFilter("talla", v)} testId="filter-talla" />
            <MultiFilter label="Color" options={filterOpts.colors || []} selected={f.color}
              onChange={v => setFilter("color", v)} testId="filter-color" />

            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
              <Input
                placeholder="Modelo..."
                className="h-8 w-[140px] text-xs pl-7"
                value={f.modelo}
                onChange={e => setFilter("modelo", e.target.value)}
                data-testid="filter-modelo"
              />
            </div>

            <Select value={f.es_lq || "ALL"} onValueChange={v => setFilter("es_lq", v === "ALL" ? "" : v)}>
              <SelectTrigger className="h-8 w-[100px] text-xs" data-testid="filter-es-lq">
                <SelectValue placeholder="LQ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">LQ: Todos</SelectItem>
                <SelectItem value="si">Solo LQ</SelectItem>
                <SelectItem value="no">No LQ</SelectItem>
              </SelectContent>
            </Select>

            <Select value={f.es_negro || "ALL"} onValueChange={v => setFilter("es_negro", v === "ALL" ? "" : v)}>
              <SelectTrigger className="h-8 w-[110px] text-xs" data-testid="filter-es-negro">
                <SelectValue placeholder="Negro" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Negro: Todos</SelectItem>
                <SelectItem value="si">Solo Negro</SelectItem>
                <SelectItem value="no">No Negro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="stock-kpis">
          <KpiCard icon={<Package size={18} />} label="Stock Disponible" value={kpis ? Number(kpis.total_stock).toLocaleString("es-PE") : "-"} loading={loading.kpis} testId="kpi-stock" />
          <KpiCard icon={<Layers size={18} />} label="Modelos" value={kpis?.modelos ?? "-"} loading={loading.kpis} testId="kpi-modelos" />
          <KpiCard icon={<Hash size={18} />} label="Variantes" value={kpis?.variantes ?? "-"} loading={loading.kpis} testId="kpi-variantes" />
          <KpiCard icon={<Store size={18} />} label="Tiendas con Stock" value={kpis?.tiendas_con_stock ?? "-"} loading={loading.kpis} testId="kpi-tiendas" />
        </div>

        {/* ── Pivot Modelo x Talla ── */}
        <div className="bg-white rounded-lg border border-border shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Stock por Modelo x Talla</h2>
            {pivotModelo && <span className="text-xs text-slate-500">{pivotModelo.total_modelos} modelos</span>}
          </div>
          {loading.pivot ? (
            <div className="h-40 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : pivotModelo && pivotModelo.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead className="sticky left-0 bg-slate-50 z-10 min-w-[180px] font-semibold">Modelo</TableHead>
                    <TableHead className="min-w-[70px] font-semibold">Marca</TableHead>
                    {pivotModelo.tallas.map(t => (
                      <TableHead key={t} className="text-center min-w-[50px] font-semibold">{t}</TableHead>
                    ))}
                    <TableHead className="text-center font-bold bg-slate-100 min-w-[65px]">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pivotModelo.rows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium text-slate-800 sticky left-0 bg-white z-10 border-r border-border truncate max-w-[200px]">
                        {row.modelo}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">{row.marca || "-"}</TableCell>
                      {pivotModelo.tallas.map(t => {
                        const v = row.values[t] || 0;
                        return <TableCell key={t} className={`text-center font-mono text-xs ${qtyClass(v)}`}>{Math.round(v)}</TableCell>;
                      })}
                      <TableCell className="text-center font-mono text-xs font-bold bg-slate-50 border-l border-border">{Math.round(row.total)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-slate-100 border-t-2">
                    <TableCell className="font-bold sticky left-0 bg-slate-100 z-10 border-r border-border">Total</TableCell>
                    <TableCell></TableCell>
                    {pivotModelo.tallas.map(t => (
                      <TableCell key={t} className="text-center font-mono text-xs font-bold">
                        {Math.round(pivotModelo.totals_by_talla[t] || 0)}
                      </TableCell>
                    ))}
                    <TableCell className="text-center font-mono font-bold text-emerald-700 bg-emerald-50 border-l border-border" data-testid="pivot-grand-total">
                      {Math.round(pivotModelo.grand_total)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="h-24 flex items-center justify-center text-slate-500 text-sm">Sin datos</div>
          )}
          {pivotPages > 1 && (
            <div className="px-5 py-2 border-t border-border flex items-center justify-between">
              <span className="text-xs text-slate-500">Pag {pivotPage} de {pivotPages}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-7" disabled={pivotPage <= 1} onClick={() => setPivotPage(p => p - 1)}>
                  <ChevronLeft size={14} />
                </Button>
                <Button variant="outline" size="sm" className="h-7" disabled={pivotPage >= pivotPages} onClick={() => setPivotPage(p => p + 1)}>
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Pivot by Tienda ── */}
        <div className="bg-white rounded-lg border border-border shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center gap-3">
            <Store size={16} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-800">Stock por Color x Talla (Tienda)</h2>
            <Select value={pivotTiendaName || "NONE"} onValueChange={v => selectTienda(v === "NONE" ? "" : v)}>
              <SelectTrigger className="w-[200px] h-8 text-xs ml-auto" data-testid="pivot-tienda-select">
                <SelectValue placeholder="Seleccionar tienda" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Seleccionar tienda...</SelectItem>
                {(filterOpts.tiendas || []).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {loading.tienda ? (
            <div className="h-32 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : pivotTienda && pivotTienda.colores.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead className="sticky left-0 bg-slate-50 z-10 min-w-[120px] font-semibold">Color</TableHead>
                    {pivotTienda.tallas.map(t => (
                      <TableHead key={t} className="text-center min-w-[50px] font-semibold">{t}</TableHead>
                    ))}
                    <TableHead className="text-center font-bold bg-slate-100 min-w-[65px]">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pivotTienda.colores.map(color => (
                    <TableRow key={color}>
                      <TableCell className="font-medium text-slate-800 sticky left-0 bg-white z-10 border-r border-border">{color}</TableCell>
                      {pivotTienda.tallas.map(t => {
                        const v = pivotTienda.matrix[color]?.[t] || 0;
                        return <TableCell key={t} className={`text-center font-mono text-xs ${qtyClass(v)}`}>{Math.round(v)}</TableCell>;
                      })}
                      <TableCell className="text-center font-mono text-xs font-bold bg-slate-50 border-l border-border">
                        {Math.round(pivotTienda.totals.byColor[color] || 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-slate-100 border-t-2">
                    <TableCell className="font-bold sticky left-0 bg-slate-100 z-10 border-r border-border">Total</TableCell>
                    {pivotTienda.tallas.map(t => (
                      <TableCell key={t} className="text-center font-mono text-xs font-bold">
                        {Math.round(pivotTienda.totals.bySize[t] || 0)}
                      </TableCell>
                    ))}
                    <TableCell className="text-center font-mono font-bold text-emerald-700 bg-emerald-50 border-l border-border">
                      {Math.round(pivotTienda.totals.grandTotal)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="h-20 flex items-center justify-center text-slate-400 text-xs">
              {pivotTiendaName ? "Sin datos para esta tienda" : "Selecciona una tienda para ver el detalle"}
            </div>
          )}
        </div>

        {/* ── Detail Table ── */}
        <div className="bg-white rounded-lg border border-border shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Detalle de Stock</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{detalle.total} filas</span>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                onClick={() => downloadCSV(detalle.items, "stock_detalle.csv")}
                disabled={!detalle.items.length}
                data-testid="export-csv-btn"
              >
                <Download size={13} /> CSV
              </Button>
            </div>
          </div>
          {loading.detalle ? (
            <div className="h-32 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50">
                    <TableHead>Tienda</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Marca</TableHead>
                    <TableHead>Talla</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead className="font-mono">Barcode</TableHead>
                    <TableHead className="text-right">Disponible</TableHead>
                    <TableHead className="text-center">LQ</TableHead>
                    <TableHead className="text-center">Negro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detalle.items.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="h-20 text-center text-slate-400 text-sm">Sin datos</TableCell></TableRow>
                  ) : detalle.items.map((r, i) => (
                    <TableRow key={i} data-testid={`detalle-row-${i}`}>
                      <TableCell className="text-xs">{r.tienda}</TableCell>
                      <TableCell className="text-xs font-medium">{r.modelo}</TableCell>
                      <TableCell className="text-xs text-slate-500">{r.marca || "-"}</TableCell>
                      <TableCell className="text-xs">{r.talla || "-"}</TableCell>
                      <TableCell className="text-xs">{r.color || "-"}</TableCell>
                      <TableCell className="font-mono text-[11px] text-slate-500">{r.barcode || "-"}</TableCell>
                      <TableCell className={`text-right font-mono text-xs ${qtyClass(Number(r.available_qty))}`}>
                        {Math.round(Number(r.available_qty))}
                      </TableCell>
                      <TableCell className="text-center text-xs">{r.es_lq ? "Si" : ""}</TableCell>
                      <TableCell className="text-center text-xs">{r.es_negro ? "Si" : ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {detallePages > 1 && (
            <div className="px-5 py-2 border-t border-border flex items-center justify-between">
              <span className="text-xs text-slate-500">Pag {detallePage} de {detallePages}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-7" disabled={detallePage <= 1}
                  onClick={() => setDetallePage(p => p - 1)} data-testid="detalle-prev">
                  <ChevronLeft size={14} />
                </Button>
                <Button variant="outline" size="sm" className="h-7" disabled={detallePage >= detallePages}
                  onClick={() => setDetallePage(p => p + 1)} data-testid="detalle-next">
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, loading: isLoading, testId }) {
  return (
    <Card className="shadow-sm" data-testid={testId}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="p-2 rounded-md bg-slate-100 text-slate-600">{icon}</div>
        <div>
          <p className="text-xs text-slate-500 font-medium">{label}</p>
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-400 mt-1" />
          ) : (
            <p className="text-xl font-bold text-slate-900 font-mono" data-testid={`${testId}-value`}>{value}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
