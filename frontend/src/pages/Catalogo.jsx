import React, { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { toast } from "sonner";
import { Search, Package, Loader2, ChevronLeft, ChevronRight, Layers, ArrowUpDown } from "lucide-react";

export default function Catalogo() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [marca, setMarca] = useState("");
  const [tipo, setTipo] = useState("");
  const [tela, setTela] = useState("");
  const [entalle, setEntalle] = useState("");
  const [stockMin, setStockMin] = useState(0);
  const [orden, setOrden] = useState("stock");
  const [loading, setLoading] = useState(false);
  const [marcas, setMarcas] = useState([]);
  const [tipos, setTipos] = useState([]);

  // Variant detail
  const [showVariantes, setShowVariantes] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [variantes, setVariantes] = useState([]);
  const [variantesLoading, setVariantesLoading] = useState(false);

  const limit = 50;

  useEffect(() => {
    // Load filter options
    api.get("/catalogo/marcas").then(r => setMarcas(r.data || [])).catch(() => {});
    api.get("/catalogo/tipos").then(r => setTipos(r.data || [])).catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { search, page, limit, orden };
      if (marca) params.marca = marca;
      if (tipo) params.tipo = tipo;
      if (tela) params.tela = tela;
      if (entalle) params.entalle = entalle;
      if (stockMin > 0) params.stock_min = stockMin;
      const res = await api.get("/catalogo", { params });
      setItems(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      toast.error("Error al cargar catalogo");
    } finally {
      setLoading(false);
    }
  }, [search, page, marca, tipo, tela, entalle, stockMin, orden]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openVariantes = async (product) => {
    setSelectedProduct(product);
    setShowVariantes(true);
    setVariantesLoading(true);
    try {
      const res = await api.get(`/catalogo/${product.product_tmpl_id}/variantes`);
      setVariantes(res.data || []);
    } catch (err) {
      toast.error("Error al cargar variantes");
    } finally {
      setVariantesLoading(false);
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
              Catalogo
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Productos elegibles con stock disponible
            </p>
          </div>
          <Badge variant="secondary" className="text-sm">
            {total} productos con stock
          </Badge>
        </div>
      </div>

      <div className="p-8">
        {/* Search + Filters Row 1 */}
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <Input
              data-testid="catalogo-search"
              placeholder="Buscar por nombre, marca, tipo, tela..."
              className="pl-9"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <Select value={marca || "ALL"} onValueChange={(v) => { setMarca(v === "ALL" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-[180px]" data-testid="catalogo-marca-filter">
              <SelectValue placeholder="Marca" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas las marcas</SelectItem>
              {marcas.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={tipo || "ALL"} onValueChange={(v) => { setTipo(v === "ALL" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-[180px]" data-testid="catalogo-tipo-filter">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los tipos</SelectItem>
              {tipos.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Filters Row 2 */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-slate-500 uppercase tracking-wider font-semibold whitespace-nowrap">Tela</Label>
            <Input
              data-testid="catalogo-tela-filter"
              placeholder="Filtrar tela..."
              className="w-[140px] h-9 text-sm"
              value={tela}
              onChange={(e) => { setTela(e.target.value); setPage(1); }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-slate-500 uppercase tracking-wider font-semibold whitespace-nowrap">Entalle</Label>
            <Input
              data-testid="catalogo-entalle-filter"
              placeholder="Filtrar entalle..."
              className="w-[140px] h-9 text-sm"
              value={entalle}
              onChange={(e) => { setEntalle(e.target.value); setPage(1); }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-slate-500 uppercase tracking-wider font-semibold whitespace-nowrap">Stock min</Label>
            <Input
              data-testid="catalogo-stock-min"
              type="number"
              min={0}
              className="w-[100px] h-9 text-sm"
              value={stockMin || ""}
              onChange={(e) => { setStockMin(parseInt(e.target.value) || 0); setPage(1); }}
              placeholder="0"
            />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Label className="text-xs text-slate-500 uppercase tracking-wider font-semibold whitespace-nowrap">Orden</Label>
            <Select value={orden} onValueChange={(v) => { setOrden(v); setPage(1); }}>
              <SelectTrigger className="w-[160px] h-9" data-testid="catalogo-orden">
                <ArrowUpDown size={14} className="mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stock">Mayor stock</SelectItem>
                <SelectItem value="nombre">Nombre A-Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-md border border-border bg-white overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50 hover:bg-slate-50/80">
                <TableHead>Nombre</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Tela</TableHead>
                <TableHead>Entalle</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Variantes</TableHead>
                <TableHead className="w-[90px]">Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-slate-500">
                    <Package className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    No se encontraron productos con stock
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.product_tmpl_id} data-testid={`producto-row-${item.product_tmpl_id}`}>
                    <TableCell className="font-medium text-slate-900 max-w-[250px] truncate">
                      {item.nombre}
                    </TableCell>
                    <TableCell className="text-slate-600 text-sm">{item.marca || "-"}</TableCell>
                    <TableCell className="text-slate-600 text-sm">{item.tipo || "-"}</TableCell>
                    <TableCell className="text-slate-600 text-sm">{item.tela || "-"}</TableCell>
                    <TableCell className="text-slate-600 text-sm">{item.entalle || "-"}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {item.list_price != null ? `$${Number(item.list_price).toFixed(2)}` : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`font-mono text-sm font-semibold ${
                        Number(item.stock_total_disponible) > 10
                          ? "text-emerald-700"
                          : Number(item.stock_total_disponible) > 3
                            ? "text-amber-700"
                            : "text-red-600"
                      }`}>
                        {Math.round(Number(item.stock_total_disponible))}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-slate-500">
                      {item.variantes_con_stock}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => openVariantes(item)}
                        data-testid={`ver-variantes-${item.product_tmpl_id}`}
                      >
                        <Layers size={16} className="mr-1" /> Ver
                      </Button>
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

      {/* Variantes Dialog */}
      <Dialog open={showVariantes} onOpenChange={setShowVariantes}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {selectedProduct?.nombre}
              <span className="text-sm font-normal text-slate-500 ml-2">
                - Variantes con stock
              </span>
            </DialogTitle>
          </DialogHeader>
          {selectedProduct && (
            <div className="mb-3 flex flex-wrap gap-2 text-xs">
              {selectedProduct.marca && <Badge variant="outline">{selectedProduct.marca}</Badge>}
              {selectedProduct.tipo && <Badge variant="outline">{selectedProduct.tipo}</Badge>}
              {selectedProduct.tela && <Badge variant="outline">{selectedProduct.tela}</Badge>}
              {selectedProduct.entalle && <Badge variant="outline">{selectedProduct.entalle}</Badge>}
              <Badge variant="secondary">
                Precio: ${Number(selectedProduct.list_price || 0).toFixed(2)}
              </Badge>
              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
                Stock total: {Math.round(Number(selectedProduct.stock_total_disponible))}
              </Badge>
            </div>
          )}
          <div className="rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead>Barcode</TableHead>
                  <TableHead>Talla</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead className="text-right">Disponible</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Reservado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variantesLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-20 text-center">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-slate-400" />
                    </TableCell>
                  </TableRow>
                ) : variantes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-16 text-center text-slate-500 text-sm">
                      Sin variantes disponibles
                    </TableCell>
                  </TableRow>
                ) : (
                  variantes.map((v, idx) => (
                    <TableRow key={idx} data-testid={`variante-row-${idx}`}>
                      <TableCell className="font-mono text-xs">{v.barcode || "-"}</TableCell>
                      <TableCell className="text-sm">{v.talla || "-"}</TableCell>
                      <TableCell className="text-sm">{v.color || "-"}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold text-emerald-700">
                        {Math.round(Number(v.available_qty))}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-slate-600">
                        {Math.round(Number(v.stock_total || 0))}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-slate-400">
                        {Math.round(Number(v.reserved_qty || 0))}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
