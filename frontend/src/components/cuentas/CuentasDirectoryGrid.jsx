import React, { useState, useCallback, useRef } from "react";
import { Loader2, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Power, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import api from "@/lib/api";
import { toast } from "sonner";

const fmtDate = (d) => {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
};

const daysSince = (d) => {
  if (!d) return null;
  const diff = Date.now() - new Date(d).getTime();
  return Math.floor(diff / 86400000);
};

const fmtDays = (d) => {
  const days = daysSince(d);
  if (days == null) return "-";
  return `${days}d`;
};

const daysColor = (d) => {
  const days = daysSince(d);
  if (days == null) return "text-slate-400";
  if (days <= 30) return "text-emerald-600 font-semibold";
  if (days <= 90) return "text-blue-600";
  if (days <= 180) return "text-amber-600";
  return "text-red-600 font-semibold";
};

const fmtNum = (n) => n ? Number(n).toLocaleString("es-PE") : "-";
const fmtPct = (v) => {
  if (v == null || v === undefined) return null;
  const p = (v * 100).toFixed(1);
  return v >= 0 ? `+${p}%` : `${p}%`;
};

function pctColor(v) {
  if (v == null || v === undefined) return "text-slate-400";
  if (v > 0) return "text-emerald-600 font-semibold";
  if (v < 0) return "text-red-600 font-semibold";
  return "text-slate-500";
}

/* ─── Column definitions ─── */
const COLUMNS = [
  { key: "name", label: "Cuenta", sortKey: "name", defaultW: 180, minW: 100 },
  { key: "depto", label: "Depto", sortKey: "depto", defaultW: 90, minW: 50 },
  { key: "tienda", label: "Tienda", sortKey: "tienda", defaultW: 100, minW: 60 },
  { key: "last_purchase", label: "Ult. compra", sortKey: "last_purchase", defaultW: 100, minW: 70 },
  { key: "hace", label: "Hace", sortKey: "last_purchase", defaultW: 55, minW: 40, align: "right" },
  { key: "qty_12m", label: "Cant. 12m", sortKey: "qty_12m", defaultW: 65, minW: 45, align: "right" },
  { key: "orders_12m", label: "#Comp. 12m", sortKey: "orders_12m", defaultW: 70, minW: 45, align: "right" },
  { key: "qty_total", label: "Cant. Total", sortKey: "qty_total", defaultW: 70, minW: 45, align: "right" },
  { key: "orders_total", label: "#Comp. Total", sortKey: "orders_total", defaultW: 75, minW: 50, align: "right" },
  { key: "tel", label: "Tel", defaultW: 110, minW: 60 },
  { key: "pct_ytd", label: "%YTD", sortKey: "pct_ytd", defaultW: 65, minW: 45, align: "right" },
];

/* ─── Resize Handle ─── */
function ResizeHandle({ onResize }) {
  const startRef = useRef(null);

  const onMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    startRef.current = e.clientX;
    const onMove = (ev) => {
      const delta = ev.clientX - startRef.current;
      startRef.current = ev.clientX;
      onResize(delta);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return (
    <div
      onMouseDown={onMouseDown}
      className="absolute right-0 top-0 bottom-0 w-[5px] cursor-col-resize group z-20 hover:bg-blue-400/30 active:bg-blue-500/40"
      style={{ touchAction: "none" }}
    >
      <div className="absolute right-0 top-1 bottom-1 w-[1px] bg-slate-300 group-hover:bg-blue-400 group-active:bg-blue-500 transition-colors" />
    </div>
  );
}

/* ─── Sort Header with resize ─── */
function SortHeaderResizable({ col, currentSort, currentDir, onSort, width, onResize }) {
  const active = col.sortKey && currentSort === col.sortKey;
  const align = col.align === "right" ? "text-right" : "text-left";
  return (
    <th
      className={`relative py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 select-none whitespace-nowrap ${align} ${col.sortKey ? "cursor-pointer hover:bg-slate-100 transition-colors" : ""}`}
      style={{ width: `${width}px`, minWidth: `${col.minW}px`, maxWidth: `${width}px`, paddingLeft: 8, paddingRight: 12 }}
      onClick={() => col.sortKey && onSort(col.sortKey)}
      data-testid={`sort-${col.key}`}
    >
      <span className="inline-flex items-center gap-0.5">
        {col.label}
        {col.sortKey && (active ? (
          currentDir === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />
        ) : (
          <ArrowUpDown size={9} className="opacity-30" />
        ))}
      </span>
      <ResizeHandle onResize={(delta) => onResize(col.key, delta)} />
    </th>
  );
}

const COL_COUNT = COLUMNS.length + 1; // +1 for checkbox

export function CuentasDirectoryGrid({ rows, loading, selectedId, onSelectRow, sort, dir, onSort, page, totalPages, onPageChange, onRefresh }) {
  const [selected, setSelected] = useState(new Set());
  const [batchLoading, setBatchLoading] = useState(false);

  // Column widths state
  const [colWidths, setColWidths] = useState(() => {
    const saved = localStorage.getItem("crm_col_widths");
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    return Object.fromEntries(COLUMNS.map(c => [c.key, c.defaultW]));
  });

  const handleResize = useCallback((key, delta) => {
    setColWidths(prev => {
      const col = COLUMNS.find(c => c.key === key);
      const newW = Math.max(col?.minW || 40, (prev[key] || col?.defaultW || 80) + delta);
      const next = { ...prev, [key]: newW };
      localStorage.setItem("crm_col_widths", JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleOne = useCallback((id, e) => {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map(r => r.id)));
  }, [rows, selected.size]);

  const handleBatch = useCallback(async (activate) => {
    const ids = [...selected];
    if (!ids.length) return;
    setBatchLoading(true);
    try {
      const r = await api.patch("/cuentas/batch-active", { ids, is_active: activate, reason: activate ? null : "MANUAL" });
      const d = r.data;
      toast.success(activate
        ? `${d.cuentas_affected} cuenta(s) activadas, ${d.contactos_affected} contacto(s) reactivados`
        : `${d.cuentas_affected} cuenta(s) inactivadas, ${d.contactos_affected} contacto(s) en cascada`);
      setSelected(new Set());
      if (onRefresh) onRefresh();
    } catch { toast.error("Error en operacion masiva"); }
    finally { setBatchLoading(false); }
  }, [selected, onRefresh]);

  const allChecked = rows.length > 0 && selected.size === rows.length;
  const someChecked = selected.size > 0;
  const tableMinW = 28 + Object.values(colWidths).reduce((s, w) => s + w, 0);

  return (
    <div className="flex flex-col h-full" data-testid="directory-grid">
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
        <table className="border-collapse text-xs" style={{ minWidth: `${tableMinW}px` }}>
          <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="w-[28px] px-1 py-2" style={{ minWidth: 28, maxWidth: 28 }}>
                <Checkbox checked={allChecked} onCheckedChange={toggleAll} className="scale-[0.8]" data-testid="select-all-cuentas" />
              </th>
              {COLUMNS.map(col => (
                <SortHeaderResizable
                  key={col.key}
                  col={col}
                  currentSort={sort}
                  currentDir={dir}
                  onSort={onSort}
                  width={colWidths[col.key] || col.defaultW}
                  onResize={handleResize}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={COL_COUNT} className="h-32 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-slate-400" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={COL_COUNT} className="h-32 text-center text-slate-400 text-xs">No se encontraron cuentas</td></tr>
            ) : rows.map((r) => {
              const isSelected = selectedId === r.id;
              const isChecked = selected.has(r.id);
              const inactive = r.is_active === false;
              const pctVal = r.pct_vs_avg_ytd;
              return (
                <tr
                  key={r.id}
                  onClick={() => onSelectRow(r.id)}
                  className={`cursor-pointer border-b border-slate-100 transition-colors h-[38px]
                    ${isChecked ? "bg-blue-100/60" : isSelected ? "bg-blue-50 border-l-2 border-l-blue-500" : "hover:bg-slate-50 border-l-2 border-l-transparent"}
                    ${inactive ? "opacity-60" : ""}`}
                  data-testid={`dir-row-${r.id}`}
                >
                  <td className="px-1 py-1 w-[28px]" onClick={e => e.stopPropagation()}>
                    <Checkbox checked={isChecked} onCheckedChange={() => toggleOne(r.id, { stopPropagation: () => {} })}
                      className="scale-[0.75]" data-testid={`check-${r.id}`} />
                  </td>
                  {/* Cuenta */}
                  <td className={`px-2 py-1 font-medium truncate ${inactive ? "text-slate-400 line-through" : "text-slate-900"}`}
                    style={{ maxWidth: colWidths.name || 180 }}
                    data-testid={`name-${r.id}`}>
                    {r.nombre || `ID: ${r.id}`}
                    {inactive && <span className="inline-block ml-1 px-1 py-0.5 rounded text-[7px] font-bold bg-red-600 text-white leading-none align-middle">INACT</span>}
                  </td>
                  {/* Depto */}
                  <td className="px-2 py-1 text-slate-500 truncate"
                    style={{ maxWidth: colWidths.depto || 90 }}
                    data-testid={`depto-${r.id}`}>{r.depto_name || "-"}</td>
                  {/* Tienda */}
                  <td className="px-2 py-1 text-slate-600 truncate text-[10px] font-medium"
                    style={{ maxWidth: colWidths.tienda || 100 }}
                    data-testid={`tienda-${r.id}`}>{r.tienda || "Sin tienda"}</td>
                  {/* Últ. compra (con año) */}
                  <td className="px-2 py-1 text-slate-500 whitespace-nowrap"
                    data-testid={`last-purchase-${r.id}`}>{fmtDate(r.last_purchase_date)}</td>
                  {/* Hace (días) */}
                  <td className={`px-2 py-1 text-right font-mono text-[10px] whitespace-nowrap ${daysColor(r.last_purchase_date)}`}
                    data-testid={`days-since-${r.id}`}>{fmtDays(r.last_purchase_date)}</td>
                  {/* Cant. 12m */}
                  <td className="px-2 py-1 text-right font-mono text-slate-700"
                    data-testid={`qty-${r.id}`}>{fmtNum(r.qty_12m)}</td>
                  {/* #Comp. 12m */}
                  <td className="px-2 py-1 text-right font-mono text-slate-500"
                    data-testid={`orders-${r.id}`}>{fmtNum(r.orders_12m)}</td>
                  {/* Cant. Total */}
                  <td className="px-2 py-1 text-right font-mono text-slate-500"
                    data-testid={`qty-total-${r.id}`}>{fmtNum(r.qty_total)}</td>
                  {/* #Comp. Total */}
                  <td className="px-2 py-1 text-right font-mono text-slate-500"
                    data-testid={`orders-total-${r.id}`}>{fmtNum(r.orders_total)}</td>
                  {/* Tel */}
                  <td className="px-2 py-1 whitespace-nowrap" data-testid={`phone-${r.id}`}>
                    {r.phone_display ? (
                      r.phone_whatsapp ? (
                        <a href={`https://wa.me/${r.phone_whatsapp}`} target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-800 hover:underline"
                          data-testid={`wa-link-${r.id}`}>
                          <MessageCircle size={11} className="shrink-0" />
                          <span className="truncate" style={{ maxWidth: (colWidths.tel || 110) - 20 }}>{r.phone_display}</span>
                        </a>
                      ) : (
                        <span className="text-slate-500 truncate inline-block" style={{ maxWidth: colWidths.tel || 110 }}>{r.phone_display}</span>
                      )
                    ) : <span className="text-slate-300">-</span>}
                  </td>
                  {/* %YTD */}
                  <td className={`px-2 py-1 text-right font-mono text-[10px] ${pctColor(pctVal)}`}
                    data-testid={`pct-${r.id}`}>
                    {fmtPct(pctVal) ?? <span className="text-slate-300">&mdash;</span>}
                  </td>
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
