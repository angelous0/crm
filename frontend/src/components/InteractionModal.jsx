import React, { useState, useCallback, useEffect } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, MessageCircle, Phone, Send } from "lucide-react";

const CHANNELS = [
  { value: "WHATSAPP", label: "WhatsApp", icon: MessageCircle },
  { value: "LLAMADA", label: "Llamada", icon: Phone },
  { value: "VISITA", label: "Visita", icon: Send },
  { value: "OTRO", label: "Otro", icon: Send },
];

const OUTCOMES = [
  { value: "CONTESTO", label: "Contesto" },
  { value: "NO_CONTESTO", label: "No contesto" },
  { value: "INTERESADO", label: "Interesado" },
  { value: "NO_INTERESADO", label: "No interesado" },
  { value: "PIDE_STOCK", label: "Pide stock/reposicion" },
  { value: "PIDE_PRECIO", label: "Pide precio" },
  { value: "COBRAR", label: "Cobranza" },
  { value: "OTRO", label: "Otro" },
];

const NEXT_TYPES = [
  { value: "LLAMAR", label: "Llamar" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "VISITA", label: "Visita" },
  { value: "ENVIAR_CATALOGO", label: "Enviar catalogo" },
  { value: "COBRAR", label: "Cobrar" },
  { value: "OTRO", label: "Otro" },
];

/**
 * Modal for registering an interaction, then prompts for next action.
 */
export function InteractionModal({ open, onClose, cuentaId, cuentaNombre, onDone }) {
  const [step, setStep] = useState("interaction"); // interaction | next_action
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState([]);

  // Interaction fields
  const [channel, setChannel] = useState("WHATSAPP");
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");

  // Next action fields
  const [naType, setNaType] = useState("LLAMAR");
  const [naDate, setNaDate] = useState("");
  const [naNote, setNaNote] = useState("");

  useEffect(() => {
    if (open) {
      setStep("interaction");
      setChannel("WHATSAPP");
      setOutcome("");
      setNote("");
      setNaType("LLAMAR");
      setNaDate(getDefaultDate());
      setNaNote("");
      api.get("/interaction-templates").then(r => setTemplates(r.data || [])).catch(() => {});
    }
  }, [open]);

  const getDefaultDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 16);
  };

  const applyTemplate = (tpl) => {
    setChannel(tpl.channel);
    if (tpl.outcome) setOutcome(tpl.outcome);
    setNote(tpl.default_note);
  };

  const saveInteraction = async () => {
    setLoading(true);
    try {
      await api.post("/interacciones", { cuenta_id: cuentaId, channel, outcome: outcome || null, note: note || null });
      toast.success("Interaccion registrada");
      setStep("next_action");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  const saveNextAction = async () => {
    setLoading(true);
    try {
      await api.patch(`/cuentas/${cuentaId}/next-action`, {
        next_action_type: naType,
        next_action_at: naDate || null,
        next_action_note: naNote || null,
        create_task: true,
      });
      toast.success("Proxima accion guardada");
      if (onDone) onDone();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  const skipNextAction = () => {
    if (onDone) onDone();
    onClose();
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="interaction-modal">
        {step === "interaction" ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-sm">Registrar interaccion</DialogTitle>
              <DialogDescription className="text-xs truncate">
                {cuentaNombre || `Cuenta #${cuentaId}`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {/* Templates */}
              {templates.length > 0 && (
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Plantillas rapidas</label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {templates.map(t => (
                      <button key={t.id} onClick={() => applyTemplate(t)}
                        className="px-2 py-1 text-[10px] rounded-md border border-slate-200 hover:bg-slate-100 text-slate-700 transition-colors"
                        data-testid={`template-${t.id}`}>
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Channel */}
              <div>
                <label className="text-xs font-medium text-slate-700 mb-1 block">Canal</label>
                <div className="flex gap-1.5">
                  {CHANNELS.map(ch => (
                    <button key={ch.value} onClick={() => setChannel(ch.value)}
                      className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-md border text-[11px] font-medium transition-colors
                        ${channel === ch.value ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                      data-testid={`channel-${ch.value.toLowerCase()}`}>
                      <ch.icon size={12} />{ch.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Outcome */}
              <div>
                <label className="text-xs font-medium text-slate-700 mb-1 block">Resultado</label>
                <Select value={outcome} onValueChange={setOutcome}>
                  <SelectTrigger className="h-8 text-xs" data-testid="outcome-select">
                    <SelectValue placeholder="Seleccionar resultado..." />
                  </SelectTrigger>
                  <SelectContent>
                    {OUTCOMES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Note */}
              <div>
                <label className="text-xs font-medium text-slate-700 mb-1 block">Nota</label>
                <Textarea value={note} onChange={e => setNote(e.target.value)}
                  placeholder="Detalle de la interaccion..." className="text-xs min-h-[60px]" data-testid="interaction-note" />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={onClose} className="text-xs" data-testid="interaction-cancel">Cancelar</Button>
              <Button size="sm" className="text-xs bg-blue-600 hover:bg-blue-700 text-white" disabled={loading || !channel}
                onClick={saveInteraction} data-testid="interaction-save">
                {loading && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Guardar y continuar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-sm">Proxima accion</DialogTitle>
              <DialogDescription className="text-xs">
                Define la proxima accion para esta cuenta
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-700 mb-1 block">Tipo</label>
                <Select value={naType} onValueChange={setNaType}>
                  <SelectTrigger className="h-8 text-xs" data-testid="na-type-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NEXT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700 mb-1 block">Fecha y hora</label>
                <Input type="datetime-local" value={naDate} onChange={e => setNaDate(e.target.value)}
                  className="h-8 text-xs" data-testid="na-date" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700 mb-1 block">Nota</label>
                <Textarea value={naNote} onChange={e => setNaNote(e.target.value)}
                  placeholder="Detalle..." className="text-xs min-h-[50px]" data-testid="na-note" />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="ghost" size="sm" onClick={skipNextAction} className="text-xs text-slate-500" data-testid="na-skip">
                Omitir
              </Button>
              <Button size="sm" className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white" disabled={loading || !naDate}
                onClick={saveNextAction} data-testid="na-save">
                {loading && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Guardar accion
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
