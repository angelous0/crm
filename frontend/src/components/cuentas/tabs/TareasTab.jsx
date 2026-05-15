import React, { useCallback, useMemo, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Plus, Loader2, AlertCircle, Check, Edit3, Trash2, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { useTabData } from "@/hooks/useTabData";
import { useAuth } from "@/lib/auth";
import { NuevaTareaModal } from "@/components/cuentas/modals/NuevaTareaModal";
import { TareaDetalleModal } from "@/components/cuentas/TareaDetalleModal";

// Sub-tabs internos. Mapeo a status del backend: PENDIENTE/HECHO/CANCELADO.
// "En progreso" no tiene status real aún → siempre 0 hasta que el backend lo soporte.
const SUBTABS = [
  { key: "PENDIENTE",   label: "Pendientes",    statuses: ["PENDIENTE"]   },
  { key: "EN_PROGRESO", label: "En progreso",   statuses: ["EN_PROGRESO"] },
  { key: "HECHO",       label: "Completadas",   statuses: ["HECHO"]       },
  { key: "CANCELADO",   label: "Canceladas",    statuses: ["CANCELADO"]   },
];

const PRIO_BORDER = {
  1: "before:bg-red-500",
  2: "before:bg-orange-400",
  3: "before:bg-yellow-400",
  4: "before:bg-blue-400",
  5: "before:bg-slate-300",
};

const PRIO_LABEL = {
  1: "P1 Crítica", 2: "P2 Alta", 3: "P3 Media", 4: "P4 Baja", 5: "P5 Info",
};

const fmtDueRelative = (iso) => {
  if (!iso) return { label: "—", cls: "text-slate-400" };
  const ms = new Date(iso).getTime() - Date.now();
  const past = ms < 0;
  const absMin = Math.round(Math.abs(ms) / 60000);
  let label;
  if (absMin < 60)         label = `${absMin}m`;
  else if (absMin < 60*24) label = `${Math.floor(absMin/60)}h`;
  else                     label = `${Math.floor(absMin/60/24)}d`;
  if (past) {
    return { label: `Hace ${label}`, cls: "text-red-600 font-medium" };
  }
  // Hoy si < 24h
  if (absMin < 60*24) {
    return { label: `Vence en ${label}`, cls: "text-orange-600 font-medium" };
  }
  return { label: `En ${label}`, cls: "text-slate-500" };
};

const Skeleton = () => (
  <div className="space-y-1.5">
    {[0,1,2,3].map(i => <div key={i} className="h-14 bg-slate-100 rounded animate-pulse" />)}
  </div>
);

export function TareasTab({ partnerOdooId, contactos = [], active, staleKey, onMutate }) {
  const { user } = useAuth();
  const fetchTareas = useCallback(async () => {
    const r = await api.get(`/cuentas/${partnerOdooId}/tareas`);
    return Array.isArray(r.data) ? r.data : (r.data?.items || []);
  }, [partnerOdooId]);

  const { data: items, loading, error, reload } = useTabData(fetchTareas, {
    enabled: active, staleKey,
  });

  const [subtab, setSubtab] = useState("PENDIENTE");
  const [openCreate, setOpenCreate] = useState(false);
  const [selected, setSelected] = useState(null);
  const [openEdit, setOpenEdit] = useState(false);
  const [busyIds, setBusyIds] = useState(new Set());

  const itemsList = items || [];
  const counts = useMemo(() => {
    const c = { PENDIENTE: 0, EN_PROGRESO: 0, HECHO: 0, CANCELADO: 0 };
    itemsList.forEach(t => {
      if (c[t.status] != null) c[t.status]++;
    });
    return c;
  }, [itemsList]);

  const filtered = useMemo(() => {
    const cfg = SUBTABS.find(s => s.key === subtab);
    return itemsList.filter(t => cfg.statuses.includes(t.status));
  }, [itemsList, subtab]);

  const refresh = async () => {
    await reload();
    onMutate?.();
  };

  const completarInline = async (e, tarea) => {
    e.stopPropagation();
    setBusyIds(s => new Set(s).add(tarea.id));
    try {
      await api.patch(`/tareas/${tarea.id}/completar`);
      toast.success("Tarea completada");
      await refresh();
    } catch (err) {
      toast.error("No se pudo completar: " + (err.response?.data?.detail || err.message));
    } finally {
      setBusyIds(s => { const n = new Set(s); n.delete(tarea.id); return n; });
    }
  };

  const borrarInline = async (e, tarea) => {
    e.stopPropagation();
    if (!window.confirm(`¿Borrar "${(tarea.descripcion || "").slice(0,50)}"?`)) return;
    setBusyIds(s => new Set(s).add(tarea.id));
    try {
      await api.delete(`/tareas/${tarea.id}`);
      toast.success("Tarea borrada");
      await refresh();
    } catch (err) {
      toast.error("No se pudo borrar: " + (err.response?.data?.detail || err.message));
    } finally {
      setBusyIds(s => { const n = new Set(s); n.delete(tarea.id); return n; });
    }
  };

  if (loading && !items) return <Skeleton />;
  if (error) {
    return (
      <div className="border rounded p-3 flex items-center gap-2 text-sm">
        <AlertCircle className="h-4 w-4 text-red-500" />
        <span className="text-slate-600 flex-1">{error}</span>
        <Button size="sm" variant="outline" onClick={reload}>Reintentar</Button>
      </div>
    );
  }

  const emptyMsg = {
    PENDIENTE:   "Sin tareas pendientes 🎉",
    EN_PROGRESO: "Sin tareas en progreso",
    HECHO:       "Aún no hay tareas completadas",
    CANCELADO:   "Sin tareas canceladas",
  }[subtab];

  return (
    <div className="space-y-3">
      {/* Header del tab */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[11px] font-semibold tracking-wider uppercase text-slate-500">
          Tareas <span className="text-slate-400 font-normal ml-1">· {itemsList.length}</span>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
          onClick={() => setOpenCreate(true)}>
          <Plus className="h-3 w-3" /> Nueva tarea
        </Button>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 flex-wrap border-b">
        {SUBTABS.map(s => {
          const isActive = subtab === s.key;
          const c = counts[s.key] || 0;
          return (
            <button
              key={s.key}
              onClick={() => setSubtab(s.key)}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                isActive
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {s.label}
              {c > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                  isActive ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
                }`}>
                  {c}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="px-3 py-8 text-center text-sm text-slate-400 italic">
          {emptyMsg}
        </div>
      ) : (
        <div className="border-t">
          {filtered.map((t) => {
            const due = fmtDueRelative(t.due_at);
            const isAdmin   = user?.rol === "admin";
            const isCreator = t.created_by === user?.username;
            const isAssigned = t.asignado_a === user?.username;
            const canEdit   = isCreator || isAssigned || isAdmin;
            const canDelete = isCreator || isAdmin;
            const canComplete = canEdit && t.status === "PENDIENTE";
            const busy = busyIds.has(t.id);

            return (
              <div
                key={t.id}
                onClick={() => setSelected(t)}
                className={[
                  "group relative grid items-start gap-3 px-3 py-2 border-b cursor-pointer text-sm",
                  "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px]",
                  PRIO_BORDER[t.prioridad] || PRIO_BORDER[3],
                  "hover:bg-slate-50 transition-colors",
                ].join(" ")}
                style={{ gridTemplateColumns: "minmax(0,1fr) 110px 130px" }}
              >
                {/* Descripción + meta */}
                <div className="min-w-0 pl-1">
                  <div className="text-slate-900 font-medium truncate">{t.descripcion}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                    <span>{t.tipo}</span>
                    <span>·</span>
                    <span className="font-medium text-slate-600">{PRIO_LABEL[t.prioridad] || `P${t.prioridad}`}</span>
                    <span>·</span>
                    <span>Asignado a <span className="font-medium text-slate-600">{t.asignado_a || "—"}</span></span>
                    {t.created_by !== t.asignado_a && (
                      <>
                        <span>·</span>
                        <span>Creó {t.created_by}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Vence */}
                <div className={`text-xs flex items-center gap-1 tabular-nums ${due.cls}`}>
                  <Clock className="h-3 w-3" />
                  {due.label}
                </div>

                {/* Acciones (hover-only) */}
                <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {canComplete && (
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={(e) => completarInline(e, t)}
                      disabled={busy}
                      title="Completar"
                    >
                      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    </Button>
                  )}
                  {canEdit && (
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={(e) => { e.stopPropagation(); setSelected(t); setOpenEdit(true); }}
                      title="Editar"
                    >
                      <Edit3 className="h-3 w-3" />
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={(e) => borrarInline(e, t)}
                      disabled={busy}
                      title="Borrar"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modales */}
      <NuevaTareaModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        partnerOdooId={partnerOdooId}
        contactos={contactos}
        onSuccess={refresh}
      />
      <NuevaTareaModal
        open={openEdit}
        onClose={() => { setOpenEdit(false); setSelected(null); }}
        partnerOdooId={partnerOdooId}
        contactos={contactos}
        initialData={openEdit ? selected : null}
        onSuccess={refresh}
      />
      <TareaDetalleModal
        open={!!selected && !openEdit}
        onClose={() => setSelected(null)}
        tarea={selected}
        onEdit={(t) => { setSelected(t); setOpenEdit(true); }}
        onChanged={refresh}
      />
    </div>
  );
}
