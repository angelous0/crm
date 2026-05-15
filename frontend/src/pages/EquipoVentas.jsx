/**
 * EquipoVentas — dashboard rico del equipo (Sprint CRM-D8).
 *
 * Estructura:
 *   ┌─ Header: KPIs agregados del equipo ────────────────────────┐
 *   │  EQUIPO 4/6 · CUOTA 65% · ACTIVIDAD 17 · VENCIDAS 9        │
 *   └────────────────────────────────────────────────────────────┘
 *   ┌─ Grid de RichVendedoraCard ────────────────────────────────┐
 *   │  CUOTA% +diff · CARTERA · VENCIDAS · CONVERSIÓN · DORMIDOS │
 *   │  Barra de cuota + proyección + alertas                     │
 *   └────────────────────────────────────────────────────────────┘
 *
 * Fuente: GET /api/equipo/dashboard
 * Solo admin/supervisor pueden modificar; vendedoras ven en read-only.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus, Loader2, AlertCircle, X as XIcon, Power, Key,
  Phone, MessageCircle, Mail, Calendar, MapPin, Tag, Target,
  UserCheck, UserX, ChevronDown, UserPlus, Users,
  TrendingUp, TrendingDown, Activity, AlertTriangle, Clock,
  Layers, Moon, RefreshCw,
} from "lucide-react";

// ─── Formateadores ───────────────────────────────────────────────────
const fmtMoney = (n) =>
  "S/ " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtMoneyShort = (n) => {
  const v = Number(n || 0);
  if (v >= 1e6) return "S/ " + (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return "S/ " + (v / 1e3).toFixed(1) + "k";
  return "S/ " + Math.round(v);
};

const fmtPct = (n, digits = 0) =>
  n == null ? "—" : `${Number(n).toFixed(digits)}%`;

const fmtRelative = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return "ahora";
  if (mins < 60)  return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days  = Math.floor(hours / 24);
  if (days < 30) return `hace ${days}d`;
  const months = Math.floor(days / 30);
  return `hace ${months}m`;
};

// ─── Estilos por rol y severidad ─────────────────────────────────────
const ROL_STYLE = {
  admin:      { bg: "bg-red-50",    text: "text-red-700",     border: "border-red-200",    label: "Admin" },
  supervisor: { bg: "bg-blue-50",   text: "text-blue-700",    border: "border-blue-200",   label: "Supervisor" },
  vendedora:  { bg: "bg-emerald-50",text: "text-emerald-700", border: "border-emerald-200", label: "Vendedora" },
};

const SEVERIDAD_STYLE = {
  atencion: {
    border: "#DC2626",
    badge:  "bg-red-100 text-red-800 border-red-300",
    label:  "ATENCIÓN",
    icon:   AlertTriangle,
  },
  revisar: {
    border: "#D97706",
    badge:  "bg-amber-100 text-amber-800 border-amber-300",
    label:  "REVISAR",
    icon:   AlertCircle,
  },
  ok: null,
};

// Color de barra de cuota según %
const cuotaBarColor = (pct) => {
  if (pct == null)  return "#94a3b8";
  if (pct >= 100)   return "#059669";
  if (pct >= 70)    return "#16a34a";
  if (pct >= 40)    return "#D97706";
  return "#DC2626";
};

// ─── Avatar ──────────────────────────────────────────────────────────
function Avatar({ name, color, size = "md" }) {
  const inits = name ? name.split(/\s+/).slice(0, 2).map(s => s[0] || "").join("").toUpperCase() : "?";
  const dim = size === "sm" ? "w-8 h-8 text-[10px]" : size === "lg" ? "w-14 h-14 text-base" : "w-12 h-12 text-sm";
  const bg = color || "#64748b";
  return (
    <div className={`${dim} rounded-full flex items-center justify-center font-bold text-white shrink-0 shadow-sm`} style={{ background: bg }}>
      {inits || "?"}
    </div>
  );
}

// ─── Multi-select chips ──────────────────────────────────────────────
function MultiSelect({ options, value, onChange, placeholder, testId }) {
  const [open, setOpen] = useState(false);
  const selected = value || [];

  const toggle = (opt) => {
    if (selected.includes(opt)) onChange(selected.filter(s => s !== opt));
    else onChange([...selected, opt]);
  };

  return (
    <div className="relative" data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full h-9 px-2 text-sm border border-slate-200 rounded bg-white text-left flex items-center justify-between hover:border-slate-300"
      >
        <span className={selected.length === 0 ? "text-slate-400" : "text-slate-700"}>
          {selected.length === 0 ? placeholder : `${selected.length} seleccionada${selected.length===1?"":"s"}`}
        </span>
        <ChevronDown className="h-3 w-3 text-slate-400" />
      </button>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selected.map((s) => (
            <Badge key={s} variant="outline" className="text-[10px] gap-1 bg-slate-50">
              {s}
              <button onClick={() => toggle(s)} className="hover:text-red-600">
                <XIcon className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-64 overflow-y-auto">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-400 italic">Sin opciones</div>
            ) : options.map((opt) => {
              const isSel = selected.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggle(opt)}
                  className={`w-full px-3 py-1.5 text-sm text-left hover:bg-slate-50 flex items-center gap-2 ${isSel ? "bg-emerald-50" : ""}`}
                >
                  <input type="checkbox" checked={isSel} readOnly />
                  {opt}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Color picker (paleta predefinida) ──────────────────────────────
function ColorPicker({ colores, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {colores.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`w-7 h-7 rounded-full shadow-sm transition-transform ${value === c ? "ring-2 ring-offset-2 ring-slate-900 scale-110" : "hover:scale-105"}`}
          style={{ background: c }}
          title={c}
        />
      ))}
      <input
        type="color"
        value={value || "#64748b"}
        onChange={(e) => onChange(e.target.value)}
        className="w-7 h-7 rounded cursor-pointer border-0"
        title="Color personalizado"
      />
    </div>
  );
}

// ─── TeamKpiTile: tarjeta KPI grande del header del equipo ───────────
function TeamKpiTile({ label, value, sub, icon: Icon, color = "var(--ink)", testId }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-4 py-3" data-testid={testId}>
      <div className="flex items-center gap-1.5 mb-1">
        {Icon && <Icon className="h-3 w-3" style={{ color: "var(--ink-3)" }} />}
        <div
          className="text-[10px] font-mono font-medium uppercase"
          style={{ color: "var(--ink-3)", letterSpacing: "0.14em" }}
        >
          {label}
        </div>
      </div>
      <div
        className="text-2xl leading-none font-semibold tracking-tight tabular-nums"
        style={{ fontFamily: "var(--font-display)", color }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[11px] mt-1" style={{ color: "var(--ink-3)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ─── KpiCell: celda compacta dentro de la card ───────────────────────
function KpiCell({ label, value, sub, color, icon: Icon }) {
  return (
    <div>
      <div className="flex items-center gap-1 mb-0.5">
        {Icon && <Icon className="h-2.5 w-2.5" style={{ color: "var(--ink-3)" }} />}
        <div
          className="text-[9px] font-mono uppercase font-medium"
          style={{ color: "var(--ink-3)", letterSpacing: "0.10em" }}
        >
          {label}
        </div>
      </div>
      <div
        className="text-base font-semibold tabular-nums leading-none"
        style={{ color: color || "var(--ink)", fontFamily: "var(--font-display)" }}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] mt-0.5" style={{ color: "var(--ink-3)" }}>{sub}</div>}
    </div>
  );
}

// ─── TeamHeader: barra de KPIs agregados del equipo ──────────────────
function TeamHeader({ equipo, mes }) {
  if (!equipo) return null;

  const mesNombre = new Date(mes?.anio, (mes?.mes || 1) - 1, 1)
    .toLocaleDateString("es-PE", { month: "long" });

  return (
    <div className="mb-5">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="team-kpis">
        <TeamKpiTile
          label="Equipo"
          value={`${equipo.online_hoy}/${equipo.total}`}
          sub="online hoy"
          icon={Users}
          testId="kpi-equipo-online"
        />
        <TeamKpiTile
          label="Atención"
          value={equipo.con_atencion}
          sub={equipo.con_revisar > 0 ? `+${equipo.con_revisar} a revisar` : "sin alertas"}
          icon={AlertTriangle}
          color={equipo.con_atencion > 0 ? "#DC2626" : "var(--ink)"}
          testId="kpi-equipo-atencion"
        />
        <TeamKpiTile
          label={`Cuota ${mesNombre}`}
          value={fmtPct(equipo.cuota_equipo_pct)}
          sub={`${fmtMoneyShort(equipo.monto_mes_total)} / ${fmtMoneyShort(equipo.meta_total)}`}
          icon={Target}
          color={cuotaBarColor(equipo.cuota_equipo_pct)}
          testId="kpi-equipo-cuota"
        />
        <TeamKpiTile
          label="Actividad hoy"
          value={equipo.actividad_hoy_total}
          sub={`${equipo.actividad_semana_total} esta semana`}
          icon={Activity}
          testId="kpi-equipo-actividad"
        />
        <TeamKpiTile
          label="Vencidas"
          value={equipo.vencidas_total}
          sub={equipo.vencidas_total > 0 ? "requieren acción" : "al día"}
          icon={Clock}
          color={equipo.vencidas_total > 0 ? "#DC2626" : "var(--ink)"}
          testId="kpi-equipo-vencidas"
        />
        <TeamKpiTile
          label="Dormidos"
          value={equipo.dormidos_total}
          sub={`de ${equipo.cartera_total} en cartera`}
          icon={Moon}
          color={equipo.dormidos_total > equipo.cartera_total * 0.3 ? "#D97706" : "var(--ink)"}
          testId="kpi-equipo-dormidos"
        />
      </div>
    </div>
  );
}

// ─── Barra de cuota con proyección ───────────────────────────────────
function CuotaBar({ pct, proyeccionPct, monto, meta, mesNombre }) {
  if (meta <= 0) {
    return (
      <div className="text-[10px] text-slate-400 italic">
        Sin meta mensual configurada
      </div>
    );
  }
  const clampedPct       = Math.min(Math.max(pct || 0, 0), 100);
  const clampedProyPct   = proyeccionPct != null ? Math.min(Math.max(proyeccionPct, 0), 100) : null;
  const showProy         = proyeccionPct != null && Math.abs(proyeccionPct - pct) > 3;
  const color            = cuotaBarColor(pct);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[10px] font-mono uppercase font-medium" style={{ color: "var(--ink-3)", letterSpacing: "0.10em" }}>
          Cuota {mesNombre}
        </span>
        <span className="text-[11px] tabular-nums" style={{ color: "var(--ink-3)" }}>
          {fmtMoneyShort(monto)} / {fmtMoneyShort(meta)}
        </span>
      </div>
      <div className="relative h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 transition-all duration-500"
          style={{ width: `${clampedPct}%`, background: color }}
        />
        {/* Marca de proyección */}
        {showProy && clampedProyPct != null && (
          <div
            className="absolute inset-y-0 border-l-2 border-dashed"
            style={{ left: `${clampedProyPct}%`, borderColor: color, opacity: 0.6 }}
            title={`Proyección fin de mes: ${fmtPct(proyeccionPct)}`}
          />
        )}
      </div>
      <div className="flex items-baseline justify-between mt-1">
        <span className="text-sm font-bold tabular-nums" style={{ color, fontFamily: "var(--font-display)" }}>
          {fmtPct(pct)}
        </span>
        {showProy && (
          <span className="text-[10px] tabular-nums" style={{ color: "var(--ink-3)" }}>
            proy. {fmtPct(proyeccionPct)}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── DiffBadge: muestra +12% / -5% vs avg ────────────────────────────
function DiffBadge({ diff }) {
  if (diff == null) return null;
  const isUp   = diff >= 0;
  const Icon   = isUp ? TrendingUp : TrendingDown;
  const color  = isUp ? "#059669" : "#DC2626";
  const text   = (isUp ? "+" : "") + diff.toFixed(0) + "% vs avg";
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium tabular-nums" style={{ color }}>
      <Icon className="h-2.5 w-2.5" />
      {text}
    </span>
  );
}

// ─── Card rica de vendedora ──────────────────────────────────────────
function RichVendedoraCard({ u, onClick, isAdmin, mesNombre }) {
  const rolStyle = ROL_STYLE[u.rol] || ROL_STYLE.vendedora;
  const sev      = SEVERIDAD_STYLE[u.severidad];
  const SevIcon  = sev?.icon;

  // Borde izquierdo: severidad si vendedora con alertas, color personal si no
  const borderLeft = u.severidad === "atencion" ? "#DC2626"
                   : u.severidad === "revisar"  ? "#D97706"
                   : (u.color_hex || "#cbd5e1");

  return (
    <div
      onClick={() => isAdmin && onClick(u)}
      className={`bg-white border rounded-xl p-4 transition-all ${
        u.activo ? "border-slate-200 hover:shadow-md" : "border-slate-100 opacity-60"
      } ${isAdmin ? "cursor-pointer" : ""}`}
      style={{ borderLeftWidth: 4, borderLeftColor: borderLeft }}
      data-testid={`vendedora-card-${u.username}`}
    >
      {/* ─── Header: avatar + nombre + badge severidad ─── */}
      <div className="flex items-start gap-3 mb-3">
        <Avatar name={u.nombre_completo || u.username} color={u.color_hex} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-slate-900 leading-tight" style={{ fontFamily: "var(--font-display)" }}>
            {u.nombre_completo || u.username}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">@{u.username}</div>
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            <Badge variant="outline" className={`text-[9px] font-semibold ${rolStyle.bg} ${rolStyle.text} ${rolStyle.border}`}>
              {rolStyle.label}
            </Badge>
            {!u.activo && (
              <Badge variant="outline" className="text-[9px] bg-slate-100 text-slate-500">Inactivo</Badge>
            )}
            {sev && (
              <Badge variant="outline" className={`text-[9px] font-semibold inline-flex items-center gap-0.5 ${sev.badge}`}>
                <SevIcon className="h-2.5 w-2.5" />
                {sev.label}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* ─── Grid de KPIs principales (3 columnas) ─── */}
      {u.rol === "vendedora" && (
        <div className="grid grid-cols-3 gap-3 py-3 border-y border-slate-100">
          <KpiCell
            label="Cuota"
            value={u.cuota_pct != null ? fmtPct(u.cuota_pct) : "—"}
            sub={u.diff_vs_avg != null
              ? <DiffBadge diff={u.diff_vs_avg} />
              : null}
            color={cuotaBarColor(u.cuota_pct)}
            icon={Target}
          />
          <KpiCell
            label="Cartera"
            value={u.cartera_total}
            sub={`${u.cartera_activos} activas`}
            icon={Layers}
          />
          <KpiCell
            label="Vencidas"
            value={u.vencidas}
            sub={u.asignaciones_activas > 0 ? `de ${u.asignaciones_activas} abiertas` : null}
            color={u.vencidas > 0 ? "#DC2626" : "var(--ink)"}
            icon={Clock}
          />
        </div>
      )}

      {/* ─── Grid secundario: conversión, dormidos, actividad ─── */}
      {u.rol === "vendedora" && (
        <div className="grid grid-cols-3 gap-3 py-3 border-b border-slate-100">
          <KpiCell
            label="Conversión"
            value={u.conversion_pct != null ? fmtPct(u.conversion_pct) : "—"}
            sub="últ. 90 días"
            icon={TrendingUp}
            color={u.conversion_pct != null && u.conversion_pct >= 30 ? "#059669" : "var(--ink)"}
          />
          <KpiCell
            label="Dormidos"
            value={u.dormidos}
            sub={u.en_riesgo > 0 ? `+${u.en_riesgo} en riesgo` : null}
            icon={Moon}
            color={u.dormidos >= 10 ? "#D97706" : "var(--ink)"}
          />
          <KpiCell
            label="Última act."
            value={fmtRelative(u.ultima_actividad)}
            sub={u.actividad_hoy > 0 ? `${u.actividad_hoy} hoy` : null}
            icon={Activity}
            color={u.dias_sin_actividad != null && u.dias_sin_actividad >= 7 ? "#DC2626" : "var(--ink)"}
          />
        </div>
      )}

      {/* ─── Cuota mensual con barra ─── */}
      {u.rol === "vendedora" && (
        <div className="pt-3">
          <CuotaBar
            pct={u.cuota_pct}
            proyeccionPct={u.proyeccion_pct}
            monto={u.monto_mes_actual}
            meta={u.meta_mensual}
            mesNombre={mesNombre}
          />
        </div>
      )}

      {/* ─── Para admin/supervisor: solo contacto y tiendas ─── */}
      {u.rol !== "vendedora" && (u.tiendas?.length > 0 || u.marcas?.length > 0) && (
        <div className="space-y-1 pt-2 border-t border-slate-100">
          {u.tiendas?.length > 0 && (
            <div className="flex items-start gap-1 text-[10px]">
              <MapPin className="h-2.5 w-2.5 text-slate-400 mt-1 shrink-0" />
              <div className="flex flex-wrap gap-1">
                {u.tiendas.map(t => (
                  <span key={t} className="px-1.5 py-0 rounded bg-slate-100 text-slate-700 font-mono">{t}</span>
                ))}
              </div>
            </div>
          )}
          {u.marcas?.length > 0 && (
            <div className="flex items-start gap-1 text-[10px]">
              <Tag className="h-2.5 w-2.5 text-slate-400 mt-1 shrink-0" />
              <div className="flex flex-wrap gap-1">
                {u.marcas.map(m => (
                  <span key={m} className="px-1.5 py-0 rounded bg-indigo-50 text-indigo-700">{m}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Alertas ─── */}
      {u.alertas?.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-1">
          {u.alertas.map((a, i) => (
            <div
              key={i}
              className="text-[11px] flex items-start gap-1.5"
              style={{ color: u.severidad === "atencion" ? "#B91C1C" : "#92400E" }}
            >
              <span className="text-[14px] leading-none">•</span>
              <span>{a}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Modal crear / editar ─────────────────────────────────────────────
function UsuarioModal({ usuario, opciones, onClose, onSaved }) {
  const isEdit = !!usuario;
  const [form, setForm] = useState({
    username: usuario?.username || "",
    password: "",
    nombre_completo: usuario?.nombre_completo || "",
    rol: usuario?.rol || "vendedora",
    email: usuario?.email || "",
    telefono: usuario?.telefono || "",
    whatsapp: usuario?.whatsapp || "",
    color_hex: usuario?.color_hex || (opciones.colores?.[0] || "#64748b"),
    tiendas: usuario?.tiendas || [],
    marcas: usuario?.marcas || [],
    fecha_ingreso: usuario?.fecha_ingreso || "",
    meta_mensual: usuario?.meta_mensual || "",
    notas: usuario?.notas || "",
  });
  const [saving, setSaving] = useState(false);

  const handleGuardar = async () => {
    if (!isEdit) {
      if (!form.username || !form.password || !form.nombre_completo) {
        toast.error("Username, password y nombre son obligatorios");
        return;
      }
    }
    setSaving(true);
    try {
      const body = { ...form };
      Object.keys(body).forEach(k => {
        if (body[k] === "" || body[k] === null) body[k] = null;
      });
      if (body.meta_mensual) body.meta_mensual = parseFloat(body.meta_mensual) || null;

      if (isEdit) {
        delete body.username;
        delete body.password;
        await api.patch(`/equipo/usuarios/${usuario.username}`, body);
        toast.success(`${usuario.username} actualizado`);
      } else {
        await api.post("/equipo/usuarios", body);
        toast.success(`${form.username} creado correctamente`);
      }
      onSaved();
    } catch (e) {
      toast.error("Error: " + (e?.response?.data?.detail || e.message));
    } finally { setSaving(false); }
  };

  return (
    <>
      <div className="fixed inset-0 z-[55]" style={{ background: "rgba(31,26,20,.40)", backdropFilter: "blur(2px)" }} onClick={onClose} />
      <div className="fixed inset-0 z-[56] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar name={form.nombre_completo || form.username} color={form.color_hex} size="md" />
              <h3 className="text-lg font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                {isEdit ? `Editar ${usuario.nombre_completo || usuario.username}` : "Nueva persona"}
              </h3>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg border hover:bg-slate-50 flex items-center justify-center text-slate-500">
              <XIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider font-mono text-slate-500 mb-1 block">
                  Username {!isEdit && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text" value={form.username} disabled={isEdit}
                  onChange={(e) => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s+/g, "") }))}
                  placeholder="luz.flores" autoFocus={!isEdit}
                  className="w-full h-9 px-2 text-sm border border-slate-200 rounded bg-white disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
              {!isEdit && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-mono text-slate-500 mb-1 block">
                    Password inicial <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text" value={form.password}
                    onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="luz1234" className="w-full h-9 px-2 text-sm border border-slate-200 rounded font-mono"
                  />
                </div>
              )}
              <div className={isEdit ? "col-span-2" : ""}>
                <label className="text-[10px] uppercase tracking-wider font-mono text-slate-500 mb-1 block">
                  Nombre completo {!isEdit && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text" value={form.nombre_completo}
                  onChange={(e) => setForm(f => ({ ...f, nombre_completo: e.target.value }))}
                  placeholder="Luz Flores Mamani" className="w-full h-9 px-2 text-sm border border-slate-200 rounded"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider font-mono text-slate-500 mb-1 block">Rol</label>
                <select
                  value={form.rol}
                  onChange={(e) => setForm(f => ({ ...f, rol: e.target.value }))}
                  className="w-full h-9 px-2 text-sm border border-slate-200 rounded bg-white"
                >
                  <option value="vendedora">Vendedora</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider font-mono text-slate-500 mb-1 block">Color identificador</label>
                <ColorPicker
                  colores={opciones.colores || []}
                  value={form.color_hex}
                  onChange={(c) => setForm(f => ({ ...f, color_hex: c }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider font-mono text-slate-500 mb-1 block">
                  <Phone className="inline h-3 w-3 mr-1" /> Teléfono
                </label>
                <input
                  type="tel" value={form.telefono}
                  onChange={(e) => setForm(f => ({ ...f, telefono: e.target.value }))}
                  placeholder="984 221 305" className="w-full h-9 px-2 text-sm border border-slate-200 rounded"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider font-mono text-slate-500 mb-1 block">
                  <MessageCircle className="inline h-3 w-3 mr-1 text-emerald-600" /> WhatsApp
                </label>
                <input
                  type="tel" value={form.whatsapp}
                  onChange={(e) => setForm(f => ({ ...f, whatsapp: e.target.value }))}
                  placeholder="984221305" className="w-full h-9 px-2 text-sm border border-slate-200 rounded"
                />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] uppercase tracking-wider font-mono text-slate-500 mb-1 block">
                  <Mail className="inline h-3 w-3 mr-1" /> Email
                </label>
                <input
                  type="email" value={form.email}
                  onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="luz@ambission.com" className="w-full h-9 px-2 text-sm border border-slate-200 rounded"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider font-mono text-slate-500 mb-1 block">
                  <MapPin className="inline h-3 w-3 mr-1" /> Tiendas donde atiende
                </label>
                <MultiSelect
                  options={opciones.tiendas || []}
                  value={form.tiendas}
                  onChange={(v) => setForm(f => ({ ...f, tiendas: v }))}
                  placeholder="Selecciona tiendas…"
                  testId="multi-tiendas"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider font-mono text-slate-500 mb-1 block">
                  <Tag className="inline h-3 w-3 mr-1" /> Marcas que maneja
                </label>
                <MultiSelect
                  options={opciones.marcas || []}
                  value={form.marcas}
                  onChange={(v) => setForm(f => ({ ...f, marcas: v }))}
                  placeholder="Selecciona marcas…"
                  testId="multi-marcas"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider font-mono text-slate-500 mb-1 block">
                  <Target className="inline h-3 w-3 mr-1" /> Meta mensual (S/)
                </label>
                <input
                  type="number" value={form.meta_mensual}
                  onChange={(e) => setForm(f => ({ ...f, meta_mensual: e.target.value }))}
                  placeholder="20000" className="w-full h-9 px-2 text-sm border border-slate-200 rounded tabular-nums"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider font-mono text-slate-500 mb-1 block">
                  <Calendar className="inline h-3 w-3 mr-1" /> Fecha de ingreso
                </label>
                <input
                  type="date" value={form.fecha_ingreso}
                  onChange={(e) => setForm(f => ({ ...f, fecha_ingreso: e.target.value }))}
                  className="w-full h-9 px-2 text-sm border border-slate-200 rounded"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider font-mono text-slate-500 mb-1 block">
                Notas internas
              </label>
              <textarea
                value={form.notas}
                onChange={(e) => setForm(f => ({ ...f, notas: e.target.value }))}
                placeholder="Algo importante sobre esta persona..."
                rows={2}
                className="w-full text-xs border border-slate-200 rounded p-2"
              />
            </div>
          </div>

          <div className="px-5 py-3 border-t flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button size="sm" onClick={handleGuardar} disabled={saving} className="gap-1">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
              {isEdit ? "Guardar cambios" : "Crear vendedora"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Modal "Añadir desde sistema" ─────────────────────────────────────
function AgregarDesdeSistemaModal({ opciones, onClose, onSaved }) {
  const [disponibles, setDisponibles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [rol, setRol] = useState("");
  const [colorHex, setColorHex] = useState("");
  const [tiendas, setTiendas] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/equipo/usuarios-disponibles")
      .then(r => setDisponibles(r.data || []))
      .catch(e => toast.error("Error: " + (e?.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (u) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(u)) next.delete(u); else next.add(u);
      return next;
    });
  };

  const handleAgregar = async () => {
    if (selected.size === 0) {
      toast.error("Selecciona al menos 1 persona");
      return;
    }
    setSaving(true);
    try {
      const body = { usernames: Array.from(selected) };
      if (rol) body.rol = rol;
      if (colorHex) body.color_hex = colorHex;
      if (tiendas.length > 0) body.tiendas = tiendas;
      if (marcas.length > 0) body.marcas = marcas;
      await api.post("/equipo/usuarios/agregar-a-equipo", body);
      toast.success(`${selected.size} agregada${selected.size===1?"":"s"} al equipo`);
      onSaved();
    } catch (e) {
      toast.error("Error: " + (e?.response?.data?.detail || e.message));
    } finally { setSaving(false); }
  };

  return (
    <>
      <div className="fixed inset-0 z-[55]" style={{ background: "rgba(31,26,20,.40)", backdropFilter: "blur(2px)" }} onClick={onClose} />
      <div className="fixed inset-0 z-[56] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                Añadir desde sistema
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Usuarios del sistema que aún no son parte del equipo CRM
              </p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg border hover:bg-slate-50 flex items-center justify-center text-slate-500">
              <XIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            <div className="border border-slate-200 rounded-lg max-h-[300px] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-8 text-slate-400 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Cargando…
                </div>
              ) : disponibles.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400 italic">
                  Todos los usuarios del sistema ya están en el equipo CRM
                </div>
              ) : (
                disponibles.map(u => {
                  const isSel = selected.has(u.username);
                  return (
                    <div
                      key={u.username}
                      onClick={() => toggle(u.username)}
                      className={`px-3 py-2 border-b last:border-0 cursor-pointer flex items-center gap-3 ${isSel ? "bg-emerald-50" : "hover:bg-slate-50"}`}
                    >
                      <input type="checkbox" checked={isSel} readOnly className="shrink-0" />
                      <Avatar name={u.nombre_completo || u.username} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{u.nombre_completo || u.username}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          @{u.username} · {u.rol}{u.ultimo_login ? ` · login ${new Date(u.ultimo_login).toLocaleDateString("es-PE")}` : ""}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {selected.size > 0 && (
              <div className="border border-slate-200 rounded-lg p-3 space-y-3 bg-slate-50/40">
                <div className="text-[10px] uppercase tracking-wider font-mono text-slate-500">
                  Atributos opcionales (se aplican a TODOS los seleccionados)
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500 mb-1 block">Cambiar rol (opcional)</label>
                    <select
                      value={rol} onChange={e => setRol(e.target.value)}
                      className="w-full h-8 px-2 text-xs border border-slate-200 rounded bg-white"
                    >
                      <option value="">— sin cambio —</option>
                      <option value="vendedora">Vendedora</option>
                      <option value="supervisor">Supervisor</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 mb-1 block">Color</label>
                    <ColorPicker
                      colores={opciones.colores || []}
                      value={colorHex}
                      onChange={setColorHex}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 mb-1 block">Tiendas</label>
                    <MultiSelect
                      options={opciones.tiendas || []} value={tiendas} onChange={setTiendas}
                      placeholder="(no cambiar)" testId="agregar-tiendas"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 mb-1 block">Marcas</label>
                    <MultiSelect
                      options={opciones.marcas || []} value={marcas} onChange={setMarcas}
                      placeholder="(no cambiar)" testId="agregar-marcas"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="px-5 py-3 border-t flex items-center justify-between">
            <span className="text-[11px] text-slate-500">
              {selected.size} seleccionada{selected.size!==1?"s":""}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
              <Button size="sm" onClick={handleAgregar} disabled={saving || selected.size === 0} className="gap-1">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                Añadir al equipo
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Página principal ────────────────────────────────────────────────
export default function EquipoVentas() {
  const { user } = useAuth();
  const isAdmin = user?.rol === "admin" || user?.rol === "supervisor";

  const [dashboard, setDashboard] = useState({ vendedoras: [], equipo: null, mes_actual: null });
  const [opciones, setOpciones]   = useState({ tiendas: [], marcas: [], colores: [], roles: [] });
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState(null);
  const [filtroRol, setFiltroRol] = useState("");
  const [filtroSeveridad, setFiltroSev] = useState("");  // "" | "atencion" | "revisar" | "ok"
  const [soloActivos, setSoloActivos]   = useState(true);
  const [openModal, setOpenModal]       = useState(null);
  const [openAgregar, setOpenAgregar]   = useState(false);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [d, o] = await Promise.all([
        api.get("/equipo/dashboard"),
        api.get("/equipo/opciones"),
      ]);
      setDashboard(d.data || { vendedoras: [], equipo: null, mes_actual: null });
      setOpciones(o.data || {});
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh cada 60s (silencioso)
  useEffect(() => {
    const id = setInterval(() => fetchData(true), 60000);
    return () => clearInterval(id);
  }, [fetchData]);

  const vendedoras = dashboard.vendedoras || [];

  const filtrados = useMemo(() => {
    let f = vendedoras;
    if (soloActivos) f = f.filter(u => u.activo);
    if (filtroRol) f = f.filter(u => u.rol === filtroRol);
    if (filtroSeveridad) f = f.filter(u => (u.severidad || "ok") === filtroSeveridad);
    return f;
  }, [vendedoras, filtroRol, filtroSeveridad, soloActivos]);

  const counts = useMemo(() => {
    const c = { total: vendedoras.length, activos: 0, admin: 0, supervisor: 0, vendedora: 0 };
    vendedoras.forEach(u => {
      if (u.activo) c.activos++;
      c[u.rol] = (c[u.rol] || 0) + 1;
    });
    return c;
  }, [vendedoras]);

  const mesNombre = dashboard.mes_actual
    ? new Date(dashboard.mes_actual.anio, (dashboard.mes_actual.mes || 1) - 1, 1)
        .toLocaleDateString("es-PE", { month: "long" })
    : "";

  const handleResetPassword = async (u) => {
    const newPass = prompt(`Nuevo password para ${u.username}:`);
    if (!newPass || newPass.length < 4) return;
    try {
      await api.post(`/equipo/usuarios/${u.username}/reset-password`, { new_password: newPass });
      toast.success(`Password de ${u.username} actualizado`);
    } catch (e) {
      toast.error("Error: " + (e?.response?.data?.detail || e.message));
    }
  };

  const handleToggleActivo = async (u) => {
    if (!window.confirm(`${u.activo ? "Desactivar" : "Reactivar"} a ${u.nombre_completo || u.username}?`)) return;
    try {
      await api.post(`/equipo/usuarios/${u.username}/toggle-activo`);
      toast.success(`${u.username} ${u.activo ? "desactivado" : "reactivado"}`);
      fetchData();
    } catch (e) {
      toast.error("Error: " + (e?.response?.data?.detail || e.message));
    }
  };

  const handleQuitarDelEquipo = async (u) => {
    if (!window.confirm(`¿Quitar a ${u.nombre_completo || u.username} del equipo CRM?\n\nNo se borra del sistema — solo deja de aparecer acá. Puedes volver a añadirlo en "Añadir desde sistema".`)) return;
    try {
      await api.post(`/equipo/usuarios/${u.username}/quitar-de-equipo`);
      toast.success(`${u.username} retirado del equipo`);
      setOpenModal(null);
      fetchData();
    } catch (e) {
      toast.error("Error: " + (e?.response?.data?.detail || e.message));
    }
  };

  if (loading) {
    return (
      <div className="px-6 py-4 text-slate-400 text-sm flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando equipo…
      </div>
    );
  }

  return (
    <div className="px-6 py-4 max-w-7xl">
      {/* ─── Header ─── */}
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            Equipo de ventas
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {counts.total} {counts.total === 1 ? "persona" : "personas"} en el equipo CRM
            {" · "}{counts.vendedora || 0} vendedoras
            {" · "}{counts.supervisor || 0} supervisores
            {" · "}{counts.admin || 0} admins
            {counts.activos !== counts.total && (
              <> · <span className="text-amber-700">{counts.total - counts.activos} inactivos</span></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {refreshing && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
          <Button
            size="sm" variant="ghost"
            onClick={() => fetchData(true)}
            className="h-8 w-8 p-0"
            title="Refrescar"
            data-testid="refresh-dashboard"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          {isAdmin && (
            <>
              <Button size="sm" variant="outline" onClick={() => setOpenAgregar(true)} className="h-8 gap-1.5">
                <Users className="h-3.5 w-3.5" /> Añadir desde sistema
              </Button>
              <Button size="sm" onClick={() => setOpenModal("new")} className="h-8 gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Nueva persona
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ─── KPIs agregados del equipo ─── */}
      <TeamHeader equipo={dashboard.equipo} mes={dashboard.mes_actual} />

      {/* ─── Filtros ─── */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-[9px] uppercase tracking-[0.14em] font-mono text-slate-500">Rol:</span>
        {[{k:"",l:"Todos"},{k:"vendedora",l:"Vendedoras"},{k:"supervisor",l:"Supervisores"},{k:"admin",l:"Admins"}].map(opt => (
          <button
            key={opt.k}
            onClick={() => setFiltroRol(opt.k)}
            className={`px-2 py-0.5 rounded-full text-[11px] border transition-colors ${
              filtroRol === opt.k
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
            }`}
          >
            {opt.l}
          </button>
        ))}

        <span className="ml-3 text-[9px] uppercase tracking-[0.14em] font-mono text-slate-500">Estado:</span>
        {[
          {k:"",        l:"Todos",     icon: null},
          {k:"atencion",l:"Atención",  color:"text-red-700 border-red-300 bg-red-50"},
          {k:"revisar", l:"Revisar",   color:"text-amber-700 border-amber-300 bg-amber-50"},
          {k:"ok",      l:"OK",        color:"text-emerald-700 border-emerald-300 bg-emerald-50"},
        ].map(opt => (
          <button
            key={opt.k}
            onClick={() => setFiltroSev(opt.k)}
            className={`px-2 py-0.5 rounded-full text-[11px] border transition-colors ${
              filtroSeveridad === opt.k
                ? "bg-slate-900 text-white border-slate-900"
                : (opt.color || "bg-white text-slate-600 border-slate-200 hover:border-slate-300")
            }`}
          >
            {opt.l}
          </button>
        ))}

        <label className="ml-3 inline-flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
          <input type="checkbox" checked={soloActivos} onChange={(e) => setSoloActivos(e.target.checked)} />
          Solo activos
        </label>
      </div>

      {error && (
        <div className="mb-3 border border-red-200 rounded p-3 flex items-center gap-2 text-sm bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {/* ─── Grid de cards ─── */}
      {filtrados.length === 0 ? (
        <div className="border border-slate-200 rounded-lg px-6 py-12 text-center text-sm text-slate-400 italic">
          Sin personas con esos filtros
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtrados.map(u => (
            <RichVendedoraCard
              key={u.username}
              u={u}
              onClick={setOpenModal}
              isAdmin={isAdmin}
              mesNombre={mesNombre}
            />
          ))}
        </div>
      )}

      {/* ─── Modal crear / editar ─── */}
      {openModal && (
        <UsuarioModal
          usuario={openModal === "new" ? null : openModal}
          opciones={opciones}
          onClose={() => setOpenModal(null)}
          onSaved={() => { setOpenModal(null); fetchData(); }}
        />
      )}

      {/* ─── Acciones secundarias del usuario seleccionado ─── */}
      {openModal && openModal !== "new" && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[57] bg-white border border-slate-200 rounded-full shadow-lg px-2 py-1.5 flex gap-1">
          <button
            onClick={() => handleResetPassword(openModal)}
            className="px-3 py-1 text-[11px] rounded-full hover:bg-amber-50 text-amber-700 inline-flex items-center gap-1"
          >
            <Key className="h-3 w-3" /> Reset password
          </button>
          <button
            onClick={() => handleQuitarDelEquipo(openModal)}
            className="px-3 py-1 text-[11px] rounded-full hover:bg-orange-50 text-orange-700 inline-flex items-center gap-1"
            title="No borra el usuario del sistema, solo lo saca del equipo CRM"
          >
            <UserX className="h-3 w-3" /> Quitar del equipo
          </button>
          <button
            onClick={() => handleToggleActivo(openModal)}
            className={`px-3 py-1 text-[11px] rounded-full inline-flex items-center gap-1 ${openModal.activo ? "hover:bg-red-50 text-red-700" : "hover:bg-emerald-50 text-emerald-700"}`}
          >
            {openModal.activo ? <><Power className="h-3 w-3" /> Desactivar</> : <><UserCheck className="h-3 w-3" /> Reactivar</>}
          </button>
        </div>
      )}

      {/* ─── Modal añadir desde sistema ─── */}
      {openAgregar && (
        <AgregarDesdeSistemaModal
          opciones={opciones}
          onClose={() => setOpenAgregar(false)}
          onSaved={() => { setOpenAgregar(false); fetchData(); }}
        />
      )}
    </div>
  );
}
