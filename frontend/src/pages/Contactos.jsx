import React, { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Search, UserCircle, Loader2, ChevronLeft, ChevronRight, Link2 } from "lucide-react";

export default function Contactos() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [showRelink, setShowRelink] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);
  const [newCuentaId, setNewCuentaId] = useState("");
  const limit = 50;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/contactos", { params: { search, page, limit } });
      setItems(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      toast.error("Error al cargar contactos");
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRelink = async () => {
    if (!newCuentaId || !selectedContact) return;
    try {
      await api.post(`/contactos/${selectedContact.id}/revincular`, {
        cuenta_partner_odoo_id: parseInt(newCuentaId)
      });
      toast.success("Contacto re-vinculado exitosamente");
      setShowRelink(false);
      setSelectedContact(null);
      setNewCuentaId("");
      fetchData();
    } catch (err) {
      toast.error("Error al re-vincular contacto");
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div data-testid="contactos-page">
      <div className="px-8 py-6 border-b border-border bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-slate-900">Contactos</h1>
            <p className="text-sm text-slate-500 mt-1">Gestion de contactos individuales</p>
          </div>
          <Badge variant="secondary" className="text-sm">{total} contactos</Badge>
        </div>
      </div>

      <div className="p-8">
        <div className="relative mb-6 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <Input
            data-testid="contactos-search"
            placeholder="Buscar contacto..."
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        <div className="rounded-md border border-border bg-white overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead>Nombre</TableHead>
                <TableHead>Telefono</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Cuenta (Odoo ID)</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-slate-500">
                    <UserCircle className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    No se encontraron contactos
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id} data-testid={`contacto-row-${item.id}`}>
                    <TableCell className="font-medium text-slate-900">
                      {item.partner_nombre || `ID: ${item.contacto_partner_odoo_id}`}
                    </TableCell>
                    <TableCell className="text-slate-600">{item.partner_phone || item.partner_mobile || "-"}</TableCell>
                    <TableCell className="text-slate-600">{item.partner_email || "-"}</TableCell>
                    <TableCell className="text-slate-600">{item.whatsapp || "-"}</TableCell>
                    <TableCell>{item.rol ? <Badge variant="outline" className="text-xs">{item.rol}</Badge> : "-"}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">{item.cuenta_partner_odoo_id}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => { setSelectedContact(item); setShowRelink(true); setNewCuentaId(""); }}
                        data-testid={`relink-btn-${item.id}`}
                      >
                        <Link2 size={16} className="mr-1" /> Re-vincular
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-slate-500">Pagina {page} de {totalPages}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft size={16} />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Re-link Dialog */}
      <Dialog open={showRelink} onOpenChange={setShowRelink}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-vincular contacto</DialogTitle>
            <DialogDescription>
              Cambia la cuenta principal a la que esta asociado este contacto.
              Contacto: {selectedContact?.partner_nombre || selectedContact?.contacto_partner_odoo_id}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nuevo cuenta_partner_odoo_id</Label>
              <Input
                data-testid="relink-cuenta-id"
                type="number"
                value={newCuentaId}
                onChange={e => setNewCuentaId(e.target.value)}
                placeholder="ID del partner cuenta en Odoo"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRelink(false)}>Cancelar</Button>
            <Button onClick={handleRelink} disabled={!newCuentaId} data-testid="confirm-relink-btn">
              Re-vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
