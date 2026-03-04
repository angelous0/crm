import React, { useState, useCallback, useEffect } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  Loader2, AlertTriangle, CalendarCheck, Clock, ShieldAlert,
  MessageCircle, Phone, Plus, Check, ChevronRight
} from "lucide-react";
import { InteractionModal } from "@/components/InteractionModal";

const fmtTime = (d) => d ? new Date(d).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-";

const PRIORITY_COLORS = { 1: "bg-red-500", 2: "bg-amber-500", 3: "bg-slate-400" };
const PRIORITY_LABELS = { 1: "Alta", 2: "Media", 3: "Baja" };

const ACTION_ICONS = {
  LLAMAR: Phone, WHATSAPP: MessageCircle, VISITA: ChevronRight,
  ENVIAR_CATALOGO: ChevronRight, COBRAR: ChevronRight, OTRO: ChevronRight,
};

function daysColor(days) {
  if (days == null) return "text-slate-400";
  if (days <= 14) return "text-emerald-600";
  if (days <= 45) return "text-amber-600";
  return "text-red-600";
}

function daysBg(days) {
  if (days == null) return "bg-slate-100";
  if (days <= 14) return "bg-emerald-50 border-emerald-200";
  if (days <= 45) return "bg-amber-50 border-amber-200";
  return "bg-red-50 border-red-200";
}

/* ─── Main Page ─── */
export default function MiDiaPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [interModal, setInterModal] = useState({ open: false, cuentaId: null, cuentaNombre: "" });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/my-day");
      setData(r.data);
    } catch (e) {
      toast.error("Error cargando Mi Dia");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const completeTarea = async (id) => {
    try {
      await api.post(`/tareas/${id}/done`);
      toast.success("Tarea completada");
      fetchData();
    } catch { toast.error("Error"); }
  };

  const openInteraction = (cuentaId, cuentaNombre) => {
    setInterModal({ open: true, cuentaId, cuentaNombre });
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const s = data?.stats || {};

  return (
    <div className="flex flex-col h-screen bg-slate-50/50" data-testid="mi-dia-page">
      {/* Header */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-heading font-semibold text-slate-900 tracking-tight" data-testid="mi-dia-title">Mi Dia</h1>
            <p className="text-xs text-slate-500 mt-0.5">{new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatPill label="Abiertas" value={s.tareas_abiertas || 0} color="text-blue-600" />
            <StatPill label="Vencidas" value={s.tareas_vencidas || 0} color={s.tareas_vencidas > 0 ? "text-red-600" : "text-slate-400"} />
            <StatPill label="Llamadas" value={s.llamadas_hoy || 0} color="text-slate-600" />
            <StatPill label="WhatsApp" value={s.whatsapps_hoy || 0} color="text-emerald-600" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0 auto-rows-min">
        {/* Overdue */}
        <SectionCard
          title="Vencidas" icon={AlertTriangle} iconColor="text-red-500"
          count={data?.tasks_overdue?.length || 0} testId="overdue-section"
          empty="Sin tareas vencidas">
          {data?.tasks_overdue?.map(t => (
            <TaskRow key={t.id} task={t} onComplete={() => completeTarea(t.id)}
              onInteract={() => openInteraction(t.cuenta_id, t.cuenta_nombre)} />
          ))}
        </SectionCard>

        {/* Today */}
        <SectionCard
          title="Hoy" icon={CalendarCheck} iconColor="text-blue-500"
          count={data?.tasks_today?.length || 0} testId="today-section"
          empty="Sin tareas para hoy">
          {data?.tasks_today?.map(t => (
            <TaskRow key={t.id} task={t} onComplete={() => completeTarea(t.id)}
              onInteract={() => openInteraction(t.cuenta_id, t.cuenta_nombre)} />
          ))}
        </SectionCard>

        {/* Next Actions */}
        <SectionCard
          title="Cuentas a contactar" icon={Clock} iconColor="text-amber-500"
          count={data?.next_actions_today?.length || 0} testId="next-actions-section"
          empty="Sin cuentas pendientes">
          {data?.next_actions_today?.map(a => (
            <NextActionRow key={a.cuenta_id} action={a}
              onInteract={() => openInteraction(a.cuenta_id, a.cuenta_nombre)} />
          ))}
        </SectionCard>

        {/* Risk */}
        <SectionCard
          title="En riesgo" icon={ShieldAlert} iconColor="text-red-500"
          count={data?.risk_accounts?.length || 0} testId="risk-section"
          empty="Sin cuentas en riesgo">
          {data?.risk_accounts?.map(a => (
            <RiskRow key={a.cuenta_id} account={a}
              onInteract={() => openInteraction(a.cuenta_id, a.cuenta_nombre)} />
          ))}
        </SectionCard>
      </div>

      <InteractionModal
        open={interModal.open}
        onClose={() => setInterModal({ open: false, cuentaId: null, cuentaNombre: "" })}
        cuentaId={interModal.cuentaId}
        cuentaNombre={interModal.cuentaNombre}
        onDone={fetchData}
      />
    </div>
  );
}

/* ─── Sub-components ─── */

function StatPill({ label, value, color }) {
  return (
    <div className="text-center" data-testid={`stat-${label.toLowerCase()}`}>
      <span className={`text-lg font-bold ${color}`}>{value}</span>
      <span className="block text-[9px] text-slate-500 uppercase tracking-wider">{label}</span>
    </div>
  );
}

function SectionCard({ title, icon: Icon, iconColor, count, testId, empty, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm flex flex-col" data-testid={testId}>
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/50 shrink-0">
        <Icon size={14} className={iconColor} />
        <span className="text-xs font-semibold text-slate-700">{title}</span>
        {count > 0 && (
          <Badge variant="secondary" className="ml-auto text-[9px] h-4 px-1.5">{count}</Badge>
        )}
      </div>
      <div className="flex-1 overflow-auto max-h-[280px]">
        {(!children || (Array.isArray(children) && children.length === 0)) ? (
          <div className="p-6 text-center text-xs text-slate-400">{empty}</div>
        ) : children}
      </div>
    </div>
  );
}

function TaskRow({ task, onComplete, onInteract }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors group"
      data-testid={`task-${task.id}`}>
      <button onClick={onComplete} className="shrink-0 w-5 h-5 rounded border border-slate-300 flex items-center justify-center hover:bg-emerald-50 hover:border-emerald-400 transition-colors"
        data-testid={`task-done-${task.id}`}>
        <Check size={10} className="text-slate-400 group-hover:text-emerald-500" />
      </button>
      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_COLORS[task.priority] || PRIORITY_COLORS[2]}`}
        title={PRIORITY_LABELS[task.priority]} />
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium text-slate-900 truncate block">{task.title || "Sin titulo"}</span>
        <span className="text-[10px] text-slate-500 truncate block">{task.cuenta_nombre} · {fmtTime(task.due_at)}</span>
      </div>
      <QuickActions onInteract={onInteract} />
    </div>
  );
}

function NextActionRow({ action, onInteract }) {
  const Icon = ACTION_ICONS[action.next_action_type] || ChevronRight;
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
      data-testid={`na-${action.cuenta_id}`}>
      <Icon size={13} className="text-blue-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium text-slate-900 truncate block">{action.cuenta_nombre}</span>
        <span className="text-[10px] text-slate-500">
          {action.next_action_type} · {fmtTime(action.next_action_at)}
          {action.next_action_note && ` · ${action.next_action_note}`}
        </span>
      </div>
      <QuickActions phone={action.phone_whatsapp} onInteract={onInteract} />
    </div>
  );
}

function RiskRow({ account, onInteract }) {
  const days = account.days_since;
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
      data-testid={`risk-${account.cuenta_id}`}>
      <span className={`inline-flex items-center justify-center w-9 h-5 rounded text-[9px] font-bold border ${daysBg(days)} ${daysColor(days)}`}>
        {days}d
      </span>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium text-slate-900 truncate block">{account.cuenta_nombre}</span>
      </div>
      <QuickActions phone={account.phone_whatsapp} onInteract={onInteract} />
    </div>
  );
}

function QuickActions({ phone, onInteract }) {
  return (
    <TooltipProvider>
      <div className="flex items-center gap-0.5 shrink-0">
        {phone && (
          <Tooltip>
            <TooltipTrigger asChild>
              <a href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer"
                className="p-1 rounded hover:bg-emerald-50 text-emerald-600" onClick={e => e.stopPropagation()}
                data-testid="quick-wa">
                <MessageCircle size={13} />
              </a>
            </TooltipTrigger>
            <TooltipContent className="text-xs">WhatsApp</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={onInteract} className="p-1 rounded hover:bg-blue-50 text-blue-600" data-testid="quick-interact">
              <Plus size={13} />
            </button>
          </TooltipTrigger>
          <TooltipContent className="text-xs">Registrar interaccion</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
