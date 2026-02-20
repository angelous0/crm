import React, { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, ChevronLeft, ChevronRight, List } from "lucide-react";
import { toast } from "sonner";
import { InvoiceLinesDrawer } from "@/components/DetailDrawers";

const fmtMoney = (n) => "S/ " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (n) => Number(n || 0).toLocaleString("es-PE");
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "-";

export function CreditosTab({ cuentaId }) {
  const [data, setData] = useState({ rows: [], has_next: false });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [detailMode, setDetailMode] = useState(false);
  const [linesData, setLinesData] = useState({ rows: [], has_next: false });
  const [linesPage, setLinesPage] = useState(1);
  const [linesLoading, setLinesLoading] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  const fetchInvoices = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const r = await api.get(`/cuentas/${cuentaId}/creditos/invoices`, { params: { page: pg, limit: 50 } });
      setData(r.data || { rows: [], has_next: false });
      setPage(pg);
    } catch { toast.error("Error cargando creditos"); }
    finally { setLoading(false); }
  }, [cuentaId]);

  const fetchLines = useCallback(async (pg = 1) => {
    setLinesLoading(true);
    try {
      const r = await api.get(`/cuentas/${cuentaId}/creditos/lines`, { params: { page: pg, limit: 50 } });
      setLinesData(r.data || { rows: [], has_next: false });
      setLinesPage(pg);
    } catch { toast.error("Error cargando lineas"); }
    finally { setLinesLoading(false); }
  }, [cuentaId]);

  useEffect(() => { fetchInvoices(1); }, [fetchInvoices]);

  const rows = detailMode ? linesData.rows || [] : data.rows || [];
  const hasNext = detailMode ? linesData.has_next : data.has_next;
  const curPage = detailMode ? linesPage : page;
  const curLoading = detailMode ? linesLoading : loading;

  return (
    <div data-testid="section-creditos">
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
                  <TableHead className="text-xs">Factura</TableHead>
                  {detailMode && <TableHead className="text-xs">Modelo</TableHead>}
                  {detailMode && <TableHead className="text-xs">Talla</TableHead>}
                  <TableHead className="text-xs">Estado</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                  {!detailMode && <TableHead className="text-xs text-right">Saldo</TableHead>}
                  <TableHead className="text-xs text-right">Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={detailMode ? 7 : 7} className="h-20 text-center text-slate-500">Sin datos</TableCell></TableRow>
                ) : rows.map((r, i) => (
                  <TableRow key={detailMode ? `${r.invoice_id}-${r.line_id}` : r.invoice_id}
                    className={`${!detailMode ? "cursor-pointer" : ""} ${i % 2 ? "bg-slate-50/30" : ""} hover:bg-blue-50`}
                    onClick={() => !detailMode && setSelectedInvoice(r)}>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDate(detailMode ? (r.date_invoice ? r.date_invoice + "T00:00:00" : null) : (r.date_invoice ? r.date_invoice + "T00:00:00" : null))}</TableCell>
                    <TableCell className="text-xs font-mono text-slate-500">{r.invoice_number || "-"}</TableCell>
                    {detailMode && <TableCell className="text-xs truncate max-w-[140px]">{r.modelo_display || r.line_description || "-"}</TableCell>}
                    {detailMode && <TableCell className="text-xs">{r.talla || "-"}</TableCell>}
                    <TableCell className="text-xs">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium ${r.state === "open" ? "bg-amber-100 text-amber-700" : r.state === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                        {r.state === "open" ? "Abierta" : r.state === "paid" ? "Pagada" : r.state}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono">{fmtMoney(detailMode ? r.price_subtotal : r.amount_total)}</TableCell>
                    {!detailMode && (
                      <TableCell className="text-xs text-right font-mono">
                        {r.amount_residual > 0 ? <span className="text-red-600 font-semibold">{fmtMoney(r.amount_residual)}</span> : <span className="text-slate-400">{fmtMoney(0)}</span>}
                      </TableCell>
                    )}
                    <TableCell className="text-xs text-right font-mono font-semibold">{fmtNum(detailMode ? r.qty : r.qty_total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {(curPage > 1 || hasNext) && (
            <div className="flex items-center justify-between px-3 py-2 border-t text-xs text-slate-500">
              <span>Pag {curPage}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={curPage <= 1} onClick={() => detailMode ? fetchLines(curPage - 1) : fetchInvoices(curPage - 1)}><ChevronLeft size={14} /></Button>
                <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => detailMode ? fetchLines(curPage + 1) : fetchInvoices(curPage + 1)}><ChevronRight size={14} /></Button>
              </div>
            </div>
          )}
        </div>
      )}
      {!detailMode && selectedInvoice && <InvoiceLinesDrawer invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} />}
    </div>
  );
}
