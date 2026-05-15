/**
 * CorregirDrawer — drawer lateral para corregir SOLO los datos rotos de una
 * cuenta detectados por /admin/calidad-datos. Pensado para flujo rápido:
 *
 *   click "Corregir" en Calidad de datos
 *     → drawer slide-in (520px)
 *     → muestra header de la cuenta + 1 card por problema
 *     → para cada problema: input + botón "aplicar sugerencia" si existe
 *     → guardar → PUT /cuentas/{id} → cierra y refresca la lista
 *
 * No reemplaza la pestaña Info completa — esto es solo para limpiar entradas
 * sucias rápido, sin perder contexto de la tabla de calidad.
 */
import React, { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  X as XIcon, Loader2, Sparkles, Phone, MapPin, FileText,
  CircleAlert, AlertTriangle, CircleHelp, Check, ExternalLink,
} from "lucide-react";
import {
  DEPARTAMENTOS_PE, DEPARTAMENTOS_BO, normalizeDepartamento,
} from "@/components/cuentas/perfil-options";

const SEVERIDAD_STYLE = {
  critico:    { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-200",    dot: "bg-red-500",    Icon: CircleAlert,     label: "Crítico" },
  sucio:      { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200",  dot: "bg-amber-500",  Icon: AlertTriangle,   label: "Sucio" },
  incompleto: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", dot: "bg-purple-400", Icon: CircleHelp,      label: "Incompleto" },
};

// Mapa: rule → qué campo del form actualiza
const RULE_TO_FIELD = {
  sin_telefono:            { field: "telefono_crm", label: "Teléfono",        Icon: Phone, type: "tel"   },
  sin_departamento:        { field: "departamento", label: "Departamento",    Icon: MapPin, type: "depto" },
  depto_no_canonico:       { field: "departamento", label: "Departamento",    Icon: MapPin, type: "depto" },
  pais_o_ciudad_en_depto:  { field: "departamento", label: "Departamento",    Icon: MapPin, type: "depto", canSuggest: true },
  ruc_invalido:            { field: null,           label: "RUC / DNI",       Icon: FileText, type: "text", readonly: true,
                             help: "El RUC viene de Odoo — corrígelo allá y se sincronizará." },
  phone_caracteres_raros:  { field: "telefono_crm", label: "Teléfono",        Icon: Phone, type: "tel"   },
  nombre_test:             { field: null,           label: "Nombre",          Icon: FileText, type: "text", readonly: true,
                             help: "El nombre viene de Odoo — corrígelo allá." },
  sin_distrito:            { field: "distrito",     label: "Distrito",        Icon: MapPin, type: "text" },
  sin_vendedor_asignado:   { field: "asignado_a",   label: "Vendedor asignado", Icon: FileText, type: "text" },
  sin_direccion:           { field: "direccion_crm", label: "Dirección",      Icon: MapPin, type: "text" },
};

export function CorregirDrawer({ cuentaItem, onClose, onSaved }) {
  // Cargar el cuenta completo para conocer el valor actual de cada campo
  const [cuentaFull, setCuentaFull] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!cuentaItem) return;
    setLoading(true);
    api.get(`/cuentas/${cuentaItem.cuenta_partner_odoo_id}`)
      .then(r => {
        setCuentaFull(r.data);
        // Pre-llenar el form con valores actuales — incluye fallback al
        // UBIGEO sincronizado de Odoo (district_name, country_name) D5.
        const partner = r.data?.partner || {};
        const paisInit = r.data?.pais
          || (partner.country_name === "Bolivia" ? "BO" : "PE");
        const initial = {
          telefono_crm:  r.data?.telefono_crm  || partner.phone || partner.mobile || "",
          pais:          paisInit,
          departamento:  r.data?.departamento  || normalizeDepartamento(partner.state_name, paisInit) || "",
          distrito:      r.data?.distrito      || partner.district_name || "",
          direccion_crm: r.data?.direccion_crm || partner.street || "",
          asignado_a:    r.data?.asignado_a    || "",
        };
        setForm(initial);
      })
      .catch(e => toast.error("Error cargando cuenta: " + (e?.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [cuentaItem]);

  // ESC cierra
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Problemas únicos por rule (un problema → un input)
  const problemasUnicos = useMemo(() => {
    if (!cuentaItem?.problemas) return [];
    const seen = new Set();
    return cuentaItem.problemas.filter(p => {
      if (seen.has(p.rule)) return false;
      seen.add(p.rule);
      return true;
    });
  }, [cuentaItem]);

  const deptosOptions = form.pais === "BO" ? DEPARTAMENTOS_BO : DEPARTAMENTOS_PE;

  const aplicarSugerencia = (problema) => {
    const sug = problema?.sugerencia;
    if (!sug) return;
    const updates = {};
    if (sug.departamento) updates.departamento = sug.departamento;
    if (sug.distrito) updates.distrito = sug.distrito;
    if (sug.pais) updates.pais = sug.pais;
    setForm(f => ({ ...f, ...updates }));
    toast.success("Sugerencia aplicada — revisa y guarda");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Solo enviar campos que cambiaron / no estén vacíos
      const payload = {};
      ["telefono_crm", "pais", "departamento", "distrito",
       "direccion_crm", "asignado_a"].forEach(k => {
        if (form[k] != null) payload[k] = form[k];
      });
      await api.put(`/cuentas/${cuentaItem.cuenta_partner_odoo_id}`, payload);
      toast.success(`${cuentaItem.nombre} actualizado`);
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error("Error al guardar: " + (e?.response?.data?.detail || e.message));
    } finally {
      setSaving(false);
    }
  };

  if (!cuentaItem) return null;

  const sevStyle = SEVERIDAD_STYLE[cuentaItem.severidad];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[55]"
        style={{ background: "rgba(31,26,20,.40)", backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />
      {/* Drawer */}
      <aside
        className="fixed top-0 right-0 bottom-0 z-[56] bg-white shadow-2xl flex flex-col animate-in slide-in-from-right"
        style={{ width: "min(560px, 95vw)", borderLeft: "1px solid var(--line)" }}
        role="dialog"
        aria-modal="true"
        data-testid="corregir-drawer"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-mono mb-1 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" /> Corregir datos
              </div>
              <h3
                className="text-lg font-semibold text-slate-900 leading-tight truncate"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {cuentaItem.nombre || `#${cuentaItem.cuenta_partner_odoo_id}`}
              </h3>
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                {sevStyle && (
                  <Badge variant="outline" className={`text-[10px] font-semibold ${sevStyle.bg} ${sevStyle.text} ${sevStyle.border}`}>
                    <sevStyle.Icon className="h-3 w-3 mr-1" /> {sevStyle.label}
                  </Badge>
                )}
                {cuentaItem.tier && (
                  <Badge variant="outline" className="text-[10px] font-semibold bg-amber-50 text-amber-700 border-amber-200">
                    {cuentaItem.tier}
                  </Badge>
                )}
                <span className="text-[10px] text-slate-500 font-mono">
                  CL-{cuentaItem.cuenta_partner_odoo_id}
                </span>
                <a
                  href={`/cuentas/${cuentaItem.cuenta_partner_odoo_id}?tab=info`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-slate-500 hover:text-slate-900 inline-flex items-center gap-0.5 ml-auto"
                >
                  Vista completa <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-500 hover:text-slate-900 shrink-0"
              data-testid="corregir-drawer-close"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Cargando datos…
            </div>
          ) : problemasUnicos.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-400 italic">
              Sin problemas que corregir
            </div>
          ) : (
            <>
              {/* Selector de País (siempre visible si hay algún problema de depto) */}
              {problemasUnicos.some(p => ["sin_departamento", "depto_no_canonico", "pais_o_ciudad_en_depto"].includes(p.rule)) && (
                <div className="border border-slate-200 rounded-lg p-3">
                  <label className="text-[9px] uppercase tracking-[0.14em] font-mono text-slate-500 mb-2 block">
                    País
                  </label>
                  <div className="flex gap-1">
                    {["PE", "BO"].map(p => (
                      <button
                        key={p}
                        onClick={() => setForm(f => ({ ...f, pais: p, departamento: "" }))}
                        className={`flex-1 px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                          form.pais === p
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                        }`}
                        data-testid={`pais-${p}`}
                      >
                        {p === "PE" ? "🇵🇪 Perú" : "🇧🇴 Bolivia"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Una card por problema único */}
              {problemasUnicos.map(p => {
                const meta = RULE_TO_FIELD[p.rule] || {};
                const s = SEVERIDAD_STYLE[p.severidad];
                const Icon = meta.Icon || FileText;
                const fieldName = meta.field;
                const hasSugerencia = p.sugerencia && (p.sugerencia.departamento || p.sugerencia.distrito || p.sugerencia.pais);

                return (
                  <div
                    key={p.rule}
                    className={`border rounded-lg p-3 ${s.border} ${s.bg.replace('50','50/40')}`}
                    data-testid={`fix-card-${p.rule}`}
                  >
                    <div className="flex items-start gap-2 mb-2.5">
                      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${s.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className={`text-[11px] font-mono uppercase tracking-wider ${s.text}`}>
                          {p.label}
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5 leading-snug">
                          {p.detalle}
                        </div>
                      </div>
                    </div>

                    {meta.readonly ? (
                      <div className="bg-white border border-slate-200 rounded px-3 py-2 text-xs text-slate-500 italic">
                        {meta.help}
                      </div>
                    ) : meta.type === "depto" ? (
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                          <Icon className="h-3 w-3" /> {meta.label}
                        </label>
                        <select
                          value={form.departamento || ""}
                          onChange={(e) => setForm(f => ({ ...f, departamento: e.target.value }))}
                          className="w-full h-9 px-2 text-sm border border-slate-200 rounded bg-white focus:outline-none focus:border-slate-400"
                          data-testid="input-departamento"
                        >
                          <option value="">Seleccionar departamento…</option>
                          {deptosOptions.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                        {hasSugerencia && (
                          <button
                            onClick={() => aplicarSugerencia(p)}
                            className="w-full text-left text-[11px] text-slate-700 bg-white border border-slate-200 hover:border-slate-400 rounded px-2.5 py-1.5 flex items-center gap-1.5"
                            data-testid={`aplicar-sugerencia-${p.rule}`}
                          >
                            <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />
                            <span className="flex-1">
                              Sugerencia:{" "}
                              <b>{p.sugerencia.departamento || "—"}</b>
                              {p.sugerencia.distrito && <> · distrito <b>{p.sugerencia.distrito}</b></>}
                              {p.sugerencia.pais && <> · país <b>{p.sugerencia.pais}</b></>}
                            </span>
                            <Check className="h-3 w-3 shrink-0" />
                          </button>
                        )}
                      </div>
                    ) : fieldName ? (
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                          <Icon className="h-3 w-3" /> {meta.label}
                        </label>
                        <input
                          type={meta.type || "text"}
                          value={form[fieldName] || ""}
                          onChange={(e) => setForm(f => ({ ...f, [fieldName]: e.target.value }))}
                          placeholder={`Nuevo ${meta.label.toLowerCase()}…`}
                          className="w-full h-9 px-2 text-sm border border-slate-200 rounded bg-white focus:outline-none focus:border-slate-400"
                          data-testid={`input-${fieldName}`}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {/* Distrito extra cuando hay sugerencia que lo incluye */}
              {form.distrito != null && problemasUnicos.some(p => ["pais_o_ciudad_en_depto", "sin_distrito"].includes(p.rule)) === false && form.distrito && (
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/40">
                  <label className="text-[10px] text-slate-500 font-medium mb-1.5 flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Distrito (de la sugerencia)
                  </label>
                  <input
                    type="text"
                    value={form.distrito}
                    onChange={(e) => setForm(f => ({ ...f, distrito: e.target.value }))}
                    className="w-full h-9 px-2 text-sm border border-slate-200 rounded bg-white focus:outline-none focus:border-slate-400"
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer con Save */}
        <div className="px-5 py-3 border-t border-slate-100 shrink-0 bg-white flex items-center justify-between gap-3">
          <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">
            {problemasUnicos.length} {problemasUnicos.length === 1 ? "problema" : "problemas"} a corregir
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={loading || saving}
              data-testid="btn-guardar-correcciones"
              className="gap-1.5"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Guardar y cerrar
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}
