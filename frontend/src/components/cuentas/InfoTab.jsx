/**
 * InfoTab — Perfil rico de la cuenta (Sprint CRM-D4 v2 — visual prototipo Hilo).
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────┐
 *   │ Crédito y pago               40 % usado             │
 *   │ ████████████░░░░░░░░░░                              │
 *   │ USADO S/4,800   DISPONIBLE S/7,200   LÍNEA S/12,000│
 *   │ Términos: 30 días · Canal: Boutique                 │
 *   └─────────────────────────────────────────────────────┘
 *   ┌─ Datos del negocio ──────[Editar perfil]────────────┐
 *   │ RUC/DNI: 20486512034    TELÉFONO: 984 221 305       │
 *   │ TIPO: Boutique          PAÍS: Perú                  │
 *   │ DEPARTAMENTO: Cusco     DISTRITO: Wanchaq           │
 *   │ DIRECCIÓN: Av. La Cultura  VENDEDOR: Diego R.       │
 *   └─────────────────────────────────────────────────────┘
 *
 * Modo edit: los Field se reemplazan por inputs/selects, botones [Guardar][Cancelar].
 * Campos sincronizados desde Odoo (name/vat) NO son editables en este tab.
 */
import React, { useEffect, useState, useCallback, useMemo } from "react";
import api from "@/lib/api";
import { formatDoc } from "@/lib/docTipo";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Phone, MessageCircle, Mail, Loader2,
  UserPlus, Edit3, Save, X as XIcon, AlertCircle, Building2,
} from "lucide-react";
import { VincularContactoModal } from "@/components/cuentas/modals/VincularContactoModal";
import { DEPARTAMENTOS_PE, DEPARTAMENTOS_BO, CANALES, TIPOS_NEGOCIO, normalizeDepartamento, normalizeFromList } from "@/components/cuentas/perfil-options";
import { useUbigeo } from "@/hooks/useUbigeo";

const fmtMoney = (n) =>
  "S/ " + Number(n || 0).toLocaleString("es-PE", { maximumFractionDigits: 0 });

// ── Helpers de display ────────────────────────────────────
function FieldView({ label, children, className = "" }) {
  return (
    <div className={`flex flex-col gap-1 min-w-0 ${className}`}>
      <span className="text-[10px] uppercase tracking-[0.14em] text-slate-400 font-mono font-medium">{label}</span>
      <div className="text-sm text-slate-900 font-semibold truncate">
        {children || <span className="text-slate-300 font-normal">—</span>}
      </div>
    </div>
  );
}

function FieldEdit({ label, children }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[10px] uppercase tracking-[0.14em] text-slate-400 font-mono font-medium">{label}</span>
      {children}
    </div>
  );
}

const inputCls = "h-9 px-3 rounded-md border border-slate-200 text-sm bg-white outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200 transition-colors";

// ── Crédito y pago ──────────────────────────────────────────
// El "USADO" se calcula automáticamente del saldo pendiente real
// (account_invoice_credit.amount_residual). La LÍNEA es manual (cap
// asignado por el negocio).
function CreditoCard({ cuenta }) {
  const linea = Number(cuenta?.credito_linea || 0);
  // Prioridad: valor calculado del backend > manual override > 0
  const usado = Number(
    cuenta?.credito_usado_real ?? cuenta?.credito_usado ?? 0
  );
  const dispo = Math.max(0, linea - usado);
  const pct = linea > 0 ? Math.min(100, Math.round((usado / linea) * 100)) : 0;
  const barColor = pct >= 90 ? "#DC2626" : pct >= 70 ? "#D97706" : "#16A34A";
  const terminosTxt = cuenta?.terminos_pago_dias ? `${cuenta.terminos_pago_dias} días` : "—";
  const canalTxt = cuenta?.canal_preferido || "—";

  if (linea === 0 && usado === 0) {
    return (
      <div className="border border-dashed border-slate-200 rounded-lg p-4 bg-slate-50 text-center">
        <div className="text-xs text-slate-500 font-mono uppercase tracking-wider mb-1">Crédito y pago</div>
        <div className="text-sm text-slate-400">Sin línea de crédito configurada · sin saldo pendiente</div>
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-lg p-4 bg-white">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-base font-semibold text-slate-900">Crédito y pago</h3>
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
          style={{ background: `${barColor}15`, color: barColor }}
          title={linea > 0 ? `${pct}% de la línea de crédito está usado` : "Sin línea de crédito"}
        >
          {linea > 0 ? `${pct} % usado` : "Sin línea"}
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
      <div className="flex items-baseline justify-between text-xs font-mono text-slate-500 uppercase tracking-wider">
        <span title="Saldo pendiente actual de facturas (calculado)">
          USADO <span className="text-slate-900 font-semibold ml-1">{fmtMoney(usado)}</span>
        </span>
        <span>DISPONIBLE <span className="text-slate-900 font-semibold ml-1">{fmtMoney(dispo)}</span></span>
        <span>LÍNEA <span className="text-slate-900 font-semibold ml-1">{fmtMoney(linea)}</span></span>
      </div>
      <div className="border-t border-slate-100 mt-3 pt-2.5 text-[12px] text-slate-600">
        <span>Términos de pago: <b className="text-slate-900">{terminosTxt}</b></span>
        <span className="text-slate-300 mx-2">·</span>
        <span>Canal preferido: <b className="text-slate-900">{canalTxt}</b></span>
        <span className="text-slate-300 mx-2">·</span>
        <span className="text-[10px] text-slate-400 italic">USADO calculado de facturas pendientes</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// InfoTab principal
// ─────────────────────────────────────────────────────────────
export function InfoTab({ partnerOdooId, cuenta, onChange }) {
  const [contactos, setContactos] = useState([]);
  const [loadingContactos, setLoadingContactos] = useState(true);
  const [error, setError] = useState(null);
  const [openVincular, setOpenVincular] = useState(false);

  // Modo edit + form local
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});

  const partner = cuenta?.partner || {};

  // D5: cascada depto → provincia → distrito. Cargamos el ubigeo del país
  // del form (default PE). Si el usuario cambia país en el form, recargamos.
  const paisForm = form.pais || cuenta?.pais
    || (partner.country_name === "Bolivia" ? "BO" : "PE");
  const { ubigeo, loading: ubigeoLoading } = useUbigeo(paisForm);

  // Opciones derivadas del ubigeo según la selección actual del form
  const deptosUbigeo = useMemo(() => {
    if (!ubigeo) return [];
    return Object.keys(ubigeo).sort();
  }, [ubigeo]);
  const provinciasUbigeo = useMemo(() => {
    if (!ubigeo || !form.departamento) return [];
    return Object.keys(ubigeo[form.departamento] || {}).sort();
  }, [ubigeo, form.departamento]);
  const distritosUbigeo = useMemo(() => {
    if (!ubigeo || !form.departamento || !form.provincia) return [];
    return (ubigeo[form.departamento]?.[form.provincia] || []).slice().sort();
  }, [ubigeo, form.departamento, form.provincia]);

  // Cuando el ubigeo carga y la provincia / distrito vienen de Odoo en
  // MAYÚSCULAS, normalizar al canónico Title Case del set.
  useEffect(() => {
    if (!editing || !ubigeo) return;
    setForm(f => {
      const updates = {};
      if (f.provincia && provinciasUbigeo.length > 0) {
        const canon = normalizeFromList(f.provincia, provinciasUbigeo);
        if (canon && canon !== f.provincia) updates.provincia = canon;
      }
      if (f.distrito && distritosUbigeo.length > 0) {
        const canon = normalizeFromList(f.distrito, distritosUbigeo);
        if (canon && canon !== f.distrito) updates.distrito = canon;
      }
      return Object.keys(updates).length ? { ...f, ...updates } : f;
    });
  }, [editing, ubigeo, provinciasUbigeo, distritosUbigeo]);

  // Inicializar form al abrir edit (combinando overrides CRM + datos Odoo como fallback)
  const startEdit = () => {
    const paisInicial = cuenta?.pais || "PE";
    // Normalizar el departamento de Odoo ("CUSCO") a la canónica de la lista ("Cusco")
    // para que el <select> haga match. Si ya hay override CRM, usar ese tal cual.
    const deptoInicial = cuenta?.departamento
      || normalizeDepartamento(partner.state_name, paisInicial)
      || "";
    setForm({
      telefono_crm:       cuenta?.telefono_crm || partner.phone || partner.mobile || "",
      whatsapp_crm:       cuenta?.whatsapp_crm || partner.mobile || "",
      tipo_negocio:       cuenta?.tipo_negocio || "",
      pais:               paisInicial,
      departamento:       deptoInicial,
      // D5: provincia heredada de Odoo si no hay override manual.
      // El nombre se normaliza al canónico cuando el ubigeo carga (efecto abajo).
      provincia:          cuenta?.provincia || partner.province_name || "",
      distrito:           cuenta?.distrito || partner.district_name || "",
      direccion_crm:      cuenta?.direccion_crm || partner.street || "",
      credito_linea:      cuenta?.credito_linea ?? "",
      // credito_usado ya no es editable manual (se calcula del saldo real)
      terminos_pago_dias: cuenta?.terminos_pago_dias ?? 30,
      canal_preferido:    cuenta?.canal_preferido || "",
      asignado_a:         cuenta?.asignado_a || "",
      cliente_desde:      cuenta?.cliente_desde || "",
    });
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setForm({});
  };

  const guardar = async () => {
    setSaving(true);
    try {
      const body = { ...form };
      // Normalizar números vacíos a null para no escribir 0 accidentalmente
      ["credito_linea", "credito_usado"].forEach((k) => {
        if (body[k] === "" || body[k] === null) body[k] = null;
        else body[k] = Number(body[k]);
      });
      if (body.terminos_pago_dias === "") body.terminos_pago_dias = null;
      if (body.cliente_desde === "") body.cliente_desde = null;
      // Strings vacíos los mando como null para limpiar el campo
      Object.keys(body).forEach((k) => {
        if (typeof body[k] === "string" && body[k].trim() === "") body[k] = null;
      });

      await api.put(`/cuentas/${partnerOdooId}`, body);
      // Autocrear local principal desde direccion/depto/distrito (idempotente)
      try {
        await api.post(`/cuentas/${partnerOdooId}/locales/autocreate`);
      } catch (_) {
        // best-effort: si falla el autocreate, no rompemos el flujo
      }
      toast.success("Perfil actualizado");
      setEditing(false);
      onChange?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const cargarContactos = useCallback(async () => {
    setLoadingContactos(true);
    setError(null);
    try {
      const r = await api.get(`/cuentas/${partnerOdooId}/contactos`);
      const items = Array.isArray(r.data) ? r.data : (r.data?.items || []);
      setContactos(items);
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setLoadingContactos(false);
    }
  }, [partnerOdooId]);

  useEffect(() => { cargarContactos(); }, [cargarContactos]);

  // Datos efectivos (override CRM + fallback Odoo, con normalización de departamento)
  // D5: agregado fallback al UBIGEO sincronizado de Odoo (district_name,
  // province_name, country_name) para provincia y distrito.
  const paisEfectivo = cuenta?.pais
    || (partner.country_name === "Bolivia" ? "BO" : "PE");
  const efectivos = {
    telefono:     cuenta?.telefono_crm || partner.phone || partner.mobile,
    whatsapp:     cuenta?.whatsapp_crm || partner.mobile,
    direccion:    cuenta?.direccion_crm || partner.street,
    departamento: cuenta?.departamento
                  || normalizeDepartamento(partner.state_name, paisEfectivo)
                  || partner.state_name,  // último fallback raw
    pais:         paisEfectivo,
    pais_nombre:  partner.country_name,
    distrito:     cuenta?.distrito || partner.district_name,
    provincia:    partner.province_name,
    zip:          partner.zip,
    tipo_negocio: cuenta?.tipo_negocio,
    canal:        cuenta?.canal_preferido,
  };

  const departamentosOptions = (form.pais === "BO") ? DEPARTAMENTOS_BO : DEPARTAMENTOS_PE;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* ─── Crédito y pago ─── */}
      <CreditoCard cuenta={cuenta} />

      {/* ─── Datos del negocio ─── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>
            Datos del negocio
          </h2>
          {editing ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={cancelEdit} disabled={saving} data-testid="perfil-cancel">
                <XIcon className="h-3.5 w-3.5 mr-1" /> Cancelar
              </Button>
              <Button size="sm" onClick={guardar} disabled={saving} data-testid="perfil-save">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                {saving ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={startEdit} data-testid="perfil-edit">
              <Edit3 className="h-3.5 w-3.5 mr-1" />
              Editar perfil
            </Button>
          )}
        </div>

        {!editing ? (
          <div className="grid grid-cols-2 gap-x-12 gap-y-5">
            <FieldView label="RUC / DNI">{partner.vat}</FieldView>
            <FieldView label="Teléfono">
              {efectivos.telefono ? (
                <a href={`tel:${efectivos.telefono}`} className="hover:underline inline-flex items-center gap-1.5">
                  {efectivos.telefono}
                  {efectivos.whatsapp && (
                    <a
                      href={`https://wa.me/${String(efectivos.whatsapp).replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-emerald-600"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                    </a>
                  )}
                </a>
              ) : null}
            </FieldView>

            <FieldView label="Tipo de negocio">{efectivos.tipo_negocio}</FieldView>

            <FieldView label="País">
              {efectivos.pais === "PE" ? "🇵🇪 Perú" : efectivos.pais === "BO" ? "🇧🇴 Bolivia" : efectivos.pais}
            </FieldView>
            <FieldView label="Departamento">{efectivos.departamento}</FieldView>

            <FieldView label="Provincia">{efectivos.provincia}</FieldView>
            <FieldView label="Distrito">{efectivos.distrito}</FieldView>

            <FieldView label="Dirección">
              {efectivos.direccion}
              {efectivos.zip && <span className="text-[10px] text-slate-400 ml-2 font-mono">CP {efectivos.zip}</span>}
            </FieldView>
            <FieldView label="Vendedor asignado">{cuenta?.asignado_a}</FieldView>
            <FieldView label="Canal preferido">{efectivos.canal}</FieldView>
            <FieldView label="Cliente desde">
              {cuenta?.cliente_desde_real ? (
                <>
                  {new Date(cuenta.cliente_desde_real).toLocaleDateString("es-PE", {
                    day: "2-digit", month: "long", year: "numeric"
                  })}
                  <span className="ml-2 text-[10px] text-slate-400">
                    ({Math.floor((Date.now() - new Date(cuenta.cliente_desde_real)) / (365.25 * 86400000))}+ años)
                  </span>
                </>
              ) : (
                <span className="text-slate-400 italic">Sin ventas registradas</span>
              )}
            </FieldView>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-12 gap-y-5">
            <FieldView label="RUC / DNI" className="opacity-70">{partner.vat}<span className="text-[10px] text-slate-400 ml-2 font-normal">(Odoo · solo lectura)</span></FieldView>
            <FieldEdit label="Teléfono">
              <input
                type="tel"
                className={inputCls}
                value={form.telefono_crm}
                onChange={(e) => setForm((f) => ({ ...f, telefono_crm: e.target.value }))}
                placeholder={partner.phone || ""}
                data-testid="edit-telefono"
              />
            </FieldEdit>

            <FieldEdit label="Tipo de negocio">
              <select
                className={inputCls}
                value={form.tipo_negocio}
                onChange={(e) => setForm((f) => ({ ...f, tipo_negocio: e.target.value }))}
                data-testid="edit-tipo-negocio"
              >
                <option value="">Sin especificar</option>
                {TIPOS_NEGOCIO.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </FieldEdit>

            <FieldEdit label="País">
              <select
                className={inputCls}
                value={form.pais}
                onChange={(e) => setForm((f) => ({ ...f, pais: e.target.value, departamento: "", provincia: "", distrito: "" }))}
                data-testid="edit-pais"
              >
                <option value="PE">🇵🇪 Perú</option>
                <option value="BO">🇧🇴 Bolivia</option>
              </select>
            </FieldEdit>
            <FieldEdit label={`Departamento${ubigeoLoading ? " (cargando…)" : ""}`}>
              <select
                className={inputCls}
                value={form.departamento}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  departamento: e.target.value,
                  // Reset cascada cuando cambia el padre
                  provincia: "",
                  distrito: "",
                }))}
                data-testid="edit-departamento"
              >
                <option value="">Sin especificar</option>
                {(deptosUbigeo.length > 0 ? deptosUbigeo : departamentosOptions)
                  .map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </FieldEdit>

            <FieldEdit label="Provincia">
              <select
                className={inputCls}
                value={form.provincia}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  provincia: e.target.value,
                  distrito: "",   // reset distrito al cambiar provincia
                }))}
                disabled={!form.departamento || provinciasUbigeo.length === 0}
                data-testid="edit-provincia"
              >
                <option value="">
                  {!form.departamento
                    ? "Elige departamento primero"
                    : provinciasUbigeo.length === 0
                      ? "Sin provincias disponibles"
                      : "Sin especificar"}
                </option>
                {provinciasUbigeo.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </FieldEdit>

            <FieldEdit label="Distrito">
              <select
                className={inputCls}
                value={form.distrito}
                onChange={(e) => setForm((f) => ({ ...f, distrito: e.target.value }))}
                disabled={!form.provincia || distritosUbigeo.length === 0}
                data-testid="edit-distrito"
              >
                <option value="">
                  {!form.provincia
                    ? "Elige provincia primero"
                    : distritosUbigeo.length === 0
                      ? "Sin distritos disponibles"
                      : "Sin especificar"}
                </option>
                {distritosUbigeo.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </FieldEdit>
            <FieldEdit label="Dirección">
              <input
                type="text"
                className={inputCls}
                value={form.direccion_crm}
                onChange={(e) => setForm((f) => ({ ...f, direccion_crm: e.target.value }))}
                placeholder={partner.street || ""}
                data-testid="edit-direccion"
              />
            </FieldEdit>

            <FieldEdit label="Vendedor asignado">
              <input
                type="text"
                className={inputCls}
                value={form.asignado_a}
                onChange={(e) => setForm((f) => ({ ...f, asignado_a: e.target.value }))}
                data-testid="edit-asignado"
                placeholder="Diego R."
              />
            </FieldEdit>
            <FieldEdit label="Canal preferido">
              <select
                className={inputCls}
                value={form.canal_preferido}
                onChange={(e) => setForm((f) => ({ ...f, canal_preferido: e.target.value }))}
                data-testid="edit-canal"
              >
                <option value="">Sin especificar</option>
                {CANALES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </FieldEdit>

            {/* Crédito y pago - solo Línea es editable (Usado se calcula automático) */}
            <FieldEdit label="Línea de crédito (S/)">
              <input
                type="number"
                className={inputCls}
                value={form.credito_linea}
                onChange={(e) => setForm((f) => ({ ...f, credito_linea: e.target.value }))}
                step="100"
                min="0"
                data-testid="edit-credito-linea"
              />
              <span className="text-[10px] text-slate-400 mt-1 italic">
                El "usado" se calcula automáticamente del saldo pendiente real
              </span>
            </FieldEdit>
            <FieldEdit label="Términos de pago (días)">
              <input
                type="number"
                className={inputCls}
                value={form.terminos_pago_dias}
                onChange={(e) => setForm((f) => ({ ...f, terminos_pago_dias: e.target.value }))}
                step="1"
                min="0"
                data-testid="edit-terminos"
              />
            </FieldEdit>
            <FieldEdit label="Cliente desde">
              <div className={`${inputCls} bg-slate-50 text-slate-600 flex items-center text-xs`}>
                {cuenta?.cliente_desde_real
                  ? new Date(cuenta.cliente_desde_real).toLocaleDateString("es-PE", {
                      day: "2-digit", month: "long", year: "numeric"
                    })
                  : "Sin ventas registradas"}
                <span className="ml-2 text-[10px] text-slate-400">(auto · primera venta vinculados)</span>
              </div>
            </FieldEdit>
          </div>
        )}
      </div>

      {/* ─── Notas ─── */}
      {cuenta?.notas && (
        <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-900">
          <div className="text-[10px] uppercase tracking-wider text-amber-600 mb-1 font-mono">Notas internas</div>
          {cuenta.notas}
        </div>
      )}

      {/* "Foto de la tienda" y "Contactos vinculados" se removieron de Info:
          - Vinculados tiene su propia pestaña dedicada (Tab "Vinculados")
          - Foto de tienda se manejará desde Locales cuando se necesite */}
    </div>
  );
}
