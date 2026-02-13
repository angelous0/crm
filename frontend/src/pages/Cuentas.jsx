import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { toast } from "sonner";
import { Search, Users, Loader2, ChevronLeft, ChevronRight, Eye } from "lucide-react";

const ESTADOS = ["", "NUEVO", "ACTIVO", "SEGUIMIENTO", "DORMIDO", "NO_VOLVER"];
const CLASIFICACIONES = ["", "A", "B", "C"];

const estadoColors = {
  NUEVO: "bg-blue-50 text-blue-700 border-blue-200",
  ACTIVO: "bg-emerald-50 text-emerald-700 border-emerald-200",
  SEGUIMIENTO: "bg-amber-50 text-amber-700 border-amber-200",
  DORMIDO: "bg-slate-100 text-slate-600 border-slate-200",
  NO_VOLVER: "bg-red-50 text-red-700 border-red-200",
};

export default function Cuentas() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState("");
  const [clasificacion, setClasificacion] = useState("");
  const [loading, setLoading] = useState(false);
  const limit = 50;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/cuentas", {
        params: { search, estado, clasificacion, page, limit }
      });
      setItems(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      toast.error("Error al cargar cuentas");
    } finally {
      setLoading(false);
    }
  }, [search, estado, clasificacion, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div data-testid="cuentas-page">
      <div className="px-8 py-6 border-b border-border bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-slate-900">Cuentas</h1>
            <p className="text-sm text-slate-500 mt-1">Cuentas libres (cliente principal = el mismo)</p>
          </div>
          <Badge variant="secondary" className="text-sm">{total} cuentas libres</Badge>
        </div>
      </div>

      <div className="p-8">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <Input
              data-testid="cuentas-search"
              placeholder="Buscar por nombre, DNI/RUC..."
              className="pl-9"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <Select value={estado || "ALL"} onValueChange={(v) => { setEstado(v === "ALL" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-[180px]" data-testid="cuentas-estado-filter">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los estados</SelectItem>
              {ESTADOS.filter(Boolean).map(e => (
                <SelectItem key={e} value={e}>{e}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={clasificacion || "ALL"} onValueChange={(v) => { setClasificacion(v === "ALL" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-[160px]" data-testid="cuentas-clasificacion-filter">
              <SelectValue placeholder="Clasificacion" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas</SelectItem>
              {CLASIFICACIONES.filter(Boolean).map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="rounded-md border border-border bg-white overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead>Nombre</TableHead>
                <TableHead>DNI/RUC</TableHead>
                <TableHead>Telefono</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Clasificacion</TableHead>
                <TableHead>Asignado a</TableHead>
                <TableHead>Ciudad</TableHead>
                <TableHead className="w-[80px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-slate-500">
                    <Users className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    No se encontraron cuentas
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow
                    key={item.cuenta_partner_odoo_id}
                    className="cursor-pointer"
                    data-testid={`cuenta-row-${item.cuenta_partner_odoo_id}`}
                    onClick={() => navigate(`/cuentas/${item.cuenta_partner_odoo_id}`)}
                  >
                    <TableCell className="font-medium text-slate-900">{item.partner_nombre || `ID: ${item.cuenta_partner_odoo_id}`}</TableCell>
                    <TableCell className="text-slate-600 font-mono text-sm">{item.partner_vat || "-"}</TableCell>
                    <TableCell className="text-slate-600">{item.partner_phone || item.partner_mobile || "-"}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${estadoColors[item.estado_comercial] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                        {item.estado_comercial}
                      </span>
                    </TableCell>
                    <TableCell>
                      {item.clasificacion ? (
                        <Badge variant="outline">{item.clasificacion}</Badge>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-slate-600">{item.asignado_a || "-"}</TableCell>
                    <TableCell className="text-slate-600">{item.partner_city || "-"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" data-testid={`ver-cuenta-${item.cuenta_partner_odoo_id}`}>
                        <Eye size={16} />
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
    </div>
  );
}
