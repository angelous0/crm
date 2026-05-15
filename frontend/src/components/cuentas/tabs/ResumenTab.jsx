/**
 * ResumenTab — dashboard rápido por cuenta (Sprint CRM-D5).
 *
 * Diseño:
 *   1. Banner sugerencia (solo si hay riesgo) con CTAs Llamar/WhatsApp
 *   2. 4 mini-KPIs complementarios al header:
 *        YoY · Reservas pendientes · Saldo crédito · Última interacción
 *   3. Gráfico mensual (12 meses) con etiquetas y mes destacado
 *   4. Última interacción · Top productos (12m con monto y qty)
 *
 * No duplicamos LTV/días/ticket/histórico — eso está en el header.
 */
import React, { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import {
  Loader2, Phone, MessageCircle, AlertTriangle, Sparkles,
  TrendingUp, TrendingDown, Bookmark, CreditCard, MessageSquare, Package,
  ArrowUpRight,
} from "lucide-react";

const fmtMoney = (n) => "S/ " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtMoneyDec = (n) => "S/ " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (n) => Number(n || 0).toLocaleString("es-PE");
const fmtPct = (v) => {
  if (v == null) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(1)}%`;
};

const MES_ABBR = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function timeAgo(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min}m`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.round(h / 24);
  if (d < 30) return `hace ${d}d`;
  const mo = Math.round(d / 30);
  return `hace ${mo} ${mo === 1 ? "mes" : "meses"}`;
}

// ─────────────────────────────────────────────────────────────
// Mini-KPI card (compacto, complementario al header)
// ─────────────────────────────────────────────────────────────
function MiniKpi({ icon: Icon, label, value, sublabel, accent = "text-slate-900", onClick, testId }) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      className={`text-left bg-white border border-slate-200 rounded-lg px-3 py-2.5 transition-colors ${
        onClick ? "hover:border-slate-300 hover:bg-slate-50/60 cursor-pointer" : ""
      }`}
      onClick={onClick}
      data-testid={testId}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        {Icon && <Icon className="h-3 w-3 text-slate-400" />}
        <div className="text-[9px] uppercase tracking-[0.14em] font-mono text-slate-500">
          {label}
        </div>
      </div>
      <div
        className={`text-lg font-semibold tabular-nums leading-none ${accent}`}
        style={{ fontFamily: "var(--font-display)" }}
      >
        {value}
      </div>
      {sublabel && (
        <div className="text-[10px] text-slate-400 mt-1.5 truncate">{sublabel}</div>
      )}
    </Wrapper>
  );
}

// ─────────────────────────────────────────────────────────────
// Gráfico mensual con etiquetas
// ─────────────────────────────────────────────────────────────
function CompraMensualChart({ data }) {
  const [hover, setHover] = useState(null);

  if (!data || data.length === 0) {
    return (
      <div className="text-xs text-slate-400 italic py-12 text-center">
        Sin histórico de compras
      </div>
    );
  }

  const values = data.map((d) => d.monto || 0);
  const max = Math.max(...values, 1);
  const total = values.reduce((s, v) => s + v, 0);
  const promedio = total / values.length;
  const maxIdx = values.indexOf(Math.max(...values));

  const W = 720, H = 180, P = { t: 18, r: 12, b: 26, l: 12 };
  const innerW = W - P.l - P.r, innerH = H - P.t - P.b;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
  const yScale = (v) => P.t + innerH - (v / max) * innerH;

  const points = data.map((d, i) => {
    const x = P.l + i * stepX;
    const y = yScale(d.monto || 0);
    return { x, y, ...d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${P.t + innerH} L${points[0].x},${P.t + innerH} Z`;

  const promY = yScale(promedio);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height: 180 }}
      onMouseLeave={() => setHover(null)}
    >
      <defs>
        <linearGradient id="resumen-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="var(--clay)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--clay)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Línea promedio */}
      <line
        x1={P.l} y1={promY} x2={W - P.r} y2={promY}
        stroke="rgba(0,0,0,0.12)"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      <text
        x={W - P.r}
        y={promY - 3}
        textAnchor="end"
        fontSize="9"
        fontFamily="var(--font-mono, monospace)"
        fill="rgba(0,0,0,0.4)"
      >
        prom {fmtMoney(promedio)}
      </text>

      {/* Área */}
      <path d={areaPath} fill="url(#resumen-gradient)" />
      {/* Línea */}
      <path d={linePath} fill="none" stroke="var(--clay)" strokeWidth="1.6" />

      {/* Puntos + barra hover */}
      {points.map((p, i) => {
        const isMax = i === maxIdx && p.monto > 0;
        const isHover = hover === i;
        return (
          <g key={i}>
            {/* Hover hitbox */}
            <rect
              x={p.x - stepX / 2}
              y={P.t}
              width={stepX || 1}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              style={{ cursor: "default" }}
            />
            {p.monto > 0 && (
              <circle
                cx={p.x}
                cy={p.y}
                r={isMax || isHover ? 3.5 : 2}
                fill="var(--clay)"
                stroke="white"
                strokeWidth={isMax || isHover ? 2 : 1}
              />
            )}
            {/* Etiqueta del mes (eje X) */}
            <text
              x={p.x}
              y={H - 8}
              textAnchor="middle"
              fontSize="10"
              fontFamily="var(--font-mono, monospace)"
              fill={isHover ? "#0F172A" : "rgba(0,0,0,0.45)"}
              style={{ fontWeight: isHover ? 600 : 400 }}
            >
              {monthLabel(p.mes)}
            </text>
          </g>
        );
      })}

      {/* Tooltip del mes con hover */}
      {hover != null && points[hover] && (
        <g>
          <line
            x1={points[hover].x} y1={P.t}
            x2={points[hover].x} y2={P.t + innerH}
            stroke="rgba(0,0,0,0.15)"
            strokeWidth="1"
            strokeDasharray="2 3"
          />
          <foreignObject
            x={Math.min(Math.max(points[hover].x - 60, P.l), W - P.r - 120)}
            y={Math.max(points[hover].y - 38, P.t)}
            width="120" height="34"
          >
            <div
              style={{
                background: "white",
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 6,
                padding: "3px 8px",
                fontSize: 10,
                fontFamily: "var(--font-mono, monospace)",
                lineHeight: 1.3,
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              }}
            >
              <div style={{ color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 8 }}>
                {monthFullLabel(points[hover].mes)}
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, color: "#0F172A", fontSize: 12 }}>
                {fmtMoney(points[hover].monto)}
              </div>
            </div>
          </foreignObject>
        </g>
      )}
    </svg>
  );
}

function monthLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return MES_ABBR[d.getMonth()];
}

function monthFullLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${MES_ABBR[d.getMonth()]} ${d.getFullYear()}`;
}

// ─────────────────────────────────────────────────────────────
// Sugerencia: banner clay con CTA
// ─────────────────────────────────────────────────────────────
const SUG_TYPE_STYLE = {
  ok:   { bg: "rgba(22,163,74,.06)",  border: "rgba(22,163,74,.28)",  fg: "#15803D", icon: Sparkles },
  info: { bg: "rgba(42,111,219,.06)", border: "rgba(42,111,219,.28)", fg: "#1E54B0", icon: Sparkles },
  warn: { bg: "rgba(217,119,6,.06)",  border: "rgba(217,119,6,.30)",  fg: "#B45309", icon: AlertTriangle },
  crit: { bg: "rgba(220,38,38,.05)",  border: "rgba(220,38,38,.32)",  fg: "#991B1B", icon: AlertTriangle },
};

function SugerenciaCard({ sugerencia, onLlamar, onWhatsApp }) {
  if (!sugerencia) return null;
  // Evitar duplicar el banner del header (que ya muestra "perdido —
  // operación de rescate") — el header es persistente en todas las tabs.
  if (sugerencia.accion === "campania_recovery") return null;
  const s = SUG_TYPE_STYLE[sugerencia.tipo] || SUG_TYPE_STYLE.info;
  const Icon = s.icon;
  return (
    <div
      className="border rounded-lg px-4 py-3 flex items-start gap-3"
      style={{ background: s.bg, borderColor: s.border }}
      data-testid="sugerencia-card"
    >
      <div
        className="rounded-full p-1.5 shrink-0"
        style={{ background: "white", border: `1px solid ${s.border}` }}
      >
        <Icon size={14} style={{ color: s.fg }} />
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="text-sm font-semibold leading-tight"
          style={{ color: s.fg, fontFamily: "var(--font-display)" }}
        >
          {sugerencia.titulo}
        </div>
        <div className="text-[12px] text-slate-700 mt-1 leading-snug">{sugerencia.detalle}</div>
        {sugerencia.accion === "llamar" && (onLlamar || onWhatsApp) && (
          <div className="flex gap-2 mt-2.5">
            {onLlamar && (
              <button
                onClick={onLlamar}
                className="px-2.5 py-1 rounded text-[11px] font-medium border border-slate-200 bg-white hover:bg-slate-50 inline-flex items-center gap-1.5"
              >
                <Phone size={11} /> Llamar ahora
              </button>
            )}
            {onWhatsApp && (
              <button
                onClick={onWhatsApp}
                className="px-2.5 py-1 rounded text-[11px] font-medium border border-slate-200 bg-white hover:bg-slate-50 inline-flex items-center gap-1.5"
              >
                <MessageCircle size={11} className="text-emerald-600" /> WhatsApp
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Última interacción
// ─────────────────────────────────────────────────────────────
function UltimaInteraccionCard({ ult, onNavigate }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[9px] uppercase tracking-[0.14em] font-mono text-slate-500 flex items-center gap-1.5">
          <MessageSquare className="h-3 w-3" /> Última interacción
        </div>
        {ult && onNavigate && (
          <button
            onClick={() => onNavigate("interacciones")}
            className="text-[10px] text-slate-500 hover:text-slate-900 inline-flex items-center gap-0.5"
          >
            Ver todas <ArrowUpRight className="h-3 w-3" />
          </button>
        )}
      </div>
      {ult ? (
        <div className="flex flex-col gap-1.5">
          <div
            className="text-base font-semibold leading-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {timeAgo(ult.happened_at)}
          </div>
          <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-2">
            {ult.channel && <span>{String(ult.channel).toLowerCase()}</span>}
            {ult.outcome && <span>· {String(ult.outcome).toLowerCase()}</span>}
            {ult.created_by && <span>· por {ult.created_by}</span>}
          </div>
          {ult.resumen && (
            <div className="text-xs text-slate-700 italic mt-1 line-clamp-3 leading-relaxed">
              "{ult.resumen}"
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center py-6">
          <div className="text-center">
            <MessageSquare className="h-5 w-5 text-slate-300 mx-auto mb-1.5" />
            <div className="text-xs text-slate-400 italic">Sin interacciones registradas</div>
            {onNavigate && (
              <button
                onClick={() => onNavigate("interacciones")}
                className="text-[11px] text-slate-700 hover:underline mt-1.5 font-medium"
              >
                Registrar primera →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Top productos (con monto)
// ─────────────────────────────────────────────────────────────
function TopProductosCard({ top, onNavigate }) {
  const max = Math.max(...((top || []).map(p => p.qty_12m || 0)), 1);
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[9px] uppercase tracking-[0.14em] font-mono text-slate-500 flex items-center gap-1.5">
          <Package className="h-3 w-3" /> Top productos · 12m
        </div>
        {top?.length > 0 && onNavigate && (
          <button
            onClick={() => onNavigate("ventas")}
            className="text-[10px] text-slate-500 hover:text-slate-900 inline-flex items-center gap-0.5"
          >
            Ver todo <ArrowUpRight className="h-3 w-3" />
          </button>
        )}
      </div>
      {top && top.length > 0 ? (
        <div className="space-y-2.5">
          {top.map((p, i) => {
            const pct = ((p.qty_12m || 0) / max) * 100;
            return (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0">
                      {i + 1}
                    </span>
                    <span className="truncate">
                      <span className="font-semibold text-slate-900">{p.marca || "—"}</span>
                      {p.tipo && <span className="text-slate-500 ml-1">· {p.tipo}</span>}
                      {p.entalle && <span className="text-slate-400 ml-1">· {p.entalle}</span>}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 shrink-0 tabular-nums">
                    <span className="text-[11px] text-slate-500">{fmtNum(p.qty_12m)} uds</span>
                    {p.amount_12m != null && (
                      <span className="text-xs font-mono text-slate-700">
                        {fmtMoney(p.amount_12m)}
                      </span>
                    )}
                  </div>
                </div>
                {/* Barra de proporción */}
                <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: "var(--clay)" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center py-6">
          <div className="text-center">
            <Package className="h-5 w-5 text-slate-300 mx-auto mb-1.5" />
            <div className="text-xs text-slate-400 italic">Sin compras en los últimos 12m</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tab principal
// ─────────────────────────────────────────────────────────────
export function ResumenTab({ cuentaId, headerMetrics, onNavigate, onLlamar, onWhatsApp }) {
  const [data, setData] = useState(null);
  const [reservas, setReservas] = useState(null);
  const [creditos, setCreditos] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cuentaId) return;
    setLoading(true);
    Promise.all([
      api.get(`/cuentas/${cuentaId}/resumen`).catch(() => ({ data: null })),
      api.get(`/cuentas/${cuentaId}/reservas/metrics`).catch(() => ({ data: null })),
      api.get(`/cuentas/${cuentaId}/creditos/metrics`).catch(() => ({ data: null })),
    ])
      .then(([r, res, cred]) => {
        setData(r.data);
        setReservas(res.data);
        setCreditos(cred.data);
      })
      .finally(() => setLoading(false));
  }, [cuentaId]);

  const yoyPct = data?.yoy_pct;
  const yoyIsPos = yoyPct != null && yoyPct >= 0;

  const ult = data?.ultima_interaccion;
  const ultDays = useMemo(() => {
    if (!ult?.happened_at) return null;
    return Math.floor((Date.now() - new Date(ult.happened_at).getTime()) / 86400000);
  }, [ult]);

  if (loading) {
    return (
      <div className="space-y-3" data-testid="section-resumen">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 bg-slate-100 rounded-lg animate-pulse" />)}
        </div>
        <div className="h-44 bg-slate-100 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="h-32 bg-slate-100 rounded-lg animate-pulse" />
          <div className="h-32 bg-slate-100 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  const sparkData = data?.sparkline_12m || [];
  const sparkTotal = sparkData.reduce((s, m) => s + (m.monto || 0), 0);

  return (
    <div className="space-y-3" data-testid="section-resumen">
      {/* 1. Sugerencia (solo si hay riesgo) */}
      <SugerenciaCard sugerencia={data?.sugerencia} onLlamar={onLlamar} onWhatsApp={onWhatsApp} />

      {/* 2. 4 mini-KPIs complementarios al header */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {/* YoY */}
        <MiniKpi
          icon={yoyIsPos ? TrendingUp : TrendingDown}
          label="YoY 12m"
          value={fmtPct(yoyPct)}
          accent={
            yoyPct == null ? "text-slate-500"
            : yoyPct >= 0.05 ? "text-emerald-700"
            : yoyPct < -0.05 ? "text-red-600"
            : "text-slate-700"
          }
          sublabel="vs 12m anteriores"
          testId="kpi-yoy"
        />

        {/* Reservas pendientes */}
        <MiniKpi
          icon={Bookmark}
          label="Reservas pendientes"
          value={reservas?.reservas_count ?? 0}
          accent={(reservas?.reservas_count ?? 0) > 0 ? "text-amber-700" : "text-slate-500"}
          sublabel={
            reservas?.monto_total > 0
              ? `${fmtMoney(reservas.monto_total)} reservado`
              : "Sin reservas"
          }
          onClick={onNavigate ? () => onNavigate("reservas") : undefined}
          testId="kpi-reservas"
        />

        {/* Saldo crédito */}
        <MiniKpi
          icon={CreditCard}
          label="Saldo crédito"
          value={fmtMoney(creditos?.saldo_total)}
          accent={(creditos?.saldo_total ?? 0) > 0 ? "text-red-600" : "text-emerald-600"}
          sublabel={
            creditos?.invoices_count
              ? `${creditos.invoices_count} factura${creditos.invoices_count === 1 ? "" : "s"}`
              : "Sin facturas crédito"
          }
          onClick={onNavigate ? () => onNavigate("creditos") : undefined}
          testId="kpi-credito"
        />

        {/* Última interacción */}
        <MiniKpi
          icon={MessageSquare}
          label="Última interacción"
          value={ultDays != null ? `${ultDays}d` : "—"}
          accent={
            ultDays == null ? "text-slate-500"
            : ultDays > 60 ? "text-red-600"
            : ultDays > 30 ? "text-amber-700"
            : "text-emerald-700"
          }
          sublabel={
            ult?.channel
              ? `${String(ult.channel).toLowerCase()} · ${ult.outcome || "—"}`
              : "Sin registro"
          }
          onClick={onNavigate ? () => onNavigate("interacciones") : undefined}
          testId="kpi-interaccion"
        />
      </div>

      {/* 3. Compra mensual 12m */}
      <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-[9px] uppercase tracking-[0.14em] font-mono text-slate-500">
            Compra mensual · últimos 12 meses
          </div>
          <div className="text-[10px] text-slate-400 font-mono tabular-nums">
            Total {fmtMoney(sparkTotal)}
          </div>
        </div>
        <CompraMensualChart data={sparkData} />
      </div>

      {/* 4. Última interacción + Top productos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <UltimaInteraccionCard ult={ult} onNavigate={onNavigate} />
        <TopProductosCard top={data?.top_productos} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

export default ResumenTab;
