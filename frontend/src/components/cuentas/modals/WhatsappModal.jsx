import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageCircle, AlertCircle, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const OUTCOMES = ["INTERESADO", "NO_RESPONDE", "COMPRO", "RECHAZO", "AGENDO", "COTIZO", "NEUTRO"];

/** Limpia un número de teléfono PE-friendly y lo prefijo con 51 si falta. */
function normalizePeNumber(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("51") && digits.length >= 11) return digits;
  // Asume móvil PE de 9 dígitos sin código de país
  return digits.length === 9 ? `51${digits}` : digits;
}

export function WhatsappModal({ open, onClose, partnerOdooId, cuenta, contactos = [], onSuccess }) {
  const partner = cuenta?.partner || {};
  const principalPhone = partner.mobile || partner.phone;
  const principalNombre = partner.name;

  const [step, setStep] = useState("init"); // init | no-number | register
  const [outcome, setOutcome] = useState("NEUTRO");
  const [resumen, setResumen] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const num = normalizePeNumber(principalPhone);
    if (!num) {
      setStep("no-number");
      return;
    }
    // Abrir wa.me en nueva pestaña
    window.open(`https://wa.me/${num}`, "_blank", "noopener,noreferrer");
    setStep("register");
    setOutcome("NEUTRO");
    setResumen("");
  }, [open, principalPhone]);

  const guardar = async () => {
    if (resumen.trim().length < 5) {
      toast.error("Escribí un resumen breve (mínimo 5 caracteres)");
      return;
    }
    setSubmitting(true);
    try {
      const principal = contactos.find(c => c.contacto_partner_odoo_id === partner.odoo_id);
      await api.post(`/cuentas/${partnerOdooId}/interacciones`, {
        contacto_partner_odoo_id: principal?.contacto_partner_odoo_id || null,
        tipo: "SEGUIMIENTO",
        channel: "WHATSAPP",
        outcome,
        resumen: resumen.trim(),
        happened_at: new Date().toISOString(),
      });
      toast.success("Interacción registrada");
      onSuccess?.();
      onClose?.();
    } catch (err) {
      toast.error("No se pudo guardar: " + (err.response?.data?.detail || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && !v && onClose?.()}>
      <DialogContent className="max-w-md" data-testid="modal-whatsapp">
        {step === "no-number" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                Sin número de WhatsApp
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-1">
                {principalNombre} no tiene un número de WhatsApp ni móvil registrado en Odoo.
              </DialogDescription>
            </DialogHeader>
            <div className="text-sm text-slate-600">
              Para iniciar una conversación, primero registrá un número en el contacto principal.
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button
                onClick={() => toast.info("Editar contacto · próximamente")}
                disabled
                title="Disponible en Checkpoint 4"
              >
                Editar contacto principal
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <MessageCircle className="h-4 w-4 text-green-600" />
                ¿Registrar esta conversación?
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                Se abrió WhatsApp en otra pestaña <ExternalLink className="h-3 w-3" />
                <span className="ml-1">· {normalizePeNumber(principalPhone)}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Resultado</Label>
                <Select value={outcome} onValueChange={setOutcome} disabled={submitting}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OUTCOMES.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">
                  Resumen <span className="text-red-500">*</span>
                  <span className="text-slate-400 ml-1 font-normal">({resumen.length}/500)</span>
                </Label>
                <Textarea
                  value={resumen}
                  onChange={(e) => setResumen(e.target.value)}
                  placeholder="¿De qué hablaron?"
                  className="min-h-[70px] text-sm"
                  maxLength={500}
                  disabled={submitting}
                  autoFocus
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={submitting}>
                No, después
              </Button>
              <Button onClick={guardar} disabled={submitting} data-testid="btn-registrar-wa">
                {submitting && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                {submitting ? "Guardando..." : "Sí, registrar"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
