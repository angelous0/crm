import React, { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, ShoppingCart, Clock, TrendingUp, Package, Palette, Ruler } from "lucide-react";

const fmtMoney = (v) => v != null ? Number(v).toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "0";
const fmtNum = (v) => v != null ? Number(v).toLocaleString("es-PE", { maximumFractionDigits: 0 }) : "0";

function DormancyBadge({ dias }) {
  if (dias == null) return <span className="text-slate-400 text-xs">-</span>;
  let color = "bg-emerald-100 text-emerald-700";
  let label = "Activo";
  if (dias > 45) { color = "bg-red-100 text-red-700"; label = "Dormido"; }
  else if (dias > 14) { color = "bg-amber-100 text-amber-700"; label = "Alerta"; }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${color}`} data-testid="dormancy-badge">
      <span className={`w-1.5 h-1.5 rounded-full ${dias > 45 ? "bg-red-500" : dias > 14 ? "bg-amber-500" : "bg-emerald-500"}`} />
      {dias}d - {label}
    </span>
  );
}

function MetricCard({ icon: Icon, label, children }) {
  return (
    <div className="bg-white border border-border rounded-lg p-3 shadow-sm">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={13} className="text-slate-400" />
        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">{label}</span>
      </div>
      {children}
    </div>
  );
}

function TopTable({ title, icon: Icon, rows, nameKey, showVentas }) {
  return (
    <div className="bg-white border border-border rounded-lg shadow-sm overflow-hidden">
      <div className="px-3 py-2 border-b bg-slate-50/80 flex items-center gap-1.5">
        <Icon size={13} className="text-slate-500" />
        <h4 className="text-xs font-semibold text-slate-700">{title}</h4>
        <span className="ml-auto text-[10px] text-slate-400">{rows.length} items</span>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50/30">
            <TableHead className="text-[10px] font-semibold w-8">#</TableHead>
            <TableHead className="text-[10px] font-semibold">{nameKey === "nombre" ? "Modelo" : nameKey === "talla" ? "Talla" : "Color"}</TableHead>
            <TableHead className="text-[10px] text-right font-semibold">Qty</TableHead>
            {showVentas && <TableHead className="text-[10px] text-right font-semibold">Ventas (S/)</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow><TableCell colSpan={showVentas ? 4 : 3} className="h-12 text-center text-slate-400 text-xs">Sin datos</TableCell></TableRow>
          ) : rows.map((r, i) => {
            const maxQty = rows[0]?.qty || 1;
            const pct = (r.qty / maxQty) * 100;
            return (
              <TableRow key={r[nameKey] || i} className={i % 2 ? "bg-slate-50/30" : ""} data-testid={`top-${nameKey}-${i}`}>
                <TableCell className="text-[10px] text-slate-400 font-mono">{i + 1}</TableCell>
                <TableCell className="text-[10px] font-medium relative">
                  <div className="absolute inset-y-0 left-0 bg-blue-50 rounded-r" style={{ width: `${pct}%`, opacity: 0.4 }} />
                  <span className="relative">{r[nameKey] || "-"}</span>
                </TableCell>
                <TableCell className="text-[10px] text-right font-mono font-semibold">{fmtNum(r.qty)}</TableCell>
                {showVentas && <TableCell className="text-[10px] text-right font-mono text-emerald-700">{fmtMoney(r.ventas)}</TableCell>}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default function AnaliticaTab({ cuentaId }) {
  const [freq, setFreq] = useState(null);
  const [freqLoading, setFreqLoading] = useState(false);
  const [tops, setTops] = useState(null);
  const [topsLoading, setTopsLoading] = useState(false);
  const [topsDias, setTopsDias] = useState("90");

  const fetchFreq = useCallback(async () => {
    setFreqLoading(true);
    try {
      const r = await api.get(`/cuentas/${cuentaId}/ventas/analitica/frecuencia`);
      setFreq(r.data);
    } catch { toast.error("Error cargando frecuencia"); }
    finally { setFreqLoading(false); }
  }, [cuentaId]);

  const fetchTops = useCallback(async (dias) => {
    setTopsLoading(true);
    try {
      const r = await api.get(`/cuentas/${cuentaId}/ventas/analitica/tops`, { params: { dias: dias || topsDias, top: 10 } });
      setTops(r.data);
    } catch { toast.error("Error cargando tops"); }
    finally { setTopsLoading(false); }
  }, [cuentaId, topsDias]);

  useEffect(() => { fetchFreq(); fetchTops(); }, [fetchFreq, fetchTops]);

  return (
    <div className="space-y-4" data-testid="analitica-tab">
      {/* Frecuencia de Compra */}
      <div className="bg-white border border-border rounded-lg shadow-sm overflow-hidden">
        <div className="px-3 py-2 border-b bg-slate-50/80">
          <h4 className="text-xs font-semibold text-slate-700">Frecuencia de Compra</h4>
        </div>
        {freqLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : freq && (
          <div className="p-3 space-y-3">
            {/* Dormancy + Frequency */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500">Dormancia:</span>
                <DormancyBadge dias={freq.dias_sin_comprar} />
              </div>
              <div className="flex items-center gap-2">
                <Clock size={12} className="text-slate-400" />
                <span className="text-[10px] text-slate-500">Frecuencia promedio:</span>
                <span className="text-xs font-bold text-slate-800" data-testid="freq-promedio">
                  {freq.frecuencia_promedio != null ? `${freq.frecuencia_promedio} dias` : "-"}
                </span>
              </div>
            </div>
            {/* Period cards */}
            <div className="grid grid-cols-3 gap-3">
              <MetricCard icon={ShoppingCart} label="Ultimos 30 dias">
                <div className="text-lg font-bold text-slate-800" data-testid="compras-30d">{fmtNum(freq.compras_30d)}</div>
                <div className="text-[10px] text-slate-400">ordenes | {fmtNum(freq.unidades_30d)} uds</div>
              </MetricCard>
              <MetricCard icon={ShoppingCart} label="Ultimos 60 dias">
                <div className="text-lg font-bold text-slate-800" data-testid="compras-60d">{fmtNum(freq.compras_60d)}</div>
                <div className="text-[10px] text-slate-400">ordenes | {fmtNum(freq.unidades_60d)} uds</div>
              </MetricCard>
              <MetricCard icon={ShoppingCart} label="Ultimos 90 dias">
                <div className="text-lg font-bold text-slate-800" data-testid="compras-90d">{fmtNum(freq.compras_90d)}</div>
                <div className="text-[10px] text-slate-400">ordenes | {fmtNum(freq.unidades_90d)} uds</div>
              </MetricCard>
            </div>
          </div>
        )}
      </div>

      {/* Tops Section */}
      <div className="flex items-center gap-3 bg-white border border-border rounded-lg px-4 py-2 shadow-sm">
        <span className="text-xs font-semibold text-slate-700">Top Modelos / Tallas / Colores</span>
        <div className="flex items-center gap-1.5 ml-auto">
          <label className="text-[10px] text-slate-500">Periodo:</label>
          <Select value={topsDias} onValueChange={(v) => { setTopsDias(v); fetchTops(v); }}>
            <SelectTrigger className="h-7 w-24 text-xs" data-testid="tops-dias-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30 dias</SelectItem>
              <SelectItem value="60">60 dias</SelectItem>
              <SelectItem value="90">90 dias</SelectItem>
              <SelectItem value="180">180 dias</SelectItem>
              <SelectItem value="365">1 ano</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {topsLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
      ) : tops && (
        <div className="grid grid-cols-3 gap-3">
          <TopTable title="Top Modelos" icon={Package} rows={tops.modelos} nameKey="nombre" showVentas />
          <TopTable title="Top Tallas" icon={Ruler} rows={tops.tallas} nameKey="talla" showVentas={false} />
          <TopTable title="Top Colores" icon={Palette} rows={tops.colores} nameKey="color" showVentas={false} />
        </div>
      )}
    </div>
  );
}
