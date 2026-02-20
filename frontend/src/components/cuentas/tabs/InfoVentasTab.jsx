import React, { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, ChevronRight, Calendar, X, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const fmtMoney = (n) => "S/ " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (n) => Number(n || 0).toLocaleString("es-PE");
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "-";

export function InfoVentasTab({ cuentaId }) {
  const [data, setData] = useState({ rows: [] });
  const [loading, setLoading] = useState(true);
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [sortBy, setSortBy] = useState("ultima_fecha_compra");
  const [sortDir, setSortDir] = useState("desc");
  const [selected, setSelected] = useState(null);
  const [orders, setOrders] = useState({ rows: [], has_next: false });
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderLines, setOrderLines] = useState({ items: [], has_next: false });
  const [orderLinesLoading, setOrderLinesLoading] = useState(false);

  const fetchClasif = useCallback(async (sb, sd) => {
    setLoading(true);
    try {
      const params = { top: 200, sort_by: sb || sortBy, sort_dir: sd || sortDir };
      if (fechaDesde) params.fecha_desde = fechaDesde;
      if (fechaHasta) params.fecha_hasta = fechaHasta;
      const r = await api.get(`/cuentas/${cuentaId}/ventas/clasificacion`, { params });
      setData(r.data || { rows: [] });
    } catch { toast.error("Error cargando clasificacion"); }
    finally { setLoading(false); }
  }, [cuentaId, fechaDesde, fechaHasta, sortBy, sortDir]);

  const fetchOrders = useCallback(async (item, pg = 1) => {
    setOrdersLoading(true);
    try {
      const params = { marca: item.marca || "", tipo: item.tipo || "", entalle: item.entalle || "", page: pg, limit: 50 };
      if (fechaDesde) params.fecha_desde = fechaDesde;
      if (fechaHasta) params.fecha_hasta = fechaHasta;
      const r = await api.get(`/cuentas/${cuentaId}/ventas/clasificacion/orders`, { params });
      setOrders(r.data || { rows: [], has_next: false });
      setOrdersPage(pg);
    } catch { toast.error("Error cargando ordenes"); }
    finally { setOrdersLoading(false); }
  }, [cuentaId, fechaDesde, fechaHasta]);

  const fetchOrderLines = useCallback(async (orderId, pg = 1) => {
    setOrderLinesLoading(true);
    try {
      const r = await api.get(`/comercial/orders/${orderId}/lines`, { params: { page: pg, limit: 100 } });
      setOrderLines(r.data || { items: [], has_next: false });
    } catch { toast.error("Error cargando lineas"); }
    finally { setOrderLinesLoading(false); }
  }, []);

  useEffect(() => { fetchClasif(); }, []);  // eslint-disable-line

  const handleSort = (col) => {
    const newDir = col === sortBy ? (sortDir === "desc" ? "asc" : "desc") : "desc";
    setSortBy(col);
    setSortDir(newDir);
    fetchClasif(col, newDir);
  };

  const SortHead = ({ col, align, children }) => {
    const active = sortBy === col;
    return (
      <TableHead className={`text-xs font-semibold cursor-pointer select-none hover:bg-slate-100 transition-colors ${align === "right" ? "text-right" : ""}`}
        onClick={() => handleSort(col)}>
        <span className="inline-flex items-center gap-0.5">{children}{active && <span className="text-[9px] ml-0.5">{sortDir === "asc" ? "▲" : "▼"}</span>}</span>
      </TableHead>
    );
  };

  const rows = data?.rows || [];

  return (
    <div data-testid="section-info-ventas">
      <div className="flex items-center gap-3 flex-wrap bg-white border border-slate-200 rounded-lg px-4 py-2.5 shadow-sm mb-3">
        <Calendar size={14} className="text-slate-400" />
        <input type="date" className="h-7 text-xs rounded px-2 bg-slate-100 border border-slate-200 outline-none" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
        <span className="text-xs text-slate-400">a</span>
        <input type="date" className="h-7 text-xs rounded px-2 bg-slate-100 border border-slate-200 outline-none" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
        <Button variant="outline" size="sm" onClick={() => fetchClasif()} className="text-xs h-7">Aplicar</Button>
        <span className="ml-auto text-[10px] text-slate-400">{rows.length} clasificaciones</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
      ) : (
        <div className="rounded-md border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead className="text-xs font-semibold">Marca</TableHead>
                  <TableHead className="text-xs font-semibold">Tipo</TableHead>
                  <TableHead className="text-xs font-semibold">Entalle</TableHead>
                  <SortHead col="ultima_fecha_compra">Ult. compra</SortHead>
                  <SortHead col="dias_sin_comprar" align="right">Dias s/c</SortHead>
                  <SortHead col="cantidad" align="right">Qty</SortHead>
                  <SortHead col="ventas" align="right">Ventas</SortHead>
                  <SortHead col="compras" align="right">Compras</SortHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="h-20 text-center text-slate-500">Sin datos</TableCell></TableRow>
                ) : rows.map((r, i) => (
                  <TableRow key={`${r.marca}-${r.tipo}-${r.entalle}`}
                    className={`cursor-pointer ${i % 2 ? "bg-slate-50/30" : ""} hover:bg-blue-50`}
                    onClick={() => { setSelected(r); setSelectedOrder(null); fetchOrders(r, 1); }}>
                    <TableCell className="text-xs font-medium">{r.marca || <span className="text-slate-400 italic">-</span>}</TableCell>
                    <TableCell className="text-xs">{r.tipo || <span className="text-slate-400 italic">-</span>}</TableCell>
                    <TableCell className="text-xs">{r.entalle || <span className="text-slate-400 italic">-</span>}</TableCell>
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
            <div className="px-3 py-2 border-t text-[10px] text-slate-500 flex justify-between">
              <span>{rows.length} items</span>
              <span>Total: <b className="text-emerald-700">{fmtMoney(rows.reduce((s, r) => s + (r.ventas || 0), 0))}</b></span>
            </div>
          )}
        </div>
      )}

      {/* Drawer for orders/lines */}
      {selected && (
        <div className="fixed inset-0 z-50 flex" data-testid="clasif-detail-drawer">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelected(null)} />
          <div className="ml-auto w-full max-w-2xl bg-white shadow-2xl flex flex-col relative z-10 animate-in slide-in-from-right">
            <div className="px-4 py-3 border-b bg-slate-800 text-white shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  {selectedOrder && <button onClick={() => setSelectedOrder(null)} className="text-slate-300 hover:text-white"><ArrowLeft size={16} /></button>}
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold truncate">{[selected.marca, selected.tipo, selected.entalle].filter(Boolean).join(" / ") || "Sin clasificacion"}</h3>
                    <div className="text-[10px] text-slate-300">
                      {selectedOrder ? `Orden ${selectedOrder.order_name || selectedOrder.order_id}` : "Ordenes"}
                    </div>
                  </div>
                </div>
                <button onClick={() => setSelected(null)} className="text-slate-300 hover:text-white"><X size={18} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-auto min-h-0">
              {!selectedOrder ? (
                ordersLoading ? <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div> : (
                  <table className="w-full text-[11px] border-collapse">
                    <thead className="sticky top-0 bg-slate-100 z-10">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold">Fecha</th>
                        <th className="text-left px-3 py-2 font-semibold">Orden</th>
                        <th className="text-right px-3 py-2 font-semibold">Qty</th>
                        <th className="text-right px-3 py-2 font-semibold">Ventas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(orders.rows || []).length === 0 ? (
                        <tr><td colSpan={4} className="text-center py-8 text-slate-400">Sin ordenes</td></tr>
                      ) : orders.rows.map((r, i) => (
                        <tr key={r.order_id} className={`cursor-pointer ${i % 2 ? "bg-slate-50/50" : ""} hover:bg-blue-50`}
                          onClick={() => { setSelectedOrder(r); fetchOrderLines(r.order_id); }}>
                          <td className="px-3 py-1.5">{fmtDate(r.date_order)}</td>
                          <td className="px-3 py-1.5 font-mono text-[10px]">{r.order_name || r.order_id}</td>
                          <td className="px-3 py-1.5 text-right font-mono font-semibold">{fmtNum(r.qty_item)}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-emerald-700 font-semibold">{fmtMoney(r.ventas_item)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              ) : (
                orderLinesLoading ? <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div> : (
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
                      {(orderLines.items || []).length === 0 ? (
                        <tr><td colSpan={6} className="text-center py-8 text-slate-400">Sin lineas</td></tr>
                      ) : orderLines.items.map((r, i) => (
                        <tr key={`${r.order_id}-${r.line_id}`} className={`${i % 2 ? "bg-slate-50/50" : ""}`}>
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
          </div>
        </div>
      )}
    </div>
  );
}
