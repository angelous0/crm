import React, { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { toast } from "sonner";
import { Search, Package, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

export default function Catalogo() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const limit = 50;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/productos/elegibles", {
        params: { search, page, limit }
      });
      setItems(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      toast.error("Error al cargar productos");
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleApprove = async (odooId, currentApproved) => {
    const newVal = !currentApproved;
    // Optimistic update
    setItems(prev => prev.map(i =>
      i.odoo_id === odooId ? { ...i, aprobado: newVal } : i
    ));
    try {
      await api.post("/productos/aprobar", {
        product_tmpl_odoo_id: odooId,
        aprobado: newVal
      });
      toast.success(newVal ? "Producto aprobado" : "Producto desaprobado");
    } catch (err) {
      // Revert
      setItems(prev => prev.map(i =>
        i.odoo_id === odooId ? { ...i, aprobado: currentApproved } : i
      ));
      toast.error("Error al actualizar aprobacion");
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div data-testid="catalogo-page">
      {/* Header */}
      <div className="px-8 py-6 border-b border-border bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-slate-900">
              Catalogo - Aprobacion
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Gestiona que productos entran al CRM
            </p>
          </div>
          <Badge variant="secondary" className="text-sm">
            {total} productos elegibles
          </Badge>
        </div>
      </div>

      <div className="p-8">
        {/* Search */}
        <div className="relative mb-6 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <Input
            data-testid="catalogo-search"
            placeholder="Buscar por nombre, marca, tipo, tela..."
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        {/* Table */}
        <div className="rounded-md border border-border bg-white overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50 hover:bg-slate-50/80">
                <TableHead className="w-[60px]">Aprobado</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Tela</TableHead>
                <TableHead>Entalle</TableHead>
                <TableHead className="text-right">Precio</TableHead>
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
                    <Package className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    No se encontraron productos
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.odoo_id} data-testid={`producto-row-${item.odoo_id}`}>
                    <TableCell>
                      <Checkbox
                        data-testid={`aprobar-checkbox-${item.odoo_id}`}
                        checked={item.aprobado === true}
                        onCheckedChange={() => handleApprove(item.odoo_id, item.aprobado)}
                      />
                    </TableCell>
                    <TableCell className="font-medium text-slate-900 max-w-[300px] truncate">
                      {item.name}
                    </TableCell>
                    <TableCell className="text-slate-600">{item.marca || "-"}</TableCell>
                    <TableCell className="text-slate-600">{item.tipo || "-"}</TableCell>
                    <TableCell className="text-slate-600">{item.tela || "-"}</TableCell>
                    <TableCell className="text-slate-600">{item.entalle || "-"}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {item.list_price != null ? `$${Number(item.list_price).toFixed(2)}` : "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-slate-500">
              Pagina {page} de {totalPages} ({total} resultados)
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline" size="sm"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                data-testid="catalogo-prev-page"
              >
                <ChevronLeft size={16} />
              </Button>
              <Button
                variant="outline" size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                data-testid="catalogo-next-page"
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
