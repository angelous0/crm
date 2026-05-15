import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, MapPin, LayoutDashboard, Users, ShoppingBag, CreditCard, BarChart3, TrendingUp, Activity, MessageSquare, CheckSquare, Settings, Menu, Power, AlertTriangle, ExternalLink, Phone, Sparkles } from "lucide-react";
import { ResumenTab } from "./tabs/ResumenTab";
import { VentasTab } from "./tabs/VentasTab";
import { ReservasTab } from "./tabs/ReservasTab";
import { CreditosTab } from "./tabs/CreditosTab";
import { InfoVentasTab } from "./tabs/InfoVentasTab";
import { ContactosTab } from "./tabs/ContactosTab";
import { InteraccionesTab } from "./tabs/InteraccionesTab";
import { TareasTab } from "./tabs/TareasTab";
import { PerfilTab } from "./tabs/PerfilTab";
import YoYTab from "@/pages/YoYTab";
import AnaliticaTab from "@/pages/AnaliticaTab";
import QuickFollowupModal from "@/components/cola/QuickFollowupModal";

// 5 estados simplificados
const ESTADO_BADGE = {
  nuevo:    { bg: "rgba(42,111,219,.14)", fg: "#1E54B0", label: "Nuevo" },
  activo:   { bg: "rgba(22,163,74,.14)",  fg: "#15803D", label: "Activo" },
  alerta:   { bg: "rgba(249,115,22,.16)", fg: "#C2410C", label: "Alerta" },
  olvidado: { bg: "rgba(180,83,9,.16)",   fg: "#92400E", label: "Olvidado" },
  perdido:  { bg: "rgba(220,38,38,.12)",  fg: "#991B1B", label: "Perdido" },
  sin_data: { bg: "rgba(0,0,0,.04)",      fg: "#6B7280", label: "—" },
};

// Clasificación por percentil dentro del depto (4 niveles)
const TIER_CHIP_DRAWER = {
  estrella: { bg: "rgba(212,168,90,.18)",   border: "rgba(212,168,90,.45)",  fg: "#8B6A1F" },
  alto:     { bg: "rgba(42,111,219,.12)",   border: "rgba(42,111,219,.32)",  fg: "#1E54B0" },
  medio:    { bg: "rgba(135,122,102,.14)",  border: "rgba(135,122,102,.32)", fg: "#4A4136" },
  bajo:     { bg: "rgba(181,70,42,.08)",    border: "rgba(181,70,42,.22)",   fg: "#8A2F18" },
};

function EstadoBadgeDrawer({ estado }) {
  if (!estado) return null;
  const s = ESTADO_BADGE[estado];
  if (!s) return null;
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
      style={{ background: s.bg, color: s.fg, letterSpacing: "0.06em" }}
      data-testid="drawer-estado-auto"
    >
      {s.label}
    </span>
  );
}

function TierChipDrawer({ tier }) {
  if (!tier) return null;
  const s = TIER_CHIP_DRAWER[tier] || TIER_CHIP_DRAWER.bronce;
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase"
      style={{ background: s.bg, color: s.fg, border: `1px solid ${s.border}`, letterSpacing: "0.06em" }}
      data-testid="drawer-tier"
    >
      ★ {tier}
    </span>
  );
}

const fmtMoney = (n) => "S/ " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }) : "-";

const TABS = [
  { key: "resumen", label: "Resumen", icon: LayoutDashboard },
  { key: "ventas", label: "Ventas", icon: ShoppingBag },
  { key: "reservas", label: "Reservas", icon: ShoppingBag },
  { key: "creditos", label: "Creditos", icon: CreditCard },
  { key: "info_ventas", label: "Info Ventas", icon: BarChart3 },
  { key: "yoy", label: "YoY", icon: TrendingUp },
  { key: "analitica", label: "Analitica", icon: Activity },
  { key: "contactos", label: "Contactos", icon: Users },
  { key: "interacciones", label: "Interacciones", icon: MessageSquare },
  { key: "tareas", label: "Tareas", icon: CheckSquare },
  { key: "perfil", label: "Perfil", icon: Settings },
];

function daysBadge(days) {
  if (days == null) return null;
  let color = "bg-emerald-100 text-emerald-700";
  if (days > 30) color = "bg-red-100 text-red-700";
  else if (days > 7) color = "bg-amber-100 text-amber-700";
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${color}`}>{days}d</span>;
}

export function CuentaDetailPanel({ cuentaId, activeTab, onTabChange, onCuentaChanged }) {
  const navigate = useNavigate();
  const [cuenta, setCuenta] = useState(null);
  const [headerMetrics, setHeaderMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showToggleModal, setShowToggleModal] = useState(false);
  const [toggleReason, setToggleReason] = useState("");
  const [toggleLoading, setToggleLoading] = useState(false);
  const [contactosCount, setContactosCount] = useState({ total: 0, active: 0 });
  const [openQuickFu, setOpenQuickFu] = useState(false);  // D3

  useEffect(() => {
    if (!cuentaId) return;
    setLoading(true);
    Promise.all([
      api.get(`/cuentas/${cuentaId}`),
      api.get(`/cuentas/${cuentaId}/header-metrics`),
    ]).then(([cRes, mRes]) => {
      setCuenta(cRes.data);
      setHeaderMetrics(mRes.data);
    }).catch(() => toast.error("Error cargando cuenta"))
      .finally(() => setLoading(false));
  }, [cuentaId]);

  const isActive = cuenta ? (cuenta.is_active !== false) : true;

  const handleToggleActive = async () => {
    if (!isActive) {
      // ACTIVATE - no confirmation needed
      setToggleLoading(true);
      try {
        await api.patch(`/cuentas/${cuentaId}/active`, { is_active: true });
        const r = await api.get(`/cuentas/${cuentaId}`);
        setCuenta(r.data);
        toast.success("Cuenta activada");
        if (onCuentaChanged) onCuentaChanged();
      } catch { toast.error("Error activando"); }
      finally { setToggleLoading(false); }
      return;
    }
    // DEACTIVATE - fetch count first, then show modal
    try {
      const r = await api.get(`/cuentas/${cuentaId}/contactos/count-active`);
      setContactosCount(r.data);
    } catch { setContactosCount({ total: 0, active: 0 }); }
    setToggleReason("");
    setShowToggleModal(true);
  };

  const confirmDeactivate = async () => {
    setToggleLoading(true);
    try {
      await api.patch(`/cuentas/${cuentaId}/active`, { is_active: false, reason: toggleReason || "MANUAL" });
      const r = await api.get(`/cuentas/${cuentaId}`);
      setCuenta(r.data);
      toast.success("Cuenta inactivada");
      setShowToggleModal(false);
      if (onCuentaChanged) onCuentaChanged();
    } catch { toast.error("Error inactivando"); }
    finally { setToggleLoading(false); }
  };

  if (!cuentaId) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400" data-testid="empty-detail">
        <div className="text-center">
          <LayoutDashboard size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Selecciona una cuenta</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!cuenta) return null;

  const partner = cuenta.partner || {};
  const name = partner.name || `Cuenta #${cuentaId}`;
  const m = headerMetrics || {};

  return (
    <div className="flex flex-col h-full min-w-0" data-testid="detail-panel">
      {/* Compact Header — D3 enriquecido con estado_auto + tier + acciones */}
      <div className={`shrink-0 border-b bg-white px-4 py-2.5 ${!isActive ? "border-red-200 bg-red-50/50" : "border-slate-200"}`} data-testid="detail-header">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className={`text-sm font-bold truncate ${!isActive ? "text-slate-500 line-through" : "text-slate-900"}`}>{name}</h2>
              <EstadoBadgeDrawer estado={m.estado_auto} />
              <TierChipDrawer tier={m.tier} />
              {partner.city && <span className="text-[10px] text-slate-400 flex items-center gap-0.5 shrink-0"><MapPin size={9} />{partner.city}</span>}
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {/* Recencia + LTV en 1 línea */}
              {m.recencia_dias != null && (
                <span className="text-[10px] text-slate-500">
                  <span className="font-semibold text-slate-700">{m.recencia_dias}d</span> sin compra
                  {m.freq_dias_estimada && (
                    <span className="text-slate-400"> · ciclo {m.freq_dias_estimada.toFixed(1)}d</span>
                  )}
                </span>
              )}
              {m.sales_12m_amount > 0 && (
                <span className="text-[10px] text-slate-500">
                  · LTV <span className="font-semibold text-slate-700">{fmtMoney(m.sales_12m_amount)}</span>
                </span>
              )}
              {cuenta.estado_comercial && cuenta.estado_comercial !== "ACTIVO" && (
                <Badge variant="outline" className="text-[9px] font-semibold">{cuenta.estado_comercial}</Badge>
              )}
              {!isActive && (
                <Badge variant="destructive" className="text-[9px] font-bold" data-testid="badge-inactiva">INACTIVA</Badge>
              )}
              {!isActive && cuenta.inactive_reason && (
                <span className="text-[9px] text-red-500">{cuenta.inactive_reason}</span>
              )}
            </div>
          </div>
          {/* Acciones rápidas D3 */}
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="outline" size="sm"
              className="h-7 text-[10px] px-2 gap-1"
              onClick={() => navigate(`/cuentas/${cuentaId}`)}
              data-testid="btn-ver-detalle-completo"
              title="Ver detalle completo"
            >
              <ExternalLink size={11} />
              Detalle
            </Button>
            <Button
              variant="outline" size="sm"
              className="h-7 text-[10px] px-2 gap-1"
              onClick={() => setOpenQuickFu(true)}
              data-testid="btn-drawer-quickfu"
              title="Quick Followup"
            >
              <Sparkles size={11} className="text-amber-500" />
              Followup
            </Button>
            <Button
              variant={isActive ? "outline" : "default"}
              size="sm"
              className={`shrink-0 text-[10px] h-7 px-2 ${isActive ? "text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700" : "bg-emerald-600 hover:bg-emerald-700 text-white"}`}
              onClick={handleToggleActive}
              disabled={toggleLoading}
              data-testid="toggle-active-btn"
            >
              {toggleLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Power size={11} />}
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 border-b border-slate-200 bg-white overflow-x-auto" data-testid="detail-tabs">
        {/* Desktop tabs */}
        <div className="hidden md:flex items-center gap-0 px-2">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => onTabChange(t.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium whitespace-nowrap border-b-2 transition-colors
                  ${active ? "border-slate-800 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"}`}
                data-testid={`tab-${t.key}`}
              >
                <Icon size={13} />{t.label}
              </button>
            );
          })}
        </div>
        {/* Mobile dropdown */}
        <div className="md:hidden px-3 py-1.5">
          <Select value={activeTab} onValueChange={onTabChange}>
            <SelectTrigger className="h-8 text-xs"><Menu size={14} className="mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent>
              {TABS.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0" data-testid="detail-content">
        {activeTab === "resumen" && <ResumenTab cuentaId={cuentaId} headerMetrics={m} onNavigate={onTabChange} />}
        {activeTab === "ventas" && <VentasTab cuentaId={cuentaId} />}
        {activeTab === "reservas" && <ReservasTab cuentaId={cuentaId} />}
        {activeTab === "creditos" && <CreditosTab cuentaId={cuentaId} />}
        {activeTab === "info_ventas" && <InfoVentasTab cuentaId={cuentaId} />}
        {activeTab === "yoy" && <YoYTab cuentaId={cuentaId} />}
        {activeTab === "analitica" && <AnaliticaTab cuentaId={cuentaId} />}
        {activeTab === "contactos" && <ContactosTab cuentaId={cuentaId} />}
        {activeTab === "interacciones" && <InteraccionesTab cuentaId={cuentaId} />}
        {activeTab === "tareas" && <TareasTab cuentaId={cuentaId} />}
        {activeTab === "perfil" && <PerfilTab cuentaId={cuentaId} cuenta={cuenta} onUpdate={setCuenta} />}
      </div>

      {/* Deactivation confirmation modal */}
      <Dialog open={showToggleModal} onOpenChange={setShowToggleModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle size={18} className="text-red-500" />Inactivar cuenta</DialogTitle>
            <DialogDescription>
              Esto inactivara la cuenta <strong>{name}</strong>
              {contactosCount.active > 0 && <> y <strong>{contactosCount.active} contacto(s)</strong> asociados</>}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              placeholder="Razon de inactivacion (opcional)"
              value={toggleReason}
              onChange={e => setToggleReason(e.target.value)}
              rows={2}
              data-testid="deactivate-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowToggleModal(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDeactivate} disabled={toggleLoading} data-testid="confirm-deactivate-btn">
              {toggleLoading && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Confirmar inactivacion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Followup Modal — D3 */}
      {openQuickFu && (
        <QuickFollowupModal
          cuenta={{ partner_odoo_id: parseInt(cuentaId), nombre: name }}
          onClose={() => setOpenQuickFu(false)}
          onSaved={() => {
            setOpenQuickFu(false);
            if (onCuentaChanged) onCuentaChanged();
          }}
        />
      )}
    </div>
  );
}
