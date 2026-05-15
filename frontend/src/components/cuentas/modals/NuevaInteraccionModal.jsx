/**
 * NuevaInteraccionModal — UX optimizada para registro rápido (30+/día).
 *
 * Cambios respecto al modal viejo:
 * - Tipo y Resultado se eligen con BOTONES grandes/chips, no dropdowns.
 * - Channel se DERIVA del Tipo (no se muestra). Compatible con
 *   InteraccionesTab (que filtra por channel).
 * - Contacto: se eliminó del UI (siempre se asume cliente principal,
 *   contacto_partner_odoo_id se envía como null).
 * - Fecha colapsada por defecto a "ahora" — se expande con "Cambiar fecha".
 * - Header muestra "Para: NOMBRE_CLIENTE" si se pasa cuentaName.
 * - Botón "Guardar + crear tarea" abre el modal de tarea con defaults
 *   inteligentes (vía callback onSaveAndCreateTask).
 *
 * Compatibilidad backend: el payload sigue siendo el mismo (tipo, channel,
 * outcome, resumen, resultado, happened_at, contacto_partner_odoo_id).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2, Phone, MessageCircle, MapPin, Mail, StickyNote,
  Check, CalendarClock, X as XIcon, Minus, Pencil, PhoneOff,
} from "lucide-react";
import { toast } from "sonner";

// ─── Tipos visibles. El channel se deriva del tipo (mismo valor) ─────
const TIPOS = [
  { key: "LLAMADA",  label: "Llamada",  icon: Phone,         color: "blue"    },
  { key: "WHATSAPP", label: "WhatsApp", icon: MessageCircle, color: "emerald" },
  { key: "VISITA",   label: "Visita",   icon: MapPin,        color: "amber"   },
  { key: "EMAIL",    label: "Email",    icon: Mail,          color: "indigo"  },
  { key: "NOTA",     label: "Nota",     icon: StickyNote,    color: "slate"   },
];

// ─── Outcomes con etiquetas humanas ──────────────────────────────────
// CRM-D11: agregamos NO_CONTESTA (reusamos clave legacy de BD para no
// duplicar). El chip solo se muestra cuando tipo ∈ {LLAMADA, WHATSAPP}
// porque "No contestó" no aplica semánticamente a Visita/Email/Nota.
// Al seleccionarlo y guardar, el backend auto-crea una tarea
// DEVOLVER_LLAMADA para mañana 09:00 (motivo del sprint D11).
const OUTCOMES = [
  { key: "COMPRO",        label: "Cerró pedido",  icon: Check,         color: "emerald" },
  { key: "REPROGRAMAR",   label: "Volver luego",  icon: CalendarClock, color: "amber"   },
  { key: "NO_CONTESTA",   label: "No contestó",   icon: PhoneOff,      color: "indigo", soloTipos: ["LLAMADA","WHATSAPP"] },
  { key: "NO_INTERESADO", label: "No interesado", icon: XIcon,         color: "red"     },
  { key: "NEUTRO",        label: "Sin novedad",   icon: Minus,         color: "slate"   },
];

// ─── Helpers ────────────────────────────────────────────────────────
/** ISO local sin timezone (yyyy-MM-ddTHH:mm) para input datetime-local */
const toDateTimeLocal = (d) => {
  const x = d || new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
};

/** Texto amigable "Hoy 7:16 pm" o "Ayer 9:30 am" para mostrar fecha colapsada */
const formatFechaAmigable = (dt) => {
  const d = new Date(dt);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yest = new Date(now); yest.setDate(yest.getDate() - 1);
  const isYest = d.toDateString() === yest.toDateString();
  const hours = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, "0");
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  const ampm = hours >= 12 ? "pm" : "am";
  const horaStr = `${h12}:${mins} ${ampm}`;
  if (sameDay)  return `Hoy ${horaStr}`;
  if (isYest)   return `Ayer ${horaStr}`;
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" }) + " · " + horaStr;
};

/** Mapeo: tipo de interacción → tipo de tarea sugerido */
const tipoInteraccionATarea = (t) => {
  if (t === "LLAMADA" || t === "WHATSAPP") return "LLAMADA";
  if (t === "VISITA") return "VISITA";
  return "OTRO"; // EMAIL, NOTA
};

/** Días sugeridos para seguimiento según outcome */
const diasSeguimientoPorOutcome = (o) => {
  if (o === "COMPRO")        return 30;  // verificar reorden
  if (o === "REPROGRAMAR")   return 7;
  if (o === "NO_INTERESADO") return 90;
  return 14; // NEUTRO y resto
};

// ─── Botón grande tipo "tile" ────────────────────────────────────────
function TileButton({ active, label, icon: Icon, color, onClick, disabled }) {
  // Paleta por color base (siempre fondo + texto + ring)
  const palettes = {
    blue:    { idleBg: "bg-blue-50",    idleText: "text-blue-700",    idleRing: "ring-blue-100",    activeBg: "bg-blue-600",    activeRing: "ring-blue-600"    },
    emerald: { idleBg: "bg-emerald-50", idleText: "text-emerald-700", idleRing: "ring-emerald-100", activeBg: "bg-emerald-600", activeRing: "ring-emerald-600" },
    amber:   { idleBg: "bg-amber-50",   idleText: "text-amber-700",   idleRing: "ring-amber-100",   activeBg: "bg-amber-500",   activeRing: "ring-amber-500"   },
    indigo:  { idleBg: "bg-indigo-50",  idleText: "text-indigo-700",  idleRing: "ring-indigo-100",  activeBg: "bg-indigo-600",  activeRing: "ring-indigo-600"  },
    red:     { idleBg: "bg-red-50",     idleText: "text-red-700",     idleRing: "ring-red-100",     activeBg: "bg-red-600",     activeRing: "ring-red-600"     },
    slate:   { idleBg: "bg-slate-100",  idleText: "text-slate-700",   idleRing: "ring-slate-200",   activeBg: "bg-slate-700",   activeRing: "ring-slate-700"   },
  };
  const p = palettes[color] || palettes.slate;
  const cls = active
    ? `${p.activeBg} text-white ring-2 ${p.activeRing} shadow-sm`
    : `${p.idleBg} ${p.idleText} ring-1 ${p.idleRing} hover:ring-2 hover:${p.activeRing.replace("ring-", "ring-")}`;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center gap-1 px-2 py-3 rounded-lg transition-all duration-150 disabled:opacity-50 ${cls}`}
      data-testid={`tile-${label.toLowerCase()}`}
    >
      <Icon size={18} strokeWidth={active ? 2.5 : 2} />
      <span className="text-[11px] font-semibold leading-none">{label}</span>
    </button>
  );
}

// ─── Modal principal ────────────────────────────────────────────────
export function NuevaInteraccionModal({
  open,
  onClose,
  partnerOdooId,
  cuentaName = null,                  // ← NUEVO: nombre del cliente para el header
  contactos = [],                     // (mantenido para compat; ya no se muestra dropdown)
  defaults = {},                      // { channel, outcome, resumen } — backward compat
  initialData = null,                 // si viene, modo "edit"
  onSuccess,                          // se llama tras guardar OK
  onSaveAndCreateTask,                // ← NUEVO: callback opcional, recibe {partnerOdooId, descripcion, tipo, dueAt, prioridad}
}) {
  const isEdit = !!initialData;

  // El tipo y el channel se mantienen sincronizados (channel = tipo)
  const [tipo, setTipo]       = useState("LLAMADA");
  const [outcome, setOutcome] = useState("NEUTRO");
  const [resumen, setResumen] = useState("");
  const [resultado, setResultado] = useState("");
  const [happenedAt, setHappenedAt] = useState(() => toDateTimeLocal());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitMode, setSubmitMode] = useState(null); // "save" | "save-and-task"
  const [resumenError, setResumenError] = useState("");
  const resumenRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    if (isEdit) {
      // Modo edición: pre-cargar desde initialData. Si channel viejo ya no
      // está en TIPOS (ej: "REUNION", "OTRO"), default a NOTA.
      const validTipos = TIPOS.map(t => t.key);
      const incomingTipo = initialData.channel || initialData.tipo || "LLAMADA";
      setTipo(validTipos.includes(incomingTipo) ? incomingTipo : "NOTA");
      const validOutcomes = OUTCOMES.map(o => o.key);
      setOutcome(validOutcomes.includes(initialData.outcome) ? initialData.outcome : "NEUTRO");
      setResumen(initialData.resumen || "");
      setResultado(initialData.resultado || "");
      setHappenedAt(initialData.happened_at
        ? toDateTimeLocal(new Date(initialData.happened_at))
        : toDateTimeLocal());
      setShowDatePicker(true); // en edit, mostrar siempre
    } else {
      setTipo(defaults.channel || "LLAMADA");
      setOutcome(defaults.outcome || "NEUTRO");
      setResumen(defaults.resumen || "");
      setResultado("");
      setHappenedAt(toDateTimeLocal());
      setShowDatePicker(false); // nuevo: colapsado, default "ahora"
    }
    setResumenError("");
    setSubmitMode(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // CRM-D11: outcomes visibles según el tipo. NO_CONTESTA tiene
  // `soloTipos:['LLAMADA','WHATSAPP']` y se oculta para Visita/Email/Nota.
  const outcomesVisibles = useMemo(() => {
    return OUTCOMES.filter(o => !o.soloTipos || o.soloTipos.includes(tipo));
  }, [tipo]);

  // Si el tipo cambia y el outcome actual ya no es válido (ej: NO_CONTESTA
  // seleccionado y user cambia tipo a VISITA), resetear a NEUTRO para que
  // no se envíe un outcome oculto al backend.
  useEffect(() => {
    if (!outcomesVisibles.some(o => o.key === outcome)) {
      setOutcome("NEUTRO");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);

  // Validación común
  const validar = () => {
    const r = resumen.trim();
    if (r.length < 5) {
      setResumenError("El resumen debe tener al menos 5 caracteres");
      resumenRef.current?.focus();
      return null;
    }
    if (r.length > 500) {
      setResumenError("Máximo 500 caracteres");
      return null;
    }
    const dt = new Date(happenedAt);
    if (dt > new Date()) {
      toast.error("La fecha no puede ser futura");
      return null;
    }
    return { r, dt };
  };

  const buildPayload = ({ r, dt }) => ({
    tipo,
    channel: tipo,           // ← deriva del tipo (mismo valor)
    outcome,
    resumen: r,
    resultado: resultado.trim() || null,
    happened_at: dt.toISOString(),
  });

  const handleSave = async (mode) => {
    const v = validar();
    if (!v) return;
    setSubmitting(true);
    setSubmitMode(mode);
    try {
      const payload = buildPayload(v);
      if (isEdit) {
        await api.patch(`/interacciones/${initialData.id}`, payload);
        toast.success("Interacción actualizada");
      } else {
        const resp = await api.post(`/cuentas/${partnerOdooId}/interacciones`, {
          ...payload,
          contacto_partner_odoo_id: null, // Contacto eliminado del UI
        });
        // CRM-D11: backend devuelve tarea_auto_id si auto-creó tarea
        // DEVOLVER_LLAMADA (outcome NO_CONTESTA + tipo LLAMADA/WHATSAPP).
        if (resp?.data?.tarea_auto_id) {
          toast.success("Interacción guardada + tarea de reintento creada para mañana");
        } else {
          toast.success("Interacción registrada");
        }
      }
      onSuccess?.();

      if (mode === "save-and-task" && !isEdit && onSaveAndCreateTask) {
        // Construir defaults inteligentes para la tarea sugerida
        const dDue = new Date();
        dDue.setDate(dDue.getDate() + diasSeguimientoPorOutcome(outcome));
        dDue.setHours(9, 0, 0, 0);
        const tipoLabel = (TIPOS.find(t => t.key === tipo)?.label || tipo).toLowerCase();
        const resumenCorto = v.r.length > 60 ? v.r.slice(0, 60).trim() + "…" : v.r;
        onSaveAndCreateTask({
          partnerOdooId,
          cuentaName,
          descripcion: `Seguimiento ${tipoLabel} — ${resumenCorto}`,
          tipo: tipoInteraccionATarea(tipo),
          prioridad: "3",
          dueAt: toDateTimeLocal(dDue),
        });
      }
      onClose?.();
    } catch (err) {
      toast.error("No se pudo guardar: " + (err.response?.data?.detail || err.message));
    } finally {
      setSubmitting(false);
      setSubmitMode(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && !v && onClose?.()}>
      <DialogContent className="max-w-lg" data-testid="modal-nueva-interaccion">
        <DialogHeader>
          <DialogTitle className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-semibold">
            {isEdit ? "Editar interacción" : "Nueva interacción"}
          </DialogTitle>
          {cuentaName && (
            <div className="text-base font-semibold text-slate-900 mt-0.5 leading-tight" data-testid="modal-cliente-nombre">
              <span className="text-slate-400 text-xs font-normal mr-1.5">Para:</span>
              {cuentaName}
            </div>
          )}
        </DialogHeader>

        <form onSubmit={(e) => { e.preventDefault(); handleSave("save"); }} className="space-y-4">
          {/* ─── Tipo: 5 botones tile ─── */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
              Tipo
            </Label>
            <div className="grid grid-cols-5 gap-1.5">
              {TIPOS.map(t => (
                <TileButton
                  key={t.key}
                  active={tipo === t.key}
                  label={t.label}
                  icon={t.icon}
                  color={t.color}
                  onClick={() => setTipo(t.key)}
                  disabled={submitting}
                />
              ))}
            </div>
          </div>

          {/* ─── Resultado: 4-5 chips según tipo ─── */}
          {/* CRM-D11: filtrar outcomes según tipo seleccionado. NO_CONTESTA
              tiene `soloTipos:['LLAMADA','WHATSAPP']` → solo visible para esos.
              Grid se adapta: 5 cols si visible, 4 si no. */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
              Resultado
            </Label>
            <div className={`grid gap-1.5 ${outcomesVisibles.length === 5 ? "grid-cols-5" : "grid-cols-4"}`}>
              {outcomesVisibles.map(o => (
                <TileButton
                  key={o.key}
                  active={outcome === o.key}
                  label={o.label}
                  icon={o.icon}
                  color={o.color}
                  onClick={() => setOutcome(o.key)}
                  disabled={submitting}
                />
              ))}
            </div>
          </div>

          {/* ─── Resumen ─── */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
              ¿Qué pasó? <span className="text-red-500 normal-case">*</span>
              <span className="text-slate-400 ml-1 font-normal normal-case">({resumen.length}/500)</span>
            </Label>
            <Textarea
              ref={resumenRef}
              value={resumen}
              onChange={(e) => { setResumen(e.target.value); setResumenError(""); }}
              placeholder="Ej: Pidió cotización polos M/L Killari para galería en Cusco"
              className={`min-h-[70px] text-sm ${resumenError ? "border-red-400" : ""}`}
              disabled={submitting}
              maxLength={500}
              autoFocus={!isEdit}
            />
            {resumenError && <p className="text-[11px] text-red-500">{resumenError}</p>}
          </div>

          {/* ─── Detalle adicional (opcional, colapsado por defecto) ─── */}
          {(resultado || isEdit) && (
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                Detalle adicional <span className="text-slate-400 font-normal normal-case">(opcional)</span>
              </Label>
              <Textarea
                value={resultado}
                onChange={(e) => setResultado(e.target.value)}
                placeholder="Notas, próximos pasos, etc."
                className="min-h-[50px] text-sm"
                disabled={submitting}
                maxLength={2000}
              />
            </div>
          )}
          {!resultado && !isEdit && (
            <button
              type="button"
              onClick={() => setResultado(" ")} // truco para mostrar el campo
              className="text-[11px] text-slate-500 hover:text-slate-700 underline-offset-2 hover:underline"
            >
              + Agregar detalle adicional
            </button>
          )}

          {/* ─── Fecha: colapsada por defecto ─── */}
          <div className="space-y-1">
            {!showDatePicker ? (
              <div className="flex items-center gap-2 text-[12px] text-slate-600">
                <CalendarClock size={13} className="text-slate-400" />
                <span>{formatFechaAmigable(happenedAt)}</span>
                <button
                  type="button"
                  onClick={() => setShowDatePicker(true)}
                  className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 underline-offset-2 hover:underline"
                  data-testid="link-cambiar-fecha"
                >
                  <Pencil size={11} /> Cambiar fecha
                </button>
              </div>
            ) : (
              <>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                  Cuándo ocurrió
                </Label>
                <Input
                  type="datetime-local"
                  value={happenedAt}
                  max={toDateTimeLocal()}
                  onChange={(e) => setHappenedAt(e.target.value)}
                  disabled={submitting}
                  className="h-9 text-sm"
                  data-testid="input-happened-at"
                />
              </>
            )}
          </div>

          {/* ─── Footer ─── */}
          <DialogFooter className="pt-2 gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting} data-testid="btn-guardar-interaccion">
              {submitting && submitMode === "save" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              {submitting && submitMode === "save" ? "Guardando..." : "Guardar"}
            </Button>
            {!isEdit && onSaveAndCreateTask && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => handleSave("save-and-task")}
                disabled={submitting}
                className="bg-amber-500 hover:bg-amber-600 text-white"
                data-testid="btn-guardar-y-crear-tarea"
              >
                {submitting && submitMode === "save-and-task" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                {submitting && submitMode === "save-and-task" ? "Guardando..." : "Guardar + crear tarea"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
