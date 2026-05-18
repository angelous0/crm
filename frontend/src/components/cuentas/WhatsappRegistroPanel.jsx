/**
 * WhatsappRegistroPanel — drawer lateral para registrar conversación
 * de WhatsApp en un solo flujo (CRM-D16).
 *
 * Reemplaza el botón antiguo de /cuentas que solo abría wa.me en otra
 * pestaña sin registrar nada. Ahora:
 *
 *   1. Header con foto/iniciales + nombre + teléfono + botón "Abrir WhatsApp ↗"
 *   2. Historial (2 últimas interacciones, plegable)
 *   3. Textarea "¿Qué te dijo el cliente?" (max 500 chars)
 *   4. 5 chips de resultado SIN default (Cerró pedido, Volver luego,
 *      No contestó, No interesado, Sin novedad)
 *   5. Zona "Próxima tarea" condicional:
 *      · Cerró pedido (COMPRO):       chips fecha default +14d (+2 sem)
 *      · Volver luego (REPROGRAMAR):  chips fecha default +7d  (+1 sem)
 *      · No contestó (NO_CONTESTA):   sin chips — backend auto-crea +1d 09:00
 *      · No interesado / Sin novedad: oculto
 *   6. Botón "Guardar todo" — disabled hasta outcome + resumen no vacío
 *
 * UN SOLO POST:
 *   - POST /api/cuentas/{id}/interacciones con tipo=WHATSAPP,
 *     channel=WHATSAPP, outcome, resumen
 *   - El backend, si outcome=NO_CONTESTA, auto-crea la tarea DEVOLVER_LLAMADA
 *   - Para COMPRO/REPROGRAMAR, el panel hace un SEGUNDO POST a
 *     /api/cuentas/{id}/tareas con la tarea de seguimiento configurada
 *
 * Patrón visual: el mismo `<aside>` + backdrop de Cobranzas.jsx
 * (CobranzaDrawer). No usa Radix Sheet para mantener consistencia.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  X, Loader2, ExternalLink, MessageCircle,
  Check, CalendarClock, PhoneOff, X as XIcon, Minus,
  Pencil,
} from "lucide-react";
import { HistorialInteracciones } from "@/components/cuentas/HistorialInteracciones";

// ─── Outcomes — mismos 5 que el modal de Interacción ─────────────────
// Sin "default" — el botón Guardar se habilita cuando el user selecciona uno.
const OUTCOMES = [
  { key: "COMPRO",        label: "Cerró pedido",  icon: Check,         color: "emerald" },
  { key: "REPROGRAMAR",   label: "Volver luego",  icon: CalendarClock, color: "amber"   },
  { key: "NO_CONTESTA",   label: "No contestó",   icon: PhoneOff,      color: "indigo"  },
  { key: "NO_INTERESADO", label: "No interesado", icon: XIcon,         color: "red"     },
  { key: "NEUTRO",        label: "Sin novedad",   icon: Minus,         color: "slate"   },
];

// ─── Helpers de fecha ────────────────────────────────────────────────
const toDateStr = (d) => {
  const x = d || new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

/** Hoy + N días, formato YYYY-MM-DD (local) */
const dateOffsetStr = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateStr(d);
};

/** "yyyy-MM-dd" + hora local → ISO con tz para el backend */
const dateStrToISO = (dateStr, hour = 9, minute = 0) => {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, hour, minute, 0, 0).toISOString();
};

/** Texto amigable "Mañana", "+7d (lun 25 may)", etc. */
const fmtFechaAmigable = (dateStr) => {
  if (!dateStr) return "";
  if (dateStr === dateOffsetStr(1)) return "Mañana";
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("es-PE", { weekday: "short", day: "2-digit", month: "short" });
};

/** Días default por outcome (solo cuando aplica) */
const DEFAULT_DAYS_BY_OUTCOME = {
  COMPRO:      14,  // verificar pedido en 2 semanas
  REPROGRAMAR:  7,  // volver a contactar en 1 semana
};

// ─── Helpers visuales ────────────────────────────────────────────────
function obtenerIniciales(nombre) {
  if (!nombre) return "?";
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function TileButton({ active, label, icon: Icon, color, onClick, disabled, testId }) {
  const palettes = {
    emerald: { idleBg: "bg-emerald-50", idleText: "text-emerald-700", idleRing: "ring-emerald-100", activeBg: "bg-emerald-600", activeRing: "ring-emerald-600" },
    amber:   { idleBg: "bg-amber-50",   idleText: "text-amber-700",   idleRing: "ring-amber-100",   activeBg: "bg-amber-500",   activeRing: "ring-amber-500"   },
    indigo:  { idleBg: "bg-indigo-50",  idleText: "text-indigo-700",  idleRing: "ring-indigo-100",  activeBg: "bg-indigo-600",  activeRing: "ring-indigo-600"  },
    red:     { idleBg: "bg-red-50",     idleText: "text-red-700",     idleRing: "ring-red-100",     activeBg: "bg-red-600",     activeRing: "ring-red-600"     },
    slate:   { idleBg: "bg-slate-100",  idleText: "text-slate-700",   idleRing: "ring-slate-200",   activeBg: "bg-slate-700",   activeRing: "ring-slate-700"   },
  };
  const p = palettes[color] || palettes.slate;
  const cls = active
    ? `${p.activeBg} text-white ring-2 ${p.activeRing} shadow-sm`
    : `${p.idleBg} ${p.idleText} ring-1 ${p.idleRing} hover:ring-2`;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center gap-1 px-2 py-3 rounded-lg transition-all duration-150 disabled:opacity-50 ${cls}`}
      data-testid={testId}
    >
      <Icon size={18} strokeWidth={active ? 2.5 : 2} />
      <span className="text-[11px] font-semibold leading-none">{label}</span>
    </button>
  );
}

function DateChip({ active, label, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all duration-150 disabled:opacity-50 ${
        active
          ? "bg-slate-900 text-white ring-2 ring-slate-900 shadow-sm"
          : "bg-slate-100 text-slate-700 ring-1 ring-slate-200 hover:ring-slate-400"
      }`}
      data-testid={`wa-chip-fecha-${label.toLowerCase().replace(/[\s.+]/g, "-")}`}
    >
      {label}
    </button>
  );
}

// ─── Panel principal ─────────────────────────────────────────────────
export function WhatsappRegistroPanel({
  partnerOdooId,
  cuentaName,
  phoneWhatsapp,     // string normalizado para wa.me (sin "+", solo dígitos)
  phoneDisplay,     // string para mostrar ("+51 999...")
  onClose,
  onSaved,           // callback(resultado) tras guardar OK; el padre refresca
  username,         // user actual (para la tarea de seguimiento como asignado_a)
}) {
  const [resumen, setResumen] = useState("");
  const [outcome, setOutcome] = useState("");  // sin default
  const [submitting, setSubmitting] = useState(false);

  // Estado de "próxima tarea" (solo aplica si outcome ∈ {COMPRO, REPROGRAMAR})
  const [dueDateStr, setDueDateStr] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const resumenRef = useRef(null);

  // Cuando el user elige outcome, setear default de fecha si aplica
  useEffect(() => {
    if (outcome === "COMPRO") {
      setDueDateStr(dateOffsetStr(DEFAULT_DAYS_BY_OUTCOME.COMPRO));
      setPickerOpen(false);
    } else if (outcome === "REPROGRAMAR") {
      setDueDateStr(dateOffsetStr(DEFAULT_DAYS_BY_OUTCOME.REPROGRAMAR));
      setPickerOpen(false);
    } else {
      setDueDateStr("");
      setPickerOpen(false);
    }
  }, [outcome]);

  // Cerrar con ESC (mismo patrón que CobranzaDrawer)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !submitting) onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  // Foco automático en el textarea al montar
  useEffect(() => { resumenRef.current?.focus(); }, []);

  // ─── Validación: Guardar habilitado sólo si outcome + resumen ≥5 chars ──
  const puedeGuardar = useMemo(() => {
    return !!outcome && resumen.trim().length >= 5 && !submitting;
  }, [outcome, resumen, submitting]);

  // ¿Mostrar zona de próxima tarea?
  const mostrarFecha = outcome === "COMPRO" || outcome === "REPROGRAMAR";
  const mostrarMsgNoContesta = outcome === "NO_CONTESTA";

  const iniciales = useMemo(() => obtenerIniciales(cuentaName), [cuentaName]);

  // ─── Handler "Abrir WhatsApp ↗" ────────────────────────────────────
  const abrirWhatsapp = () => {
    if (!phoneWhatsapp) return;
    window.open(`https://wa.me/${phoneWhatsapp}`, "_blank", "noopener,noreferrer");
  };

  // ─── Handler "Guardar todo" ────────────────────────────────────────
  const handleGuardar = async () => {
    if (!puedeGuardar) return;
    setSubmitting(true);
    try {
      const payload = {
        tipo: "WHATSAPP",
        channel: "WHATSAPP",
        outcome,
        resumen: resumen.trim(),
        happened_at: new Date().toISOString(),
        contacto_partner_odoo_id: null,
      };
      const resp = await api.post(`/cuentas/${partnerOdooId}/interacciones`, payload);
      const interaccionId = resp?.data?.id;
      // Si outcome=NO_CONTESTA, el backend auto-creó la tarea DEVOLVER_LLAMADA.
      let tareaAutoId = resp?.data?.tarea_auto_id || null;

      // Si COMPRO o REPROGRAMAR, creamos manualmente la tarea de seguimiento
      // (el backend no la auto-crea para estos outcomes).
      if (mostrarFecha && dueDateStr) {
        try {
          const tareaPayload = {
            tipo: "WHATSAPP",
            descripcion:
              outcome === "COMPRO"
                ? `Verificar pedido — ${resumen.trim().slice(0, 60)}${resumen.length > 60 ? "…" : ""}`
                : `Reintentar — ${resumen.trim().slice(0, 60)}${resumen.length > 60 ? "…" : ""}`,
            due_at: dateStrToISO(dueDateStr, 9, 0),
            prioridad: 3,  // Media
            motivo: "SEGUIMIENTO",
            asignado_a: username || undefined,
            contacto_partner_odoo_id: null,
          };
          const tareaResp = await api.post(`/cuentas/${partnerOdooId}/tareas`, tareaPayload);
          tareaAutoId = tareaResp?.data?.id || tareaAutoId;
        } catch (eTarea) {
          // Best-effort: la interacción ya está guardada; informamos pero
          // no abortamos el flujo.
          console.warn("[WhatsappRegistroPanel] No se pudo crear tarea seguimiento:", eTarea);
          toast.warning("Conversación guardada · la tarea de seguimiento no se pudo crear");
        }
      }

      // Toast final según si se creó tarea o no
      if (tareaAutoId) {
        toast.success("Conversación guardada + tarea de seguimiento creada");
      } else {
        toast.success("Conversación guardada");
      }

      onSaved?.({ interaccionId, tareaAutoId, outcome });
      onClose?.();
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || "Error desconocido";
      toast.error("No se pudo guardar: " + msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[1px]"
        onClick={() => !submitting && onClose?.()}
        data-testid="wa-panel-backdrop"
      />

      {/* Drawer */}
      <aside
        className="fixed top-0 right-0 bottom-0 z-[61] w-full max-w-[480px] bg-white shadow-2xl flex flex-col border-l border-slate-200"
        data-testid="wa-panel"
      >
        {/* ─── Header ─── */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-start gap-3">
          {/* Foto/Iniciales (placeholder) */}
          <div className="shrink-0 w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-semibold text-base">
            {iniciales}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-mono uppercase font-medium mb-0.5 text-slate-500 tracking-[0.14em]">
              Registrar WhatsApp
            </div>
            <h2 className="text-base font-semibold leading-tight text-slate-900 truncate" data-testid="wa-panel-nombre">
              {cuentaName || "(sin nombre)"}
            </h2>
            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
              {phoneDisplay || "Sin teléfono"}
            </div>
            {phoneWhatsapp && (
              <button
                type="button"
                onClick={abrirWhatsapp}
                disabled={submitting}
                className="mt-1.5 inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 transition-colors"
                data-testid="wa-panel-abrir-wa"
              >
                <MessageCircle size={11} />
                Abrir WhatsApp
                <ExternalLink size={10} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose?.()}
            className="shrink-0 p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"
            data-testid="wa-panel-close"
            disabled={submitting}
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* ─── Body scrollable ─── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Historial — 2 últimas, plegable */}
          {partnerOdooId && (
            <HistorialInteracciones
              partnerOdooId={partnerOdooId}
              limit={2}
              disabled={submitting}
            />
          )}

          {/* Textarea "¿Qué te dijo el cliente?" */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
              ¿Qué te dijo el cliente? <span className="text-red-500 normal-case">*</span>
              <span className="text-slate-400 ml-1 font-normal normal-case">({resumen.length}/500)</span>
            </label>
            <textarea
              ref={resumenRef}
              value={resumen}
              onChange={(e) => setResumen(e.target.value)}
              placeholder="Ej: Me confirmó que quiere los polos M y L, pasa mañana a recoger…"
              maxLength={500}
              disabled={submitting}
              className="w-full min-h-[80px] text-sm border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-slate-50"
              data-testid="wa-panel-resumen"
            />
          </div>

          {/* 5 chips de resultado (sin default) */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
              Resultado <span className="text-red-500 normal-case">*</span>
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {OUTCOMES.map(o => (
                <TileButton
                  key={o.key}
                  active={outcome === o.key}
                  label={o.label}
                  icon={o.icon}
                  color={o.color}
                  onClick={() => setOutcome(o.key)}
                  disabled={submitting}
                  testId={`wa-chip-outcome-${o.key.toLowerCase()}`}
                />
              ))}
            </div>
          </div>

          {/* Zona "Próxima tarea" condicional */}
          {mostrarFecha && (
            <div className="space-y-1.5 p-3 rounded-lg border border-amber-200 bg-amber-50/40">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-amber-800 flex items-center gap-1">
                <CalendarClock size={12} />
                {outcome === "COMPRO" ? "Verificar pedido en" : "Volver a contactar en"}
              </label>
              <div className="flex flex-wrap gap-1.5">
                <DateChip active={dueDateStr === dateOffsetStr(1)}  label="Mañana"     onClick={() => { setDueDateStr(dateOffsetStr(1));  setPickerOpen(false); }} disabled={submitting} />
                <DateChip active={dueDateStr === dateOffsetStr(7)}  label="+1 sem"     onClick={() => { setDueDateStr(dateOffsetStr(7));  setPickerOpen(false); }} disabled={submitting} />
                <DateChip active={dueDateStr === dateOffsetStr(14)} label="+2 sem"     onClick={() => { setDueDateStr(dateOffsetStr(14)); setPickerOpen(false); }} disabled={submitting} />
                <DateChip active={dueDateStr === dateOffsetStr(30)} label="+1 mes"     onClick={() => { setDueDateStr(dateOffsetStr(30)); setPickerOpen(false); }} disabled={submitting} />
                <DateChip active={pickerOpen}                       label="Otra"       onClick={() => setPickerOpen(p => !p)} disabled={submitting} />
              </div>
              {!pickerOpen && dueDateStr && (
                <div className="flex items-center gap-1.5 text-[11px] text-slate-600 pt-0.5">
                  <CalendarClock size={11} className="text-slate-400" />
                  <span data-testid="wa-fecha-amigable">{fmtFechaAmigable(dueDateStr)}</span>
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 underline-offset-2 hover:underline"
                  >
                    <Pencil size={10} /> Cambiar
                  </button>
                </div>
              )}
              {pickerOpen && (
                <input
                  type="date"
                  value={dueDateStr || dateOffsetStr(1)}
                  min={toDateStr(new Date())}
                  onChange={(e) => setDueDateStr(e.target.value)}
                  disabled={submitting}
                  className="h-8 text-sm border border-slate-300 rounded px-2 mt-1"
                  data-testid="wa-fecha-picker"
                />
              )}
              <p className="text-[10px] text-slate-500 italic mt-1">
                Se creará una tarea de seguimiento para esa fecha a las 09:00.
              </p>
            </div>
          )}

          {mostrarMsgNoContesta && (
            <div className="p-3 rounded-lg border border-indigo-200 bg-indigo-50/40">
              <div className="flex items-start gap-2 text-[12px] text-indigo-900">
                <PhoneOff size={14} className="shrink-0 mt-0.5" />
                <div>
                  Se creará automáticamente una <strong>tarea de reintento</strong> para mañana a las 09:00.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ─── Footer ─── */}
        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between gap-2 bg-slate-50/30">
          <button
            type="button"
            onClick={() => !submitting && onClose?.()}
            disabled={submitting}
            className="text-[12px] text-slate-600 hover:text-slate-900 px-2 py-1.5 rounded hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleGuardar}
            disabled={!puedeGuardar}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
            data-testid="wa-panel-guardar"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {submitting ? "Guardando…" : "Guardar todo"}
          </button>
        </div>
      </aside>
    </>
  );
}
