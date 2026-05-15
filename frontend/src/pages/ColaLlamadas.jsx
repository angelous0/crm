/**
 * ColaLlamadas — página /cola (Sprint CRM-D2).
 *
 * Header personalizado + 4 KPIs con sparklines + tarjetas tipo task-row
 * con filtros pill + panel lateral "Resumen del día".
 *
 * Endpoints:
 *   GET /api/cola/header
 *   GET /api/cola/kpis
 *   GET /api/cola/llamadas?filtro=...
 *   GET /api/cola/resumen-dia
 *   POST /api/cola/quick-followup (vía QuickFollowupModal)
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import HiloIcon from "@/components/HiloIcons";
import Sparkline from "@/components/cola/Sparkline";
import QuickFollowupModal from "@/components/cola/QuickFollowupModal";

const FILTROS = [
  { id: "todos",     label: "Todos" },
  { id: "urgentes",  label: "Urgentes" },
  { id: "en-riesgo", label: "En riesgo" },
  { id: "credito",   label: "Crédito alto" },
];

// 5 estados simplificados — basados solo en recencia de última compra
const ESTADO_DOT = {
  nuevo:    "baja",   // 1-3 compras + creado ≤60d (no urge)
  activo:   "baja",   // compra ≤60d (al día)
  alerta:   "alta",   // 61-120d (urge llamar)
  olvidado: "alta",   // 121-180d (último intento)
  perdido:  "media",  // >180d (reactivación a fondo perdido)
  sin_data: "gris",
};

const ESTADO_LABEL = {
  nuevo:    "Nuevo",
  activo:   "Activo",
  alerta:   "Alerta",
  olvidado: "Olvidado",
  perdido:  "Perdido",
  sin_data: "Sin datos",
};

function fmtMoney(n) {
  if (n == null) return "—";
  return "S/ " + Number(n).toLocaleString("es-PE", { maximumFractionDigits: 0 });
}
function fmtRecencia(dias) {
  if (dias == null) return "—";
  if (dias === 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 30) return `${dias}d`;
  if (dias < 365) return `${Math.round(dias / 30)}m`;
  return `${(dias / 365).toFixed(1)}a`;
}
function fmtDateShort(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short" });
}
function initialsOf(name) {
  if (!name) return "??";
  const parts = String(name).trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]).join("").toUpperCase();
}

export default function ColaLlamadas() {
  const navigate = useNavigate();

  const [header, setHeader] = useState(null);
  const [kpis, setKpis] = useState(null);
  const [resumen, setResumen] = useState(null);

  const [filtro, setFiltro] = useState("todos");
  const [llamadas, setLlamadas] = useState([]);
  const [loadingLlamadas, setLoadingLlamadas] = useState(true);

  const [openCuenta, setOpenCuenta] = useState(null);

  // Cargar header + kpis + resumen una vez
  useEffect(() => {
    Promise.all([
      api.get("/cola/header"),
      api.get("/cola/kpis"),
      api.get("/cola/resumen-dia"),
    ])
      .then(([hRes, kRes, rRes]) => {
        setHeader(hRes.data);
        setKpis(kRes.data);
        setResumen(rRes.data);
      })
      .catch(() => toast.error("Error cargando cola"));
  }, []);

  // Cargar llamadas según filtro
  const fetchLlamadas = useCallback(async (f) => {
    setLoadingLlamadas(true);
    try {
      const r = await api.get("/cola/llamadas", { params: { filtro: f, limit: 30 } });
      setLlamadas(r.data.items || []);
    } catch {
      toast.error("Error cargando llamadas");
    } finally {
      setLoadingLlamadas(false);
    }
  }, []);

  useEffect(() => { fetchLlamadas(filtro); }, [filtro, fetchLlamadas]);

  const refrescar = () => {
    Promise.all([
      api.get("/cola/header"),
      api.get("/cola/kpis"),
      api.get("/cola/resumen-dia"),
    ]).then(([h, k, r]) => {
      setHeader(h.data); setKpis(k.data); setResumen(r.data);
    }).catch(() => {});
    fetchLlamadas(filtro);
  };

  const empezarPrimera = () => {
    if (llamadas.length === 0) {
      toast.info("No hay cuentas pendientes en la cola");
      return;
    }
    setOpenCuenta(llamadas[0]);
  };

  return (
    <div data-testid="cola-llamadas-page">
      {/* ─── Header personalizado ─── */}
      <div className="hilo-page-head" style={{ alignItems: "flex-start" }}>
        <div>
          <h1 className="hilo-page-title">
            {header ? (
              header.urgentes > 0 ? (
                <>
                  {header.saludo}, <em>{header.nombre}</em>, hoy te toca llamar a {header.urgentes}{" "}
                  {header.urgentes === 1 ? "urgente" : "urgentes"}
                </>
              ) : header.programadas_hoy > 0 ? (
                <>
                  {header.saludo}, <em>{header.nombre}</em>. Tienes {header.programadas_hoy}{" "}
                  {header.programadas_hoy === 1 ? "tarea" : "tareas"} hoy
                </>
              ) : (
                <>
                  {header.saludo}, <em>{header.nombre}</em>. Todo en orden hoy
                </>
              )
            ) : (
              "Cola de llamadas"
            )}
          </h1>
          <p className="hilo-page-sub">
            {header ? (
              <>
                {new Date(header.fecha_iso + "T00:00:00").toLocaleDateString("es-PE", {
                  weekday: "long", day: "numeric", month: "long", year: "numeric",
                }).toUpperCase()}
                {" · "}
                {header.programadas_hoy} {header.programadas_hoy === 1 ? "LLAMADA" : "LLAMADAS"} PROGRAMADAS
              </>
            ) : (
              "Cargando…"
            )}
          </p>
        </div>
        <button
          className="hilo-btn hilo-btn-primary"
          onClick={empezarPrimera}
          disabled={!llamadas.length}
          data-testid="cola-empezar"
        >
          <HiloIcon name="phone" size={14} />
          Empezar la primera
        </button>
      </div>

      {/* ─── 4 KPIs ─── */}
      <div className="hilo-kpi-grid-4">
        <KpiCard
          label="Por llamar hoy"
          value={kpis?.por_llamar_hoy?.value ?? "—"}
          format="num"
          sparkline={kpis?.por_llamar_hoy?.sparkline || []}
          color="var(--clay)"
        />
        <KpiCard
          label="Mes en curso"
          value={kpis?.mes_en_curso?.value ?? null}
          format="money"
          sparkline={kpis?.mes_en_curso?.sparkline || []}
          color="var(--olive)"
        />
        <KpiCard
          label="Por cobrar"
          value={kpis?.por_cobrar?.value ?? null}
          format="money"
          help={kpis?.por_cobrar?.disponible === false ? "Próximamente · D4" : null}
          color="var(--ochre)"
        />
        <KpiCard
          label="En riesgo"
          value={kpis?.en_riesgo?.value ?? "—"}
          format="num"
          color="var(--crit)"
        />
      </div>

      {/* ─── Grid: cola + sidebar derecho ─── */}
      <div className="hilo-cola-grid">
        {/* ── LISTA ── */}
        <div className="hilo-task-list">
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 18px", borderBottom: "1px solid var(--paper-3)",
            gap: 12, flexWrap: "wrap",
          }}>
            <div>
              <h3 className="hilo-panel-title" style={{ margin: 0 }}>Cola de llamadas</h3>
              <span className="hilo-panel-sub" style={{ marginTop: 2, display: "block" }}>
                Click en cualquier fila → registra el resultado
              </span>
            </div>
            <div className="hilo-filter-bar">
              {FILTROS.map((f) => (
                <button
                  key={f.id}
                  className={`hilo-filter-pill ${filtro === f.id ? "on" : ""}`}
                  onClick={() => setFiltro(f.id)}
                  data-testid={`filter-${f.id}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {loadingLlamadas ? (
            <div style={{ padding: 60, textAlign: "center", color: "var(--ink-3)" }}>
              Cargando…
            </div>
          ) : llamadas.length === 0 ? (
            <div className="hilo-page-empty" style={{ margin: 18 }}>
              <h2>Cola limpia</h2>
              <p>No hay cuentas pendientes con el filtro «{filtro}»</p>
            </div>
          ) : (
            llamadas.map((c) => (
              <CuentaRow
                key={c.partner_odoo_id}
                cuenta={c}
                onClick={() => setOpenCuenta(c)}
                onVerDetalle={() => navigate(`/cuentas/${c.partner_odoo_id}`)}
              />
            ))
          )}
        </div>

        {/* ── PANEL DERECHO ── */}
        <ResumenDia data={resumen} navigate={navigate} />
      </div>

      {/* ─── Modal Quick Followup ─── */}
      {openCuenta && (
        <QuickFollowupModal
          cuenta={openCuenta}
          onClose={() => setOpenCuenta(null)}
          onSaved={() => refrescar()}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// KpiCard
// ─────────────────────────────────────────────────────────────
function KpiCard({ label, value, format = "num", sparkline = [], color, help }) {
  const display =
    value == null ? "—"
    : format === "money" ? fmtMoney(value)
    : Number(value).toLocaleString("es-PE");

  return (
    <div className="hilo-kpi" data-testid={`kpi-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="hilo-kpi-label">{label}</div>
      <div className="hilo-kpi-value">{display}</div>
      {help && <div className="hilo-kpi-delta muted">{help}</div>}
      {sparkline.length >= 2 && <Sparkline data={sparkline} color={color} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CuentaRow (task-row de la cola)
// ─────────────────────────────────────────────────────────────
function CuentaRow({ cuenta, onClick, onVerDetalle }) {
  const dotClass = ESTADO_DOT[cuenta.estado_auto] || "gris";
  const estadoLabel = ESTADO_LABEL[cuenta.estado_auto] || cuenta.estado_auto;
  const motivo = useMemo(() => {
    if (cuenta.estado_auto === "nuevo")    return "Lead recién enganchado — primera fidelización";
    if (cuenta.estado_auto === "activo")   return "Cliente al día — mantener cercanía";
    if (cuenta.estado_auto === "alerta")   return "61-120d sin comprar — llamar pronto";
    if (cuenta.estado_auto === "olvidado") return "121-180d sin comprar — recuperación urgente";
    if (cuenta.estado_auto === "perdido")  return "Más de 180d sin comprar — reactivación";
    if (cuenta.tareas_pendientes > 0) return `${cuenta.tareas_pendientes} tarea(s) pendiente(s)`;
    return estadoLabel;
  }, [cuenta, estadoLabel]);

  return (
    <div
      className="hilo-task-row"
      onClick={onClick}
      data-testid={`cuenta-row-${cuenta.partner_odoo_id}`}
    >
      <button
        className="hilo-task-check"
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        title="Registrar resultado"
        aria-label="Registrar resultado"
      />
      <span className={`hilo-priority-dot ${dotClass}`} />
      <div className="hilo-task-main">
        <div className="hilo-task-client">
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {cuenta.nombre || `Partner ${cuenta.partner_odoo_id}`}
          </span>
          {cuenta.tier && (
            <span className={`hilo-tier ${cuenta.tier}`}>★ {cuenta.tier}</span>
          )}
        </div>
        <div className="hilo-task-reason">
          <span>{motivo}</span>
          {cuenta.ciudad && <span><span className="sep" />{cuenta.ciudad}</span>}
          <span><span className="sep" />última: {fmtRecencia(cuenta.recencia_dias)}</span>
          {cuenta.amount_12m > 0 && (
            <span><span className="sep" />{fmtMoney(cuenta.amount_12m)} / 12m</span>
          )}
        </div>
      </div>
      <div className="hilo-task-meta">
        <button
          onClick={(e) => { e.stopPropagation(); onVerDetalle(); }}
          title="Ver detalle"
          aria-label="Ver detalle"
        >
          <HiloIcon name="eye" size={14} />
        </button>
        <span>{fmtDateShort(cuenta.last_purchase_date)}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ResumenDia (panel derecho)
// ─────────────────────────────────────────────────────────────
function ResumenDia({ data, navigate }) {
  if (!data) {
    return (
      <div className="hilo-resumen-card">
        <div className="hilo-resumen-section" style={{ color: "var(--ink-3)" }}>
          Cargando…
        </div>
      </div>
    );
  }
  return (
    <div className="hilo-resumen-card">
      <div className="hilo-resumen-section">
        <h3 className="hilo-panel-title" style={{ margin: 0, fontSize: 16 }}>
          Resumen del día
        </h3>
      </div>

      <div className="hilo-resumen-section">
        <div className="hilo-resumen-label">Potencial promedio</div>
        <div className="hilo-resumen-value">{fmtMoney(data.potencial_dia)}</div>
        <div className="hilo-resumen-help">
          Si contactas al top {data.top_n} hoy
        </div>
      </div>

      <div className="hilo-resumen-section">
        <div className="hilo-resumen-row">
          <span>Visitas planeadas</span>
          <span className="num">{data.visitas_planeadas}</span>
        </div>
        <div className="hilo-resumen-row">
          <span>Llamadas pendientes</span>
          <span className="num">{data.llamadas_pendientes}</span>
        </div>
        <div className="hilo-resumen-row">
          <span>WhatsApp por enviar</span>
          <span className="num">{data.whatsapp_pendientes}</span>
        </div>
        <div className="hilo-resumen-row">
          <span>Cierres de pedido</span>
          <span className="num">{data.cierres}</span>
        </div>
      </div>

      {data.recientes && data.recientes.length > 0 && (
        <div className="hilo-resumen-section">
          <div className="hilo-resumen-label" style={{ marginBottom: 10 }}>
            Reciente
          </div>
          {data.recientes.map((r) => (
            <button
              key={r.id}
              className="hilo-recent-row"
              style={{
                background: "transparent", border: "none", padding: 0,
                width: "100%", textAlign: "left", cursor: "pointer",
              }}
              onClick={() => r.partner_odoo_id && navigate(`/cuentas/${r.partner_odoo_id}`)}
            >
              <div className="hilo-recent-avatar">{initialsOf(r.cuenta_nombre)}</div>
              <div style={{ minWidth: 0 }}>
                <div className="hilo-recent-name">{r.cuenta_nombre || "—"}</div>
                <div className="hilo-recent-meta">
                  {(r.canal || "—")} · {timeAgo(r.happened_at)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function timeAgo(iso) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min}m`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.round(h / 24);
  return `hace ${d}d`;
}
