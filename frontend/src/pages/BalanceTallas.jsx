import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import api from "@/lib/api";
import { Loader2, Download, RotateCcw, Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const TALLA_LETTER_ORDER = { XXS: 1, XS: 2, S: 3, M: 4, L: 5, XL: 6, XXL: 7, XXXL: 8 };

function sortTalla(a, b) {
  const ga = TALLA_LETTER_ORDER[a] ? 1 : isNaN(parseInt(a)) ? 2 : 0;
  const gb = TALLA_LETTER_ORDER[b] ? 1 : isNaN(parseInt(b)) ? 2 : 0;
  if (ga !== gb) return ga - gb;
  if (ga === 0) return parseInt(a) - parseInt(b);
  if (ga === 1) return (TALLA_LETTER_ORDER[a] || 99) - (TALLA_LETTER_ORDER[b] || 99);
  return String(a).localeCompare(String(b));
}

function cellBg(v) {
  if (!v || v === 0) return "bg-slate-100 text-slate-300";
  if (v >= 20) return "bg-emerald-100 text-emerald-800 font-semibold";
  if (v >= 10) return "bg-emerald-50 text-emerald-700";
  if (v >= 5) return "bg-amber-50 text-amber-800";
  if (v >= 1) return "bg-orange-50 text-orange-700";
  return "bg-slate-50 text-slate-500";
}

function downloadCSV(headers, rows, filename) {
  const lines = [headers.join(",")];
  rows.forEach(r => {
    lines.push(headers.map(h => {
      const v = r[h]; return typeof v === "string" && v.includes(",") ? `"${v}"` : (v ?? "");
    }).join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

/* ═══ FILTER DROPDOWN ═══ */
function FilterDrop({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  const filtered = q ? options.filter(o => o.toLowerCase().includes(q.toLowerCase())) : options;
  const count = selected.length;

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (v) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);

  return (
    <div className="relative" ref={ref}>
      <button
        className={`flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${count > 0 ? "bg-cyan-600 text-white" : "bg-slate-700 hover:bg-slate-600 text-white/90"}`}
        onClick={() => setOpen(!open)}
        data-testid={`balance-filter-${label.toLowerCase()}`}
      >
        <span className="truncate">{label}</span>
        {count > 0 && <span className="bg-white/30 rounded-full px-1 text-[9px] font-bold">{count}</span>}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-xl border border-slate-200 z-50 w-56" data-testid={`balance-dropdown-${label.toLowerCase()}`}>
          <div className="p-1.5 border-b">
            <div className="relative">
              <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400" size={11} />
              <input className="h-6 w-full text-[10px] pl-6 pr-2 rounded border border-slate-200 outline-none" placeholder="Buscar..." value={q} onChange={e => setQ(e.target.value)} />
            </div>
          </div>
          {count > 0 && (
            <button className="w-full text-left px-2 py-1 text-[10px] text-red-500 hover:bg-red-50 flex items-center gap-1 border-b" onClick={() => { onChange([]); }}>
              <X size={10} /> Limpiar
            </button>
          )}
          <div className="max-h-[200px] overflow-auto p-0.5">
            {filtered.map(o => (
              <label key={o} className="flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer hover:bg-slate-50 text-[10px]">
                <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} className="h-3 w-3 rounded border-slate-300" />
                <span className="truncate">{o}</span>
              </label>
            ))}
            {!filtered.length && <p className="text-[10px] text-slate-400 text-center py-3">Sin resultados</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ MAIN PAGE ═══ */
export default function BalanceTallas() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ tallas: [], rows: [], totals_by_talla: {}, grand_total: 0, total_items: 0, filter_opts: {} });
  const [colorData, setColorData] = useState(null);
  const [colorLoading, setColorLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [page, setPage] = useState(1);
  const LIMIT = 300;

  const [filters, setFilters] = useState({
    tienda: [], marca: [], tipo: [], entalle: [], tela: [], hilo: [], color: [], talla: [], modelo: ""
  });
  const debounceRef = useRef(null);

  const sf = (k, v) => setFilters(prev => ({ ...prev, [k]: v }));

  const buildParams = useCallback(() => {
    const p = {};
    Object.entries(filters).forEach(([k, v]) => {
      if (Array.isArray(v) && v.length) p[k] = v.join(",");
      else if (typeof v === "string" && v) p[k] = v;
    });
    return p;
  }, [filters]);

  const fetchMatrix = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const p = { ...buildParams(), limit: LIMIT, page: pg };
      const r = await api.get("/stock-balance/matrix", { params: p });
      setData(r.data || { tallas: [], rows: [], totals_by_talla: {}, grand_total: 0, total_items: 0, filter_opts: {} });
      setPage(pg);
      if (selectedItem) {
        const key = `${selectedItem.marca}|${selectedItem.tipo}|${selectedItem.entalle}|${selectedItem.tela}|${selectedItem.hilo}`;
        const exists = (r.data?.rows || []).some(row => `${row.marca}|${row.tipo}|${row.entalle}|${row.tela}|${row.hilo}` === key);
        if (!exists) { setSelectedItem(null); setColorData(null); }
      }
    } catch { toast.error("Error cargando balance"); }
    finally { setLoading(false); }
  }, [buildParams, selectedItem]);

  const fetchColors = useCallback(async (item) => {
    setColorLoading(true);
    try {
      const p = {
        ...buildParams(),
        marca: item.marca, tipo: item.tipo, entalle: item.entalle,
        tela: item.tela, hilo: item.hilo,
      };
      if (filters.tienda.length) p.tienda = filters.tienda.join(",");
      const r = await api.get("/stock-balance/colors-matrix", { params: p });
      setColorData(r.data);
    } catch { toast.error("Error cargando detalle por color"); }
    finally { setColorLoading(false); }
  }, [buildParams, filters.tienda]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { fetchMatrix(1); setSelectedItem(null); setColorData(null); }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [filters]); // eslint-disable-line

  const handleRowClick = (row) => {
    const key = `${row.marca}|${row.tipo}|${row.entalle}|${row.tela}|${row.hilo}`;
    const selKey = selectedItem ? `${selectedItem.marca}|${selectedItem.tipo}|${selectedItem.entalle}|${selectedItem.tela}|${selectedItem.hilo}` : null;
    if (key === selKey) { setSelectedItem(null); setColorData(null); return; }
    setSelectedItem(row);
    fetchColors(row);
  };

  const resetAll = () => {
    setFilters({ tienda: [], marca: [], tipo: [], entalle: [], tela: [], hilo: [], color: [], talla: [], modelo: "" });
    setSelectedItem(null);
    setColorData(null);
  };

  const filterOpts = data.filter_opts || {};
  const totalPages = Math.ceil((data.total_items || 0) / LIMIT);
  const hasFilters = Object.entries(filters).some(([k, v]) => Array.isArray(v) ? v.length > 0 : v !== "");

  const exportLeftCSV = () => {
    if (!data.rows.length) return;
    const headers = ["Marca", "Tipo", "Entalle", "Tela", "Hilo", ...data.tallas, "Total"];
    const csvRows = data.rows.map(r => {
      const obj = { Marca: r.marca, Tipo: r.tipo, Entalle: r.entalle, Tela: r.tela, Hilo: r.hilo };
      data.tallas.forEach(t => { obj[t] = r.values[t] || 0; });
      obj.Total = r.total;
      return obj;
    });
    downloadCSV(headers, csvRows, "balance_tallas_items.csv");
  };

  const exportRightCSV = () => {
    if (!colorData?.rows?.length) return;
    const headers = ["Color", ...colorData.tallas, "Total"];
    const csvRows = colorData.rows.map(r => {
      const obj = { Color: r.color };
      colorData.tallas.forEach(t => { obj[t] = r.values[t] || 0; });
      obj.Total = r.total;
      return obj;
    });
    downloadCSV(headers, csvRows, "balance_tallas_colores.csv");
  };

  const selKey = selectedItem ? `${selectedItem.marca}|${selectedItem.tipo}|${selectedItem.entalle}|${selectedItem.tela}|${selectedItem.hilo}` : null;

  return (
    <div data-testid="balance-tallas-page" className="h-screen flex flex-col bg-slate-100 overflow-hidden">
      {/* FILTER BAR */}
      <div className="bg-slate-900 px-3 py-2 flex items-center gap-2 flex-wrap shrink-0" data-testid="balance-filter-bar">
        <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider mr-1">Balance de Tallas</span>
        <div className="w-px h-5 bg-slate-700" />
        <FilterDrop label="Tienda" options={filterOpts.tienda || []} selected={filters.tienda} onChange={v => sf("tienda", v)} />
        <FilterDrop label="Marca" options={filterOpts.marca || []} selected={filters.marca} onChange={v => sf("marca", v)} />
        <FilterDrop label="Tipo" options={filterOpts.tipo || []} selected={filters.tipo} onChange={v => sf("tipo", v)} />
        <FilterDrop label="Entalle" options={filterOpts.entalle || []} selected={filters.entalle} onChange={v => sf("entalle", v)} />
        <FilterDrop label="Tela" options={filterOpts.tela || []} selected={filters.tela} onChange={v => sf("tela", v)} />
        <FilterDrop label="Hilo" options={filterOpts.hilo || []} selected={filters.hilo} onChange={v => sf("hilo", v)} />
        <div className="relative">
          <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400" size={10} />
          <input
            className={`h-6 w-[100px] text-[10px] rounded pl-5 pr-1 border-0 outline-none placeholder:text-slate-500 transition-colors ${filters.modelo ? "bg-cyan-500 text-black font-semibold" : "bg-slate-700 text-white"}`}
            placeholder="Modelo..." value={filters.modelo} onChange={e => sf("modelo", e.target.value)}
            data-testid="balance-filter-modelo"
          />
        </div>
        <FilterDrop label="Talla" options={filterOpts.talla || []} selected={filters.talla} onChange={v => sf("talla", v)} />
        <FilterDrop label="Color" options={filterOpts.color || []} selected={filters.color} onChange={v => sf("color", v)} />
        <div className="w-px h-5 bg-slate-700" />
        <button
          className={`flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold transition-colors ${hasFilters || selectedItem ? "bg-red-500 hover:bg-red-400 text-white" : "bg-slate-700 text-slate-500 cursor-default"}`}
          onClick={resetAll} disabled={!hasFilters && !selectedItem}
          data-testid="balance-reset-all"
        >
          <RotateCcw size={11} /> Reset
        </button>
        <div className="ml-auto flex items-center gap-3 text-[10px]">
          <span className="text-slate-400">Items: <b className="text-white">{data.total_items || 0}</b></span>
          <span className="text-slate-400">Stock: <b className="text-white">{(data.grand_total || 0).toLocaleString("es-PE")}</b></span>
        </div>
      </div>

      {/* Active filters chips */}
      {hasFilters && (
        <div className="bg-slate-800 px-3 py-1 flex items-center gap-1.5 flex-wrap shrink-0" data-testid="balance-filter-chips">
          {Object.entries(filters).map(([k, v]) => {
            if (Array.isArray(v)) return v.map(val => (
              <span key={`${k}-${val}`} className="inline-flex items-center gap-0.5 bg-cyan-500/90 text-black rounded px-1.5 py-0.5 text-[9px] font-semibold">
                {k}: {val}
                <button className="hover:bg-cyan-600 rounded-full p-0 ml-0.5" onClick={() => sf(k, filters[k].filter(x => x !== val))}><X size={9} /></button>
              </span>
            ));
            if (v) return (
              <span key={k} className="inline-flex items-center gap-0.5 bg-cyan-500/90 text-black rounded px-1.5 py-0.5 text-[9px] font-semibold">
                {k}: {v}
                <button className="hover:bg-cyan-600 rounded-full p-0 ml-0.5" onClick={() => sf(k, "")}><X size={9} /></button>
              </span>
            );
            return null;
          })}
          <button className="text-[9px] text-red-400 hover:text-red-300 ml-1 underline" onClick={resetAll}>Limpiar todo</button>
        </div>
      )}

      {/* MAIN CONTENT */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
      ) : (
        <div className="flex-1 flex gap-1.5 p-1.5 overflow-hidden min-h-0">
          {/* LEFT: Item x Tallas (70%) */}
          <div className={`flex flex-col rounded overflow-hidden border border-slate-200 shadow-sm bg-white min-h-0 transition-all ${selectedItem ? "w-[68%]" : "w-full"}`} data-testid="balance-left-panel">
            <div className="px-3 py-1.5 bg-slate-800 text-white flex items-center justify-between shrink-0">
              <span className="text-[11px] font-bold">
                Item x Tallas
                <span className="text-[9px] text-slate-400 ml-2">
                  Pag {page}/{totalPages || 1} ({data.total_items} items)
                </span>
              </span>
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-0.5 text-[10px] text-slate-300 hover:text-white px-1" onClick={exportLeftCSV} data-testid="balance-export-left">
                  <Download size={10} /> CSV
                </button>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button className="p-0.5 rounded hover:bg-slate-700 disabled:opacity-30" disabled={page <= 1} onClick={() => fetchMatrix(page - 1)} data-testid="balance-prev-page">
                      <ChevronLeft size={12} />
                    </button>
                    <button className="p-0.5 rounded hover:bg-slate-700 disabled:opacity-30" disabled={page >= totalPages} onClick={() => fetchMatrix(page + 1)} data-testid="balance-next-page">
                      <ChevronRight size={12} />
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-auto min-h-0">
              {data.rows.length > 0 ? (
                <table className="w-full text-[10px] border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-700">
                      <th className="text-left text-white font-semibold px-1.5 py-1 sticky left-0 bg-slate-700 z-20 min-w-[200px]">Item</th>
                      {data.tallas.map(t => (
                        <th key={t} className="text-center text-white font-semibold px-0.5 py-1 min-w-[30px]">{t}</th>
                      ))}
                      <th className="text-center text-white font-bold px-1 py-1 bg-slate-900 min-w-[40px]">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r, i) => {
                      const key = `${r.marca}|${r.tipo}|${r.entalle}|${r.tela}|${r.hilo}`;
                      const isSelected = key === selKey;
                      const isDimmed = selectedItem && !isSelected;
                      const label = [r.marca, r.tipo, r.entalle, r.tela, r.hilo].filter(Boolean).join(" - ");
                      return (
                        <tr
                          key={key}
                          className={`cursor-pointer transition-all duration-100 ${isDimmed ? "opacity-[0.2]" : ""} ${isSelected ? "bg-cyan-50" : i % 2 === 0 ? "" : "bg-slate-50/50"}`}
                          onClick={() => handleRowClick(r)}
                          data-testid={`balance-row-${i}`}
                        >
                          <td className={`px-1.5 py-0.5 font-medium sticky left-0 z-10 border-r truncate max-w-[260px] transition-colors ${isSelected ? "bg-cyan-100 text-cyan-800 border-l-2 border-cyan-500 font-bold" : "bg-inherit border-slate-100 hover:text-cyan-700"}`}>
                            {label}
                          </td>
                          {data.tallas.map(t => {
                            const v = r.values[t] || 0;
                            return (
                              <td key={t} className={`text-center px-0.5 py-0.5 ${isDimmed ? "text-slate-300" : cellBg(v)}`}>
                                {v > 0 ? v : "-"}
                              </td>
                            );
                          })}
                          <td className="text-center px-0.5 py-0.5 font-bold bg-slate-100/60 border-l border-slate-200">{r.total}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-cyan-100 border-t-2 border-cyan-300 font-bold sticky bottom-0">
                      <td className="px-1.5 py-1 text-cyan-900 sticky left-0 bg-cyan-100 z-10 border-r border-cyan-200">Total</td>
                      {data.tallas.map(t => (
                        <td key={t} className="text-center px-0.5 py-1 text-cyan-900">
                          {data.totals_by_talla[t] ? Math.round(data.totals_by_talla[t]) : "-"}
                        </td>
                      ))}
                      <td className="text-center px-0.5 py-1 text-cyan-900 bg-cyan-200 border-l border-cyan-300 text-xs font-bold">
                        {data.grand_total}
                      </td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-400 text-[10px] py-8">Sin datos</div>
              )}
            </div>
          </div>

          {/* RIGHT: Color detail (30%) */}
          {selectedItem && (
            <div className="w-[32%] flex flex-col rounded overflow-hidden border border-slate-200 shadow-sm bg-white min-h-0" data-testid="balance-right-panel">
              <div className="px-3 py-1.5 bg-cyan-700 text-white flex items-center justify-between shrink-0">
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] font-bold block truncate">Detalle por Color</span>
                  <span className="text-[9px] text-cyan-200 block truncate">
                    {[selectedItem.marca, selectedItem.tipo, selectedItem.entalle, selectedItem.tela, selectedItem.hilo].filter(Boolean).join(" - ")}
                  </span>
                </div>
                <div className="flex items-center gap-1 ml-2 shrink-0">
                  <button className="flex items-center gap-0.5 text-[10px] text-cyan-200 hover:text-white px-1" onClick={exportRightCSV} data-testid="balance-export-right">
                    <Download size={10} /> CSV
                  </button>
                  <button className="p-0.5 rounded hover:bg-cyan-600 text-cyan-200 hover:text-white" onClick={() => { setSelectedItem(null); setColorData(null); }} data-testid="balance-close-right">
                    <X size={12} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto min-h-0">
                {colorLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
                ) : colorData && colorData.rows.length > 0 ? (
                  <table className="w-full text-[10px] border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-cyan-800">
                        <th className="text-left text-white font-semibold px-1.5 py-1 sticky left-0 bg-cyan-800 z-20 min-w-[80px]">Color</th>
                        {colorData.tallas.map(t => (
                          <th key={t} className="text-center text-white font-semibold px-0.5 py-1 min-w-[28px]">{t}</th>
                        ))}
                        <th className="text-center text-white font-bold px-1 py-1 bg-cyan-900 min-w-[36px]">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {colorData.rows.map((r, i) => (
                        <tr key={r.color} className={i % 2 === 0 ? "" : "bg-slate-50/50"}>
                          <td className="px-1.5 py-0.5 font-medium sticky left-0 z-10 border-r border-slate-100 bg-inherit truncate max-w-[100px]">{r.color}</td>
                          {colorData.tallas.map(t => {
                            const v = r.values[t] || 0;
                            return (
                              <td key={t} className={`text-center px-0.5 py-0.5 ${cellBg(v)}`}>
                                {v > 0 ? v : "-"}
                              </td>
                            );
                          })}
                          <td className="text-center px-0.5 py-0.5 font-bold bg-slate-100/60 border-l border-slate-200">{r.total}</td>
                        </tr>
                      ))}
                      <tr className="bg-cyan-100 border-t-2 border-cyan-300 font-bold sticky bottom-0">
                        <td className="px-1.5 py-1 text-cyan-900 sticky left-0 bg-cyan-100 z-10 border-r border-cyan-200">Total</td>
                        {colorData.tallas.map(t => (
                          <td key={t} className="text-center px-0.5 py-1 text-cyan-900">
                            {colorData.totals_by_talla[t] ? Math.round(colorData.totals_by_talla[t]) : "-"}
                          </td>
                        ))}
                        <td className="text-center px-0.5 py-1 text-cyan-900 bg-cyan-200 border-l border-cyan-300 text-xs font-bold">
                          {colorData.grand_total}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <div className="flex items-center justify-center text-slate-400 text-[10px] py-8">
                    {colorData ? "Sin datos para este item" : "Selecciona un item"}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
