/**
 * NuevaTareaModal — UX optimizada para registro rápido (CRM-D9).
 *
 * Cambios respecto a la versión D8:
 * - NUEVO: Motivo (6 chips, obligatorio en POST, opcional en PATCH):
 *   💵 Cobrar · 🛒 Post-venta · 🔄 Seguimiento · 💰 Vender · 🚨 Recuperar · 📞 Devolver llamada
 *   COBRAR usa color ámbar (destacado). Sin default — vendedora elige consciente.
 * - Tipos reducidos de 5 → 4: WhatsApp · Llamar · Visitar · Otro
 *   (COBRO y COTIZACION dejaron de ser tipos: eran motivos disfrazados).
 * - Fecha es SOLO día (type="date"). Hora fija 09:00 al guardar.
 * - Chips de fecha: Hoy · Mañana · +1 sem · +2 sem · +1 mes · Otra fecha
 *   (todos calculados desde hoy + N días, sin lógica de "próximo lunes").
 * - Tipos heredados (LLAMADA legacy, COBRO, COTIZACION, SEGUIMIENTO, etc.)
 *   se mapean a uno de los 4 nuevos al abrir en modo edit.
 *
 * Compatibilidad backend: payload añade `motivo`. El resto (tipo, due_at,
 * prioridad, asignado_a, descripcion) sin cambios.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, Phone, MessageCircle, MapPin, StickyNote,
  DollarSign, ShoppingCart, RefreshCw, TrendingUp, AlertOctagon, PhoneIncoming,
  CalendarClock, Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { HistorialInteracciones } from "@/components/cuentas/HistorialInteracciones";

// ─── Tipos visibles (reducidos a 4 en D9) ────────────────────────────
// El orden refleja la frecuencia esperada en el día a día:
// WhatsApp y Llamar son las acciones más comunes.
const TIPOS = [
  { key: "WHATSAPP", label: "WhatsApp", icon: MessageCircle, color: "emerald" },
  { key: "LLAMADA",  label: "Llamar",   icon: Phone,         color: "blue"    },
  { key: "VISITA",   label: "Visitar",  icon: MapPin,        color: "amber"   },
  { key: "OTRO",     label: "Otro",     icon: StickyNote,    color: "slate"   },
];

// Mapeo retro-compatible para tareas creadas con la versión vieja
// (COBRO/COTIZACION/SEGUIMIENTO/EMAIL/ENVIO) → siempre cae en uno de los 4.
const mapTipoLegacy = (t) => {
  if (!t) return "LLAMADA";
  const u = String(t).toUpperCase();
  if (u === "WHATSAPP") return "WHATSAPP";
  if (u === "LLAMADA")  return "LLAMADA";
  if (u === "VISITA")   return "VISITA";
  // Todo lo demás (COBRO, COTIZACION, EMAIL, ENVIO, SEGUIMIENTO, OTRO…) → OTRO
  return "OTRO";
};

// ─── Motivos visibles (CRM-D9, 6 chips horizontales) ─────────────────
// COBRAR usa color ámbar destacado por ser el más urgente.
// Sin default seleccionado — la vendedora debe elegir conscientemente.
const MOTIVOS = [
  { key: "COBRAR",           label: "Cobrar",         icon: DollarSign,    color: "amber"   },
  { key: "POST_VENTA",       label: "Post-venta",     icon: ShoppingCart,  color: "blue"    },
  { key: "SEGUIMIENTO",      label: "Seguimiento",    icon: RefreshCw,     color: "slate"   },
  { key: "VENDER",           label: "Vender",         icon: TrendingUp,    color: "emerald" },
  { key: "RECUPERAR",        label: "Recuperar",      icon: AlertOctagon,  color: "red"     },
  { key: "DEVOLVER_LLAMADA", label: "Devolver",       icon: PhoneIncoming, color: "indigo"  },
];

// ─── Prioridades visibles (chips) ────────────────────────────────────
// 1=Crítica y 5=Informativa quedan ocultas en el UI; se respetan
// si la tarea ya las tenía (edit mode).
const PRIORIDADES = [
  { value: 2, label: "Alta",  dot: "bg-red-500"    },
  { value: 3, label: "Media", dot: "bg-amber-500"  },
  { value: 4, label: "Baja",  dot: "bg-emerald-500" },
];

// ─── Helpers de fecha (CRM-D9: solo día, hora interna = 09:00) ───────
/** "yyyy-MM-dd" desde Date, para <input type="date"> */
const toDateStr = (d) => {
  const x = d || new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

/** Hoy en formato YYYY-MM-DD (local) */
const todayStr = () => toDateStr(new Date());

/** Hoy + N días, formato YYYY-MM-DD (local) */
const dateOffsetStr = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateStr(d);
};

/** Convierte "yyyy-MM-dd" + hora 09:00 local → ISO con tz para enviar al backend */
const dateStrToISO = (dateStr, hour = 9, minute = 0) => {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d, hour, minute, 0, 0);
  return dt.toISOString();
};

/** Detecta qué chip matchea el valor de fecha actual */
const detectarChipFecha = (dueDateStr) => {
  if (!dueDateStr) return "manana";
  if (dueDateStr === todayStr())          return "hoy";
  if (dueDateStr === dateOffsetStr(1))    return "manana";
  if (dueDateStr === dateOffsetStr(7))    return "sem1";
  if (dueDateStr === dateOffsetStr(14))   return "sem2";
  if (dueDateStr === dateOffsetStr(30))   return "mes1";
  return "otra";
};

/** Texto amigable para mostrar la fecha elegida ("Hoy", "Mañana", "lun 25 may") */
const formatFechaAmigable = (dateStr) => {
  if (!dateStr) return "";
  if (dateStr === todayStr())       return "Hoy";
  if (dateStr === dateOffsetStr(1)) return "Mañana";
  // Construir Date local del string sin tz drift
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("es-PE", { weekday: "short", day: "2-digit", month: "short" });
};

// ─── Botón "tile" (igual al de NuevaInteraccionModal) ────────────────
function TileButton({ active, label, icon: Icon, color, onClick, disabled, testId }) {
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
    : `${p.idleBg} ${p.idleText} ring-1 ${p.idleRing} hover:ring-2`;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center gap-1 px-2 py-3 rounded-lg transition-all duration-150 disabled:opacity-50 ${cls}`}
      data-testid={testId || `tile-tarea-${label.toLowerCase()}`}
    >
      <Icon size={18} strokeWidth={active ? 2.5 : 2} />
      <span className="text-[11px] font-semibold leading-none">{label}</span>
    </button>
  );
}

// ─── Chip de prioridad ───────────────────────────────────────────────
function PriorityChip({ active, label, dot, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all duration-150 disabled:opacity-50 ${
        active
          ? "bg-slate-900 text-white ring-2 ring-slate-900 shadow-sm"
          : "bg-slate-100 text-slate-700 ring-1 ring-slate-200 hover:ring-slate-400"
      }`}
      data-testid={`chip-prioridad-${label.toLowerCase()}`}
    >
      <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
      {label}
    </button>
  );
}

// ─── Chip de fecha ───────────────────────────────────────────────────
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
      data-testid={`chip-fecha-${label.toLowerCase().replace(/[\s.+]/g, "-")}`}
    >
      {label}
    </button>
  );
}

// CRM-D16: HistorialInteracciones se extrajo a @/components/cuentas/
// HistorialInteracciones.jsx para reusarlo en el panel WhatsApp. Se
// importa arriba con el resto de los símbolos de @/components/cuentas/.

// ─── Modal principal ─────────────────────────────────────────────────
export function NuevaTareaModal({
  open,
  onClose,
  partnerOdooId,
  cuentaName = null,            // ← nombre del cliente para el header
  contactos = [],               // (mantenido para compat; ya no se muestra)
  initialData = null,           // si viene, modo "edit"
  defaults = null,              // ← { descripcion, tipo, prioridad, dueAt, motivo }
  onSuccess,
}) {
  const { user } = useAuth();
  const isEdit = !!initialData;

  const [descripcion, setDescripcion] = useState("");
  const [motivo, setMotivo] = useState("");        // CRM-D9: vacío = sin selección
  const [tipo, setTipo] = useState("LLAMADA");
  const [prioridad, setPrioridad] = useState("3");
  const [dueDateStr, setDueDateStr] = useState(dateOffsetStr(1)); // "yyyy-MM-dd"
  const [chipFecha, setChipFecha] = useState("manana"); // hoy|manana|sem1|sem2|mes1|otra
  const [asignadoA, setAsignadoA] = useState("");
  const [notas, setNotas] = useState("");

  // Lista de usuarios para dropdown
  const [usuarios, setUsuarios] = useState([]);
  const [loadingUsuarios, setLoadingUsuarios] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const descRef = useRef(null);

  // ─── Cargar usuarios cuando se abre el modal ───────────────────────
  useEffect(() => {
    if (!open) return;
    let cancel = false;
    setLoadingUsuarios(true);
    api.get("/equipo/usuarios")
      .then(res => {
        if (cancel) return;
        const activos = (res.data || []).filter(u => u.activo);
        setUsuarios(activos);
      })
      .catch(() => {
        if (!cancel) setUsuarios([]);
      })
      .finally(() => {
        if (!cancel) setLoadingUsuarios(false);
      });
    return () => { cancel = true; };
  }, [open]);

  // ─── Reset/precarga al abrir ───────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    if (isEdit) {
      setDescripcion(initialData.descripcion || "");
      setMotivo(initialData.motivo || ""); // tareas viejas: motivo=null → vacío, opcional en PATCH
      setTipo(mapTipoLegacy(initialData.tipo));
      setPrioridad(String(initialData.prioridad ?? "3"));
      const initialDate = initialData.due_at
        ? toDateStr(new Date(initialData.due_at))
        : dateOffsetStr(1);
      setDueDateStr(initialDate);
      setChipFecha(detectarChipFecha(initialDate));
      setAsignadoA(initialData.asignado_a || user?.username || "");
      setNotas("");
    } else if (defaults) {
      // Precarga desde "Guardar + crear tarea"
      setDescripcion(defaults.descripcion || "");
      setMotivo(defaults.motivo || ""); // opcional: si el caller sugiere uno
      setTipo(mapTipoLegacy(defaults.tipo));
      setPrioridad(String(defaults.prioridad ?? "3"));
      // defaults.dueAt puede venir como "yyyy-MM-ddTHH:mm" (legacy) o "yyyy-MM-dd"
      const dateOnly = defaults.dueAt
        ? (defaults.dueAt.includes("T") ? defaults.dueAt.slice(0, 10) : defaults.dueAt)
        : dateOffsetStr(1);
      setDueDateStr(dateOnly);
      setChipFecha(detectarChipFecha(dateOnly));
      setAsignadoA(user?.username || "");
      setNotas("");
    } else {
      setDescripcion("");
      setMotivo("");
      setTipo("LLAMADA");
      setPrioridad("3");
      setDueDateStr(dateOffsetStr(1));
      setChipFecha("manana");
      setAsignadoA(user?.username || "");
      setNotas("");
    }
    setErrors({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ─── Si solo hay 1 usuario activo, auto-asignar ────────────────────
  useEffect(() => {
    if (!open) return;
    if (usuarios.length === 1 && !asignadoA) {
      setAsignadoA(usuarios[0].username);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarios, open]);

  // ─── Handlers de chips de fecha ────────────────────────────────────
  const handleChipFecha = (chip) => {
    setChipFecha(chip);
    setErrors(prev => ({ ...prev, dueAt: "" }));
    if (chip === "hoy")    setDueDateStr(todayStr());
    if (chip === "manana") setDueDateStr(dateOffsetStr(1));
    if (chip === "sem1")   setDueDateStr(dateOffsetStr(7));
    if (chip === "sem2")   setDueDateStr(dateOffsetStr(14));
    if (chip === "mes1")   setDueDateStr(dateOffsetStr(30));
    // "otra" → mantener valor actual y expandir picker
  };

  // ─── Mostrar dropdown de "Asignado a" sólo si > 1 usuario ──────────
  const mostrarDropdownAsignado = usuarios.length > 1;

  // ─── Submit ────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e?.preventDefault();
    const errs = {};
    const d = descripcion.trim();
    if (d.length < 5)   errs.descripcion = "Mínimo 5 caracteres";
    if (d.length > 200) errs.descripcion = "Máximo 200 caracteres";

    // CRM-D9: motivo es OBLIGATORIO en POST nuevo. En PATCH puede quedar vacío
    // (tareas viejas con motivo=NULL siguen funcionando sin forzar clasificación).
    if (!isEdit && !motivo) {
      errs.motivo = "Selecciona un motivo";
    }

    if (!dueDateStr) errs.dueAt = "Fecha requerida";
    // No permitir fechas pasadas en POST nuevo. En PATCH sí (tareas vencidas).
    if (!isEdit && dueDateStr && dueDateStr < todayStr()) {
      errs.dueAt = "No puede ser pasado";
    }

    if (!asignadoA.trim()) errs.asignadoA = "Requerido";

    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      if (errs.descripcion) descRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      let finalDesc = d;
      if (notas.trim()) finalDesc = `${d}\n\n${notas.trim()}`;
      // Hora interna fija 09:00 — siempre, también en modo edit (la UI ya no
      // permite elegir hora). Si el usuario quiere mantener una hora distinta
      // de una tarea vieja, deberá editar manualmente vía SQL/admin.
      const dueISO = dateStrToISO(dueDateStr, 9, 0);

      const basePayload = {
        descripcion: finalDesc,
        tipo,
        due_at: dueISO,
        prioridad: Number(prioridad),
        asignado_a: asignadoA.trim(),
      };
      // motivo solo se envía si tiene valor. Backend acepta NULL en PATCH;
      // en POST nuevo el frontend ya garantiza que esté seteado por la
      // validación arriba.
      if (motivo) basePayload.motivo = motivo;

      if (isEdit) {
        await api.patch(`/tareas/${initialData.id}`, basePayload);
        toast.success("Tarea actualizada");
      } else {
        await api.post(`/cuentas/${partnerOdooId}/tareas`, {
          ...basePayload,
          contacto_partner_odoo_id: null,
        });
        toast.success("Tarea creada");
      }
      onSuccess?.();
      onClose?.();
    } catch (err) {
      const msg = err.response?.data?.detail || err.message;
      if (typeof msg === "string" && msg.toLowerCase().includes("usuario")) {
        setErrors(prev => ({ ...prev, asignadoA: msg }));
      } else if (typeof msg === "string" && msg.toLowerCase().includes("motivo")) {
        setErrors(prev => ({ ...prev, motivo: msg }));
      } else {
        toast.error("No se pudo guardar: " + msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Si la prioridad actual no está en los chips visibles
  //      (1=Crítica o 5=Informativa, de tareas antiguas), incluir como chip extra
  const prioridadesUI = useMemo(() => {
    const p = Number(prioridad);
    if (PRIORIDADES.some(x => x.value === p)) return PRIORIDADES;
    const labels = { 1: "Crítica", 5: "Informativa" };
    return [
      { value: p, label: labels[p] || `P${p}`, dot: "bg-slate-500" },
      ...PRIORIDADES,
    ];
  }, [prioridad]);

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && !v && onClose?.()}>
      <DialogContent className="max-w-lg" data-testid="modal-nueva-tarea">
        <DialogHeader>
          <DialogTitle className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-semibold">
            {isEdit ? "Editar tarea" : "Nueva tarea"}
          </DialogTitle>
          {cuentaName && (
            <div className="text-base font-semibold text-slate-900 mt-0.5 leading-tight" data-testid="modal-tarea-cliente-nombre">
              <span className="text-slate-400 text-xs font-normal mr-1.5">Para:</span>
              {cuentaName}
            </div>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ─── CRM-D12: Historial reciente de interacciones (plegable) ─── */}
          {/* Visible tanto en modo nuevo como edit. Si el cliente no tiene
              interacciones, el componente se renderiza como null. */}
          {partnerOdooId && (
            <HistorialInteracciones
              partnerOdooId={partnerOdooId}
              disabled={submitting}
            />
          )}

          {/* ─── CRM-D9: Motivo (6 chips, requerido en POST) ─── */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
              Motivo {!isEdit && <span className="text-red-500 normal-case">*</span>}
              {isEdit && <span className="text-slate-400 ml-1 font-normal normal-case">(opcional)</span>}
            </Label>
            <div className="grid grid-cols-3 gap-1.5">
              {MOTIVOS.map(m => (
                <TileButton
                  key={m.key}
                  active={motivo === m.key}
                  label={m.label}
                  icon={m.icon}
                  color={m.color}
                  onClick={() => { setMotivo(m.key); setErrors(prev => ({ ...prev, motivo: "" })); }}
                  disabled={submitting}
                  testId={`chip-motivo-${m.key.toLowerCase()}`}
                />
              ))}
            </div>
            {errors.motivo && <p className="text-[11px] text-red-500">{errors.motivo}</p>}
          </div>

          {/* ─── Descripción ─── */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
              ¿Qué hay que hacer? <span className="text-red-500 normal-case">*</span>
              <span className="text-slate-400 ml-1 font-normal normal-case">({descripcion.length}/200)</span>
            </Label>
            <Input
              ref={descRef}
              value={descripcion}
              onChange={(e) => { setDescripcion(e.target.value); setErrors({ ...errors, descripcion: "" }); }}
              placeholder="Llamar para confirmar pedido..."
              className={`h-9 text-sm ${errors.descripcion ? "border-red-400" : ""}`}
              disabled={submitting}
              maxLength={200}
              data-testid="input-descripcion-tarea"
            />
            {errors.descripcion && <p className="text-[11px] text-red-500">{errors.descripcion}</p>}
          </div>

          {/* ─── Tipo: 4 botones tile (reducido en D9) ─── */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
              Tipo
            </Label>
            <div className="grid grid-cols-4 gap-1.5">
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

          {/* ─── Prioridad: chips ─── */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
              Prioridad
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {prioridadesUI.map(p => (
                <PriorityChip
                  key={p.value}
                  active={Number(prioridad) === p.value}
                  label={p.label}
                  dot={p.dot}
                  onClick={() => setPrioridad(String(p.value))}
                  disabled={submitting}
                />
              ))}
            </div>
          </div>

          {/* ─── Vencimiento: 6 chips + type=date ─── */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
              Vencimiento <span className="text-red-500 normal-case">*</span>
            </Label>
            <div className="flex flex-wrap gap-1.5">
              <DateChip active={chipFecha === "hoy"}    label="Hoy"        onClick={() => handleChipFecha("hoy")}    disabled={submitting} />
              <DateChip active={chipFecha === "manana"} label="Mañana"     onClick={() => handleChipFecha("manana")} disabled={submitting} />
              <DateChip active={chipFecha === "sem1"}   label="+1 sem"     onClick={() => handleChipFecha("sem1")}   disabled={submitting} />
              <DateChip active={chipFecha === "sem2"}   label="+2 sem"     onClick={() => handleChipFecha("sem2")}   disabled={submitting} />
              <DateChip active={chipFecha === "mes1"}   label="+1 mes"     onClick={() => handleChipFecha("mes1")}   disabled={submitting} />
              <DateChip active={chipFecha === "otra"}   label="Otra fecha" onClick={() => handleChipFecha("otra")}   disabled={submitting} />
            </div>
            {chipFecha !== "otra" ? (
              <div className="flex items-center gap-2 text-[12px] text-slate-600 pt-0.5">
                <CalendarClock size={13} className="text-slate-400" />
                <span data-testid="texto-fecha-amigable">{formatFechaAmigable(dueDateStr)}</span>
                <button
                  type="button"
                  onClick={() => handleChipFecha("otra")}
                  className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 underline-offset-2 hover:underline"
                  data-testid="link-cambiar-fecha"
                >
                  <Pencil size={11} /> Cambiar fecha
                </button>
              </div>
            ) : (
              <Input
                type="date"
                value={dueDateStr}
                min={isEdit ? undefined : todayStr()}
                onChange={(e) => { setDueDateStr(e.target.value); setErrors({ ...errors, dueAt: "" }); }}
                disabled={submitting}
                className={`h-9 text-sm ${errors.dueAt ? "border-red-400" : ""}`}
                data-testid="input-due-at"
              />
            )}
            {errors.dueAt && <p className="text-[11px] text-red-500">{errors.dueAt}</p>}
          </div>

          {/* ─── Asignado a (dropdown si >1 usuario, oculto si solo 1) ─── */}
          {mostrarDropdownAsignado && (
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                Asignado a <span className="text-red-500 normal-case">*</span>
              </Label>
              <Select value={asignadoA} onValueChange={(v) => { setAsignadoA(v); setErrors({ ...errors, asignadoA: "" }); }} disabled={submitting || loadingUsuarios}>
                <SelectTrigger className={`h-9 text-sm ${errors.asignadoA ? "border-red-400" : ""}`} data-testid="select-asignado-a">
                  <SelectValue placeholder={loadingUsuarios ? "Cargando..." : "Seleccionar"} />
                </SelectTrigger>
                <SelectContent>
                  {usuarios.map(u => (
                    <SelectItem key={u.username} value={u.username}>
                      {u.nombre_completo || u.username}
                      {u.username === user?.username && (
                        <span className="text-slate-400 ml-1 text-xs">(tú)</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.asignadoA && <p className="text-[11px] text-red-500">{errors.asignadoA}</p>}
            </div>
          )}

          {/* ─── Notas (opcional, colapsado) ─── */}
          {(notas || isEdit) && (
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                Notas <span className="text-slate-400 font-normal normal-case">(opcional)</span>
              </Label>
              <Textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Detalles adicionales..."
                className="min-h-[50px] text-sm"
                disabled={submitting}
              />
            </div>
          )}
          {!notas && !isEdit && (
            <button
              type="button"
              onClick={() => setNotas(" ")}
              className="text-[11px] text-slate-500 hover:text-slate-700 underline-offset-2 hover:underline"
            >
              + Agregar notas
            </button>
          )}

          {/* ─── Footer ─── */}
          <DialogFooter className="pt-2 gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting} data-testid="btn-guardar-tarea">
              {submitting && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              {submitting ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
