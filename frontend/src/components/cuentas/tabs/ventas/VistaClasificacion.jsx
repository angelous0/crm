import React, { useCallback, useMemo, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  ChevronRight, ChevronDown, ChevronUp, ArrowUpDown, Loader2, AlertCircle,
} from "lucide-react";
import { useTabData } from "@/hooks/useTabData";

const fmtMoney = (n) =>
  "S/. " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtMoneyDec = (n) =>
  "S/. " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (n) =>
  Number(n || 0).toLocaleString("es-PE");
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";
const fmtPct = (n) =>
  Number(n || 0).toFixed(1) + "%";

const COLS = [
  { key: "marca",            label: "Marca",         align: "left",  width: "minmax(140px,1.4fr)" },
  { key: "tipo",             label: "Tipo",          align: "left",  width: "minmax(120px,1fr)" },
  { key: "entalle",          label: "Entalle",       align: "left",  width: "120px" },
  { key: "cantidad",         label: "Cantidad",      align: "right", width: "80px",  num: true },
  { key: "ventas",           label: "Ventas",        align: "right", width: "110px", num: true },
  { key: "compras",          label: "Órdenes",       align: "right", width: "70px",  num: true },
  { key: "dias_sin_comprar", label: "Días sin",      align: "right", width: "80px",  num: true },
  { key: "pct_total",        label: "% Total",       align: "right", width: "70px",  num: true },
];

function ClasificacionRow({ row, expanded, onToggle, partnerOdooId, fechaDesde, fechaHasta }) {
  const [orders, setOrders]       = useState(null);
  const [loadingOrders, setLoad]  = useState(false);
  const [errorOrders, setError]   = useState(null);

  const loadOrders = useCallback(async () => {
    if (orders) return;
    setLoad(true);
    setError(null);
    try {
      const params = {
        marca: row.marca || "",
        tipo:  row.tipo  || "",
        entalle: row.entalle || "",
        limit: 100,
      };
      if (fechaDesde) params.fecha_desde = fechaDesde;
      if (fechaHasta) params.fecha_hasta = fechaHasta;
      const r = await api.get(`/cuentas/${partnerOdooId}/ventas/clasificacion/orders`, { params });
      setOrders(r.data?.rows || []);
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally { setLoad(false); }
  }, [partnerOdooId, row.marca, row.tipo, row.entalle, fechaDesde, fechaHasta, orders]);

  const handleToggle = () => {
    onToggle();
    if (!expanded && !orders) loadOrders();
  };

  const colTpl = ["20px", ...COLS.map(c => c.width)].join(" ");

  return (
    <>
      <div
        onClick={handleToggle}
        className="grid items-center gap-2 px-3 py-1.5 border-b text-sm hover:bg-slate-50 transition-colors cursor-pointer"
        style={{ gridTemplateColumns: colTpl }}
      >
        <div className="text-slate-400">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </div>
        <div className="font-medium text-slate-900 truncate">{row.marca || "—"}</div>
        <div className="text-slate-700 truncate">{row.tipo || "—"}</div>
        <div className="text-slate-600 truncate">{row.entalle || "—"}</div>
        <div className="text-right text-slate-700 tabular-nums">{fmtNum(row.cantidad)}</div>
        <div className="text-right text-slate-900 tabular-nums font-medium">{fmtMoney(row.ventas)}</div>
        <div className="text-right text-slate-500 tabular-nums">{row.compras}</div>
        <div className={`text-right tabular-nums ${
          row.dias_sin_comprar > 90 ? "text-red-600" :
          row.dias_sin_comprar > 30 ? "text-amber-600" : "text-slate-500"
        }`}>
          {row.dias_sin_comprar}d
        </div>
        <div className="text-right text-slate-500 tabular-nums">{fmtPct(row._pct_total)}</div>
      </div>

      {expanded && (
        <div className="border-b bg-slate-50/50 px-3 py-2">
          {loadingOrders ? (
            <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Cargando órdenes...
            </div>
          ) : errorOrders ? (
            <div className="text-xs text-red-600">Error: {errorOrders}</div>
          ) : orders && orders.length === 0 ? (
            <div className="text-xs text-slate-500 italic">Sin órdenes en este rango</div>
          ) : orders ? (
            <div className="space-y-0.5">
              <div
                className="grid items-center gap-2 px-2 py-1 text-[10px] uppercase tracking-wider text-slate-400"
                style={{ gridTemplateColumns: "90px minmax(120px,1fr) 70px 90px 70px" }}
              >
                <div>Fecha</div>
                <div>N° Orden</div>
                <div className="text-right">Cant.</div>
                <div className="text-right">Subtotal</div>
                <div className="text-right">Líneas</div>
              </div>
              {orders.map((o) => (
                <div
                  key={o.order_id}
                  className="grid items-center gap-2 px-2 py-1 text-xs hover:bg-white rounded"
                  style={{ gridTemplateColumns: "90px minmax(120px,1fr) 70px 90px 70px" }}
                >
                  <div className="text-slate-600 tabular-nums">{fmtDate(o.date_order)}</div>
                  <div className="font-medium tabular-nums truncate">{o.order_name || "—"}</div>
                  <div className="text-right text-slate-700 tabular-nums">{fmtNum(o.qty_item)}</div>
                  <div className="text-right text-slate-900 tabular-nums font-medium">{fmtMoneyDec(o.ventas_item)}</div>
                  <div className="text-right text-slate-500 tabular-nums">{o.lines_count}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}

export function VistaClasificacion({ partnerOdooId, fechaDesde, fechaHasta }) {
  const fetchClasif = useCallback(async () => {
    const params = {};
    if (fechaDesde) params.fecha_desde = fechaDesde;
    if (fechaHasta) params.fecha_hasta = fechaHasta;
    const r = await api.get(`/cuentas/${partnerOdooId}/ventas/clasificacion`, { params });
    return r.data?.rows || [];
  }, [partnerOdooId, fechaDesde, fechaHasta]);

  const { data: rows, loading, error, reload } = useTabData(fetchClasif, {
    enabled: true,
    staleKey: `${fechaDesde}-${fechaHasta}`,
  });

  const [sortKey, setSortKey] = useState("ventas");
  const [sortDir, setSortDir] = useState("desc");
  const [expandedKey, setExpandedKey] = useState(null);

  const totalVentas = useMemo(
    () => (rows || []).reduce((s, r) => s + (Number(r.ventas) || 0), 0),
    [rows]
  );

  const sorted = useMemo(() => {
    const list = (rows || []).map(r => ({
      ...r,
      _pct_total: totalVentas > 0 ? (Number(r.ventas) / totalVentas) * 100 : 0,
    }));
    return list.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      // Numéricos
      if (typeof av === "number" || typeof bv === "number") {
        const an = Number(av) || 0;
        const bn = Number(bv) || 0;
        return sortDir === "asc" ? an - bn : bn - an;
      }
      const as = String(av || "").toLowerCase();
      const bs = String(bv || "").toLowerCase();
      return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
    });
  }, [rows, sortKey, sortDir, totalVentas]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(COLS.find(c => c.key === key)?.num ? "desc" : "asc");
    }
  };

  if (loading && !rows) {
    return (
      <div className="space-y-1.5">
        {[0,1,2,3,4].map(i => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}
      </div>
    );
  }
  if (error) {
    return (
      <div className="border rounded p-3 flex items-center gap-2 text-sm">
        <AlertCircle className="h-4 w-4 text-red-500" />
        <span className="text-slate-600 flex-1">{error}</span>
        <Button size="sm" variant="outline" onClick={reload}>Reintentar</Button>
      </div>
    );
  }
  if (!sorted || sorted.length === 0) {
    return (
      <div className="px-3 py-8 text-center text-sm text-slate-400 italic border rounded-md">
        Sin clasificación de ventas para esta cuenta
      </div>
    );
  }

  const colTpl = ["20px", ...COLS.map(c => c.width)].join(" ");

  return (
    <div className="border rounded-md overflow-hidden">
      {/* Header con sort */}
      <div
        className="grid items-center gap-2 px-3 py-1.5 border-b bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"
        style={{ gridTemplateColumns: colTpl }}
      >
        <div></div>
        {COLS.map(c => {
          const isActive = sortKey === c.key;
          return (
            <button
              key={c.key}
              onClick={() => toggleSort(c.key)}
              className={`flex items-center gap-1 hover:text-slate-900 transition-colors ${
                c.align === "right" ? "justify-end" : ""
              } ${isActive ? "text-slate-900 font-semibold" : ""}`}
            >
              {c.label}
              {isActive
                ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)
                : <ArrowUpDown className="h-2.5 w-2.5 opacity-30" />}
            </button>
          );
        })}
      </div>

      {sorted.map((r) => {
        const k = `${r.marca}|${r.tipo}|${r.entalle}`;
        return (
          <ClasificacionRow
            key={k}
            row={r}
            expanded={expandedKey === k}
            onToggle={() => setExpandedKey(expandedKey === k ? null : k)}
            partnerOdooId={partnerOdooId}
            fechaDesde={fechaDesde}
            fechaHasta={fechaHasta}
          />
        );
      })}

      {/* Footer con total */}
      <div
        className="grid items-center gap-2 px-3 py-1.5 border-t bg-slate-50 text-xs text-slate-700"
        style={{ gridTemplateColumns: colTpl }}
      >
        <div></div>
        <div className="font-semibold">Total</div>
        <div></div>
        <div></div>
        <div className="text-right tabular-nums font-semibold">
          {fmtNum(sorted.reduce((s, r) => s + (Number(r.cantidad) || 0), 0))}
        </div>
        <div className="text-right tabular-nums font-semibold">{fmtMoney(totalVentas)}</div>
        <div className="text-right tabular-nums font-semibold">
          {sorted.reduce((s, r) => s + (Number(r.compras) || 0), 0)}
        </div>
        <div></div>
        <div className="text-right text-slate-500">100%</div>
      </div>
    </div>
  );
}
