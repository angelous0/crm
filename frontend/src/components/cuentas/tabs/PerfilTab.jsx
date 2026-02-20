import React, { useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

const ESTADOS = ["NUEVO", "ACTIVO", "SEGUIMIENTO", "DORMIDO", "NO_VOLVER"];
const CLASIFICACIONES = ["A", "B", "C"];

export function PerfilTab({ cuentaId, cuenta, onUpdate }) {
  const [form, setForm] = useState({
    estado_comercial: cuenta?.estado_comercial || "ACTIVO",
    clasificacion: cuenta?.clasificacion || "",
    asignado_a: cuenta?.asignado_a || "",
    notas: cuenta?.notas || "",
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await api.put(`/cuentas/${cuentaId}`, form);
      if (onUpdate) onUpdate(prev => ({ ...prev, ...r.data }));
      toast.success("Cuenta actualizada");
    } catch { toast.error("Error al guardar"); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-lg space-y-3" data-testid="section-perfil">
      <h3 className="text-sm font-semibold text-slate-800">Datos comerciales</h3>
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 space-y-3">
        <div>
          <Label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Estado</Label>
          <Select value={form.estado_comercial} onValueChange={v => setForm(f => ({ ...f, estado_comercial: v }))}>
            <SelectTrigger data-testid="edit-estado" className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{ESTADOS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Clasificacion</Label>
          <Select value={form.clasificacion || "NONE"} onValueChange={v => setForm(f => ({ ...f, clasificacion: v === "NONE" ? "" : v }))}>
            <SelectTrigger data-testid="edit-clasificacion" className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">Sin clasificar</SelectItem>
              {CLASIFICACIONES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Asignado a</Label>
          <Input data-testid="edit-asignado" value={form.asignado_a} onChange={e => setForm(f => ({ ...f, asignado_a: e.target.value }))} placeholder="Nombre del vendedor" className="h-8 text-xs" />
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Notas</Label>
          <Textarea data-testid="edit-notas" value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} rows={3} placeholder="Notas..." className="text-xs" />
        </div>
        <Button onClick={handleSave} disabled={saving} className="w-full h-8 text-xs" data-testid="save-cuenta-btn">
          {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1" size={13} />}
          Guardar
        </Button>
      </div>
    </div>
  );
}
