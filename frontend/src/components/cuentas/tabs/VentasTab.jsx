import React, { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, ChevronLeft, ChevronRight, List } from "lucide-react";
import { toast } from "sonner";
import { OrderLinesDrawer } from "@/components/DetailDrawers";

const fmtMoney = (n) => "S/ " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (n) => Number(n || 0).toLocaleString("es-PE");
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "-";

export function VentasTab({ cuentaId }) {
  const [data, setData] = useState({ rows: [], has_next: false });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [detailMode, setDetailMode] = useState(false);
  const [linesData, setLinesData] = useState({ rows: [], has_next: false });
  const [linesPage, setLinesPage] = useState(1);
  const [linesLoading, setLinesLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const fetchOrders = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const r = await api.get(`/cuentas/${cuentaId}/ventas/orders`, { params: { doc_tipo: "SALE", page: pg, limit: 50 } });
      setData(r.data || { rows: [], has_next: false });
      setPage(pg);
    } catch { toast.error("Error cargando ventas"); }
    finally { setLoading(false); }
  }, [cuentaId]);

  const fetchLines = useCallback(async (pg = 1) => {
    setLinesLoading(true);
    try {
      const r = await api.get(`/cuentas/${cuentaId}/ventas/lines`, { params: { doc_tipo: "SALE", page: pg, limit: 50 } });
      setLinesData(r.data || { rows: [], has_next: false });
      setLinesPage(pg);
    } catch { toast.error("Error cargando lineas"); }
    finally { setLinesLoading(false); }
  }, [cuentaId]);

  useEffect(() => { fetchOrders(1); }, [fetchOrders]);

  const rows = detailMode ? linesData.rows || [] : data.rows || [];
  const hasNext = detailMode ? linesData.has_next : data.has_next;
  const curPage = detailMode ? linesPage : page;
  const curLoading = detailMode ? linesLoading : loading;

  return (
    <div data-testid="section-ventas">
      <div className="flex items-center gap-3 mb-3 bg-white border border-slate-200 rounded-lg px-4 py-2 shadow-sm">
        <Switch checked={detailMode} onCheckedChange={(v) => { setDetailMode(v); if (v) fetchLines(1); }} className="data-[state=checked]:bg-cyan-500" />
        <span className="text-xs text-slate-600"><List size={13} className="inline mr-1" />Modo detalle</span>
      </div>
      {curLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
      ) : (
        <div className="rounded-md border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead className="text-xs">Fecha</TableHead>
                  <TableHead className="text-xs">Orden</TableHead>
                  {detailMode && <TableHead className="text-xs">Modelo</TableHead>}
                  {detailMode && <TableHead className="text-xs">Talla</TableHead>}
                  {detailMode && <TableHead className="text-xs">Color</TableHead>}
                  {!detailMode && <TableHead className="text-xs">Estado</TableHead>}
                  <TableHead className="text-xs text-right">Qty</TableHead>
                  <TableHead className="text-xs text-right">{detailMode ? "P.Unit" : "Total"}</TableHead>
                  <TableHead className="text-xs text-right">{detailMode ? "Subtotal" : "Lineas"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={detailMode ? 8 : 6} className="h-20 text-center text-slate-500">Sin datos</TableCell></TableRow>
                ) : rows.map((r, i) => (
                  <TableRow key={detailMode ? `${r.order_id}-${r.line_id}` : r.order_id}
                    className={`${!detailMode ? "cursor-pointer" : ""} ${i % 2 ? "bg-slate-50/30" : ""} hover:bg-blue-50`}
                    onClick={() => !detailMode && setSelectedOrder(r)}>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDate(detailMode ? r.fecha : r.date_order)}</TableCell>
                    <TableCell className="text-xs font-mono text-slate-500">{r.order_name || r.order_id}</TableCell>
                    {detailMode && <TableCell className="text-xs truncate max-w-[140px]">{r.modelo_display || "-"}</TableCell>}
                    {detailMode && <TableCell className="text-xs">{r.talla || "-"}</TableCell>}
                    {detailMode && <TableCell className="text-xs">{r.color || "-"}</TableCell>}
                    {!detailMode && (
                      <TableCell className="text-xs">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium ${r.state === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{r.state}</span>
                      </TableCell>
                    )}
                    <TableCell className="text-xs text-right font-mono font-semibold">{fmtNum(detailMode ? r.qty : r.qty_total)}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{fmtMoney(detailMode ? r.price_unit : r.amount_total)}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{detailMode ? fmtMoney(r.subtotal) : r.lines_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {(curPage > 1 || hasNext) && (
            <div className="flex items-center justify-between px-3 py-2 border-t text-xs text-slate-500">
              <span>Pag {curPage}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={curPage <= 1} onClick={() => detailMode ? fetchLines(curPage - 1) : fetchOrders(curPage - 1)}><ChevronLeft size={14} /></Button>
                <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => detailMode ? fetchLines(curPage + 1) : fetchOrders(curPage + 1)}><ChevronRight size={14} /></Button>
              </div>
            </div>
          )}
        </div>
      )}
      {!detailMode && selectedOrder && <OrderLinesDrawer order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
    </div>
  );
}
