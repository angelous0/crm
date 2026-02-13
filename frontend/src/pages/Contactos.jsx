import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Search, UserCircle, Loader2, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";

export default function Contactos() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [soloDni, setSoloDni] = useState(false);
  const [soloTelefono, setSoloTelefono] = useState(false);
  const [loading, setLoading] = useState(false);
  const limit = 50;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/contactos", {
        params: { search, page, limit, solo_dni: soloDni, solo_telefono: soloTelefono }
      });
      setItems(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      toast.error("Error al cargar contactos");
    } finally {
      setLoading(false);
    }
  }, [search, page, soloDni, soloTelefono]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div data-testid="contactos-page">
      <div className="px-8 py-6 border-b border-border bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-slate-900">Contactos</h1>
            <p className="text-sm text-slate-500 mt-1">Todos los partners del ODS (Odoo)</p>
          </div>
          <Badge variant="secondary" className="text-sm">{total} contactos</Badge>
        </div>
      </div>

      <div className="p-8">
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <Input
              data-testid="contactos-search"
              placeholder="Buscar por nombre, DNI/RUC, telefono..."
              className="pl-9"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <div className="flex items-center gap-2 border border-border rounded-md px-3 py-1.5">
            <Switch
              id="solo-dni-contactos"
              data-testid="contactos-solo-dni"
              checked={soloDni}
              onCheckedChange={(v) => { setSoloDni(v); setPage(1); }}
              className="scale-[0.85]"
            />
            <Label htmlFor="solo-dni-contactos" className="text-xs text-slate-600 cursor-pointer whitespace-nowrap">Solo con DNI/RUC</Label>
          </div>
          <div className="flex items-center gap-2 border border-border rounded-md px-3 py-1.5">
            <Switch
              id="solo-tel-contactos"
              data-testid="contactos-solo-telefono"
              checked={soloTelefono}
              onCheckedChange={(v) => { setSoloTelefono(v); setPage(1); }}
              className="scale-[0.85]"
            />
            <Label htmlFor="solo-tel-contactos" className="text-xs text-slate-600 cursor-pointer whitespace-nowrap">Solo con telefono</Label>
          </div>
        </div>

        <div className="rounded-md border border-border bg-white overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead>Nombre</TableHead>
                <TableHead>DNI/RUC</TableHead>
                <TableHead>Telefono</TableHead>
                <TableHead>Mobile</TableHead>
                <TableHead>Ciudad</TableHead>
                <TableHead>Cuenta asignada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                    <UserCircle className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    No se encontraron contactos
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.odoo_id} data-testid={`contacto-row-${item.odoo_id}`}>
                    <TableCell className="font-medium text-slate-900">{item.name || "-"}</TableCell>
                    <TableCell className="text-slate-600 font-mono text-sm">{item.vat || "-"}</TableCell>
                    <TableCell className="text-slate-600">{item.phone || "-"}</TableCell>
                    <TableCell className="text-slate-600">{item.mobile || "-"}</TableCell>
                    <TableCell className="text-slate-600">{item.city || "-"}</TableCell>
                    <TableCell>
                      {item.cuenta_nombre ? (
                        <button
                          className="inline-flex items-center gap-1 text-sm text-blue-700 hover:text-blue-900 hover:underline transition-colors"
                          onClick={() => navigate(`/cuentas/${item.cuenta_partner_odoo_id}`)}
                          data-testid={`ir-cuenta-${item.odoo_id}`}
                        >
                          {item.cuenta_nombre}
                          <ExternalLink size={12} />
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Libre (es su propia cuenta)</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-slate-500">Pagina {page} de {totalPages} ({total} resultados)</p>
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
    </div>
  );
}
