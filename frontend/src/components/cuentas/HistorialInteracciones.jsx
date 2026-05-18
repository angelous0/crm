/**
 * HistorialInteracciones — sección plegable con las últimas N interacciones
 * del cliente.
 *
 * Extraído de NuevaTareaModal (CRM-D12) para reusarlo en otros contextos
 * (panel WhatsApp de /cuentas, futuros modales, etc.). Mantiene el mismo
 * comportamiento que la versión original:
 *
 *   · Plegado por default. El user expande con el chevron.
 *   · Si el cliente no tiene interacciones: la sección se OCULTA (retorna null).
 *   · Pide al backend `?limit=N` para no traer todo el historial.
 *
 * Props:
 *   - partnerOdooId  (int)   ID del cliente (cuenta_partner_odoo_id)
 *   - limit          (int?)  Cantidad máxima a mostrar (default 3)
 *   - disabled       (bool?) Deshabilita el toggle (ej. mientras se está
 *                            guardando algo en el form que contiene esto)
 */
import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import {
  Loader2, Phone, MessageCircle, MapPin, Mail, StickyNote,
  Check, CalendarClock, X as XIcon, Minus, PhoneOff,
  ChevronDown, ChevronUp, ScrollText,
} from "lucide-react";

// Mini-tablas de metadatos (subset solo para visualización).
// Si aparece un valor legacy fuera de esta tabla, fallback gris.
const HIST_TIPO_META = {
  LLAMADA:  { label: "Llamada",  icon: Phone,         color: "text-blue-600"    },
  WHATSAPP: { label: "WhatsApp", icon: MessageCircle, color: "text-emerald-600" },
  VISITA:   { label: "Visita",   icon: MapPin,        color: "text-amber-600"   },
  EMAIL:    { label: "Email",    icon: Mail,          color: "text-indigo-600"  },
  NOTA:     { label: "Nota",     icon: StickyNote,    color: "text-slate-600"   },
};

const HIST_OUTCOME_META = {
  COMPRO:        { label: "Cerró pedido",  icon: Check,         color: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  REPROGRAMAR:   { label: "Volver luego",  icon: CalendarClock, color: "bg-amber-50 text-amber-700 ring-amber-200"       },
  NO_CONTESTA:   { label: "No contestó",   icon: PhoneOff,      color: "bg-indigo-50 text-indigo-700 ring-indigo-200"    },
  NO_INTERESADO: { label: "No interesado", icon: XIcon,         color: "bg-red-50 text-red-700 ring-red-200"             },
  NEUTRO:        { label: "Sin novedad",   icon: Minus,         color: "bg-slate-100 text-slate-700 ring-slate-200"      },
};

/** Fecha corta "13 may", "5 may"; si es de otro año añade " '24" */
const fmtFechaCorta = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const mes = d.toLocaleDateString("es-PE", { month: "short" }).replace(".", "");
  const dia = d.getDate();
  if (d.getFullYear() === now.getFullYear()) {
    return `${dia} ${mes}`;
  }
  return `${dia} ${mes} '${String(d.getFullYear()).slice(-2)}`;
};

export function HistorialInteracciones({ partnerOdooId, limit = 3, disabled = false }) {
  const [interacciones, setInteracciones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!partnerOdooId) return;
    let cancel = false;
    setLoading(true);
    api.get(`/cuentas/${partnerOdooId}/interacciones`, { params: { limit } })
      .then(res => { if (!cancel) setInteracciones(res.data || []); })
      .catch(() => { if (!cancel) setInteracciones([]); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [partnerOdooId, limit]);

  // Loading sutil. Cuando termina sin datos → sección entera oculta.
  if (loading) {
    return (
      <div className="text-[11px] text-slate-400 px-1 py-1.5 flex items-center gap-1.5">
        <Loader2 size={11} className="animate-spin" /> Cargando historial…
      </div>
    );
  }
  if (interacciones.length === 0) return null;

  return (
    <div className="border border-slate-200 rounded-lg bg-slate-50/40">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        disabled={disabled}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-100/60 rounded-lg transition-colors"
        data-testid="btn-toggle-historial"
      >
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          <ScrollText size={13} className="text-slate-400" />
          Historial reciente ({interacciones.length} última{interacciones.length === 1 ? "" : "s"})
        </span>
        {expanded
          ? <ChevronUp size={14} className="text-slate-500" />
          : <ChevronDown size={14} className="text-slate-500" />}
      </button>
      {expanded && (
        <div className="px-3 pb-2 pt-1 space-y-2 border-t border-slate-200">
          {interacciones.map(it => {
            const tipoKey = (it.tipo || it.channel || "").toUpperCase();
            const tipoMeta = HIST_TIPO_META[tipoKey];
            const outKey = (it.outcome || "").toUpperCase();
            const outMeta = HIST_OUTCOME_META[outKey];
            const resumen = it.resumen || "(sin resumen)";
            const resumenCorto = resumen.length > 80
              ? resumen.slice(0, 80).trim() + "…"
              : resumen;
            const TipoIcon = tipoMeta?.icon;
            const OutIcon  = outMeta?.icon;
            return (
              <div key={it.id} className="flex gap-2 text-[12px]" data-testid={`hist-item-${it.id}`}>
                <div className="shrink-0 w-12 font-mono text-[10px] text-slate-500 pt-0.5">
                  {fmtFechaCorta(it.fecha || it.happened_at)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {TipoIcon ? (
                      <span className={`inline-flex items-center gap-1 ${tipoMeta.color} font-medium`}>
                        <TipoIcon size={12} />
                        {tipoMeta.label}
                      </span>
                    ) : (
                      <span className="text-slate-500 font-medium">{tipoKey || "—"}</span>
                    )}
                    {outMeta ? (
                      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ring-1 ${outMeta.color}`}>
                        {OutIcon && <OutIcon size={10} />}
                        {outMeta.label}
                      </span>
                    ) : outKey ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500 ring-1 ring-slate-200">
                        {outKey}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-slate-600 italic truncate mt-0.5" title={resumen}>
                    "{resumenCorto}"
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
