/**
 * VinculosRevision — página de admin para revisar vinculaciones automáticas
 * y aprobar/rechazar fusiones de grupos pendientes.
 *
 * Dos tabs:
 *   - Auto-vinculaciones: lista plana de los overrides creados por batches
 *   - Fusiones de grupos: pares (grupo A, grupo B) que comparten reservas
 *     pero quedaron en grupos separados — el admin decide fusionar o ignorar
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  Loader2, Search, ExternalLink, Trash2, CheckCircle2, X,
  Merge, AlertTriangle, RefreshCw, Filter,
} from "lucide-react";
import { formatDoc } from "@/lib/docTipo";

const fmtMoney = (n) => {
  const v = Number(n || 0);
  if (v >= 1000000) return `S/ ${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `S/ ${Math.round(v / 1000)}k`;
  return `S/ ${Math.round(v)}`;
};

export default function VinculosRevision() {
  const [tab, setTab] = useState("fusiones"); // 'fusiones' | 'auto'

  return (
    <div className="px-6 py-5 max-w-7xl mx-auto">
      <div className="mb-5">
        <h1 className="text-3xl font-bold tracking-tight">Revisión de vinculaciones</h1>
        <div className="text-xs text-slate-500 uppercase tracking-wider mt-1.5">
          Auditoría de auto-vinculaciones · fusión de grupos relacionados
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 mb-5">
        <div className="flex gap-1">
          <button
            onClick={() => setTab("fusiones")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "fusiones" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Fusiones de grupos
          </button>
          <button
            onClick={() => setTab("auto")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "auto" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Auto-vinculaciones
          </button>
        </div>
      </div>

      {tab === "fusiones" ? <FusionesTab /> : <AutoVinculosTab />}
    </div>
  );
}

// ───────────────────────────── Tab Fusiones ─────────────────────────────
function FusionesTab() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [minReservas, setMinReservas] = useState(1);
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const limit = 25;

  // Debounce búsqueda
  useEffect(() => {
    const t = setTimeout(() => { setQ(qInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/vinculos/fusiones", {
        params: { page, limit, min_reservas: minReservas, q: q || undefined },
      });
      setItems(r.data?.items || []);
      setTotal(r.data?.total || 0);
    } catch (e) {
      toast.error("Error cargando fusiones");
    } finally {
      setLoading(false);
    }
  }, [page, minReservas, q]);

  useEffect(() => { cargar(); }, [cargar]);

  // Optimistic: quita la card de la lista inmediatamente
  const removeItem = (item) => {
    setItems(prev => prev.filter(it =>
      !(it.grupo_a === item.grupo_a && it.grupo_b === item.grupo_b)
    ));
    setTotal(t => Math.max(0, t - 1));
  };

  const handleFusionar = async (item, ganador) => {
    const perdedorName = ganador === item.grupo_a ? item.name_b : item.name_a;
    const ganadorName = ganador === item.grupo_a ? item.name_a : item.name_b;
    if (!window.confirm(`¿Fusionar "${perdedorName}" como secundario de "${ganadorName}"?`)) return;

    // Optimistic: quitar inmediatamente
    removeItem(item);

    try {
      await api.post("/admin/vinculos/fusiones/aplicar", {
        grupo_a: item.grupo_a,
        grupo_b: item.grupo_b,
        ganador,
      });
      toast.success(`Fusionado: ${perdedorName} → ${ganadorName}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error al fusionar");
      cargar();  // restaurar si hubo error
    }
  };

  const handleIgnorar = async (item) => {
    removeItem(item);  // optimistic
    try {
      await api.post("/admin/vinculos/fusiones/ignorar", {
        grupo_a: item.grupo_a,
        grupo_b: item.grupo_b,
        motivo: null,
      });
      toast.success("Par descartado");
    } catch (e) {
      toast.error("Error al ignorar");
      cargar();
    }
  };

  const [bulkRunning, setBulkRunning] = useState(false);

  const runBulk = async (endpoint, msgConfirm) => {
    if (!window.confirm(msgConfirm)) return;
    setBulkRunning(true);
    try {
      const r = await api.post(endpoint);
      toast.success(`✓ ${r.data.fusionados} fusiones aplicadas (de ${r.data.total_detectados} detectadas)`, { duration: 6000 });
      cargar();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error en bulk");
    } finally {
      setBulkRunning(false);
    }
  };

  const handleBulkMismoNombre = () => runBulk(
    "/admin/vinculos/fusiones/aplicar-bulk-mismo-nombre",
    "Esto va a fusionar AUTOMÁTICAMENTE todos los pares con nombre exacto idéntico. ¿Continuar?"
  );
  const handleBulkMismoTelefono = () => runBulk(
    "/admin/vinculos/fusiones/aplicar-bulk-mismo-telefono",
    "Esto va a fusionar AUTOMÁTICAMENTE todos los pares cuyo teléfono normalizado coincide (mismo número aunque escrito distinto). ¿Continuar?"
  );

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      {/* Filtros + bulk */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="text-sm text-slate-600 whitespace-nowrap">
            <b>{total}</b> pares
          </div>
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Buscar por nombre (A o B)..."
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleBulkMismoNombre}
            disabled={bulkRunning || loading}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 font-medium"
            title="Fusiona automáticamente todos los pares con nombre exacto idéntico"
          >
            {bulkRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Bulk "mismo nombre"
          </button>
          <button
            onClick={handleBulkMismoTelefono}
            disabled={bulkRunning || loading}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60 font-medium"
            title="Fusiona automáticamente todos los pares cuyo teléfono normalizado coincide"
          >
            {bulkRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Bulk "mismo tel"
          </button>
          <label className="text-xs text-slate-600 flex items-center gap-1.5 whitespace-nowrap">
            Mín. res:
            <input
              type="number"
              min="1"
              value={minReservas}
              onChange={(e) => { setMinReservas(Number(e.target.value) || 1); setPage(1); }}
              className="w-12 px-2 py-1 text-sm border border-slate-300 rounded"
            />
          </label>
          <button
            onClick={cargar}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-slate-500 italic">
          No quedan fusiones pendientes 🎉
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <FusionCard
              key={`${it.grupo_a}-${it.grupo_b}`}
              item={it}
              onFusionar={handleFusionar}
              onIgnorar={handleIgnorar}
            />
          ))}
        </div>
      )}

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-5 text-sm">
          <div className="text-slate-500">Página {page} de {totalPages}</div>
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

// Una card que muestra dos grupos lado a lado con sus stats
function FusionCard({ item, onFusionar, onIgnorar }) {
  const ventasMayor = Math.max(item.ventas_a || 0, item.ventas_b || 0);
  const sugeridoGanador = (item.ventas_a >= item.ventas_b) ? item.grupo_a : item.grupo_b;
  const sugeridoName    = (item.ventas_a >= item.ventas_b) ? item.name_a : item.name_b;
  // Score combinado: cuántos matches tiene (más matches = más probable fusión)
  const nMatches = (item.match_nombre ? 2 : 0) + (item.match_apellido ? 1 : 0)
                 + (item.match_depto ? 1 : 0) + (item.match_distrito ? 1 : 0)
                 + (item.match_telefono ? 2 : 0);
  const altaConfianza = nMatches >= 2;  // 2+ señales = alta confianza

  return (
    <div className={`border rounded-lg p-3 ${altaConfianza ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200 bg-white"}`}>
      {/* Header con score + match badges */}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          {item.match_nombre && (
            <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-800">
              ⭐ mismo nombre
            </span>
          )}
          {item.match_apellido && !item.match_nombre && (
            <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
              👨‍👩‍👧 mismo apellido
            </span>
          )}
          {item.match_depto && (
            <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-sky-100 text-sky-700">
              📍 mismo depto
            </span>
          )}
          {item.match_distrito && (
            <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-sky-100 text-sky-700">
              🏘️ mismo distrito
            </span>
          )}
          {item.match_telefono && (
            <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
              📞 mismo tel
            </span>
          )}
          <span className="text-[10px] text-slate-500 font-medium">
            · {item.reservas_compartidas} reservas
          </span>
        </div>
        <div className="text-[10px] text-slate-500">
          Sugerencia: <b className="text-emerald-700">{sugeridoName}</b>
        </div>
      </div>

      {/* Dos lados */}
      <div className="grid grid-cols-2 gap-3">
        <GroupCard
          item={item}
          side="a"
          isWinner={sugeridoGanador === item.grupo_a}
        />
        <GroupCard
          item={item}
          side="b"
          isWinner={sugeridoGanador === item.grupo_b}
        />
      </div>

      {/* Acciones */}
      <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-slate-100">
        <button
          onClick={() => onIgnorar(item)}
          className="text-xs px-2.5 py-1.5 rounded text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1"
          title="No son la misma empresa — descartar permanentemente"
        >
          <X className="h-3.5 w-3.5" /> Ignorar
        </button>
        <button
          onClick={() => onFusionar(item, item.grupo_b)}
          className="text-xs px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 inline-flex items-center gap-1"
          title={`Fusionar A → B (todos los miembros de "${item.name_a}" pasan al grupo de "${item.name_b}")`}
        >
          <Merge className="h-3.5 w-3.5" /> A → B
        </button>
        <button
          onClick={() => onFusionar(item, item.grupo_a)}
          className="text-xs px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 inline-flex items-center gap-1"
          title={`Fusionar B → A (todos los miembros de "${item.name_b}" pasan al grupo de "${item.name_a}")`}
        >
          <Merge className="h-3.5 w-3.5" /> B → A
        </button>
        <button
          onClick={() => onFusionar(item, sugeridoGanador)}
          className="text-xs px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1 font-medium"
          title={`Aplicar sugerencia: ${sugeridoName} absorbe el otro grupo`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> Aplicar sugerencia
        </button>
      </div>
    </div>
  );
}

function GroupCard({ item, side, isWinner }) {
  const id        = side === "a" ? item.grupo_a : item.grupo_b;
  const name      = side === "a" ? item.name_a  : item.name_b;
  const vat       = side === "a" ? item.vat_a   : item.vat_b;
  const catalog   = side === "a" ? item.catalog_06_a : item.catalog_06_b;
  const ventas    = side === "a" ? item.ventas_a : item.ventas_b;
  const miembros  = side === "a" ? item.miembros_a : item.miembros_b;
  const depto     = side === "a" ? item.depto_a    : item.depto_b;
  const distrito  = side === "a" ? item.distrito_a : item.distrito_b;
  const direccion = side === "a" ? item.direccion_a : item.direccion_b;
  const telefono  = side === "a" ? item.telefono_a  : item.telefono_b;

  // Highlight colors según matches (mostrar en VERDE si coincide entre A y B)
  const matchDepto = item.match_depto && depto;
  const matchDistrito = item.match_distrito && distrito;
  const matchTel = item.match_telefono && telefono;

  return (
    <div className={`border rounded-md p-2.5 ${isWinner ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link to={`/cuentas/${id}`} className="font-medium text-slate-900 hover:underline truncate block" title={name}>
            {name || `#${id}`}
          </Link>
          <div className="text-[11px] text-slate-500 font-mono">
            #{id}{vat && ` · ${formatDoc({ vat, catalog_06_name: catalog })}`}
          </div>
        </div>
        {isWinner && (
          <span className="text-[9px] uppercase font-bold tracking-wider px-1 py-0.5 rounded bg-emerald-200 text-emerald-800 flex-shrink-0">
            🏆 sugerido
          </span>
        )}
      </div>

      {/* Datos geográficos + contacto */}
      <div className="mt-2 space-y-1 text-[11px]">
        {(depto || distrito) && (
          <div className={`${matchDepto || matchDistrito ? "text-emerald-700 font-medium" : "text-slate-600"}`}>
            <span className="text-slate-400">📍</span>
            {depto && <span className={matchDepto ? "bg-emerald-100 px-1 rounded" : ""}>{depto}</span>}
            {depto && distrito && " · "}
            {distrito && <span className={matchDistrito ? "bg-emerald-100 px-1 rounded" : ""}>{distrito}</span>}
          </div>
        )}
        {direccion && (
          <div className="text-slate-600 truncate" title={direccion}>
            <span className="text-slate-400">🏠</span> {direccion}
          </div>
        )}
        {telefono && (
          <div className={matchTel ? "text-emerald-700 font-medium" : "text-slate-600"}>
            <span className="text-slate-400">📞</span>{" "}
            <span className={matchTel ? "bg-emerald-100 px-1 rounded" : ""}>{telefono}</span>
          </div>
        )}
      </div>

      {/* Miembros y ventas */}
      <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-100 text-xs">
        <div>
          <div className="text-[9px] uppercase tracking-wider text-slate-500">Miembros</div>
          <div className="font-mono font-semibold text-slate-700">{miembros}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider text-slate-500">Ventas hist.</div>
          <div className="font-mono font-semibold text-slate-700">{fmtMoney(ventas)}</div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── Tab Auto-vinculaciones ─────────────────────────────
function AutoVinculosTab() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [page, setPage] = useState(1);
  const limit = 50;

  useEffect(() => {
    const t = setTimeout(() => { setQ(qInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/vinculos/auto", { params: { q, page, limit } });
      setItems(r.data?.items || []);
      setTotal(r.data?.total || 0);
    } catch (e) {
      toast.error("Error cargando auto-vinculaciones");
    } finally {
      setLoading(false);
    }
  }, [q, page]);

  useEffect(() => { cargar(); }, [cargar]);

  const handleDesvincular = async (it) => {
    if (!window.confirm(`¿Desvincular "${it.secundario_nombre}" de "${it.principal_nombre}"?\n\nEl secundario volverá a ser cuenta independiente.`)) return;
    try {
      await api.delete(`/cuentas/${it.secundario_id}/desvincular`);
      toast.success("Desvinculado");
      cargar();
    } catch (e) {
      toast.error("Error al desvincular");
    }
  };

  const invertidos = useMemo(() => items.filter(i => (i.ventas_sec || 0) > (i.ventas_pri || 0)), [items]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Buscar secundario o principal..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
          />
        </div>
        <div className="text-sm text-slate-600">
          <b>{total}</b> auto-vinculaciones
          {invertidos.length > 0 && (
            <span className="ml-3 text-amber-700">
              <AlertTriangle className="inline h-3.5 w-3.5 mr-1" />
              {invertidos.length} con ventas invertidas
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-slate-500 italic">No hay auto-vinculaciones para mostrar.</div>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider text-slate-600 font-semibold">Secundario</th>
                <th className="text-right px-3 py-2 text-[11px] uppercase tracking-wider text-slate-600 font-semibold">Ventas sec</th>
                <th className="text-center px-3 py-2 text-[11px] uppercase tracking-wider text-slate-600 font-semibold">→</th>
                <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider text-slate-600 font-semibold">Principal</th>
                <th className="text-right px-3 py-2 text-[11px] uppercase tracking-wider text-slate-600 font-semibold">Ventas pri</th>
                <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider text-slate-600 font-semibold">Origen</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((it) => {
                const invertido = (it.ventas_sec || 0) > (it.ventas_pri || 0);
                return (
                  <tr key={it.override_id} className={`hover:bg-slate-50 ${invertido ? "bg-amber-50/30" : ""}`}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900 truncate max-w-[260px]" title={it.secundario_nombre}>
                        {it.secundario_nombre}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">#{it.secundario_id}{it.secundario_vat && ` · ${formatDoc({ vat: it.secundario_vat, catalog_06_name: it.secundario_catalog_06_name })}`}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{fmtMoney(it.ventas_sec)}</td>
                    <td className="px-3 py-2 text-center text-slate-400">→</td>
                    <td className="px-3 py-2">
                      <Link to={`/cuentas/${it.principal_id}`} className="font-medium text-violet-700 hover:underline truncate max-w-[260px] block" title={it.principal_nombre}>
                        {it.principal_nombre || `#${it.principal_id}`}
                      </Link>
                      <div className="text-[10px] text-slate-500 font-mono">#{it.principal_id}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-semibold">{fmtMoney(it.ventas_pri)}</td>
                    <td className="px-3 py-2">
                      <div className="text-[10px] text-slate-500 italic truncate max-w-[200px]" title={it.nota}>
                        {it.nota?.replace("auto-vinculado ", "").substring(0, 50)}
                      </div>
                      {invertido && (
                        <span className="text-[9px] uppercase font-bold text-amber-700">
                          ⚠ invertido
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button
                        onClick={() => handleDesvincular(it)}
                        className="text-[11px] px-2 py-1 rounded text-rose-600 hover:bg-rose-50 inline-flex items-center gap-1"
                      >
                        <Trash2 className="h-3 w-3" /> Desvincular
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <div className="text-slate-500">Página {page} de {totalPages}</div>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded border border-slate-300 bg-white disabled:opacity-50">← Anterior</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 rounded border border-slate-300 bg-white disabled:opacity-50">Siguiente →</button>
          </div>
        </div>
      )}
    </div>
  );
}
