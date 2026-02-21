import React, { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, MapPin, LayoutDashboard, Users, ShoppingBag, CreditCard, BarChart3, TrendingUp, Activity, MessageSquare, CheckSquare, Settings, Menu, Power, AlertTriangle } from "lucide-react";
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

export function CuentaDetailPanel({ cuentaId, activeTab, onTabChange }) {
  const [cuenta, setCuenta] = useState(null);
  const [headerMetrics, setHeaderMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

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
      {/* Compact Header */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-2.5" data-testid="detail-header">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 truncate">{name}</h2>
              {partner.city && <span className="text-[10px] text-slate-400 flex items-center gap-0.5 shrink-0"><MapPin size={9} />{partner.city}</span>}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-[9px] font-semibold">{cuenta.estado_comercial || "ACTIVO"}</Badge>
              {cuenta.clasificacion && <Badge variant="secondary" className="text-[9px]">{cuenta.clasificacion}</Badge>}
            </div>
          </div>
          <div className="hidden md:flex items-center gap-4 shrink-0 text-[10px]">
            <div className="text-center">
              <div className="text-slate-400 uppercase tracking-wider font-medium">Ult. compra</div>
              <div className="text-slate-700 font-semibold">{fmtDate(m.last_purchase_date)}</div>
            </div>
            <div className="text-center">
              <div className="text-slate-400 uppercase tracking-wider font-medium">Hace</div>
              <div>{daysBadge(m.days_since_last_purchase) || <span className="text-slate-400">-</span>}</div>
            </div>
            <div className="text-center">
              <div className="text-slate-400 uppercase tracking-wider font-medium">Ventas 12m</div>
              <div className="text-slate-700 font-bold">{fmtMoney(m.sales_12m_amount)}</div>
            </div>
            <div className="text-center">
              <div className="text-slate-400 uppercase tracking-wider font-medium">Compras</div>
              <div className="text-slate-700 font-semibold">{m.orders_12m_count || 0}</div>
            </div>
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
    </div>
  );
}
