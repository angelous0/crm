import React, { useState, useEffect } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, MessageSquare, PhoneCall, Footprints, StickyNote } from "lucide-react";
import { toast } from "sonner";

const TIPO_INTERACCION = ["WHATSAPP", "LLAMADA", "VISITA", "NOTA"];

export function InteraccionesTab({ cuentaId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ tipo: "WHATSAPP", resumen: "", resultado: "" });

  useEffect(() => {
    setLoading(true);
    api.get(`/cuentas/${cuentaId}/interacciones`).then(r => setItems(r.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, [cuentaId]);

  const handleCreate = async () => {
    try {
      await api.post(`/cuentas/${cuentaId}/interacciones`, form);
      const r = await api.get(`/cuentas/${cuentaId}/interacciones`);
      setItems(r.data || []);
      setShowDialog(false);
      setForm({ tipo: "WHATSAPP", resumen: "", resultado: "" });
      toast.success("Interaccion registrada");
    } catch { toast.error("Error"); }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;

  const iconMap = { WHATSAPP: MessageSquare, LLAMADA: PhoneCall, VISITA: Footprints, NOTA: StickyNote };
  const colorMap = { WHATSAPP: "text-green-600", LLAMADA: "text-blue-600", VISITA: "text-amber-600", NOTA: "text-slate-600" };

  return (
    <div data-testid="section-interacciones">
      <div className="mb-3">
        <Button size="sm" onClick={() => setShowDialog(true)} data-testid="add-interaccion-btn"><Plus size={14} className="mr-1" />Nueva interaccion</Button>
      </div>
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="text-center py-8 text-slate-500 border rounded-md bg-white text-xs">Sin interacciones</div>
        ) : items.map(i => {
          const Icon = iconMap[i.tipo] || StickyNote;
          return (
            <div key={i.id} className="bg-white border rounded-md p-3 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Icon size={14} className={colorMap[i.tipo] || "text-slate-600"} />
                <Badge variant="outline" className="text-[10px]">{i.tipo}</Badge>
                <span className="text-[10px] text-slate-400 ml-auto">{new Date(i.fecha).toLocaleString('es')}</span>
              </div>
              <p className="text-xs text-slate-900">{i.resumen}</p>
              {i.resultado && <p className="text-[10px] text-slate-500 mt-0.5">Resultado: {i.resultado}</p>}
            </div>
          );
        })}
      </div>
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva interaccion</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Tipo</Label><Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TIPO_INTERACCION.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Resumen</Label><Textarea value={form.resumen} onChange={e => setForm(f => ({ ...f, resumen: e.target.value }))} placeholder="Describe la interaccion..." /></div>
            <div><Label>Resultado</Label><Input value={form.resultado} onChange={e => setForm(f => ({ ...f, resultado: e.target.value }))} placeholder="Resultado (opcional)" /></div>
          </div>
          <DialogFooter><Button onClick={handleCreate} data-testid="save-interaccion-btn">Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
