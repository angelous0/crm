/**
 * Cobranzas — listado de cuentas con saldo pendiente (Sprint CRM-D8).
 *
 * Estructura:
 *   ┌─ Header: total por cobrar grande ───────────────────────┐
 *   ├─ 4 KPIs: Total · Vencido · Por vencer ≤5d · Línea ≥60% ─┤
 *   ├─ Filtros chip: Todos / Vencidos / Por vencer / etc ─────┤
 *   ├─ Tabla con saldo, %, vencimiento, plazo ─────────────────┤
 *   └─ Click fila → cuenta detalle con Tab Créditos abierto ───┘
 *
 * Fuente:
 *   - GET /api/cobranzas/resumen → KPIs + conteos
 *   - GET /api/cobranzas/cuentas → listado paginado
 *
 * El saldo rolls-up de partners secundarios al PRINCIPAL via v_cuenta_partners.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2, AlertCircle, AlertTriangle, RefreshCw, Search,
  ChevronLeft, ChevronRight, MessageCircle, Clock, TrendingUp,
  CheckCircle2, Zap, Bell, X as XIcon, ExternalLink, FileText,
  MapPin,
} from "lucide-react";

// ─── Formateadores ───────────────────────────────────────────────────
const fmtMoney = (n) =>
  "S/ " + Number(n || 0).toLocaleString("es-PE", { maximumFractionDigits: 0 });

const fmtMoneyShort = (n) => {
  const v = Number(n || 0);
  if (v >= 1e6) return "S/ " + (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return "S/ " + (v / 1e3).toFixed(1) + "k";
  return "S/ " + Math.round(v);
};

const fmtNum = (n) => Number(n || 0).toLocaleString("es-PE");

const fmtDays = (iso, baseLabel = "d") => {
  if (!iso) return "—";
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return "hoy";
  if (diff > 0)  return `${diff}${baseLabel}`;
  return `${Math.abs(diff)}${baseLabel} vencido`;
};

// ─── Estilos por estado de crédito ───────────────────────────────────
const ESTADO_STYLE = {
  vencido:    { bg: "bg-red-50",    text: "text-red-700",    badge: "VENCIDO",       icon: AlertTriangle },
  linea_tope: { bg: "bg-purple-50", text: "text-purple-700", badge: "LÍNEA TOPE",    icon: Zap },
  por_vencer: { bg: "bg-amber-50",  text: "text-amber-700",  badge: "POR VENCER",    icon: Bell },
  linea_alta: { bg: "bg-blue-50",   text: "text-blue-700",   badge: "LÍNEA ALTA",    icon: TrendingUp },
  al_dia:     { bg: "bg-emerald-50",text: "text-emerald-700",badge: "AL DÍA",        icon: CheckCircle2 },
};

const FILTROS = [
  { k: "",           label: "Todos",       icon: null },
  { k: "vencido",    label: "Vencidos",    icon: AlertTriangle, color: "text-red-700" },
  { k: "por_vencer", label: "Por vencer",  icon: Bell,          color: "text-amber-700" },
  { k: "linea_tope", label: "Línea tope",  icon: Zap,           color: "text-purple-700" },
  { k: "linea_alta", label: "Línea alta",  icon: TrendingUp,    color: "text-blue-700" },
  { k: "al_dia",     label: "Al día",      icon: CheckCircle2,  color: "text-emerald-700" },
];

// ─── Color de la barra de ocupación de línea ──────────────────────────
const ocupacionColor = (pct) => {
  if (pct == null)   return "#94a3b8";
  if (pct >= 100)    return "#7C3AED";
  if (pct >= 80)     return "#DC2626";
  if (pct >= 60)     return "#D97706";
  return "#16A34A";
};

// ─── KpiTile ─────────────────────────────────────────────────────────
function KpiTile({ label, value, sub, color }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
      <div className="text-[10px] font-mono uppercase font-medium" style={{ color: "var(--ink-3)", letterSpacing: "0.14em" }}>
        {label}
      </div>
      <div
        className="text-2xl leading-none font-semibold tracking-tight tabular-nums mt-1"
        style={{ fontFamily: "var(--font-display)", color: color || "var(--ink)" }}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] mt-1" style={{ color: "var(--ink-3)" }}>{sub}</div>}
    </div>
  );
}

// ─── Barra de ocupación ──────────────────────────────────────────────
function OcupacionBar({ pct }) {
  if (pct == null) {
    return <div className="text-[10px] text-slate-400 italic">sin línea</div>;
  }
  const clamped = Math.min(Math.max(pct, 0), 100);
  return (
    <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div
        className="h-full transition-all"
        style={{ width: `${clamped}%`, background: ocupacionColor(pct) }}
      />
    </div>
  );
}

// ─── Drawer lateral con detalle de facturas de UNA cuenta ────────────
// IMPORTANTE: Este componente SOLO se monta cuando cuenta != null (ver el
// caller). Eso simplifica el manejo de estado y elimina race conditions.
function CobranzaDrawer({ cuenta, onClose }) {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const partnerId = cuenta.partner_odoo_id;

  // Fetch al montar (cuenta cambia → componente se remonta porque su key cambia)
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setInvoices([]);
    api.get(`/cuentas/${partnerId}/creditos/invoices`, {
      params: { state: "open", limit: 100 },
    })
      .then(r => {
        if (!active) return;
        const rows = Array.isArray(r?.data?.rows) ? r.data.rows : [];
        setInvoices(rows);
        setLoading(false);
      })
      .catch(e => {
        if (!active) return;
        setError(e?.response?.data?.detail || e.message || "Error desconocido");
        setLoading(false);
      });
    return () => { active = false; };
  }, [partnerId]);

  // Cerrar con ESC
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const est = ESTADO_STYLE[cuenta.estado_credito] || ESTADO_STYLE.al_dia;
  const vencido = cuenta.saldo_vencido > 0;

  // Calcular fecha de vencimiento + días para cada factura (cliente-side)
  const enrichInvoice = (inv) => {
    if (!inv.date_invoice) return { ...inv, fechaVence: null, diasVencido: null };
    const fecha = new Date(inv.date_invoice);
    fecha.setDate(fecha.getDate() + (cuenta.plazo_dias || 30));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fechaCmp = new Date(fecha);
    fechaCmp.setHours(0, 0, 0, 0);
    const dias = Math.round((today - fechaCmp) / 86400000);
    return { ...inv, fechaVence: fecha, diasVencido: dias };  // dias > 0 = vencido
  };

  const enriched = invoices.map(enrichInvoice);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[1px]"
        onClick={onClose}
      />
      {/* Drawer */}
      <aside className="fixed top-0 right-0 bottom-0 z-[61] w-full max-w-[560px] bg-white shadow-2xl flex flex-col border-l border-slate-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-mono uppercase font-medium mb-1" style={{ color: "var(--ink-3)", letterSpacing: "0.14em" }}>
              Detalle de cobranza
            </div>
            <h2 className="text-lg font-semibold leading-tight" style={{ fontFamily: "var(--font-display)" }}>
              {cuenta.nombre}
            </h2>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2 flex-wrap font-mono">
              {cuenta.vat && <span>{cuenta.vat}</span>}
              {cuenta.depto && (
                <span className="inline-flex items-center gap-0.5">
                  <MapPin className="h-2.5 w-2.5" /> {cuenta.depto}
                </span>
              )}
              <span className={`inline-flex items-center gap-1 px-1.5 py-0 rounded text-[10px] font-bold uppercase ${est.bg} ${est.text}`}>
                {est.badge}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-500 shrink-0"
            title="Cerrar (Esc)"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Totales */}
        <div className="px-5 py-4 border-b border-slate-200 grid grid-cols-3 gap-3 bg-slate-50/40">
          <div>
            <div className="text-[9px] font-mono uppercase font-medium" style={{ color: "var(--ink-3)", letterSpacing: "0.14em" }}>
              Saldo total
            </div>
            <div className="text-xl font-bold tabular-nums leading-none mt-1" style={{ fontFamily: "var(--font-display)", color: "#B45309" }}>
              {fmtMoney(cuenta.saldo_total)}
            </div>
          </div>
          <div>
            <div className="text-[9px] font-mono uppercase font-medium" style={{ color: "var(--ink-3)", letterSpacing: "0.14em" }}>
              Vencido
            </div>
            <div
              className="text-xl font-bold tabular-nums leading-none mt-1"
              style={{ fontFamily: "var(--font-display)", color: cuenta.saldo_vencido > 0 ? "#DC2626" : "var(--ink-3)" }}
            >
              {fmtMoney(cuenta.saldo_vencido)}
            </div>
            {cuenta.n_facturas_vencidas > 0 && (
              <div className="text-[10px] text-slate-500 mt-0.5">
                {cuenta.n_facturas_vencidas} factura{cuenta.n_facturas_vencidas !== 1 ? "s" : ""}
              </div>
            )}
          </div>
          <div>
            <div className="text-[9px] font-mono uppercase font-medium" style={{ color: "var(--ink-3)", letterSpacing: "0.14em" }}>
              Línea ocupada
            </div>
            <div
              className="text-xl font-bold tabular-nums leading-none mt-1"
              style={{ fontFamily: "var(--font-display)", color: ocupacionColor(cuenta.pct_ocupacion) }}
            >
              {cuenta.pct_ocupacion != null ? `${Math.round(cuenta.pct_ocupacion)}%` : "—"}
            </div>
            {cuenta.credito_linea > 0 && (
              <div className="text-[10px] text-slate-500 mt-0.5">
                de {fmtMoney(cuenta.credito_linea)}
              </div>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={() => toast.info("Plantilla WhatsApp de cobro — pronto")}
            className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Cobrar por WhatsApp
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate(`/cuentas/${cuenta.partner_odoo_id}?tab=creditos`)}
            className="h-8 gap-1.5 text-xs"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Abrir cuenta completa
          </Button>
          {cuenta.asignado_nombre && (
            <div className="ml-auto inline-flex items-center gap-1 text-[11px] text-slate-600">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cuenta.asignado_color || "#94a3b8" }} />
              <span className="font-medium">{cuenta.asignado_nombre}</span>
            </div>
          )}
        </div>

        {/* Lista de facturas */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="text-[10px] font-mono uppercase font-medium mb-3" style={{ color: "var(--ink-3)", letterSpacing: "0.14em" }}>
            Facturas abiertas
            {enriched.length > 0 && (
              <span className="ml-1 tabular-nums">· {enriched.length}</span>
            )}
          </div>

          {loading ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              <Loader2 className="h-4 w-4 animate-spin inline-block mr-1.5" /> Cargando…
            </div>
          ) : error ? (
            <div className="border border-red-200 bg-red-50 rounded p-3 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          ) : enriched.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm italic">
              No hay facturas abiertas para esta cuenta
            </div>
          ) : (
            <div className="space-y-2">
              {enriched.map(inv => (
                <div
                  key={inv.invoice_id}
                  className={`border rounded-lg p-3 ${
                    inv.diasVencido > 0 ? "border-red-200 bg-red-50/30" : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-semibold text-slate-900">
                          {inv.invoice_number || `#${inv.invoice_id}`}
                        </span>
                        {inv.empresa && (
                          <span className="text-[9px] px-1.5 py-0 rounded bg-slate-100 text-slate-600 font-medium uppercase">
                            {inv.empresa}
                          </span>
                        )}
                        {inv.diasVencido > 0 ? (
                          <span className="text-[10px] px-1.5 py-0 rounded bg-red-100 text-red-800 font-bold">
                            ⚠ {inv.diasVencido}d vencido
                          </span>
                        ) : inv.diasVencido === 0 ? (
                          <span className="text-[10px] px-1.5 py-0 rounded bg-amber-100 text-amber-800 font-bold">
                            ⏰ vence hoy
                          </span>
                        ) : inv.diasVencido > -5 ? (
                          <span className="text-[10px] px-1.5 py-0 rounded bg-amber-50 text-amber-700">
                            vence en {Math.abs(inv.diasVencido)}d
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0 rounded bg-emerald-50 text-emerald-700">
                            vence en {Math.abs(inv.diasVencido)}d
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        Emitida {new Date(inv.date_invoice).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit" })}
                        {inv.fechaVence && (
                          <> · vence {inv.fechaVence.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit" })}</>
                        )}
                        {inv.qty_total > 0 && <> · {fmtNum(inv.qty_total)} unid.</>}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                    <div>
                      <div className="text-[9px] font-mono uppercase text-slate-400">Monto total</div>
                      <div className="text-sm font-medium tabular-nums text-slate-700">
                        {fmtMoney(inv.amount_total)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] font-mono uppercase text-slate-400">Saldo</div>
                      <div
                        className="text-sm font-semibold tabular-nums"
                        style={{ color: inv.diasVencido > 0 ? "#DC2626" : "#B45309" }}
                      >
                        {fmtMoney(inv.amount_residual)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}


// ─── Página principal ────────────────────────────────────────────────
export default function Cobranzas() {
  const navigate = useNavigate();

  const [resumen, setResumen] = useState(null);
  const [items, setItems]     = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError]     = useState(null);

  // Filtros
  const [filtroEstado, setFiltroEstado] = useState("");
  const [q, setQ]                       = useState("");
  const [qDebounced, setQDebounced]     = useState("");
  const [page, setPage]                 = useState(1);

  // Drawer lateral con detalle de cuenta seleccionada
  const [cuentaDetalle, setCuentaDetalle] = useState(null);

  // Debounce búsqueda
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const fetchResumen = useCallback(async () => {
    try {
      const r = await api.get("/cobranzas/resumen");
      setResumen(r.data);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message);
    }
  }, []);

  const fetchLista = useCallback(async () => {
    setLoadingList(true);
    try {
      const params = {
        estado: filtroEstado || undefined,
        q: qDebounced || undefined,
        page, limit: 100,
      };
      const r = await api.get("/cobranzas/cuentas", { params });
      setItems(r.data.items || []);
      setTotal(r.data.total || 0);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message);
    } finally {
      setLoadingList(false);
      setLoading(false);
    }
  }, [filtroEstado, qDebounced, page]);

  useEffect(() => { fetchResumen(); }, [fetchResumen]);
  useEffect(() => { fetchLista(); }, [fetchLista]);

  // Reset página al cambiar filtros
  useEffect(() => { setPage(1); }, [filtroEstado, qDebounced]);

  const totalPages = Math.max(1, Math.ceil(total / 100));

  // ─── Acción: abrir drawer con detalle (no navega afuera) ──
  const abrirDetalle = (cuenta) => {
    setCuentaDetalle(cuenta);
  };

  const handleCobrar = (e, cuenta) => {
    e.stopPropagation();
    // Placeholder: en el futuro abrir composer de WhatsApp con plantilla de cobro
    toast.info(`Recordatorio de cobro para ${cuenta.nombre} — pronto integraremos WhatsApp`);
  };

  // ─── Header total ──
  const totalPorCobrar = resumen?.total_por_cobrar || 0;

  return (
    <div className="px-6 py-4 max-w-[1400px]">
      {/* ─── Header ─── */}
      <div className="mb-5">
        <div className="text-[10px] font-mono uppercase font-medium mb-1" style={{ color: "var(--ink-3)", letterSpacing: "0.14em" }}>
          Crédito y cobranzas
        </div>
        <h1 className="text-3xl font-bold tracking-tight flex items-baseline gap-3" style={{ fontFamily: "var(--font-display)" }}>
          Por cobrar
          <span
            className="text-3xl tabular-nums"
            style={{ color: totalPorCobrar > 0 ? "#B45309" : "var(--ink-3)" }}
          >
            · {fmtMoney(totalPorCobrar)}
          </span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Línea de crédito ocupada · vencimientos · clientes que llegan al tope
        </p>
      </div>

      {/* ─── 4 KPIs ─── */}
      {resumen && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <KpiTile
            label="Total por cobrar"
            value={fmtMoney(resumen.total_por_cobrar)}
            sub={`${resumen.total_clientes} cliente${resumen.total_clientes !== 1 ? "s" : ""} con saldo`}
          />
          <KpiTile
            label="Vencido"
            value={fmtMoney(resumen.total_vencido)}
            sub={`${resumen.n_vencidos} cliente${resumen.n_vencidos !== 1 ? "s" : ""}`}
            color={resumen.total_vencido > 0 ? "#DC2626" : "var(--ink)"}
          />
          <KpiTile
            label="Por vencer ≤ 5d"
            value={fmtMoney(resumen.total_por_vencer)}
            sub={`${resumen.n_por_vencer} cliente${resumen.n_por_vencer !== 1 ? "s" : ""}`}
            color={resumen.total_por_vencer > 0 ? "#D97706" : "var(--ink)"}
          />
          <KpiTile
            label="Línea ≥ 60% ocupada"
            value={resumen.n_linea_tope + resumen.n_linea_alta}
            sub="Clientes en zona caliente"
            color={(resumen.n_linea_tope + resumen.n_linea_alta) > 0 ? "#7C3AED" : "var(--ink)"}
          />
        </div>
      )}

      {/* ─── Chips de filtro ─── */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        {FILTROS.map((opt) => {
          const Icon = opt.icon;
          const conteo =
            opt.k === ""           ? resumen?.total_clientes
            : opt.k === "vencido"    ? resumen?.n_vencidos
            : opt.k === "por_vencer" ? resumen?.n_por_vencer
            : opt.k === "linea_tope" ? resumen?.n_linea_tope
            : opt.k === "linea_alta" ? resumen?.n_linea_alta
            : opt.k === "al_dia"     ? resumen?.n_al_dia
            : null;
          const active = filtroEstado === opt.k;
          return (
            <button
              key={opt.k}
              onClick={() => setFiltroEstado(opt.k)}
              className={`px-3 py-1 rounded-full text-xs inline-flex items-center gap-1.5 border transition-all ${
                active
                  ? "bg-slate-900 text-white border-slate-900"
                  : `bg-white border-slate-200 hover:border-slate-400 ${opt.color || "text-slate-600"}`
              }`}
            >
              {Icon && <Icon className="h-3 w-3" />}
              <span className="font-medium">{opt.label}</span>
              {conteo != null && (
                <span className="font-mono tabular-nums opacity-70">· {conteo}</span>
              )}
            </button>
          );
        })}

        {/* Search a la derecha */}
        <div className="ml-auto relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar cliente, RUC, tel…"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="h-8 pl-7 pr-2 text-xs border border-slate-200 rounded bg-white w-56"
          />
        </div>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => { fetchResumen(); fetchLista(); }}
          className="h-8 w-8 p-0"
          title="Refrescar"
        >
          {loadingList ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
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
            <span className="font-medium tabular-nums">{fmtNum(total)}</span> cliente{total !== 1 ? "s" : ""} con saldo
          </div>
          {totalPages > 1 && (
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
          )}
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            <Loader2 className="h-4 w-4 animate-spin inline-block mr-1.5" /> Cargando…
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            {total === 0 && !filtroEstado && !qDebounced ? (
              <div className="space-y-2">
                <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto" />
                <div className="font-medium text-slate-600">No hay clientes con saldo pendiente</div>
                <div className="text-xs italic max-w-md mx-auto">
                  Cuando lleguen facturas a crédito vía sync de Odoo ({" "}
                  <code className="text-[10px] bg-slate-100 px-1 rounded">account.invoice</code>
                  {" "}con <code className="text-[10px] bg-slate-100 px-1 rounded">is_credit=True</code>) se llenará automáticamente.
                </div>
              </div>
            ) : (
              <div className="italic">Sin clientes con esos filtros</div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/30">
                  <th className="px-3 py-2 text-left font-mono uppercase text-[9px] text-slate-500 tracking-wider">Cliente</th>
                  <th className="px-2 py-2 text-left font-mono uppercase text-[9px] text-slate-500 tracking-wider">Estado</th>
                  <th className="px-2 py-2 text-left font-mono uppercase text-[9px] text-slate-500 tracking-wider">Tienda</th>
                  <th className="px-2 py-2 text-right font-mono uppercase text-[9px] text-slate-500 tracking-wider">Línea</th>
                  <th className="px-2 py-2 text-right font-mono uppercase text-[9px] text-slate-500 tracking-wider">Ocupada</th>
                  <th className="px-2 py-2 text-left font-mono uppercase text-[9px] text-slate-500 tracking-wider">%</th>
                  <th className="px-2 py-2 text-left font-mono uppercase text-[9px] text-slate-500 tracking-wider">Vence en</th>
                  <th className="px-2 py-2 text-left font-mono uppercase text-[9px] text-slate-500 tracking-wider">Plazo</th>
                  <th className="px-2 py-2 text-right font-mono uppercase text-[9px] text-slate-500 tracking-wider">Acción</th>
                </tr>
              </thead>
              <tbody>
                {items.map(c => {
                  const est = ESTADO_STYLE[c.estado_credito] || ESTADO_STYLE.al_dia;
                  const EstIcon = est.icon;
                  const vencido    = c.saldo_vencido > 0;
                  const fechaVence = vencido ? c.vencimiento_mas_antiguo : c.proximo_vencimiento;
                  return (
                    <tr
                      key={c.cuenta_id}
                      onClick={() => abrirDetalle(c)}
                      className={`border-b border-slate-100 cursor-pointer transition-colors ${
                        cuentaDetalle?.cuenta_id === c.cuenta_id ? "bg-amber-50/60" : "hover:bg-slate-50"
                      }`}
                    >
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-slate-900">{c.nombre}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {c.depto && <span>{c.depto}</span>}
                          {c.vat && <span className="ml-1.5">· {c.vat}</span>}
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${est.bg} ${est.text}`}>
                          {est.badge}
                        </span>
                      </td>
                      {/* CRM-D13: tiendas — chips horizontales para multi-tienda */}
                      <td className="px-2 py-2.5" data-testid={`tiendas-${c.cuenta_id}`}>
                        {Array.isArray(c.tiendas) && c.tiendas.length > 0 ? (
                          <div
                            className="flex items-center gap-1 flex-wrap max-w-[180px]"
                            title={c.tiendas.length > 1 ? `${c.tiendas.length} tiendas: ${c.tiendas.join(", ")}` : c.tiendas[0]}
                          >
                            {c.tiendas.map(t => (
                              <span
                                key={t}
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-100 text-slate-700 ring-1 ring-slate-200"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">
                        {c.credito_linea > 0 ? fmtMoney(c.credito_linea) : <span className="text-slate-400 italic">—</span>}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums font-medium">
                        {fmtMoney(c.saldo_total)}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <OcupacionBar pct={c.pct_ocupacion} />
                          {c.pct_ocupacion != null && (
                            <span
                              className="text-[10px] tabular-nums font-medium"
                              style={{ color: ocupacionColor(c.pct_ocupacion) }}
                            >
                              {Math.round(c.pct_ocupacion)}%
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <span className={`text-[11px] tabular-nums ${vencido ? "text-red-700 font-medium" : "text-slate-600"}`}>
                          {fmtDays(fechaVence)}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-[11px] text-slate-500 tabular-nums">
                        {c.plazo_dias} días
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <button
                          onClick={(e) => handleCobrar(e, c)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                          title="Enviar recordatorio de cobro"
                        >
                          <MessageCircle className="h-3 w-3" /> Cobrar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[10px] text-slate-400 mt-3 italic">
        Saldo basado en facturas a crédito (<code className="text-[10px]">account.invoice</code> con
        <code className="text-[10px] mx-1">is_credit=True</code>). El saldo de partners vinculados se
        consolida en la cuenta principal. La línea de crédito se configura manualmente en cada cuenta.
      </p>

      {/* ─── Drawer lateral con detalle (no navega afuera) ─── */}
      {cuentaDetalle && (
        <CobranzaDrawer
          key={cuentaDetalle.cuenta_id}     // ← fuerza remount limpio al cambiar
          cuenta={cuentaDetalle}
          onClose={() => setCuentaDetalle(null)}
        />
      )}
    </div>
  );
}
