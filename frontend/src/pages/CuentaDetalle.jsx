import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowLeft, Save, Loader2, Phone, Mail, MapPin,
  MessageSquare, PhoneCall, Footprints, StickyNote, Plus
} from "lucide-react";

const ESTADOS = ["NUEVO", "ACTIVO", "SEGUIMIENTO", "DORMIDO", "NO_VOLVER"];
const CLASIFICACIONES = ["A", "B", "C"];
const TIPO_INTERACCION = ["WHATSAPP", "LLAMADA", "VISITA", "NOTA"];
const TIPO_TAREA = ["LLAMAR", "WHATSAPP", "VISITAR", "COBRANZA", "POSTVENTA"];

export default function CuentaDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [cuenta, setCuenta] = useState(null);
  const [contactos, setContactos] = useState([]);
  const [interacciones, setInteracciones] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({});

  // Dialog states
  const [showInteraccion, setShowInteraccion] = useState(false);
  const [showTarea, setShowTarea] = useState(false);
  const [interaccionForm, setInteraccionForm] = useState({ tipo: "WHATSAPP", resumen: "", resultado: "" });
  const [tareaForm, setTareaForm] = useState({ tipo: "LLAMAR", due_at: "", prioridad: 3, descripcion: "" });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [cRes, ctRes, iRes, tRes, vRes] = await Promise.all([
          api.get(`/cuentas/${id}`),
          api.get(`/cuentas/${id}/contactos`),
          api.get(`/cuentas/${id}/interacciones`),
          api.get(`/cuentas/${id}/tareas`),
          api.get(`/cuentas/${id}/ventas`).catch(() => ({ data: { items: [] } }))
        ]);
        setCuenta(cRes.data);
        setEditForm({
          estado_comercial: cRes.data.estado_comercial,
          clasificacion: cRes.data.clasificacion || "",
          asignado_a: cRes.data.asignado_a || "",
          notas: cRes.data.notas || ""
        });
        setContactos(ctRes.data || []);
        setInteracciones(iRes.data || []);
        setTareas(tRes.data || []);
        setVentas(vRes.data?.items || []);
      } catch (err) {
        toast.error("Error al cargar cuenta");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put(`/cuentas/${id}`, editForm);
      setCuenta(prev => ({ ...prev, ...res.data }));
      toast.success("Cuenta actualizada");
    } catch (err) {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateInteraccion = async () => {
    try {
      await api.post(`/cuentas/${id}/interacciones`, interaccionForm);
      const res = await api.get(`/cuentas/${id}/interacciones`);
      setInteracciones(res.data || []);
      setShowInteraccion(false);
      setInteraccionForm({ tipo: "WHATSAPP", resumen: "", resultado: "" });
      toast.success("Interaccion registrada");
    } catch (err) {
      toast.error("Error al crear interaccion");
    }
  };

  const handleCreateTarea = async () => {
    try {
      await api.post(`/cuentas/${id}/tareas`, tareaForm);
      const res = await api.get(`/cuentas/${id}/tareas`);
      setTareas(res.data || []);
      setShowTarea(false);
      setTareaForm({ tipo: "LLAMAR", due_at: "", prioridad: 3, descripcion: "" });
      toast.success("Tarea creada");
    } catch (err) {
      toast.error("Error al crear tarea");
    }
  };

  const handleCompletarTarea = async (tareaId) => {
    try {
      await api.put(`/tareas/${tareaId}/completar`);
      const res = await api.get(`/cuentas/${id}/tareas`);
      setTareas(res.data || []);
      toast.success("Tarea completada");
    } catch (err) {
      toast.error("Error");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!cuenta) return null;

  const partner = cuenta.partner || {};
  const partnerName = partner.name || `Cuenta #${cuenta.cuenta_partner_odoo_id}`;

  return (
    <div data-testid="cuenta-detalle-page">
      {/* Header */}
      <div className="px-8 py-6 border-b border-border bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/cuentas")} data-testid="back-to-cuentas">
            <ArrowLeft size={16} />
          </Button>
          <div className="flex-1">
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-slate-900">{partnerName}</h1>
            <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
              {partner.phone && <span className="flex items-center gap-1"><Phone size={14} />{partner.phone}</span>}
              {partner.email && <span className="flex items-center gap-1"><Mail size={14} />{partner.email}</span>}
              {partner.city && <span className="flex items-center gap-1"><MapPin size={14} />{partner.city}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="p-8">
        <div className="grid grid-cols-12 gap-8">
          {/* Left: Edit form */}
          <div className="col-span-12 lg:col-span-4">
            <div className="bg-white rounded-lg border border-border shadow-sm p-6 space-y-4 sticky top-[100px]">
              <h3 className="font-heading font-medium text-lg text-slate-900">Datos comerciales</h3>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs uppercase tracking-wider font-semibold text-slate-500">Estado</Label>
                  <Select value={editForm.estado_comercial} onValueChange={v => setEditForm(f => ({ ...f, estado_comercial: v }))}>
                    <SelectTrigger data-testid="edit-estado"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ESTADOS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider font-semibold text-slate-500">Clasificacion</Label>
                  <Select value={editForm.clasificacion || "NONE"} onValueChange={v => setEditForm(f => ({ ...f, clasificacion: v === "NONE" ? "" : v }))}>
                    <SelectTrigger data-testid="edit-clasificacion"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">Sin clasificar</SelectItem>
                      {CLASIFICACIONES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider font-semibold text-slate-500">Asignado a</Label>
                  <Input
                    data-testid="edit-asignado"
                    value={editForm.asignado_a}
                    onChange={e => setEditForm(f => ({ ...f, asignado_a: e.target.value }))}
                    placeholder="Nombre del vendedor"
                  />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider font-semibold text-slate-500">Notas</Label>
                  <Textarea
                    data-testid="edit-notas"
                    value={editForm.notas}
                    onChange={e => setEditForm(f => ({ ...f, notas: e.target.value }))}
                    rows={3}
                    placeholder="Notas sobre esta cuenta..."
                  />
                </div>
                <Button onClick={handleSave} disabled={saving} className="w-full" data-testid="save-cuenta-btn">
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2" size={16} />}
                  Guardar
                </Button>
              </div>
            </div>
          </div>

          {/* Right: Tabs */}
          <div className="col-span-12 lg:col-span-8">
            <Tabs defaultValue="contactos">
              <TabsList className="mb-4" data-testid="cuenta-tabs">
                <TabsTrigger value="contactos">Contactos ({contactos.length})</TabsTrigger>
                <TabsTrigger value="ventas">Ventas ({ventas.length})</TabsTrigger>
                <TabsTrigger value="interacciones">Interacciones ({interacciones.length})</TabsTrigger>
                <TabsTrigger value="tareas">Tareas ({tareas.length})</TabsTrigger>
              </TabsList>

              {/* Contactos Tab */}
              <TabsContent value="contactos">
                <div className="rounded-md border border-border bg-white overflow-hidden shadow-sm">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/50">
                        <TableHead>Nombre</TableHead>
                        <TableHead>Telefono</TableHead>
                        <TableHead>WhatsApp</TableHead>
                        <TableHead>Rol</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contactos.length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="h-20 text-center text-slate-500">Sin contactos</TableCell></TableRow>
                      ) : contactos.map(c => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{c.partner_nombre || `ID: ${c.contacto_partner_odoo_id}`}</TableCell>
                          <TableCell>{c.partner_phone || c.partner_mobile || "-"}</TableCell>
                          <TableCell>{c.whatsapp || "-"}</TableCell>
                          <TableCell>{c.rol || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              {/* Ventas Tab */}
              <TabsContent value="ventas">
                <div className="rounded-md border border-border bg-white overflow-hidden shadow-sm">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/50">
                        <TableHead>Fecha</TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead>Cant.</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ventas.length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="h-20 text-center text-slate-500">Sin ventas filtradas</TableCell></TableRow>
                      ) : ventas.map((v, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm">{v.date_order ? new Date(v.date_order).toLocaleDateString('es') : "-"}</TableCell>
                          <TableCell className="font-medium">{v.barcode || v.product_id || "-"}</TableCell>
                          <TableCell>{v.qty}</TableCell>
                          <TableCell className="text-right font-mono">${Number(v.price_subtotal || 0).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              {/* Interacciones Tab */}
              <TabsContent value="interacciones">
                <div className="mb-4">
                  <Button size="sm" onClick={() => setShowInteraccion(true)} data-testid="add-interaccion-btn">
                    <Plus size={16} className="mr-1" /> Nueva interaccion
                  </Button>
                </div>
                <div className="space-y-3">
                  {interacciones.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 border rounded-md bg-white">Sin interacciones</div>
                  ) : interacciones.map(i => (
                    <div key={i.id} className="bg-white border rounded-md p-4 shadow-sm" data-testid={`interaccion-${i.id}`}>
                      <div className="flex items-center gap-2 mb-2">
                        {i.tipo === "WHATSAPP" && <MessageSquare size={16} className="text-green-600" />}
                        {i.tipo === "LLAMADA" && <PhoneCall size={16} className="text-blue-600" />}
                        {i.tipo === "VISITA" && <Footprints size={16} className="text-amber-600" />}
                        {i.tipo === "NOTA" && <StickyNote size={16} className="text-slate-600" />}
                        <Badge variant="outline" className="text-xs">{i.tipo}</Badge>
                        <span className="text-xs text-slate-400 ml-auto">
                          {new Date(i.fecha).toLocaleString('es')}
                        </span>
                      </div>
                      <p className="text-sm text-slate-900">{i.resumen}</p>
                      {i.resultado && <p className="text-xs text-slate-500 mt-1">Resultado: {i.resultado}</p>}
                    </div>
                  ))}
                </div>
              </TabsContent>

              {/* Tareas Tab */}
              <TabsContent value="tareas">
                <div className="mb-4">
                  <Button size="sm" onClick={() => setShowTarea(true)} data-testid="add-tarea-btn">
                    <Plus size={16} className="mr-1" /> Nueva tarea
                  </Button>
                </div>
                <div className="rounded-md border border-border bg-white overflow-hidden shadow-sm">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/50">
                        <TableHead>Tipo</TableHead>
                        <TableHead>Descripcion</TableHead>
                        <TableHead>Vence</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Accion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tareas.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="h-20 text-center text-slate-500">Sin tareas</TableCell></TableRow>
                      ) : tareas.map(t => (
                        <TableRow key={t.id} data-testid={`tarea-${t.id}`}>
                          <TableCell><Badge variant="outline" className="text-xs">{t.tipo}</Badge></TableCell>
                          <TableCell className="max-w-[200px] truncate">{t.descripcion}</TableCell>
                          <TableCell className="text-sm">{new Date(t.due_at).toLocaleDateString('es')}</TableCell>
                          <TableCell>
                            <Badge variant={t.status === "HECHO" ? "default" : t.status === "PENDIENTE" ? "secondary" : "destructive"} className="text-xs">
                              {t.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {t.status === "PENDIENTE" && (
                              <Button size="sm" variant="outline" onClick={() => handleCompletarTarea(t.id)} data-testid={`completar-tarea-${t.id}`}>
                                Completar
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Interaccion Dialog */}
      <Dialog open={showInteraccion} onOpenChange={setShowInteraccion}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva interaccion</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo</Label>
              <Select value={interaccionForm.tipo} onValueChange={v => setInteraccionForm(f => ({ ...f, tipo: v }))}>
                <SelectTrigger data-testid="interaccion-tipo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPO_INTERACCION.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Resumen</Label>
              <Textarea
                data-testid="interaccion-resumen"
                value={interaccionForm.resumen}
                onChange={e => setInteraccionForm(f => ({ ...f, resumen: e.target.value }))}
                placeholder="Describe la interaccion..."
              />
            </div>
            <div>
              <Label>Resultado</Label>
              <Input
                data-testid="interaccion-resultado"
                value={interaccionForm.resultado}
                onChange={e => setInteraccionForm(f => ({ ...f, resultado: e.target.value }))}
                placeholder="Resultado (opcional)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreateInteraccion} data-testid="save-interaccion-btn">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tarea Dialog */}
      <Dialog open={showTarea} onOpenChange={setShowTarea}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva tarea</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo</Label>
              <Select value={tareaForm.tipo} onValueChange={v => setTareaForm(f => ({ ...f, tipo: v }))}>
                <SelectTrigger data-testid="tarea-tipo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPO_TAREA.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vencimiento</Label>
              <Input
                type="datetime-local"
                data-testid="tarea-due"
                value={tareaForm.due_at}
                onChange={e => setTareaForm(f => ({ ...f, due_at: e.target.value }))}
              />
            </div>
            <div>
              <Label>Prioridad (1-5)</Label>
              <Input
                type="number" min={1} max={5}
                data-testid="tarea-prioridad"
                value={tareaForm.prioridad}
                onChange={e => setTareaForm(f => ({ ...f, prioridad: parseInt(e.target.value) || 3 }))}
              />
            </div>
            <div>
              <Label>Descripcion</Label>
              <Textarea
                data-testid="tarea-descripcion"
                value={tareaForm.descripcion}
                onChange={e => setTareaForm(f => ({ ...f, descripcion: e.target.value }))}
                placeholder="Descripcion de la tarea..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreateTarea} data-testid="save-tarea-btn">Crear tarea</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
