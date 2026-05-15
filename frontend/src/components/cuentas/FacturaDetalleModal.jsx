import React from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";

const fmtMoney = (n) =>
  "S/. " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" }) : "—";

const STATE_BADGE = {
  open:        "bg-amber-100 text-amber-700 border-amber-200",
  paid:        "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancel:      "bg-slate-100 text-slate-500 border-slate-200",
  draft:       "bg-blue-100 text-blue-700 border-blue-200",
};

const STATE_LABEL = {
  open: "Pendiente", paid: "Pagada", cancel: "Cancelada", draft: "Borrador",
};

export function FacturaDetalleModal({ open, onClose, factura }) {
  if (!factura) return null;

  const pagado = (factura.amount_total || 0) - (factura.amount_residual || 0);
  const diasVencido = factura.date_invoice
    ? Math.floor((Date.now() - new Date(factura.date_invoice).getTime()) / 86400000)
    : 0;
  const isVencida = factura.state === "open" && diasVencido > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent className="max-w-md" data-testid="modal-detalle-factura">
        <DialogHeader>
          <DialogTitle className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1.5">
            <FileText className="h-3 w-3" />
            Factura crédito
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Header número + estado */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-base font-semibold tabular-nums">{factura.invoice_number || "—"}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{fmtDate(factura.date_invoice)}</div>
            </div>
            <Badge variant="outline" className={`text-[10px] font-semibold ${STATE_BADGE[factura.state] || ""}`}>
              {STATE_LABEL[factura.state] || factura.state}
            </Badge>
          </div>

          {/* Montos */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Monto</div>
              <div className="text-sm text-slate-900 mt-0.5 tabular-nums">{fmtMoney(factura.amount_total)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Pagado</div>
              <div className="text-sm text-emerald-700 mt-0.5 tabular-nums">{fmtMoney(pagado)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Saldo</div>
              <div className={`text-sm mt-0.5 tabular-nums font-semibold ${
                (factura.amount_residual || 0) > 0 ? "text-red-600" : "text-slate-900"
              }`}>
                {fmtMoney(factura.amount_residual)}
              </div>
            </div>
          </div>

          {/* Detalle */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t text-[11px] text-slate-500">
            {factura.qty_total != null && (
              <div>
                <div className="uppercase tracking-wider">Unidades</div>
                <div className="text-slate-700 mt-0.5 tabular-nums">{Number(factura.qty_total).toLocaleString("es-PE")}</div>
              </div>
            )}
            {factura.lines_count != null && (
              <div>
                <div className="uppercase tracking-wider">Líneas</div>
                <div className="text-slate-700 mt-0.5 tabular-nums">{factura.lines_count}</div>
              </div>
            )}
            {factura.partner_name && (
              <div className="col-span-2">
                <div className="uppercase tracking-wider">Cliente facturado</div>
                <div className="text-slate-700 mt-0.5">{factura.partner_name}</div>
              </div>
            )}
            {isVencida && (
              <div className="col-span-2">
                <div className="uppercase tracking-wider text-red-500">Días vencida</div>
                <div className="text-red-700 mt-0.5 font-medium tabular-nums">{diasVencido} días</div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
