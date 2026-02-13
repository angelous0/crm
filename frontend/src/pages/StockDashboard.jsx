import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import api from "@/lib/api";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Search, X, ChevronDown, ChevronUp, Download, RotateCcw, RefreshCw, Package } from "lucide-react";
import ReposicionTab from "./ReposicionTab";

/* ═══ CONSTANTS ═══ */
const STORE_ORDER = ["GRAU 238 / GRAU 55", "GAMARRA 209", "GM218", "BOOSH", "GAMARRA 207", "TOTAL"];
const STORE_REAL = ["GRAU 238 / GRAU 55", "GAMARRA 209", "GM218", "BOOSH", "GAMARRA 207", "ALMACEN"];
const TALLA_RANGE = ["16","18","20","22","24","26","28","30","32","34","36","38","40","S","M","L","XL"];
const TALLA_ORDER = { XXS: 1, XS: 2, S: 3, M: 4, L: 5, XL: 6, XXL: 7, XXXL: 8 };
const DEFAULT_F = { tienda: [], marca: [], tipo: [], entalle: [], tela: [], talla: [], color: [], modelo: "", lq: "", negro: "" };
const DEFAULT_SEL = { modelos: new Set(), tallas: new Set(), colores: new Set(), tiendas: new Set() };

function sortTalla(a, b) {
  const ga = TALLA_ORDER[a] ? 1 : (isNaN(parseInt(a)) ? 2 : 0);
  const gb = TALLA_ORDER[b] ? 1 : (isNaN(parseInt(b)) ? 2 : 0);
  if (ga !== gb) return ga - gb;
  if (ga === 0) return parseInt(a) - parseInt(b);
  if (ga === 1) return (TALLA_ORDER[a] || 99) - (TALLA_ORDER[b] || 99);
  return String(a).localeCompare(String(b));
}

function hasSel(sel) {
  return sel.modelos.size > 0 || sel.tallas.size > 0 || sel.colores.size > 0 || sel.tiendas.size > 0;
}

function matchesSel(sel, m, z, c, t) {
  if (sel.modelos.size && !sel.modelos.has(m)) return false;
  if (sel.tallas.size && !sel.tallas.has(z)) return false;
  if (sel.colores.size && !sel.colores.has(c)) return false;
  if (sel.tiendas.size && !sel.tiendas.has(t)) return false;
  return true;
}

/* ═══ SLICER WITH COUNTS ═══ */
function SlicerFilter({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const items = options || [];
  const filtered = q ? items.filter(o => (o.value || "").toLowerCase().includes(q.toLowerCase())) : items;
  const vals = items.map(o => o.value);
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
      <PopoverContent className="w-64 p-0 shadow-xl" align="start">
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
            {filtered.map(o => {
              const isZero = o.count_modelos === 0 && o.sum_stock === 0;
              return (
                <label key={o.value} className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer hover:bg-slate-50 text-[10px] ${isZero ? "opacity-40" : ""}`}>
                  <Checkbox checked={selected.includes(o.value)} onCheckedChange={() => toggle(o.value)} className="h-3 w-3" />
                  <span className="truncate flex-1">{o.value}</span>
                  <span className="text-[8px] text-slate-400 whitespace-nowrap tabular-nums ml-1">{o.count_modelos}m {o.count_variantes}v</span>
                </label>
              );
            })}
            {!filtered.length && <p className="text-[10px] text-slate-400 text-center py-3">Sin resultados</p>}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

/* ═══ TOGGLE FILTER ═══ */
function ToggleFilter({ label, value, onChange, disabled }) {
  const labels = ["Todas", "Si", "No"];
  const vals = ["", "yes", "no"];
  const idx = vals.indexOf(value || "");
  const next = () => onChange(vals[(idx + 1) % 3]);
  return (
    <button className={`px-2 py-1 rounded text-[10px] transition-colors ${disabled ? "bg-slate-800 text-slate-600 cursor-not-allowed" : value === "yes" ? "bg-emerald-600 text-white" : value === "no" ? "bg-red-600 text-white" : "bg-slate-700 text-white/90 hover:bg-slate-600"}`}
      onClick={disabled ? undefined : next} data-testid={`toggle-${label.toLowerCase().replace(/\s/g, '-')}`}>
      {label}: {labels[idx]}
    </button>
  );
}

/* ═══ BAR FILTER CHIPS ═══ */
function FilterChips({ f, onRemove, onClear }) {
  const chips = [];
  ["tienda","marca","tipo","entalle","tela","talla","color"].forEach(k => {
    f[k].forEach(v => chips.push({ key: k, value: v, label: `${k.charAt(0).toUpperCase()+k.slice(1)}: ${v}` }));
  });
  if (f.modelo) chips.push({ key: "modelo", value: f.modelo, label: `Modelo: ${f.modelo}` });
  if (f.lq) chips.push({ key: "lq", value: f.lq, label: `LQ: ${f.lq === "yes" ? "Si" : "No"}` });
  if (f.negro) chips.push({ key: "negro", value: f.negro, label: `Negro: ${f.negro === "yes" ? "Si" : "No"}` });
  if (!chips.length) return null;
  return (
    <div className="bg-slate-800 px-3 py-1 flex items-center gap-1.5 flex-wrap shrink-0" data-testid="filter-chips">
      {chips.map((c, i) => (
        <span key={`${c.key}-${c.value}-${i}`} className="inline-flex items-center gap-0.5 bg-amber-500/90 text-black rounded px-1.5 py-0.5 text-[9px] font-semibold">
          {c.label}
          <button className="hover:bg-amber-600 rounded-full p-0 ml-0.5" onClick={() => onRemove(c.key, c.value)}><X size={9} /></button>
        </span>
      ))}
      <button className="text-[9px] text-red-400 hover:text-red-300 ml-1 underline" onClick={onClear} data-testid="clear-all-filters">Limpiar todo</button>
    </div>
  );
}

/* ═══ SELECTION BAR (MULTI-SELECT) ═══ */
function SelectionBar({ sel, onReset }) {
  const active = hasSel(sel);
  const axes = [
    { key: "modelos", label: "Modelo", fem: false },
    { key: "tallas", label: "Talla", fem: true },
    { key: "colores", label: "Color", fem: false },
    { key: "tiendas", label: "Tienda", fem: true },
  ];
  const chips = axes.filter(a => sel[a.key].size > 0).map(a => {
    const n = sel[a.key].size;
    const vals = [...sel[a.key]];
    const text = n === 1 ? `${a.label}: ${vals[0]}` : `${a.label}: ${n} ${a.fem ? "seleccionadas" : "seleccionados"}`;
    return { ...a, n, text };
  });

  return (
    <div className={`px-3 py-1 flex items-center gap-1.5 flex-wrap shrink-0 transition-colors ${active ? "bg-blue-900/80" : "bg-slate-800/60"}`} data-testid="selection-chips">
      <button className={`flex items-center gap-1 rounded px-2.5 py-1 text-[10px] font-bold shadow transition-colors mr-1 ${active ? "bg-red-500 hover:bg-red-400 text-white" : "bg-slate-700 text-slate-500 cursor-default"}`}
        onClick={() => active && onReset("all")} disabled={!active} data-testid="reset-selection">
        <RotateCcw size={11} /> Reset selección
      </button>
      {chips.map(c => (
        <span key={c.key} className="inline-flex items-center gap-0.5 bg-blue-500/90 text-white rounded px-1.5 py-0.5 text-[9px] font-semibold">
          {c.text}
          <button className="hover:bg-blue-600 rounded-full p-0 ml-0.5" onClick={() => onReset(c.key)} data-testid={`clear-sel-${c.key}`}><X size={9} /></button>
        </span>
      ))}
      <span className="text-[9px] text-slate-400 ml-auto">Ctrl/Cmd+Click: multi · Shift+Click: rango tallas</span>
    </div>
  );
}

/* ═══ STORE PANEL (ATENUATED) ═══ */
function StorePanel({ title, fullData, tallas, isTotal, sel, onSelect, active }) {
  const noData = !fullData || !fullData.colores.length;
  const hasAnySel = hasSel(sel);
  const tiendaActive = active;

  if (noData) {
    return (
      <div className="flex flex-col h-full rounded overflow-hidden border border-slate-700/30">
        <div className={`px-2 py-1.5 text-[11px] font-bold text-white text-center ${isTotal ? "bg-amber-700" : "bg-slate-800"}`}>{title}</div>
        <div className="flex-1 flex items-center justify-center text-[10px] text-slate-400 bg-white">Sin datos</div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full rounded overflow-hidden border shadow-sm transition-opacity duration-150 ${hasAnySel && !tiendaActive ? "border-slate-300 opacity-25" : "border-slate-200"}`}>
      <div className={`px-2 py-1.5 text-[11px] font-bold text-white text-center shrink-0 cursor-pointer select-none transition-colors ${
        sel.tiendas.has(title) ? "bg-blue-600 ring-2 ring-blue-400" : isTotal ? "bg-amber-700 hover:bg-amber-600" : "bg-slate-800 hover:bg-slate-700"
      }`} onClick={e => !isTotal && onSelect("tiendas", title, e)} data-testid={`panel-header-${title}`}>{title}</div>
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full text-[10px] border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-700">
              <th className="text-left text-white font-semibold px-1.5 py-1 sticky left-0 bg-slate-700 z-20 min-w-[70px]">color</th>
              {tallas.map(t => {
                const tSel = sel.tallas.has(t);
                return (
                  <th key={t} className={`text-center font-semibold px-1 py-1 min-w-[28px] cursor-pointer select-none transition-colors ${tSel ? "bg-amber-500 text-black ring-1 ring-amber-400" : "text-white hover:bg-slate-600"}`}
                    onClick={e => onSelect("tallas", t, e)} data-testid={`th-talla-${t}`}>{t}</th>
                );
              })}
              <th className="text-center text-white font-bold px-1 py-1 bg-slate-900 min-w-[36px]">Total</th>
            </tr>
          </thead>
          <tbody>
            {fullData.colores.map((c, i) => {
              const cSel = sel.colores.has(c);
              const cActive = !hasAnySel || (!sel.colores.size || cSel);
              const rowDim = hasAnySel && !cActive;
              return (
                <tr key={c} className={`transition-opacity duration-100 ${rowDim ? "opacity-[0.2]" : ""} ${cSel ? "bg-blue-50" : i % 2 === 0 ? "" : "bg-slate-50/50"}`}>
                  <td className={`px-1.5 py-0.5 font-medium sticky left-0 z-10 border-r cursor-pointer select-none truncate max-w-[90px] transition-colors ${cSel ? "bg-blue-100 text-blue-800 border-l-2 border-blue-500 font-bold" : "bg-inherit border-slate-100 hover:text-blue-700"}`}
                    onClick={e => onSelect("colores", c, e)} data-testid={`color-${c}`}>{c}</td>
                  {tallas.map(t => {
                    const v = fullData.matrix[c]?.[t] || 0;
                    const tSel = sel.tallas.has(t);
                    const cellMatch = (!sel.colores.size || cSel) && (!sel.tallas.size || tSel);
                    const cellDim = hasAnySel && !cellMatch;
                    return (
                      <td key={t} className={`text-center px-0.5 py-0.5 cursor-pointer select-none transition-all ${
                        cellDim ? "text-slate-300" :
                        (cSel && tSel) ? "bg-amber-200 text-black font-bold" :
                        cSel ? "bg-blue-50" : tSel ? "bg-amber-50" :
                        v > 0 ? "text-slate-800 hover:bg-amber-100" : "text-slate-200"
                      }`}
                        onClick={e => { if (v > 0) { onSelect("colores", c, e); onSelect("tallas", t, e); } }}>
                        {v > 0 ? Math.round(v) : "-"}
                      </td>
                    );
                  })}
                  <td className="text-center px-0.5 py-0.5 font-bold bg-slate-100/60 border-l border-slate-200">{fullData.byColor[c] || 0}</td>
                </tr>
              );
            })}
            <tr className="bg-amber-100 border-t-2 border-amber-300 font-bold sticky bottom-0">
              <td className="px-1.5 py-1 text-amber-900 sticky left-0 bg-amber-100 z-10 border-r border-amber-200">Total</td>
              {tallas.map(t => (
                <td key={t} className="text-center px-0.5 py-1 text-amber-900">{fullData.bySize[t] ? Math.round(fullData.bySize[t]) : "-"}</td>
              ))}
              <td className="text-center px-0.5 py-1 text-amber-900 bg-amber-200 border-l border-amber-300 text-xs">{fullData.grandTotal}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══ CSV HELPER ═══ */
function downloadCSV(rows, filename) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const lines = [cols.join(","), ...rows.map(r => cols.map(c => { const v = r[c]; return typeof v === "string" && v.includes(",") ? `"${v}"` : (v ?? ""); }).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

/* ═══ BUILD DASHBOARD FROM CUBE ═══ */
function buildDashboard(cube) {
  const tallasSet = new Set();
  cube.forEach(r => tallasSet.add(r.z));
  const tallas = [...tallasSet].sort(sortTalla);

  const mMap = {};
  cube.forEach(r => {
    if (!mMap[r.m]) mMap[r.m] = {};
    mMap[r.m][r.z] = (mMap[r.m][r.z] || 0) + r.q;
  });
  const modeloRows = Object.entries(mMap).map(([m, cells]) => ({
    modelo: m, cells, total: Math.round(Object.values(cells).reduce((a, b) => a + b, 0))
  })).sort((a, b) => b.total - a.total);
  const leftTotals = {};
  let leftGrand = 0;
  modeloRows.forEach(r => { leftGrand += r.total; tallas.forEach(t => { leftTotals[t] = (leftTotals[t] || 0) + (r.cells[t] || 0); }); });

  const buildPanel = (rows) => {
    const cMap = {};
    rows.forEach(r => {
      if (!cMap[r.c]) cMap[r.c] = {};
      cMap[r.c][r.z] = (cMap[r.c][r.z] || 0) + r.q;
    });
    const colores = Object.keys(cMap).sort();
    const byColor = {}, bySize = {};
    let gt = 0;
    colores.forEach(c => {
      let rt = 0;
      tallas.forEach(t => { const v = cMap[c]?.[t] || 0; bySize[t] = (bySize[t] || 0) + v; rt += v; });
      byColor[c] = Math.round(rt); gt += rt;
    });
    return { colores, matrix: cMap, byColor, bySize: Object.fromEntries(Object.entries(bySize).map(([k, v]) => [k, Math.round(v)])), grandTotal: Math.round(gt) };
  };

  const stores = {};
  STORE_REAL.forEach(s => { stores[s] = buildPanel(cube.filter(r => r.t === s)); });
  stores["TOTAL"] = buildPanel(cube.filter(r => STORE_REAL.includes(r.t)));

  return { tallas, modeloRows, leftTotals, leftGrand: Math.round(leftGrand), stores };
}

function computeSelKpis(cube, sel) {
  if (!hasSel(sel)) return null;
  let total = 0;
  const mSet = new Set(), tSet = new Set();
  cube.forEach(r => {
    if (!matchesSel(sel, r.m, r.z, r.c, r.t)) return;
    total += r.q; mSet.add(r.m); tSet.add(r.t);
  });
  return { total_stock: Math.round(total), modelos: mSet.size, tiendas: tSet.size };
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN DASHBOARD
   ══════════════════════════════════════════════════════════════════════════════ */
export default function StockDashboard() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [filterOpts, setFilterOpts] = useState({});
  const [f, setF] = useState({ ...DEFAULT_F });
  const sf = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  const [cube, setCube] = useState([]);
  const [backendKpis, setBackendKpis] = useState(null);
  const [sel, setSel] = useState({ modelos: new Set(), tallas: new Set(), colores: new Set(), tiendas: new Set() });
  const [loading, setLoading] = useState(true);
  const [showDetalle, setShowDetalle] = useState(false);
  const [detalle, setDetalle] = useState({ items: [], total: 0 });
  const [detallePage, setDetallePage] = useState(1);
  const [detalleLoading, setDetalleLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const pollRef = useRef(null);
  const debounceRef = useRef(null);
  const optsVersionRef = useRef(0);

  /* ── Multi-select handler ── */
  const handleSelect = useCallback((key, value, event) => {
    setSel(prev => {
      const s = new Set(prev[key]);
      const isCtrl = event?.ctrlKey || event?.metaKey;
      const isShift = event?.shiftKey;

      if (isShift && key === "tallas" && prev.tallas.size > 0) {
        const last = [...prev.tallas].pop();
        const i1 = TALLA_RANGE.indexOf(last);
        const i2 = TALLA_RANGE.indexOf(value);
        if (i1 >= 0 && i2 >= 0) {
          const [lo, hi] = i1 < i2 ? [i1, i2] : [i2, i1];
          for (let i = lo; i <= hi; i++) s.add(TALLA_RANGE[i]);
          return { ...prev, [key]: s };
        }
      }

      if (isCtrl) {
        if (s.has(value)) s.delete(value); else s.add(value);
      } else {
        if (s.size === 1 && s.has(value)) { s.clear(); } else { s.clear(); s.add(value); }
      }
      return { ...prev, [key]: s };
    });
  }, []);

  const resetSel = useCallback((key, value) => {
    if (key === "all") {
      setSel({ modelos: new Set(), tallas: new Set(), colores: new Set(), tiendas: new Set() });
    } else if (value) {
      setSel(prev => { const s = new Set(prev[key]); s.delete(value); return { ...prev, [key]: s }; });
    } else {
      setSel(prev => ({ ...prev, [key]: new Set() }));
    }
  }, []);

  const hasAnySel = hasSel(sel);

  const removeFilter = useCallback((key, value) => {
    setF(prev => {
      const cur = prev[key];
      if (Array.isArray(cur)) return { ...prev, [key]: cur.filter(v => v !== value) };
      return { ...prev, [key]: "" };
    });
  }, []);
  const clearAll = () => { setF({ ...DEFAULT_F }); setSel({ modelos: new Set(), tallas: new Set(), colores: new Set(), tiendas: new Set() }); };

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
    if (f.lq) p.lq = f.lq;
    if (f.negro) p.negro = f.negro;
    return p;
  }, [f]);

  /* ── Fetch cube ── */
  const fetchCube = useCallback(async () => {
    const p = buildParams();
    setLoading(true);
    try {
      const r = await api.get("/stock-dashboard/cube", { params: p });
      setCube(r.data.cube || []);
      setBackendKpis(r.data.kpis || null);
      setSel({ modelos: new Set(), tallas: new Set(), colores: new Set(), tiendas: new Set() });
    } catch { toast.error("Error cargando dashboard"); }
    finally { setLoading(false); }
  }, [buildParams]);

  /* ── Fetch cascade filter options ── */
  const fetchFilterOpts = useCallback(async () => {
    const p = buildParams();
    const ver = ++optsVersionRef.current;
    try {
      const r = await api.get("/stock-dashboard/filter-options-v2", { params: p });
      if (ver !== optsVersionRef.current) return;
      const opts = r.data || {};
      setFilterOpts(opts);
      const MAP = { tienda: 'tienda_canonicas', marca: 'marcas', tipo: 'tipos', entalle: 'entalles', tela: 'telas', talla: 'tallas', color: 'colores' };
      setF(prev => {
        let changed = false;
        const next = { ...prev };
        const cleaned = [];
        for (const [fk, ok] of Object.entries(MAP)) {
          if (!next[fk].length || !opts[ok]) continue;
          const valid = new Set((opts[ok] || []).map(o => o.value));
          const inv = next[fk].filter(v => !valid.has(v));
          if (inv.length) {
            next[fk] = next[fk].filter(v => valid.has(v));
            cleaned.push(fk.charAt(0).toUpperCase() + fk.slice(1));
            changed = true;
          }
        }
        if (changed) setTimeout(() => cleaned.forEach(m => toast.info(`${m} limpiado: sin datos con selección actual`)), 0);
        return changed ? next : prev;
      });
    } catch {}
  }, [buildParams]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { fetchCube(); fetchFilterOpts(); }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [f]); // eslint-disable-line

  /* ── Computed dashboard (full, no selection) ── */
  const dash = useMemo(() => buildDashboard(cube), [cube]);
  const selKpis = useMemo(() => computeSelKpis(cube, sel), [cube, sel]);

  /* ── Detalle ── */
  const loadDetalle = async (pg) => {
    setDetalleLoading(true);
    try {
      const p = { ...buildParams(), page: pg, limit: 50 };
      sel.modelos.forEach(v => { p.sel_modelo = v; }); // last wins
      sel.tallas.forEach(v => { p.sel_talla = v; });
      sel.colores.forEach(v => { p.sel_color = v; });
      sel.tiendas.forEach(v => { p.sel_tienda = v; });
      const r = await api.get("/stock-dashboard/detail", { params: p });
      setDetalle({ items: r.data.items || [], total: r.data.total || 0 });
      setDetallePage(pg);
    } catch {} finally { setDetalleLoading(false); }
  };
  const toggleDetalle = () => { const next = !showDetalle; setShowDetalle(next); if (next) loadDetalle(1); };

  /* ── Sync ── */
  useEffect(() => {
    api.get("/odoo-sync/job-status", { params: { job_code: "STOCK_QUANTS" } })
      .then(r => { const ls = r.data?.job?.last_success_at; if (ls) setLastSync(new Date(ls)); if (r.data?.last_run?.status === "RUNNING") setSyncing(true); }).catch(() => {});
  }, []);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const startSync = async () => {
    if (syncing) return;
    setSyncing(true);
    toast.info("Actualizando stock...");
    try {
      const r = await api.post("/odoo-sync/run", { job_code: "STOCK_QUANTS" });
      if (!r.data.ok) { toast.error(r.data.error || "Error"); setSyncing(false); return; }
      pollRef.current = setInterval(async () => {
        try {
          const st = await api.get("/odoo-sync/job-status", { params: { job_code: "STOCK_QUANTS" } });
          const lr = st.data?.last_run;
          if (!lr || lr.status === "RUNNING") return;
          clearInterval(pollRef.current); pollRef.current = null; setSyncing(false);
          if (lr.status === "OK") { toast.success(`Stock actualizado (${lr.rows_upserted || 0} filas)`); setLastSync(new Date()); fetchCube(); }
          else toast.error(`Sync falló: ${lr.error_message || "Error"}`);
        } catch {}
      }, 3000);
    } catch (e) { setSyncing(false); toast.error(e?.response?.data?.detail || "Error"); }
  };

  const detallePages = Math.ceil(detalle.total / 50);

  return (
    <div data-testid="stock-dashboard-page" className="h-screen flex flex-col bg-slate-100 overflow-hidden">
      {/* ── DARK FILTER BAR ── */}
      <div className="bg-slate-900 px-3 py-2 flex items-center gap-2 flex-wrap shrink-0" data-testid="filter-bar">
        <div className="flex items-center gap-1.5 mr-1">
          <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">Actualizado</span>
          <span className="text-[10px] text-white/60">{new Date().toLocaleString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        <div className="w-px h-5 bg-slate-700" />
        <SlicerFilter label="Tienda" options={filterOpts.tienda_canonicas || []} selected={f.tienda} onChange={v => sf("tienda", v)} />
        <SlicerFilter label="Marca" options={filterOpts.marcas || []} selected={f.marca} onChange={v => sf("marca", v)} />
        <SlicerFilter label="Tipo" options={filterOpts.tipos || []} selected={f.tipo} onChange={v => sf("tipo", v)} />
        <SlicerFilter label="Entalle" options={filterOpts.entalles || []} selected={f.entalle} onChange={v => sf("entalle", v)} />
        <SlicerFilter label="Tela" options={filterOpts.telas || []} selected={f.tela} onChange={v => sf("tela", v)} />
        <div className="relative">
          <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400" size={10} />
          <input className={`h-6 w-[100px] text-[10px] rounded pl-5 pr-1 border-0 outline-none placeholder:text-slate-500 transition-colors ${f.modelo ? "bg-amber-500 text-black font-semibold" : "bg-slate-700 text-white"}`}
            placeholder="Modelo..." value={f.modelo} onChange={e => sf("modelo", e.target.value)} data-testid="filter-modelo" />
        </div>
        <SlicerFilter label="Talla" options={filterOpts.tallas || []} selected={f.talla} onChange={v => sf("talla", v)} />
        <SlicerFilter label="Color" options={filterOpts.colores || []} selected={f.color} onChange={v => sf("color", v)} />
        <div className="w-px h-5 bg-slate-700" />
        <ToggleFilter label="LQ" value={f.lq} onChange={v => sf("lq", v)} />
        <ToggleFilter label="Por Arreglar" value="" onChange={() => {}} disabled />
        <ToggleFilter label="Negro" value={f.negro} onChange={v => sf("negro", v)} />

        <div className="ml-auto flex items-center gap-3 text-[10px]">
          {lastSync && <span className="text-slate-500 text-[9px]" data-testid="last-sync-time">Sync: {lastSync.toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>}
          <button className={`flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-semibold transition-all ${syncing ? "bg-amber-600 text-white cursor-wait" : "bg-emerald-600 hover:bg-emerald-500 text-white"}`}
            onClick={startSync} disabled={syncing} data-testid="sync-stock-btn">
            <RefreshCw size={11} className={syncing ? "animate-spin" : ""} />{syncing ? "Sincronizando..." : "Actualizar stock"}
          </button>
          {backendKpis && (
            <>
              <span className="text-slate-400">Stock: <b className="text-white">{Number(selKpis ? selKpis.total_stock : backendKpis.total_stock).toLocaleString("es-PE")}</b></span>
              <span className="text-slate-400">Modelos: <b className="text-white">{selKpis ? selKpis.modelos : backendKpis.modelos}</b></span>
              <span className="text-slate-400">Variantes: <b className="text-white">{backendKpis.variantes}</b></span>
            </>
          )}
        </div>
      </div>

      <FilterChips f={f} onRemove={removeFilter} onClear={clearAll} />

      {/* ── TAB BAR ── */}
      <div className="bg-slate-800 px-3 flex items-center gap-0 shrink-0 border-b border-slate-700" data-testid="dashboard-tabs">
        <button className={`px-4 py-1.5 text-[10px] font-semibold transition-colors border-b-2 ${activeTab === "dashboard" ? "text-white border-amber-500" : "text-slate-400 border-transparent hover:text-white hover:border-slate-500"}`}
          onClick={() => setActiveTab("dashboard")} data-testid="tab-dashboard">
          Stock Dashboard
        </button>
        <button className={`px-4 py-1.5 text-[10px] font-semibold transition-colors border-b-2 flex items-center gap-1 ${activeTab === "reposicion" ? "text-white border-amber-500" : "text-slate-400 border-transparent hover:text-white hover:border-slate-500"}`}
          onClick={() => setActiveTab("reposicion")} data-testid="tab-reposicion">
          <Package size={10} /> Reposición
        </button>
      </div>

      {activeTab === "dashboard" ? (
      <>
      <SelectionBar sel={sel} onReset={resetSel} />

      {/* ── MAIN GRID ── */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
      ) : (
        <div className="flex-1 grid grid-cols-[minmax(280px,1.2fr)_3fr_minmax(220px,1fr)] gap-1.5 p-1.5 overflow-hidden min-h-0">
          {/* LEFT: Modelo x Talla */}
          <div className="flex flex-col rounded overflow-hidden border border-slate-200 shadow-sm bg-white min-h-0">
            <div className="px-2 py-1.5 bg-slate-800 text-white text-[11px] font-bold text-center shrink-0">
              Modelo x Talla <span className="text-[9px] text-slate-400 ml-1">({dash.modeloRows.length})</span>
            </div>
            <div className="flex-1 overflow-auto min-h-0">
              {dash.modeloRows.length > 0 ? (
                <table className="w-full text-[10px] border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-700">
                      <th className="text-left text-white font-semibold px-1.5 py-1 sticky left-0 bg-slate-700 z-20 min-w-[100px]">modelo</th>
                      {dash.tallas.map(t => {
                        const tSel = sel.tallas.has(t);
                        return (
                          <th key={t} className={`text-center font-semibold px-0.5 py-1 min-w-[26px] cursor-pointer select-none transition-colors ${tSel ? "bg-amber-500 text-black ring-1 ring-amber-400" : "text-white hover:bg-slate-600"}`}
                            onClick={e => handleSelect("tallas", t, e)} data-testid={`mt-th-talla-${t}`}>{t}</th>
                        );
                      })}
                      <th className="text-center text-white font-bold px-1 py-1 bg-slate-900 min-w-[36px]">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dash.modeloRows.map((r, i) => {
                      const mSel = sel.modelos.has(r.modelo);
                      const mActive = !hasAnySel || (!sel.modelos.size || mSel);
                      const rowDim = hasAnySel && !mActive;
                      return (
                        <tr key={r.modelo} className={`transition-opacity duration-100 ${rowDim ? "opacity-[0.2]" : ""} ${mSel ? "bg-amber-50" : i % 2 === 0 ? "" : "bg-slate-50/50"}`}>
                          <td className={`px-1.5 py-0.5 font-medium sticky left-0 z-10 border-r cursor-pointer select-none truncate max-w-[120px] transition-colors ${
                            mSel ? "bg-amber-100 text-amber-900 border-l-2 border-amber-500 font-bold" : "bg-inherit border-slate-100 hover:text-amber-700 hover:underline"}`}
                            onClick={e => handleSelect("modelos", r.modelo, e)} data-testid={`modelo-${r.modelo}`}>{r.modelo}</td>
                          {dash.tallas.map(t => {
                            const v = r.cells[t] || 0;
                            const tSel = sel.tallas.has(t);
                            const cellMatch = (!sel.modelos.size || mSel) && (!sel.tallas.size || tSel);
                            const cellDim = hasAnySel && !cellMatch;
                            return <td key={t} className={`text-center px-0 py-0.5 ${cellDim ? "text-slate-300" : (mSel && tSel) ? "bg-amber-200 text-black font-bold" : mSel ? "bg-amber-50" : tSel ? "bg-amber-50/50" : v > 0 ? "text-slate-800" : "text-slate-200"}`}>{v > 0 ? Math.round(v) : "-"}</td>;
                          })}
                          <td className="text-center px-0.5 py-0.5 font-bold bg-slate-100/60 border-l border-slate-200">{r.total}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-amber-100 border-t-2 border-amber-300 font-bold sticky bottom-0">
                      <td className="px-1.5 py-1 text-amber-900 sticky left-0 bg-amber-100 z-10 border-r border-amber-200">Total</td>
                      {dash.tallas.map(t => <td key={t} className="text-center px-0 py-1 text-amber-900">{dash.leftTotals[t] ? Math.round(dash.leftTotals[t]) : "-"}</td>)}
                      <td className="text-center px-0.5 py-1 text-amber-900 bg-amber-200 border-l border-amber-300 text-xs font-bold">{dash.leftGrand}</td>
                    </tr>
                  </tbody>
                </table>
              ) : <div className="flex-1 flex items-center justify-center text-slate-400 text-[10px] py-8">Sin datos</div>}
            </div>
          </div>

          {/* CENTER: 2x3 grid */}
          <div className="grid grid-cols-3 grid-rows-2 gap-1.5 min-h-0 overflow-hidden">
            {STORE_ORDER.map(name => (
              <div key={name} className="min-h-0 overflow-hidden">
                <StorePanel title={name} fullData={dash.stores[name]} tallas={dash.tallas}
                  isTotal={name === "TOTAL"} sel={sel} onSelect={handleSelect}
                  active={!sel.tiendas.size || sel.tiendas.has(name)} />
              </div>
            ))}
          </div>

          {/* RIGHT: ALMACEN */}
          <div className="min-h-0 overflow-hidden">
            <StorePanel title="ALMACEN" fullData={dash.stores["ALMACEN"]} tallas={dash.tallas}
              sel={sel} onSelect={handleSelect} active={!sel.tiendas.size || sel.tiendas.has("ALMACEN")} />
          </div>
        </div>
      )}

      {/* ── DETAIL TABLE ── */}
      <div className="shrink-0 border-t border-slate-300 bg-white">
        <button className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-slate-50" onClick={toggleDetalle} data-testid="toggle-detalle">
          <span className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
            Detalle de Stock {detalle.total > 0 && <span className="text-[10px] text-slate-400 font-normal">({detalle.total})</span>}
          </span>
          <div className="flex items-center gap-2">
            {showDetalle && detalle.items.length > 0 && (
              <button className="flex items-center gap-0.5 text-[10px] text-slate-500 hover:text-slate-700 px-1"
                onClick={e => { e.stopPropagation(); downloadCSV(detalle.items, "stock_detalle.csv"); }} data-testid="export-csv-btn">
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
                      {["Tienda","Modelo","Raw","Marca","Talla","Color","Barcode","Qty","LQ","Negro"].map(h => (
                        <th key={h} className={`text-left px-2 py-1 font-semibold ${h==="Qty" ? "text-right" : h==="LQ"||h==="Negro" ? "text-center" : ""}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {!detalle.items.length ? <tr><td colSpan={10} className="text-center py-4 text-slate-400">Sin datos</td></tr> :
                      detalle.items.map((r, i) => (
                        <tr key={i} className={i % 2 ? "bg-slate-50/50" : ""}>
                          <td className="px-2 py-0.5">{r.tienda}</td>
                          <td className="px-2 py-0.5 font-medium">{r.modelo}</td>
                          <td className="px-2 py-0.5 text-slate-400 text-[9px]">{r.modelo_raw !== r.modelo ? r.modelo_raw : ""}</td>
                          <td className="px-2 py-0.5 text-slate-500">{r.marca || "-"}</td>
                          <td className="px-2 py-0.5">{r.talla || "-"}</td>
                          <td className="px-2 py-0.5">{r.color || "-"}</td>
                          <td className="px-2 py-0.5 font-mono text-slate-400">{r.barcode || "-"}</td>
                          <td className="px-2 py-0.5 text-right font-mono font-medium">{Math.round(Number(r.qty))}</td>
                          <td className="px-2 py-0.5 text-center">{r.lq ? "Si" : ""}</td>
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
      </>
      ) : (
        <ReposicionTab dashFilters={f} buildParams={buildParams} />
      )}
    </div>
  );
}
