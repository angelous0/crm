import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import YoYTab from "./YoYTab";
import AnaliticaTab from "./AnaliticaTab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Calendar, BarChart3, X, LayoutDashboard, Users, ShoppingBag,
  CreditCard, TrendingUp, Activity, CheckSquare, Settings, Menu
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
function ClasificacionTab({ data, loading, fechaDesde, fechaHasta, onFechaDesdeChange, onFechaHastaChange, onApplyFilters, onSelectItem,
                            sortBy, sortDir, onSort }) {
  const rows = data?.rows || [];
  const SortHead = ({ col, align, children }) => {
    const active = sortBy === col;
    return (
      <TableHead className={`text-xs font-semibold cursor-pointer select-none hover:bg-slate-100 transition-colors ${align === "right" ? "text-right" : ""}`}
        onClick={() => onSort(col)} data-testid={`clasif-sort-${col}`}>
        <span className="inline-flex items-center gap-0.5">
          {children}
          {active && <span className="text-[9px] ml-0.5">{sortDir === "asc" ? "▲" : "▼"}</span>}
        </span>
      </TableHead>
    );
  };

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
                  <SortHead col="ultima_fecha_compra">Ultima compra</SortHead>
                  <SortHead col="dias_sin_comprar" align="right">Dias s/c</SortHead>
                  <SortHead col="cantidad" align="right">Cantidad</SortHead>
                  <SortHead col="ventas" align="right">Ventas (S/)</SortHead>
                  <SortHead col="compras" align="right">Compras (#)</SortHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="h-20 text-center text-slate-500">Sin datos de ventas</TableCell></TableRow>
                ) : rows.map((r, i) => (
                  <TableRow key={`${r.marca}-${r.tipo}-${r.entalle}`}
                    className={`cursor-pointer ${i % 2 ? "bg-slate-50/30" : ""} hover:bg-blue-50 transition-colors`}
                    onClick={() => onSelectItem(r)} data-testid={`clasif-row-${i}`}>
                    <TableCell className="text-xs font-medium">{r.marca || <span className="text-slate-400 italic">sin marca</span>}</TableCell>
                    <TableCell className="text-xs">{r.tipo || <span className="text-slate-400 italic">sin tipo</span>}</TableCell>
                    <TableCell className="text-xs">{r.entalle || <span className="text-slate-400 italic">sin entalle</span>}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.ultima_fecha_compra)}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{r.dias_sin_comprar != null ? r.dias_sin_comprar : "-"}</TableCell>
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
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSection = searchParams.get("tab") || "resumen";
  const setSection = (s) => setSearchParams({ tab: s }, { replace: true });
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
  const [clasifSortBy, setClasifSortBy] = useState("ultima_fecha_compra");
  const [clasifSortDir, setClasifSortDir] = useState("desc");
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
  const fetchClasificacion = useCallback(async (sortByOverride, sortDirOverride) => {
    setClasifLoading(true);
    try {
      const params = { top: 200, sort_by: sortByOverride || clasifSortBy, sort_dir: sortDirOverride || clasifSortDir };
      if (clasifFechaDesde) params.fecha_desde = clasifFechaDesde;
      if (clasifFechaHasta) params.fecha_hasta = clasifFechaHasta;
      const r = await api.get(`/cuentas/${id}/ventas/clasificacion`, { params });
      setClasifData(r.data || { rows: [] });
    } catch {
      toast.error("Error cargando clasificacion");
    } finally {
      setClasifLoading(false);
    }
  }, [id, clasifFechaDesde, clasifFechaHasta, clasifSortBy, clasifSortDir]);

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

  // Section change handler
  useEffect(() => {
    if (!cuenta || loading) return;
    if (activeSection === "ventas") { setVentasDocTipo("SALE"); }
    if (activeSection === "reservas") { setVentasDocTipo("RESERVA"); }
    if (activeSection === "creditos" && !creditosLoading) { fetchCreditos(1); }
    if (activeSection === "info_ventas") { fetchClasificacion(); }
  }, [activeSection, cuenta]); // eslint-disable-line

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

  const NAV = [
    { key: "resumen", label: "Resumen", icon: LayoutDashboard },
    { key: "contactos", label: "Contactos", icon: Users, count: contactos.length },
    { key: "info_ventas", label: "Info Ventas", icon: BarChart3 },
    { key: "ventas", label: "Ventas", icon: ShoppingBag, count: metrics.sale?.orders_count },
    { key: "reservas", label: "Reservas", icon: ShoppingBag, count: metrics.reserva?.orders_count },
    { key: "creditos", label: "Creditos", icon: CreditCard, count: metrics.creditos?.invoices_count, badge: metrics.creditos?.saldo_total > 0 ? `S/${fmtMoney(metrics.creditos.saldo_total)}` : null },
    { key: "yoy", label: "Comparativo YoY", icon: TrendingUp },
    { key: "analitica", label: "Analitica", icon: Activity },
    { key: "interacciones", label: "Interacciones", icon: MessageSquare, count: interacciones.length },
    { key: "tareas", label: "Tareas", icon: CheckSquare, count: tareas.length },
    { key: "perfil", label: "Perfil", icon: Settings },
  ];

  return (
    <div data-testid="cuenta-detalle-page" className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-3 border-b border-border bg-white shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/cuentas")} data-testid="back-to-cuentas" className="shrink-0">
            <ArrowLeft size={16} />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="font-heading text-xl font-semibold tracking-tight text-slate-900 truncate">{partnerName}</h1>
            <div className="flex items-center gap-3 mt-0.5">
              {partner.city && <span className="text-xs text-slate-500 flex items-center gap-1"><MapPin size={11} />{partner.city}</span>}
              <Badge variant="outline" className="text-[10px] font-semibold">{editForm.estado_comercial || "NUEVO"}</Badge>
              {editForm.clasificacion && <Badge variant="secondary" className="text-[10px]">{editForm.clasificacion}</Badge>}
            </div>
          </div>
          {partner.phone && <span className="hidden lg:flex items-center gap-1 text-xs text-slate-500 shrink-0"><Phone size={12} />{partner.phone}</span>}
          {partner.email && <span className="hidden lg:flex items-center gap-1 text-xs text-slate-500 shrink-0"><Mail size={12} />{partner.email}</span>}
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar Directory - desktop */}
        <nav className="hidden lg:flex flex-col w-[220px] shrink-0 border-r border-border bg-slate-50/70 overflow-y-auto" data-testid="cuenta-sidebar">
          <div className="py-2">
            {NAV.map(item => {
              const Icon = item.icon;
              const active = activeSection === item.key;
              return (
                <button key={item.key} onClick={() => setSection(item.key)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors text-xs
                    ${active ? "bg-white border-r-2 border-slate-800 text-slate-900 font-semibold shadow-sm" : "text-slate-600 hover:bg-white/60 hover:text-slate-900"}`}
                  data-testid={`nav-${item.key}`}>
                  <Icon size={15} className={active ? "text-slate-800" : "text-slate-400"} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge && <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-semibold">{item.badge}</span>}
                  {item.count != null && !item.badge && <span className="text-[10px] text-slate-400 font-mono tabular-nums">{fmtNum(item.count)}</span>}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Mobile dropdown */}
        <div className="lg:hidden border-b border-border bg-slate-50 px-4 py-2 shrink-0" data-testid="cuenta-mobile-nav">
          <Select value={activeSection} onValueChange={(v) => setSection(v)}>
            <SelectTrigger className="h-8 text-xs"><Menu size={14} className="mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent>
              {NAV.map(item => <SelectItem key={item.key} value={item.key}>{item.label}{item.count != null ? ` (${item.count})` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 min-w-0" data-testid="cuenta-content">

          {/* ── RESUMEN ── */}
          {activeSection === "resumen" && (
            <div className="space-y-4" data-testid="section-resumen">
              {/* Detail mode toggle */}
              <div className="flex items-center gap-3 bg-white border border-border rounded-lg px-4 py-2 shadow-sm" data-testid="detail-mode-toggle-bar">
                <Switch checked={detailMode} onCheckedChange={(v) => {
                  setDetailMode(v);
                  if (v) { fetchVentasLines(1, ventasDocTipo); fetchCreditosLines(1); }
                }} className="data-[state=checked]:bg-cyan-500" />
                <span className={`text-xs font-medium ${detailMode ? "text-cyan-700" : "text-slate-600"}`}>
                  <List size={13} className="inline mr-1 -mt-0.5" />Modo detalle
                </span>
              </div>
              {/* KPI cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white border border-border rounded-lg p-3 shadow-sm cursor-pointer hover:border-slate-300 transition-colors" onClick={() => setSection("ventas")}>
                  <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Ventas</div>
                  <div className="text-xl font-bold text-slate-800 mt-1">S/ {fmtMoney(metrics.sale?.qty_total ? 0 : 0)}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{fmtNum(metrics.sale?.orders_count || 0)} ordenes | {fmtNum(metrics.sale?.qty_total || 0)} uds</div>
                </div>
                <div className="bg-white border border-border rounded-lg p-3 shadow-sm cursor-pointer hover:border-slate-300 transition-colors" onClick={() => setSection("reservas")}>
                  <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Reservas</div>
                  <div className="text-xl font-bold text-slate-800 mt-1">{fmtNum(metrics.reserva?.orders_count || 0)}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{fmtNum(metrics.reserva?.qty_total || 0)} uds</div>
                </div>
                <div className="bg-white border border-border rounded-lg p-3 shadow-sm cursor-pointer hover:border-slate-300 transition-colors" onClick={() => setSection("creditos")}>
                  <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Creditos</div>
                  <div className="text-xl font-bold text-slate-800 mt-1">{fmtNum(metrics.creditos?.invoices_count || 0)}</div>
                  {metrics.creditos?.saldo_total > 0 && <div className="text-[10px] text-red-600 font-semibold mt-0.5">Saldo: S/ {fmtMoney(metrics.creditos.saldo_total)}</div>}
                </div>
                <div className="bg-white border border-border rounded-lg p-3 shadow-sm cursor-pointer hover:border-slate-300 transition-colors" onClick={() => setSection("info_ventas")}>
                  <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Ultima compra</div>
                  <div className="text-xl font-bold text-slate-800 mt-1">{fmtDate(metrics.sale?.last_order_date)}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{metrics.sale?.first_order_date ? `Desde ${fmtDate(metrics.sale.first_order_date)}` : ""}</div>
                </div>
              </div>
              {/* Quick links */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
                {[
                  { key: "info_ventas", label: "Info Ventas", icon: BarChart3 },
                  { key: "yoy", label: "Comparativo YoY", icon: TrendingUp },
                  { key: "analitica", label: "Analitica", icon: Activity },
                  { key: "interacciones", label: "Interacciones", icon: MessageSquare },
                  { key: "tareas", label: "Tareas", icon: CheckSquare },
                ].map(q => (
                  <button key={q.key} onClick={() => setSection(q.key)}
                    className="flex items-center gap-2 bg-white border border-border rounded-lg px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm"
                    data-testid={`quick-${q.key}`}>
                    <q.icon size={14} className="text-slate-400" />{q.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── CONTACTOS ── */}
          {activeSection === "contactos" && (
            <div data-testid="section-contactos">
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
              <div className="mt-4 bg-white rounded-lg border border-border shadow-sm" data-testid="vincular-contacto-section">
                <div className="p-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <UserPlus size={16} className="text-slate-600" />
                    <h4 className="font-medium text-sm text-slate-900">Vincular contacto existente</h4>
                  </div>
                </div>
                <div className="p-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      <Input data-testid="vincular-search" placeholder="Buscar por nombre, DNI, telefono..." className="pl-8 text-xs h-8" value={unlinkSearch} onChange={(e) => handleUnlinkSearchChange(e.target.value)} />
                    </div>
                    <div className="flex items-center gap-1.5 border border-border rounded-md px-2 py-1">
                      <Switch id="solo-dni" data-testid="vincular-solo-dni" checked={soloDni} onCheckedChange={(v) => handleUnlinkFilterChange(v, soloTelefono)} className="scale-[0.8]" />
                      <Label htmlFor="solo-dni" className="text-[10px] text-slate-600 cursor-pointer">DNI/RUC</Label>
                    </div>
                    <div className="flex items-center gap-1.5 border border-border rounded-md px-2 py-1">
                      <Switch id="solo-tel" data-testid="vincular-solo-telefono" checked={soloTelefono} onCheckedChange={(v) => handleUnlinkFilterChange(soloDni, v)} className="scale-[0.8]" />
                      <Label htmlFor="solo-tel" className="text-[10px] text-slate-600 cursor-pointer">Telefono</Label>
                    </div>
                  </div>
                  {unlinkSearch.length >= 2 && (
                    <>
                      <div className="rounded-md border border-border overflow-hidden">
                        <Table>
                          <TableHeader><TableRow className="bg-slate-50/50">
                            <TableHead className="text-xs">Nombre</TableHead><TableHead className="text-xs">DNI/RUC</TableHead>
                            <TableHead className="text-xs">Telefono</TableHead><TableHead className="text-xs">Ciudad</TableHead>
                            <TableHead className="text-xs w-[80px]">Accion</TableHead>
                          </TableRow></TableHeader>
                          <TableBody>
                            {unlinkLoading ? (
                              <TableRow><TableCell colSpan={5} className="h-20 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto text-slate-400" /></TableCell></TableRow>
                            ) : unlinkResults.length === 0 ? (
                              <TableRow><TableCell colSpan={5} className="h-16 text-center text-slate-500 text-xs">Sin resultados</TableCell></TableRow>
                            ) : unlinkResults.map((p) => (
                              <TableRow key={p.odoo_id} data-testid={`unlinked-partner-${p.odoo_id}`}>
                                <TableCell className="text-xs font-medium">{p.name}</TableCell>
                                <TableCell className="text-xs font-mono">{p.vat || "-"}</TableCell>
                                <TableCell className="text-xs">{p.phone || p.mobile || "-"}</TableCell>
                                <TableCell className="text-xs">{p.city || "-"}</TableCell>
                                <TableCell>
                                  <Button size="sm" variant="outline" className="text-[10px] h-6 px-2" onClick={() => openVincularConfirm(p)} data-testid={`vincular-btn-${p.odoo_id}`}>
                                    <Link2 size={12} className="mr-1" />Vincular
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      {unlinkTotalPages > 0 && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">{unlinkTotal} resultados | Pag {unlinkPage}/{unlinkTotalPages || 1}</span>
                          <div className="flex gap-1">
                            <Button variant="outline" size="sm" className="h-6" disabled={unlinkPage <= 1} onClick={() => handleUnlinkPageChange(unlinkPage - 1)} data-testid="vincular-prev-page"><ChevronLeft size={12} /></Button>
                            <Button variant="outline" size="sm" className="h-6" disabled={unlinkPage >= unlinkTotalPages} onClick={() => handleUnlinkPageChange(unlinkPage + 1)} data-testid="vincular-next-page"><ChevronRight size={12} /></Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── VENTAS ── */}
          {activeSection === "ventas" && (
            <div data-testid="section-ventas">
              <div className="flex items-center gap-3 mb-3 bg-white border border-border rounded-lg px-4 py-2 shadow-sm">
                <Switch checked={detailMode} onCheckedChange={(v) => { setDetailMode(v); if (v) fetchVentasLines(1, "SALE"); }} className="data-[state=checked]:bg-cyan-500" />
                <span className="text-xs text-slate-600"><List size={13} className="inline mr-1" />Modo detalle</span>
              </div>
              {detailMode ? (
                <OrderLinesTab data={ventasLines} loading={ventasLinesLoading} page={ventasLinesPage} onPageChange={(pg) => fetchVentasLines(pg, "SALE")} />
              ) : (
                <OrderHeadersTab data={ventas} loading={ventasLoading} page={ventasPage} onPageChange={(pg) => fetchVentas(pg, "SALE")} onSelectOrder={setSelectedOrder} />
              )}
            </div>
          )}

          {/* ── RESERVAS ── */}
          {activeSection === "reservas" && (
            <div data-testid="section-reservas">
              <div className="flex items-center gap-3 mb-3 bg-white border border-border rounded-lg px-4 py-2 shadow-sm">
                <Switch checked={detailMode} onCheckedChange={(v) => { setDetailMode(v); if (v) fetchVentasLines(1, "RESERVA"); }} className="data-[state=checked]:bg-cyan-500" />
                <span className="text-xs text-slate-600"><List size={13} className="inline mr-1" />Modo detalle</span>
              </div>
              {detailMode ? (
                <OrderLinesTab data={ventasLines} loading={ventasLinesLoading} page={ventasLinesPage} onPageChange={(pg) => fetchVentasLines(pg, "RESERVA")} />
              ) : (
                <OrderHeadersTab data={ventas} loading={ventasLoading} page={ventasPage} onPageChange={(pg) => fetchVentas(pg, "RESERVA")} onSelectOrder={setSelectedOrder} />
              )}
            </div>
          )}

          {/* ── CREDITOS ── */}
          {activeSection === "creditos" && (
            <div data-testid="section-creditos">
              <div className="flex items-center gap-3 mb-3 bg-white border border-border rounded-lg px-4 py-2 shadow-sm">
                <Switch checked={detailMode} onCheckedChange={(v) => { setDetailMode(v); if (v) fetchCreditosLines(1); }} className="data-[state=checked]:bg-cyan-500" />
                <span className="text-xs text-slate-600"><List size={13} className="inline mr-1" />Modo detalle</span>
              </div>
              {detailMode ? (
                <InvoiceLinesTab data={creditosLines} loading={creditosLinesLoading} page={creditosLinesPage} onPageChange={fetchCreditosLines} />
              ) : (
                <InvoiceHeadersTab data={creditos} loading={creditosLoading} page={creditosPage} onPageChange={fetchCreditos} onSelectInvoice={setSelectedInvoice} />
              )}
            </div>
          )}

          {/* ── INFO VENTAS ── */}
          {activeSection === "info_ventas" && (
            <div data-testid="section-info-ventas">
              <ClasificacionTab
                data={clasifData} loading={clasifLoading}
                fechaDesde={clasifFechaDesde} fechaHasta={clasifFechaHasta}
                onFechaDesdeChange={(v) => { setClasifFechaDesde(v); }}
                onFechaHastaChange={(v) => { setClasifFechaHasta(v); }}
                onApplyFilters={fetchClasificacion}
                sortBy={clasifSortBy} sortDir={clasifSortDir}
                onSort={(col) => {
                  const newDir = col === clasifSortBy ? (clasifSortDir === "desc" ? "asc" : "desc") : "desc";
                  setClasifSortBy(col);
                  setClasifSortDir(newDir);
                  fetchClasificacion(col, newDir);
                }}
                onSelectItem={(item) => {
                  setClasifSelected(item);
                  setClasifSelectedOrder(null);
                  setClasifOrderLines({ items: [], has_next: false });
                  fetchClasifOrders(item, 1);
                }}
              />
              {clasifSelected && (
                <ClasifDetailDrawer
                  item={clasifSelected}
                  ordersData={clasifOrders} ordersLoading={clasifOrdersLoading} ordersPage={clasifOrdersPage}
                  onOrdersPageChange={(pg) => fetchClasifOrders(clasifSelected, pg)}
                  selectedOrder={clasifSelectedOrder} orderLines={clasifOrderLines}
                  orderLinesLoading={clasifOrderLinesLoading} orderLinesPage={clasifOrderLinesPage}
                  onOrderLinesPageChange={(pg) => fetchClasifOrderLines(clasifSelectedOrder.order_id, pg)}
                  onSelectOrder={(order) => { setClasifSelectedOrder(order); fetchClasifOrderLines(order.order_id, 1); }}
                  onBackToOrders={() => { setClasifSelectedOrder(null); setClasifOrderLines({ items: [], has_next: false }); }}
                  onClose={() => { setClasifSelected(null); setClasifSelectedOrder(null); }}
                />
              )}
            </div>
          )}

          {/* ── YOY ── */}
          {activeSection === "yoy" && <YoYTab cuentaId={id} />}

          {/* ── ANALITICA ── */}
          {activeSection === "analitica" && <AnaliticaTab cuentaId={id} />}

          {/* ── INTERACCIONES ── */}
          {activeSection === "interacciones" && (
            <div data-testid="section-interacciones">
              <div className="mb-3">
                <Button size="sm" onClick={() => setShowInteraccion(true)} data-testid="add-interaccion-btn">
                  <Plus size={14} className="mr-1" />Nueva interaccion
                </Button>
              </div>
              <div className="space-y-2">
                {interacciones.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 border rounded-md bg-white text-xs">Sin interacciones</div>
                ) : interacciones.map(i => (
                  <div key={i.id} className="bg-white border rounded-md p-3 shadow-sm" data-testid={`interaccion-${i.id}`}>
                    <div className="flex items-center gap-2 mb-1">
                      {i.tipo === "WHATSAPP" && <MessageSquare size={14} className="text-green-600" />}
                      {i.tipo === "LLAMADA" && <PhoneCall size={14} className="text-blue-600" />}
                      {i.tipo === "VISITA" && <Footprints size={14} className="text-amber-600" />}
                      {i.tipo === "NOTA" && <StickyNote size={14} className="text-slate-600" />}
                      <Badge variant="outline" className="text-[10px]">{i.tipo}</Badge>
                      <span className="text-[10px] text-slate-400 ml-auto">{new Date(i.fecha).toLocaleString('es')}</span>
                    </div>
                    <p className="text-xs text-slate-900">{i.resumen}</p>
                    {i.resultado && <p className="text-[10px] text-slate-500 mt-0.5">Resultado: {i.resultado}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── TAREAS ── */}
          {activeSection === "tareas" && (
            <div data-testid="section-tareas">
              <div className="mb-3">
                <Button size="sm" onClick={() => setShowTarea(true)} data-testid="add-tarea-btn">
                  <Plus size={14} className="mr-1" />Nueva tarea
                </Button>
              </div>
              <div className="rounded-md border border-border bg-white overflow-hidden shadow-sm">
                <Table>
                  <TableHeader><TableRow className="bg-slate-50/50">
                    <TableHead className="text-xs">Tipo</TableHead><TableHead className="text-xs">Descripcion</TableHead>
                    <TableHead className="text-xs">Vence</TableHead><TableHead className="text-xs">Status</TableHead><TableHead className="text-xs">Accion</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {tareas.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="h-16 text-center text-slate-500 text-xs">Sin tareas</TableCell></TableRow>
                    ) : tareas.map(t => (
                      <TableRow key={t.id} data-testid={`tarea-${t.id}`}>
                        <TableCell><Badge variant="outline" className="text-[10px]">{t.tipo}</Badge></TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs">{t.descripcion}</TableCell>
                        <TableCell className="text-xs">{new Date(t.due_at).toLocaleDateString('es')}</TableCell>
                        <TableCell><Badge variant={t.status === "HECHO" ? "default" : t.status === "PENDIENTE" ? "secondary" : "destructive"} className="text-[10px]">{t.status}</Badge></TableCell>
                        <TableCell>{t.status === "PENDIENTE" && <Button size="sm" variant="outline" className="text-[10px] h-6" onClick={() => handleCompletarTarea(t.id)} data-testid={`completar-tarea-${t.id}`}>Completar</Button>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* ── PERFIL ── */}
          {activeSection === "perfil" && (
            <div className="max-w-lg space-y-3" data-testid="section-perfil">
              <h3 className="text-sm font-semibold text-slate-800">Datos comerciales</h3>
              <div className="bg-white rounded-lg border border-border shadow-sm p-4 space-y-3">
                <div>
                  <Label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Estado</Label>
                  <Select value={editForm.estado_comercial} onValueChange={v => setEditForm(f => ({ ...f, estado_comercial: v }))}>
                    <SelectTrigger data-testid="edit-estado" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{ESTADOS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Clasificacion</Label>
                  <Select value={editForm.clasificacion || "NONE"} onValueChange={v => setEditForm(f => ({ ...f, clasificacion: v === "NONE" ? "" : v }))}>
                    <SelectTrigger data-testid="edit-clasificacion" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">Sin clasificar</SelectItem>
                      {CLASIFICACIONES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Asignado a</Label>
                  <Input data-testid="edit-asignado" value={editForm.asignado_a} onChange={e => setEditForm(f => ({ ...f, asignado_a: e.target.value }))} placeholder="Nombre del vendedor" className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Notas</Label>
                  <Textarea data-testid="edit-notas" value={editForm.notas} onChange={e => setEditForm(f => ({ ...f, notas: e.target.value }))} rows={3} placeholder="Notas sobre esta cuenta..." className="text-xs" />
                </div>
                <Button onClick={handleSave} disabled={saving} className="w-full h-8 text-xs" data-testid="save-cuenta-btn">
                  {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1" size={13} />}
                  Guardar
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <Dialog open={showInteraccion} onOpenChange={setShowInteraccion}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva interaccion</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Tipo</Label><Select value={interaccionForm.tipo} onValueChange={v => setInteraccionForm(f => ({ ...f, tipo: v }))}><SelectTrigger data-testid="interaccion-tipo"><SelectValue /></SelectTrigger><SelectContent>{TIPO_INTERACCION.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Resumen</Label><Textarea data-testid="interaccion-resumen" value={interaccionForm.resumen} onChange={e => setInteraccionForm(f => ({ ...f, resumen: e.target.value }))} placeholder="Describe la interaccion..." /></div>
            <div><Label>Resultado</Label><Input data-testid="interaccion-resultado" value={interaccionForm.resultado} onChange={e => setInteraccionForm(f => ({ ...f, resultado: e.target.value }))} placeholder="Resultado (opcional)" /></div>
          </div>
          <DialogFooter><Button onClick={handleCreateInteraccion} data-testid="save-interaccion-btn">Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTarea} onOpenChange={setShowTarea}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva tarea</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Tipo</Label><Select value={tareaForm.tipo} onValueChange={v => setTareaForm(f => ({ ...f, tipo: v }))}><SelectTrigger data-testid="tarea-tipo"><SelectValue /></SelectTrigger><SelectContent>{TIPO_TAREA.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Vencimiento</Label><Input type="datetime-local" data-testid="tarea-due" value={tareaForm.due_at} onChange={e => setTareaForm(f => ({ ...f, due_at: e.target.value }))} /></div>
            <div><Label>Prioridad (1-5)</Label><Input type="number" min={1} max={5} data-testid="tarea-prioridad" value={tareaForm.prioridad} onChange={e => setTareaForm(f => ({ ...f, prioridad: parseInt(e.target.value) || 3 }))} /></div>
            <div><Label>Descripcion</Label><Textarea data-testid="tarea-descripcion" value={tareaForm.descripcion} onChange={e => setTareaForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Descripcion de la tarea..." /></div>
          </div>
          <DialogFooter><Button onClick={handleCreateTarea} data-testid="save-tarea-btn">Crear tarea</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showVincularConfirm} onOpenChange={setShowVincularConfirm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Vincular contacto</DialogTitle><DialogDescription>Vincular <strong>{vincularTarget?.name}</strong> a <strong>{partnerName}</strong></DialogDescription></DialogHeader>
          <div className="space-y-4">
            {vincularTarget && (
              <div className="bg-slate-50 rounded-md p-3 space-y-1 text-xs">
                <p><span className="text-slate-500">Nombre:</span> <span className="font-medium">{vincularTarget.name}</span></p>
                {vincularTarget.vat && <p><span className="text-slate-500">DNI/RUC:</span> <span className="font-mono">{vincularTarget.vat}</span></p>}
                {vincularTarget.phone && <p><span className="text-slate-500">Telefono:</span> {vincularTarget.phone}</p>}
                {vincularTarget.city && <p><span className="text-slate-500">Ciudad:</span> {vincularTarget.city}</p>}
              </div>
            )}
            <div>
              <Label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Nota (opcional)</Label>
              <Input data-testid="vincular-nota" value={vincularNota} onChange={e => setVincularNota(e.target.value)} placeholder="Vinculado manualmente" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVincularConfirm(false)}>Cancelar</Button>
            <Button onClick={handleVincular} disabled={vincularLoading} data-testid="confirm-vincular-btn">
              {vincularLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!detailMode && selectedOrder && <OrderLinesDrawer order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
      {!detailMode && selectedInvoice && <InvoiceLinesDrawer invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} />}
    </div>
  );
}
