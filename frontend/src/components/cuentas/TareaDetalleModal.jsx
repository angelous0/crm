import React, { useState } from "react";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Edit3, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

const PRIO_LABEL = {
  1: { label: "1 · Crítica",   cls: "bg-red-100 text-red-700 border-red-200" },
  2: { label: "2 · Alta",      cls: "bg-orange-100 text-orange-700 border-orange-200" },
  3: { label: "3 · Media",     cls: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  4: { label: "4 · Baja",      cls: "bg-blue-100 text-blue-700 border-blue-200" },
  5: { label: "5 · Info",      cls: "bg-slate-100 text-slate-600 border-slate-200" },
};

const STATUS_BADGE = {
  PENDIENTE:   "bg-amber-100 text-amber-700 border-amber-200",
  HECHO:       "bg-emerald-100 text-emerald-700 border-emerald-200",
  CANCELADO:   "bg-slate-100 text-slate-500 border-slate-200",
};

const fmtFull = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

export function TareaDetalleModal({ open, onClose, tarea, onEdit, onChanged }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(null); // 'completar' | 'cancelar' | 'borrar'
  if (!tarea) return null;

  const isAdmin   = user?.rol === "admin";
  const isCreator = tarea.created_by === user?.username;
  const isAssigned = tarea.asignado_a === user?.username;
  const canEdit   = isCreator || isAssigned || isAdmin;
  const canDelete = isCreator || isAdmin;
  const canComplete = canEdit && tarea.status === "PENDIENTE";

  const prio = PRIO_LABEL[tarea.prioridad] || PRIO_LABEL[3];

  const completar = async () => {
    setBusy("completar");
    try {
      await api.patch(`/tareas/${tarea.id}/completar`);
      toast.success("Tarea completada");
      onChanged?.();
      onClose?.();
    } catch (err) {
      toast.error("No se pudo completar: " + (err.response?.data?.detail || err.message));
    } finally { setBusy(null); }
  };

  const borrar = async () => {
    if (!window.confirm("¿Borrar esta tarea? Esta acción no se puede deshacer.")) return;
    setBusy("borrar");
    try {
      await api.delete(`/tareas/${tarea.id}`);
      toast.success("Tarea borrada");
      onChanged?.();
      onClose?.();
    } catch (err) {
      toast.error("No se pudo borrar: " + (err.response?.data?.detail || err.message));
    } finally { setBusy(null); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && !v && onClose?.()}>
      <DialogContent className="max-w-md" data-testid="modal-detalle-tarea">
        <DialogHeader>
          <DialogTitle className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
            Detalle de tarea
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Status + prioridad */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={`text-[10px] font-semibold ${STATUS_BADGE[tarea.status] || ""}`}>
              {tarea.status}
            </Badge>
            <Badge variant="outline" className={`text-[10px] font-semibold ${prio.cls}`}>
              {prio.label}
            </Badge>
            <span className="text-xs text-slate-500">· {tarea.tipo}</span>
          </div>

          {/* Descripción */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Descripción</div>
            <div className="text-sm text-slate-900 mt-0.5 whitespace-pre-wrap">{tarea.descripcion}</div>
          </div>

          {/* Meta */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t text-[11px] text-slate-500">
            <div>
              <div className="uppercase tracking-wider">Vence</div>
              <div className="text-slate-700 mt-0.5">{fmtFull(tarea.due_at)}</div>
            </div>
            <div>
              <div className="uppercase tracking-wider">Asignado a</div>
              <div className="text-slate-700 mt-0.5">{tarea.asignado_a || "—"}</div>
            </div>
            <div>
              <div className="uppercase tracking-wider">Creador</div>
              <div className="text-slate-700 mt-0.5">{tarea.created_by || "—"}</div>
            </div>
            {tarea.done_at && (
              <div>
                <div className="uppercase tracking-wider">Completada</div>
                <div className="text-slate-700 mt-0.5">{fmtFull(tarea.done_at)}</div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex-1">
            {canDelete && (
              <Button
                variant="ghost" size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 text-xs"
                onClick={borrar}
                disabled={!!busy}
              >
                {busy === "borrar" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Trash2 className="h-3 w-3 mr-1" />}
                Borrar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={!!busy}>Cerrar</Button>
            {canComplete && (
              <Button size="sm" variant="outline" onClick={completar} disabled={!!busy}>
                {busy === "completar" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                Completar
              </Button>
            )}
            {canEdit && (
              <Button size="sm" onClick={() => { onClose?.(); onEdit?.(tarea); }} disabled={!!busy}>
                <Edit3 className="h-3 w-3 mr-1" /> Editar
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
