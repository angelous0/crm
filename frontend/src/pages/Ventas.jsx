import React, { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ShoppingCart, Loader2, ChevronLeft, ChevronRight, Search } from "lucide-react";

export default function Ventas() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [companyKey, setCompanyKey] = useState("");
  const [excluirCanceladas, setExcluirCanceladas] = useState(true);
  const [marca, setMarca] = useState("");
  const [tipo, setTipo] = useState("");
  const [tela, setTela] = useState("");
  const [entalle, setEntalle] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const limit = 100;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const params = { page, limit, excluir_canceladas: excluirCanceladas };
      if (desde) params.desde = new Date(desde).toISOString();
      if (hasta) params.hasta = new Date(hasta).toISOString();
      if (companyKey) params.company_key = companyKey;
      if (marca) params.marca = marca;
      if (tipo) params.tipo = tipo;
      if (tela) params.tela = tela;
      if (entalle) params.entalle = entalle;
      const res = await api.get("/ventas", { params });
      setItems(res.data.items || []);
      setTotal(res.data.total || 0);
      if (res.data.message) setMessage(res.data.message);
    } catch (err) {
      toast.error("Error al cargar ventas");
    } finally {
      setLoading(false);
    }
  }, [page, desde, hasta, companyKey, excluirCanceladas, marca, tipo, tela, entalle]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div data-testid="ventas-page">
      <div className="px-8 py-6 border-b border-border bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-slate-900">Ventas (Filtradas)</h1>
            <p className="text-sm text-slate-500 mt-1">Ventas POS de productos aprobados</p>
          </div>
          <Badge variant="secondary" className="text-sm">{total} registros</Badge>
        </div>
      </div>

      <div className="p-8">
        {message && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-700">
            {message}
          </div>
        )}

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div>
            <Label className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1 block">Empresa</Label>
            <Input
              data-testid="ventas-company"
              placeholder="Company key..."
              value={companyKey}
              onChange={(e) => { setCompanyKey(e.target.value); setPage(1); }}
            />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1 block">Desde</Label>
            <Input
              type="date"
              data-testid="ventas-desde"
              value={desde}
              onChange={(e) => { setDesde(e.target.value); setPage(1); }}
            />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1 block">Hasta</Label>
            <Input
              type="date"
              data-testid="ventas-hasta"
              value={hasta}
              onChange={(e) => { setHasta(e.target.value); setPage(1); }}
            />
          </div>
          <div className="flex items-end gap-2">
            <div className="flex items-center space-x-2">
              <Switch
                id="excluir-canceladas"
                data-testid="ventas-excluir-toggle"
                checked={excluirCanceladas}
                onCheckedChange={(v) => { setExcluirCanceladas(v); setPage(1); }}
              />
              <Label htmlFor="excluir-canceladas" className="text-sm">Excluir canceladas</Label>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Input
            data-testid="ventas-marca"
            placeholder="Marca..."
            value={marca}
            onChange={(e) => { setMarca(e.target.value); setPage(1); }}
          />
          <Input
            data-testid="ventas-tipo"
            placeholder="Tipo..."
            value={tipo}
            onChange={(e) => { setTipo(e.target.value); setPage(1); }}
          />
          <Input
            data-testid="ventas-tela"
            placeholder="Tela..."
            value={tela}
            onChange={(e) => { setTela(e.target.value); setPage(1); }}
          />
          <Input
            data-testid="ventas-entalle"
            placeholder="Entalle..."
            value={entalle}
            onChange={(e) => { setEntalle(e.target.value); setPage(1); }}
          />
        </div>

        {/* Table */}
        <div className="rounded-md border border-border bg-white overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead>Fecha</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Orden</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Talla</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead className="text-right">P.Unit</TableHead>
                  <TableHead className="text-right">Desc.%</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={12} className="h-32 text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="h-32 text-center text-slate-500">
                      <ShoppingCart className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                      No se encontraron ventas
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item, idx) => (
                    <TableRow key={idx} data-testid={`venta-row-${idx}`}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {item.date_order ? new Date(item.date_order).toLocaleDateString('es') : "-"}
                      </TableCell>
                      <TableCell className="text-xs">{item.company_key || "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{item.pos_order_id || "-"}</TableCell>
                      <TableCell className="font-medium text-sm max-w-[150px] truncate">{item.barcode || item.product_id || "-"}</TableCell>
                      <TableCell className="text-sm">{item.talla || "-"}</TableCell>
                      <TableCell className="text-sm">{item.color || "-"}</TableCell>
                      <TableCell className="text-sm">{item.marca || "-"}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{item.qty}</TableCell>
                      <TableCell className="text-right font-mono text-sm">${Number(item.price_unit || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{Number(item.discount || 0).toFixed(1)}%</TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium">${Number(item.price_subtotal || 0).toFixed(2)}</TableCell>
                      <TableCell>
                        {item.is_cancelled ? (
                          <Badge variant="destructive" className="text-xs">Cancelada</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">{item.state || "OK"}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-slate-500">Pagina {page} de {totalPages} ({total} registros)</p>
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
