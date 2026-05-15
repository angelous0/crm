/**
 * RepartoCartera — pantalla admin para asignar cuentas a vendedoras en bloque.
 *
 * Estructura:
 *   ┌─ KPIs: Total · Sin asignar · Asignadas · % asignación ───┐
 *   ├─ Conteo por vendedora (chips) ───────────────────────────┤
 *   ├─ Top deptos sin asignar (mini tabla) ────────────────────┤
 *   ├─ Filtros: search · depto · tier · estado · min compras ──┤
 *   ├─ Tabla con multi-select ─────────────────────────────────┤
 *   └─ Bottom bar (sticky) cuando hay selección ───────────────┘
 *
 * Fuente:
 *   - GET  /api/reparto/resumen → KPIs + por_vendedora + por_depto
 *   - GET  /api/reparto/cuentas → listado paginado filtrable
 *   - POST /api/admin/carteras/asignar → asignar cuentas[]
 *   - POST /api/admin/carteras/remover → remover cuentas[]
 *
 * Solo admin/supervisor.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2, AlertCircle, Search, X as XIcon, RefreshCw,
  Users, UserPlus, UserMinus, Phone, MapPin, Filter,
  TrendingUp, ChevronLeft, ChevronRight, Check, Layers,
} from "lucide-react";

// ─── Formateadores ───────────────────────────────────────────────────
const fmtMoney = (n) => "S/ " + Number(n || 0).toLocaleString("es-PE", { maximumFractionDigits: 0 });
const fmtMoneyShort = (n) => {
  const v = Number(n || 0);
  if (v >= 1e6) return "S/ " + (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return "S/ " + (v / 1e3).toFixed(1) + "k";
  return "S/ " + Math.round(v);
};
const fmtNum = (n) => Number(n || 0).toLocaleString("es-PE");
const fmtDate = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit" });
};
const fmtRecencia = (dias) => {
  if (dias == null) return "—";
  if (dias === 0) return "hoy";
  if (dias < 30) return `${dias}d`;
  if (dias < 365) return `${Math.round(dias / 30)}m`;
  return `${(dias / 365).toFixed(1)}a`;
};

// ─── Estilos por estado/tier ─────────────────────────────────────────
const ESTADO_STYLE = {
  vip:       { bg: "bg-purple-50",  text: "text-purple-700", label: "VIP" },
  activo:    { bg: "bg-emerald-50", text: "text-emerald-700",label: "Activo" },
  nuevo:     { bg: "bg-blue-50",    text: "text-blue-700",   label: "Nuevo" },
  en_riesgo: { bg: "bg-amber-50",   text: "text-amber-700",  label: "En riesgo" },
  dormido:   { bg: "bg-orange-50",  text: "text-orange-700", label: "Dormido" },
  perdido:   { bg: "bg-red-50",     text: "text-red-700",    label: "Perdido" },
  sin_data:  { bg: "bg-slate-100",  text: "text-slate-500",  label: "Sin data" },
};

// Clasificación (4 niveles por percentil de depto)
const TIER_STYLE = {
  estrella: { bg: "#FCD34D", text: "#78350F" },  // dorado
  alto:     { bg: "#DBEAFE", text: "#1E40AF" },  // azul claro
  medio:    { bg: "#E5E7EB", text: "#374151" },  // gris
  bajo:     { bg: "#FDE4D3", text: "#7C2D12" },  // beige
};

// ─── KpiTile reutilizable ────────────────────────────────────────────
function KpiTile({ label, value, sub, color }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
      <div className="text-[10px] font-mono uppercase font-medium" style={{ color: "var(--ink-3)", letterSpacing: "0.14em" }}>
        {label}
      </div>
      <div className="text-2xl leading-none font-semibold tracking-tight tabular-nums mt-1" style={{ fontFamily: "var(--font-display)", color: color || "var(--ink)" }}>
        {value}
      </div>
      {sub && <div className="text-[11px] mt-1" style={{ color: "var(--ink-3)" }}>{sub}</div>}
    </div>
  );
}

// ─── Chip de vendedora ───────────────────────────────────────────────
function VendedoraChip({ v, onClick, active }) {
  return (
    <button
      onClick={() => onClick(v.username)}
      className={`px-2.5 py-1 rounded-full text-[11px] inline-flex items-center gap-1.5 border transition-all ${
        active
          ? "bg-slate-900 text-white border-slate-900"
          : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
      }`}
      title={`${v.cuentas} cuentas asignadas`}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: v.color_hex || "#94a3b8" }}
      />
      <span className="font-medium">{v.nombre_completo || v.username}</span>
      <span className="font-mono tabular-nums opacity-70">{v.cuentas}</span>
    </button>
  );
}

// ─── Página principal ────────────────────────────────────────────────
export default function RepartoCartera() {
  const { user } = useAuth();
  const isAdmin = user?.rol === "admin" || user?.rol === "supervisor";

  // Estado
  const [resumen, setResumen] = useState(null);
  const [items, setItems]     = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError]     = useState(null);

  // Filtros
  const [q, setQ]                       = useState("");
  const [qDebounced, setQDebounced]     = useState("");
  const [depto, setDepto]               = useState("");
  const [tier, setTier]                 = useState("");
  const [estadoAuto, setEstadoAuto]     = useState("");
  const [asignacion, setAsignacion]     = useState("sin");  // sin | asignada | todas
  const [asignadoA, setAsignadoA]       = useState("");      // vendedora específica
  const [minOrders, setMinOrders]       = useState(0);
  const [soloConTelefono, setSoloConTel]= useState(false);
  const [soloNoMayoristas, setSoloNoMayo] = useState(false);
  const [sort, setSort]                 = useState("amount_12m");
  const [sortDir, setSortDir]           = useState("desc");
  const [page, setPage]                 = useState(1);

  // Selección
  const [selected, setSelected] = useState(new Set());

  // Asignar/remover
  const [targetUsername, setTarget] = useState("");
  const [applying, setApplying]     = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Fetch resumen
  const fetchResumen = useCallback(async () => {
    try {
      const r = await api.get("/reparto/resumen");
      setResumen(r.data);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message);
    }
  }, []);

  // Fetch lista
  const fetchList = useCallback(async () => {
    setLoadingList(true);
    try {
      const params = {
        q: qDebounced || undefined,
        depto: depto || undefined,
        tier: tier || undefined,
        estado_auto: estadoAuto || undefined,
        asignacion,
        asignado_a: asignadoA || undefined,
        min_orders_12m: minOrders || undefined,
        solo_con_telefono: soloConTelefono || undefined,
        solo_no_mayoristas: soloNoMayoristas || undefined,
        sort, dir: sortDir,
        page, limit: 50,
      };
      const r = await api.get("/reparto/cuentas", { params });
      setItems(r.data.items || []);
      setTotal(r.data.total || 0);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message);
    } finally {
      setLoadingList(false);
      setLoading(false);
    }
  }, [qDebounced, depto, tier, estadoAuto, asignacion, asignadoA,
      minOrders, soloConTelefono, soloNoMayoristas, sort, sortDir, page]);

  // Inicial
  useEffect(() => { fetchResumen(); }, [fetchResumen]);
  useEffect(() => { fetchList(); }, [fetchList]);

  // Resetear página al cambiar filtros
  useEffect(() => { setPage(1); }, [qDebounced, depto, tier, estadoAuto, asignacion, asignadoA, minOrders, soloConTelefono, soloNoMayoristas]);

  // Limpiar selección al cambiar página
  useEffect(() => { setSelected(new Set()); }, [page, qDebounced, depto, tier, estadoAuto, asignacion]);

  // ─── Selección ──
  const toggleOne = (cuenta_id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(cuenta_id)) next.delete(cuenta_id);
      else next.add(cuenta_id);
      return next;
    });
  };

  const allPageSelected = items.length > 0 && items.every(i => selected.has(i.cuenta_id));
  const togglePage = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allPageSelected) items.forEach(i => next.delete(i.cuenta_id));
      else items.forEach(i => next.add(i.cuenta_id));
      return next;
    });
  };

  // ─── Aplicar acción ──
  const handleAsignar = async () => {
    if (!targetUsername) {
      toast.error("Selecciona una vendedora");
      return;
    }
    if (selected.size === 0) {
      toast.error("Selecciona al menos 1 cuenta");
      return;
    }
    if (!window.confirm(
      `Asignar ${selected.size} cuenta(s) a ${targetUsername}?\n\n` +
      `Si alguna ya tenía dueño, se le quitará y pasará a ${targetUsername}.`
    )) return;

    setApplying(true);
    try {
      await api.post("/admin/carteras/asignar", {
        username: targetUsername,
        cuenta_ids: Array.from(selected),
      });
      toast.success(`${selected.size} cuenta(s) asignada(s) a ${targetUsername}`);
      setSelected(new Set());
      await Promise.all([fetchList(), fetchResumen()]);
    } catch (e) {
      toast.error("Error: " + (e?.response?.data?.detail || e.message));
    } finally {
      setApplying(false);
    }
  };

  const handleDesasignar = async () => {
    if (selected.size === 0) {
      toast.error("Selecciona al menos 1 cuenta");
      return;
    }
    // Para desasignar, agrupo por vendedora y llamo /remover por cada una
    const porVendedora = {};
    items.forEach(i => {
      if (selected.has(i.cuenta_id) && i.asignado_a) {
        (porVendedora[i.asignado_a] ||= []).push(i.cuenta_id);
      }
    });
    if (Object.keys(porVendedora).length === 0) {
      toast.error("Ninguna de las seleccionadas está asignada");
      return;
    }
    const totalDes = Object.values(porVendedora).reduce((a, b) => a + b.length, 0);
    if (!window.confirm(`Desasignar ${totalDes} cuenta(s) de ${Object.keys(porVendedora).length} vendedora(s)?`)) return;

    setApplying(true);
    try {
      for (const [username, ids] of Object.entries(porVendedora)) {
        await api.post("/admin/carteras/remover", { username, cuenta_ids: ids });
      }
      toast.success(`${totalDes} cuenta(s) desasignada(s)`);
      setSelected(new Set());
      await Promise.all([fetchList(), fetchResumen()]);
    } catch (e) {
      toast.error("Error: " + (e?.response?.data?.detail || e.message));
    } finally {
      setApplying(false);
    }
  };

  // ─── UI memos ──
  const vendedoras = useMemo(
    () => (resumen?.por_vendedora || []).filter(v => v.rol === "vendedora"),
    [resumen]
  );

  const totalPages = Math.max(1, Math.ceil(total / 50));

  if (!isAdmin) {
    return (
      <div className="px-6 py-8 text-center text-slate-500">
        Solo admin o supervisor pueden acceder al reparto de cartera.
      </div>
    );
  }

  return (
    <div className="px-6 py-4 max-w-[1400px]">
      {/* ─── Header ─── */}
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            Reparto de cartera
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Asignar cuentas a vendedoras en bloque. Una cuenta solo puede tener una vendedora a la vez.
          </p>
        </div>
        <Button
          size="sm" variant="ghost"
          onClick={() => { fetchResumen(); fetchList(); }}
          className="h-8 w-8 p-0"
          title="Refrescar"
        >
          {loadingList ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {/* ─── Alerta: nuevos partners sin flag mayorista ─── */}
      {resumen?.no_mayoristas > 0 && (
        <div className={`mb-4 border rounded-lg px-4 py-3 flex items-center gap-3 ${
          soloNoMayoristas ? "bg-red-100 border-red-300" : "bg-amber-50 border-amber-200"
        }`}>
          <AlertCircle className={`h-5 w-5 shrink-0 ${soloNoMayoristas ? "text-red-700" : "text-amber-700"}`} />
          <div className="flex-1 text-sm">
            <span className="font-semibold">{resumen.no_mayoristas}</span> partner{resumen.no_mayoristas !== 1 ? "s" : ""} sin marcar como mayorista
            <span className="text-slate-600 ml-2">— probable trabajador, proveedor o consumidor final. Revisa para inactivar o confirmar.</span>
          </div>
          <Button
            size="sm"
            variant={soloNoMayoristas ? "default" : "outline"}
            onClick={() => setSoloNoMayo(!soloNoMayoristas)}
            className="h-7 text-xs"
          >
            {soloNoMayoristas ? "Quitar filtro" : "Revisar ahora"}
          </Button>
        </div>
      )}

      {/* ─── KPIs agregados ─── */}
      {resumen && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <KpiTile label="Total cuentas" value={fmtNum(resumen.total)} sub="activas" />
          <KpiTile
            label="Sin asignar"
            value={fmtNum(resumen.sin_asignar)}
            sub={`${Math.round((resumen.sin_asignar / Math.max(1, resumen.total)) * 100)}% del total`}
            color={resumen.sin_asignar > 0 ? "#DC2626" : "var(--ink)"}
          />
          <KpiTile
            label="Asignadas"
            value={fmtNum(resumen.asignadas)}
            sub={`${vendedoras.length} vendedoras`}
            color="#059669"
          />
          <KpiTile
            label="% Asignación"
            value={`${Math.round(resumen.pct_asignacion)}%`}
            sub={resumen.pct_asignacion >= 90 ? "casi completa" : resumen.pct_asignacion >= 50 ? "en progreso" : "por hacer"}
          />
        </div>
      )}

      {/* ─── Por vendedora (chips) ─── */}
      {vendedoras.length > 0 && (
        <div className="mb-4 bg-white border border-slate-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-mono uppercase font-medium" style={{ color: "var(--ink-3)", letterSpacing: "0.14em" }}>
              Por vendedora
            </div>
            {asignadoA && (
              <button
                onClick={() => setAsignadoA("")}
                className="text-[10px] text-slate-500 hover:text-slate-900 inline-flex items-center gap-0.5"
              >
                <XIcon className="h-3 w-3" /> limpiar filtro
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {vendedoras.map(v => (
              <VendedoraChip
                key={v.username}
                v={v}
                active={asignadoA === v.username}
                onClick={(uname) => {
                  setAsignadoA(asignadoA === uname ? "" : uname);
                  setAsignacion("asignada");
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ─── Top deptos sin asignar ─── */}
      {resumen?.por_depto && resumen.por_depto.length > 0 && (
        <div className="mb-4 bg-white border border-slate-200 rounded-lg p-3">
          <div className="text-[10px] font-mono uppercase font-medium mb-2" style={{ color: "var(--ink-3)", letterSpacing: "0.14em" }}>
            Top deptos sin asignar
          </div>
          <div className="flex flex-wrap gap-1.5">
            {resumen.por_depto.slice(0, 12).filter(d => d.sin_asignar > 0).map(d => (
              <button
                key={d.depto}
                onClick={() => setDepto(depto === d.depto ? "" : d.depto)}
                className={`px-2 py-1 rounded text-[11px] inline-flex items-center gap-1 border transition-colors ${
                  depto === d.depto
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-400"
                }`}
              >
                <MapPin className="h-2.5 w-2.5" />
                <span className="font-medium">{d.depto}</span>
                <span className="font-mono tabular-nums opacity-70">{d.sin_asignar}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── Filtros ─── */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 mb-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar nombre, RUC, teléfono…"
              value={q}
              onChange={e => setQ(e.target.value)}
              className="w-full h-8 pl-7 pr-2 text-sm border border-slate-200 rounded bg-white"
            />
          </div>

          {/* Asignación */}
          <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
            {[
              { k: "sin",      l: "Sin asignar" },
              { k: "asignada", l: "Asignadas" },
              { k: "todas",    l: "Todas" },
            ].map(opt => (
              <button
                key={opt.k}
                onClick={() => setAsignacion(opt.k)}
                className={`px-2 py-0.5 rounded text-[11px] transition-all ${
                  asignacion === opt.k
                    ? "bg-white shadow-sm text-slate-900"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {opt.l}
              </button>
            ))}
          </div>

          {/* Tier */}
          <select
            value={tier}
            onChange={e => setTier(e.target.value)}
            className="h-8 px-2 text-xs border border-slate-200 rounded bg-white"
          >
            <option value="">Todas las clasif.</option>
            <option value="estrella">Estrella</option>
            <option value="alto">Alto</option>
            <option value="medio">Medio</option>
            <option value="bajo">Bajo</option>
          </select>

          {/* Estado_auto */}
          <select
            value={estadoAuto}
            onChange={e => setEstadoAuto(e.target.value)}
            className="h-8 px-2 text-xs border border-slate-200 rounded bg-white"
          >
            <option value="">Todos los estados</option>
            <option value="vip">VIP</option>
            <option value="activo">Activo</option>
            <option value="nuevo">Nuevo</option>
            <option value="en_riesgo">En riesgo</option>
            <option value="dormido">Dormido</option>
            <option value="perdido">Perdido</option>
          </select>

          {/* Min orders */}
          <div className="inline-flex items-center gap-1 text-[11px] text-slate-600">
            <span>Mín. compras 12m:</span>
            <input
              type="number" min={0}
              value={minOrders}
              onChange={e => setMinOrders(parseInt(e.target.value) || 0)}
              className="w-12 h-7 px-1 text-xs text-center border border-slate-200 rounded bg-white tabular-nums"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap text-[11px]">
          <label className="inline-flex items-center gap-1.5 text-slate-600 cursor-pointer">
            <input type="checkbox" checked={soloConTelefono} onChange={e => setSoloConTel(e.target.checked)} />
            <Phone className="h-3 w-3" /> Solo con teléfono
          </label>

          <div className="ml-auto inline-flex items-center gap-1 text-slate-500">
            <Filter className="h-3 w-3" />
            <span>Orden:</span>
            <select
              value={`${sort}_${sortDir}`}
              onChange={e => {
                const [s, d] = e.target.value.split("_");
                setSort(s); setSortDir(d);
              }}
              className="h-7 px-1.5 text-[11px] border border-slate-200 rounded bg-white"
            >
              <option value="amount_12m_desc">$ últimos 12m ↓</option>
              <option value="amount_12m_asc">$ últimos 12m ↑</option>
              <option value="orders_12m_desc">Órdenes 12m ↓</option>
              <option value="last_purchase_desc">Última compra ↓</option>
              <option value="last_purchase_asc">Última compra ↑</option>
              <option value="prioridad_desc">Prioridad ↓</option>
              <option value="nombre_asc">Nombre A-Z</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-3 border border-red-200 rounded p-3 flex items-center gap-2 text-sm bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {/* ─── Tabla ─── */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div className="text-[11px] text-slate-600">
            <span className="font-medium tabular-nums">{fmtNum(total)}</span> cuenta{total !== 1 ? "s" : ""}
            {selected.size > 0 && (
              <> · <span className="font-semibold text-slate-900">{selected.size}</span> seleccionada{selected.size !== 1 ? "s" : ""}</>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || loadingList}
              className="h-6 w-6 rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-30 inline-flex items-center justify-center"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
            <span className="text-[11px] tabular-nums text-slate-600">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loadingList}
              className="h-6 w-6 rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-30 inline-flex items-center justify-center"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            <Loader2 className="h-4 w-4 animate-spin inline-block mr-1.5" /> Cargando…
          </div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm italic">
            Sin cuentas con esos filtros
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/30">
                  <th className="px-3 py-2 text-left w-8">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={togglePage}
                      className="cursor-pointer"
                    />
                  </th>
                  <th className="px-2 py-2 text-left font-mono uppercase text-[9px] text-slate-500 tracking-wider">Nombre</th>
                  <th className="px-2 py-2 text-left font-mono uppercase text-[9px] text-slate-500 tracking-wider">Doc / Tel</th>
                  <th className="px-2 py-2 text-left font-mono uppercase text-[9px] text-slate-500 tracking-wider">Depto</th>
                  <th className="px-2 py-2 text-left font-mono uppercase text-[9px] text-slate-500 tracking-wider">Estado</th>
                  <th className="px-2 py-2 text-right font-mono uppercase text-[9px] text-slate-500 tracking-wider">Órdenes 12m</th>
                  <th className="px-2 py-2 text-right font-mono uppercase text-[9px] text-slate-500 tracking-wider">$ 12m</th>
                  <th className="px-2 py-2 text-left font-mono uppercase text-[9px] text-slate-500 tracking-wider">Última</th>
                  <th className="px-2 py-2 text-left font-mono uppercase text-[9px] text-slate-500 tracking-wider">Asignada a</th>
                </tr>
              </thead>
              <tbody>
                {items.map(c => {
                  const isSel = selected.has(c.cuenta_id);
                  const est = ESTADO_STYLE[c.estado_auto] || ESTADO_STYLE.sin_data;
                  const tierStyle = TIER_STYLE[c.tier];
                  return (
                    <tr
                      key={c.cuenta_id}
                      onClick={() => toggleOne(c.cuenta_id)}
                      className={`border-b border-slate-100 cursor-pointer transition-colors ${
                        isSel ? "bg-emerald-50/60 hover:bg-emerald-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={isSel} onChange={() => toggleOne(c.cuenta_id)} className="cursor-pointer" />
                      </td>
                      <td className="px-2 py-2 max-w-[260px]">
                        <div className="font-medium text-slate-900 truncate" title={c.nombre}>
                          {c.nombre}
                        </div>
                        {c.distrito && (
                          <div className="text-[10px] text-slate-500 truncate">{c.distrito}</div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-[10px] text-slate-600 font-mono">
                        {c.vat && (
                          <div>
                            {c.doc_tipo_name ? `${c.doc_tipo_name.slice(0, 3).toUpperCase()} ` : ""}
                            {c.vat}
                          </div>
                        )}
                        {(c.phone || c.mobile) && (
                          <div className="flex items-center gap-0.5 text-emerald-700">
                            <Phone className="h-2.5 w-2.5" />
                            {c.mobile || c.phone}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-slate-600">
                        {c.depto || "—"}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-col gap-0.5">
                          <span className={`inline-block px-1.5 py-0 rounded text-[9px] font-medium ${est.bg} ${est.text}`}>
                            {est.label}
                          </span>
                          {c.tier && tierStyle && (
                            <span
                              className="inline-block px-1.5 py-0 rounded text-[9px] font-bold uppercase"
                              style={{ background: tierStyle.bg, color: tierStyle.text }}
                            >
                              {c.tier}
                            </span>
                          )}
                          {/* Alerta inline si NO es mayorista (todos deberían serlo) */}
                          {!c.mayorista && (
                            <span className="inline-block px-1.5 py-0 rounded text-[9px] bg-red-50 text-red-700 font-medium" title="Partner sin flag mayorista — revisar">
                              ⚠ no-may
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {fmtNum(c.orders_12m)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums font-medium">
                        {fmtMoneyShort(c.amount_12m)}
                      </td>
                      <td className="px-2 py-2 text-[10px] text-slate-500">
                        <div>{fmtDate(c.last_purchase_date)}</div>
                        {c.recencia_dias > 0 && (
                          <div className="text-slate-400">hace {fmtRecencia(c.recencia_dias)}</div>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {c.asignado_a ? (
                          <div className="inline-flex items-center gap-1 text-[11px]">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ background: c.asignado_color || "#94a3b8" }}
                            />
                            <span className="font-medium">{c.asignado_nombre || c.asignado_a}</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">sin asignar</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Bottom action bar (sticky) ─── */}
      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-white border border-slate-200 rounded-full shadow-xl px-3 py-2 flex items-center gap-2 max-w-[95vw]">
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300">
            <Check className="h-3 w-3 mr-0.5" />
            {selected.size} seleccionada{selected.size !== 1 ? "s" : ""}
          </Badge>
          <button
            onClick={() => setSelected(new Set())}
            className="text-[11px] text-slate-500 hover:text-slate-900 px-1"
            title="Limpiar selección"
          >
            <XIcon className="h-3 w-3" />
          </button>

          <div className="h-5 w-px bg-slate-200" />

          <select
            value={targetUsername}
            onChange={e => setTarget(e.target.value)}
            className="h-7 px-2 text-xs border border-slate-200 rounded bg-white max-w-[200px]"
            disabled={applying}
          >
            <option value="">→ Asignar a…</option>
            {vendedoras.map(v => (
              <option key={v.username} value={v.username}>
                {v.nombre_completo || v.username} ({v.cuentas})
              </option>
            ))}
          </select>

          <Button
            size="sm"
            onClick={handleAsignar}
            disabled={applying || !targetUsername}
            className="h-7 gap-1 text-xs"
          >
            {applying ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
            Asignar
          </Button>

          <div className="h-5 w-px bg-slate-200" />

          <Button
            size="sm"
            variant="outline"
            onClick={handleDesasignar}
            disabled={applying}
            className="h-7 gap-1 text-xs text-orange-700 border-orange-200 hover:bg-orange-50"
          >
            <UserMinus className="h-3 w-3" />
            Desasignar
          </Button>
        </div>
      )}
    </div>
  );
}
