import React, { useState, useEffect } from "react";
import api from "@/lib/api";
import { Loader2, ShoppingBag, CreditCard, BarChart3, TrendingUp, Activity, MessageSquare, CheckSquare } from "lucide-react";

const fmtMoney = (n) => "S/ " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }) : "-";
const fmtNum = (n) => Number(n || 0).toLocaleString("es-PE");

export function ResumenTab({ cuentaId, headerMetrics, onNavigate }) {
  const [metrics, setMetrics] = useState({ sale: null, reserva: null, creditos: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get(`/cuentas/${cuentaId}/ventas/metrics`, { params: { doc_tipo: "SALE" } }),
      api.get(`/cuentas/${cuentaId}/ventas/metrics`, { params: { doc_tipo: "RESERVA" } }),
      api.get(`/cuentas/${cuentaId}/creditos/metrics`),
    ]).then(([s, r, c]) => {
      setMetrics({ sale: s.data, reserva: r.data, creditos: c.data });
    }).catch(() => {}).finally(() => setLoading(false));
  }, [cuentaId]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;

  const m = headerMetrics || {};
  const s = metrics.sale || {};
  const r = metrics.reserva || {};
  const c = metrics.creditos || {};

  return (
    <div className="space-y-4" data-testid="section-resumen">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button onClick={() => onNavigate("ventas")} className="bg-white border border-slate-200 rounded-lg p-3 text-left hover:border-slate-300 transition-colors shadow-sm" data-testid="kpi-ventas">
          <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide flex items-center gap-1"><ShoppingBag size={11} />Ventas</div>
          <div className="text-lg font-bold text-slate-800 mt-1">{fmtNum(s.orders_count || 0)} ordenes</div>
          <div className="text-[10px] text-slate-400">{fmtNum(s.qty_total || 0)} uds</div>
        </button>
        <button onClick={() => onNavigate("reservas")} className="bg-white border border-slate-200 rounded-lg p-3 text-left hover:border-slate-300 transition-colors shadow-sm" data-testid="kpi-reservas">
          <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide flex items-center gap-1"><ShoppingBag size={11} />Reservas</div>
          <div className="text-lg font-bold text-slate-800 mt-1">{fmtNum(r.orders_count || 0)}</div>
          <div className="text-[10px] text-slate-400">{fmtNum(r.qty_total || 0)} uds</div>
        </button>
        <button onClick={() => onNavigate("creditos")} className="bg-white border border-slate-200 rounded-lg p-3 text-left hover:border-slate-300 transition-colors shadow-sm" data-testid="kpi-creditos">
          <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide flex items-center gap-1"><CreditCard size={11} />Creditos</div>
          <div className="text-lg font-bold text-slate-800 mt-1">{fmtNum(c.invoices_count || 0)}</div>
          {c.saldo_total > 0 && <div className="text-[10px] text-red-600 font-semibold">Saldo: {fmtMoney(c.saldo_total)}</div>}
        </button>
        <button onClick={() => onNavigate("info_ventas")} className="bg-white border border-slate-200 rounded-lg p-3 text-left hover:border-slate-300 transition-colors shadow-sm" data-testid="kpi-ultima-compra">
          <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Ultima compra</div>
          <div className="text-lg font-bold text-slate-800 mt-1">{fmtDate(m.last_purchase_date)}</div>
          <div className="text-[10px] text-slate-400">Ventas 12m: {fmtMoney(m.sales_12m_amount)}</div>
        </button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        {[
          { key: "info_ventas", label: "Info Ventas", icon: BarChart3 },
          { key: "yoy", label: "Comparativo YoY", icon: TrendingUp },
          { key: "analitica", label: "Analitica", icon: Activity },
          { key: "interacciones", label: "Interacciones", icon: MessageSquare },
          { key: "tareas", label: "Tareas", icon: CheckSquare },
        ].map(q => (
          <button key={q.key} onClick={() => onNavigate(q.key)}
            className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm"
            data-testid={`quick-${q.key}`}>
            <q.icon size={13} className="text-slate-400" />{q.label}
          </button>
        ))}
      </div>
    </div>
  );
}
