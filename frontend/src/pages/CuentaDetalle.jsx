import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { OrderLinesDrawer, InvoiceLinesDrawer } from "@/components/DetailDrawers";
import {
  ArrowLeft, Save, Loader2, Phone, Mail, MapPin,
  MessageSquare, PhoneCall, Footprints, StickyNote, Plus,
  Search, UserPlus, Link2, ChevronLeft, ChevronRight
} from "lucide-react";

const ESTADOS = ["NUEVO", "ACTIVO", "SEGUIMIENTO", "DORMIDO", "NO_VOLVER"];
const CLASIFICACIONES = ["A", "B", "C"];
const TIPO_INTERACCION = ["WHATSAPP", "LLAMADA", "VISITA", "NOTA"];
const TIPO_TAREA = ["LLAMAR", "WHATSAPP", "VISITAR", "COBRANZA", "POSTVENTA"];

function fmtNum(n) { return Number(n || 0).toLocaleString("es-PE"); }
function fmtMoney(n) { return "S/ " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "-"; }

/* ── Ventas/Reservas sub-tab component ── */
function VentasCuentaTab({ data, loading, page, onPageChange }) {
  const items = data?.items || [];
  const hasNext = data?.has_next || false;
  const debug = data?.debug || {};

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="space-y-4" data-testid="ventas-cuenta-tab">
      {debug.partners_count === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800" data-testid="ventas-no-partner-msg">
          Esta cuenta no tiene partner Odoo vinculado (odoo_id: {debug.cuenta_partner_odoo_id})
        </div>
      )}

      {/* Detail table */}
      <div className="rounded-md border border-border bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead className="text-xs">Fecha</TableHead>
                <TableHead className="text-xs">Orden</TableHead>
                <TableHead className="text-xs">Modelo</TableHead>
                <TableHead className="text-xs">Marca</TableHead>
                <TableHead className="text-xs">Tipo</TableHead>
                <TableHead className="text-xs">Talla</TableHead>
                <TableHead className="text-xs">Color</TableHead>
                <TableHead className="text-xs text-right">Qty</TableHead>
                <TableHead className="text-xs text-right">P.Unit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="h-20 text-center text-slate-500">
                  {debug.partners_count === 0 ? "Sin partner vinculado" : "No hay ventas en el rango seleccionado"}
                </TableCell></TableRow>
              ) : items.map((v, i) => (
                <TableRow key={i} className={i % 2 ? "bg-slate-50/30" : ""}>
                  <TableCell className="text-xs whitespace-nowrap">{fmtDate(v.fecha)}</TableCell>
                  <TableCell className="text-xs font-mono text-slate-500">{v.order_id}</TableCell>
                  <TableCell className="text-xs font-medium truncate max-w-[120px]">{v.modelo_display || "-"}</TableCell>
                  <TableCell className="text-xs text-slate-500">{v.marca || "-"}</TableCell>
                  <TableCell className="text-xs text-slate-500">{v.tipo || "-"}</TableCell>
                  <TableCell className="text-xs">{v.talla || "-"}</TableCell>
                  <TableCell className="text-xs">{v.color || "-"}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{fmtNum(v.qty)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{fmtMoney(v.price_unit)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {(page > 1 || hasNext) && (
          <div className="flex items-center justify-between px-3 py-2 border-t text-xs text-slate-500">
            <span>Pagina {page}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} data-testid="ventas-prev-page">
                <ChevronLeft size={14} />
              </Button>
              <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => onPageChange(page + 1)} data-testid="ventas-next-page">
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Debug: partner count */}
      {debug.partners_count > 0 && (
        <p className="text-[10px] text-slate-400">Partners vinculados: {debug.partners_count} | IDs: {(debug.partner_ids || []).slice(0, 10).join(", ")}{debug.partner_ids?.length > 10 ? "..." : ""}</p>
      )}
    </div>
  );
}

export default function CuentaDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [cuenta, setCuenta] = useState(null);
  const [contactos, setContactos] = useState([]);
  const [interacciones, setInteracciones] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [ventas, setVentas] = useState({ metrics: {}, rows: [], has_next: false });
  const [ventasPage, setVentasPage] = useState(1);
  const [ventasDocTipo, setVentasDocTipo] = useState("SALE");
  const [ventasLoading, setVentasLoading] = useState(false);
  const [metrics, setMetrics] = useState({ sale: null, reserva: null, creditos: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({});

  // Dialog states
  const [showInteraccion, setShowInteraccion] = useState(false);
  const [showTarea, setShowTarea] = useState(false);
  const [interaccionForm, setInteraccionForm] = useState({ tipo: "WHATSAPP", resumen: "", resultado: "" });
  const [tareaForm, setTareaForm] = useState({ tipo: "LLAMAR", due_at: "", prioridad: 3, descripcion: "" });

  // Vincular contacto states
  const [unlinkSearch, setUnlinkSearch] = useState("");
  const [unlinkResults, setUnlinkResults] = useState([]);
  const [unlinkTotal, setUnlinkTotal] = useState(0);
  const [unlinkPage, setUnlinkPage] = useState(1);
  const [unlinkLoading, setUnlinkLoading] = useState(false);
  const [soloDni, setSoloDni] = useState(false);
  const [soloTelefono, setSoloTelefono] = useState(false);
  const [showVincularConfirm, setShowVincularConfirm] = useState(false);
  const [vincularTarget, setVincularTarget] = useState(null);
  const [vincularNota, setVincularNota] = useState("");
  const [vincularLoading, setVincularLoading] = useState(false);
  const debounceRef = useRef(null);
  const unlinkPageSize = 20;

  // Creditos states
  const [creditos, setCreditos] = useState({ metrics: {}, rows: [], has_next: false });
  const [creditosPage, setCreditosPage] = useState(1);
  const [creditosLoading, setCreditosLoading] = useState(false);

  // Drawer state
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [cRes, ctRes, iRes, tRes] = await Promise.all([
          api.get(`/cuentas/${id}`),
          api.get(`/cuentas/${id}/contactos`),
          api.get(`/cuentas/${id}/interacciones`),
          api.get(`/cuentas/${id}/tareas`),
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
        setVentas({ metrics: {}, rows: [], has_next: false });
        // Fetch metrics for tab counters
        Promise.all([
          api.get(`/cuentas/${id}/ventas/metrics`, { params: { doc_tipo: "SALE" } }),
          api.get(`/cuentas/${id}/ventas/metrics`, { params: { doc_tipo: "RESERVA" } }),
          api.get(`/cuentas/${id}/creditos/metrics`),
        ]).then(([saleRes, resRes, credRes]) => {
          setMetrics({
            sale: saleRes.data,
            reserva: resRes.data,
            creditos: credRes.data,
          });
        }).catch(() => {});
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

  // ── Fetch ventas for this cuenta ──
  const fetchVentas = useCallback(async (pg = 1, docTipo = ventasDocTipo) => {
    setVentasLoading(true);
    try {
      const r = await api.get(`/cuentas/${id}/ventas`, {
        params: { doc_tipo: docTipo, page: pg, limit: 50 }
      });
      setVentas(r.data || { items: [], has_next: false, debug: {} });
      setVentasPage(pg);
    } catch {
      toast.error("Error cargando ventas");
    } finally {
      setVentasLoading(false);
    }
  }, [id, ventasDocTipo]);

  useEffect(() => {
    if (!loading && cuenta) fetchVentas(1, ventasDocTipo);
  }, [loading, cuenta, ventasDocTipo]); // eslint-disable-line

  // ── Fetch creditos for this cuenta ──
  const fetchCreditos = useCallback(async (pg = 1) => {
    setCreditosLoading(true);
    try {
      const r = await api.get(`/cuentas/${id}/creditos`, { params: { page: pg, limit: 50 } });
      setCreditos(r.data || { items: [], has_next: false, debug: {} });
      setCreditosPage(pg);
    } catch {
      toast.error("Error cargando creditos");
    } finally {
      setCreditosLoading(false);
    }
  }, [id]);

  // ── Vincular contacto logic ──
  const fetchUnlinked = useCallback(async (searchVal, pg, dni, tel) => {
    if (!searchVal || searchVal.length < 2) {
      setUnlinkResults([]);
      setUnlinkTotal(0);
      return;
    }
    setUnlinkLoading(true);
    try {
      const res = await api.get("/partners/unlinked", {
        params: {
          q: searchVal, page: pg, pageSize: unlinkPageSize,
          solo_dni: dni, solo_telefono: tel,
          exclude_cuenta: parseInt(id) || 0
        }
      });
      setUnlinkResults(res.data.items || []);
      setUnlinkTotal(res.data.total || 0);
    } catch (err) {
      toast.error("Error buscando partners");
    } finally {
      setUnlinkLoading(false);
    }
  }, [id]);

  const handleUnlinkSearchChange = (val) => {
    setUnlinkSearch(val);
    setUnlinkPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchUnlinked(val, 1, soloDni, soloTelefono);
    }, 300);
  };

  const handleUnlinkFilterChange = (newDni, newTel) => {
    setSoloDni(newDni);
    setSoloTelefono(newTel);
    setUnlinkPage(1);
    if (unlinkSearch.length >= 2) {
      fetchUnlinked(unlinkSearch, 1, newDni, newTel);
    }
  };

  const handleUnlinkPageChange = (newPage) => {
    setUnlinkPage(newPage);
    fetchUnlinked(unlinkSearch, newPage, soloDni, soloTelefono);
  };

  const openVincularConfirm = (partner) => {
    setVincularTarget(partner);
    setVincularNota("");
    setShowVincularConfirm(true);
  };

  const handleVincular = async () => {
    if (!vincularTarget) return;
    setVincularLoading(true);
    try {
      await api.post(`/cuentas/${id}/vincular-contacto`, {
        contacto_partner_odoo_id: vincularTarget.odoo_id,
        nota: vincularNota || null
      });
      toast.success(`${vincularTarget.name} vinculado exitosamente`);
      setShowVincularConfirm(false);
      setVincularTarget(null);
      // Refresh contacts list
      const ctRes = await api.get(`/cuentas/${id}/contactos`);
      setContactos(ctRes.data || []);
      // Remove from unlinked results
      setUnlinkResults(prev => prev.filter(p => p.odoo_id !== vincularTarget.odoo_id));
      setUnlinkTotal(prev => Math.max(0, prev - 1));
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error al vincular contacto");
    } finally {
      setVincularLoading(false);
    }
  };

  const unlinkTotalPages = Math.ceil(unlinkTotal / unlinkPageSize);

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
            <Tabs defaultValue="contactos" onValueChange={(v) => {
              if (v === "ventas") { setVentasDocTipo("SALE"); }
              if (v === "reservas") { setVentasDocTipo("RESERVA"); }
              if (v === "creditos") { fetchCreditos(1); }
            }}>
              <TabsList className="mb-4" data-testid="cuenta-tabs">
                <TabsTrigger value="contactos">Contactos ({contactos.length})</TabsTrigger>
                <TabsTrigger value="ventas" data-testid="tab-ventas">
                  Ventas{metrics.sale ? ` (Ordenes: ${fmtNum(metrics.sale.orders_count)})` : ""}
                  {metrics.sale && metrics.sale.qty_total > 0 && (
                    <span className="ml-1.5 text-[9px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full font-normal">Uds: {fmtNum(metrics.sale.qty_total)}</span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="reservas" data-testid="tab-reservas">
                  Reservas{metrics.reserva ? ` (Ordenes: ${fmtNum(metrics.reserva.orders_count)})` : ""}
                  {metrics.reserva && metrics.reserva.qty_total > 0 && (
                    <span className="ml-1.5 text-[9px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full font-normal">Uds: {fmtNum(metrics.reserva.qty_total)}</span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="creditos" data-testid="tab-creditos">
                  Creditos{metrics.creditos ? ` (Facturas: ${fmtNum(metrics.creditos.invoices_count)})` : ""}
                  {metrics.creditos && metrics.creditos.qty_total > 0 && (
                    <span className="ml-1.5 text-[9px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full font-normal">Uds: {fmtNum(metrics.creditos.qty_total)}</span>
                  )}
                  {metrics.creditos && metrics.creditos.saldo_total > 0 && (
                    <span className="ml-1.5 text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-normal">Saldo: {fmtMoney(metrics.creditos.saldo_total)}</span>
                  )}
                </TabsTrigger>
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

                {/* Vincular contacto existente */}
                <div className="mt-6 bg-white rounded-lg border border-border shadow-sm" data-testid="vincular-contacto-section">
                  <div className="p-4 border-b border-border">
                    <div className="flex items-center gap-2 mb-1">
                      <UserPlus size={18} className="text-slate-600" strokeWidth={1.5} />
                      <h4 className="font-heading font-medium text-base text-slate-900">Vincular contacto existente</h4>
                    </div>
                    <p className="text-xs text-slate-500">Busca personas del ODS (Odoo) que aun no estan vinculadas al CRM</p>
                  </div>
                  <div className="p-4 space-y-4">
                    {/* Search + Filters */}
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="relative flex-1 min-w-[220px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                        <Input
                          data-testid="vincular-search"
                          placeholder="Buscar por nombre, DNI/RUC, telefono... (min 2 caracteres)"
                          className="pl-9 text-sm"
                          value={unlinkSearch}
                          onChange={(e) => handleUnlinkSearchChange(e.target.value)}
                        />
                      </div>
                      <div className="flex items-center gap-2 border border-border rounded-md px-3 py-1.5">
                        <Switch
                          id="solo-dni"
                          data-testid="vincular-solo-dni"
                          checked={soloDni}
                          onCheckedChange={(v) => handleUnlinkFilterChange(v, soloTelefono)}
                          className="scale-[0.85]"
                        />
                        <Label htmlFor="solo-dni" className="text-xs text-slate-600 cursor-pointer whitespace-nowrap">Solo con DNI/RUC</Label>
                      </div>
                      <div className="flex items-center gap-2 border border-border rounded-md px-3 py-1.5">
                        <Switch
                          id="solo-tel"
                          data-testid="vincular-solo-telefono"
                          checked={soloTelefono}
                          onCheckedChange={(v) => handleUnlinkFilterChange(soloDni, v)}
                          className="scale-[0.85]"
                        />
                        <Label htmlFor="solo-tel" className="text-xs text-slate-600 cursor-pointer whitespace-nowrap">Solo con telefono</Label>
                      </div>
                    </div>

                    {/* Results table */}
                    {unlinkSearch.length >= 2 && (
                      <>
                        <div className="rounded-md border border-border overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-slate-50/50">
                                <TableHead>Nombre</TableHead>
                                <TableHead>DNI/RUC</TableHead>
                                <TableHead>Telefono</TableHead>
                                <TableHead>WhatsApp</TableHead>
                                <TableHead>Ciudad</TableHead>
                                <TableHead className="w-[100px]">Accion</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {unlinkLoading ? (
                                <TableRow>
                                  <TableCell colSpan={6} className="h-24 text-center">
                                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-slate-400" />
                                  </TableCell>
                                </TableRow>
                              ) : unlinkResults.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={6} className="h-20 text-center text-slate-500 text-sm">
                                    No se encontraron partners sin vincular
                                  </TableCell>
                                </TableRow>
                              ) : (
                                unlinkResults.map((p) => (
                                  <TableRow key={p.odoo_id} data-testid={`unlinked-partner-${p.odoo_id}`}>
                                    <TableCell className="font-medium text-sm text-slate-900">{p.name}</TableCell>
                                    <TableCell className="text-sm text-slate-600 font-mono">{p.vat || "-"}</TableCell>
                                    <TableCell className="text-sm text-slate-600">{p.phone || "-"}</TableCell>
                                    <TableCell className="text-sm text-slate-600">{p.mobile || "-"}</TableCell>
                                    <TableCell className="text-sm text-slate-600">{p.city || "-"}</TableCell>
                                    <TableCell>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-xs"
                                        onClick={() => openVincularConfirm(p)}
                                        data-testid={`vincular-btn-${p.odoo_id}`}
                                      >
                                        <Link2 size={14} className="mr-1" /> Vincular
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </div>

                        {/* Pagination */}
                        {unlinkTotalPages > 0 && (
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-slate-500">
                              {unlinkTotal} resultado{unlinkTotal !== 1 ? "s" : ""} | Pagina {unlinkPage} de {unlinkTotalPages || 1}
                            </p>
                            <div className="flex gap-1">
                              <Button
                                variant="outline" size="sm"
                                disabled={unlinkPage <= 1}
                                onClick={() => handleUnlinkPageChange(unlinkPage - 1)}
                                data-testid="vincular-prev-page"
                              >
                                <ChevronLeft size={14} />
                              </Button>
                              <Button
                                variant="outline" size="sm"
                                disabled={unlinkPage >= unlinkTotalPages}
                                onClick={() => handleUnlinkPageChange(unlinkPage + 1)}
                                data-testid="vincular-next-page"
                              >
                                <ChevronRight size={14} />
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* Ventas Tab */}
              <TabsContent value="ventas">
                <VentasCuentaTab data={ventas} loading={ventasLoading} page={ventasPage}
                  onPageChange={(pg) => fetchVentas(pg, "SALE")} docTipo="SALE" />
              </TabsContent>

              {/* Reservas Tab */}
              <TabsContent value="reservas">
                <VentasCuentaTab
                  data={ventas}
                  loading={ventasLoading}
                  page={ventasPage}
                  onPageChange={(pg) => fetchVentas(pg, "RESERVA")}
                  docTipo="RESERVA"
                  onMount={() => { setVentasDocTipo("RESERVA"); }}
                />
              </TabsContent>

              {/* Creditos Tab */}
              <TabsContent value="creditos">
                {creditosLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
                ) : (
                  <div className="space-y-4" data-testid="creditos-cuenta-tab">
                    <div className="rounded-md border border-border bg-white overflow-hidden shadow-sm">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-50/50">
                              <TableHead className="text-xs">Fecha</TableHead>
                              <TableHead className="text-xs">Factura</TableHead>
                              <TableHead className="text-xs">Estado</TableHead>
                              <TableHead className="text-xs text-right">Saldo</TableHead>
                              <TableHead className="text-xs">Modelo</TableHead>
                              <TableHead className="text-xs">Marca</TableHead>
                              <TableHead className="text-xs">Tipo</TableHead>
                              <TableHead className="text-xs">Talla</TableHead>
                              <TableHead className="text-xs">Color</TableHead>
                              <TableHead className="text-xs text-right">Qty</TableHead>
                              <TableHead className="text-xs text-right">P.Unit</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {creditos.items.length === 0 ? (
                              <TableRow><TableCell colSpan={11} className="h-20 text-center text-slate-500">Sin creditos</TableCell></TableRow>
                            ) : creditos.items.map((r, i) => (
                              <TableRow key={i} className={i % 2 ? "bg-slate-50/30" : ""}>
                                <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.date_invoice ? r.date_invoice + "T00:00:00" : null)}</TableCell>
                                <TableCell className="text-xs font-mono text-slate-500">{r.invoice_number || "-"}</TableCell>
                                <TableCell className="text-xs">
                                  <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium ${r.state === "open" ? "bg-amber-100 text-amber-700" : r.state === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                                    {r.state === "open" ? "Abierta" : r.state === "paid" ? "Pagada" : r.state === "cancel" ? "Cancelada" : r.state}
                                  </span>
                                </TableCell>
                                <TableCell className="text-xs text-right font-mono">
                                  {r.amount_residual > 0 ? <span className="text-red-600 font-semibold">{fmtMoney(r.amount_residual)}</span> : <span className="text-slate-400">{fmtMoney(r.amount_residual)}</span>}
                                </TableCell>
                                <TableCell className="text-xs font-medium truncate max-w-[120px]">{r.modelo_display || r.line_description || "-"}</TableCell>
                                <TableCell className="text-xs text-slate-500">{r.marca || "-"}</TableCell>
                                <TableCell className="text-xs text-slate-500">{r.tipo || "-"}</TableCell>
                                <TableCell className="text-xs">{r.talla || "-"}</TableCell>
                                <TableCell className="text-xs">{r.color || "-"}</TableCell>
                                <TableCell className="text-xs text-right font-mono">{fmtNum(r.qty)}</TableCell>
                                <TableCell className="text-xs text-right font-mono">{fmtMoney(r.price_unit)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      {(creditosPage > 1 || creditos.has_next) && (
                        <div className="flex items-center justify-between px-3 py-2 border-t text-xs text-slate-500">
                          <span>Pagina {creditosPage}</span>
                          <div className="flex gap-1">
                            <Button variant="outline" size="sm" disabled={creditosPage <= 1} onClick={() => fetchCreditos(creditosPage - 1)} data-testid="creditos-prev-page">
                              <ChevronLeft size={14} />
                            </Button>
                            <Button variant="outline" size="sm" disabled={!creditos.has_next} onClick={() => fetchCreditos(creditosPage + 1)} data-testid="creditos-next-page">
                              <ChevronRight size={14} />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                    {creditos.debug?.partners_count > 0 && (
                      <p className="text-[10px] text-slate-400">Partners vinculados: {creditos.debug.partners_count}</p>
                    )}
                  </div>
                )}
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

      {/* Vincular Contacto Confirmation Dialog */}
      <Dialog open={showVincularConfirm} onOpenChange={setShowVincularConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vincular contacto</DialogTitle>
            <DialogDescription>
              Vincular <strong>{vincularTarget?.name}</strong> a la cuenta <strong>{partnerName}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {vincularTarget && (
              <div className="bg-slate-50 rounded-md p-3 space-y-1 text-sm">
                <p><span className="text-slate-500">Nombre:</span> <span className="font-medium text-slate-900">{vincularTarget.name}</span></p>
                {vincularTarget.vat && <p><span className="text-slate-500">DNI/RUC:</span> <span className="font-mono">{vincularTarget.vat}</span></p>}
                {vincularTarget.phone && <p><span className="text-slate-500">Telefono:</span> {vincularTarget.phone}</p>}
                {vincularTarget.mobile && <p><span className="text-slate-500">Mobile:</span> {vincularTarget.mobile}</p>}
                {vincularTarget.city && <p><span className="text-slate-500">Ciudad:</span> {vincularTarget.city}</p>}
              </div>
            )}
            <div>
              <Label className="text-xs uppercase tracking-wider font-semibold text-slate-500">Nota (opcional)</Label>
              <Input
                data-testid="vincular-nota"
                value={vincularNota}
                onChange={e => setVincularNota(e.target.value)}
                placeholder="Vinculado manualmente desde la cuenta"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVincularConfirm(false)}>Cancelar</Button>
            <Button onClick={handleVincular} disabled={vincularLoading} data-testid="confirm-vincular-btn">
              {vincularLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
