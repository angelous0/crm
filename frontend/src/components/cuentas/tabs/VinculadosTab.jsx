/**
 * VinculadosTab — contactos/partners vinculados a la cuenta (Sprint CRM-D4 v2).
 *
 * Replica el diseño "Vinculados" del prototipo Hilo, pero la **lógica** es la
 * misma de "Contactos vinculados" del tab Info: varios partners (personas o
 * RUCs) que pertenecen a UNA misma cuenta. Las ventas individuales se suman
 * al cliente principal automáticamente.
 *
 * Layout:
 *   ┌────────────────────────────────────────────────┐
 *   │ ✓ Esta cuenta tiene N contactos vinculados     │
 *   ├────────────────────────────────────────────────┤
 *   │ CUENTA · ANGELINO MONTANEZ SABINO    S/ 421,508│
 *   │ N contactos vinculados              S/ 35k/mes │
 *   ├────────────────────────────────────────────────┤
 *   │ AM │ ANGELINO MONTANEZ SABINO  [PRINCIPAL]     │
 *   │    │ Cusco · RUC 10238607049    S/14k/mes      │
 *   ├────────────────────────────────────────────────┤
 *   │ AM │ ANGELINO MONTANEZ SABINO                  │
 *   │ ★× │ Otro RUC                  S/21k/mes       │
 *   ├────────────────────────────────────────────────┤
 *   │ + Vincular contacto                            │
 *   └────────────────────────────────────────────────┘
 */
import React, { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Loader2, Plus, X, AlertCircle, CheckCircle2, MessageCircle } from "lucide-react";
import { formatDoc } from "@/lib/docTipo";
import { VincularContactoModal } from "@/components/cuentas/modals/VincularContactoModal";

const fmtMoney = (n) =>
  "S/ " + Number(n || 0).toLocaleString("es-PE", { maximumFractionDigits: 0 });
const fmtMoneyShort = (n) => {
  if (!n) return "S/ 0";
  const v = Number(n);
  if (v >= 1000000) return `S/ ${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `S/ ${(v / 1000).toFixed(0)}k`;
  return `S/ ${v.toFixed(0)}`;
};

function initialsOf(name) {
  if (!name) return "??";
  const parts = String(name).trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0] || "").join("").toUpperCase();
}

const ROL_COLORS = {
  GERENTE:        { bg: "rgba(42,111,219,.12)",  fg: "#1E54B0" },
  COMPRADOR:      { bg: "rgba(217,119,6,.12)",   fg: "#B45309" },
  ALMACEN:        { bg: "rgba(135,122,102,.16)", fg: "#4A4136" },
  CAJA:           { bg: "rgba(22,163,74,.12)",   fg: "#15803D" },
  ADMINISTRACION: { bg: "rgba(122,78,126,.12)",  fg: "#7A4E7E" },
};

export function VinculadosTab({ cuentaId, partnerOdooId }) {
  const pid = partnerOdooId || cuentaId;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showVincular, setShowVincular] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/cuentas/${pid}/contactos-enriquecidos`);
      setData(r.data);
    } catch (e) {
      toast.error("Error cargando contactos vinculados");
    } finally {
      setLoading(false);
    }
  }, [pid]);

  useEffect(() => { cargar(); }, [cargar]);

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  }
  if (!data) return null;

  const tieneContactos = data.totales.miembros_count > 1;
  const cuentaNombre = data.principal || "Cuenta";

  return (
    <div className="space-y-3 max-w-3xl" data-testid="section-vinculados">
      {/* ─── Banner de estado ─── */}
      {tieneContactos ? (
        <div
          className="border rounded-lg px-4 py-2.5 flex items-center gap-3 text-sm"
          style={{
            background: "rgba(22,163,74,.06)",
            borderColor: "rgba(22,163,74,.30)",
            color: "#15803D",
          }}
          data-testid="banner-vinculados"
        >
          <CheckCircle2 size={16} className="shrink-0" />
          <span className="font-medium">
            Esta cuenta tiene <b>{data.totales.miembros_count - 1} contacto{data.totales.miembros_count - 1 === 1 ? "" : "s"} vinculado{data.totales.miembros_count - 1 === 1 ? "" : "s"}</b> · todas las ventas se suman al principal
          </span>
        </div>
      ) : (
        <div
          className="border border-dashed rounded-lg px-4 py-3 flex items-center gap-3 text-sm bg-slate-50"
          data-testid="banner-sin-contactos"
        >
          <AlertCircle size={16} className="text-slate-400 shrink-0" />
          <span className="text-slate-600">
            Esta cuenta solo tiene un contacto. Vinculá otros partners (gerente, comprador, RUC alterno) para consolidar sus ventas.
          </span>
        </div>
      )}

      {/* ─── Card cuenta + miembros ─── */}
      <div
        className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm"
        data-testid="cuenta-card"
      >
        <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-mono mb-1">
              Cuenta
            </div>
            <h3
              className="text-xl font-semibold text-slate-900 leading-tight truncate"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="cuenta-nombre"
            >
              {cuentaNombre}
            </h3>
            <div className="text-xs text-slate-500 mt-0.5">
              {data.totales.miembros_count} contacto{data.totales.miembros_count === 1 ? "" : "s"} · todas las ventas suman al principal
            </div>
          </div>
          <div className="text-right shrink-0">
            <div
              className="text-xl font-bold text-slate-900 leading-tight"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="cuenta-ltv"
            >
              {fmtMoney(data.totales.ltv_12m_directo)}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">
              LTV 12M (DIRECTO)
            </div>
            <div className="text-xs text-slate-500 mt-1 font-mono">
              {fmtMoneyShort(data.totales.estimado_mensual)}/mes
            </div>
          </div>
        </div>

        {/* ─── Lista de miembros ─── */}
        <div className="divide-y divide-slate-100">
          {data.miembros.map((m) => (
            <ContactoRow
              key={m.contacto_partner_odoo_id}
              miembro={m}
              cuentaPartnerOdooId={pid}
              onChanged={cargar}
            />
          ))}
        </div>

        {/* ─── Botón vincular ─── */}
        <button
          onClick={() => setShowVincular(true)}
          className="w-full px-4 py-3 border-t border-slate-100 hover:bg-slate-50 transition-colors text-sm font-medium text-slate-700 flex items-center justify-center gap-2"
          data-testid="btn-vincular-contacto"
        >
          <Plus size={14} />
          Vincular otro contacto a esta cuenta
        </button>
      </div>

      {/* ─── Modal vincular ─── */}
      <VincularContactoModal
        open={showVincular}
        onClose={() => setShowVincular(false)}
        partnerOdooId={pid}
        onSuccess={() => { setShowVincular(false); cargar(); }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ContactoRow
// ─────────────────────────────────────────────────────────────
function ContactoRow({ miembro, cuentaPartnerOdooId, onChanged }) {
  const rolColor = miembro.rol ? ROL_COLORS[miembro.rol] : null;

  const desvincular = async () => {
    if (!window.confirm(`¿Desvincular "${miembro.name}" de esta cuenta?`)) return;
    try {
      // El endpoint correcto recibe el partner_odoo_id del SECUNDARIO
      // (el contacto que queremos sacar del grupo). El backend lo
      // remueve de la cuenta principal y, si el secundario tenía su
      // propia cuenta standalone, la reactiva.
      await api.delete(`/cuentas/${miembro.contacto_partner_odoo_id}/desvincular`);
      toast.success("Contacto desvinculado");
      onChanged?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error al desvincular");
    }
  };

  const whatsappLink = miembro.whatsapp || miembro.mobile || miembro.phone;
  const whatsappClean = whatsappLink ? String(whatsappLink).replace(/\D/g, "") : null;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 transition-colors group ${miembro.is_principal ? "bg-amber-50/40" : "hover:bg-slate-50"}`}
      style={miembro.is_principal ? { borderLeft: "3px solid var(--clay)" } : undefined}
      data-testid={`contacto-row-${miembro.contacto_partner_odoo_id}`}
    >
      {/* Avatar iniciales */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0"
        style={{
          background: miembro.is_principal ? "rgba(181,70,42,.15)" : "var(--paper-2)",
          color: miembro.is_principal ? "var(--clay-deep)" : "var(--ink-2)",
          fontFamily: "var(--font-display)",
        }}
      >
        {initialsOf(miembro.name)}
      </div>

      {/* Cuerpo */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-sm text-slate-900 truncate">
            {miembro.name || "Sin nombre"}
          </span>
          {miembro.is_principal && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
              style={{
                background: "rgba(22,163,74,.12)",
                color: "#15803D",
                letterSpacing: "0.06em",
              }}
              data-testid="badge-principal"
            >
              Principal
            </span>
          )}
          {miembro.rol && rolColor && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
              style={{
                background: rolColor.bg,
                color: rolColor.fg,
                letterSpacing: "0.06em",
              }}
              data-testid="badge-rol"
            >
              {miembro.rol}
            </span>
          )}
        </div>
        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
          {miembro.city && <span>{miembro.city}</span>}
          {miembro.vat && (
            <>
              {miembro.city && <span className="text-slate-300">·</span>}
              <span className="font-mono text-[10px]">{formatDoc(miembro.vat)}</span>
            </>
          )}
          {whatsappClean && (
            <>
              <span className="text-slate-300">·</span>
              <a
                href={`https://wa.me/${whatsappClean}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-emerald-600 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                <MessageCircle size={11} />
                {miembro.whatsapp || miembro.mobile || miembro.phone}
              </a>
            </>
          )}
        </div>
      </div>

      {/* Métrica */}
      <div className="text-right shrink-0">
        <div className="text-sm font-bold font-mono text-slate-900">
          {fmtMoneyShort(miembro.estimado_mensual)}<span className="text-slate-400 font-normal">/mes</span>
        </div>
        <div className="text-[9px] text-slate-400 font-mono uppercase tracking-wider mt-0.5">
          {miembro.orders_12m} ped/12m
        </div>
      </div>

      {/* Acción desvincular (solo no principales) */}
      {!miembro.is_principal && (
        <button
          onClick={desvincular}
          className="w-7 h-7 rounded hover:bg-red-100 text-red-600 flex items-center justify-center shrink-0 opacity-30 group-hover:opacity-100 transition-opacity"
          title="Desvincular"
          data-testid={`btn-unlink-${miembro.contacto_partner_odoo_id}`}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

export default VinculadosTab;
