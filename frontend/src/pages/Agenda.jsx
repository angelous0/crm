import React, { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { CalendarClock, Loader2, ChevronLeft, ChevronRight, Check, X } from "lucide-react";

const STATUSES = ["", "PENDIENTE", "HECHO", "VENCIDO", "CANCELADO"];

const statusColors = {
  PENDIENTE: "bg-amber-50 text-amber-700 border-amber-200",
  HECHO: "bg-emerald-50 text-emerald-700 border-emerald-200",
  VENCIDO: "bg-red-50 text-red-700 border-red-200",
  CANCELADO: "bg-slate-100 text-slate-500 border-slate-200",
};

export default function Agenda() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("PENDIENTE");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [loading, setLoading] = useState(false);
  const limit = 50;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit };
      if (status) params.status = status;
      if (desde) params.desde = new Date(desde).toISOString();
      if (hasta) params.hasta = new Date(hasta).toISOString();
      const res = await api.get("/tareas", { params });
      setItems(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      toast.error("Error al cargar tareas");
    } finally {
      setLoading(false);
    }
  }, [status, desde, hasta, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCompletar = async (tareaId) => {
    try {
      await api.put(`/tareas/${tareaId}/completar`);
      toast.success("Tarea completada");
      fetchData();
    } catch (err) {
      toast.error("Error al completar tarea");
    }
  };

  const handleCancelar = async (tareaId) => {
    try {
      await api.put(`/tareas/${tareaId}/cancelar`);
      toast.success("Tarea cancelada");
      fetchData();
    } catch (err) {
      toast.error("Error al cancelar tarea");
    }
  };

  const totalPages = Math.ceil(total / limit);

  const isPastDue = (dueAt) => {
    return new Date(dueAt) < new Date();
  };

  return (
    <div data-testid="agenda-page">
      <div className="px-8 py-6 border-b border-border bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-slate-900">Agenda</h1>
            <p className="text-sm text-slate-500 mt-1">Tareas y seguimiento programado</p>
          </div>
          <Badge variant="secondary" className="text-sm">{total} tareas</Badge>
        </div>
      </div>

      <div className="p-8">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <Select value={status || "ALL"} onValueChange={(v) => { setStatus(v === "ALL" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-[180px]" data-testid="agenda-status-filter">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              {STATUSES.filter(Boolean).map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Desde</span>
            <Input
              type="date"
              data-testid="agenda-desde"
              className="w-[160px]"
              value={desde}
              onChange={(e) => { setDesde(e.target.value); setPage(1); }}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Hasta</span>
            <Input
              type="date"
              data-testid="agenda-hasta"
              className="w-[160px]"
              value={hasta}
              onChange={(e) => { setHasta(e.target.value); setPage(1); }}
            />
          </div>
        </div>

        {/* Table */}
        <div className="rounded-md border border-border bg-white overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead>Tipo</TableHead>
                <TableHead>Cuenta</TableHead>
                <TableHead>Descripcion</TableHead>
                <TableHead>Vence</TableHead>
                <TableHead>Prioridad</TableHead>
                <TableHead>Status</TableHead>
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
                    <CalendarClock className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    No hay tareas
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow
                    key={item.id}
                    className={item.status === "PENDIENTE" && isPastDue(item.due_at) ? "bg-red-50/30" : ""}
                    data-testid={`agenda-row-${item.id}`}
                  >
                    <TableCell><Badge variant="outline" className="text-xs">{item.tipo}</Badge></TableCell>
                    <TableCell className="font-medium text-slate-900">{item.cuenta_nombre || "-"}</TableCell>
                    <TableCell className="max-w-[250px] truncate text-slate-700">{item.descripcion}</TableCell>
                    <TableCell className={`text-sm ${item.status === "PENDIENTE" && isPastDue(item.due_at) ? "text-red-600 font-medium" : "text-slate-600"}`}>
                      {new Date(item.due_at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">{item.prioridad}</span>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${statusColors[item.status] || ""}`}>
                        {item.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      {item.status === "PENDIENTE" && (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost" size="sm"
                            className="text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50"
                            onClick={() => handleCompletar(item.id)}
                            data-testid={`completar-${item.id}`}
                          >
                            <Check size={16} />
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            className="text-slate-400 hover:text-red-600 hover:bg-red-50"
                            onClick={() => handleCancelar(item.id)}
                            data-testid={`cancelar-${item.id}`}
                          >
                            <X size={16} />
                          </Button>
                        </div>
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
