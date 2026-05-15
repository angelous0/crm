import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Loader2, ArrowLeft, Building2, Phone, AlertTriangle, ExternalLink, Info } from "lucide-react";
import { formatDoc } from "@/lib/docTipo";
import { toast } from "sonner";
import { usePartnersUnlinked } from "@/hooks/usePartnersUnlinked";

const ROLES = ["GERENTE", "COMPRADOR", "ALMACEN", "CAJA", "ADMINISTRACION", "OTRO"];

export function VincularContactoModal({ open, onClose, partnerOdooId, onSuccess }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null); // partner seleccionado
  const [rol, setRol] = useState("OTRO");
  const [whatsapp, setWhatsapp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [includeLinked, setIncludeLinked] = useState(false);

  const { items, total, loading } = usePartnersUnlinked(query, {
    enabled: open && !selected,
    includeLinked,
    excludeCuentaId: partnerOdooId,
  });

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(null);
      setRol("OTRO");
      setWhatsapp("");
      setIncludeLinked(false);
    }
  }, [open]);

  const seleccionar = (partner) => {
    setSelected(partner);
    setWhatsapp(partner.mobile || "");
  };

  const guardar = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await api.post(`/cuentas/${partnerOdooId}/vincular-contacto`, {
        contacto_partner_odoo_id: selected.odoo_id,
        rol: rol === "OTRO" ? null : rol,
        whatsapp: whatsapp.trim() || null,
      });
      toast.success("Contacto vinculado");
      onSuccess?.();
      onClose?.();
    } catch (err) {
      toast.error("No se pudo vincular: " + (err.response?.data?.detail || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && !v && onClose?.()}>
      <DialogContent className="max-w-2xl w-[95vw]" data-testid="modal-vincular-contacto">
        <DialogHeader>
          <DialogTitle className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
            Vincular contacto
          </DialogTitle>
        </DialogHeader>

        {!selected ? (
          /* Step 1: buscar */
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar partner por nombre o RUC..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9 h-9 text-sm"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] text-slate-500">
                {loading
                  ? "Buscando..."
                  : query
                    ? `${items.length} resultado${items.length === 1 ? "" : "s"}${items.length < total ? ` de ${total}` : ""}`
                    : `${total} partners disponibles. Escribí para filtrar.`}
              </div>
              <label className="text-[11px] text-slate-600 flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeLinked}
                  onChange={(e) => setIncludeLinked(e.target.checked)}
                  className="h-3 w-3 rounded border-slate-300"
                />
                Incluir ya vinculados
              </label>
            </div>

            {/* Hint cuando 0 resultados + no se buscó en vinculados aún */}
            {!loading && query && items.length === 0 && !includeLinked && (
              <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <div>
                  No aparece — capaz ya pertenece al grupo de otro cliente.
                  Marca <b>"Incluir ya vinculados"</b> para ver a quién apunta y poder navegar a su principal.
                </div>
              </div>
            )}

            {/* Lista resultados */}
            <div className="max-h-[300px] overflow-y-auto border rounded-md divide-y">
              {loading ? (
                <div className="flex items-center justify-center py-6 text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : items.length === 0 ? (
                <div className="px-3 py-4 text-sm text-slate-400 italic">
                  {query ? `Sin resultados para "${query}"` : "Empezá a escribir para buscar."}
                </div>
              ) : (
                items.map((p) => (
                  <ResultRow
                    key={p.odoo_id}
                    partner={p}
                    onSelect={() => seleccionar(p)}
                  />
                ))
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
            </DialogFooter>
          </div>
        ) : (
          /* Step 2: rol + whatsapp */
          <div className="space-y-3">
            <Button
              variant="ghost" size="sm"
              onClick={() => setSelected(null)}
              className="h-7 -ml-2 px-2 text-xs"
              disabled={submitting}
            >
              <ArrowLeft className="h-3 w-3 mr-1" />
              Cambiar contacto
            </Button>

            {/* Card del partner seleccionado */}
            <div className="border rounded-md p-3 bg-slate-50">
              <div className="text-sm font-semibold">{selected.name}</div>
              <div className="text-xs text-slate-500 mt-0.5 space-x-2">
                {selected.vat && <span>{formatDoc(selected)}</span>}
                {selected.city && <span>· {selected.city}</span>}
              </div>
              {selected.phone && (
                <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {selected.phone}
                </div>
              )}
            </div>

            {/* Warning si ya está vinculado a otra cuenta */}
            {selected.is_linked && (
              <div className="border border-amber-300 bg-amber-50 rounded-md p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 text-xs">
                  <div className="font-semibold text-amber-900">
                    Este partner ya pertenece a otra cuenta
                  </div>
                  <div className="text-amber-800 mt-1">
                    Actualmente está en <b>{selected.linked_cuenta_name || `#${selected.linked_cuenta_id}`}</b>.
                    Al vincularlo acá:
                  </div>
                  <ul className="text-amber-800 mt-1 list-disc pl-4 space-y-0.5">
                    <li>Se moverá a <b>esta cuenta</b> como contacto.</li>
                    {selected.sales_count > 0 && (
                      <li>Sus <b>{selected.sales_count} ventas históricas</b> empezarán a contarse acá.</li>
                    )}
                    <li>La cuenta anterior dejará de tenerlo (no se borra, solo se desvincula).</li>
                  </ul>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">
                Rol del contacto en la cuenta
                <span className="font-normal text-slate-400 ml-1">(opcional)</span>
              </Label>
              <Select value={rol} onValueChange={setRol} disabled={submitting}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="text-[10px] text-slate-500 mt-1">
                ¿Qué hace esta persona dentro del negocio? Sirve para saber a quién contactar según el caso.
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">WhatsApp <span className="text-slate-400 font-normal">(opcional)</span></Label>
              <Input
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="+51 999 888 777"
                className="h-9 text-sm"
                disabled={submitting}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={submitting}>Cancelar</Button>
              <Button onClick={guardar} disabled={submitting} data-testid="btn-vincular">
                {submitting && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                {submitting ? "Vinculando..." : "Vincular"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ───── Row de resultado en la búsqueda ─────
// Muestra cada partner con su estado_vinculo claramente diferenciado:
//   - solo:       sin badge, clickable para vincular normal
//   - orphan:     badge "Sin cuenta CRM", clickable
//   - principal:  badge "Principal de grupo", muestra cuántos vinculados tiene
//   - secundario: badge "En grupo de X", link "Ir al principal →" como acción
//                  informativa principal, vincular como acción secundaria
const ESTADO_BADGE = {
  solo:       null,
  orphan:     { label: "Sin cuenta CRM", bg: "bg-slate-100", fg: "text-slate-600" },
  principal:  { label: "Principal de grupo", bg: "bg-violet-100", fg: "text-violet-700" },
  secundario: { label: "Secundario", bg: "bg-amber-100", fg: "text-amber-700" },
};

function ResultRow({ partner, onSelect }) {
  const p = partner;
  const estado = p.estado_vinculo || (p.is_linked ? "secundario" : "solo");
  const badge = ESTADO_BADGE[estado];
  const cuentaName = p.cuenta_principal_name || p.linked_cuenta_name;
  const cuentaId = p.cuenta_principal_odoo_id || p.linked_cuenta_id;
  const esPropioPrincipal = cuentaId === p.odoo_id;

  return (
    <div className="px-3 py-2 hover:bg-slate-50 transition-colors">
      <div className="flex items-start gap-2">
        <Building2 className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium flex items-center gap-1.5 flex-wrap break-words">
            <span className="break-words">{p.name}</span>
            {badge && (
              <span className={`text-[9px] uppercase font-bold tracking-wider px-1 py-0.5 rounded ${badge.bg} ${badge.fg} flex-shrink-0`}>
                {badge.label}
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2 mt-0.5">
            {p.vat && <span>{formatDoc(p)}</span>}
            {p.city && <span>· {p.city}</span>}
            {p.phone && <span className="inline-flex items-center gap-0.5">· <Phone className="h-2.5 w-2.5" /> {p.phone}</span>}
            {p.sales_count > 0 && <span>· {p.sales_count} ventas</span>}
          </div>

          {/* Info de cuenta principal (cuando no es solo) */}
          {estado === "principal" && (
            <div className="text-[10px] text-violet-700 mt-1 flex items-center gap-1">
              <Info className="h-3 w-3" />
              Es principal de un grupo con {p.n_partners_en_cuenta} miembros
            </div>
          )}
          {estado === "secundario" && cuentaName && (
            <div className="text-[10px] text-amber-700 mt-1 flex items-center gap-1 flex-wrap">
              <Info className="h-3 w-3" />
              Pertenece al grupo de <b>{cuentaName}</b>
              {cuentaId && (
                <a
                  href={`/cuentas/${cuentaId}?tab=vinculados`}
                  className="ml-1 inline-flex items-center gap-0.5 text-amber-800 hover:text-amber-900 font-medium underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Ir al principal <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Acciones */}
      <div className="flex justify-end gap-2 mt-2">
        {(estado === "principal" || estado === "secundario") && cuentaId && !esPropioPrincipal && (
          <a
            href={`/cuentas/${cuentaId}?tab=vinculados`}
            className="text-[11px] px-2 py-1 rounded text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
            title="Abrir la cuenta principal de este grupo"
          >
            <ExternalLink className="h-3 w-3" /> Ver grupo
          </a>
        )}
        <button
          type="button"
          onClick={onSelect}
          className={`text-[11px] px-2 py-1 rounded font-medium inline-flex items-center gap-1 ${
            estado === "solo" || estado === "orphan"
              ? "bg-slate-900 text-white hover:bg-slate-800"
              : "border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
          }`}
        >
          Vincular aquí
        </button>
      </div>
    </div>
  );
}
