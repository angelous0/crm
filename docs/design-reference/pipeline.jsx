// ============================================================
// PIPELINE COMERCIAL — Kanban + Campañas + Mi Pipeline
// ============================================================
const { useState: useStatePL, useMemo: useMemoPL, useEffect: useEffectPL } = React;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const _CL = () => window.HiloData.CLIENTS;
const _SP = () => window.HiloData.SALESPEOPLE;
const _ST = () => window.HiloLogic.PIPELINE_STAGES;
const _CT = () => window.HiloLogic.CAMPAIGN_TYPES;
const _SC = () => window.HiloLogic.SALES_CAMPAIGNS;
const _BR = () => window.HiloData.BRANDS;
const _RG = () => window.HiloData.REGIONS;

function plClient(id) { return _CL().find(c => c.id === id); }
function plStage(id) { return _ST().find(s => s.id === id); }
function plSeller(id) { return _SP().find(s => s.id === id); }
function plCampaign(id) { return _SC().find(c => c.id === id); }
function plBrand(id) { return _BR().find(b => b.id === id); }
function plRegion(id) { return _RG().find(r => r.id === id); }
function plDaysAgo(d) { return Math.round((new Date("2026-05-05") - new Date(d)) / 86400000); }

// State store reactivo (mutable in-memory)
const _PL_LISTENERS = new Set();
function plNotify() { _PL_LISTENERS.forEach(fn => fn()); }
function usePipelineEntries() {
  const [, force] = useStatePL(0);
  useEffectPL(() => {
    const fn = () => force(n => n + 1);
    _PL_LISTENERS.add(fn);
    return () => _PL_LISTENERS.delete(fn);
  }, []);
  return window.HiloLogic.PIPELINE_ENTRIES;
}
function plMoveEntry(clientId, campaignId, toStage, patch = {}) {
  const e = window.HiloLogic.PIPELINE_ENTRIES.find(x => x.clientId === clientId && x.campaignId === campaignId);
  if (e) {
    e.stage = toStage;
    e.touches = (e.touches || 0) + 1;
    Object.assign(e, patch);
    plNotify();
  }
}

// ─────────────────────────────────────────────────────────────
// PRIORITY DOT
// ─────────────────────────────────────────────────────────────
const PRIO_COLORS = { alta: "#B5462A", media: "#C98A3B", baja: "#8A7B5C" };
function PrioDot({ p }) {
  return <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 50, background: PRIO_COLORS[p] || "#999" }}></span>;
}

// ─────────────────────────────────────────────────────────────
// PIPELINE CARD — tarjeta de cliente dentro de columna
// ─────────────────────────────────────────────────────────────
function PipelineCard({ entry, openClient, openQuick }) {
  const c = plClient(entry.clientId);
  if (!c) return null;
  const stage = plStage(entry.stage);
  const days = plDaysAgo(c.lastPurchase);
  const overdue = entry.nextDate && new Date(entry.nextDate) < new Date("2026-05-05");
  const isVIP = (c.tags || []).includes("VIP") || c.tier === "Oro";

  return (
    <div
      onClick={() => openClient(c.id)}
      style={{
        background: "var(--paper)",
        border: `1px solid ${overdue ? "rgba(181,70,42,.35)" : "var(--line)"}`,
        borderLeft: `3px solid ${PRIO_COLORS[entry.priority] || "var(--line)"}`,
        borderRadius: 8,
        padding: "10px 12px",
        marginBottom: 8,
        cursor: "pointer",
        position: "relative",
        boxShadow: "0 1px 0 rgba(58,46,30,.04)",
      }}
      onMouseEnter={(e) => e.currentTarget.style.boxShadow = "0 2px 8px rgba(58,46,30,.10)"}
      onMouseLeave={(e) => e.currentTarget.style.boxShadow = "0 1px 0 rgba(58,46,30,.04)"}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", lineHeight: 1.25, marginBottom: 2 }}>
            {c.name}
            {isVIP && <span style={{ marginLeft: 5, fontSize: 9, padding: "1px 5px", background: "rgba(201,138,59,.15)", color: "#8B6914", borderRadius: 3, fontWeight: 600, letterSpacing: "0.04em" }}>VIP</span>}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--ink-3)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            {plRegion(c.region)?.name || c.region}{c.district ? ` · ${c.district}` : ""}
          </div>
        </div>
        <PrioDot p={entry.priority} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 10px", fontSize: 10.5, color: "var(--ink-2)", marginBottom: 8, fontFamily: "var(--font-mono)" }}>
        <span>📅 hace {days}d</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>S/ {(c.avgMonthly / 1000).toFixed(1)}k prom.</span>
        <span style={{ textTransform: "capitalize" }}>👤 {c.salesperson?.split(" ")[0] || "—"}</span>
        <span>{plBrand(c.brands?.[0])?.name || ""}</span>
      </div>

      <div style={{ fontSize: 11, color: "var(--ink-2)", lineHeight: 1.35, padding: "6px 8px", background: "var(--paper-2)", borderRadius: 5, marginBottom: 8 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ink-3)", letterSpacing: "0.1em", marginBottom: 2 }}>PRÓXIMA ACCIÓN</div>
        {entry.nextAction || "—"}
        {entry.nextDate && (
          <span style={{ marginLeft: 5, color: overdue ? "var(--clay)" : "var(--ink-3)", fontWeight: overdue ? 600 : 400 }}>
            · {overdue ? "⚠️ vencida" : new Date(entry.nextDate).toLocaleDateString("es-PE", { day:"numeric", month:"short" })}
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <button
          className="btn btn-primary"
          style={{ flex: 1, padding: "5px 8px", fontSize: 11 }}
          onClick={(e) => { e.stopPropagation(); openQuick(c, entry); }}
        >
          Registrar acción
        </button>
        <a
          href={`https://wa.me/51${(c.phone || "").replace(/\D/g, "")}`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{ padding: "5px 8px", fontSize: 11, background: "rgba(31,138,91,.10)", color: "#1F8A5B", borderRadius: 6, textDecoration: "none", fontWeight: 500, fontFamily: "var(--font-sans)" }}
        >
          💬
        </a>
      </div>

      {entry.touches > 0 && (
        <div style={{ position: "absolute", top: 8, right: 28, fontSize: 9, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
          {entry.touches}×
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// KANBAN — todas las columnas
// ─────────────────────────────────────────────────────────────
function PipelineKanban({ entries, openClient, openQuick }) {
  const stages = _ST();
  const byStage = useMemoPL(() => {
    const m = {};
    stages.forEach(s => m[s.id] = []);
    entries.forEach(e => { if (m[e.stage]) m[e.stage].push(e); });
    return m;
  }, [entries]);

  return (
    <div style={{
      display: "flex",
      gap: 10,
      overflowX: "auto",
      paddingBottom: 16,
      marginLeft: -32,
      marginRight: -32,
      paddingLeft: 32,
      paddingRight: 32,
    }}>
      {stages.map(s => {
        const list = byStage[s.id] || [];
        return (
          <div key={s.id} style={{
            flex: "0 0 280px",
            background: "var(--paper-2)",
            borderRadius: 10,
            padding: 10,
            border: "1px solid var(--paper-3)",
            display: "flex", flexDirection: "column",
            maxHeight: "calc(100vh - 280px)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 4px 10px", borderBottom: `2px solid ${s.color}`, marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 8, height: 8, borderRadius: 50, background: s.color }}></span>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink)", letterSpacing: "0.02em" }}>{s.label}</span>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: s.color, fontVariantNumeric: "tabular-nums" }}>
                {list.length}
              </span>
            </div>
            <div style={{ overflowY: "auto", flex: 1, paddingRight: 2 }}>
              {list.length === 0 ? (
                <div style={{ fontSize: 11, color: "var(--ink-3)", textAlign: "center", padding: "20px 8px", fontStyle: "italic" }}>
                  Sin clientes
                </div>
              ) : (
                list.map(e => (
                  <PipelineCard key={`${e.campaignId}-${e.clientId}`} entry={e} openClient={openClient} openQuick={openQuick} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// QUICK ACTION MODAL — panel de acción rápida pipeline
// ─────────────────────────────────────────────────────────────
function PipelineQuickAction({ client, entry, onClose, onSaved }) {
  const [action, setAction] = useStatePL(null);
  const [reason, setReason] = useStatePL(null);
  const [note, setNote] = useStatePL("");
  const [nextDays, setNextDays] = useStatePL(7);
  const actions = window.HiloLogic.QUICK_ACTIONS;
  const reasons = window.HiloLogic.NO_PURCHASE_REASONS;
  const showReasons = action && ["no-responde","no-interesado","reprogramar"].includes(action.id);

  const save = () => {
    if (!action) return;
    const nextDate = new Date("2026-05-05");
    nextDate.setDate(nextDate.getDate() + Number(nextDays));
    plMoveEntry(client.id, entry.campaignId, action.to, {
      lastResult: `${action.emoji} ${action.label}${note ? " · " + note : ""}`,
      nextAction: note || action.label,
      nextDate: nextDate.toISOString().slice(0, 10),
      priority: entry.priority,
      reason: reason || entry.reason,
    });
    onSaved && onSaved(action);
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(43,34,21,.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--paper)", borderRadius: 14, width: 580, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "var(--shadow-lg)", animation: "qfIn .25s" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>
            REGISTRAR ACCIÓN
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em" }}>{client.name}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{plRegion(client.region)?.name} · campaña: {plCampaign(entry.campaignId)?.name}</div>
        </div>

        <div style={{ padding: 22 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--ink-3)", marginBottom: 8 }}>¿QUÉ HICISTE? · 1 CLICK</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginBottom: 18 }}>
            {actions.map(a => (
              <button key={a.id}
                onClick={() => setAction(a)}
                style={{
                  padding: "10px 6px",
                  borderRadius: 8,
                  border: action?.id === a.id ? `2px solid ${plStage(a.to)?.color || "var(--clay)"}` : "1px solid var(--line)",
                  background: action?.id === a.id ? plStage(a.to)?.bg : "var(--paper)",
                  cursor: "pointer", fontSize: 10.5, fontWeight: 500,
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                  transition: "all .15s",
                }}>
                <span style={{ fontSize: 18 }}>{a.emoji}</span>
                <span style={{ lineHeight: 1.1, textAlign: "center" }}>{a.label}</span>
              </button>
            ))}
          </div>

          {showReasons && (
            <div style={{ marginBottom: 18, animation: "qfIn .2s" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--ink-3)", marginBottom: 8 }}>MOTIVO</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
                {reasons.map(r => (
                  <button key={r.id}
                    onClick={() => setReason(r.id)}
                    style={{
                      padding: "7px 6px",
                      borderRadius: 6,
                      border: reason === r.id ? "2px solid var(--clay)" : "1px solid var(--line)",
                      background: reason === r.id ? "rgba(181,70,42,.06)" : "var(--paper)",
                      cursor: "pointer", fontSize: 10, fontWeight: 500, lineHeight: 1.1, textAlign: "left",
                    }}>
                    <span style={{ marginRight: 4 }}>{r.emoji}</span>{r.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--ink-3)", marginBottom: 6 }}>NOTA / RESULTADO</div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. cerró pedido S/ 4,200 · entrega martes"
              style={{ width: "100%", padding: "9px 12px", borderRadius: 7, border: "1px solid var(--line)", fontSize: 13, fontFamily: "var(--font-sans)", background: "var(--paper-2)" }} />
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--ink-3)", marginBottom: 6 }}>PRÓXIMO CONTACTO</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[1,3,7,15,30].map(d => (
                <button key={d}
                  onClick={() => setNextDays(d)}
                  style={{
                    padding: "6px 12px", borderRadius: 999, fontSize: 11,
                    border: nextDays === d ? "1.5px solid var(--clay)" : "1px solid var(--line)",
                    background: nextDays === d ? "rgba(181,70,42,.06)" : "var(--paper)",
                    color: nextDays === d ? "var(--clay)" : "var(--ink-2)",
                    cursor: "pointer", fontFamily: "var(--font-mono)", letterSpacing: "0.04em",
                  }}>
                  {d === 1 ? "MAÑANA" : `+${d}D`}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ padding: "14px 22px", background: "var(--paper-2)", borderTop: "1px solid var(--line)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={!action} style={{ opacity: action ? 1 : 0.4 }}>
            Guardar y mover
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CAMPAIGNS LIST — listado de campañas con KPIs
// ─────────────────────────────────────────────────────────────
function campaignKpis(campaign, allEntries) {
  const items = allEntries.filter(e => e.campaignId === campaign.id);
  const total = campaign.clientIds.length;
  const byStage = items.reduce((acc, e) => { acc[e.stage] = (acc[e.stage] || 0) + 1; return acc; }, {});
  const sinContactar = total - items.filter(e => e.stage !== "no-contactado").length;
  const contactados = items.filter(e => !["no-contactado"].includes(e.stage)).length;
  const interesados = (byStage["interesado"] || 0) + (byStage["catalogo-enviado"] || 0);
  const enConversacion = (byStage["pedido-conv"] || 0) + (byStage["pago-pendiente"] || 0);
  const compraron = byStage["compro"] || 0;
  const noResp = byStage["no-responde"] || 0;
  const noInt = byStage["no-interesado"] || 0;
  const venta = items.filter(e => e.stage === "compro").reduce((s, e) => {
    const c = plClient(e.clientId);
    return s + (c?.lastPurchaseAmount || 0);
  }, 0);
  const tasaContacto = total ? Math.round(contactados / total * 100) : 0;
  const tasaConv = contactados ? Math.round(compraron / contactados * 100) : 0;
  const ticketProm = compraron ? Math.round(venta / compraron) : 0;
  return { total, sinContactar, contactados, interesados, enConversacion, compraron, noResp, noInt, venta, tasaContacto, tasaConv, ticketProm };
}

function CampaignCard({ campaign, allEntries, onOpen }) {
  const k = campaignKpis(campaign, allEntries);
  const ct = _CT().find(t => t.id === campaign.type);
  const seller = plSeller(campaign.seller);
  const days = plDaysAgo(campaign.deadline);
  const overdue = new Date(campaign.deadline) < new Date("2026-05-05") && campaign.status === "activa";
  const progress = k.total ? (k.compraron / k.total) * 100 : 0;
  const region = plRegion(campaign.targetRegion);
  const brand = plBrand(campaign.targetBrand);

  return (
    <div onClick={() => onOpen(campaign.id)} style={{
      background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: 18,
      cursor: "pointer", transition: "all .15s",
    }}
      onMouseEnter={(e) => e.currentTarget.style.boxShadow = "var(--shadow-md)"}
      onMouseLeave={(e) => e.currentTarget.style.boxShadow = "none"}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 9.5, fontFamily: "var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase", background: ct?.color + "22", color: ct?.color, fontWeight: 600 }}>
              {ct?.label}
            </span>
            <span style={{ fontSize: 9.5, fontFamily: "var(--font-mono)", letterSpacing: "0.1em", color: campaign.status === "activa" ? "#1F8A5B" : "var(--ink-3)" }}>
              ● {campaign.status.toUpperCase()}
            </span>
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 500, letterSpacing: "-0.02em", color: "var(--ink)", marginBottom: 4 }}>
            {campaign.name}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--ink-3)", display: "flex", gap: 12, flexWrap: "wrap" }}>
            <span>👤 {seller?.name}</span>
            {region && <span>📍 {region.name}</span>}
            {brand && <span>🏷️ {brand.name}</span>}
            <span style={{ color: overdue ? "var(--clay)" : "var(--ink-3)", fontWeight: overdue ? 600 : 400 }}>
              📅 {overdue ? `Vencida hace ${Math.abs(days)}d` : days < 0 ? `Cierra en ${Math.abs(days)}d` : `Cerrada hace ${days}d`}
            </span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 500, color: "var(--ink)", letterSpacing: "-0.02em" }}>
            S/ {k.venta.toLocaleString("es-PE")}
          </div>
          <div style={{ fontSize: 10, color: "var(--ink-3)", fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}>VENTA GENERADA</div>
        </div>
      </div>

      {/* progress bar */}
      <div style={{ height: 6, background: "var(--paper-3)", borderRadius: 3, overflow: "hidden", marginBottom: 12 }}>
        <div style={{ height: "100%", width: `${progress}%`, background: ct?.color || "var(--clay)", transition: "width .3s" }}></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, fontSize: 11 }}>
        <CKpi label="Asignados" value={k.total} />
        <CKpi label="Sin tocar" value={k.sinContactar} warn={k.sinContactar > 0 && campaign.status === "activa"} />
        <CKpi label="Contactados" value={`${k.tasaContacto}%`} />
        <CKpi label="Interesados" value={k.interesados} />
        <CKpi label="En pedido" value={k.enConversacion} />
        <CKpi label="Cerrados" value={k.compraron} good={k.compraron > 0} />
      </div>
    </div>
  );
}

function CKpi({ label, value, good, warn }) {
  const color = warn ? "var(--clay)" : good ? "#3F5A3D" : "var(--ink)";
  return (
    <div style={{ borderLeft: "1px solid var(--paper-3)", paddingLeft: 8 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ink-3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 500, color, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN VIEW: ViewPipeline
// ─────────────────────────────────────────────────────────────
function ViewPipeline({ openClient, role }) {
  const entries = usePipelineEntries();
  const [activeCampaign, setActiveCampaign] = useStatePL("all");
  const [activeSeller, setActiveSeller] = useStatePL(role === "vendedor" ? "diego" : "all");
  const [filterPriority, setFilterPriority] = useStatePL("all");
  const [filterStatus, setFilterStatus] = useStatePL("all"); // estado comercial
  const [view, setView] = useStatePL("kanban"); // kanban | campaigns | sellers
  const [quickEntry, setQuickEntry] = useStatePL(null);
  const [quickClient, setQuickClient] = useStatePL(null);

  useEffectPL(() => {
    setActiveSeller(role === "vendedor" ? "diego" : "all");
  }, [role]);

  // Filtra entries según selección
  const filtered = useMemoPL(() => {
    return entries.filter(e => {
      if (activeCampaign !== "all" && e.campaignId !== activeCampaign) return false;
      const camp = plCampaign(e.campaignId);
      if (activeSeller !== "all" && camp?.seller !== activeSeller) return false;
      if (filterPriority !== "all" && e.priority !== filterPriority) return false;
      if (filterStatus !== "all") {
        const c = plClient(e.clientId);
        const calc = window.HiloLogic.calcStatus(c).state;
        if (calc !== filterStatus) return false;
      }
      return true;
    });
  }, [entries, activeCampaign, activeSeller, filterPriority, filterStatus]);

  const campaigns = _SC().filter(c => activeSeller === "all" || c.seller === activeSeller);

  const openQuickPL = (client, entry) => {
    setQuickClient(client);
    setQuickEntry(entry);
  };

  // KPIs globales
  const totalAsignados = filtered.length;
  const sinContactar = filtered.filter(e => e.stage === "no-contactado").length;
  const interesados = filtered.filter(e => ["interesado","catalogo-enviado"].includes(e.stage)).length;
  const enPedido = filtered.filter(e => ["pedido-conv","pago-pendiente"].includes(e.stage)).length;
  const compraron = filtered.filter(e => e.stage === "compro").length;
  const ventaTotal = filtered.filter(e => e.stage === "compro").reduce((s, e) => s + (plClient(e.clientId)?.lastPurchaseAmount || 0), 0);
  const tareasVencidas = filtered.filter(e => e.nextDate && new Date(e.nextDate) < new Date("2026-05-05") && e.stage !== "compro").length;

  return (
    <>
      {/* HEADER */}
      <div style={{ marginBottom: 18 }}>
        <div className="page-eyebrow">PIPELINE COMERCIAL</div>
        <h1 className="page-title" style={{ marginTop: 4 }}>
          {role === "vendedor"
            ? <>Tu pipeline · <em style={{ fontStyle: "italic", color: "var(--clay)" }}>{tareasVencidas} tareas vencidas</em></>
            : <>Pipeline del equipo · <em style={{ fontStyle: "italic" }}>{totalAsignados} clientes en gestión</em></>
          }
        </h1>
        <div className="page-sub" style={{ marginTop: 6 }}>
          Lista asignada → seguimiento → registro de acción → próxima acción → compra o motivo de no compra
        </div>
      </div>

      {/* GLOBAL KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, marginBottom: 18, overflow: "hidden" }}>
        {[
          { l:"Asignados", v: totalAsignados, c:"var(--ink)" },
          { l:"Sin contactar", v: sinContactar, c: sinContactar > 0 ? "#B5462A" : "var(--ink-2)" },
          { l:"Vencidas", v: tareasVencidas, c: tareasVencidas > 0 ? "#B5462A" : "var(--ink-2)" },
          { l:"Interesados", v: interesados, c: "#5C7A5A" },
          { l:"En pedido", v: enPedido, c: "#C98A3B" },
          { l:"Compraron", v: compraron, c: "#3F5A3D" },
          { l:"Venta", v: `S/ ${(ventaTotal/1000).toFixed(1)}k`, c: "#3F5A3D", big:true },
        ].map((k, i, arr) => (
          <div key={i} style={{ padding: "14px 16px", borderRight: i < arr.length - 1 ? "1px solid var(--paper-3)" : "none" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ink-3)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>{k.l}</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: k.big ? 22 : 24, fontWeight: 500, color: k.c, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* TABS */}
      <div style={{ display: "flex", gap: 4, marginBottom: 14, borderBottom: "1px solid var(--line)" }}>
        {[
          { id:"kanban",    label:"Kanban" },
          { id:"campaigns", label:`Campañas (${campaigns.length})` },
          ...(role === "gerente" ? [{ id:"sellers", label:"Por vendedor" }] : []),
        ].map(t => (
          <button key={t.id}
            onClick={() => setView(t.id)}
            style={{
              padding: "10px 18px", border: "none", background: "transparent",
              fontSize: 13, fontWeight: 500, cursor: "pointer",
              color: view === t.id ? "var(--ink)" : "var(--ink-3)",
              borderBottom: view === t.id ? "2px solid var(--clay)" : "2px solid transparent",
              marginBottom: -1,
            }}>{t.label}</button>
        ))}
      </div>

      {/* FILTERS */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
        {role === "gerente" && (
          <FilterChip label="Vendedor" value={activeSeller} onChange={setActiveSeller}
            options={[{ id:"all", label:"Todos" }, ..._SP().map(s => ({ id:s.id, label:s.name }))]} />
        )}
        <FilterChip label="Campaña" value={activeCampaign} onChange={setActiveCampaign}
          options={[{ id:"all", label:"Todas" }, ...campaigns.map(c => ({ id:c.id, label:c.name }))]} />
        <FilterChip label="Prioridad" value={filterPriority} onChange={setFilterPriority}
          options={[{ id:"all", label:"Todas" }, { id:"alta", label:"🔴 Alta" }, { id:"media", label:"🟡 Media" }, { id:"baja", label:"⚪ Baja" }]} />
        <FilterChip label="Estado" value={filterStatus} onChange={setFilterStatus}
          options={[
            { id:"all", label:"Todos" },
            { id:"vip", label:"⭐ VIP" },
            { id:"activo", label:"Activo" },
            { id:"en-riesgo", label:"En riesgo" },
            { id:"dormido", label:"Dormido" },
            { id:"recuperado", label:"Recuperado" },
          ]} />
      </div>

      {/* CONTENT */}
      {view === "kanban" && <PipelineKanban entries={filtered} openClient={openClient} openQuick={openQuickPL} />}

      {view === "campaigns" && (
        <div style={{ display: "grid", gap: 14 }}>
          {campaigns.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>Sin campañas</div>
          ) : campaigns.map(c => (
            <CampaignCard key={c.id} campaign={c} allEntries={entries} onOpen={(id) => { setActiveCampaign(id); setView("kanban"); }} />
          ))}
        </div>
      )}

      {view === "sellers" && role === "gerente" && (
        <SellersTable entries={entries} />
      )}

      {quickClient && quickEntry && (
        <PipelineQuickAction
          client={quickClient}
          entry={quickEntry}
          onClose={() => { setQuickClient(null); setQuickEntry(null); }}
          onSaved={() => {}}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// FilterChip (segmented)
// ─────────────────────────────────────────────────────────────
function FilterChip({ label, value, onChange, options }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 999, padding: "3px 4px 3px 12px" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-3)" }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ border: "none", background: "transparent", fontSize: 12, color: "var(--ink)", padding: "5px 8px", cursor: "pointer", fontFamily: "var(--font-sans)", fontWeight: 500 }}>
        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SELLERS TABLE — comparativa de vendedores
// ─────────────────────────────────────────────────────────────
function SellersTable({ entries }) {
  const sellers = _SP();
  const rows = sellers.map(s => {
    const sellerCamps = _SC().filter(c => c.seller === s.id);
    const sellerEntries = entries.filter(e => sellerCamps.some(c => c.id === e.campaignId));
    const total = sellerEntries.length;
    const sinContactar = sellerEntries.filter(e => e.stage === "no-contactado").length;
    const contactados = total - sinContactar;
    const interesados = sellerEntries.filter(e => ["interesado","catalogo-enviado"].includes(e.stage)).length;
    const enPedido = sellerEntries.filter(e => ["pedido-conv","pago-pendiente"].includes(e.stage)).length;
    const compraron = sellerEntries.filter(e => e.stage === "compro").length;
    const venta = sellerEntries.filter(e => e.stage === "compro").reduce((sum, e) => sum + (plClient(e.clientId)?.lastPurchaseAmount || 0), 0);
    const vencidas = sellerEntries.filter(e => e.nextDate && new Date(e.nextDate) < new Date("2026-05-05") && e.stage !== "compro").length;
    const tasaContacto = total ? Math.round(contactados / total * 100) : 0;
    const tasaConv = contactados ? Math.round(compraron / contactados * 100) : 0;
    // VIP/riesgo sin tocar
    const vipSinTocar = sellerEntries.filter(e => {
      const c = plClient(e.clientId);
      return c && (c.tier === "Oro" || (c.tags||[]).includes("VIP")) && e.stage === "no-contactado";
    }).length;
    return { seller: s, total, sinContactar, contactados, interesados, enPedido, compraron, venta, vencidas, tasaContacto, tasaConv, vipSinTocar };
  });

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title" style={{ fontSize: 17 }}>Comparativa de vendedores</h2>
          <div className="panel-sub" style={{ marginTop: 3 }}>EFECTIVIDAD POR VENDEDOR · CAMPAÑAS ACTIVAS Y CERRADAS</div>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--paper-2)", textAlign: "left" }}>
              {["Vendedor","Asignados","Sin tocar","Vencidas","Interesados","En pedido","Compraron","Venta","Tasa contacto","Tasa conv.","VIP sin tocar"].map(h => (
                <th key={h} style={{ padding: "11px 12px", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, borderBottom: "1px solid var(--line)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.seller.id} style={{ borderBottom: "1px solid var(--paper-3)" }}>
                <td style={{ padding: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div className="avatar" style={{ width: 32, height: 32, fontSize: 11, background: "var(--clay)", color: "var(--paper)" }}>{r.seller.initials}</div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{r.seller.name}</div>
                      <div style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{r.seller.territory}</div>
                    </div>
                  </div>
                </td>
                <td style={tdNum}>{r.total}</td>
                <td style={{ ...tdNum, color: r.sinContactar > 0 ? "var(--clay)" : "var(--ink-2)", fontWeight: r.sinContactar > 0 ? 600 : 400 }}>{r.sinContactar}</td>
                <td style={{ ...tdNum, color: r.vencidas > 0 ? "var(--clay)" : "var(--ink-2)", fontWeight: r.vencidas > 0 ? 600 : 400 }}>{r.vencidas}</td>
                <td style={tdNum}>{r.interesados}</td>
                <td style={tdNum}>{r.enPedido}</td>
                <td style={{ ...tdNum, color: "#3F5A3D", fontWeight: 600 }}>{r.compraron}</td>
                <td style={{ ...tdNum, fontWeight: 600 }}>S/ {r.venta.toLocaleString("es-PE")}</td>
                <td style={tdNum}>{r.tasaContacto}%</td>
                <td style={{ ...tdNum, color: r.tasaConv >= 15 ? "#3F5A3D" : r.tasaConv >= 8 ? "#C98A3B" : "var(--ink-2)" }}>{r.tasaConv}%</td>
                <td style={{ ...tdNum, color: r.vipSinTocar > 0 ? "var(--clay)" : "var(--ink-2)", fontWeight: r.vipSinTocar > 0 ? 700 : 400 }}>{r.vipSinTocar > 0 ? `⚠️ ${r.vipSinTocar}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const tdNum = { padding: "12px", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", color: "var(--ink-2)" };

// Export
window.Views = window.Views || {};
window.Views.ViewPipeline = ViewPipeline;
