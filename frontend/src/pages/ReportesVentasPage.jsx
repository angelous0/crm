import React, { useState, useEffect, useCallback, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp, TrendingDown, Minus, Download, BarChart3, Users, Package, ShoppingCart, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Input } from "../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import api from "@/lib/api";

function fmtSoles(n) {
  if (n == null) return "S/ 0";
  return "S/ " + Number(n).toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtNum(n) {
  if (n == null) return "0";
  return Number(n).toLocaleString("es-PE", { maximumFractionDigits: 0 });
}
function fmtPct(v) {
  if (v == null) return "-";
  return (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + "%";
}

function useAuth() {
  return !!localStorage.getItem("crm_token");
}

function KpiCard({ title, value, prevValue, pctChange, icon: Icon, format = "soles" }) {
  const fmt = format === "soles" ? fmtSoles : fmtNum;
  const isUp = pctChange != null && pctChange > 0;
  const isDown = pctChange != null && pctChange < 0;
  return (
    <Card data-testid={`kpi-${title.toLowerCase().replace(/\s/g, "-")}`}>
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{title}</span>
          <Icon className="h-4 w-4 text-slate-400" />
        </div>
        <div className="text-2xl font-bold text-slate-900 mb-1">{fmt(value)}</div>
        <div className="flex items-center gap-1.5 text-xs">
          {pctChange != null ? (
            <>
              <span className={`inline-flex items-center gap-0.5 font-semibold ${isUp ? "text-emerald-600" : isDown ? "text-red-500" : "text-slate-500"}`}>
                {isUp ? <TrendingUp className="h-3 w-3" /> : isDown ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                {fmtPct(pctChange)}
              </span>
              <span className="text-slate-400">vs. año ant.</span>
            </>
          ) : (
            <span className="text-slate-400">Prev: {fmt(prevValue)}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function FilterBar({ filters, setFilters, options, loading }) {
  const selectFilters = [
    { key: "tienda", label: "Tienda", opts: options.tiendas },
    { key: "marca", label: "Marca", opts: options.marcas },
    { key: "tipo", label: "Tipo", opts: options.tipos },
    { key: "entalle", label: "Entalle", opts: options.entalles },
    { key: "tela", label: "Tela", opts: options.telas },
    { key: "hilo", label: "Hilo", opts: options.hilos },
    { key: "talla", label: "Talla", opts: options.tallas },
    { key: "color", label: "Color", opts: options.colores },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="filter-bar">
      {/* Range selector */}
      <Select value={filters.range} onValueChange={(v) => setFilters((f) => ({ ...f, range: v }))}>
        <SelectTrigger className="w-[120px] h-8 text-xs" data-testid="filter-range">
          <SelectValue placeholder="Rango" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="YTD">YTD</SelectItem>
          <SelectItem value="MTD">MTD</SelectItem>
          <SelectItem value="CUSTOM">Custom</SelectItem>
        </SelectContent>
      </Select>

      {filters.range === "CUSTOM" && (
        <>
          <Input
            type="date" className="h-8 w-[130px] text-xs"
            value={filters.date_from}
            onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))}
            data-testid="filter-date-from"
          />
          <Input
            type="date" className="h-8 w-[130px] text-xs"
            value={filters.date_to}
            onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))}
            data-testid="filter-date-to"
          />
        </>
      )}

      {/* Vendedor */}
      {options.vendedores?.length > 0 && (
        <Select value={filters.vendedor || "__all__"} onValueChange={(v) => setFilters((f) => ({ ...f, vendedor: v === "__all__" ? "" : v }))}>
          <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="filter-vendedor">
            <SelectValue>{filters.vendedor ? options.vendedores.find((x) => x.id === filters.vendedor)?.nombre || filters.vendedor : "Vendedor: Todos"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            <SelectItem value="Sin asignar">Sin asignar</SelectItem>
            {options.vendedores.map((v) => (
              <SelectItem key={v.id} value={v.id}>{v.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {selectFilters.map(({ key, label, opts }) =>
        opts && opts.length > 0 ? (
          <Select key={key} value={filters[key] || "__all__"} onValueChange={(v) => setFilters((f) => ({ ...f, [key]: v === "__all__" ? "" : v }))}>
            <SelectTrigger className="w-[120px] h-8 text-xs" data-testid={`filter-${key}`}>
              <SelectValue>{filters[key] || `${label}: Todos`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {opts.map((o) => (
                <SelectItem key={o} value={o}>{o}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null
      )}

      {Object.values(filters).some((v) => v && v !== "YTD") && (
        <Button
          variant="ghost" size="sm" className="h-8 text-xs"
          onClick={() => setFilters({ range: "YTD", tienda: "", vendedor: "", marca: "", tipo: "", entalle: "", tela: "", hilo: "", modelo: "", talla: "", color: "", date_from: "", date_to: "" })}
          data-testid="filter-clear"
        >
          Limpiar filtros
        </Button>
      )}
    </div>
  );
}

function DailyChart({ data }) {
  // Align current + previous by day-of-range index
  const chartData = useMemo(() => {
    if (!data) return [];
    const cur = data.current || [];
    const prev = data.previous || [];
    const maxLen = Math.max(cur.length, prev.length);
    const result = [];
    for (let i = 0; i < maxLen; i++) {
      result.push({
        label: cur[i]?.date || `Día ${i + 1}`,
        actual: cur[i]?.ventas_soles || 0,
        anterior: prev[i]?.ventas_soles || 0,
      });
    }
    return result;
  }, [data]);

  if (!chartData.length) return <div className="h-64 flex items-center justify-center text-slate-400 text-sm">Sin datos para el período</div>;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
        <defs>
          <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradAnterior" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} tickFormatter={(v) => v?.slice(5) || v} />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `S/${(v / 1000).toFixed(0)}k`} />
        <Tooltip
          formatter={(val, name) => [fmtSoles(val), name === "actual" ? "Actual" : "Año ant."]}
          labelFormatter={(l) => l}
          contentStyle={{ fontSize: 12 }}
        />
        <Legend formatter={(v) => (v === "actual" ? "Actual" : "Año anterior")} iconSize={10} wrapperStyle={{ fontSize: 11 }} />
        <Area type="monotone" dataKey="anterior" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" fill="url(#gradAnterior)" />
        <Area type="monotone" dataKey="actual" stroke="#3b82f6" strokeWidth={2} fill="url(#gradActual)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function TopTable({ rows, groupBy, onExport }) {
  const isItems = groupBy === "items";
  const isClientes = groupBy === "clientes";
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-slate-600">
          {rows.length} resultado{rows.length !== 1 ? "s" : ""}
        </span>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onExport} data-testid="top-export-csv">
          <Download className="h-3 w-3" /> CSV
        </Button>
      </div>
      <div className="border rounded-md overflow-auto max-h-[520px]">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/50">
              <TableHead className="text-xs w-10">#</TableHead>
              {isItems ? (
                <>
                  <TableHead className="text-xs">Marca</TableHead>
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs">Entalle</TableHead>
                  <TableHead className="text-xs">Tela</TableHead>
                </>
              ) : (
                <TableHead className="text-xs">{isClientes ? "Cliente" : groupBy === "modelos" ? "Modelo" : groupBy === "tallas" ? "Talla" : groupBy === "colores" ? "Color" : groupBy === "tiendas" ? "Tienda" : "Nombre"}</TableHead>
              )}
              <TableHead className="text-xs text-right">Ventas S/</TableHead>
              <TableHead className="text-xs text-right">Unidades</TableHead>
              <TableHead className="text-xs text-right">Órdenes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isItems ? 8 : 5} className="h-20 text-center text-slate-500">Sin datos</TableCell>
              </TableRow>
            ) : (
              rows.map((r, i) => (
                <TableRow key={i} data-testid={`top-row-${i}`}>
                  <TableCell className="text-xs text-slate-400 font-mono">{i + 1}</TableCell>
                  {isItems ? (
                    <>
                      <TableCell className="text-xs">{r.marca || "-"}</TableCell>
                      <TableCell className="text-xs">{r.tipo || "-"}</TableCell>
                      <TableCell className="text-xs">{r.entalle || "-"}</TableCell>
                      <TableCell className="text-xs">{r.tela || "-"}</TableCell>
                    </>
                  ) : (
                    <TableCell className="text-xs font-medium max-w-[250px] truncate">{r.nombre || "-"}</TableCell>
                  )}
                  <TableCell className="text-xs text-right font-mono">{fmtSoles(r.ventas_soles)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{fmtNum(r.unidades)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{fmtNum(r.ordenes)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

const defaultFilters = {
  range: "YTD", date_from: "", date_to: "",
  tienda: "", vendedor: "", marca: "", tipo: "", entalle: "",
  tela: "", hilo: "", modelo: "", talla: "", color: "",
};

export default function ReportesVentasPage() {
  const token = useAuth();
  const [filters, setFilters] = useState(defaultFilters);
  const [filterOpts, setFilterOpts] = useState({});
  const [summary, setSummary] = useState(null);
  const [dailyData, setDailyData] = useState(null);
  const [topRows, setTopRows] = useState([]);
  const [topGroupBy, setTopGroupBy] = useState("clientes");
  const [topN, setTopN] = useState(20);
  const [loading, setLoading] = useState({ summary: false, daily: false, top: false });
  const [activeTab, setActiveTab] = useState("resumen");

  const buildQS = useCallback(() => {
    const p = {};
    p.range = filters.range;
    if (filters.range === "CUSTOM") {
      if (filters.date_from) p.date_from = filters.date_from;
      if (filters.date_to) p.date_to = filters.date_to;
    }
    for (const k of ["tienda", "vendedor", "marca", "tipo", "entalle", "tela", "hilo", "modelo", "talla", "color"]) {
      if (filters[k]) p[k] = filters[k];
    }
    return p;
  }, [filters]);

  // Load filter options once
  useEffect(() => {
    api.get("/reportes/ventas/filter-options")
      .then((r) => setFilterOpts(r.data))
      .catch(() => {});
  }, []);

  // Load summary + daily
  useEffect(() => {
    if (!token) return;
    const params = buildQS();
    setLoading((l) => ({ ...l, summary: true, daily: true }));

    api.get("/reportes/ventas/summary", { params })
      .then((r) => setSummary(r.data))
      .catch(() => {})
      .finally(() => setLoading((l) => ({ ...l, summary: false })));

    api.get("/reportes/ventas/by-day", { params })
      .then((r) => setDailyData(r.data))
      .catch(() => {})
      .finally(() => setLoading((l) => ({ ...l, daily: false })));
  }, [token, buildQS]);

  // Load top
  useEffect(() => {
    if (!token) return;
    const params = { ...buildQS(), group_by: topGroupBy, top_n: topN };
    setLoading((l) => ({ ...l, top: true }));
    api.get("/reportes/ventas/top", { params })
      .then((r) => setTopRows(r.data.rows || []))
      .catch(() => {})
      .finally(() => setLoading((l) => ({ ...l, top: false })));
  }, [token, buildQS, topGroupBy, topN]);

  const exportCSV = useCallback(() => {
    if (!topRows.length) return;
    const isItems = topGroupBy === "items";
    const hdr = isItems
      ? ["#", "Marca", "Tipo", "Entalle", "Tela", "Ventas S/", "Unidades", "Órdenes"]
      : ["#", "Nombre", "Ventas S/", "Unidades", "Órdenes"];
    const lines = [hdr.join(",")];
    topRows.forEach((r, i) => {
      if (isItems) {
        lines.push([i + 1, r.marca, r.tipo, r.entalle, r.tela, r.ventas_soles, r.unidades, r.ordenes].join(","));
      } else {
        lines.push([i + 1, `"${(r.nombre || "").replace(/"/g, '""')}"`, r.ventas_soles, r.unidades, r.ordenes].join(","));
      }
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `top_${topGroupBy}_${filters.range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [topRows, topGroupBy, filters.range]);

  const kpis = summary?.kpis;
  const yoy = summary?.yoy;
  const yoyPct = summary?.yoy_pct;

  return (
    <div className="min-h-screen bg-slate-50" data-testid="reportes-ventas-page">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-slate-900">Reportes de Ventas</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          {summary ? `${summary.date_from} — ${summary.date_to}` : "Cargando..."}
        </p>
      </div>

      <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto">
        {/* Filters */}
        <FilterBar filters={filters} setFilters={setFilters} options={filterOpts} loading={loading.summary} />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-white border" data-testid="reportes-tabs">
            <TabsTrigger value="resumen" className="text-xs">Resumen</TabsTrigger>
            <TabsTrigger value="top" className="text-xs">Top</TabsTrigger>
          </TabsList>

          {/* ─── Resumen ─── */}
          <TabsContent value="resumen" className="space-y-5 mt-4">
            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="kpi-grid">
              <KpiCard title="Ventas" value={kpis?.ventas_soles} prevValue={yoy?.ventas_soles_prev} pctChange={yoyPct?.ventas_soles} icon={DollarSign} format="soles" />
              <KpiCard title="Unidades" value={kpis?.unidades} prevValue={yoy?.unidades_prev} pctChange={yoyPct?.unidades} icon={Package} format="number" />
              <KpiCard title="Órdenes" value={kpis?.ordenes} prevValue={yoy?.ordenes_prev} pctChange={yoyPct?.ordenes} icon={ShoppingCart} format="number" />
              <KpiCard title="Clientes" value={kpis?.clientes} prevValue={yoy?.clientes_prev} pctChange={yoyPct?.clientes} icon={Users} format="number" />
            </div>

            {/* Daily chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-blue-500" /> Ventas diarias vs. año anterior
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading.daily ? (
                  <div className="h-64 flex items-center justify-center text-slate-400 text-sm">Cargando gráfico...</div>
                ) : (
                  <DailyChart data={dailyData} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── Top ─── */}
          <TabsContent value="top" className="space-y-4 mt-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Select value={topGroupBy} onValueChange={setTopGroupBy}>
                <SelectTrigger className="w-[150px] h-8 text-xs" data-testid="top-group-by">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="clientes">Clientes</SelectItem>
                  <SelectItem value="modelos">Modelos</SelectItem>
                  <SelectItem value="items">Items (M/T/E/T)</SelectItem>
                  <SelectItem value="tallas">Tallas</SelectItem>
                  <SelectItem value="colores">Colores</SelectItem>
                  <SelectItem value="tiendas">Tiendas</SelectItem>
                </SelectContent>
              </Select>
              <Select value={String(topN)} onValueChange={(v) => setTopN(Number(v))}>
                <SelectTrigger className="w-[80px] h-8 text-xs" data-testid="top-n-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">Top 10</SelectItem>
                  <SelectItem value="20">Top 20</SelectItem>
                  <SelectItem value="50">Top 50</SelectItem>
                  <SelectItem value="100">Top 100</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {loading.top ? (
              <div className="h-40 flex items-center justify-center text-slate-400 text-sm">Cargando...</div>
            ) : (
              <TopTable rows={topRows} groupBy={topGroupBy} onExport={exportCSV} />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
