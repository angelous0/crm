import React, { useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertTriangle, Users, UserCircle, Power } from "lucide-react";

export function InactivateNoSalesModal({ open, onClose, onDone }) {
  const [scope, setScope] = useState("ambos");
  const [months, setMonths] = useState("all");
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState(null);

  const reset = () => { setPreview(null); setResult(null); setScope("ambos"); setMonths("all"); };

  const handleClose = () => { reset(); onClose(); };

  const fetchPreview = useCallback(async () => {
    setLoading(true);
    setPreview(null);
    setResult(null);
    try {
      const params = { scope };
      if (months !== "all") params.months = parseInt(months);
      const r = await api.get("/maintenance/inactivate-no-sales/preview", { params });
      setPreview(r.data);
    } catch { toast.error("Error al obtener preview"); }
    finally { setLoading(false); }
  }, [scope, months]);

  const execute = async () => {
    setExecuting(true);
    try {
      const body = { scope, reason: "SIN_VENTAS" };
      if (months !== "all") body.months = parseInt(months);
      const r = await api.post("/maintenance/inactivate-no-sales", body);
      setResult(r.data);
      toast.success(`Inactivados: ${r.data.cuentas_affected} cuentas, ${r.data.contactos_affected} contactos`);
      if (onDone) onDone();
    } catch { toast.error("Error al ejecutar inactivacion"); }
    finally { setExecuting(false); }
  };

  const total = preview ? preview.cuentas_candidates + preview.contactos_candidates : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="inactivate-no-sales-modal">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Power size={16} className="text-red-500" />Inactivar registros sin ventas
          </DialogTitle>
          <DialogDescription className="text-xs">
            Inactiva cuentas y contactos que no tienen ventas registradas. Los contactos vinculados a una cuenta no se inactivaran.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            {/* Config */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium text-slate-700 mb-1 block">Alcance</label>
                <Select value={scope} onValueChange={(v) => { setScope(v); setPreview(null); }}>
                  <SelectTrigger className="h-8 text-xs" data-testid="scope-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ambos">Cuentas + Contactos</SelectItem>
                    <SelectItem value="cuentas">Solo Cuentas</SelectItem>
                    <SelectItem value="contactos">Solo Contactos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-slate-700 mb-1 block">Periodo</label>
                <Select value={months} onValueChange={(v) => { setMonths(v); setPreview(null); }}>
                  <SelectTrigger className="h-8 text-xs" data-testid="months-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todo el historial</SelectItem>
                    <SelectItem value="3">Sin ventas 3 meses</SelectItem>
                    <SelectItem value="6">Sin ventas 6 meses</SelectItem>
                    <SelectItem value="12">Sin ventas 12 meses</SelectItem>
                    <SelectItem value="24">Sin ventas 24 meses</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Preview button */}
            <Button variant="outline" size="sm" className="w-full text-xs h-8" onClick={fetchPreview} disabled={loading} data-testid="preview-btn">
              {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Ver preview
            </Button>

            {/* Preview results */}
            {preview && (
              <div className="space-y-3 animate-in fade-in duration-200" data-testid="preview-results">
                <div className="flex gap-3">
                  {(scope === "cuentas" || scope === "ambos") && (
                    <div className="flex-1 p-3 rounded-lg border border-slate-200 bg-slate-50">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Users size={13} className="text-slate-600" />
                        <span className="text-xs font-medium text-slate-700">Cuentas</span>
                      </div>
                      <span className="text-2xl font-bold text-slate-900" data-testid="preview-cuentas-count">
                        {preview.cuentas_candidates.toLocaleString("es-PE")}
                      </span>
                      <span className="text-[10px] text-slate-500 ml-1">a inactivar</span>
                    </div>
                  )}
                  {(scope === "contactos" || scope === "ambos") && (
                    <div className="flex-1 p-3 rounded-lg border border-slate-200 bg-slate-50">
                      <div className="flex items-center gap-1.5 mb-1">
                        <UserCircle size={13} className="text-slate-600" />
                        <span className="text-xs font-medium text-slate-700">Contactos</span>
                      </div>
                      <span className="text-2xl font-bold text-slate-900" data-testid="preview-contactos-count">
                        {preview.contactos_candidates.toLocaleString("es-PE")}
                      </span>
                      <span className="text-[10px] text-slate-500 ml-1">a inactivar</span>
                    </div>
                  )}
                </div>

                {/* Sample list */}
                {preview.sample_cuentas.length > 0 && (
                  <div>
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Muestra de cuentas</span>
                    <div className="mt-1 max-h-[120px] overflow-auto border border-slate-200 rounded-md bg-white">
                      {preview.sample_cuentas.map((s) => (
                        <div key={s.id} className="flex items-center gap-2 px-2.5 py-1.5 border-b border-slate-100 last:border-0 text-[11px]">
                          <span className="font-medium text-slate-800 truncate flex-1">{s.nombre}</span>
                          <span className="text-slate-400 font-mono text-[10px] shrink-0">{s.vat || "-"}</span>
                          <span className="text-slate-400 text-[10px] shrink-0 w-[70px] truncate text-right">{s.ciudad || "-"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {preview.sample_contactos.length > 0 && (
                  <div>
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Muestra de contactos</span>
                    <div className="mt-1 max-h-[100px] overflow-auto border border-slate-200 rounded-md bg-white">
                      {preview.sample_contactos.map((s) => (
                        <div key={s.id} className="flex items-center gap-2 px-2.5 py-1.5 border-b border-slate-100 last:border-0 text-[11px]">
                          <span className="font-medium text-slate-800 truncate flex-1">{s.nombre}</span>
                          <span className="text-slate-400 font-mono text-[10px] shrink-0">{s.vat || "-"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {total > 0 && (
                  <div className="flex items-start gap-2 p-2.5 rounded-md bg-amber-50 border border-amber-200">
                    <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                    <span className="text-[11px] text-amber-800">
                      Esta accion inactivara <strong>{total.toLocaleString("es-PE")}</strong> registro(s).
                      Esta operacion se puede revertir manualmente reactivando cada cuenta/contacto.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Result view */
          <div className="space-y-3 animate-in fade-in duration-200" data-testid="execution-result">
            <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
              <span className="text-sm font-semibold text-emerald-800">Operacion completada</span>
              <div className="flex justify-center gap-4 mt-2">
                <div className="text-center">
                  <span className="text-xl font-bold text-slate-900">{result.cuentas_affected}</span>
                  <span className="text-[10px] text-slate-500 block">cuentas</span>
                </div>
                <div className="text-center">
                  <span className="text-xl font-bold text-slate-900">{result.contactos_affected}</span>
                  <span className="text-[10px] text-slate-500 block">contactos</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {!result ? (
            <>
              <Button variant="outline" size="sm" onClick={handleClose} className="text-xs" data-testid="cancel-btn">Cancelar</Button>
              {preview && total > 0 && (
                <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white text-xs" disabled={executing}
                  onClick={execute} data-testid="execute-btn">
                  {executing && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                  Inactivar {total.toLocaleString("es-PE")} registro(s)
                </Button>
              )}
            </>
          ) : (
            <Button size="sm" onClick={handleClose} className="text-xs" data-testid="close-result-btn">Cerrar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
