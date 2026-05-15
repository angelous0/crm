/**
 * CuentasVinculadas — lista de partners SECUNDARIOS (vinculados a otro principal).
 *
 * Sirve como complemento a /cuentas (que ahora solo muestra principales y solos).
 * Cada fila indica:
 *   - Nombre del secundario
 *   - A qué cuenta principal pertenece (click → navega a la principal)
 *   - Fuente del vínculo: override manual / regla auto / odoo_map nativo
 *   - Ventas históricas del secundario vs del principal (validación visual)
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { Loader2, Search, ExternalLink, Trash2, Filter } from "lucide-react";
import { formatDoc } from "@/lib/docTipo";

const fmtMoney = (n) => {
  const v = Number(n || 0);
  if (v >= 1000000) return `S/ ${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `S/ ${Math.round(v / 1000)}k`;
  return `S/ ${Math.round(v)}`;
};

const FUENTE_META = {
  override: { label: "CRM override", bg: "bg-violet-100", fg: "text-violet-700" },
  odoo_map: { label: "Odoo map",     bg: "bg-sky-100",    fg: "text-sky-700" },
  otro:     { label: "Otro",         bg: "bg-slate-100",  fg: "text-slate-600" },
};

export default function CuentasVinculadas() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [fuente, setFuente] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("name");
  const [dir, setDir] = useState("asc");
  const limit = 50;

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/cuentas/vinculadas", {
        params: { q, fuente, sort, dir, page, limit },
      });
      setRows(r.data?.rows || []);
      setTotal(r.data?.total_rows || 0);
    } catch (e) {
      toast.error("Error cargando vinculadas");
    } finally {
      setLoading(false);
    }
  }, [q, fuente, sort, dir, page]);

  useEffect(() => { cargar(); }, [cargar]);

  // Debounce búsqueda
  const [qInput, setQInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => { setQ(qInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const toggleSort = (col) => {
    if (sort === col) setDir(dir === "asc" ? "desc" : "asc");
    else { setSort(col); setDir("asc"); }
  };

  const totalPages = Math.ceil(total / limit);
  const fuentesCount = useMemo(() => ({
    override: rows.filter(r => r.fuente === "override").length,
    odoo_map: rows.filter(r => r.fuente === "odoo_map").length,
  }), [rows]);

  const handleDesvincular = async (row) => {
    if (row.fuente !== "override") {
      toast.warning("Solo se pueden desvincular los overrides manuales / batch. Los 'Odoo map' vienen de Odoo y se manejan allá.");
      return;
    }
    if (!window.confirm(`¿Desvincular "${row.secundario_nombre}" de "${row.principal_nombre}"?\n\nEl secundario volverá a ser cuenta independiente y sus ventas dejarán de contar para el principal.`)) return;
    try {
      await api.delete(`/cuentas/${row.secundario_id}/desvincular`);
      toast.success("Desvinculado");
      cargar();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error al desvincular");
    }
  };

  return (
    <div className="px-6 py-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cuentas vinculadas</h1>
          <div className="text-xs text-slate-500 uppercase tracking-wider mt-1.5">
            {total} secundarios · apuntan a una cuenta principal
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Buscar por nombre del secundario o principal..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>
        <select
          value={fuente}
          onChange={(e) => { setFuente(e.target.value); setPage(1); }}
          className="h-9 px-3 text-sm border border-slate-300 rounded-md bg-white"
        >
          <option value="">Todas las fuentes</option>
          <option value="override">CRM override</option>
          <option value="odoo_map">Odoo map</option>
        </select>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-slate-500 italic">
          No se encontraron cuentas vinculadas con esos filtros.
        </div>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider text-slate-600 font-semibold cursor-pointer hover:text-slate-900" onClick={() => toggleSort("name")}>
                  Secundario {sort === "name" && (dir === "asc" ? "↑" : "↓")}
                </th>
                <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider text-slate-600 font-semibold">Tel/Depto</th>
                <th className="text-right px-3 py-2 text-[11px] uppercase tracking-wider text-slate-600 font-semibold cursor-pointer hover:text-slate-900" onClick={() => toggleSort("ventas_sec")}>
                  Ventas sec {sort === "ventas_sec" && (dir === "asc" ? "↑" : "↓")}
                </th>
                <th className="text-center px-3 py-2 text-[11px] uppercase tracking-wider text-slate-600 font-semibold">→</th>
                <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider text-slate-600 font-semibold cursor-pointer hover:text-slate-900" onClick={() => toggleSort("principal")}>
                  Principal {sort === "principal" && (dir === "asc" ? "↑" : "↓")}
                </th>
                <th className="text-right px-3 py-2 text-[11px] uppercase tracking-wider text-slate-600 font-semibold cursor-pointer hover:text-slate-900" onClick={() => toggleSort("ventas_pri")}>
                  Ventas pri {sort === "ventas_pri" && (dir === "asc" ? "↑" : "↓")}
                </th>
                <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider text-slate-600 font-semibold">Fuente</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const fuenteMeta = FUENTE_META[r.fuente] || FUENTE_META.otro;
                return (
                  <tr key={r.secundario_id} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900 truncate max-w-[280px]" title={r.secundario_nombre}>
                        {r.secundario_nombre}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">#{r.secundario_id}{r.vat && ` · ${formatDoc(r)}`}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {r.phone && <div>{r.phone}</div>}
                      {r.depto && <div className="text-slate-500">{r.depto}</div>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {r.ventas_sec > 0 ? fmtMoney(r.ventas_sec) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-400">→</td>
                    <td className="px-3 py-2">
                      <Link to={`/cuentas/${r.principal_id}`} className="font-medium text-violet-700 hover:text-violet-900 hover:underline truncate max-w-[280px] block" title={r.principal_nombre}>
                        {r.principal_nombre || `#${r.principal_id}`}
                      </Link>
                      <div className="text-[11px] text-slate-500 font-mono">#{r.principal_id}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-semibold">
                      {r.ventas_pri > 0 ? fmtMoney(r.ventas_pri) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${fuenteMeta.bg} ${fuenteMeta.fg}`}>
                        {fuenteMeta.label}
                      </span>
                      {r.nota_override && r.fuente === "override" && (
                        <div className="text-[10px] text-slate-500 italic mt-0.5 max-w-[200px] truncate" title={r.nota_override}>
                          {r.nota_override}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <Link
                          to={`/cuentas/${r.principal_id}?tab=vinculados`}
                          className="text-[11px] px-2 py-1 rounded text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1"
                          title="Ver grupo del principal"
                        >
                          <ExternalLink className="h-3 w-3" /> Ver grupo
                        </Link>
                        {r.fuente === "override" && (
                          <button
                            onClick={() => handleDesvincular(r)}
                            className="text-[11px] px-2 py-1 rounded text-rose-600 hover:bg-rose-50 inline-flex items-center gap-1"
                            title="Desvincular este secundario"
                          >
                            <Trash2 className="h-3 w-3" /> Desvincular
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <div className="text-slate-500">
            Página {page} de {totalPages} · {total} resultados
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 rounded border border-slate-300 bg-white disabled:opacity-50"
            >
              ← Anterior
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 rounded border border-slate-300 bg-white disabled:opacity-50"
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
