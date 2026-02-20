import React, { useState, useEffect } from "react";
import api from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

const TIPO_TAREA = ["LLAMAR", "WHATSAPP", "VISITAR", "COBRANZA", "POSTVENTA"];

export function TareasTab({ cuentaId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ tipo: "LLAMAR", due_at: "", prioridad: 3, descripcion: "" });

  useEffect(() => {
    setLoading(true);
    api.get(`/cuentas/${cuentaId}/tareas`).then(r => setItems(r.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, [cuentaId]);

  const handleCreate = async () => {
    try {
      await api.post(`/cuentas/${cuentaId}/tareas`, form);
      const r = await api.get(`/cuentas/${cuentaId}/tareas`);
      setItems(r.data || []);
      setShowDialog(false);
      setForm({ tipo: "LLAMAR", due_at: "", prioridad: 3, descripcion: "" });
      toast.success("Tarea creada");
    } catch { toast.error("Error"); }
  };

  const handleCompletar = async (id) => {
    try {
      await api.put(`/tareas/${id}/completar`);
      const r = await api.get(`/cuentas/${cuentaId}/tareas`);
      setItems(r.data || []);
      toast.success("Tarea completada");
    } catch { toast.error("Error"); }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;

  return (
    <div data-testid="section-tareas">
      <div className="mb-3">
        <Button size="sm" onClick={() => setShowDialog(true)} data-testid="add-tarea-btn"><Plus size={14} className="mr-1" />Nueva tarea</Button>
      </div>
      <div className="rounded-md border border-slate-200 bg-white overflow-hidden shadow-sm">
        <Table>
          <TableHeader><TableRow className="bg-slate-50/50">
            <TableHead className="text-xs">Tipo</TableHead>
            <TableHead className="text-xs">Descripcion</TableHead>
            <TableHead className="text-xs">Vence</TableHead>
            <TableHead className="text-xs">Status</TableHead>
            <TableHead className="text-xs">Accion</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="h-16 text-center text-slate-500 text-xs">Sin tareas</TableCell></TableRow>
            ) : items.map(t => (
              <TableRow key={t.id}>
                <TableCell><Badge variant="outline" className="text-[10px]">{t.tipo}</Badge></TableCell>
                <TableCell className="max-w-[200px] truncate text-xs">{t.descripcion}</TableCell>
                <TableCell className="text-xs">{new Date(t.due_at).toLocaleDateString('es')}</TableCell>
                <TableCell><Badge variant={t.status === "HECHO" ? "default" : t.status === "PENDIENTE" ? "secondary" : "destructive"} className="text-[10px]">{t.status}</Badge></TableCell>
                <TableCell>{t.status === "PENDIENTE" && <Button size="sm" variant="outline" className="text-[10px] h-6" onClick={() => handleCompletar(t.id)}>Completar</Button>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva tarea</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Tipo</Label><Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TIPO_TAREA.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Vencimiento</Label><Input type="datetime-local" value={form.due_at} onChange={e => setForm(f => ({ ...f, due_at: e.target.value }))} /></div>
            <div><Label>Prioridad (1-5)</Label><Input type="number" min={1} max={5} value={form.prioridad} onChange={e => setForm(f => ({ ...f, prioridad: parseInt(e.target.value) || 3 }))} /></div>
            <div><Label>Descripcion</Label><Textarea value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Descripcion..." /></div>
          </div>
          <DialogFooter><Button onClick={handleCreate} data-testid="save-tarea-btn">Crear tarea</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
