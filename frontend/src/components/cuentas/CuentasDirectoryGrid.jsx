import React, { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Power, MessageCircle, MessageSquarePlus, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import api from "@/lib/api";
import { toast } from "sonner";
import { normalizeDepartamento, isCanonicalDepartamento } from "@/components/cuentas/perfil-options";
import { NuevaInteraccionModal } from "@/components/cuentas/modals/NuevaInteraccionModal";
import { NuevaTareaModal } from "@/components/cuentas/modals/NuevaTareaModal";
import { WhatsappRegistroPanel } from "@/components/cuentas/WhatsappRegistroPanel";
import { useAuth } from "@/lib/auth";

const fmtDate = (d) => {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
};

const daysSince = (d) => {
  if (!d) return null;
  const diff = Date.now() - new Date(d).getTime();
  return Math.floor(diff / 86400000);
};

const fmtDays = (d) => {
  const days = daysSince(d);
  if (days == null) return "-";
  return `${days}d`;
};

const daysColor = (d) => {
  const days = daysSince(d);
  if (days == null) return "text-slate-400";
  if (days <= 30) return "text-emerald-600 font-semibold";
  if (days <= 90) return "text-blue-600";
  if (days <= 180) return "text-amber-600";
  return "text-red-600 font-semibold";
};

const fmtNum = (n) => n ? Number(n).toLocaleString("es-PE") : "-";
const fmtPct = (v) => {
  if (v == null || v === undefined) return null;
  const p = (v * 100).toFixed(1);
  return v >= 0 ? `+${p}%` : `${p}%`;
};

function pctColor(v) {
  if (v == null || v === undefined) return "text-slate-400";
  if (v > 0) return "text-emerald-600 font-semibold";
  if (v < 0) return "text-red-600 font-semibold";
  return "text-slate-500";
}

/* ─── Column definitions ─── */
// Sprint D3: añadidas columnas Estado y Tier (después de Cuenta)
const COLUMNS = [
  { key: "name", label: "Cuenta", sortKey: "name", defaultW: 180, minW: 100 },
  { key: "estado_auto", label: "Estado", sortKey: "estado_auto", defaultW: 95, minW: 70 },
  { key: "tier", label: "Clasif.", sortKey: "tier", defaultW: 90, minW: 70 },
  { key: "depto", label: "Depto", sortKey: "depto", defaultW: 90, minW: 50 },
  { key: "tienda", label: "Tienda", sortKey: "tienda", defaultW: 100, minW: 60 },
  { key: "last_purchase", label: "Ult. compra", sortKey: "last_purchase", defaultW: 100, minW: 70 },
  { key: "hace", label: "Hace", sortKey: "last_purchase", defaultW: 55, minW: 40, align: "right" },
  { key: "ltv_12m", label: "LTV 12m", sortKey: "ltv_12m", defaultW: 85, minW: 55, align: "right" },
  { key: "qty_12m", label: "Cant. 12m", sortKey: "qty_12m", defaultW: 65, minW: 45, align: "right" },
  { key: "qty_total", label: "Cant. Total", sortKey: "qty_total", defaultW: 70, minW: 45, align: "right" },
  { key: "tel", label: "Tel", defaultW: 110, minW: 60 },
  { key: "pct_ytd", label: "%YTD", sortKey: "pct_ytd", defaultW: 65, minW: 45, align: "right" },
  // CRM-D8: próxima tarea pendiente. Default sort del directorio. Click navega a
  // /cuentas/{id}?tab=tareas para verla en contexto.
  { key: "proxima_tarea", label: "Próx. tarea", sortKey: "proxima_tarea", defaultW: 210, minW: 140 },
  // Acciones rápidas — siempre visibles, no navegan al detalle.
  { key: "acciones", label: "", defaultW: 120, minW: 120 },
];

// Estilos de los badges de estado_auto (5 estados simplificados)
const ESTADO_BADGE = {
  nuevo:    { bg: "rgba(42,111,219,.12)", fg: "#1E54B0", label: "Nuevo" },
  activo:   { bg: "rgba(22,163,74,.12)",  fg: "#15803D", label: "Activo" },
  alerta:   { bg: "rgba(249,115,22,.14)", fg: "#C2410C", label: "Alerta" },
  olvidado: { bg: "rgba(180,83,9,.14)",   fg: "#92400E", label: "Olvidado" },
  perdido:  { bg: "rgba(220,38,38,.10)",  fg: "#991B1B", label: "Perdido" },
  sin_data: { bg: "rgba(0,0,0,.04)",      fg: "#6B7280", label: "—" },
};

// Clasificación por percentil dentro del depto (estrella/alto/medio/bajo)
const TIER_CHIP = {
  estrella: { bg: "rgba(212,168,90,.18)",   border: "rgba(212,168,90,.45)",  fg: "#8B6A1F" },
  alto:     { bg: "rgba(42,111,219,.12)",   border: "rgba(42,111,219,.32)",  fg: "#1E54B0" },
  medio:    { bg: "rgba(135,122,102,.14)",  border: "rgba(135,122,102,.32)", fg: "#4A4136" },
  bajo:     { bg: "rgba(181,70,42,.08)",    border: "rgba(181,70,42,.22)",   fg: "#8A2F18" },
};

function EstadoBadge({ estado }) {
  if (!estado) return <span className="text-slate-300 text-[10px]">—</span>;
  const s = ESTADO_BADGE[estado] || ESTADO_BADGE.sin_data;
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
      style={{ background: s.bg, color: s.fg, letterSpacing: "0.04em" }}
    >
      {s.label}
    </span>
  );
}

function TierChip({ tier }) {
  if (!tier) return <span className="text-slate-300 text-[10px]">—</span>;
  const s = TIER_CHIP[tier] || TIER_CHIP.bajo;
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase"
      style={{
        background: s.bg, color: s.fg,
        border: `1px solid ${s.border}`,
        letterSpacing: "0.06em",
      }}
    >
      {tier === "estrella" && "★ "}{tier}
    </span>
  );
}

function fmtMoneyShort(n) {
  if (!n) return "—";
  const v = Number(n);
  if (v >= 1000000) return `S/ ${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000)    return `S/ ${(v / 1000).toFixed(0)}k`;
  return `S/ ${v.toFixed(0)}`;
}

/* ─── Próx. tarea (CRM-D8 + D9 motivo) ────────────────────────────────
   Renderiza la próxima tarea pendiente de la cuenta. 4 estados temporales
   × 2 ejes de motivo (COBRAR vs. resto):

   · null            → "—" gris muy sutil (sin tarea pendiente)
   · vencida         → 🔴 -Nd · descripción (rojo)
   · hoy             → 🟡 HOY · descripción (amber)
   · futura (>= 1d)  → ⏰ +Nd · descripción (slate)

   Si motivo === 'COBRAR':
   · ícono cambia a 💵
   · texto en ámbar (futura/hoy) o rojo intenso (vencida + doble énfasis)
   · tooltip incluye línea "Motivo: Cobrar" arriba de la descripción

   Click navega a /cuentas/{partnerOdooId}?tab=tareas (no a Resumen).
   El stopPropagation evita que se dispare el onSelectRow del <tr>.
   Texto truncado a 30 chars; tooltip muestra contexto completo.
*/

// Etiquetas humanas para cada motivo (para tooltip)
const MOTIVO_LABEL = {
  COBRAR:           "Cobrar",
  POST_VENTA:       "Post-venta",
  SEGUIMIENTO:      "Seguimiento",
  VENDER:           "Vender",
  RECUPERAR:        "Recuperar",
  DEVOLVER_LLAMADA: "Devolver llamada",
};

function ProximaTareaCell({ proxima, partnerOdooId, maxWidth }) {
  const navigate = useNavigate();
  if (!proxima || !proxima.due_at) {
    return (
      <td className="px-2 py-1" data-testid={`prox-tarea-${partnerOdooId}`}>
        <span className="text-slate-300 text-[11px]">—</span>
      </td>
    );
  }

  const due = new Date(proxima.due_at);
  const now = new Date();
  // Comparar contra "inicio del día" para que "HOY" cubra cualquier hora del día actual.
  const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);
  const startTomorrow = new Date(startToday); startTomorrow.setDate(startTomorrow.getDate() + 1);

  // Días relativos contra el inicio del día actual: vencida usa el día calendario.
  const diasRelativos = Math.floor((due - startToday) / 86400000);
  const esCobrar = proxima.motivo === "COBRAR";

  let icon, etiqueta, claseColor, tipo, claseFila;
  if (due < startToday) {
    // Vencida — COBRAR vencida usa rojo intenso (doble énfasis) y bg rosado.
    tipo = "vencida";
    icon = esCobrar ? "💵" : "🔴";
    etiqueta = `${diasRelativos}d`; // ya negativo
    claseColor = esCobrar
      ? "text-red-800 font-bold"
      : "text-red-700 font-semibold";
    claseFila = esCobrar ? "bg-red-50/60" : "";
  } else if (due < startTomorrow) {
    // Hoy — COBRAR hoy mantiene ícono 💵 + texto ámbar fuerte.
    tipo = "hoy";
    icon = esCobrar ? "💵" : "🟡";
    etiqueta = "HOY";
    claseColor = esCobrar
      ? "text-amber-800 font-bold"
      : "text-amber-700 font-semibold";
    claseFila = "";
  } else {
    // Futura — COBRAR futura: ámbar destacado.
    tipo = "futura";
    icon = esCobrar ? "💵" : "⏰";
    etiqueta = `+${diasRelativos}d`;
    claseColor = esCobrar
      ? "text-amber-800 font-semibold"
      : "text-slate-600";
    claseFila = "";
  }

  const desc = proxima.descripcion || "(sin descripción)";
  const descCorto = desc.length > 30 ? desc.slice(0, 30).trim() + "…" : desc;
  const fechaCompleta = due.toLocaleString("es-PE", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
  // Tooltip: motivo arriba (si existe), después descripción, después fecha.
  const motivoLabel = proxima.motivo ? MOTIVO_LABEL[proxima.motivo] || proxima.motivo : null;
  const tooltip = (motivoLabel ? `Motivo: ${motivoLabel}\n` : "")
                + `${desc}\n${fechaCompleta}`;

  const handleClick = (e) => {
    e.stopPropagation();
    navigate(`/cuentas/${partnerOdooId}?tab=tareas`);
  };

  return (
    <td
      className={`px-2 py-1 cursor-pointer hover:bg-slate-100/60 ${claseFila}`}
      style={{ maxWidth }}
      onClick={handleClick}
      data-testid={`prox-tarea-${partnerOdooId}`}
      data-prox-tipo={tipo}
      data-prox-motivo={proxima.motivo || ""}
      title={tooltip}
    >
      <div className={`flex items-center gap-1.5 text-[11px] truncate ${claseColor}`}>
        <span className="shrink-0" aria-hidden>{icon}</span>
        <span className="shrink-0 font-mono text-[10px] tabular-nums">{etiqueta}</span>
        <span className="text-slate-300 shrink-0">·</span>
        <span className={`truncate font-normal ${esCobrar ? "text-amber-900" : "text-slate-700"}`}>
          {descCorto}
        </span>
      </div>
    </td>
  );
}

/* ─── Resize Handle ─── */
function ResizeHandle({ onResize }) {
  const startRef = useRef(null);

  const onMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    startRef.current = e.clientX;
    const onMove = (ev) => {
      const delta = ev.clientX - startRef.current;
      startRef.current = ev.clientX;
      onResize(delta);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return (
    <div
      onMouseDown={onMouseDown}
      className="absolute right-0 top-0 bottom-0 w-[5px] cursor-col-resize group z-20 hover:bg-blue-400/30 active:bg-blue-500/40"
      style={{ touchAction: "none" }}
    >
      <div className="absolute right-0 top-1 bottom-1 w-[1px] bg-slate-300 group-hover:bg-blue-400 group-active:bg-blue-500 transition-colors" />
    </div>
  );
}

/* ─── Sort Header with resize ─── */
function SortHeaderResizable({ col, currentSort, currentDir, onSort, width, onResize }) {
  const active = col.sortKey && currentSort === col.sortKey;
  const align = col.align === "right" ? "text-right" : "text-left";
  return (
    <th
      className={`relative py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 select-none whitespace-nowrap ${align} ${col.sortKey ? "cursor-pointer hover:bg-slate-100 transition-colors" : ""}`}
      style={{ width: `${width}px`, minWidth: `${col.minW}px`, maxWidth: `${width}px`, paddingLeft: 8, paddingRight: 12 }}
      onClick={() => col.sortKey && onSort(col.sortKey)}
      data-testid={`sort-${col.key}`}
    >
      <span className="inline-flex items-center gap-0.5">
        {col.label}
        {col.sortKey && (active ? (
          currentDir === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />
        ) : (
          <ArrowUpDown size={9} className="opacity-30" />
        ))}
      </span>
      <ResizeHandle onResize={(delta) => onResize(col.key, delta)} />
    </th>
  );
}

const COL_COUNT = COLUMNS.length + 1; // +1 for checkbox

export function CuentasDirectoryGrid({ rows, loading, selectedId, onSelectRow, sort, dir, onSort, page, totalPages, onPageChange, onRefresh }) {
  const { user } = useAuth();   // CRM-D16: para pasar username al panel WhatsApp
  const [selected, setSelected] = useState(new Set());
  const [batchLoading, setBatchLoading] = useState(false);

  // Modales de acción rápida — guardamos {id, nombre} de la fila que los abrió.
  // null = cerrado. NO recargamos contactos: los modales aceptan contactos=[].
  const [interaccionFor, setInteraccionFor] = useState(null); // { id, nombre } | null
  const [tareaFor,       setTareaFor]       = useState(null); // { id, nombre } | null
  const [tareaDefaults,  setTareaDefaults]  = useState(null); // precarga desde "Guardar+crear tarea"
  // CRM-D16: panel lateral de WhatsApp. Guarda { id, nombre, phone_whatsapp, phone_display }
  const [whatsappPanelFor, setWhatsappPanelFor] = useState(null);

  // Column widths state
  const [colWidths, setColWidths] = useState(() => {
    const saved = localStorage.getItem("crm_col_widths");
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    return Object.fromEntries(COLUMNS.map(c => [c.key, c.defaultW]));
  });

  const handleResize = useCallback((key, delta) => {
    setColWidths(prev => {
      const col = COLUMNS.find(c => c.key === key);
      const newW = Math.max(col?.minW || 40, (prev[key] || col?.defaultW || 80) + delta);
      const next = { ...prev, [key]: newW };
      localStorage.setItem("crm_col_widths", JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleOne = useCallback((id, e) => {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map(r => r.id)));
  }, [rows, selected.size]);

  const handleBatch = useCallback(async (activate) => {
    const ids = [...selected];
    if (!ids.length) return;
    setBatchLoading(true);
    try {
      const r = await api.patch("/cuentas/batch-active", { ids, is_active: activate, reason: activate ? null : "MANUAL" });
      const d = r.data;
      toast.success(activate
        ? `${d.cuentas_affected} cuenta(s) activadas, ${d.contactos_affected} contacto(s) reactivados`
        : `${d.cuentas_affected} cuenta(s) inactivadas, ${d.contactos_affected} contacto(s) en cascada`);
      setSelected(new Set());
      if (onRefresh) onRefresh();
    } catch { toast.error("Error en operacion masiva"); }
    finally { setBatchLoading(false); }
  }, [selected, onRefresh]);

  const allChecked = rows.length > 0 && selected.size === rows.length;
  const someChecked = selected.size > 0;
  const tableMinW = 28 + Object.values(colWidths).reduce((s, w) => s + w, 0);

  return (
    <div className="flex flex-col h-full" data-testid="directory-grid">
      {someChecked && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-white text-[11px] animate-in slide-in-from-top duration-150" data-testid="bulk-action-bar">
          <span className="font-semibold">{selected.size} seleccionada(s)</span>
          <Button size="sm" variant="secondary" className="h-6 text-[10px] bg-red-600 hover:bg-red-700 text-white border-0"
            onClick={() => handleBatch(false)} disabled={batchLoading} data-testid="bulk-deactivate">
            {batchLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Power size={11} className="mr-1" />}
            Inactivar ({selected.size})
          </Button>
          <Button size="sm" variant="secondary" className="h-6 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white border-0"
            onClick={() => handleBatch(true)} disabled={batchLoading} data-testid="bulk-activate">
            <Power size={11} className="mr-1" />Activar ({selected.size})
          </Button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-[10px] text-slate-300 hover:text-white" data-testid="bulk-clear">
            Deseleccionar
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto min-h-0">
        <table className="border-collapse text-xs" style={{ minWidth: `${tableMinW}px` }}>
          <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="w-[28px] px-1 py-2" style={{ minWidth: 28, maxWidth: 28 }}>
                <Checkbox checked={allChecked} onCheckedChange={toggleAll} className="scale-[0.8]" data-testid="select-all-cuentas" />
              </th>
              {COLUMNS.map(col => (
                <SortHeaderResizable
                  key={col.key}
                  col={col}
                  currentSort={sort}
                  currentDir={dir}
                  onSort={onSort}
                  width={colWidths[col.key] || col.defaultW}
                  onResize={handleResize}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={COL_COUNT} className="h-32 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-slate-400" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={COL_COUNT} className="h-32 text-center text-slate-400 text-xs">No se encontraron cuentas</td></tr>
            ) : rows.map((r) => {
              const isSelected = selectedId === r.id;
              const isChecked = selected.has(r.id);
              const inactive = r.is_active === false;
              const pctVal = r.pct_vs_avg_ytd;
              return (
                <tr
                  key={r.id}
                  onClick={() => onSelectRow(r.id)}
                  className={`cursor-pointer border-b border-slate-100 transition-colors h-[38px]
                    ${isChecked ? "bg-blue-100/60" : isSelected ? "bg-blue-50 border-l-2 border-l-blue-500" : "hover:bg-slate-50 border-l-2 border-l-transparent"}
                    ${inactive ? "opacity-60" : ""}`}
                  data-testid={`dir-row-${r.id}`}
                >
                  <td className="px-1 py-1 w-[28px]" onClick={e => e.stopPropagation()}>
                    <Checkbox checked={isChecked} onCheckedChange={() => toggleOne(r.id, { stopPropagation: () => {} })}
                      className="scale-[0.75]" data-testid={`check-${r.id}`} />
                  </td>
                  {/* Cuenta */}
                  <td className={`px-2 py-1 font-medium truncate ${inactive ? "text-slate-400 line-through" : "text-slate-900"}`}
                    style={{ maxWidth: colWidths.name || 180 }}
                    data-testid={`name-${r.id}`}>
                    {r.nombre || `ID: ${r.id}`}
                    {inactive && <span className="inline-block ml-1 px-1 py-0.5 rounded text-[7px] font-bold bg-red-600 text-white leading-none align-middle">INACT</span>}
                  </td>
                  {/* D3: Estado auto */}
                  <td className="px-2 py-1" data-testid={`estado-auto-${r.id}`}>
                    <EstadoBadge estado={r.estado_auto} />
                  </td>
                  {/* D3: Tier */}
                  <td className="px-2 py-1" data-testid={`tier-${r.id}`}>
                    <TierChip tier={r.tier} />
                  </td>
                  {/* Depto — normaliza ("UCAYALI" → "Ucayali"). Si el valor
                       crudo NO matchea ningún departamento canónico, muestra
                       el raw en ámbar con título tooltip → indica typo o
                       depto raro a corregir en Odoo o agregar al alias. */}
                  <td className="px-2 py-1 truncate"
                    style={{ maxWidth: colWidths.depto || 90 }}
                    data-testid={`depto-${r.id}`}>
                    {(() => {
                      const pais = r.pais || "PE";
                      const canon = normalizeDepartamento(r.depto_name, pais);
                      if (canon) {
                        return <span className="text-slate-500">{canon}</span>;
                      }
                      if (r.depto_name) {
                        return (
                          <span
                            className="text-amber-700 inline-flex items-center gap-1"
                            title={`"${r.depto_name}" no matchea ningún departamento canónico — revisa typo o agrega al diccionario`}
                            data-testid={`depto-noncanonical-${r.id}`}
                          >
                            ⚠ {r.depto_name}
                          </span>
                        );
                      }
                      return <span className="text-slate-300">-</span>;
                    })()}
                  </td>
                  {/* Tienda */}
                  <td className="px-2 py-1 text-slate-600 truncate text-[10px] font-medium"
                    style={{ maxWidth: colWidths.tienda || 100 }}
                    data-testid={`tienda-${r.id}`}>{r.tienda || "Sin tienda"}</td>
                  {/* Últ. compra (con año) */}
                  <td className="px-2 py-1 text-slate-500 whitespace-nowrap"
                    data-testid={`last-purchase-${r.id}`}>{fmtDate(r.last_purchase_date)}</td>
                  {/* Hace (días) */}
                  <td className={`px-2 py-1 text-right font-mono text-[10px] whitespace-nowrap ${daysColor(r.last_purchase_date)}`}
                    data-testid={`days-since-${r.id}`}>{fmtDays(r.last_purchase_date)}</td>
                  {/* D3: LTV 12m */}
                  <td className="px-2 py-1 text-right font-mono text-[10px] text-slate-700 font-semibold whitespace-nowrap"
                    data-testid={`ltv-${r.id}`}>{fmtMoneyShort(r.ltv_12m)}</td>
                  {/* Cant. 12m */}
                  <td className="px-2 py-1 text-right font-mono text-slate-700"
                    data-testid={`qty-${r.id}`}>{fmtNum(r.qty_12m)}</td>
                  {/* Cant. Total */}
                  <td className="px-2 py-1 text-right font-mono text-slate-500"
                    data-testid={`qty-total-${r.id}`}>{fmtNum(r.qty_total)}</td>
                  {/* Tel */}
                  <td className="px-2 py-1 whitespace-nowrap" data-testid={`phone-${r.id}`}>
                    {r.phone_display ? (
                      r.phone_whatsapp ? (
                        <a href={`https://wa.me/${r.phone_whatsapp}`} target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-800 hover:underline"
                          data-testid={`wa-link-${r.id}`}>
                          <MessageCircle size={11} className="shrink-0" />
                          <span className="truncate" style={{ maxWidth: (colWidths.tel || 110) - 20 }}>{r.phone_display}</span>
                        </a>
                      ) : (
                        <span className="text-slate-500 truncate inline-block" style={{ maxWidth: colWidths.tel || 110 }}>{r.phone_display}</span>
                      )
                    ) : <span className="text-slate-300">-</span>}
                  </td>
                  {/* %YTD */}
                  <td className={`px-2 py-1 text-right font-mono text-[10px] ${pctColor(pctVal)}`}
                    data-testid={`pct-${r.id}`}>
                    {fmtPct(pctVal) ?? <span className="text-slate-300">&mdash;</span>}
                  </td>
                  {/* CRM-D8: Próx. tarea pendiente (sort default ASC). Click → ficha tab Tareas. */}
                  <ProximaTareaCell
                    proxima={r.proxima_tarea}
                    partnerOdooId={r.id}
                    maxWidth={colWidths.proxima_tarea || 210}
                  />
                  {/* Acciones rápidas: Interacción · Tarea · WhatsApp */}
                  <td className="px-2 py-1 whitespace-nowrap"
                      data-testid={`acciones-${r.id}`}
                      onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        title="Nueva interacción"
                        onClick={() => setInteraccionFor({ id: r.id, nombre: r.nombre })}
                        className="group/btn inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-50 text-blue-600 ring-1 ring-blue-100 hover:bg-blue-600 hover:text-white hover:ring-blue-600 hover:shadow-sm active:scale-95 transition-all duration-150"
                        data-testid={`btn-interaccion-${r.id}`}>
                        <MessageSquarePlus size={14} strokeWidth={2.25} />
                      </button>
                      <button
                        type="button"
                        title="Nueva tarea"
                        onClick={() => setTareaFor({ id: r.id, nombre: r.nombre })}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-50 text-amber-600 ring-1 ring-amber-100 hover:bg-amber-500 hover:text-white hover:ring-amber-500 hover:shadow-sm active:scale-95 transition-all duration-150"
                        data-testid={`btn-tarea-${r.id}`}>
                        <CheckSquare size={14} strokeWidth={2.25} />
                      </button>
                      {r.phone_whatsapp ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setWhatsappPanelFor({
                              id: r.id,
                              nombre: r.nombre,
                              phone_whatsapp: r.phone_whatsapp,
                              phone_display: r.phone_display,
                            });
                          }}
                          title={`Registrar WhatsApp · ${r.phone_display || ""}`}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 hover:bg-emerald-500 hover:text-white hover:ring-emerald-500 hover:shadow-sm active:scale-95 transition-all duration-150"
                          data-testid={`btn-whatsapp-${r.id}`}>
                          <MessageCircle size={14} strokeWidth={2.25} />
                        </button>
                      ) : (
                        <span
                          title="Sin WhatsApp registrado"
                          className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-50 text-slate-300 ring-1 ring-slate-100 cursor-not-allowed"
                          data-testid={`btn-whatsapp-${r.id}-disabled`}>
                          <MessageCircle size={14} strokeWidth={2} />
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-slate-200 bg-slate-50/80 text-[10px] text-slate-500 shrink-0">
          <span>Pag {page}/{totalPages}</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={page <= 1} onClick={() => onPageChange(page - 1)} data-testid="dir-prev-page">
              <ChevronLeft size={12} />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} data-testid="dir-next-page">
              <ChevronRight size={12} />
            </Button>
          </div>
        </div>
      )}

      {/* Modales de acción rápida — montados aquí (NO en cada fila) para que
          haya UNA sola instancia. partnerOdooId cambia según qué fila abrió.
          Renderizan encima de /cuentas: al cerrar, no se navega ni se pierde
          el estado de filtros/scroll de la tabla. */}
      <NuevaInteraccionModal
        open={interaccionFor != null}
        onClose={() => setInteraccionFor(null)}
        partnerOdooId={interaccionFor?.id}
        cuentaName={interaccionFor?.nombre}
        onSuccess={() => {
          // No cerramos aquí si vamos a abrir Tarea — el callback maneja eso.
          // El cierre/limpieza se hace en onClose o en onSaveAndCreateTask.
          toast.success("Interacción guardada");
        }}
        onSaveAndCreateTask={(defaults) => {
          // Cerrar Interacción → abrir Tarea con defaults precargados,
          // manteniendo el contexto de la fila clickeada.
          const ctx = interaccionFor;
          setInteraccionFor(null);
          setTareaDefaults(defaults);
          setTareaFor(ctx);
        }}
      />
      <NuevaTareaModal
        open={tareaFor != null}
        onClose={() => { setTareaFor(null); setTareaDefaults(null); }}
        partnerOdooId={tareaFor?.id}
        cuentaName={tareaFor?.nombre}
        defaults={tareaDefaults}
        onSuccess={() => {
          toast.success("Tarea creada");
        }}
      />
      {/* CRM-D16: panel lateral de WhatsApp.
          Solo se monta cuando whatsappPanelFor !== null (evita lifecycle
          extra cuando no se usa). Tras guardar, refresca el directorio
          para que la columna "Próxima Tarea" muestre la tarea recién creada. */}
      {whatsappPanelFor && (
        <WhatsappRegistroPanel
          partnerOdooId={whatsappPanelFor.id}
          cuentaName={whatsappPanelFor.nombre}
          phoneWhatsapp={whatsappPanelFor.phone_whatsapp}
          phoneDisplay={whatsappPanelFor.phone_display}
          username={user?.username}
          onClose={() => setWhatsappPanelFor(null)}
          onSaved={() => onRefresh?.()}
        />
      )}
    </div>
  );
}
