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
  Search, UserPlus, Link2, ChevronLeft, ChevronRight, List,
  Calendar, BarChart3, X
} from "lucide-react";

const ESTADOS = ["NUEVO", "ACTIVO", "SEGUIMIENTO", "DORMIDO", "NO_VOLVER"];
const CLASIFICACIONES = ["A", "B", "C"];
const TIPO_INTERACCION = ["WHATSAPP", "LLAMADA", "VISITA", "NOTA"];
const TIPO_TAREA = ["LLAMAR", "WHATSAPP", "VISITAR", "COBRANZA", "POSTVENTA"];

function fmtNum(n) { return Number(n || 0).toLocaleString("es-PE"); }
function fmtMoney(n) { return "S/ " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "-"; }

/* ── Ventas/Reservas sub-tab component ── */
function OrderHeadersTab({ data, loading, page, onPageChange, onSelectOrder }) {
  const rows = data?.rows || [];
  const hasNext = data?.has_next || false;

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-3" data-testid="ventas-cuenta-tab">
      <div className="rounded-md border border-border bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead className="text-xs">Fecha</TableHead>
                <TableHead className="text-xs">Orden</TableHead>
                <TableHead className="text-xs">Estado</TableHead>
                <TableHead className="text-xs text-right">Total</TableHead>
                <TableHead className="text-xs text-right">Uds</TableHead>
                <TableHead className="text-xs text-right">Lineas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="h-20 text-center text-slate-500">Sin ordenes</TableCell></TableRow>
              ) : rows.map((r, i) => (
                <TableRow key={r.order_id} className={`cursor-pointer ${i % 2 ? "bg-slate-50/30" : ""} hover:bg-blue-50`}
                  onClick={() => onSelectOrder(r)} data-testid={`order-row-${r.order_id}`}>
                  <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.date_order)}</TableCell>
                  <TableCell className="text-xs font-mono text-slate-500">{r.order_name || r.order_id}</TableCell>
                  <TableCell className="text-xs">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium ${r.state === "paid" ? "bg-emerald-100 text-emerald-700" : r.state === "done" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                      {r.state}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-right font-mono">{fmtMoney(r.amount_total)}</TableCell>
                  <TableCell className="text-xs text-right font-mono font-semibold">{fmtNum(r.qty_total)}</TableCell>
                  <TableCell className="text-xs text-right text-slate-500">{r.lines_count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {(page > 1 || hasNext) && (
          <div className="flex items-center justify-between px-3 py-2 border-t text-xs text-slate-500">
            <span>Pagina {page}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} data-testid="ventas-prev-page"><ChevronLeft size={14} /></Button>
              <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => onPageChange(page + 1)} data-testid="ventas-next-page"><ChevronRight size={14} /></Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InvoiceHeadersTab({ data, loading, page, onPageChange, onSelectInvoice }) {
  const rows = data?.rows || [];
  const hasNext = data?.has_next || false;

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-3" data-testid="creditos-cuenta-tab">
      <div className="rounded-md border border-border bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead className="text-xs">Fecha</TableHead>
                <TableHead className="text-xs">Factura</TableHead>
                <TableHead className="text-xs">Estado</TableHead>
                <TableHead className="text-xs text-right">Total</TableHead>
                <TableHead className="text-xs text-right">Saldo</TableHead>
                <TableHead className="text-xs text-right">Uds</TableHead>
                <TableHead className="text-xs text-right">Lineas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="h-20 text-center text-slate-500">Sin facturas</TableCell></TableRow>
              ) : rows.map((r, i) => (
                <TableRow key={r.invoice_id} className={`cursor-pointer ${i % 2 ? "bg-slate-50/30" : ""} hover:bg-blue-50`}
                  onClick={() => onSelectInvoice(r)} data-testid={`invoice-row-${r.invoice_id}`}>
                  <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.date_invoice ? r.date_invoice + "T00:00:00" : null)}</TableCell>
                  <TableCell className="text-xs font-mono text-slate-500">{r.invoice_number || "-"}</TableCell>
                  <TableCell className="text-xs">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium ${r.state === "open" ? "bg-amber-100 text-amber-700" : r.state === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                      {r.state === "open" ? "Abierta" : r.state === "paid" ? "Pagada" : r.state === "cancel" ? "Cancelada" : r.state}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-right font-mono">{fmtMoney(r.amount_total)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">
                    {r.amount_residual > 0 ? <span className="text-red-600 font-semibold">{fmtMoney(r.amount_residual)}</span> : <span className="text-slate-400">{fmtMoney(0)}</span>}
                  </TableCell>
                  <TableCell className="text-xs text-right font-mono font-semibold">{fmtNum(r.qty_total)}</TableCell>
                  <TableCell className="text-xs text-right text-slate-500">{r.lines_count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {(page > 1 || hasNext) && (
          <div className="flex items-center justify-between px-3 py-2 border-t text-xs text-slate-500">
            <span>Pagina {page}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} data-testid="creditos-prev-page"><ChevronLeft size={14} /></Button>
              <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => onPageChange(page + 1)} data-testid="creditos-next-page"><ChevronRight size={14} /></Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Lines-level sub-tab components (detail mode) ── */
function OrderLinesTab({ data, loading, page, onPageChange }) {
  const rows = data?.rows || [];
  const hasNext = data?.has_next || false;

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-3" data-testid="ventas-lines-cuenta-tab">
      <div className="rounded-md border border-cyan-200 bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-cyan-50/50">
                <TableHead className="text-xs">Fecha</TableHead>
                <TableHead className="text-xs">Orden</TableHead>
                <TableHead className="text-xs">Modelo</TableHead>
                <TableHead className="text-xs">Marca</TableHead>
                <TableHead className="text-xs">Talla</TableHead>
                <TableHead className="text-xs">Color</TableHead>
                <TableHead className="text-xs text-right">Qty</TableHead>
                <TableHead className="text-xs text-right">P.Unit</TableHead>
                <TableHead className="text-xs text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="h-20 text-center text-slate-500">Sin lineas</TableCell></TableRow>
              ) : rows.map((r, i) => (
                <TableRow key={`${r.order_id}-${r.line_id}`} className={`${i % 2 ? "bg-slate-50/30" : ""} hover:bg-cyan-50/50`}
                  data-testid={`line-row-${r.line_id}`}>
                  <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.fecha)}</TableCell>
                  <TableCell className="text-xs font-mono text-slate-500">{r.order_name || r.order_id}</TableCell>
                  <TableCell className="text-xs font-medium truncate max-w-[140px]">{r.modelo_display || "-"}</TableCell>
                  <TableCell className="text-xs text-slate-500">{r.marca || "-"}</TableCell>
                  <TableCell className="text-xs">{r.talla || "-"}</TableCell>
                  <TableCell className="text-xs">{r.color || "-"}</TableCell>
                  <TableCell className="text-xs text-right font-mono font-semibold">{fmtNum(r.qty)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{fmtMoney(r.price_unit)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{fmtMoney(r.subtotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {(page > 1 || hasNext) && (
          <div className="flex items-center justify-between px-3 py-2 border-t text-xs text-slate-500">
            <span>Pagina {page}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} data-testid="ventas-lines-prev-page"><ChevronLeft size={14} /></Button>
              <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => onPageChange(page + 1)} data-testid="ventas-lines-next-page"><ChevronRight size={14} /></Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InvoiceLinesTab({ data, loading, page, onPageChange }) {
  const rows = data?.rows || [];
  const hasNext = data?.has_next || false;

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-3" data-testid="creditos-lines-cuenta-tab">
      <div className="rounded-md border border-cyan-200 bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-cyan-50/50">
                <TableHead className="text-xs">Fecha</TableHead>
                <TableHead className="text-xs">Factura</TableHead>
                <TableHead className="text-xs">Modelo</TableHead>
                <TableHead className="text-xs">Talla</TableHead>
                <TableHead className="text-xs">Color</TableHead>
                <TableHead className="text-xs text-right">Qty</TableHead>
                <TableHead className="text-xs text-right">P.Unit</TableHead>
                <TableHead className="text-xs text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="h-20 text-center text-slate-500">Sin lineas</TableCell></TableRow>
              ) : rows.map((r, i) => (
                <TableRow key={`${r.invoice_id}-${r.line_id}`} className={`${i % 2 ? "bg-slate-50/30" : ""} hover:bg-cyan-50/50`}
                  data-testid={`line-row-${r.line_id}`}>
                  <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.date_invoice ? r.date_invoice + "T00:00:00" : null)}</TableCell>
                  <TableCell className="text-xs font-mono text-slate-500">{r.invoice_number || "-"}</TableCell>
                  <TableCell className="text-xs font-medium truncate max-w-[140px]">{r.modelo_display || r.line_description || "-"}</TableCell>
                  <TableCell className="text-xs">{r.talla || "-"}</TableCell>
                  <TableCell className="text-xs">{r.color || "-"}</TableCell>
                  <TableCell className="text-xs text-right font-mono font-semibold">{fmtNum(r.qty)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{fmtMoney(r.price_unit)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{fmtMoney(r.price_subtotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {(page > 1 || hasNext) && (
          <div className="flex items-center justify-between px-3 py-2 border-t text-xs text-slate-500">
            <span>Pagina {page}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} data-testid="creditos-lines-prev-page"><ChevronLeft size={14} /></Button>
              <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => onPageChange(page + 1)} data-testid="creditos-lines-next-page"><ChevronRight size={14} /></Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Clasificacion Tab (Info Ventas) ── */
function ClasificacionTab({ data, loading, fechaDesde, fechaHasta, onFechaDesdeChange, onFechaHastaChange, onApplyFilters, onSelectItem }) {
  const rows = data?.rows || [];

  return (
    <div className="space-y-3" data-testid="info-ventas-tab">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap bg-white border border-border rounded-lg px-4 py-2.5 shadow-sm" data-testid="clasif-filters">
        <Calendar size={14} className="text-slate-400" />
        <input type="date" className="h-7 text-xs rounded px-2 bg-slate-100 border border-slate-200 outline-none"
          value={fechaDesde} onChange={e => onFechaDesdeChange(e.target.value)} data-testid="clasif-fecha-desde" />
        <span className="text-xs text-slate-400">a</span>
        <input type="date" className="h-7 text-xs rounded px-2 bg-slate-100 border border-slate-200 outline-none"
          value={fechaHasta} onChange={e => onFechaHastaChange(e.target.value)} data-testid="clasif-fecha-hasta" />
        <Button variant="outline" size="sm" onClick={onApplyFilters} data-testid="clasif-apply-filters" className="text-xs h-7">
          Aplicar
        </Button>
        <span className="ml-auto text-[10px] text-slate-400">{rows.length} clasificaciones</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : (
        <div className="rounded-md border border-border bg-white overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead className="text-xs font-semibold">Marca</TableHead>
                  <TableHead className="text-xs font-semibold">Tipo</TableHead>
                  <TableHead className="text-xs font-semibold">Entalle</TableHead>
                  <TableHead className="text-xs font-semibold">Ultima compra</TableHead>
                  <TableHead className="text-xs text-right font-semibold">Cantidad</TableHead>
                  <TableHead className="text-xs text-right font-semibold">Ventas (S/)</TableHead>
                  <TableHead className="text-xs text-right font-semibold">Compras (#)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="h-20 text-center text-slate-500">Sin datos de ventas</TableCell></TableRow>
                ) : rows.map((r, i) => (
                  <TableRow key={`${r.marca}-${r.tipo}-${r.entalle}`}
                    className={`cursor-pointer ${i % 2 ? "bg-slate-50/30" : ""} hover:bg-blue-50 transition-colors`}
                    onClick={() => onSelectItem(r)} data-testid={`clasif-row-${i}`}>
                    <TableCell className="text-xs font-medium">{r.marca || <span className="text-slate-400 italic">sin marca</span>}</TableCell>
                    <TableCell className="text-xs">{r.tipo || <span className="text-slate-400 italic">sin tipo</span>}</TableCell>
                    <TableCell className="text-xs">{r.entalle || <span className="text-slate-400 italic">sin entalle</span>}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.ultima_fecha_compra)}</TableCell>
                    <TableCell className="text-xs text-right font-mono font-semibold">{fmtNum(r.cantidad)}</TableCell>
                    <TableCell className="text-xs text-right font-mono text-emerald-700 font-semibold">{fmtMoney(r.ventas)}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{fmtNum(r.compras)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {rows.length > 0 && (
            <div className="px-3 py-2 border-t text-[10px] text-slate-500 flex items-center justify-between">
              <span>{rows.length} items</span>
              <span>Total: <b className="text-emerald-700">{fmtMoney(rows.reduce((s, r) => s + (r.ventas || 0), 0))}</b> | {fmtNum(rows.reduce((s, r) => s + (r.cantidad || 0), 0))} uds</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Clasificacion Detail Drawer (2-level: Orders → Lines) ── */
function ClasifDetailDrawer({ item, ordersData, ordersLoading, ordersPage, onOrdersPageChange,
                              selectedOrder, orderLines, orderLinesLoading, orderLinesPage, onOrderLinesPageChange,
                              onSelectOrder, onBackToOrders, onClose }) {
  const title = [item.marca, item.tipo, item.entalle].filter(Boolean).join(" / ") || "Sin clasificacion";
  const showingLines = !!selectedOrder;

  return (
    <div className="fixed inset-0 z-50 flex" data-testid="clasif-detail-drawer">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="ml-auto w-full max-w-2xl bg-white shadow-2xl flex flex-col relative z-10 animate-in slide-in-from-right">
        {/* Header with breadcrumb */}
        <div className="px-4 py-3 border-b bg-slate-800 text-white shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              {showingLines && (
                <button onClick={onBackToOrders} className="text-slate-300 hover:text-white shrink-0" data-testid="clasif-back-to-orders">
                  <ArrowLeft size={16} />
                </button>
              )}
              <div className="min-w-0">
                <h3 className="text-sm font-bold truncate">{title}</h3>
                <div className="flex items-center gap-1 text-[10px] text-slate-300">
                  <span className={showingLines ? "cursor-pointer hover:text-white underline" : ""}
                    onClick={showingLines ? onBackToOrders : undefined}>Ordenes</span>
                  {showingLines && (
                    <>
                      <ChevronRight size={10} />
                      <span className="text-white font-medium truncate">{selectedOrder.order_name || `#${selectedOrder.order_id}`}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <button onClick={onClose} className="text-slate-300 hover:text-white shrink-0" data-testid="close-clasif-drawer"><X size={18} /></button>
          </div>
          {showingLines && (
            <div className="mt-1 text-[10px] text-slate-400">
              {fmtDate(selectedOrder.date_order)} | {fmtNum(selectedOrder.qty_item)} uds | {fmtMoney(selectedOrder.ventas_item)}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto min-h-0">
          {!showingLines ? (
            /* Level 1: Orders */
            ordersLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : (
              <table className="w-full text-[11px] border-collapse">
                <thead className="sticky top-0 bg-slate-100 z-10">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Fecha</th>
                    <th className="text-left px-3 py-2 font-semibold">Orden</th>
                    <th className="text-right px-3 py-2 font-semibold">Lineas</th>
                    <th className="text-right px-3 py-2 font-semibold">Qty</th>
                    <th className="text-right px-3 py-2 font-semibold">Ventas (S/)</th>
                  </tr>
                </thead>
                <tbody>
                  {(ordersData?.rows || []).length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-slate-400">Sin ordenes</td></tr>
                  ) : (ordersData.rows).map((r, i) => (
                    <tr key={r.order_id}
                      className={`cursor-pointer ${i % 2 ? "bg-slate-50/50" : ""} hover:bg-blue-50 transition-colors`}
                      onClick={() => onSelectOrder(r)} data-testid={`clasif-order-row-${i}`}>
                      <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(r.date_order)}</td>
                      <td className="px-3 py-1.5 font-mono text-[10px]">{r.order_name || r.order_id}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{fmtNum(r.lines_count)}</td>
                      <td className="px-3 py-1.5 text-right font-mono font-semibold">{fmtNum(r.qty_item)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-emerald-700 font-semibold">{fmtMoney(r.ventas_item)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : (
            /* Level 2: Order Lines */
            orderLinesLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : (
              <table className="w-full text-[10px] border-collapse">
                <thead className="sticky top-0 bg-slate-100 z-10">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-semibold">Modelo</th>
                    <th className="text-left px-2 py-1.5 font-semibold">Talla</th>
                    <th className="text-left px-2 py-1.5 font-semibold">Color</th>
                    <th className="text-right px-2 py-1.5 font-semibold">Qty</th>
                    <th className="text-right px-2 py-1.5 font-semibold">P.Unit</th>
                    <th className="text-right px-2 py-1.5 font-semibold">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {(orderLines?.items || []).length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-slate-400">Sin lineas</td></tr>
                  ) : (orderLines.items).map((r, i) => (
                    <tr key={`${r.order_id}-${r.line_id}`} className={`${i % 2 ? "bg-slate-50/50" : ""} hover:bg-blue-50/50`}>
                      <td className="px-2 py-1 truncate max-w-[140px]">{r.modelo_display || "-"}</td>
                      <td className="px-2 py-1">{r.talla || "-"}</td>
                      <td className="px-2 py-1">{r.color || "-"}</td>
                      <td className="px-2 py-1 text-right font-mono font-semibold">{fmtNum(r.qty)}</td>
                      <td className="px-2 py-1 text-right font-mono">{fmtMoney(r.price_unit)}</td>
                      <td className="px-2 py-1 text-right font-mono">{fmtMoney(r.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>

        {/* Pagination */}
        {!showingLines && (ordersPage > 1 || (ordersData?.has_next)) && (
          <div className="flex items-center justify-between px-3 py-2 border-t text-[10px] text-slate-500 shrink-0">
            <span>Pagina {ordersPage}</span>
            <div className="flex gap-1">
              <button className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40" disabled={ordersPage <= 1}
                onClick={() => onOrdersPageChange(ordersPage - 1)} data-testid="clasif-orders-prev"><ChevronLeft size={12} /></button>
              <button className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40" disabled={!ordersData?.has_next}
                onClick={() => onOrdersPageChange(ordersPage + 1)} data-testid="clasif-orders-next"><ChevronRight size={12} /></button>
            </div>
          </div>
        )}
        {showingLines && (orderLinesPage > 1 || (orderLines?.has_next)) && (
          <div className="flex items-center justify-between px-3 py-2 border-t text-[10px] text-slate-500 shrink-0">
            <span>Pagina {orderLinesPage}</span>
            <div className="flex gap-1">
              <button className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40" disabled={orderLinesPage <= 1}
                onClick={() => onOrderLinesPageChange(orderLinesPage - 1)} data-testid="clasif-lines-prev"><ChevronLeft size={12} /></button>
              <button className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40" disabled={!orderLines?.has_next}
                onClick={() => onOrderLinesPageChange(orderLinesPage + 1)} data-testid="clasif-lines-next"><ChevronRight size={12} /></button>
            </div>
          </div>
        )}
      </div>
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

  // Detail mode state
  const [detailMode, setDetailMode] = useState(false);
  const [ventasLines, setVentasLines] = useState({ rows: [], has_next: false });
  const [ventasLinesPage, setVentasLinesPage] = useState(1);
  const [ventasLinesLoading, setVentasLinesLoading] = useState(false);
  const [creditosLines, setCreditosLines] = useState({ rows: [], has_next: false });
  const [creditosLinesPage, setCreditosLinesPage] = useState(1);
  const [creditosLinesLoading, setCreditosLinesLoading] = useState(false);

  // Clasificacion (Info Ventas) state
  const [clasifData, setClasifData] = useState({ rows: [] });
  const [clasifLoading, setClasifLoading] = useState(false);
  const [clasifFechaDesde, setClasifFechaDesde] = useState("");
  const [clasifFechaHasta, setClasifFechaHasta] = useState("");
  const [clasifSelected, setClasifSelected] = useState(null);
  const [clasifOrders, setClasifOrders] = useState({ rows: [], has_next: false });
  const [clasifOrdersPage, setClasifOrdersPage] = useState(1);
  const [clasifOrdersLoading, setClasifOrdersLoading] = useState(false);
  const [clasifSelectedOrder, setClasifSelectedOrder] = useState(null);
  const [clasifOrderLines, setClasifOrderLines] = useState({ items: [], has_next: false });
  const [clasifOrderLinesPage, setClasifOrderLinesPage] = useState(1);
  const [clasifOrderLinesLoading, setClasifOrderLinesLoading] = useState(false);

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
      const r = await api.get(`/cuentas/${id}/ventas/orders`, {
        params: { doc_tipo: docTipo, page: pg, limit: 50 }
      });
      setVentas(r.data || { metrics: {}, rows: [], has_next: false });
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

  // ── Fetch creditos invoices for this cuenta ──
  const fetchCreditos = useCallback(async (pg = 1) => {
    setCreditosLoading(true);
    try {
      const r = await api.get(`/cuentas/${id}/creditos/invoices`, { params: { page: pg, limit: 50 } });
      setCreditos(r.data || { metrics: {}, rows: [], has_next: false });
      setCreditosPage(pg);
    } catch {
      toast.error("Error cargando creditos");
    } finally {
      setCreditosLoading(false);
    }
  }, [id]);

  // ── Fetch ventas lines for detail mode ──
  const fetchVentasLines = useCallback(async (pg = 1, docTipo = ventasDocTipo) => {
    setVentasLinesLoading(true);
    try {
      const r = await api.get(`/cuentas/${id}/ventas/lines`, {
        params: { doc_tipo: docTipo, page: pg, limit: 50 }
      });
      setVentasLines(r.data || { rows: [], has_next: false });
      setVentasLinesPage(pg);
    } catch {
      toast.error("Error cargando lineas de ventas");
    } finally {
      setVentasLinesLoading(false);
    }
  }, [id, ventasDocTipo]);

  // ── Fetch creditos lines for detail mode ──
  const fetchCreditosLines = useCallback(async (pg = 1) => {
    setCreditosLinesLoading(true);
    try {
      const r = await api.get(`/cuentas/${id}/creditos/lines`, { params: { page: pg, limit: 50 } });
      setCreditosLines(r.data || { rows: [], has_next: false });
      setCreditosLinesPage(pg);
    } catch {
      toast.error("Error cargando lineas de creditos");
    } finally {
      setCreditosLinesLoading(false);
    }
  }, [id]);

  // ── Fetch clasificacion (Info Ventas) ──
  const fetchClasificacion = useCallback(async () => {
    setClasifLoading(true);
    try {
      const params = { top: 200 };
      if (clasifFechaDesde) params.fecha_desde = clasifFechaDesde;
      if (clasifFechaHasta) params.fecha_hasta = clasifFechaHasta;
      const r = await api.get(`/cuentas/${id}/ventas/clasificacion`, { params });
      setClasifData(r.data || { rows: [] });
    } catch {
      toast.error("Error cargando clasificacion");
    } finally {
      setClasifLoading(false);
    }
  }, [id, clasifFechaDesde, clasifFechaHasta]);

  // ── Fetch clasificacion orders (Level 1) ──
  const fetchClasifOrders = useCallback(async (item, pg = 1) => {
    setClasifOrdersLoading(true);
    try {
      const params = {
        marca: item.marca || "", tipo: item.tipo || "", entalle: item.entalle || "",
        page: pg, limit: 50
      };
      if (clasifFechaDesde) params.fecha_desde = clasifFechaDesde;
      if (clasifFechaHasta) params.fecha_hasta = clasifFechaHasta;
      const r = await api.get(`/cuentas/${id}/ventas/clasificacion/orders`, { params });
      setClasifOrders(r.data || { rows: [], has_next: false });
      setClasifOrdersPage(pg);
    } catch {
      toast.error("Error cargando ordenes");
    } finally {
      setClasifOrdersLoading(false);
    }
  }, [id, clasifFechaDesde, clasifFechaHasta]);

  // ── Fetch order lines (Level 2) ──
  const fetchClasifOrderLines = useCallback(async (orderId, pg = 1) => {
    setClasifOrderLinesLoading(true);
    try {
      const r = await api.get(`/comercial/orders/${orderId}/lines`, { params: { page: pg, limit: 100 } });
      setClasifOrderLines(r.data || { items: [], has_next: false });
      setClasifOrderLinesPage(pg);
    } catch {
      toast.error("Error cargando lineas");
    } finally {
      setClasifOrderLinesLoading(false);
    }
  }, []);

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
            {/* Detail mode toggle */}
            <div className="flex items-center gap-3 mb-4 bg-white border border-border rounded-lg px-4 py-2.5 shadow-sm" data-testid="detail-mode-toggle-bar">
              <Switch checked={detailMode} onCheckedChange={(v) => {
                setDetailMode(v);
                if (v) {
                  fetchVentasLines(1, ventasDocTipo);
                  fetchCreditosLines(1);
                }
              }} className="data-[state=checked]:bg-cyan-500" />
              <div>
                <span className={`text-sm font-medium ${detailMode ? "text-cyan-700" : "text-slate-600"}`}>
                  <List size={14} className="inline mr-1 -mt-0.5" />
                  Modo detalle (lineas)
                </span>
                <p className="text-[10px] text-slate-400">{detailMode ? "Mostrando lineas de producto individuales" : "Mostrando cabeceras de ordenes/facturas"}</p>
              </div>
              {detailMode && <span className="ml-auto text-[9px] text-cyan-600 font-semibold bg-cyan-50 px-2 py-1 rounded border border-cyan-200">ACTIVO</span>}
            </div>

            <Tabs defaultValue="contactos" onValueChange={(v) => {
              if (v === "ventas") {
                setVentasDocTipo("SALE");
                if (detailMode) fetchVentasLines(1, "SALE");
              }
              if (v === "reservas") {
                setVentasDocTipo("RESERVA");
                if (detailMode) fetchVentasLines(1, "RESERVA");
              }
              if (v === "creditos") {
                if (detailMode) fetchCreditosLines(1);
                else fetchCreditos(1);
              }
              if (v === "info_ventas") {
                fetchClasificacion();
              }
            }}>
              <TabsList className="mb-4 flex-wrap" data-testid="cuenta-tabs">
                <TabsTrigger value="contactos">Contactos ({contactos.length})</TabsTrigger>
                <TabsTrigger value="info_ventas" data-testid="tab-info-ventas">
                  <BarChart3 size={14} className="mr-1" />Info Ventas
                </TabsTrigger>
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
                {detailMode ? (
                  <OrderLinesTab data={ventasLines} loading={ventasLinesLoading} page={ventasLinesPage}
                    onPageChange={(pg) => fetchVentasLines(pg, "SALE")} />
                ) : (
                  <OrderHeadersTab data={ventas} loading={ventasLoading} page={ventasPage}
                    onPageChange={(pg) => fetchVentas(pg, "SALE")} onSelectOrder={setSelectedOrder} />
                )}
              </TabsContent>

              {/* Reservas Tab */}
              <TabsContent value="reservas">
                {detailMode ? (
                  <OrderLinesTab data={ventasLines} loading={ventasLinesLoading} page={ventasLinesPage}
                    onPageChange={(pg) => fetchVentasLines(pg, "RESERVA")} />
                ) : (
                  <OrderHeadersTab data={ventas} loading={ventasLoading} page={ventasPage}
                    onPageChange={(pg) => fetchVentas(pg, "RESERVA")} onSelectOrder={setSelectedOrder} />
                )}
              </TabsContent>

              {/* Creditos Tab */}
              <TabsContent value="creditos">
                {detailMode ? (
                  <InvoiceLinesTab data={creditosLines} loading={creditosLinesLoading} page={creditosLinesPage}
                    onPageChange={fetchCreditosLines} />
                ) : (
                  <InvoiceHeadersTab data={creditos} loading={creditosLoading} page={creditosPage}
                    onPageChange={fetchCreditos} onSelectInvoice={setSelectedInvoice} />
                )}
              </TabsContent>

              {/* Info Ventas Tab (Clasificacion) */}
              <TabsContent value="info_ventas">
                <ClasificacionTab
                  data={clasifData} loading={clasifLoading}
                  fechaDesde={clasifFechaDesde} fechaHasta={clasifFechaHasta}
                  onFechaDesdeChange={(v) => { setClasifFechaDesde(v); }}
                  onFechaHastaChange={(v) => { setClasifFechaHasta(v); }}
                  onApplyFilters={fetchClasificacion}
                  onSelectItem={(item) => { setClasifSelected(item); fetchClasifDetail(item, 1); }}
                />
                {clasifSelected && (
                  <ClasifDetailDrawer
                    item={clasifSelected}
                    data={clasifDetail}
                    loading={clasifDetailLoading}
                    page={clasifDetailPage}
                    onPageChange={(pg) => fetchClasifDetail(clasifSelected, pg)}
                    onClose={() => setClasifSelected(null)}
                  />
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

      {/* Detail drawers (only in header mode) */}
      {!detailMode && selectedOrder && <OrderLinesDrawer order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
      {!detailMode && selectedInvoice && <InvoiceLinesDrawer invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} />}

    </div>
  );
}
