import React, { useState } from "react";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Edit3, Trash2, Phone, MessageCircle, Mail, Building2, Calendar } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

const channelIcon = (ch) => {
  const c = (ch || "").toUpperCase();
  if (c === "WHATSAPP") return MessageCircle;
  if (c === "LLAMADA") return Phone;
  if (c === "EMAIL") return Mail;
  if (c === "VISITA") return Building2;
  return Calendar;
};

const outcomeBadgeClass = (o) => {
  const map = {
    COMPRO:      "bg-emerald-100 text-emerald-700 border-emerald-200",
    INTERESADO:  "bg-blue-100 text-blue-700 border-blue-200",
    AGENDO:      "bg-orange-100 text-orange-700 border-orange-200",
    COTIZO:      "bg-orange-100 text-orange-700 border-orange-200",
    RECHAZO:     "bg-red-100 text-red-700 border-red-200",
    NO_RESPONDE: "bg-red-100 text-red-700 border-red-200",
    NEUTRO:      "bg-slate-100 text-slate-600 border-slate-200",
  };
  return map[o] || "bg-slate-100 text-slate-600 border-slate-200";
};

const fmtFull = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

export function InteraccionDetalleModal({ open, onClose, interaccion, onEdit, onDeleted }) {
  const { user } = useAuth();
  const [deleting, setDeleting] = useState(false);
  if (!interaccion) return null;

  const Icon = channelIcon(interaccion.channel);
  const isAdmin = user?.rol === "admin";
  const isCreator = interaccion.created_by === user?.username;
  const canEdit = isCreator || isAdmin;

  const handleDelete = async () => {
    if (!window.confirm("¿Borrar esta interacción? Esta acción no se puede deshacer.")) return;
    setDeleting(true);
    try {
      await api.delete(`/interacciones/${interaccion.id}`);
      toast.success("Interacción borrada");
      onDeleted?.();
      onClose?.();
    } catch (err) {
      toast.error("No se pudo borrar: " + (err.response?.data?.detail || err.message));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !deleting && !v && onClose?.()}>
      <DialogContent className="max-w-md" data-testid="modal-detalle-interaccion">
        <DialogHeader>
          <DialogTitle className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
            Detalle de interacción
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Header con channel + outcome */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="h-9 w-9 rounded-md bg-slate-100 flex items-center justify-center">
              <Icon className="h-4 w-4 text-slate-600" />
            </div>
            <div className="text-sm font-semibold">{interaccion.channel || interaccion.tipo || "—"}</div>
            {interaccion.outcome && (
              <Badge variant="outline" className={`text-[10px] font-semibold ${outcomeBadgeClass(interaccion.outcome)}`}>
                {interaccion.outcome}
              </Badge>
            )}
          </div>

          {/* Resumen */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Resumen</div>
            <div className="text-sm text-slate-900 mt-0.5 whitespace-pre-wrap">{interaccion.resumen}</div>
          </div>

          {/* Resultado / detalle */}
          {interaccion.resultado && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Detalle</div>
              <div className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap">{interaccion.resultado}</div>
            </div>
          )}

          {/* Meta */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t text-[11px] text-slate-500">
            <div>
              <div className="uppercase tracking-wider">Cuándo</div>
              <div className="text-slate-700 mt-0.5">{fmtFull(interaccion.happened_at)}</div>
            </div>
            <div>
              <div className="uppercase tracking-wider">Por</div>
              <div className="text-slate-700 mt-0.5">{interaccion.created_by || "—"}</div>
            </div>
            {interaccion.tipo && (
              <div>
                <div className="uppercase tracking-wider">Tipo</div>
                <div className="text-slate-700 mt-0.5">{interaccion.tipo}</div>
              </div>
            )}
            {interaccion.updated_at && interaccion.updated_at !== interaccion.created_at && (
              <div>
                <div className="uppercase tracking-wider">Editada</div>
                <div className="text-slate-700 mt-0.5">{fmtFull(interaccion.updated_at)}</div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex-1">
            {canEdit && (
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 text-xs"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Trash2 className="h-3 w-3 mr-1" />}
                Borrar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={deleting}>Cerrar</Button>
            {canEdit && (
              <Button size="sm" onClick={() => { onClose?.(); onEdit?.(interaccion); }} disabled={deleting}>
                <Edit3 className="h-3 w-3 mr-1" /> Editar
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
