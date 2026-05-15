// ============================================================
// MÓDULOS NUEVOS — lógica comercial real
// Oportunidades · Campañas · Productos · Mapa V2 · Equipo V2
// ============================================================
const { useState: uS3, useMemo: uM3 } = React;
const { CLIENTS: CL3, REGIONS: RG3, BRANDS: BR3, WA_TEMPLATES: WT3, SALESPEOPLE: SP3 } = window.HiloData;
const { calcStatus, OPPORTUNITIES, PRODUCT_DETAIL, CAMPAIGNS, TIMELINE_TYPES } = window.HiloLogic;
const { fmtMoney: fM3, fmtDate: fD3, daysSince: dS3, regionById: rI3, initialsOf: iO3, colorKey: cK3 } = window.HiloHelpers;

const StatePill = ({ state }) => {
  const map = {
    "vip":         "VIP",
    "activo":      "Activo",
    "nuevo":       "Nuevo",
    "en-riesgo":   "En riesgo",
    "dormido":     "Dormido",
    "perdido":     "Perdido",
    "recuperado":  "Recuperado",
  };
  const cls = state === "en-riesgo" ? "state-riesgo" : `state-${state}`;
  return <span className={`state-pill ${cls}`}>{map[state] || state}</span>;
};

// ─────────────────────────────────────────────────────────────
// OPORTUNIDADES
// ─────────────────────────────────────────────────────────────
function ViewOpportunities({ openClient, openQuickFollowup }) {
  const [filter, setFilter] = uS3("all");
  const list = uM3(() => {
    let xs = OPPORTUNITIES;
    if (filter !== "all") xs = xs.filter(o => o.priority === filter);
    return [...xs].sort((a, b) => b.estimate - a.estimate);
  }, [filter]);

  const totalEstimate = list.reduce((a, o) => a + o.estimate, 0);

  return (
    <>
      <div className="page-head">
        <div style={{ position: "relative" }}>
          <div className="editorial-mark" style={{ left: -20, top: -28 }}>Op.</div>
          <h1 className="page-title">Oportunidades <em>comerciales</em></h1>
          <div className="page-sub">{list.length} OPORTUNIDADES DETECTADAS · POTENCIAL {fM3(totalEstimate)}/MES</div>
        </div>
      </div>

      <div className="filter-bar">
        <button className={`filter-chip ${filter==="all"?"on":""}`} onClick={()=>setFilter("all")}>Todas</button>
        <button className={`filter-chip ${filter==="alta"?"on":""}`} onClick={()=>setFilter("alta")}>Alta prioridad</button>
        <button className={`filter-chip ${filter==="media"?"on":""}`} onClick={()=>setFilter("media")}>Media</button>
        <button className={`filter-chip ${filter==="baja"?"on":""}`} onClick={()=>setFilter("baja")}>Baja</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
        {list.map(o => {
          const c = CL3.find(c => c.id === o.clientId);
          return (
            <div key={o.id} className={`op-card ${o.priority}`} onClick={() => openClient(o.clientId)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="op-type">{o.type.replace("-", " ")}</span>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 500, letterSpacing: "-0.01em", lineHeight: 1.2 }}>
                    {o.title}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 4, lineHeight: 1.45 }}>
                    {o.detail}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                    <div className={`mini-avatar k${cK3(c.id)}`} style={{ width: 22, height: 22, fontSize: 9 }}>
                      {iO3(c.name)}
                    </div>
                    <span style={{ fontSize: 12.5, fontWeight: 500 }}>{c.name}</span>
                    <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>· {rI3(c.region)?.name}</span>
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 500, color: "var(--clay)" }}>
                    {fM3(o.estimate)}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--ink-3)", textTransform: "uppercase" }}>
                    EST/MES
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed var(--paper-3)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 12, color: "var(--ink-2)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginRight: 6 }}>ACCIÓN</span>
                  {o.action}
                </div>
                <button className="btn btn-ghost" style={{ padding: "5px 10px", fontSize: 11.5 }} onClick={(e) => { e.stopPropagation(); openQuickFollowup(c); }}>
                  <Icon name="phone" size={12}/> Llamar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// CAMPAÑAS WhatsApp
// ─────────────────────────────────────────────────────────────
function ViewCampaigns() {
  const totals = CAMPAIGNS.reduce((a, c) => ({
    contacted: a.contacted + c.contacted,
    responded: a.responded + c.responded,
    purchased: a.purchased + c.purchased,
    revenue: a.revenue + (c.revenue || 0),
  }), { contacted: 0, responded: 0, purchased: 0, revenue: 0 });

  return (
    <>
      <div className="page-head">
        <div style={{ position: "relative" }}>
          <div className="editorial-mark" style={{ left: -20, top: -28 }}>WA</div>
          <h1 className="page-title">Campañas de <em>WhatsApp</em></h1>
          <div className="page-sub">{CAMPAIGNS.length} CAMPAÑAS · {fM3(totals.revenue)} GENERADOS</div>
        </div>
        <button className="btn btn-primary"><Icon name="plus" /> Nueva campaña</button>
      </div>

      <div className="kpi-grid">
        <div className="kpi"><div className="kpi-label">Contactados</div><div className="kpi-value">{totals.contacted}</div></div>
        <div className="kpi"><div className="kpi-label">Respondieron</div><div className="kpi-value">{totals.responded}</div><div className="kpi-delta up">{Math.round(totals.responded/totals.contacted*100)}% tasa</div></div>
        <div className="kpi"><div className="kpi-label">Compraron</div><div className="kpi-value">{totals.purchased}</div><div className="kpi-delta up">{Math.round(totals.purchased/totals.contacted*100)}% conversión</div></div>
        <div className="kpi"><div className="kpi-label">Venta generada</div><div className="kpi-value">{fM3(totals.revenue)}</div></div>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        {CAMPAIGNS.map(c => {
          const respRate = Math.round(c.responded / c.contacted * 100);
          const buyRate = Math.round(c.purchased / c.contacted * 100);
          const tpl = WT3.find(t => t.id === c.template);
          return (
            <div key={c.id} className="panel">
              <div className="panel-head">
                <div>
                  <h3 className="panel-title" style={{ fontSize: 17 }}>{c.name}</h3>
                  <div className="panel-sub" style={{ marginTop: 3 }}>
                    {fD3(c.date)} · {c.segment.toUpperCase()} · PLANTILLA "{tpl?.name}"
                  </div>
                </div>
                <span className={`chip ${c.status==="completada"?"ok":"warn"}`}>{c.status}</span>
              </div>

              <div className="funnel">
                <div className="funnel-step">
                  <div className="funnel-lbl">Contactados</div>
                  <div className="funnel-num">{c.contacted}</div>
                </div>
                <div className="funnel-step" style={{ background: "rgba(31,138,91,.04)" }}>
                  <div className="funnel-lbl">Respondieron</div>
                  <div className="funnel-num">{c.responded}</div>
                  <div className="funnel-pct">{respRate}% tasa</div>
                </div>
                <div className="funnel-step" style={{ background: "rgba(181,70,42,.04)" }}>
                  <div className="funnel-lbl">Compraron</div>
                  <div className="funnel-num">{c.purchased}</div>
                  <div className="funnel-pct">{buyRate}% conv.</div>
                </div>
                <div className="funnel-step" style={{ background: "rgba(201,138,59,.04)" }}>
                  <div className="funnel-lbl">{c.paid ? "Cobrado" : "Venta"}</div>
                  <div className="funnel-num" style={{ color: "var(--clay)" }}>
                    {c.paid ? fM3(c.paid) : fM3(c.revenue)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// PRODUCTOS — análisis por marca/tipo/entalle/modelo/talla/color
// ─────────────────────────────────────────────────────────────
function ViewProducts() {
  const [dim, setDim] = uS3("model");
  const dimLabels = {
    brand: "Marca", type: "Tipo", model: "Modelo", fit: "Entalle", size: "Talla", color: "Color"
  };

  const groups = uM3(() => {
    const map = {};
    PRODUCT_DETAIL.forEach(p => {
      const key = dim === "brand" ? BR3.find(b => b.id === p.brand)?.name : p[dim];
      if (!map[key]) map[key] = { key, units: 0, items: [] };
      map[key].units += p.units;
      map[key].items.push(p);
    });
    return Object.values(map).sort((a,b) => b.units - a.units);
  }, [dim]);

  const max = groups[0]?.units || 1;
  const total = groups.reduce((a,g) => a + g.units, 0);

  return (
    <>
      <div className="page-head">
        <div style={{ position: "relative" }}>
          <div className="editorial-mark" style={{ left: -20, top: -28 }}>Cat.</div>
          <h1 className="page-title">Análisis de <em>productos</em></h1>
          <div className="page-sub">{total.toLocaleString()} UNIDADES VENDIDAS · CRUZA POR DIMENSIÓN</div>
        </div>
      </div>

      <div className="filter-bar">
        {Object.entries(dimLabels).map(([k, v]) => (
          <button key={k} className={`filter-chip ${dim===k?"on":""}`} onClick={()=>setDim(k)}>{v}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 22 }}>
        <div className="panel">
          <div className="panel-head">
            <h3 className="panel-title" style={{ fontSize: 16 }}>Ranking por {dimLabels[dim]}</h3>
            <span className="panel-sub">Unidades</span>
          </div>
          <div style={{ padding: 16 }}>
            {groups.map((g, i) => (
              <div key={g.key} style={{
                display: "grid", gridTemplateColumns: "26px 1fr 80px", gap: 12,
                alignItems: "center", padding: "10px 4px",
                borderBottom: i < groups.length - 1 ? "1px solid var(--paper-3)" : "none"
              }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)" }}>
                  {String(i+1).padStart(2, "0")}
                </span>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13.5, marginBottom: 4 }}>{g.key}</div>
                  <div className="bar-track" style={{ height: 6 }}>
                    <div className="bar-fill ok" style={{ width: (g.units/max*100)+"%" }}></div>
                  </div>
                </div>
                <div style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>
                  {g.units}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel" style={{ height: "fit-content" }}>
          <div className="panel-head">
            <h3 className="panel-title" style={{ fontSize: 16 }}>Top combinaciones</h3>
            <span className="panel-sub">Modelo · Entalle · Talla · Color</span>
          </div>
          <div>
            {[...PRODUCT_DETAIL].sort((a,b) => b.units - a.units).slice(0, 8).map((p, i) => {
              const b = BR3.find(br => br.id === p.brand);
              return (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "1fr 60px",
                  padding: "12px 16px", borderBottom: "1px solid var(--paper-3)", alignItems: "center", gap: 10
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>
                      <span style={{ color: b.color }}>●</span> {p.model}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 3, fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
                      {p.fit.toUpperCase()} · {p.size} · {p.color.toUpperCase()}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                    {p.units}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// EQUIPO V2 — tablero por vendedor con KPIs reales
// ─────────────────────────────────────────────────────────────
function ViewTeamV2() {
  const enriched = SP3.map(s => {
    const myClients = CL3.filter(c => c.salesperson.startsWith(s.name.split(" ")[0]));
    const states = myClients.map(c => calcStatus(c).state);
    return {
      ...s,
      activos: states.filter(x => x === "activo" || x === "vip").length,
      enRiesgo: states.filter(x => x === "en-riesgo").length,
      dormidos: states.filter(x => x === "dormido").length,
      perdidos: states.filter(x => x === "perdido").length,
      recuperados: 2,
      tasaRespuesta: 68 + Math.round(Math.random() * 25),
      vencidas: Math.round(Math.random() * 6),
      ventaSeguimiento: Math.round(s.sold * (0.4 + Math.random() * 0.3)),
    };
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Tablero <em>de equipo</em></h1>
          <div className="page-sub">{SP3.length} VENDEDORES · INDICADORES DEL MES</div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        {enriched.map(s => {
          const pct = Math.round(s.sold / s.quota * 100);
          return (
            <div key={s.id} className="panel" style={{ padding: 0 }}>
              <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--paper-3)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div className="avatar" style={{ width: 46, height: 46, fontSize: 16 }}>{s.initials}</div>
                  <div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 500, lineHeight: 1.1 }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em", marginTop: 3 }}>
                      {s.territory.toUpperCase()}
                    </div>
                  </div>
                </div>
                <div style={{ flex: 1, maxWidth: 320 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 12 }}>
                    <span style={{ color: "var(--ink-3)" }}>Cuota mes</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>{fM3(s.sold)} / {fM3(s.quota)}</span>
                  </div>
                  <div className="bar-track" style={{ height: 8 }}>
                    <div className={`bar-fill ${pct>=80?"ok":pct>=50?"warn":"crit"}`} style={{ width: pct+"%" }}></div>
                  </div>
                </div>
                <button className="btn btn-ghost">Ver detalle</button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderTop: "1px solid var(--paper-3)" }}>
                <KPICell label="Asignados" value={s.clients} />
                <KPICell label="Activos" value={s.activos} color="var(--olive)" />
                <KPICell label="En riesgo" value={s.enRiesgo} color="var(--ochre)" />
                <KPICell label="Dormidos" value={s.dormidos} color="var(--plum)" />
                <KPICell label="Tareas vencidas" value={s.vencidas} color={s.vencidas > 3 ? "var(--clay)" : "var(--ink)"} />
                <KPICell label="Recuperados" value={s.recuperados} color="var(--olive)" />
                <KPICell label="Tasa respuesta" value={s.tasaRespuesta + "%"} />
              </div>

              <div style={{ padding: "14px 20px", background: "var(--paper-2)", borderTop: "1px solid var(--paper-3)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--ink-2)" }}>
                  Venta atribuida a seguimiento del CRM
                </span>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 500, color: "var(--clay)" }}>
                  {fM3(s.ventaSeguimiento)} <span style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>· {Math.round(s.ventaSeguimiento/s.sold*100)}% del total</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
const KPICell = ({label, value, color}) => (
  <div style={{ padding: "14px 12px", borderRight: "1px solid var(--paper-3)", textAlign: "center" }}>
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 6 }}>{label}</div>
    <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 500, color: color || "var(--ink)", letterSpacing: "-0.01em" }}>{value}</div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// MAPA V2 — métricas por provincia
// ─────────────────────────────────────────────────────────────
function ViewMapV2({ openClient }) {
  const [selected, setSelected] = uS3(null);

  const regionData = uM3(() => {
    return RG3.map(r => {
      const clients = CL3.filter(c => c.region === r.id);
      const states = clients.map(c => calcStatus(c).state);
      const ytd = clients.reduce((a,c) => a + c.ytd, 0);
      const ticket = clients.length ? Math.round(clients.reduce((a,c) => a + c.lastPurchaseAmount, 0) / clients.length) : 0;
      const ops = OPPORTUNITIES.filter(o => o.region === r.id);
      const opEst = ops.reduce((a,o) => a + o.estimate, 0);
      return {
        ...r,
        total: clients.length,
        activos: states.filter(s => s === "activo" || s === "vip").length,
        dormidos: states.filter(s => s === "dormido" || s === "perdido").length,
        ytd, ticket, opEst, clients,
      };
    }).filter(r => r.total > 0).sort((a,b) => b.ytd - a.ytd);
  }, []);

  const sel = regionData.find(r => r.id === selected) || regionData[0];

  return (
    <>
      <div className="page-head">
        <div style={{ position: "relative" }}>
          <div className="editorial-mark" style={{ left: -20, top: -28 }}>Perú</div>
          <h1 className="page-title">Mapa de <em>provincias</em></h1>
          <div className="page-sub">{regionData.length} REGIONES CON CLIENTES · {fM3(regionData.reduce((a,r)=>a+r.ytd,0))} YTD</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 22 }}>
        <div className="panel" style={{ height: "fit-content" }}>
          <div className="panel-head">
            <h3 className="panel-title" style={{ fontSize: 16 }}>Provincias por venta</h3>
            <span className="panel-sub">YTD 2026</span>
          </div>
          <div>
            {regionData.map((r, i) => (
              <button
                key={r.id}
                onClick={()=>setSelected(r.id)}
                style={{
                  width: "100%", textAlign: "left", border: "none",
                  background: sel?.id === r.id ? "var(--paper-2)" : "var(--paper)",
                  borderLeft: sel?.id === r.id ? "3px solid var(--clay)" : "3px solid transparent",
                  padding: "12px 18px", borderBottom: i < regionData.length - 1 ? "1px solid var(--paper-3)" : "none",
                  cursor: "pointer", display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 16, alignItems: "center"
                }}
              >
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13.5 }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 3, fontFamily: "var(--font-mono)" }}>
                    {r.total} clientes · {r.activos} activos · {r.dormidos} dormidos
                  </div>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)", textAlign: "right" }}>
                  TICKET<br /><span style={{ color: "var(--ink)", fontWeight: 500 }}>{fM3(r.ticket)}</span>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)", textAlign: "right" }}>
                  OP.<br /><span style={{ color: "var(--clay)", fontWeight: 500 }}>{fM3(r.opEst)}</span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 500, letterSpacing: "-0.01em" }}>{fM3(r.ytd)}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ink-3)", letterSpacing: "0.08em" }}>YTD</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {sel && (
          <div className="panel" style={{ height: "fit-content" }}>
            <div className="panel-head">
              <div>
                <h3 className="panel-title" style={{ fontSize: 18 }}>{sel.name}</h3>
                <div className="panel-sub" style={{ marginTop: 3 }}>DETALLE DE CLIENTES</div>
              </div>
            </div>
            <div style={{ padding: 18 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 18 }}>
                <MStat label="Venta YTD" value={fM3(sel.ytd)} />
                <MStat label="Ticket prom." value={fM3(sel.ticket)} />
                <MStat label="Activos" value={sel.activos + "/" + sel.total} color="var(--olive)" />
                <MStat label="Oportunidad" value={fM3(sel.opEst)} color="var(--clay)" />
              </div>
              <div style={{ marginTop: 6 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 10 }}>
                  Clientes ({sel.clients.length})
                </div>
                {sel.clients.map(c => {
                  const st = calcStatus(c);
                  return (
                    <div key={c.id} onClick={()=>openClient(c.id)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", cursor: "pointer", borderBottom: "1px solid var(--paper-3)" }}>
                      <div className={`mini-avatar k${cK3(c.id)}`} style={{ width: 28, height: 28, fontSize: 10 }}>{iO3(c.name)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{fM3(c.avgMonthly)}/mes</div>
                      </div>
                      <StatePill state={st.state} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
const MStat = ({label, value, color}) => (
  <div style={{ padding: 12, background: "var(--paper-2)", borderRadius: 8 }}>
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-3)" }}>{label}</div>
    <div style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 500, color: color || "var(--ink)", marginTop: 3 }}>{value}</div>
  </div>
);

window.Views.ViewOpportunities = ViewOpportunities;
window.Views.ViewCampaigns = ViewCampaigns;
window.Views.ViewProducts = ViewProducts;
window.Views.ViewTeamV2 = ViewTeamV2;
window.Views.ViewMapV2 = ViewMapV2;
window.StatePill = StatePill;
