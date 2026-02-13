import React, { useState, useEffect, useCallback, useRef } from "react";
import api from "@/lib/api";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Search, X, ChevronDown, ChevronUp, Download } from "lucide-react";

const STORE_ORDER_CENTER = [
  "GRAU 238 / GRAU 55", "GAMARRA 209", "GM218",
  "BOOSH", "GAMARRA 207", "TOTAL"
];

const DEFAULT_F = {
  tienda: [], marca: [], tipo: [], entalle: [], tela: [], talla: [], color: [],
  modelo: "", es_lq: "", es_negro: ""
};

/* ── Toggle helper: add/remove value from array, or set/clear string ── */
function toggleValue(prev, key, value) {
  const cur = prev[key];
  if (Array.isArray(cur)) {
    return { ...prev, [key]: cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value] };
  }
  return { ...prev, [key]: cur === value ? "" : value };
}

function isActive(f, key, value) {
  const cur = f[key];
  if (Array.isArray(cur)) return cur.includes(value);
  return cur === value;
}

/* ── Slicer filter popover ── */
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
          {count > 0 && <span className="bg-white/30 rounded-full px-1 text-[9px] font-bold leading-tight">{count}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-0 shadow-xl" align="start">
        <div className="p-1.5 border-b">
          <div className="relative">
            <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400" size={11} />
            <Input placeholder="Buscar..." className="h-6 text-[10px] pl-6" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
        {count > 0 && (
          <button className="w-full text-left px-2 py-1 text-[10px] text-red-500 hover:bg-red-50 flex items-center gap-1 border-b"
            onClick={() => onChange([])}>
            <X size={10} /> Limpiar
          </button>
        )}
        <ScrollArea className="h-[160px]">
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

/* ── Toggle filter (Todas/Si/No) ── */
function ToggleFilter({ label, value, onChange, disabled }) {
  const opts = ["", "si", "no"];
  const labels = ["Todas", "Si", "No"];
  const idx = opts.indexOf(value || "");
  const next = () => onChange(opts[(idx + 1) % 3]);

  return (
    <button
      className={`px-2 py-1 rounded text-[10px] transition-colors ${
        disabled ? "bg-slate-800 text-slate-600 cursor-not-allowed" :
        value === "si" ? "bg-emerald-600 text-white" :
        value === "no" ? "bg-red-600 text-white" :
        "bg-slate-700 text-white/90 hover:bg-slate-600"
      }`}
      onClick={disabled ? undefined : next}
      title={disabled ? "Pendiente - no hay datos" : `${label}: ${labels[idx]}`}
      data-testid={`toggle-${label.toLowerCase().replace(/\s/g, '-')}`}
    >
      {label}: {labels[idx]}
    </button>
  );
}

/* ── Active filter chips ── */
function FilterChips({ f, onToggle, onClear }) {
  const chips = [];
  if (f.modelo) chips.push({ key: "modelo", value: f.modelo, label: `Modelo: ${f.modelo}` });
  f.talla.forEach(t => chips.push({ key: "talla", value: t, label: `Talla: ${t}` }));
  f.color.forEach(c => chips.push({ key: "color", value: c, label: `Color: ${c}` }));
  f.tienda.forEach(t => chips.push({ key: "tienda", value: t, label: `Tienda: ${t}` }));
  f.marca.forEach(m => chips.push({ key: "marca", value: m, label: `Marca: ${m}` }));
  f.tipo.forEach(t => chips.push({ key: "tipo", value: t, label: `Tipo: ${t}` }));
  f.entalle.forEach(e => chips.push({ key: "entalle", value: e, label: `Entalle: ${e}` }));
  f.tela.forEach(t => chips.push({ key: "tela", value: t, label: `Tela: ${t}` }));
  if (f.es_lq) chips.push({ key: "es_lq", value: f.es_lq, label: `LQ: ${f.es_lq === "si" ? "Si" : "No"}` });
  if (f.es_negro) chips.push({ key: "es_negro", value: f.es_negro, label: `Negro: ${f.es_negro === "si" ? "Si" : "No"}` });

  if (!chips.length) return null;

  return (
    <div className="bg-slate-800 px-3 py-1 flex items-center gap-1.5 flex-wrap shrink-0" data-testid="filter-chips">
      {chips.map((c, i) => (
        <span key={`${c.key}-${c.value}-${i}`}
          className="inline-flex items-center gap-0.5 bg-amber-500/90 text-black rounded px-1.5 py-0.5 text-[9px] font-semibold">
          {c.label}
          <button className="hover:bg-amber-600 rounded-full p-0 ml-0.5" onClick={() => onToggle(c.key, c.value)}>
            <X size={9} />
          </button>
        </span>
      ))}
      <button className="text-[9px] text-red-400 hover:text-red-300 ml-1 underline" onClick={onClear}>
        Limpiar todo
      </button>
    </div>
  );
}

/* ── Store panel with cross-filter ── */
function StorePanel({ title, data, tallas, isTotal, f, onToggle }) {
  const selColors = f.color;
  const selTallas = f.talla;

  if (!data || !data.colores || data.colores.length === 0) {
    return (
      <div className="flex flex-col h-full rounded overflow-hidden border border-slate-700/30">
        <div className={`px-2 py-1.5 text-[11px] font-bold text-white text-center ${isTotal ? "bg-amber-700" : "bg-slate-800"}`}>{title}</div>
        <div className="flex-1 flex items-center justify-center text-[10px] text-slate-400 bg-white">sin datos</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full rounded overflow-hidden border border-slate-200 shadow-sm">
      <div className={`px-2 py-1.5 text-[11px] font-bold text-white text-center shrink-0 ${isTotal ? "bg-amber-700" : "bg-slate-800"}`}>{title}</div>
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full text-[10px] border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-700">
              <th className="text-left text-white font-semibold px-1.5 py-1 sticky left-0 bg-slate-700 z-20 min-w-[70px]">color</th>
              {tallas.map(t => {
                const sel = selTallas.includes(t);
                return (
                  <th key={t}
                    className={`text-center font-semibold px-1 py-1 min-w-[28px] cursor-pointer select-none transition-colors ${sel ? "bg-amber-500 text-black" : "text-white hover:bg-slate-600"}`}
                    onClick={() => onToggle("talla", t)}
                    data-testid={`th-talla-${t}`}
                  >{t}</th>
                );
              })}
              <th className="text-center text-white font-bold px-1 py-1 bg-slate-900 min-w-[36px]">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.colores.map((c, i) => {
              const selC = selColors.includes(c);
              return (
                <tr key={c} className={selC ? "bg-blue-100" : (i % 2 === 0 ? "" : "bg-slate-50/50")}>
                  <td
                    className={`px-1.5 py-0.5 font-medium sticky left-0 z-10 border-r cursor-pointer select-none transition-colors truncate max-w-[90px] ${selC ? "bg-blue-100 text-blue-800 border-l-2 border-blue-500 border-r-blue-200" : "text-slate-800 bg-inherit border-slate-100 hover:text-blue-700"}`}
                    onClick={() => onToggle("color", c)}
                    data-testid={`color-${c}`}
                  >{c}</td>
                  {tallas.map(t => {
                    const v = data.matrix[c]?.[t] || 0;
                    const selT = selTallas.includes(t);
                    const cellHl = (selC && selT) ? "bg-amber-200" : selC ? "bg-blue-50" : selT ? "bg-amber-50" : "";
                    return (
                      <td key={t}
                        className={`text-center px-0.5 py-0.5 cursor-pointer select-none transition-colors ${cellHl} ${v > 0 ? "text-slate-800 hover:bg-amber-100" : "text-slate-200"}`}
                        onClick={() => { if (v > 0) { onToggle("color", c); onToggle("talla", t); } }}
                      >{v > 0 ? Math.round(v) : "-"}</td>
                    );
                  })}
                  <td className="text-center px-0.5 py-0.5 font-bold bg-slate-100/60 border-l border-slate-200">{data.totals.byColor[c] || 0}</td>
                </tr>
              );
            })}
            <tr className="bg-amber-100 border-t-2 border-amber-300 font-bold sticky bottom-0">
              <td className="px-1.5 py-1 text-amber-900 sticky left-0 bg-amber-100 z-10 border-r border-amber-200">Total</td>
              {tallas.map(t => (
                <td key={t} className="text-center px-0.5 py-1 text-amber-900">{data.totals.bySize[t] ? Math.round(data.totals.bySize[t]) : "-"}</td>
              ))}
              <td className="text-center px-0.5 py-1 text-amber-900 bg-amber-200 border-l border-amber-300 text-xs">{data.totals.grandTotal}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── CSV helper ── */
function downloadCSV(rows, filename) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const lines = [cols.join(","), ...rows.map(r => cols.map(c => { const v = r[c]; return typeof v === "string" && v.includes(",") ? `"${v}"` : (v ?? ""); }).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN DASHBOARD
   ══════════════════════════════════════════════════════════════════════════════ */
export default function StockDashboard() {
  const [filterOpts, setFilterOpts] = useState({});
  const [f, setF] = useState({ ...DEFAULT_F });
  const sf = (k, v) => setF(prev => ({ ...prev, [k]: v }));
  const toggle = useCallback((key, value) => setF(prev => toggleValue(prev, key, value)), []);

  const [panels, setPanels] = useState(null);
  const [modeloTalla, setModeloTalla] = useState(null);
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDetalle, setShowDetalle] = useState(false);
  const [detalle, setDetalle] = useState({ items: [], total: 0 });
  const [detallePage, setDetallePage] = useState(1);
  const [detalleLoading, setDetalleLoading] = useState(false);
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
    api.get("/stock-dashboard/filters").then(r => setFilterOpts(r.data || {})).catch(() => {});
  }, []);

  const fetchAll = useCallback(async () => {
    const p = buildParams();
    setLoading(true);
    try {
      const [pR, mtR] = await Promise.all([
        api.get("/stock-dashboard/panels", { params: p }),
        api.get("/stock-dashboard/modelo-talla", { params: { ...p, limit: 50 } })
      ]);
      setPanels(pR.data.stores || {});
      setKpis(pR.data.kpis || null);
      setModeloTalla(mtR.data);
    } catch { toast.error("Error cargando dashboard"); }
    finally { setLoading(false); }
  }, [buildParams]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchAll, 300);
    return () => clearTimeout(debounceRef.current);
  }, [f]); // eslint-disable-line

  const loadDetalle = async (pg) => {
    setDetalleLoading(true);
    try {
      const r = await api.get("/stock-dashboard/detalle", { params: { ...buildParams(), page: pg, limit: 50 } });
      setDetalle({ items: r.data.items || [], total: r.data.total || 0 });
      setDetallePage(pg);
    } catch {} finally { setDetalleLoading(false); }
  };

  const toggleDetalle = () => {
    const next = !showDetalle;
    setShowDetalle(next);
    if (next) loadDetalle(1);
  };

  const clearAll = () => setF({ ...DEFAULT_F });
  const hasFilters = f.tienda.length || f.marca.length || f.tipo.length || f.entalle.length || f.tela.length || f.talla.length || f.color.length || f.modelo || f.es_lq || f.es_negro;

  // Tallas from panels
  let storeTallas = [];
  if (panels) {
    const allT = new Set();
    Object.values(panels).forEach(p => { if (p.totals?.bySize) Object.keys(p.totals.bySize).forEach(t => allT.add(t)); });
    const sk = (t) => { const m = { XXS: 1, XS: 2, S: 3, M: 4, L: 5, XL: 6, XXL: 7, XXXL: 8 }; if (m[t]) return [1, m[t]]; const n = parseInt(t); return isNaN(n) ? [2, t] : [0, n]; };
    storeTallas = [...allT].sort((a, b) => { const [ga, va] = sk(a); const [gb, vb] = sk(b); return ga !== gb ? ga - gb : (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))); });
  }
  const panelTallas = modeloTalla?.tallas || [];
  const now = new Date().toLocaleString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const detallePages = Math.ceil(detalle.total / 50);

  return (
    <div data-testid="stock-dashboard-page" className="h-screen flex flex-col bg-slate-100 overflow-hidden">
      {/* ── DARK FILTER BAR ── */}
      <div className="bg-slate-900 px-3 py-2 flex items-center gap-2 flex-wrap shrink-0" data-testid="filter-bar">
        <div className="flex items-center gap-1.5 mr-1">
          <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">Actualizado</span>
          <span className="text-[10px] text-white/60">{now}</span>
        </div>
        <div className="w-px h-5 bg-slate-700" />

        <SlicerFilter label="Tienda" options={filterOpts.tienda_canonicas || []} selected={f.tienda} onChange={v => sf("tienda", v)} />
        <SlicerFilter label="Marca" options={filterOpts.marcas || []} selected={f.marca} onChange={v => sf("marca", v)} />
        <SlicerFilter label="Tipo" options={filterOpts.tipos || []} selected={f.tipo} onChange={v => sf("tipo", v)} />
        <SlicerFilter label="Entalle" options={filterOpts.entalles || []} selected={f.entalle} onChange={v => sf("entalle", v)} />
        <SlicerFilter label="Tela" options={filterOpts.telas || []} selected={f.tela} onChange={v => sf("tela", v)} />
        <div className="relative">
          <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400" size={10} />
          <input
            className={`h-6 w-[100px] text-[10px] rounded pl-5 pr-1 border-0 outline-none placeholder:text-slate-500 transition-colors ${f.modelo ? "bg-amber-500 text-black font-semibold focus:ring-1 focus:ring-amber-300" : "bg-slate-700 text-white focus:ring-1 focus:ring-amber-500"}`}
            placeholder="Modelo..."
            value={f.modelo}
            onChange={e => sf("modelo", e.target.value)}
            data-testid="filter-modelo"
          />
        </div>
        <SlicerFilter label="Talla" options={filterOpts.tallas || []} selected={f.talla} onChange={v => sf("talla", v)} />
        <SlicerFilter label="Color" options={filterOpts.colores || []} selected={f.color} onChange={v => sf("color", v)} />
        <div className="w-px h-5 bg-slate-700" />
        <ToggleFilter label="Es LQ" value={f.es_lq} onChange={v => sf("es_lq", v)} />
        <ToggleFilter label="Por Arreglar" value="" onChange={() => {}} disabled />
        <ToggleFilter label="Es Negro" value={f.es_negro} onChange={v => sf("es_negro", v)} />

        {kpis && (
          <div className="ml-auto flex items-center gap-3 text-[10px]">
            <span className="text-slate-400">Stock: <b className="text-white">{Number(kpis.total_stock).toLocaleString("es-PE")}</b></span>
            <span className="text-slate-400">Modelos: <b className="text-white">{kpis.modelos}</b></span>
            <span className="text-slate-400">Variantes: <b className="text-white">{kpis.variantes}</b></span>
          </div>
        )}
      </div>

      {/* ── ACTIVE FILTER CHIPS ── */}
      <FilterChips f={f} onToggle={toggle} onClear={clearAll} />

      {/* ── MAIN GRID ── */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
      ) : (
        <div className="flex-1 grid grid-cols-[minmax(280px,1.2fr)_3fr_minmax(220px,1fr)] gap-1.5 p-1.5 overflow-hidden min-h-0">
          {/* LEFT: Modelo x Talla (with cross-filter) */}
          <div className="flex flex-col rounded overflow-hidden border border-slate-200 shadow-sm bg-white min-h-0">
            <div className="px-2 py-1.5 bg-slate-800 text-white text-[11px] font-bold text-center shrink-0">
              Modelo x Talla
              {modeloTalla && <span className="text-[9px] text-slate-400 ml-1">({modeloTalla.total_modelos})</span>}
            </div>
            <div className="flex-1 overflow-auto min-h-0">
              {modeloTalla && modeloTalla.rows.length > 0 ? (
                <table className="w-full text-[10px] border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-700">
                      <th className="text-left text-white font-semibold px-1.5 py-1 sticky left-0 bg-slate-700 z-20 min-w-[100px]">modelo</th>
                      {panelTallas.map(t => {
                        const sel = f.talla.includes(t);
                        return (
                          <th key={t}
                            className={`text-center font-semibold px-0.5 py-1 min-w-[26px] cursor-pointer select-none transition-colors ${sel ? "bg-amber-500 text-black" : "text-white hover:bg-slate-600"}`}
                            onClick={() => toggle("talla", t)}
                            data-testid={`mt-th-talla-${t}`}
                          >{t}</th>
                        );
                      })}
                      <th className="text-center text-white font-bold px-1 py-1 bg-slate-900 min-w-[36px]">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modeloTalla.rows.map((r, i) => {
                      const selM = f.modelo === r.modelo;
                      return (
                        <tr key={r.modelo} className={selM ? "bg-amber-100" : (i % 2 === 0 ? "" : "bg-slate-50/50")}>
                          <td
                            className={`px-1.5 py-0.5 font-medium sticky left-0 z-10 border-r cursor-pointer select-none transition-colors truncate max-w-[120px] ${selM ? "bg-amber-100 text-amber-900 border-l-2 border-amber-500 border-r-amber-200 font-bold" : "text-slate-800 bg-inherit border-slate-100 hover:text-amber-700 hover:underline"}`}
                            onClick={() => toggle("modelo", r.modelo)}
                            data-testid={`modelo-${r.modelo}`}
                          >{r.modelo}</td>
                          {panelTallas.map(t => {
                            const v = r.cells[t] || 0;
                            const selT = f.talla.includes(t);
                            const hl = (selM && selT) ? "bg-amber-200" : selM ? "bg-amber-50" : selT ? "bg-amber-50/50" : "";
                            return <td key={t} className={`text-center px-0 py-0.5 ${hl} ${v > 0 ? "text-slate-800" : "text-slate-200"}`}>{v > 0 ? Math.round(v) : "-"}</td>;
                          })}
                          <td className="text-center px-0.5 py-0.5 font-bold bg-slate-100/60 border-l border-slate-200">{r.total}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-amber-100 border-t-2 border-amber-300 font-bold sticky bottom-0">
                      <td className="px-1.5 py-1 text-amber-900 sticky left-0 bg-amber-100 z-10 border-r border-amber-200">Total</td>
                      {panelTallas.map(t => (
                        <td key={t} className="text-center px-0 py-1 text-amber-900">{modeloTalla.totals_by_talla[t] || "-"}</td>
                      ))}
                      <td className="text-center px-0.5 py-1 text-amber-900 bg-amber-200 border-l border-amber-300 text-xs font-bold">{modeloTalla.grand_total}</td>
                    </tr>
                  </tbody>
                </table>
              ) : <div className="flex-1 flex items-center justify-center text-slate-400 text-[10px] py-8">Sin datos</div>}
            </div>
          </div>

          {/* CENTER: 2x3 grid of store panels */}
          <div className="grid grid-cols-3 grid-rows-2 gap-1.5 min-h-0 overflow-hidden">
            {STORE_ORDER_CENTER.map(name => (
              <div key={name} className="min-h-0 overflow-hidden">
                <StorePanel title={name} data={panels?.[name]} tallas={storeTallas} isTotal={name === "TOTAL"} f={f} onToggle={toggle} />
              </div>
            ))}
          </div>

          {/* RIGHT: ALMACEN */}
          <div className="min-h-0 overflow-hidden">
            <StorePanel title="ALMACEN" data={panels?.["ALMACEN"]} tallas={storeTallas} f={f} onToggle={toggle} />
          </div>
        </div>
      )}

      {/* ── DETAIL TABLE ── */}
      <div className="shrink-0 border-t border-slate-300 bg-white">
        <button className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-slate-50 transition-colors"
          onClick={toggleDetalle} data-testid="toggle-detalle">
          <span className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
            Detalle de Stock {detalle.total > 0 && <span className="text-[10px] text-slate-400 font-normal">({detalle.total})</span>}
          </span>
          <div className="flex items-center gap-2">
            {showDetalle && detalle.items.length > 0 && (
              <button className="flex items-center gap-0.5 text-[10px] text-slate-500 hover:text-slate-700 px-1"
                onClick={e => { e.stopPropagation(); downloadCSV(detalle.items, "stock_detalle.csv"); }}
                data-testid="export-csv-btn">
                <Download size={10} /> CSV
              </button>
            )}
            {showDetalle ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronUp size={14} className="text-slate-400" />}
          </div>
        </button>
        {showDetalle && (
          <div className="max-h-[250px] overflow-auto border-t border-slate-200">
            {detalleLoading ? (
              <div className="h-20 flex items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
            ) : (
              <>
                <table className="w-full text-[10px] border-collapse">
                  <thead className="sticky top-0 bg-slate-100 z-10">
                    <tr>
                      <th className="text-left px-2 py-1 font-semibold">Tienda</th>
                      <th className="text-left px-2 py-1 font-semibold">Modelo</th>
                      <th className="text-left px-2 py-1 font-semibold">Marca</th>
                      <th className="text-left px-2 py-1 font-semibold">Talla</th>
                      <th className="text-left px-2 py-1 font-semibold">Color</th>
                      <th className="text-left px-2 py-1 font-semibold font-mono">Barcode</th>
                      <th className="text-right px-2 py-1 font-semibold">Disp.</th>
                      <th className="text-center px-2 py-1 font-semibold">LQ</th>
                      <th className="text-center px-2 py-1 font-semibold">Negro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.items.length === 0 ? (
                      <tr><td colSpan={9} className="text-center py-4 text-slate-400">Sin datos</td></tr>
                    ) : detalle.items.map((r, i) => (
                      <tr key={i} className={i % 2 ? "bg-slate-50/50" : ""}>
                        <td className="px-2 py-0.5">{r.tienda}</td>
                        <td className="px-2 py-0.5 font-medium">{r.modelo}</td>
                        <td className="px-2 py-0.5 text-slate-500">{r.marca || "-"}</td>
                        <td className="px-2 py-0.5">{r.talla || "-"}</td>
                        <td className="px-2 py-0.5">{r.color || "-"}</td>
                        <td className="px-2 py-0.5 font-mono text-slate-400">{r.barcode || "-"}</td>
                        <td className="px-2 py-0.5 text-right font-mono font-medium">{Math.round(Number(r.available_qty))}</td>
                        <td className="px-2 py-0.5 text-center">{r.es_lq ? "Si" : ""}</td>
                        <td className="px-2 py-0.5 text-center">{r.es_negro ? "Si" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {detallePages > 1 && (
                  <div className="flex items-center justify-between px-3 py-1 border-t text-[10px] text-slate-500">
                    <span>Pag {detallePage} de {detallePages}</span>
                    <div className="flex gap-1">
                      <button className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40" disabled={detallePage <= 1} onClick={() => loadDetalle(detallePage - 1)}>Ant</button>
                      <button className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40" disabled={detallePage >= detallePages} onClick={() => loadDetalle(detallePage + 1)}>Sig</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
