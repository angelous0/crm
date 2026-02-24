import React, { useState, useEffect, useCallback, useRef } from "react";
import api from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, UserPlus, Link2, ChevronLeft, ChevronRight, Power, EyeOff } from "lucide-react";
import { toast } from "sonner";

export function ContactosTab({ cuentaId }) {
  const [contactos, setContactos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [batchLoading, setBatchLoading] = useState(false);
  const [unlinkSearch, setUnlinkSearch] = useState("");
  const [unlinkResults, setUnlinkResults] = useState([]);
  const [unlinkTotal, setUnlinkTotal] = useState(0);
  const [unlinkPage, setUnlinkPage] = useState(1);
  const [unlinkLoading, setUnlinkLoading] = useState(false);
  const [soloDni, setSoloDni] = useState(false);
  const [soloTelefono, setSoloTelefono] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [target, setTarget] = useState(null);
  const [nota, setNota] = useState("");
  const [vincularLoading, setVincularLoading] = useState(false);
  const debounceRef = useRef(null);
  const pageSize = 20;

  useEffect(() => {
    setLoading(true);
    api.get(`/cuentas/${cuentaId}/contactos`, { params: { include_inactive: showInactive } }).then(r => setContactos(r.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, [cuentaId, showInactive]);

  const handleToggleContacto = async (c) => {
    const newActive = c.is_active === false;
    setTogglingId(c.contacto_partner_odoo_id);
    try {
      await api.patch(`/contactos/${c.contacto_partner_odoo_id}/active`, {
        is_active: newActive,
        reason: newActive ? null : "MANUAL",
      });
      const r = await api.get(`/cuentas/${cuentaId}/contactos`, { params: { include_inactive: showInactive } });
      setContactos(r.data || []);
      toast.success(newActive ? "Contacto activado" : "Contacto inactivado");
    } catch { toast.error("Error"); }
    finally { setTogglingId(null); }
  };

  const handleBatchToggle = async (activate) => {
    const ids = [...selected];
    if (!ids.length) return;
    setBatchLoading(true);
    try {
      const r = await api.patch("/contactos/batch-active", {
        ids, is_active: activate, reason: activate ? null : "MANUAL",
      });
      const d = r.data;
      toast.success(activate
        ? `${d.contactos_affected} contacto(s) activados`
        : `${d.contactos_affected} contacto(s) inactivados${d.cuentas_affected ? `, ${d.cuentas_affected} cuenta(s) en cascada` : ""}`
      );
      setSelected(new Set());
      const rr = await api.get(`/cuentas/${cuentaId}/contactos`, { params: { include_inactive: showInactive } });
      setContactos(rr.data || []);
    } catch { toast.error("Error en operacion masiva"); }
    finally { setBatchLoading(false); }
  };

  const toggleSelectOne = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === contactos.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(contactos.map(c => c.contacto_partner_odoo_id)));
    }
  };

  const fetchUnlinked = useCallback(async (q, pg, dni, tel) => {
    if (!q || q.length < 2) { setUnlinkResults([]); setUnlinkTotal(0); return; }
    setUnlinkLoading(true);
    try {
      const r = await api.get("/partners/unlinked", { params: { q, page: pg, pageSize, solo_dni: dni, solo_telefono: tel, exclude_cuenta: parseInt(cuentaId) || 0 } });
      setUnlinkResults(r.data.items || []);
      setUnlinkTotal(r.data.total || 0);
    } catch { toast.error("Error buscando"); }
    finally { setUnlinkLoading(false); }
  }, [cuentaId]);

  const handleSearch = (val) => {
    setUnlinkSearch(val);
    setUnlinkPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchUnlinked(val, 1, soloDni, soloTelefono), 300);
  };

  const handleVincular = async () => {
    if (!target) return;
    setVincularLoading(true);
    try {
      await api.post(`/cuentas/${cuentaId}/vincular-contacto`, { contacto_partner_odoo_id: target.odoo_id, nota: nota || null });
      toast.success(`${target.name} vinculado`);
      setShowConfirm(false);
      const r = await api.get(`/cuentas/${cuentaId}/contactos`);
      setContactos(r.data || []);
      setUnlinkResults(prev => prev.filter(p => p.odoo_id !== target.odoo_id));
    } catch (err) { toast.error(err.response?.data?.detail || "Error"); }
    finally { setVincularLoading(false); }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;

  return (
    <div data-testid="section-contactos">
      <div className="flex items-center gap-3 mb-3 bg-white border border-slate-200 rounded-lg px-4 py-2 shadow-sm">
        <div className="flex items-center gap-1.5">
          <Switch checked={showInactive} onCheckedChange={v => { setShowInactive(v); setSelected(new Set()); }} className="scale-[0.7]" data-testid="toggle-show-inactive-contactos" />
          <span className="text-[10px] text-slate-500 flex items-center gap-0.5"><EyeOff size={10} />Mostrar inactivos</span>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 mb-2 bg-slate-800 text-white text-[11px] rounded-lg animate-in slide-in-from-top duration-150" data-testid="bulk-contactos-bar">
          <span className="font-semibold">{selected.size} seleccionado(s)</span>
          <Button size="sm" variant="secondary" className="h-6 text-[10px] bg-red-600 hover:bg-red-700 text-white border-0"
            onClick={() => handleBatchToggle(false)} disabled={batchLoading} data-testid="bulk-deactivate-contactos">
            {batchLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Power size={11} className="mr-1" />}
            Inactivar ({selected.size})
          </Button>
          <Button size="sm" variant="secondary" className="h-6 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white border-0"
            onClick={() => handleBatchToggle(true)} disabled={batchLoading} data-testid="bulk-activate-contactos">
            <Power size={11} className="mr-1" />Activar ({selected.size})
          </Button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-[10px] text-slate-300 hover:text-white">Deseleccionar</button>
        </div>
      )}

      <div className="rounded-md border border-slate-200 bg-white overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/50">
              <TableHead className="w-[32px] px-1">
                <Checkbox checked={contactos.length > 0 && selected.size === contactos.length} onCheckedChange={toggleSelectAll} className="scale-[0.8]" data-testid="select-all-contactos" />
              </TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Telefono</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-[80px]">Accion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contactos.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="h-16 text-center text-slate-500 text-xs">Sin contactos</TableCell></TableRow>
            ) : contactos.map(c => {
              const isChecked = selected.has(c.contacto_partner_odoo_id);
              return (
              <TableRow key={c.contacto_partner_odoo_id} className={`${c.is_active === false ? "opacity-60" : ""} ${isChecked ? "bg-blue-50" : ""}`}>
                <TableCell className="px-1 w-[32px]">
                  <Checkbox checked={isChecked} onCheckedChange={() => toggleSelectOne(c.contacto_partner_odoo_id)} className="scale-[0.8]"
                    data-testid={`check-contacto-${c.contacto_partner_odoo_id}`} />
                </TableCell>
                <TableCell className="font-medium text-xs">
                  {c.partner_nombre || `ID: ${c.contacto_partner_odoo_id}`}
                  {c.is_principal && <Badge variant="outline" className="ml-1 text-[8px]">PRINCIPAL</Badge>}
                </TableCell>
                <TableCell className="text-xs">{c.partner_phone || c.partner_mobile || "-"}</TableCell>
                <TableCell className="text-xs">{c.whatsapp || "-"}</TableCell>
                <TableCell className="text-xs">{c.rol || "-"}</TableCell>
                <TableCell className="text-xs">
                  {c.is_active === false ? (
                    <Badge variant="destructive" className="text-[8px]">INACTIVO</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[8px] bg-emerald-100 text-emerald-700">ACTIVO</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={`text-[9px] h-6 px-1.5 ${c.is_active === false ? "text-emerald-600" : "text-red-500"}`}
                    onClick={() => handleToggleContacto(c)}
                    disabled={togglingId === c.contacto_partner_odoo_id}
                    data-testid={`toggle-contacto-${c.contacto_partner_odoo_id}`}
                  >
                    {togglingId === c.contacto_partner_odoo_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Power size={11} className="mr-0.5" />}
                    {c.is_active === false ? "Activar" : "Inactivar"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 bg-white rounded-lg border border-slate-200 shadow-sm" data-testid="vincular-contacto-section">
        <div className="p-3 border-b border-slate-200">
          <div className="flex items-center gap-2"><UserPlus size={16} className="text-slate-600" /><h4 className="font-medium text-sm">Vincular contacto existente</h4></div>
        </div>
        <div className="p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <Input placeholder="Buscar por nombre, DNI..." className="pl-8 text-xs h-8" value={unlinkSearch} onChange={e => handleSearch(e.target.value)} data-testid="vincular-search" />
            </div>
            <div className="flex items-center gap-1.5 border border-slate-200 rounded-md px-2 py-1">
              <Switch checked={soloDni} onCheckedChange={v => { setSoloDni(v); if (unlinkSearch.length >= 2) fetchUnlinked(unlinkSearch, 1, v, soloTelefono); }} className="scale-[0.8]" />
              <Label className="text-[10px] text-slate-600 cursor-pointer">DNI/RUC</Label>
            </div>
            <div className="flex items-center gap-1.5 border border-slate-200 rounded-md px-2 py-1">
              <Switch checked={soloTelefono} onCheckedChange={v => { setSoloTelefono(v); if (unlinkSearch.length >= 2) fetchUnlinked(unlinkSearch, 1, soloDni, v); }} className="scale-[0.8]" />
              <Label className="text-[10px] text-slate-600 cursor-pointer">Telefono</Label>
            </div>
          </div>
          {unlinkSearch.length >= 2 && (
            <div className="rounded-md border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader><TableRow className="bg-slate-50/50">
                  <TableHead className="text-xs">Nombre</TableHead><TableHead className="text-xs">DNI/RUC</TableHead>
                  <TableHead className="text-xs">Telefono</TableHead><TableHead className="text-xs">Ciudad</TableHead>
                  <TableHead className="text-xs w-[80px]">Accion</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {unlinkLoading ? (
                    <TableRow><TableCell colSpan={5} className="h-16 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto text-slate-400" /></TableCell></TableRow>
                  ) : unlinkResults.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="h-12 text-center text-slate-500 text-xs">Sin resultados</TableCell></TableRow>
                  ) : unlinkResults.map(p => (
                    <TableRow key={p.odoo_id}>
                      <TableCell className="text-xs font-medium">{p.name}</TableCell>
                      <TableCell className="text-xs font-mono">{p.vat || "-"}</TableCell>
                      <TableCell className="text-xs">{p.phone || p.mobile || "-"}</TableCell>
                      <TableCell className="text-xs">{p.city || "-"}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" className="text-[10px] h-6 px-2" onClick={() => { setTarget(p); setNota(""); setShowConfirm(true); }}>
                          <Link2 size={12} className="mr-1" />Vincular
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Vincular contacto</DialogTitle><DialogDescription>Vincular <strong>{target?.name}</strong></DialogDescription></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nota (opcional)" value={nota} onChange={e => setNota(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>Cancelar</Button>
            <Button onClick={handleVincular} disabled={vincularLoading}>{vincularLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Vincular</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
