import React, { useState, useEffect, useCallback, useRef } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  Loader2, X, Package, ArrowRight,
  Warehouse, Store, Filter, AlertTriangle,
} from "lucide-react";

const TIENDAS_ALL = ["GRAU 238 / GRAU 55", "GAMARRA 209", "GM218", "BOOSH", "GAMARRA 207"];
const MARCAS_PREVALENCIA = ["QEPO", "BOOSH", "ELEMENT PREMIUM"];

export default function ReposicionTab({ dashFilters, buildParams }) {
  const [data, setData] = useState({ items: [], total: 0, kpis: {} });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit] = useState(100);

  const [umbralDestino, setUmbralDestino] = useState(0);
  const [umbralOrigen, setUmbralOrigen] = useState(2);
  const [objetivoDestino, setObjetivoDestino] = useState(2);
  const [soloObjetivo, setSoloObjetivo] = useState(true);
  const [tiendaDest, setTiendaDest] = useState("");
  const [marcaRepo, setMarcaRepo] = useState("");

  const [expanded, setExpanded] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [detalleLoading, setDetalleLoading] = useState(false);
  const debounceRef = useRef(null);

  const fetchData = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const p = buildParams ? buildParams() : {};
      p.umbral_destino = umbralDestino;
      p.umbral_origen = umbralOrigen;
      p.objetivo_destino = objetivoDestino;
      p.solo_objetivo = soloObjetivo;
      p.page = pg;
      p.limit = limit;
      if (tiendaDest) p.tienda_destino = tiendaDest;
      if (marcaRepo) p.marca_repo = marcaRepo;

      const r = await api.get("/stock-dashboard/reposicion", { params: p });
      setData(r.data || { items: [], total: 0, kpis: {} });
      setPage(pg);
      setExpanded(null);
      setDetalle(null);
    } catch {
      toast.error("Error cargando reposición");
    } finally {
      setLoading(false);
    }
  }, [buildParams, umbralDestino, umbralOrigen, objetivoDestino, soloObjetivo, tiendaDest, marcaRepo, limit]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchData(1), 400);
    return () => clearTimeout(debounceRef.current);
  }, [fetchData]);

  const loadDetalle = async (item, idx) => {
    if (expanded === idx) { setExpanded(null); setDetalle(null); return; }
    setExpanded(idx);
    setDetalleLoading(true);
    try {
      const p = buildParams ? buildParams() : {};
      p.marca_norm = (item.marca || "").toUpperCase().trim();
      p.tipo = item.tipo || "";
      p.entalle = item.entalle || "";
      p.tela = item.tela || "";
      p.hilo = item.hilo || "";
      p.color = item.color || "";
      p.talla = item.talla || "";
      const r = await api.get("/stock-dashboard/reposicion-detalle", { params: p });
      setDetalle(r.data?.distribucion || []);
    } catch {
      setDetalle([]);
    } finally {
      setDetalleLoading(false);
    }
  };

  const kpis = data.kpis || {};
  const pages = Math.ceil(data.total / limit);

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="reposicion-tab">
      {/* Controls bar */}
      <div className="bg-slate-800 px-3 py-2 flex items-center gap-3 flex-wrap shrink-0 border-b border-slate-700" data-testid="repo-controls">
        <div className="flex items-center gap-1.5">
          <Filter size={11} className="text-slate-400" />
          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Reposición</span>
        </div>

        <select className="h-6 text-[10px] rounded bg-slate-700 text-white border-0 px-1.5 outline-none"
          value={marcaRepo} onChange={e => setMarcaRepo(e.target.value)} data-testid="repo-marca">
          <option value="">Todas las marcas</option>
          {MARCAS_PREVALENCIA.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <select className="h-6 text-[10px] rounded bg-slate-700 text-white border-0 px-1.5 outline-none"
          value={tiendaDest} onChange={e => setTiendaDest(e.target.value)} data-testid="repo-tienda-dest">
          <option value="">Todas las tiendas</option>
          {TIENDAS_ALL.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <div className="flex items-center gap-1 text-[9px] text-slate-400">
          <span>Umbral dest:</span>
          <input type="number" min={0} max={10} className="w-8 h-5 text-[10px] text-center rounded bg-slate-700 text-white border-0 outline-none"
            value={umbralDestino} onChange={e => setUmbralDestino(Math.max(0, +e.target.value || 0))} data-testid="repo-umbral-dest" />
        </div>
        <div className="flex items-center gap-1 text-[9px] text-slate-400">
          <span>Min origen:</span>
          <input type="number" min={0} max={20} className="w-8 h-5 text-[10px] text-center rounded bg-slate-700 text-white border-0 outline-none"
            value={umbralOrigen} onChange={e => setUmbralOrigen(Math.max(0, +e.target.value || 0))} data-testid="repo-umbral-orig" />
        </div>
        <div className="flex items-center gap-1 text-[9px] text-slate-400">
          <span>Objetivo:</span>
          <input type="number" min={1} max={20} className="w-8 h-5 text-[10px] text-center rounded bg-slate-700 text-white border-0 outline-none"
            value={objetivoDestino} onChange={e => setObjetivoDestino(Math.max(1, +e.target.value || 1))} data-testid="repo-objetivo" />
        </div>

        <button className={`px-2 py-1 rounded text-[9px] font-semibold transition-colors ${soloObjetivo ? "bg-amber-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
          onClick={() => setSoloObjetivo(!soloObjetivo)} data-testid="repo-solo-objetivo">
          {soloObjetivo ? "Solo tiendas objetivo" : "Todas las tiendas"}
        </button>

        {/* KPIs */}
        <div className="ml-auto flex items-center gap-2.5 text-[10px]">
          {kpis.total_faltantes !== undefined && (
            <>
              <span className="text-slate-400">Faltantes: <b className="text-red-400">{kpis.total_faltantes?.toLocaleString("es-PE")}</b></span>
              <span className="text-slate-400">Con asig: <b className="text-emerald-400">{kpis.con_asignacion?.toLocaleString("es-PE")}</b></span>
              <span className="text-slate-400">Qty: <b className="text-amber-400">{kpis.total_qty_sugerida?.toLocaleString("es-PE")}</b></span>
              <span className="text-slate-400 flex items-center gap-0.5"><Warehouse size={9} /> <b className="text-emerald-400">{kpis.desde_almacen?.toLocaleString("es-PE")}</b></span>
              <span className="text-slate-400 flex items-center gap-0.5"><Store size={9} /> <b className="text-blue-400">{kpis.entre_tiendas?.toLocaleString("es-PE")}</b></span>
              <span className="text-slate-400 flex items-center gap-0.5"><AlertTriangle size={9} /> <b className="text-red-400/80">{kpis.sin_stock?.toLocaleString("es-PE")}</b></span>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : (
        <div className="flex-1 overflow-auto min-h-0 bg-white">
          <table className="w-full text-[10px] border-collapse" data-testid="repo-table">
            <thead className="sticky top-0 z-10 bg-slate-700 text-white">
              <tr>
                <th className="text-left px-2 py-1.5 font-semibold min-w-[100px]">Destino</th>
                <th className="text-left px-1 py-1.5 font-semibold">Marca</th>
                <th className="text-left px-1 py-1.5 font-semibold">Tipo</th>
                <th className="text-left px-1 py-1.5 font-semibold">Entalle</th>
                <th className="text-left px-1 py-1.5 font-semibold">Tela</th>
                <th className="text-left px-1 py-1.5 font-semibold">Hilo</th>
                <th className="text-left px-1 py-1.5 font-semibold">Color</th>
                <th className="text-center px-1 py-1.5 font-semibold w-[30px]">Talla</th>
                <th className="text-center px-1 py-1.5 font-semibold w-[28px] bg-red-900/40">Dest</th>
                <th className="text-center px-1 py-1.5 font-semibold w-[28px] bg-emerald-900/40">Alm</th>
                <th className="text-center px-1 py-1.5 font-semibold w-[28px]">Tot</th>
                <th className="text-left px-1 py-1.5 font-semibold min-w-[85px]">Origen</th>
                <th className="text-center px-1 py-1.5 font-semibold w-[28px] bg-amber-900/40">Qty</th>
                <th className="text-center px-1 py-1.5 font-semibold w-[28px]" title="Tallado destino">Tall</th>
                <th className="text-left px-1 py-1.5 font-semibold">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {!data.items.length ? (
                <tr><td colSpan={15} className="text-center py-8 text-slate-400">Sin recomendaciones</td></tr>
              ) : data.items.map((r, i) => {
                const isExpanded = expanded === i;
                const noStock = r.qty_sugerida === 0;
                return (
                  <React.Fragment key={i}>
                    <tr className={`cursor-pointer transition-colors ${noStock ? "opacity-50" : ""} ${isExpanded ? "bg-blue-50" : i % 2 ? "bg-slate-50/50 hover:bg-slate-100" : "hover:bg-slate-100"}`}
                      onClick={() => loadDetalle(r, i)} data-testid={`repo-row-${i}`}>
                      <td className="px-2 py-1 font-medium">{r.tienda_destino}</td>
                      <td className="px-1 py-1 text-slate-600">{r.marca}</td>
                      <td className="px-1 py-1 text-slate-500">{r.tipo}</td>
                      <td className="px-1 py-1 text-slate-500">{r.entalle}</td>
                      <td className="px-1 py-1 text-slate-500">{r.tela}</td>
                      <td className="px-1 py-1 text-slate-500">{r.hilo}</td>
                      <td className="px-1 py-1">{r.color}</td>
                      <td className="text-center px-1 py-1 font-mono">{r.talla}</td>
                      <td className={`text-center px-1 py-1 font-bold ${r.stock_destino === 0 ? "text-red-600 bg-red-50" : "text-amber-600 bg-amber-50"}`}>{r.stock_destino}</td>
                      <td className={`text-center px-1 py-1 font-medium ${r.stock_almacen > 0 ? "text-emerald-700 bg-emerald-50" : "text-slate-300"}`}>{r.stock_almacen}</td>
                      <td className="text-center px-1 py-1 text-slate-600">{r.stock_total}</td>
                      <td className="px-1 py-1">
                        {r.origen_recomendado !== '-' ? (
                          <span className={`inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded ${r.origen_recomendado === "ALMACEN" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"}`}>
                            {r.origen_recomendado === "ALMACEN" ? <Warehouse size={8} /> : <Store size={8} />}
                            {r.origen_recomendado}
                          </span>
                        ) : (
                          <span className="text-[9px] text-slate-400">-</span>
                        )}
                      </td>
                      <td className={`text-center px-1 py-1 font-bold ${noStock ? "text-slate-300" : "text-amber-700 bg-amber-50"}`}>{r.qty_sugerida}</td>
                      <td className="text-center px-1 py-1 text-slate-500">{r.tallado_destino}</td>
                      <td className="px-1 py-1 text-[9px] text-slate-500">{r.motivo}</td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={15} className="bg-slate-50 px-4 py-2 border-y border-slate-200">
                          {detalleLoading ? (
                            <div className="flex items-center gap-2 text-[10px] text-slate-400"><Loader2 size={12} className="animate-spin" /> Cargando distribución...</div>
                          ) : detalle && detalle.length > 0 ? (
                            <div className="flex items-start gap-6">
                              <div>
                                <div className="text-[9px] text-slate-500 font-semibold uppercase mb-1">Distribución por tienda</div>
                                <div className="flex gap-2 flex-wrap">
                                  {detalle.map(d => (
                                    <div key={d.tienda} className={`px-2 py-1 rounded text-[10px] font-medium ${d.tienda === r.origen_recomendado ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300" : d.tienda === r.tienda_destino ? "bg-red-100 text-red-800 ring-1 ring-red-300" : "bg-slate-100 text-slate-700"}`}>
                                      {d.tienda}: <b>{d.stock}</b>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {r.qty_sugerida > 0 && (
                                <div className="flex items-center gap-2 text-[10px] mt-2">
                                  <span className="text-slate-500">Sugerencia:</span>
                                  <span className="inline-flex items-center gap-1 bg-emerald-600 text-white px-2 py-0.5 rounded font-semibold">
                                    {r.origen_recomendado} <ArrowRight size={10} /> {r.tienda_destino}: {r.qty_sugerida} uds
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-400">Sin datos de distribución</div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-t border-slate-200 bg-white text-[10px] text-slate-500">
          <span>Página {page} de {pages} ({data.total} resultados)</span>
          <div className="flex gap-1">
            <button className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40"
              disabled={page <= 1} onClick={() => fetchData(page - 1)} data-testid="repo-prev">Ant</button>
            <button className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40"
              disabled={page >= pages} onClick={() => fetchData(page + 1)} data-testid="repo-next">Sig</button>
          </div>
        </div>
      )}
    </div>
  );
}
