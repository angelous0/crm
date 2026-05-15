/**
 * Pipeline comercial — kanban operativo de seguimiento del vendedor.
 *
 * Layout:
 *   - 10 columnas con scroll horizontal
 *   - Cards arrastrables entre columnas (drag-and-drop HTML5)
 *   - Click en card → drawer con acciones (Llamar, WhatsApp, cambiar estado, nota)
 *   - Admin/supervisor ven botón "Asignar" → modal con multi-select de cuentas
 *
 * Estados (orden visual):
 *   asignados → contactado → interesado → catalogo_enviado →
 *   pedido_en_conversacion → pago_pendiente → compro (cierre)
 *   ────────────────────────────────────────────────
 *   reprogramar · no_responde · no_interesado (laterales)
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Phone, MessageCircle, ExternalLink, Calendar, Clock, MoreVertical,
  X as XIcon, Plus, Loader2, RefreshCw, AlertCircle, Sparkles, Search,
  ChevronRight, MapPin,
} from "lucide-react";

const fmtMoney = (n) =>
  "S/ " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtNum = (n) => Number(n || 0).toLocaleString("es-PE");

function timeSince(secs) {
  if (!secs) return "ahora";
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// ─── Estados con colores ─────────────────────────────────────────────────
const ESTADOS = [
  { key: "asignados",              label: "Asignados",          color: "slate",   accent: "#64748b" },
  { key: "contactado",             label: "Contactado",         color: "blue",    accent: "#2563eb" },
  { key: "interesado",             label: "Interesado",         color: "cyan",    accent: "#0891b2" },
  { key: "catalogo_enviado",       label: "Catálogo enviado",   color: "indigo",  accent: "#4f46e5" },
  { key: "pedido_en_conversacion", label: "Pedido en conversa.", color: "violet",  accent: "#7c3aed" },
  { key: "pago_pendiente",         label: "Pago pendiente",     color: "amber",   accent: "#d97706" },
  { key: "compro",                 label: "Compró ✓",           color: "emerald", accent: "#059669" },
  { key: "reprogramar",            label: "Reprogramar",        color: "purple",  accent: "#9333ea" },
  { key: "no_responde",            label: "No responde",        color: "orange",  accent: "#ea580c" },
  { key: "no_interesado",          label: "No interesado",      color: "rose",    accent: "#e11d48" },
];

const COL_BG = {
  slate:   "bg-slate-50 border-slate-200",
  blue:    "bg-blue-50/60 border-blue-200",
  cyan:    "bg-cyan-50/60 border-cyan-200",
  indigo:  "bg-indigo-50/60 border-indigo-200",
  violet:  "bg-violet-50/60 border-violet-200",
  amber:   "bg-amber-50/60 border-amber-200",
  emerald: "bg-emerald-50/60 border-emerald-200",
  purple:  "bg-purple-50/60 border-purple-200",
  orange:  "bg-orange-50/60 border-orange-200",
  rose:    "bg-rose-50/60 border-rose-200",
};

const TIER_DOT = {
  oro:    "bg-amber-400",
  plata:  "bg-slate-400",
  bronce: "bg-orange-700",
};

// ─── Avatar con iniciales ─────────────────────────────────────────────────
function Avatar({ name }) {
  if (!name) return <div className="w-8 h-8 rounded-full bg-slate-200" />;
  const inits = name.split(/\s+/).slice(0, 2).map((s) => s[0] || "").join("").toUpperCase();
  // Color hash based on first char
  const hue = (name.charCodeAt(0) * 23) % 360;
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
      style={{ background: `hsl(${hue}, 50%, 50%)` }}
    >
      {inits || "?"}
    </div>
  );
}

// ─── Card de cuenta asignada ──────────────────────────────────────────────
function PipelineCard({ item, onClick, onDragStart }) {
  const recencia = item.recencia_dias;
  const recCls = recencia == null ? "text-slate-400"
               : recencia > 90 ? "text-red-600"
               : recencia > 30 ? "text-amber-700"
               : "text-emerald-700";

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, item)}
      onClick={() => onClick(item)}
      className="bg-white border border-slate-200 rounded-lg p-2.5 cursor-pointer hover:shadow-md transition-all active:scale-95 select-none"
      data-testid={`pipeline-card-${item.id}`}
    >
      <div className="flex items-start gap-2 mb-1.5">
        <Avatar name={item.partner_name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="text-[12px] font-semibold text-slate-900 leading-tight truncate" title={item.partner_name}>
              {item.partner_name || "Sin nombre"}
            </div>
            {item.tier && (
              <span className={`w-1.5 h-1.5 rounded-full ${TIER_DOT[item.tier] || "bg-slate-300"}`} title={item.tier} />
            )}
          </div>
          <div className="text-[9px] text-slate-500 font-mono mt-0.5 flex items-center gap-1 flex-wrap">
            {item.depto && <span className="inline-flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{item.depto.length > 12 ? item.depto.slice(0,12)+"…" : item.depto}</span>}
            {item.marca && <Badge variant="outline" className="text-[8px] font-bold px-1 py-0 bg-indigo-50 text-indigo-700 border-indigo-200">{item.marca}</Badge>}
          </div>
        </div>
      </div>

      {/* Métricas mini */}
      <div className="grid grid-cols-3 gap-1 mb-1.5 text-[10px]">
        <div className="bg-slate-50/60 rounded px-1.5 py-1">
          <div className="text-slate-400 font-mono uppercase tracking-wider text-[8px]">LTV 12m</div>
          <div className="font-semibold tabular-nums text-slate-700">{fmtMoney(item.ltv_12m)}</div>
        </div>
        <div className="bg-slate-50/60 rounded px-1.5 py-1">
          <div className="text-slate-400 font-mono uppercase tracking-wider text-[8px]">Pedidos</div>
          <div className="font-semibold tabular-nums text-slate-700">{fmtNum(item.orders_12m)}</div>
        </div>
        <div className="bg-slate-50/60 rounded px-1.5 py-1">
          <div className="text-slate-400 font-mono uppercase tracking-wider text-[8px]">Recencia</div>
          <div className={`font-semibold tabular-nums ${recCls}`}>
            {recencia != null ? `${recencia}d` : "—"}
          </div>
        </div>
      </div>

      {/* Nota */}
      {item.nota && (
        <div className="text-[10px] text-slate-600 italic line-clamp-2 mb-1.5 leading-snug">
          "{item.nota}"
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-2.5 w-2.5" />
          {timeSince(item.segs_en_columna)} aquí
        </span>
        <div className="flex gap-1">
          {item.phone && (
            <>
              <a
                href={`tel:${item.phone.replace(/\D/g, "")}`}
                onClick={(e) => e.stopPropagation()}
                className="hover:text-blue-600 p-0.5"
                title={`Llamar ${item.phone}`}
              >
                <Phone className="h-3 w-3" />
              </a>
              <a
                href={`https://wa.me/${item.phone.replace(/\D/g, "")}`}
                target="_blank" rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="hover:text-emerald-600 p-0.5"
                title={`WhatsApp ${item.phone}`}
              >
                <MessageCircle className="h-3 w-3" />
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Drawer de detalle/acciones ───────────────────────────────────────────
function CardDrawer({ item, onClose, onMover, onRefresh }) {
  const navigate = useNavigate();
  const [nota, setNota] = useState(item.nota || "");
  const [savingNota, setSavingNota] = useState(false);
  const [reprogFecha, setReprogFecha] = useState("");

  if (!item) return null;
  const estadoActual = ESTADOS.find(e => e.key === item.estado);

  const handleMover = async (nuevoEstado, fecha = null) => {
    try {
      await onMover(item.id, nuevoEstado, fecha, nota);
      toast.success(`Movido a "${ESTADOS.find(e => e.key === nuevoEstado)?.label}"`);
      onClose();
      onRefresh();
    } catch (e) {
      toast.error("Error al mover: " + (e?.response?.data?.detail || e.message));
    }
  };

  const handleGuardarNota = async () => {
    setSavingNota(true);
    try {
      await onMover(item.id, item.estado, null, nota);
      toast.success("Nota guardada");
    } catch (e) {
      toast.error("Error: " + (e?.message || e));
    } finally {
      setSavingNota(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[55]" style={{ background: "rgba(31,26,20,.40)", backdropFilter: "blur(2px)" }} onClick={onClose} />
      <aside
        className="fixed top-0 right-0 bottom-0 z-[56] bg-white shadow-2xl flex flex-col animate-in slide-in-from-right"
        style={{ width: "min(480px, 95vw)", borderLeft: "1px solid var(--line)" }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Avatar name={item.partner_name} />
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-slate-900 truncate" style={{ fontFamily: "var(--font-display)" }}>
                  {item.partner_name}
                </h3>
                <div className="flex items-center gap-1.5 flex-wrap mt-1">
                  {estadoActual && (
                    <Badge variant="outline" className="text-[10px] font-semibold" style={{ background: estadoActual.accent + "20", color: estadoActual.accent, borderColor: estadoActual.accent + "60" }}>
                      {estadoActual.label}
                    </Badge>
                  )}
                  {item.tier && (
                    <Badge variant="outline" className="text-[10px] uppercase">{item.tier}</Badge>
                  )}
                  {item.marca && (
                    <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200">{item.marca}</Badge>
                  )}
                </div>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg border hover:bg-slate-50 flex items-center justify-center text-slate-500">
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">

          {/* Quick actions */}
          <div className="grid grid-cols-3 gap-2">
            {item.phone && (
              <a
                href={`tel:${item.phone.replace(/\D/g, "")}`}
                className="flex flex-col items-center gap-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg py-2.5 text-blue-700"
              >
                <Phone className="h-4 w-4" />
                <span className="text-[10px] font-semibold">Llamar</span>
              </a>
            )}
            {item.phone && (
              <a
                href={`https://wa.me/${item.phone.replace(/\D/g, "")}`}
                target="_blank" rel="noreferrer"
                className="flex flex-col items-center gap-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg py-2.5 text-emerald-700"
              >
                <MessageCircle className="h-4 w-4" />
                <span className="text-[10px] font-semibold">WhatsApp</span>
              </a>
            )}
            <button
              onClick={() => navigate(`/cuentas/${item.cuenta_partner_odoo_id}`)}
              className="flex flex-col items-center gap-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg py-2.5 text-slate-700"
            >
              <ExternalLink className="h-4 w-4" />
              <span className="text-[10px] font-semibold">Ver ficha</span>
            </button>
          </div>

          {/* Métricas */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-[9px] uppercase tracking-wider font-mono text-slate-500">LTV 12m</div>
              <div className="text-lg font-semibold tabular-nums mt-1" style={{ fontFamily: "var(--font-display)" }}>
                {fmtMoney(item.ltv_12m)}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">{item.orders_12m} pedidos</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-[9px] uppercase tracking-wider font-mono text-slate-500">Última compra</div>
              <div className="text-lg font-semibold tabular-nums mt-1" style={{ fontFamily: "var(--font-display)" }}>
                {item.recencia_dias != null ? `${item.recencia_dias}d` : "—"}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Ticket {fmtMoney(item.ticket)}</div>
            </div>
          </div>

          {/* Tel + depto */}
          <div className="text-[12px] space-y-1">
            <div className="flex items-center gap-2">
              <Phone className="h-3 w-3 text-slate-400 shrink-0" />
              <span className={item.phone ? "text-slate-700" : "text-red-500 italic"}>
                {item.phone || "Sin teléfono"}
              </span>
              {item.phone_source === "mobile" && (
                <Badge variant="outline" className="text-[8px] bg-blue-50 text-blue-700 border-blue-200">móv</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
              <span className={item.depto ? "text-slate-700" : "text-slate-400 italic"}>
                {item.depto || "—"}{item.distrito && ` · ${item.distrito}`}
              </span>
            </div>
          </div>

          {/* Nota editable */}
          <div>
            <div className="text-[10px] uppercase tracking-wider font-mono text-slate-500 mb-1.5">
              Nota
            </div>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Lo que conversaste, qué cotizaste, próxima acción..."
              rows={3}
              className="w-full text-xs border border-slate-200 rounded p-2 focus:outline-none focus:border-slate-400"
            />
            <Button size="sm" variant="outline" onClick={handleGuardarNota} disabled={savingNota || nota === (item.nota || "")} className="h-7 text-[11px] mt-1.5">
              {savingNota ? <Loader2 className="h-3 w-3 animate-spin" /> : "Guardar nota"}
            </Button>
          </div>

          {/* Mover a otro estado */}
          <div>
            <div className="text-[10px] uppercase tracking-wider font-mono text-slate-500 mb-2">
              Mover a otra columna
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {ESTADOS.filter(e => e.key !== item.estado && e.key !== "reprogramar").map((e) => (
                <button
                  key={e.key}
                  onClick={() => handleMover(e.key)}
                  className="px-2.5 py-1.5 text-[11px] border rounded hover:bg-slate-50 transition-colors text-left flex items-center gap-1.5"
                  style={{ borderColor: e.accent + "60", color: e.accent }}
                  data-testid={`mover-${e.key}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: e.accent }} />
                  {e.label}
                </button>
              ))}
            </div>
            {/* Reprogramar con fecha */}
            <div className="mt-2 flex gap-1.5 items-center">
              <input
                type="date"
                value={reprogFecha}
                onChange={(e) => setReprogFecha(e.target.value)}
                className="text-[11px] border border-purple-200 rounded px-2 py-1"
                min={new Date().toISOString().slice(0, 10)}
              />
              <Button
                size="sm" variant="outline"
                onClick={() => reprogFecha && handleMover("reprogramar", reprogFecha)}
                disabled={!reprogFecha}
                className="h-7 text-[11px] gap-1 text-purple-700 border-purple-300 hover:bg-purple-50"
              >
                <Calendar className="h-3 w-3" /> Reprogramar para esta fecha
              </Button>
            </div>
          </div>
        </div>

        {/* Footer: asignado por */}
        <div className="px-5 py-2 border-t border-slate-100 text-[10px] text-slate-400 font-mono uppercase tracking-wider">
          Asignada por {item.asignado_por} · {item.asignado_at ? new Date(item.asignado_at).toLocaleString("es-PE", { day:"2-digit", month:"short" }) : ""}
        </div>
      </aside>
    </>
  );
}

// ─── Modal de Asignar (admin/supervisor) ──────────────────────────────────
function AsignarModal({ onClose, onSaved }) {
  const [search, setSearch] = useState("");
  const [cuentas, setCuentas] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [asignadoA, setAsignadoA] = useState("");
  const [marca, setMarca] = useState("");
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Cargar vendedores
  useEffect(() => {
    api.get("/pipeline/vendedores").then(r => setVendedores(r.data || []));
  }, []);

  // Buscar cuentas
  const buscar = useCallback(async () => {
    if (!search.trim()) { setCuentas([]); return; }
    setLoading(true);
    try {
      const r = await api.get("/cuentas/list", { params: { search, limit: 30 }});
      setCuentas(r.data?.rows || []);
    } finally { setLoading(false); }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(buscar, 350);
    return () => clearTimeout(t);
  }, [buscar]);

  const handleGuardar = async () => {
    if (!asignadoA || selectedIds.size === 0) {
      toast.error("Selecciona al menos 1 cuenta y una vendedora");
      return;
    }
    setSaving(true);
    try {
      const r = await api.post("/pipeline/asignar", {
        cuenta_partner_odoo_ids: Array.from(selectedIds),
        asignado_a: asignadoA,
        marca: marca || null,
        nota: nota || null,
      });
      toast.success(`${r.data.ok} asignada${r.data.ok===1?"":"s"} · ${r.data.ya_asignadas} ya existían`);
      onSaved();
    } catch (e) {
      toast.error("Error: " + (e?.response?.data?.detail || e.message));
    } finally { setSaving(false); }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-[55]" style={{ background: "rgba(31,26,20,.40)", backdropFilter: "blur(2px)" }} onClick={onClose} />
      <div className="fixed inset-0 z-[56] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h3 className="text-lg font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              Asignar cuentas a vendedora
            </h3>
            <button onClick={onClose} className="w-8 h-8 rounded-lg border hover:bg-slate-50 flex items-center justify-center text-slate-500">
              <XIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Vendedora */}
            <div>
              <label className="text-[10px] uppercase tracking-wider font-mono text-slate-500 mb-1.5 block">
                Vendedora
              </label>
              <select
                value={asignadoA}
                onChange={(e) => setAsignadoA(e.target.value)}
                className="w-full h-9 px-2 text-sm border border-slate-200 rounded bg-white"
              >
                <option value="">Seleccionar…</option>
                {vendedores.map(v => (
                  <option key={v.username} value={v.username}>
                    {v.nombre_completo || v.username} · {v.rol}
                  </option>
                ))}
              </select>
            </div>

            {/* Marca opcional */}
            <div>
              <label className="text-[10px] uppercase tracking-wider font-mono text-slate-500 mb-1.5 block">
                Marca (opcional · permite asignar la misma cuenta a 2 vendedoras con marcas distintas)
              </label>
              <input
                type="text"
                value={marca}
                onChange={(e) => setMarca(e.target.value)}
                placeholder="Element Premium, Qepo, ..."
                className="w-full h-9 px-2 text-sm border border-slate-200 rounded"
              />
            </div>

            {/* Buscar cuentas */}
            <div>
              <label className="text-[10px] uppercase tracking-wider font-mono text-slate-500 mb-1.5 block">
                Buscar cuentas {selectedIds.size > 0 && <span className="text-emerald-600">· {selectedIds.size} seleccionadas</span>}
              </label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nombre, RUC, teléfono..."
                  className="w-full h-9 pl-8 pr-2 text-sm border border-slate-200 rounded"
                  autoFocus
                />
              </div>
            </div>

            {/* Lista de resultados */}
            <div className="border border-slate-200 rounded max-h-[300px] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-8 text-slate-400 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Buscando…
                </div>
              ) : cuentas.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400 italic">
                  {search ? "Sin resultados" : "Escribe para buscar cuentas"}
                </div>
              ) : (
                cuentas.map(c => {
                  const isSel = selectedIds.has(c.id);
                  return (
                    <div
                      key={c.id}
                      onClick={() => toggleSelect(c.id)}
                      className={`px-3 py-2 border-b last:border-0 cursor-pointer flex items-center gap-2 ${isSel ? "bg-emerald-50" : "hover:bg-slate-50"}`}
                    >
                      <input type="checkbox" checked={isSel} onChange={() => {}} className="shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{c.nombre}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {c.depto_name || "—"} · LTV {fmtMoney(c.ltv_12m_amount)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Nota opcional */}
            <div>
              <label className="text-[10px] uppercase tracking-wider font-mono text-slate-500 mb-1.5 block">
                Nota para la vendedora (opcional)
              </label>
              <textarea
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Pedirle catálogo Element Premium..."
                rows={2}
                className="w-full text-xs border border-slate-200 rounded p-2"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-500">
              {selectedIds.size} cuenta{selectedIds.size!==1?"s":""} seleccionada{selectedIds.size!==1?"s":""}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
              <Button size="sm" onClick={handleGuardar} disabled={saving || !asignadoA || selectedIds.size === 0} className="gap-1">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Asignar
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Página principal ────────────────────────────────────────────────────
export default function Pipeline() {
  const { user } = useAuth();
  const rol = user?.rol || "vendedora";
  const isAdmin = rol === "admin" || rol === "supervisor";

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openItem, setOpenItem] = useState(null);
  const [openAsignar, setOpenAsignar] = useState(false);
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const r = await api.get("/pipeline/mis-asignaciones");
      setData(r.data);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Polling cada 30s (refresca tiempos "hace N min")
  useEffect(() => {
    const id = setInterval(fetchData, 30000);
    return () => clearInterval(id);
  }, [fetchData]);

  const handleMover = useCallback(async (id, estado, reprogramar_para = null, nota = null) => {
    const body = { estado };
    if (reprogramar_para) body.reprogramar_para = reprogramar_para;
    if (nota != null) body.nota = nota;
    await api.patch(`/pipeline/asignacion/${id}`, body);
    fetchData();
  }, [fetchData]);

  // Drag & drop
  const onDragStart = (e, item) => {
    setDraggedId(item.id);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (e, colKey) => {
    e.preventDefault();
    setDragOverCol(colKey);
  };
  const onDragLeave = () => setDragOverCol(null);
  const onDrop = async (e, colKey) => {
    e.preventDefault();
    setDragOverCol(null);
    if (!draggedId) return;
    // Reprogramar requiere fecha → forzar click en card
    if (colKey === "reprogramar") {
      toast.info("Para reprogramar, abre la card y elige la fecha");
      setDraggedId(null);
      return;
    }
    try {
      await handleMover(draggedId, colKey);
      toast.success(`Movido a "${ESTADOS.find(e => e.key === colKey)?.label}"`);
    } catch (err) {
      toast.error("Error: " + (err?.response?.data?.detail || err.message));
    }
    setDraggedId(null);
  };

  if (loading && !data) {
    return (
      <div className="px-6 py-4">
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando pipeline…
        </div>
      </div>
    );
  }

  const porEstado = data?.por_estado || {};
  const totalActivas = data?.total || 0;

  return (
    <div className="px-6 py-4 max-w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            Pipeline comercial
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {totalActivas > 0 ? `${totalActivas} cuenta${totalActivas!==1?"s":""} activa${totalActivas!==1?"s":""} · arrastra las cards entre columnas` : "Sin asignaciones activas"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button size="sm" onClick={() => setOpenAsignar(true)} className="h-8 gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Asignar cuentas
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={fetchData} className="h-8 gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refrescar
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-3 border border-red-200 rounded p-3 flex items-center gap-2 text-sm bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <span className="text-red-700 flex-1">{error}</span>
        </div>
      )}

      {/* Empty state */}
      {totalActivas === 0 ? (
        <div className="border border-slate-200 rounded-lg px-6 py-16 text-center">
          <Sparkles className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-700">Sin asignaciones todavía</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            {isAdmin
              ? "Asigna tus primeras cuentas a una vendedora para empezar el seguimiento."
              : "Tu encargado todavía no te asignó clientes hoy. Aparecerán acá automáticamente."}
          </p>
          {isAdmin && (
            <Button size="sm" onClick={() => setOpenAsignar(true)} className="mt-4 gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Asignar cuentas
            </Button>
          )}
        </div>
      ) : (
        /* Kanban */
        <div className="overflow-x-auto pb-4" style={{ minHeight: "calc(100vh - 200px)" }}>
          <div className="flex gap-3 min-w-min">
            {ESTADOS.map((col) => {
              const items = porEstado[col.key] || [];
              const isHover = dragOverCol === col.key;
              return (
                <div
                  key={col.key}
                  onDragOver={(e) => onDragOver(e, col.key)}
                  onDragLeave={onDragLeave}
                  onDrop={(e) => onDrop(e, col.key)}
                  className={`flex flex-col rounded-lg border-2 transition-all ${COL_BG[col.color]} ${isHover ? "ring-2 ring-offset-2 ring-slate-400" : ""}`}
                  style={{ width: 260, minWidth: 260, maxHeight: "calc(100vh - 200px)" }}
                >
                  {/* Header columna */}
                  <div className="px-3 py-2 border-b flex items-center justify-between sticky top-0 bg-inherit z-10">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: col.accent }} />
                      <span className="text-[11px] font-mono uppercase tracking-wider font-semibold truncate" style={{ color: col.accent }}>
                        {col.label}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px] tabular-nums shrink-0" style={{ background: "white", borderColor: col.accent + "60", color: col.accent }}>
                      {items.length}
                    </Badge>
                  </div>

                  {/* Cards */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[100px]">
                    {items.length === 0 ? (
                      <div className="text-center text-[10px] text-slate-300 italic py-6">
                        Vacío
                      </div>
                    ) : (
                      items.map(item => (
                        <PipelineCard
                          key={item.id}
                          item={item}
                          onClick={setOpenItem}
                          onDragStart={onDragStart}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Drawer card */}
      {openItem && (
        <CardDrawer
          item={openItem}
          onClose={() => setOpenItem(null)}
          onMover={handleMover}
          onRefresh={fetchData}
        />
      )}

      {/* Modal asignar */}
      {openAsignar && (
        <AsignarModal
          onClose={() => setOpenAsignar(false)}
          onSaved={() => { setOpenAsignar(false); fetchData(); }}
        />
      )}
    </div>
  );
}
