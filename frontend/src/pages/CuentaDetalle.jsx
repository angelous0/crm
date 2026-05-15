/**
 * CuentaDetalle — página completa /cuentas/:partnerOdooId (Sprint CRM-D3).
 *
 * Header enriquecido: estado_auto + tier badge + KPIs (LTV / recencia / ticket)
 * + alerta clay si dormido/perdido/en_riesgo + botones acción rápida.
 *
 * Tabs: [Resumen] (default) [Info] [Ventas] [Interacciones] [Tareas] [Créditos]
 */
import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import api from "@/lib/api";
import { formatDoc } from "@/lib/docTipo";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ArrowLeft, MessageCircle, Calendar, Plus, AlertCircle,
  Phone, AlertTriangle, Sparkles,
} from "lucide-react";
import { InfoTab } from "@/components/cuentas/InfoTab";
import { ResumenTab } from "@/components/cuentas/tabs/ResumenTab";
import { InteraccionesTab } from "@/components/cuentas/tabs/InteraccionesTab";
import { TareasTab } from "@/components/cuentas/tabs/TareasTab";
import { CreditosTab } from "@/components/cuentas/tabs/CreditosTab";
import { VentasTab } from "@/components/cuentas/tabs/VentasTab";
import { VinculadosTab } from "@/components/cuentas/tabs/VinculadosTab";
import { ReservasTab } from "@/components/cuentas/tabs/ReservasTab";
import { LocalesTab } from "@/components/cuentas/tabs/LocalesTab";
import { NuevaInteraccionModal } from "@/components/cuentas/modals/NuevaInteraccionModal";
import { NuevaTareaModal } from "@/components/cuentas/modals/NuevaTareaModal";
import { WhatsappModal } from "@/components/cuentas/modals/WhatsappModal";
import QuickFollowupModal from "@/components/cola/QuickFollowupModal";

const fmtMoney = (n) =>
  "S/ " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtRelative = (iso) => {
  if (!iso) return null;
  const diffH = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (diffH < 1) return "ahora";
  if (diffH < 24) return `hace ${Math.floor(diffH)}h`;
  const d = Math.floor(diffH / 24);
  if (d === 0) return "hoy";
  if (d === 1) return "ayer";
  if (d < 30) return `hace ${d}d`;
  const m = Math.floor(d / 30);
  if (m < 12) return `hace ${m} mes${m === 1 ? "" : "es"}`;
  return `hace ${Math.floor(m / 12)}a`;
};

// D3: tab Resumen primero. D4: tab Vinculados. D5: tab Reservas. D7: tab Locales.
const TABS = [
  { key: "resumen",       label: "Resumen" },
  { key: "info",          label: "Info" },
  { key: "ventas",        label: "Ventas" },
  { key: "reservas",      label: "Reservas" },
  { key: "creditos",      label: "Créditos" },
  { key: "vinculados",    label: "Vinculados" },
  { key: "locales",       label: "Locales" },
  { key: "interacciones", label: "Interacciones" },
  { key: "tareas",        label: "Tareas" },
];

// Estado badge — mismos colores que la lista
const ESTADO_BADGE = {
  vip:        { bg: "rgba(217,119,6,.14)",  fg: "#B45309", label: "VIP" },
  activo:     { bg: "rgba(22,163,74,.14)",  fg: "#15803D", label: "Activo" },
  nuevo:      { bg: "rgba(42,111,219,.14)", fg: "#1E54B0", label: "Nuevo" },
  en_riesgo:  { bg: "rgba(249,115,22,.16)", fg: "#C2410C", label: "En riesgo" },
  dormido:    { bg: "rgba(107,114,128,.14)",fg: "#374151", label: "Dormido" },
  perdido:    { bg: "rgba(220,38,38,.12)",  fg: "#991B1B", label: "Perdido" },
  recuperado: { bg: "rgba(16,185,129,.14)", fg: "#047857", label: "Recuperado" },
  sin_data:   { bg: "rgba(0,0,0,.04)",      fg: "#6B7280", label: "Sin datos" },
};

const TIER_CHIP = {
  oro:    { bg: "rgba(212,168,90,.18)",   border: "rgba(212,168,90,.45)",  fg: "#8B6A1F" },
  plata:  { bg: "rgba(135,122,102,.14)",  border: "rgba(135,122,102,.32)", fg: "#4A4136" },
  bronce: { bg: "rgba(181,70,42,.10)",    border: "rgba(181,70,42,.28)",   fg: "#8A2F18" },
};

function EstadoBadge({ estado }) {
  if (!estado) return null;
  const s = ESTADO_BADGE[estado] || ESTADO_BADGE.sin_data;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
      style={{ background: s.bg, color: s.fg, letterSpacing: "0.06em" }}
      data-testid="estado-auto-badge"
    >
      {s.label}
    </span>
  );
}

function TierChip({ tier }) {
  if (!tier) return null;
  const s = TIER_CHIP[tier] || TIER_CHIP.bronce;
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase"
      style={{ background: s.bg, color: s.fg, border: `1px solid ${s.border}`, letterSpacing: "0.06em" }}
      data-testid="tier-chip"
    >
      ★ {tier}
    </span>
  );
}

function HeaderKpi({ label, value, sublabel, accent }) {
  return (
    <div className="flex flex-col px-3 py-2 border rounded-md bg-white min-w-[120px]">
      <span className={`text-base font-semibold leading-none ${accent || "text-slate-900"}`}>
        {value}
      </span>
      <span className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">
        {label}
      </span>
      {sublabel && (
        <span className="text-[9px] text-slate-400 mt-0.5 font-mono">{sublabel}</span>
      )}
    </div>
  );
}

function AlertaEstado({ headerMetrics }) {
  const { estado_auto, recencia_dias, freq_dias_estimada, tier } = headerMetrics || {};
  if (!["en_riesgo", "dormido", "perdido"].includes(estado_auto)) return null;
  const ratio = freq_dias_estimada ? (recencia_dias / freq_dias_estimada) : null;

  const config = {
    en_riesgo: {
      bg: "rgba(249,115,22,.06)",
      border: "rgba(249,115,22,.32)",
      fg: "#C2410C",
      titulo: "Empieza a alejarse del ciclo normal",
      cta: "Reactivar pronto",
    },
    dormido: {
      bg: "rgba(220,38,38,.05)",
      border: "rgba(220,38,38,.28)",
      fg: "#991B1B",
      titulo: ratio ? `Doble del ciclo normal (${ratio.toFixed(1)}× del normal)` : "Cliente dormido",
      cta: "Reactivar urgente",
    },
    perdido: {
      bg: "rgba(220,38,38,.08)",
      border: "rgba(220,38,38,.40)",
      fg: "#7F1D1D",
      titulo: "Cuenta perdida — operación de rescate",
      cta: "Campaña de recuperación",
    },
  }[estado_auto];

  return (
    <div
      className="border rounded-md px-3 py-2 mb-3 flex items-center gap-3"
      style={{ background: config.bg, borderColor: config.border }}
      data-testid="alerta-estado"
    >
      <AlertTriangle size={16} style={{ color: config.fg }} className="shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold" style={{ color: config.fg }}>
          {config.titulo}
        </div>
        <div className="text-[11px] text-slate-600">
          Última compra hace {recencia_dias}d
          {freq_dias_estimada && ` · ciclo normal ${freq_dias_estimada.toFixed(1)}d`}
          {tier === "estrella" && " · cliente Estrella del depto"}
        </div>
      </div>
      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded" style={{ color: config.fg, background: "rgba(255,255,255,.5)" }}>
        {config.cta}
      </span>
    </div>
  );
}

const Placeholder = ({ tab }) => (
  <div className="flex items-center justify-center py-16 text-slate-400 text-sm italic">
    {tab} · En construcción ⚙️
  </div>
);

export default function CuentaDetalle() {
  const { partnerOdooId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(location.search);
    return params.get("tab") || "resumen";  // D3: default Resumen
  });
  const [cuenta, setCuenta] = useState(null);
  const [headerMetrics, setHeaderMetrics] = useState(null);
  const [lastInteraction, setLastInteraction] = useState(null);
  const [contactos, setContactos] = useState([]);
  const [localesCount, setLocalesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefresh = () => setRefreshKey(k => k + 1);

  // Modales
  const [openNuevaInter, setOpenNuevaInter] = useState(false);
  const [openNuevaTarea, setOpenNuevaTarea] = useState(false);
  const [openWhatsapp,   setOpenWhatsapp]   = useState(false);
  const [openQuickFu,    setOpenQuickFu]    = useState(false);
  // Defaults precargados al abrir Tarea desde "Guardar + crear tarea" del modal de Interacción
  const [tareaDefaults,  setTareaDefaults]  = useState(null);

  const cargarHeader = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, hm, ints, ctos, locs] = await Promise.all([
        api.get(`/cuentas/${partnerOdooId}`),
        api.get(`/cuentas/${partnerOdooId}/header-metrics`).catch(() => ({ data: null })),
        api.get(`/cuentas/${partnerOdooId}/interacciones`).catch(() => ({ data: [] })),
        api.get(`/cuentas/${partnerOdooId}/contactos`).catch(() => ({ data: [] })),
        api.get(`/cuentas/${partnerOdooId}/locales`).catch(() => ({ data: { locales: [] } })),
      ]);
      setCuenta(c.data);
      setHeaderMetrics(hm.data);
      const items = Array.isArray(ints.data) ? ints.data : (ints.data?.items || []);
      setLastInteraction(items[0]?.happened_at || items[0]?.fecha || null);
      const ctosItems = Array.isArray(ctos.data) ? ctos.data : (ctos.data?.items || []);
      setContactos(ctosItems);
      const locItems = locs.data?.locales || [];
      setLocalesCount(locItems.length);
    } catch (e) {
      setError(e.response?.data?.detail || e.message || "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [partnerOdooId]);

  useEffect(() => { cargarHeader(); }, [cargarHeader]);

  const switchTab = (key) => {
    setActiveTab(key);
    const params = new URLSearchParams(location.search);
    params.set("tab", key);
    navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
  };

  if (loading) {
    return (
      <div className="px-6 py-4">
        <div className="h-4 w-48 bg-slate-100 rounded animate-pulse mb-3" />
        <div className="h-8 w-72 bg-slate-100 rounded animate-pulse mb-4" />
        <div className="flex gap-2 mb-6">
          {[0,1,2,3].map(i => <div key={i} className="h-14 w-32 bg-slate-100 rounded animate-pulse" />)}
        </div>
        <div className="h-64 bg-slate-100 rounded animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-6 py-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/cuentas")} className="mb-3">
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver a cuentas
        </Button>
        <div className="border rounded-md p-4 flex items-center gap-3 max-w-xl">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <div className="flex-1">
            <div className="font-medium text-sm">Error al cargar la cuenta</div>
            <div className="text-xs text-slate-500">{error}</div>
          </div>
          <Button size="sm" variant="outline" onClick={cargarHeader}>Reintentar</Button>
        </div>
      </div>
    );
  }

  if (!cuenta) return null;

  const partner = cuenta.partner || {};
  const nombre = partner.name || "Sin nombre";
  const m = headerMetrics || {};
  const activeTabLabel = TABS.find(t => t.key === activeTab)?.label || "Resumen";

  return (
    <div className="px-6 py-4 max-w-7xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-[11px] text-slate-500 mb-2">
        <button
          className="hover:text-slate-900 hover:underline"
          onClick={() => navigate("/cuentas")}
          data-testid="breadcrumb-cuentas"
        >
          Cuentas
        </button>
        <span className="text-slate-300">›</span>
        <span className="truncate max-w-[280px]">{nombre}</span>
        <span className="text-slate-300">›</span>
        <span className="text-slate-700 font-medium">{activeTabLabel}</span>
      </div>

      {/* Header — D3 enriquecido */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div className="min-w-0 flex-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 -ml-2 px-2 text-xs text-slate-600 hover:text-slate-900 mb-1"
            onClick={() => navigate("/cuentas")}
            data-testid="btn-volver"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Volver a cuentas
          </Button>
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight truncate" style={{ fontFamily: "var(--font-display)" }}>
              {nombre}
            </h1>
            <EstadoBadge estado={m.estado_auto} />
            <TierChip tier={m.tier} />
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {lastInteraction ? `Última interacción: ${fmtRelative(lastInteraction)}` : "Sin interacciones registradas"}
            {partner.vat && <span className="ml-3 text-slate-400">· {formatDoc(partner.vat)}</span>}
            {partner.city && <span className="ml-3 text-slate-400">· {partner.city}</span>}
          </p>
        </div>

        {/* Acciones rápidas */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm" variant="outline"
            className="h-8 text-xs gap-1.5"
            onClick={() => setOpenQuickFu(true)}
            data-testid="btn-quick-followup"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            Quick Followup
          </Button>
          <Button
            size="sm" variant="outline"
            className="h-8 text-xs gap-1.5"
            onClick={() => setOpenWhatsapp(true)}
            data-testid="btn-whatsapp"
          >
            <MessageCircle className="h-3.5 w-3.5 text-green-600" />
            WhatsApp
          </Button>
          <Button
            size="sm" variant="outline"
            className="h-8 text-xs gap-1.5"
            onClick={() => setOpenNuevaInter(true)}
            data-testid="btn-nueva-interaccion"
          >
            <Plus className="h-3.5 w-3.5" />
            Interacción
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setOpenNuevaTarea(true)}
            data-testid="btn-nueva-tarea"
          >
            <Calendar className="h-3.5 w-3.5" />
            Nueva tarea
          </Button>
        </div>
      </div>

      {/* Alerta automática (solo dormido/perdido/en_riesgo) */}
      <AlertaEstado headerMetrics={m} />

      {/* KPIs del header — D3 con LTV/Recencia/Ticket */}
      <div className="flex flex-wrap gap-2 mb-3">
        <HeaderKpi
          label="LTV últimos 12m"
          value={fmtMoney(m.sales_12m_amount)}
          sublabel={`${m.orders_12m_count || 0} pedidos`}
        />
        <HeaderKpi
          label={m.recencia_dias != null ? "Días sin compra" : "Última compra"}
          value={m.recencia_dias != null ? `${m.recencia_dias}d` : "—"}
          sublabel={
            m.freq_dias_estimada
              ? `Ciclo normal: ${m.freq_dias_estimada.toFixed(1)}d`
              : null
          }
          accent={
            m.recencia_dias > 90 ? "text-red-600" :
            m.recencia_dias > 30 ? "text-amber-600" : "text-slate-900"
          }
        />
        <HeaderKpi
          label="Ticket promedio"
          value={fmtMoney(m.ticket_promedio)}
        />
        <HeaderKpi
          label="Total histórico"
          value={`${m.orders_total || 0} pedidos`}
        />
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 mb-4">
        <div className="flex gap-1">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => switchTab(t.key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === t.key
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
              data-testid={`tab-${t.key}`}
            >
              {t.label}
              {t.key === "locales" && localesCount > 0 && (
                <span className="ml-1 text-slate-400">· {localesCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido */}
      {activeTab === "resumen" && (
        <ResumenTab
          key={refreshKey}
          cuentaId={partnerOdooId}
          headerMetrics={m}
          onNavigate={switchTab}
          onLlamar={() => setOpenQuickFu(true)}
          onWhatsApp={() => setOpenWhatsapp(true)}
        />
      )}
      {activeTab === "info" && (
        <InfoTab
          key={refreshKey}
          partnerOdooId={partnerOdooId}
          cuenta={cuenta}
          onChange={cargarHeader}
        />
      )}
      {activeTab === "interacciones" && (
        <InteraccionesTab
          partnerOdooId={partnerOdooId}
          contactos={contactos}
          active={activeTab === "interacciones"}
          staleKey={refreshKey}
          onMutate={() => { cargarHeader(); bumpRefresh(); }}
        />
      )}
      {activeTab === "ventas" && (
        <VentasTab
          partnerOdooId={partnerOdooId}
          active={activeTab === "ventas"}
          staleKey={refreshKey}
        />
      )}
      {activeTab === "vinculados" && (
        <VinculadosTab
          key={refreshKey}
          partnerOdooId={partnerOdooId}
        />
      )}
      {activeTab === "locales" && (
        <LocalesTab
          key={refreshKey}
          partnerOdooId={partnerOdooId}
        />
      )}
      {activeTab === "tareas" && (
        <TareasTab
          partnerOdooId={partnerOdooId}
          contactos={contactos}
          active={activeTab === "tareas"}
          staleKey={refreshKey}
          onMutate={bumpRefresh}
        />
      )}
      {activeTab === "reservas" && (
        <ReservasTab
          partnerOdooId={partnerOdooId}
          active={activeTab === "reservas"}
          staleKey={refreshKey}
        />
      )}
      {activeTab === "creditos" && (
        <CreditosTab
          partnerOdooId={partnerOdooId}
          active={activeTab === "creditos"}
          staleKey={refreshKey}
        />
      )}

      {/* Modales */}
      <NuevaInteraccionModal
        open={openNuevaInter}
        onClose={() => setOpenNuevaInter(false)}
        partnerOdooId={partnerOdooId}
        cuentaName={nombre}
        contactos={contactos}
        onSuccess={() => { cargarHeader(); bumpRefresh(); }}
        onSaveAndCreateTask={(defaults) => {
          // Cerrar Interacción → abrir Tarea con defaults precargados
          setOpenNuevaInter(false);
          setTareaDefaults(defaults);
          setOpenNuevaTarea(true);
        }}
      />
      <NuevaTareaModal
        open={openNuevaTarea}
        onClose={() => { setOpenNuevaTarea(false); setTareaDefaults(null); }}
        partnerOdooId={partnerOdooId}
        cuentaName={nombre}
        contactos={contactos}
        defaults={tareaDefaults}
        onSuccess={() => { cargarHeader(); bumpRefresh(); }}
      />
      <WhatsappModal
        open={openWhatsapp}
        onClose={() => setOpenWhatsapp(false)}
        partnerOdooId={partnerOdooId}
        cuenta={cuenta}
        contactos={contactos}
        onSuccess={() => { cargarHeader(); bumpRefresh(); }}
      />
      {openQuickFu && (
        <QuickFollowupModal
          cuenta={{ partner_odoo_id: parseInt(partnerOdooId), nombre }}
          onClose={() => setOpenQuickFu(false)}
          onSaved={() => { cargarHeader(); bumpRefresh(); toast.success("Registrado"); }}
        />
      )}
    </div>
  );
}
