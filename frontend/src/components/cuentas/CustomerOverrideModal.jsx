import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, ArrowRight, Undo2 } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

export function CustomerOverrideModal({ order, onClose, onSaved }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [override, setOverride] = useState(null);
  const [loadingOverride, setLoadingOverride] = useState(true);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  // Load existing override
  useEffect(() => {
    (async () => {
      try {
        const r = await api.get(`/orders/${order.order_id}/override-customer`);
        setOverride(r.data?.override || null);
      } catch { /* ignore */ }
      finally { setLoadingOverride(false); }
    })();
  }, [order.order_id]);

  useEffect(() => {
    if (!loadingOverride) setTimeout(() => inputRef.current?.focus(), 100);
  }, [loadingOverride]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await api.get("/orders/search-customers", { params: { q: query, limit: 15 } });
        setResults(r.data?.items || []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.post(`/orders/${order.order_id}/override-customer`, {
        new_owner_partner_id: selected.id,
        reason: reason || null,
      });
      toast.success(`Orden reasignada a ${selected.nombre}`);
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error al reasignar");
    } finally { setSaving(false); }
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      await api.delete(`/orders/${order.order_id}/override-customer`);
      toast.success("Reasignacion eliminada");
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error al eliminar");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[520px]" data-testid="override-modal">
        <DialogHeader>
          <DialogTitle className="text-base">Reasignar cliente de orden</DialogTitle>
          <DialogDescription className="text-xs">
            Orden <span className="font-mono font-semibold">{order.order_name || order.order_id}</span>
            {order.owner_partner_name && (
              <> &mdash; Cliente actual: <span className="font-semibold">{order.owner_partner_name}</span></>
            )}
          </DialogDescription>
        </DialogHeader>

        {loadingOverride ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : (
          <div className="space-y-3">
            {override && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs" data-testid="existing-override">
                <div className="font-semibold text-amber-800 mb-1">Override activo</div>
                <div className="text-amber-700">
                  <span className="text-slate-500">{override.original_partner_name}</span>
                  <ArrowRight size={12} className="inline mx-1.5" />
                  <span className="font-semibold">{override.new_owner_partner_name}</span>
                </div>
                {override.reason && <div className="text-amber-600 mt-1">Motivo: {override.reason}</div>}
                <Button variant="outline" size="sm" className="mt-2 text-xs h-7 border-amber-300 text-amber-700 hover:bg-amber-100"
                  onClick={handleRemove} disabled={saving} data-testid="remove-override-btn">
                  {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Undo2 size={12} className="mr-1" />}
                  Restaurar cliente original
                </Button>
              </div>
            )}

            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar cuenta por nombre o RUC..."
                className="pl-9 text-sm h-9" data-testid="search-customer-input" />
            </div>

            <div className="max-h-[220px] overflow-y-auto border border-slate-200 rounded-lg" data-testid="customer-results">
              {searching ? (
                <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
              ) : results.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-400">
                  {query.length >= 2 ? "Sin resultados" : "Escribe al menos 2 caracteres"}
                </div>
              ) : results.map((c) => (
                <div key={c.id}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-xs border-b last:border-b-0 transition-colors
                    ${selected?.id === c.id ? "bg-blue-50 border-blue-200" : "hover:bg-slate-50"}`}
                  onClick={() => setSelected(c)} data-testid={`customer-option-${c.id}`}>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800 truncate">{c.nombre}</div>
                    <div className="text-slate-400">{c.vat || "Sin RUC"}{c.ciudad ? ` · ${c.ciudad}` : ""}</div>
                  </div>
                  {selected?.id === c.id && (
                    <span className="shrink-0 text-[9px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">SELECCIONADO</span>
                  )}
                </div>
              ))}
            </div>

            {selected && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
                <div className="text-slate-500 mb-1">Reasignar a:</div>
                <div className="font-semibold text-slate-800">{selected.nombre}</div>
                <Input value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="Motivo (opcional)" className="mt-2 text-xs h-8" data-testid="override-reason-input" />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs" data-testid="override-cancel-btn">Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={!selected || saving}
            className="text-xs bg-blue-600 hover:bg-blue-700" data-testid="override-save-btn">
            {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ArrowRight size={12} className="mr-1" />}
            Reasignar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
