import React, { useState, useEffect, useCallback, useRef } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  Loader2, Download, RotateCcw, Filter, ChevronLeft, ChevronRight,
  Warehouse, X, ChevronDown,
} from "lucide-react";

const DEST_COLS = ["GM209", "GM218", "GRAU 238 / GRAU 55", "GM207", "BOOSH"];
const DEST_SHORT = { "GM209": "GM209", "GM218": "GM218", "GRAU 238 / GRAU 55": "GRAU", "GM207": "GM207", "BOOSH": "BOOSH" };
const MARCAS = ["QEPO", "BOOSH", "ELEMENT PREMIUM"];

function cellCls(v) {
  if (!v || v === 0) return "text-slate-300";
  if (v >= 5) return "text-emerald-700 font-semibold bg-emerald-50";
  if (v >= 2) return "text-amber-700 bg-amber-50";
  return "text-red-600 font-bold bg-red-50";
}

function estadoBadge(e) {
  if (e === "FALTANTE") return "bg-red-500 text-white";
  if (e === "BAJO") return "bg-amber-500 text-white";
  return "bg-emerald-500 text-white";
}

function downloadCSV(headers, rows, filename) {
  const lines = [headers.join(",")];
  rows.forEach(r => lines.push(headers.map(h => {
    const v = r[h]; return typeof v === "string" && v.includes(",") ? `"${v}"` : (v ?? "");
  }).join(",")));
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

export default function ReposicionTab() {
  const [data, setData] = useState({ items: [], total: 0, kpis: {} });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const LIMIT = 200;

  // Controls
  const [marca, setMarca] = useState("");
  const [umbralDest, setUmbralDest] = useState(0);
  const [objetivo, setObjetivo] = useState(2);
  const [umbralOrigen, setUmbralOrigen] = useState(0);
  const [soloObj, setSoloObj] = useState(true);

  // Drilldown
  const [selectedSku, setSelectedSku] = useState(null);
  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  const debounceRef = useRef(null);

  const fetchData = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const p = {
        umbral_destino: umbralDest,
        objetivo_destino: objetivo,
        umbral_min_origen: umbralOrigen,
        solo_objetivo: soloObj,
        page: pg,
        limit: LIMIT,
      };
      if (marca) p.marca = marca;
      const r = await api.get("/reposicion/sku-summary", { params: p });
      setData(r.data || { items: [], total: 0, kpis: {} });
      setPage(pg);
      setSelectedSku(null);
      setModels([]);
    } catch { toast.error("Error cargando reposición"); }
    finally { setLoading(false); }
  }, [marca, umbralDest, objetivo, umbralOrigen, soloObj]);

  const fetchModels = useCallback(async (sku) => {
    setModelsLoading(true);
    try {
      const p = {
        marca: sku.marca, tipo: sku.tipo, entalle: sku.entalle,
        tela: sku.tela, color: sku.color, talla: sku.talla,
      };
      const r = await api.get("/reposicion/sku-models", { params: p });
      setModels(r.data?.models || []);
    } catch { setModels([]); }
    finally { setModelsLoading(false); }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchData(1), 400);
    return () => clearTimeout(debounceRef.current);
  }, [fetchData]);

  const handleRowClick = (sku) => {
    if (selectedSku?.sku_key === sku.sku_key) {
      setSelectedSku(null); setModels([]); return;
    }
    setSelectedSku(sku);
    fetchModels(sku);
  };

  const kpis = data.kpis || {};
  const totalPages = Math.ceil((data.total || 0) / LIMIT);

  const destStock = (sku, dest) => {
    const d = (sku.destinos || []).find(x => x.tienda_group === dest);
    return d ? d.stock : 0;
  };

  const exportCSV = () => {
    if (!data.items.length) return;
    const hdrs = ["Marca", "Tipo", "Entalle", "Tela", "Color", "Talla", "ALMACEN", ...DEST_COLS.map(c => DEST_SHORT[c]), "TOTAL", "Estado", "Recomendación"];
    const csvRows = data.items.map(s => {
      const obj = { Marca: s.marca, Tipo: s.tipo, Entalle: s.entalle, Tela: s.tela, Color: s.color, Talla: s.talla, ALMACEN: s.stock_almacen };
      DEST_COLS.forEach(c => { obj[DEST_SHORT[c]] = destStock(s, c); });
      obj.TOTAL = s.stock_total; obj.Estado = s.estado; obj["Recomendación"] = s.rec_text;
      return obj;
    });
    downloadCSV(hdrs, csvRows, "reposicion_sku.csv");
  };

  return (
    <div className="h-screen flex flex-col bg-slate-100 overflow-hidden" data-testid="reposicion-page">
      {/* CONTROL BAR */}
      <div className="bg-slate-900 px-3 py-2 flex items-center gap-2.5 flex-wrap shrink-0" data-testid="repo-controls">
        <div className="flex items-center gap-1.5">
          <Filter size={11} className="text-amber-400" />
          <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">Reposición</span>
        </div>
        <div className="w-px h-5 bg-slate-700" />

        <select className="h-6 text-[10px] rounded bg-slate-700 text-white border-0 px-1.5 outline-none" value={marca} onChange={e => setMarca(e.target.value)} data-testid="repo-marca">
          <option value="">Todas las marcas</option>
          {MARCAS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <div className="flex items-center gap-1 text-[9px] text-slate-400">
          <span>Umbral dest:</span>
          <input type="number" min={0} max={10} className="w-8 h-5 text-[10px] text-center rounded bg-slate-700 text-white border-0 outline-none" value={umbralDest} onChange={e => setUmbralDest(Math.max(0, +e.target.value || 0))} data-testid="repo-umbral-dest" />
        </div>
        <div className="flex items-center gap-1 text-[9px] text-slate-400">
          <span>Objetivo:</span>
          <input type="number" min={1} max={20} className="w-8 h-5 text-[10px] text-center rounded bg-slate-700 text-white border-0 outline-none" value={objetivo} onChange={e => setObjetivo(Math.max(1, +e.target.value || 1))} data-testid="repo-objetivo" />
        </div>
        <div className="flex items-center gap-1 text-[9px] text-slate-400">
          <span>Min origen:</span>
          <input type="number" min={0} max={20} className="w-8 h-5 text-[10px] text-center rounded bg-slate-700 text-white border-0 outline-none" value={umbralOrigen} onChange={e => setUmbralOrigen(Math.max(0, +e.target.value || 0))} data-testid="repo-umbral-orig" />
        </div>

        <button
          className={`px-2 py-1 rounded text-[9px] font-semibold transition-colors ${soloObj ? "bg-amber-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
          onClick={() => setSoloObj(!soloObj)} data-testid="repo-solo-objetivo"
        >
          {soloObj ? "Solo tiendas objetivo" : "Todas las tiendas"}
        </button>

        <button className="flex items-center gap-0.5 text-[10px] text-slate-300 hover:text-white px-1" onClick={exportCSV} data-testid="repo-export-csv">
          <Download size={10} /> CSV
        </button>

        <div className="w-px h-5 bg-slate-700" />
        {/* KPIs */}
        <div className="ml-auto flex items-center gap-2.5 text-[10px]">
          <span className="text-slate-400">SKUs: <b className="text-white">{kpis.total_skus || 0}</b></span>
          <span className="text-slate-400">Faltantes: <b className="text-red-400">{kpis.faltantes || 0}</b></span>
          <span className="text-slate-400">Bajos: <b className="text-amber-400">{kpis.bajos || 0}</b></span>
          <span className="text-slate-400">Con asig: <b className="text-emerald-400">{kpis.con_asignacion || 0}</b></span>
          <span className="text-slate-400">Qty: <b className="text-cyan-400">{kpis.total_qty_asignada || 0}</b></span>
          <span className="text-slate-400">Sin stock: <b className="text-red-300">{kpis.sin_stock || 0}</b></span>
        </div>
      </div>

      {/* MAIN CONTENT */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {/* TOP: SKU Summary Table */}
          <div className={`flex flex-col bg-white border-b border-slate-200 overflow-hidden min-h-0 transition-all ${selectedSku ? "h-[55%]" : "flex-1"}`} data-testid="repo-sku-table-container">
            <div className="px-3 py-1 bg-slate-800 text-white flex items-center justify-between shrink-0">
              <span className="text-[11px] font-bold">
                Resumen por SKU
                <span className="text-[9px] text-slate-400 ml-2">Pag {page}/{totalPages || 1} ({data.total} SKUs)</span>
              </span>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button className="p-0.5 rounded hover:bg-slate-700 disabled:opacity-30" disabled={page <= 1} onClick={() => fetchData(page - 1)} data-testid="repo-prev-page"><ChevronLeft size={12} /></button>
                  <button className="p-0.5 rounded hover:bg-slate-700 disabled:opacity-30" disabled={page >= totalPages} onClick={() => fetchData(page + 1)} data-testid="repo-next-page"><ChevronRight size={12} /></button>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-auto min-h-0">
              <table className="w-full text-[10px] border-collapse" data-testid="repo-sku-table">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-700">
                    <th className="text-left text-white font-semibold px-1.5 py-1 sticky left-0 bg-slate-700 z-20 min-w-[60px]">Marca</th>
                    <th className="text-left text-white font-semibold px-1 py-1 min-w-[60px]">Tipo</th>
                    <th className="text-left text-white font-semibold px-1 py-1 min-w-[55px]">Entalle</th>
                    <th className="text-left text-white font-semibold px-1 py-1 min-w-[50px]">Tela</th>
                    <th className="text-left text-white font-semibold px-1 py-1 min-w-[60px]">Color</th>
                    <th className="text-center text-white font-semibold px-0.5 py-1 w-[30px]">Talla</th>
                    <th className="text-center text-amber-300 font-bold px-0.5 py-1 w-[32px] bg-amber-900/30"><Warehouse size={9} className="inline" /> ALM</th>
                    {DEST_COLS.map(c => (
                      <th key={c} className="text-center text-white font-semibold px-0.5 py-1 w-[32px]">{DEST_SHORT[c]}</th>
                    ))}
                    <th className="text-center text-white font-bold px-0.5 py-1 w-[32px] bg-slate-900">TOT</th>
                    <th className="text-center text-white font-semibold px-1 py-1 w-[48px]">Estado</th>
                    <th className="text-left text-white font-semibold px-1 py-1 min-w-[140px]">Recomendación</th>
                  </tr>
                </thead>
                <tbody>
                  {!data.items.length ? (
                    <tr><td colSpan={13} className="text-center py-8 text-slate-400">Sin SKUs con faltantes/bajos</td></tr>
                  ) : data.items.map((s, i) => {
                    const isSelected = selectedSku?.sku_key === s.sku_key;
                    const isDimmed = selectedSku && !isSelected;
                    return (
                      <tr
                        key={s.sku_key}
                        className={`cursor-pointer transition-all duration-100 border-b border-slate-100 ${isDimmed ? "opacity-[0.15]" : ""} ${isSelected ? "bg-amber-50 border-l-2 border-amber-500" : i % 2 ? "bg-slate-50/40 hover:bg-slate-100" : "hover:bg-slate-100"}`}
                        onClick={() => handleRowClick(s)}
                        data-testid={`repo-sku-row-${i}`}
                      >
                        <td className={`px-1.5 py-0.5 font-medium truncate max-w-[80px] sticky left-0 z-10 border-r border-slate-100 ${isSelected ? "bg-amber-50" : "bg-inherit"}`}>{s.marca}</td>
                        <td className="px-1 py-0.5 text-slate-600 truncate max-w-[70px]">{s.tipo}</td>
                        <td className="px-1 py-0.5 text-slate-500 truncate max-w-[60px]">{s.entalle}</td>
                        <td className="px-1 py-0.5 text-slate-500 truncate max-w-[60px]">{s.tela}</td>
                        <td className="px-1 py-0.5 text-slate-600 truncate max-w-[70px]">{s.color}</td>
                        <td className="text-center px-0.5 py-0.5 font-medium">{s.talla}</td>
                        <td className={`text-center px-0.5 py-0.5 font-bold ${s.stock_almacen > 0 ? "text-amber-700 bg-amber-50" : "text-slate-300"}`}>{s.stock_almacen || "-"}</td>
                        {DEST_COLS.map(c => {
                          const v = destStock(s, c);
                          return <td key={c} className={`text-center px-0.5 py-0.5 ${cellCls(v)}`}>{v || "-"}</td>;
                        })}
                        <td className="text-center px-0.5 py-0.5 font-bold bg-slate-100/60 border-l border-slate-200">{s.stock_total}</td>
                        <td className="text-center px-1 py-0.5">
                          <span className={`inline-block rounded px-1 py-0 text-[8px] font-bold ${estadoBadge(s.estado)}`}>{s.estado}</span>
                        </td>
                        <td className="px-1 py-0.5 text-[9px] text-slate-600 truncate max-w-[180px]" title={s.rec_text}>{s.rec_text}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* BOTTOM: Model Drilldown */}
          {selectedSku && (
            <div className="h-[45%] flex flex-col bg-white border-t-2 border-amber-400 overflow-hidden" data-testid="repo-drilldown-panel">
              <div className="px-3 py-1.5 bg-amber-700 text-white flex items-center justify-between shrink-0">
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] font-bold">Modelos para: </span>
                  <span className="text-[10px] text-amber-200">
                    {[selectedSku.marca, selectedSku.tipo, selectedSku.entalle, selectedSku.tela, selectedSku.color, selectedSku.talla].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <button className="p-0.5 rounded hover:bg-amber-600 text-amber-200 hover:text-white ml-2" onClick={() => { setSelectedSku(null); setModels([]); }} data-testid="repo-close-drilldown">
                  <X size={13} />
                </button>
              </div>
              <div className="flex-1 overflow-auto min-h-0">
                {modelsLoading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
                ) : models.length > 0 ? (
                  <table className="w-full text-[10px] border-collapse" data-testid="repo-models-table">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-amber-800 text-white">
                        <th className="text-left font-semibold px-2 py-1 min-w-[160px]">Modelo</th>
                        <th className="text-center font-bold px-0.5 py-1 w-[36px] bg-amber-900/50"><Warehouse size={9} className="inline" /> ALM</th>
                        {DEST_COLS.map(c => (
                          <th key={c} className="text-center font-semibold px-0.5 py-1 w-[36px]">{DEST_SHORT[c]}</th>
                        ))}
                        <th className="text-center font-bold px-0.5 py-1 w-[36px] bg-amber-900">TOT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {models.map((m, i) => (
                        <tr key={m.modelo} className={i % 2 ? "bg-slate-50/50" : ""}>
                          <td className="px-2 py-0.5 font-medium truncate max-w-[200px]">{m.modelo}</td>
                          <td className={`text-center px-0.5 py-0.5 font-bold ${m.stock_almacen > 0 ? "text-amber-700 bg-amber-50" : "text-slate-300"}`}>{m.stock_almacen || "-"}</td>
                          {DEST_COLS.map(c => {
                            const pt = (m.por_tienda || []).find(x => x.tienda_group === c);
                            const v = pt ? pt.stock : 0;
                            return <td key={c} className={`text-center px-0.5 py-0.5 ${cellCls(v)}`}>{v || "-"}</td>;
                          })}
                          <td className="text-center px-0.5 py-0.5 font-bold bg-slate-100/60 border-l border-slate-200">{m.stock_total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="flex items-center justify-center py-8 text-slate-400 text-[10px]">Sin modelos encontrados</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
