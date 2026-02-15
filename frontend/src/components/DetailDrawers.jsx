import React, { useState, useEffect } from "react";
import api from "@/lib/api";
import { Loader2, X, ChevronLeft, ChevronRight } from "lucide-react";

function fmtNum(n) { return Number(n || 0).toLocaleString("es-PE"); }
function fmtMoney(n) { return "S/ " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export function OrderLinesDrawer({ order, onClose }) {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);

  useEffect(() => {
    if (!order) return;
    setLoading(true);
    api.get(`/comercial/orders/${order.order_id}/lines`, { params: { page, limit: 100 } })
      .then(r => { setLines(r.data.items || []); setHasNext(r.data.has_next || false); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [order, page]);

  if (!order) return null;
  return (
    <DrawerShell title={`Orden ${order.order_name || order.order_id}`} subtitle={`${order.owner_partner_name || "-"} | ${fmtNum(order.qty_total)} uds | ${order.lines_count} lineas`} onClose={onClose}>
      {loading ? <Spinner /> : (
        <>
          <LinesTable rows={lines} type="order" />
          <Pager page={page} hasNext={hasNext} onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} />
        </>
      )}
    </DrawerShell>
  );
}

export function InvoiceLinesDrawer({ invoice, onClose }) {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);

  useEffect(() => {
    if (!invoice) return;
    setLoading(true);
    api.get(`/creditos/invoices/${invoice.invoice_id}/lines`, { params: { page, limit: 100 } })
      .then(r => { setLines(r.data.items || []); setHasNext(r.data.has_next || false); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [invoice, page]);

  if (!invoice) return null;
  return (
    <DrawerShell title={`Factura ${invoice.invoice_number || invoice.invoice_id}`}
      subtitle={`${invoice.partner_name || invoice.owner_partner_name || "-"} | ${fmtNum(invoice.qty_total)} uds | Saldo: ${fmtMoney(invoice.amount_residual)}`}
      onClose={onClose}>
      {loading ? <Spinner /> : (
        <>
          <LinesTable rows={lines} type="invoice" />
          <Pager page={page} hasNext={hasNext} onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} />
        </>
      )}
    </DrawerShell>
  );
}

function DrawerShell({ title, subtitle, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex" data-testid="detail-drawer">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="ml-auto relative w-full max-w-2xl bg-white shadow-2xl flex flex-col h-full animate-in slide-in-from-right-full duration-200">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50 shrink-0">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
            <p className="text-[10px] text-slate-500">{subtitle}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-200" data-testid="close-drawer"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-auto p-0">{children}</div>
      </div>
    </div>
  );
}

function LinesTable({ rows, type }) {
  if (!rows.length) return <p className="text-center py-8 text-slate-400 text-xs">Sin lineas</p>;
  const isInv = type === "invoice";
  return (
    <table className="w-full text-[10px] border-collapse" data-testid="lines-table">
      <thead className="sticky top-0 bg-slate-100 z-10">
        <tr>
          <th className="text-left px-2 py-1.5 font-semibold">Modelo</th>
          <th className="text-left px-2 py-1.5 font-semibold">Marca</th>
          <th className="text-left px-2 py-1.5 font-semibold">Tipo</th>
          <th className="text-left px-2 py-1.5 font-semibold">Talla</th>
          <th className="text-left px-2 py-1.5 font-semibold">Color</th>
          <th className="text-right px-2 py-1.5 font-semibold">Qty</th>
          <th className="text-right px-2 py-1.5 font-semibold">P.Unit</th>
          {isInv && <th className="text-right px-2 py-1.5 font-semibold">Subtotal</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={`${i % 2 ? "bg-slate-50/50" : ""} hover:bg-blue-50/50`}>
            <td className="px-2 py-1 font-medium truncate max-w-[140px]">{r.modelo_display || r.line_description || "-"}</td>
            <td className="px-2 py-1 text-slate-500">{r.marca || "-"}</td>
            <td className="px-2 py-1 text-slate-500">{r.tipo || "-"}</td>
            <td className="px-2 py-1">{r.talla || "-"}</td>
            <td className="px-2 py-1">{r.color || "-"}</td>
            <td className="px-2 py-1 text-right font-mono">{fmtNum(r.qty || r.quantity)}</td>
            <td className="px-2 py-1 text-right font-mono">{fmtMoney(r.price_unit)}</td>
            {isInv && <td className="px-2 py-1 text-right font-mono">{fmtMoney(r.price_subtotal)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Spinner() {
  return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
}

function Pager({ page, hasNext, onPrev, onNext }) {
  if (page <= 1 && !hasNext) return null;
  return (
    <div className="flex items-center justify-between px-3 py-2 border-t text-[10px] text-slate-500 shrink-0">
      <span>Pagina {page}</span>
      <div className="flex gap-1">
        <button className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40" disabled={page <= 1} onClick={onPrev}><ChevronLeft size={12} /></button>
        <button className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40" disabled={!hasNext} onClick={onNext}><ChevronRight size={12} /></button>
      </div>
    </div>
  );
}
