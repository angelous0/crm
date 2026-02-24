import React, { useState, useCallback } from "react";
import { Loader2, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import api from "@/lib/api";
import { toast } from "sonner";

const fmtMoney = (n) => n ? "S/" + Number(n).toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "-";
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }) : "-";

const estadoColors = {
  ACTIVO: "bg-emerald-100 text-emerald-700",
  NUEVO: "bg-blue-100 text-blue-700",
  SEGUIMIENTO: "bg-amber-100 text-amber-700",
  DORMIDO: "bg-slate-200 text-slate-600",
  NO_VOLVER: "bg-red-100 text-red-700",
};

function daysBadgeColor(days) {
  if (days == null) return "text-slate-400";
  if (days <= 7) return "text-emerald-600 font-semibold";
  if (days <= 30) return "text-amber-600 font-semibold";
  return "text-red-600 font-semibold";
}

function SortHeader({ label, sortKey, currentSort, currentDir, onSort, align }) {
  const active = currentSort === sortKey;
  return (
    <th
      className={`px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 cursor-pointer select-none hover:bg-slate-100 transition-colors whitespace-nowrap ${align === "right" ? "text-right" : "text-left"}`}
      onClick={() => onSort(sortKey)}
      data-testid={`sort-${sortKey}`}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {active ? (
          currentDir === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />
        ) : (
          <ArrowUpDown size={9} className="opacity-30" />
        )}
      </span>
    </th>
  );
}

export function CuentasDirectoryGrid({ rows, loading, selectedId, onSelectRow, sort, dir, onSort, page, totalPages, onPageChange, onRefresh }) {
  const [selected, setSelected] = useState(new Set());
  const [batchLoading, setBatchLoading] = useState(false);

  const toggleOne = useCallback((id, e) => {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map(r => r.id)));
    }
  }, [rows, selected.size]);

  const handleBatch = useCallback(async (activate) => {
    const ids = [...selected];
    if (!ids.length) return;
    setBatchLoading(true);
    try {
      const r = await api.patch("/cuentas/batch-active", {
        ids, is_active: activate, reason: activate ? null : "MANUAL",
      });
      const d = r.data;
      if (activate) {
        toast.success(`${d.cuentas_affected} cuenta(s) activadas, ${d.contactos_affected} contacto(s) reactivados`);
      } else {
        toast.success(`${d.cuentas_affected} cuenta(s) inactivadas, ${d.contactos_affected} contacto(s) en cascada`);
      }
      setSelected(new Set());
      if (onRefresh) onRefresh();
    } catch { toast.error("Error en operacion masiva"); }
    finally { setBatchLoading(false); }
  }, [selected, onRefresh]);

  const allChecked = rows.length > 0 && selected.size === rows.length;
  const someChecked = selected.size > 0;

  return (
    <div className="flex flex-col h-full" data-testid="directory-grid">
      {/* Bulk action bar */}
      {someChecked && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-white text-[11px] animate-in slide-in-from-top duration-150" data-testid="bulk-action-bar">
          <span className="font-semibold">{selected.size} seleccionada(s)</span>
          <Button size="sm" variant="secondary" className="h-6 text-[10px] bg-red-600 hover:bg-red-700 text-white border-0"
            onClick={() => handleBatch(false)} disabled={batchLoading} data-testid="bulk-deactivate">
            {batchLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Power size={11} className="mr-1" />}
            Inactivar ({selected.size})
          </Button>
          <Button size="sm" variant="secondary" className="h-6 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white border-0"
            onClick={() => handleBatch(true)} disabled={batchLoading} data-testid="bulk-activate">
            <Power size={11} className="mr-1" />Activar ({selected.size})
          </Button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-[10px] text-slate-300 hover:text-white" data-testid="bulk-clear">
            Deseleccionar
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full border-collapse text-xs table-fixed" style={{ minWidth: "560px" }}>
          <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="w-[32px] px-1 py-2">
                <Checkbox checked={allChecked} onCheckedChange={toggleAll} className="scale-[0.8]" data-testid="select-all-cuentas" />
              </th>
              <SortHeader label="Cuenta" sortKey="name" currentSort={sort} currentDir={dir} onSort={onSort} />
              <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 text-left whitespace-nowrap w-[70px]">Ciudad</th>
              <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 text-left whitespace-nowrap w-[60px]">Estado</th>
              <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 text-left whitespace-nowrap w-[70px]">Ult. compra</th>
              <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 text-right whitespace-nowrap w-[42px]">Dias</th>
              <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 text-right whitespace-nowrap w-[65px]">Vtas 12m</th>
              <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 text-right whitespace-nowrap w-[34px]">#</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="h-32 text-center">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-slate-400" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="h-32 text-center text-slate-400 text-xs">
                  No se encontraron cuentas
                </td>
              </tr>
            ) : rows.map((r) => {
              const isSelected = selectedId === r.id;
              const isChecked = selected.has(r.id);
              const inactive = r.is_active === false;
              return (
                <tr
                  key={r.id}
                  onClick={() => onSelectRow(r.id)}
                  className={`cursor-pointer border-b border-slate-100 transition-colors h-[44px]
                    ${isChecked ? "bg-blue-100/60" : isSelected ? "bg-blue-50 border-l-2 border-l-blue-500" : "hover:bg-slate-50 border-l-2 border-l-transparent"}
                    ${inactive ? "opacity-60" : ""}`}
                  data-testid={`dir-row-${r.id}`}
                >
                  <td className="px-1 py-1.5 w-[32px]" onClick={e => e.stopPropagation()}>
                    <Checkbox checked={isChecked} onCheckedChange={() => toggleOne(r.id, { stopPropagation: () => {} })}
                      className="scale-[0.8]" data-testid={`check-${r.id}`} />
                  </td>
                  <td className={`px-2 py-1.5 font-medium truncate ${inactive ? "text-slate-400 line-through" : "text-slate-900"}`}>{r.nombre || `ID: ${r.id}`}</td>
                  <td className="px-2 py-1.5 text-slate-500 truncate w-[70px]">{r.ciudad || "-"}</td>
                  <td className="px-2 py-1.5">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold ${estadoColors[r.estado] || "bg-slate-100 text-slate-600"}`}>
                      {r.estado}
                    </span>
                    {inactive && (
                      <span className="inline-block ml-1 px-1 py-0.5 rounded text-[8px] font-bold bg-red-600 text-white">INACT</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-slate-500 whitespace-nowrap">{fmtDate(r.last_purchase_date)}</td>
                  <td className={`px-2 py-1.5 text-right font-mono ${daysBadgeColor(r.days_since_last_purchase)}`}>
                    {r.days_since_last_purchase != null ? r.days_since_last_purchase : "-"}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-slate-700">{r.sales_12m_amount ? fmtMoney(r.sales_12m_amount) : "-"}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-slate-500">{r.orders_12m_count || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-slate-200 bg-slate-50/80 text-[10px] text-slate-500 shrink-0">
          <span>Pag {page}/{totalPages}</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={page <= 1} onClick={() => onPageChange(page - 1)} data-testid="dir-prev-page">
              <ChevronLeft size={12} />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} data-testid="dir-next-page">
              <ChevronRight size={12} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
