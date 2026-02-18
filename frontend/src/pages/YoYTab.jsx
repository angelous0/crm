import React, { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, ArrowLeft, ChevronLeft, ChevronRight, X, TrendingUp, TrendingDown, Minus } from "lucide-react";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const fmtMoney = (v) => v != null ? Number(v).toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "0";
const fmtNum = (v) => v != null ? Number(v).toLocaleString("es-PE", { maximumFractionDigits: 0 }) : "0";
const fmtDate = (v) => v ? new Date(v).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "-";

function VarBadge({ value, suffix = "%" }) {
  if (value == null || value === 0) return <span className="text-slate-400 text-[10px]">0{suffix}</span>;
  const pos = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${pos ? "text-emerald-600" : "text-red-600"}`}>
      {pos ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {pos ? "+" : ""}{typeof value === "number" ? value.toFixed(1) : value}{suffix}
    </span>
  );
}

function KpiCard({ label, valA, valB, pct, yearA, yearB, isMoney }) {
  const fmt = isMoney ? fmtMoney : fmtNum;
  return (
    <div className="bg-white border border-border rounded-lg p-3 shadow-sm" data-testid={`yoy-kpi-${label.toLowerCase().replace(/\s/g,"-")}`}>
      <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide mb-2">{label}</div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-lg font-bold text-slate-800">{isMoney ? "S/ " : ""}{fmt(valA)}</div>
          <div className="text-[10px] text-slate-400">{yearA}</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-slate-500">{isMoney ? "S/ " : ""}{fmt(valB)}</div>
          <div className="text-[10px] text-slate-400">{yearB}</div>
        </div>
      </div>
      <div className="mt-1.5 border-t pt-1.5"><VarBadge value={pct} /></div>
    </div>
  );
}

/* ── Orders Drill-down Drawer (2-level) ── */
function YoYOrdersDrawer({ item, year, cuentaId, onClose }) {
  const [orders, setOrders] = useState({ rows: [], has_next: false });
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selOrder, setSelOrder] = useState(null);
  const [lines, setLines] = useState({ items: [], has_next: false });
  const [linesPage, setLinesPage] = useState(1);
  const [linesLoading, setLinesLoading] = useState(false);

  const fetchOrders = useCallback(async (pg = 1) => {
    setOrdersLoading(true);
    try {
      const r = await api.get(`/cuentas/${cuentaId}/ventas/yoy/item-orders`, {
        params: { year, marca: item.marca || "", tipo: item.tipo || "", entalle: item.entalle || "", tela: item.tela || "", page: pg, limit: 50 }
      });
      setOrders(r.data || { rows: [], has_next: false });
      setOrdersPage(pg);
    } catch { toast.error("Error cargando ordenes"); }
    finally { setOrdersLoading(false); }
  }, [cuentaId, year, item]);

  const fetchLines = useCallback(async (orderId, pg = 1) => {
    setLinesLoading(true);
    try {
      const r = await api.get(`/comercial/orders/${orderId}/lines`, { params: { page: pg, limit: 100 } });
      setLines(r.data || { items: [], has_next: false });
      setLinesPage(pg);
    } catch { toast.error("Error cargando lineas"); }
    finally { setLinesLoading(false); }
  }, []);

  useEffect(() => { fetchOrders(1); }, [fetchOrders]);

  const title = [item.marca, item.tipo, item.entalle, item.tela].filter(Boolean).join(" / ") || "Sin clasificacion";
  const showingLines = !!selOrder;

  return (
    <div className="fixed inset-0 z-50 flex" data-testid="yoy-orders-drawer">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="ml-auto w-full max-w-2xl bg-white shadow-2xl flex flex-col relative z-10 animate-in slide-in-from-right">
        <div className="px-4 py-3 border-b bg-slate-800 text-white shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              {showingLines && <button onClick={() => { setSelOrder(null); setLines({ items: [], has_next: false }); }} className="text-slate-300 hover:text-white" data-testid="yoy-back-to-orders"><ArrowLeft size={16} /></button>}
              <div className="min-w-0">
                <h3 className="text-sm font-bold truncate">{title} ({year})</h3>
                <div className="flex items-center gap-1 text-[10px] text-slate-300">
                  <span className={showingLines ? "cursor-pointer hover:text-white underline" : ""} onClick={showingLines ? () => { setSelOrder(null); setLines({ items: [], has_next: false }); } : undefined}>Ordenes</span>
                  {showingLines && <><ChevronRight size={10} /><span className="text-white font-medium truncate">{selOrder.order_name}</span></>}
                </div>
              </div>
            </div>
            <button onClick={onClose} className="text-slate-300 hover:text-white" data-testid="close-yoy-drawer"><X size={18} /></button>
          </div>
        </div>
        <div className="flex-1 overflow-auto min-h-0">
          {!showingLines ? (
            ordersLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div> : (
              <table className="w-full text-[11px] border-collapse">
                <thead className="sticky top-0 bg-slate-100 z-10"><tr>
                  <th className="text-left px-3 py-2 font-semibold">Fecha</th>
                  <th className="text-left px-3 py-2 font-semibold">Orden</th>
                  <th className="text-right px-3 py-2 font-semibold">Lineas</th>
                  <th className="text-right px-3 py-2 font-semibold">Qty</th>
                  <th className="text-right px-3 py-2 font-semibold">Ventas (S/)</th>
                </tr></thead>
                <tbody>
                  {(orders.rows || []).length === 0 ? <tr><td colSpan={5} className="text-center py-8 text-slate-400">Sin ordenes</td></tr>
                  : orders.rows.map((r, i) => (
                    <tr key={r.order_id} className={`cursor-pointer ${i % 2 ? "bg-slate-50/50" : ""} hover:bg-blue-50`}
                      onClick={() => { setSelOrder(r); fetchLines(r.order_id, 1); }} data-testid={`yoy-order-row-${i}`}>
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
            linesLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div> : (
              <table className="w-full text-[10px] border-collapse">
                <thead className="sticky top-0 bg-slate-100 z-10"><tr>
                  <th className="text-left px-2 py-1.5 font-semibold">Modelo</th>
                  <th className="text-left px-2 py-1.5 font-semibold">Talla</th>
                  <th className="text-left px-2 py-1.5 font-semibold">Color</th>
                  <th className="text-right px-2 py-1.5 font-semibold">Qty</th>
                  <th className="text-right px-2 py-1.5 font-semibold">P.Unit</th>
                  <th className="text-right px-2 py-1.5 font-semibold">Subtotal</th>
                </tr></thead>
                <tbody>
                  {(lines.items || []).length === 0 ? <tr><td colSpan={6} className="text-center py-8 text-slate-400">Sin lineas</td></tr>
                  : lines.items.map((r, i) => (
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
        {!showingLines && (ordersPage > 1 || orders.has_next) && (
          <div className="flex items-center justify-between px-3 py-2 border-t text-[10px] text-slate-500 shrink-0">
            <span>Pag {ordersPage}</span>
            <div className="flex gap-1">
              <button className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40" disabled={ordersPage <= 1} onClick={() => fetchOrders(ordersPage - 1)}><ChevronLeft size={12} /></button>
              <button className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40" disabled={!orders.has_next} onClick={() => fetchOrders(ordersPage + 1)}><ChevronRight size={12} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main YoY Tab ── */
export default function YoYTab({ cuentaId }) {
  const now = new Date();
  const [yearA, setYearA] = useState(now.getFullYear());
  const [yearB, setYearB] = useState(now.getFullYear() - 1);
  const [fromMonth, setFromMonth] = useState("");
  const [toMonth, setToMonth] = useState("");

  const [metrics, setMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [months, setMonths] = useState([]);
  const [monthsLoading, setMonthsLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [sortBy, setSortBy] = useState("ventas_a");
  const [sortDir, setSortDir] = useState("desc");

  const [drawerItem, setDrawerItem] = useState(null);
  const [drawerYear, setDrawerYear] = useState(null);

  const years = Array.from({ length: 8 }, (_, i) => now.getFullYear() - i);

  const commonParams = useCallback(() => {
    const p = { year_a: yearA, year_b: yearB };
    if (fromMonth) p.from_month = fromMonth;
    if (toMonth) p.to_month = toMonth;
    return p;
  }, [yearA, yearB, fromMonth, toMonth]);

  const fetchAll = useCallback(async (sb, sd) => {
    const p = commonParams();
    setMetricsLoading(true);
    setMonthsLoading(true);
    setItemsLoading(true);
    try {
      const [mRes, moRes, iRes] = await Promise.all([
        api.get(`/cuentas/${cuentaId}/ventas/yoy/metrics`, { params: p }),
        api.get(`/cuentas/${cuentaId}/ventas/yoy/by-month`, { params: p }),
        api.get(`/cuentas/${cuentaId}/ventas/yoy/by-item`, { params: { ...p, sort_by: sb || sortBy, sort_dir: sd || sortDir, top: 300 } }),
      ]);
      setMetrics(mRes.data);
      setMonths(moRes.data?.months || []);
      setItems(iRes.data?.rows || []);
    } catch { toast.error("Error cargando datos YoY"); }
    finally { setMetricsLoading(false); setMonthsLoading(false); setItemsLoading(false); }
  }, [cuentaId, commonParams, sortBy, sortDir]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleSort = (col) => {
    const newDir = col === sortBy ? (sortDir === "desc" ? "asc" : "desc") : "desc";
    setSortBy(col);
    setSortDir(newDir);
    fetchAll(col, newDir);
  };

  const SortHead = ({ col, align, children }) => {
    const active = sortBy === col;
    return (
      <TableHead className={`text-[10px] font-semibold cursor-pointer select-none hover:bg-slate-100 ${align === "right" ? "text-right" : ""}`}
        onClick={() => handleSort(col)} data-testid={`yoy-sort-${col}`}>
        <span className="inline-flex items-center gap-0.5">{children}{active && <span className="text-[8px] ml-0.5">{sortDir === "asc" ? "▲" : "▼"}</span>}</span>
      </TableHead>
    );
  };

  const delta = metrics?.delta || {};
  const ya = metrics?.year_a || {};
  const yb = metrics?.year_b || {};

  return (
    <div className="space-y-4" data-testid="yoy-tab">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap bg-white border border-border rounded-lg px-4 py-2.5 shadow-sm" data-testid="yoy-controls">
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-slate-500 font-medium">Ano A</label>
          <Select value={String(yearA)} onValueChange={(v) => setYearA(Number(v))}>
            <SelectTrigger className="h-7 w-20 text-xs" data-testid="yoy-year-a"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-slate-500 font-medium">Ano B</label>
          <Select value={String(yearB)} onValueChange={(v) => setYearB(Number(v))}>
            <SelectTrigger className="h-7 w-20 text-xs" data-testid="yoy-year-b"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-slate-500 font-medium">Meses</label>
          <Select value={fromMonth || "all"} onValueChange={(v) => setFromMonth(v === "all" ? "" : v)}>
            <SelectTrigger className="h-7 w-16 text-xs" data-testid="yoy-from-month"><SelectValue placeholder="Desde" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo</SelectItem>
              {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-[10px] text-slate-400">a</span>
          <Select value={toMonth || "all"} onValueChange={(v) => setToMonth(v === "all" ? "" : v)}>
            <SelectTrigger className="h-7 w-16 text-xs" data-testid="yoy-to-month"><SelectValue placeholder="Hasta" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo</SelectItem>
              {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchAll()} className="text-xs h-7" data-testid="yoy-apply">Aplicar</Button>
      </div>

      {/* KPIs */}
      {metricsLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
      ) : metrics && (
        <div className="grid grid-cols-3 gap-3" data-testid="yoy-kpis">
          <KpiCard label="Ventas" valA={ya.ventas} valB={yb.ventas} pct={delta.ventas_pct} yearA={yearA} yearB={yearB} isMoney />
          <KpiCard label="Unidades" valA={ya.unidades} valB={yb.unidades} pct={delta.unidades_pct} yearA={yearA} yearB={yearB} />
          <KpiCard label="Compras" valA={ya.compras} valB={yb.compras} pct={delta.compras_pct} yearA={yearA} yearB={yearB} />
        </div>
      )}

      {/* Monthly Table */}
      <div className="bg-white border border-border rounded-lg shadow-sm overflow-hidden">
        <div className="px-3 py-2 border-b bg-slate-50/80">
          <h4 className="text-xs font-semibold text-slate-700">Serie Mensual</h4>
        </div>
        {monthsLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] border-collapse">
              <thead className="bg-slate-50"><tr>
                <th className="text-left px-2 py-1.5 font-semibold">Mes</th>
                <th className="text-right px-2 py-1.5 font-semibold">Ventas {yearA}</th>
                <th className="text-right px-2 py-1.5 font-semibold">Ventas {yearB}</th>
                <th className="text-right px-2 py-1.5 font-semibold">Var %</th>
                <th className="text-right px-2 py-1.5 font-semibold">Uds {yearA}</th>
                <th className="text-right px-2 py-1.5 font-semibold">Uds {yearB}</th>
                <th className="text-right px-2 py-1.5 font-semibold"># {yearA}</th>
                <th className="text-right px-2 py-1.5 font-semibold"># {yearB}</th>
              </tr></thead>
              <tbody>
                {months.length === 0 ? <tr><td colSpan={8} className="text-center py-6 text-slate-400">Sin datos</td></tr>
                : months.map((r) => {
                  const pct = r.ventas_b ? ((r.ventas_a - r.ventas_b) / r.ventas_b * 100) : (r.ventas_a ? 100 : 0);
                  return (
                    <tr key={r.month} className="hover:bg-blue-50/50" data-testid={`yoy-month-${r.month}`}>
                      <td className="px-2 py-1 font-medium">{MONTHS[r.month - 1]}</td>
                      <td className="px-2 py-1 text-right font-mono font-semibold">{fmtMoney(r.ventas_a)}</td>
                      <td className="px-2 py-1 text-right font-mono text-slate-500">{fmtMoney(r.ventas_b)}</td>
                      <td className="px-2 py-1 text-right"><VarBadge value={pct} /></td>
                      <td className="px-2 py-1 text-right font-mono">{fmtNum(r.unidades_a)}</td>
                      <td className="px-2 py-1 text-right font-mono text-slate-500">{fmtNum(r.unidades_b)}</td>
                      <td className="px-2 py-1 text-right font-mono">{fmtNum(r.compras_a)}</td>
                      <td className="px-2 py-1 text-right font-mono text-slate-500">{fmtNum(r.compras_b)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mix by Classification */}
      <div className="bg-white border border-border rounded-lg shadow-sm overflow-hidden">
        <div className="px-3 py-2 border-b bg-slate-50/80 flex items-center justify-between">
          <h4 className="text-xs font-semibold text-slate-700">Mix por Clasificacion</h4>
          <span className="text-[10px] text-slate-400">{items.length} items</span>
        </div>
        {itemsLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead className="text-[10px] font-semibold">Marca</TableHead>
                  <TableHead className="text-[10px] font-semibold">Tipo</TableHead>
                  <TableHead className="text-[10px] font-semibold">Entalle</TableHead>
                  <TableHead className="text-[10px] font-semibold">Tela</TableHead>
                  <SortHead col="ventas_a" align="right">V. {yearA}</SortHead>
                  <SortHead col="ventas_b" align="right">V. {yearB}</SortHead>
                  <SortHead col="var_abs" align="right">Var S/</SortHead>
                  <TableHead className="text-[10px] text-right font-semibold">Var %</TableHead>
                  <SortHead col="unidades_a" align="right">U. {yearA}</SortHead>
                  <SortHead col="unidades_b" align="right">U. {yearB}</SortHead>
                  <SortHead col="compras_a" align="right"># {yearA}</SortHead>
                  <SortHead col="compras_b" align="right"># {yearB}</SortHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow><TableCell colSpan={12} className="h-16 text-center text-slate-400">Sin datos</TableCell></TableRow>
                ) : items.map((r, i) => (
                  <TableRow key={`${r.marca}-${r.tipo}-${r.entalle}-${r.tela}`}
                    className={`cursor-pointer ${i % 2 ? "bg-slate-50/30" : ""} hover:bg-blue-50 transition-colors`}
                    onClick={() => { setDrawerItem(r); setDrawerYear(yearA); }} data-testid={`yoy-item-row-${i}`}>
                    <TableCell className="text-[10px] font-medium">{r.marca || <span className="text-slate-400 italic">-</span>}</TableCell>
                    <TableCell className="text-[10px]">{r.tipo || <span className="text-slate-400 italic">-</span>}</TableCell>
                    <TableCell className="text-[10px]">{r.entalle || <span className="text-slate-400 italic">-</span>}</TableCell>
                    <TableCell className="text-[10px]">{r.tela || <span className="text-slate-400 italic">-</span>}</TableCell>
                    <TableCell className="text-[10px] text-right font-mono font-semibold text-emerald-700">{fmtMoney(r.ventas_a)}</TableCell>
                    <TableCell className="text-[10px] text-right font-mono text-slate-500">{fmtMoney(r.ventas_b)}</TableCell>
                    <TableCell className={`text-[10px] text-right font-mono font-semibold ${r.var_abs > 0 ? "text-emerald-600" : r.var_abs < 0 ? "text-red-600" : "text-slate-400"}`}>
                      {r.var_abs > 0 ? "+" : ""}{fmtMoney(r.var_abs)}
                    </TableCell>
                    <TableCell className="text-[10px] text-right"><VarBadge value={r.var_pct} /></TableCell>
                    <TableCell className="text-[10px] text-right font-mono">{fmtNum(r.unidades_a)}</TableCell>
                    <TableCell className="text-[10px] text-right font-mono text-slate-500">{fmtNum(r.unidades_b)}</TableCell>
                    <TableCell className="text-[10px] text-right font-mono">{fmtNum(r.compras_a)}</TableCell>
                    <TableCell className="text-[10px] text-right font-mono text-slate-500">{fmtNum(r.compras_b)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Drill-down Drawer */}
      {drawerItem && (
        <YoYOrdersDrawer item={drawerItem} year={drawerYear} cuentaId={cuentaId} onClose={() => setDrawerItem(null)} />
      )}
    </div>
  );
}
