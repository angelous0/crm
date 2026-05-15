// ============================================================
// VIEWS — Hoy, Clientes, Mapa, Analítica, Automatizaciones
// ============================================================
const { useState, useMemo, useEffect, useRef } = React;
const { CLIENTS, BRANDS, REGIONS, INTERACTIONS, ME, KPIS, AUTOMATIONS } = window.HiloData;

const fmtMoney = (n) => "S/ " + n.toLocaleString("es-PE");
const fmtDate  = (s) => {
  const d = new Date(s);
  const months = ["ene","feb","mar","abr","may","jun","jul","ago","set","oct","nov","dic"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};
const daysSince = (s) => {
  const today = new Date("2026-05-05");
  const d = new Date(s);
  return Math.round((today - d) / 86400000);
};

const initialsOf = (s) => s.split(" ").slice(0,2).map(w=>w[0]).join("").toUpperCase();
const colorKey = (id) => parseInt(id.replace(/\D/g,""), 10) % 5;

const brandById = (id) => BRANDS.find(b => b.id === id);
const regionById = (id) => REGIONS.find(r => r.id === id);
const familyById = (id) => null; // deprecated — vinculación ahora vía linkedTo

// ─────────────────────────────────────────────────────────────
// HOY — bandeja de seguimientos del vendedor
// ─────────────────────────────────────────────────────────────
function ClientStatesPanel({ openClient }) {
  const [openState, setOpenState] = useState(null);
  const calc = window.HiloLogic?.calcStatus;
  if (!calc) return null;

  const buckets = useMemo(() => {
    const map = { vip:[], activo:[], nuevo:[], "en-riesgo":[], dormido:[], perdido:[], recuperado:[] };
    CLIENTS.forEach(c => {
      const s = calc(c).state;
      if (map[s]) map[s].push(c);
    });
    return map;
  }, []);

  const order = [
    { id:"vip",         label:"VIP",         desc:"Oro · YTD > S/50k",  color:"#8B6914", bg:"rgba(201,138,59,.10)" },
    { id:"activo",      label:"Activos",     desc:"Compran al día",     color:"#3F5A3D", bg:"rgba(92,122,90,.08)" },
    { id:"nuevo",       label:"Nuevos",      desc:"< 90 días desde alta", color:"#2A6FDB", bg:"rgba(42,111,219,.06)" },
    { id:"en-riesgo",   label:"En riesgo",   desc:"+40% sobre frecuencia", color:"#B5462A", bg:"rgba(181,70,42,.07)" },
    { id:"dormido",     label:"Dormidos",    desc:"+150% sobre frecuencia", color:"#7A4E7E", bg:"rgba(122,78,126,.08)" },
    { id:"perdido",     label:"Perdidos",    desc:"+300% sobre frecuencia", color:"#5C5C5C", bg:"rgba(92,92,92,.08)" },
    { id:"recuperado",  label:"Recuperados", desc:"Volvieron a comprar", color:"#1F8A5B", bg:"rgba(31,138,91,.08)" },
  ];
  const total = CLIENTS.length;
  const opened = openState ? buckets[openState] : null;

  return (
    <div className="panel" style={{ marginBottom: 22 }}>
      <div className="panel-head">
        <div>
          <h2 className="panel-title" style={{ fontSize: 17 }}>Estado de mis clientes</h2>
          <div className="panel-sub" style={{ marginTop: 3 }}>CALCULADO AUTOMÁTICO · CLICK PARA VER LA LISTA</div>
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)" }}>{total} CLIENTES TOTALES</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderTop: "1px solid var(--paper-3)" }}>
        {order.map((o, i) => {
          const list = buckets[o.id] || [];
          const pct = total ? Math.round(list.length / total * 100) : 0;
          const isOpen = openState === o.id;
          return (
            <button
              key={o.id}
              onClick={() => setOpenState(isOpen ? null : o.id)}
              style={{
                padding: "18px 14px",
                background: isOpen ? o.bg : "var(--paper)",
                borderRight: i < order.length - 1 ? "1px solid var(--paper-3)" : "none",
                borderBottom: isOpen ? `2px solid ${o.color}` : "2px solid transparent",
                border: "none",
                borderLeft: "none", borderTop: "none",
                cursor: "pointer",
                textAlign: "left",
                transition: "background .15s",
                position: "relative",
              }}
              onMouseEnter={(e) => { if (!isOpen) e.currentTarget.style.background = "var(--paper-2)"; }}
              onMouseLeave={(e) => { if (!isOpen) e.currentTarget.style.background = "var(--paper)"; }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 50, background: o.color }}></span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-3)" }}>
                  {o.label}
                </span>
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 500, color: o.color, letterSpacing: "-0.02em", lineHeight: 1 }}>
                {list.length}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ink-3)", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                {pct}% de cartera
              </div>
              <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 6, fontStyle: "italic", lineHeight: 1.3 }}>
                {o.desc}
              </div>
            </button>
          );
        })}
      </div>

      {opened && (
        <div style={{ borderTop: "1px solid var(--paper-3)", padding: "14px 18px", background: "var(--paper-2)", animation: "qfIn .2s" }}>
          <div style={{ fontSize: 12, color: "var(--ink-2)", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span><strong>{opened.length} clientes</strong> en estado <strong>{order.find(o=>o.id===openState).label}</strong></span>
            <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => setOpenState(null)}>Cerrar</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
            {opened.map(c => (
              <div
                key={c.id}
                onClick={() => openClient(c.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px", background: "var(--paper)",
                  borderRadius: 8, border: "1px solid var(--line)", cursor: "pointer",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--paper-3)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "var(--paper)"}
              >
                <div className={`mini-avatar k${colorKey(c.id)}`} style={{ width: 28, height: 28, fontSize: 10 }}>
                  {initialsOf(c.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                  <div style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
                    {regionById(c.region)?.name} · hace {daysSince(c.lastPurchase)}d
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ViewToday({ openClient, openQuickFollowup }) {
  const [done, setDone] = useState(new Set());
  const [filter, setFilter] = useState("all");
  const [logged, setLogged] = useState({}); // clientId -> result label

  // Expose so QuickFollowup save can flag rows as logged
  useEffect(() => {
    window.__logFollowup = (clientId, payload) => {
      setLogged(prev => ({ ...prev, [clientId]: payload }));
      setDone(prev => { const n = new Set(prev); n.add(clientId); return n; });
    };
    return () => { delete window.__logFollowup; };
  }, []);

  const myClients = CLIENTS.filter(c => c.salesperson === "Diego R.");
  const todayList = myClients
    .filter(c => c.nextFollowup)
    .sort((a,b) => {
      const order = { alta: 0, media: 1, baja: 2 };
      if (order[a.priority] !== order[b.priority]) return order[a.priority] - order[b.priority];
      return new Date(a.nextFollowup) - new Date(b.nextFollowup);
    });

  const filtered = todayList.filter(c => {
    if (filter === "all") return true;
    if (filter === "alta") return c.priority === "alta";
    if (filter === "riesgo") return c.status === "en-riesgo" || c.status === "dormido";
    if (filter === "credito") return c.creditUsed / c.creditLine >= 0.75;
    return true;
  });

  const toggle = (id) => {
    const next = new Set(done);
    next.has(id) ? next.delete(id) : next.add(id);
    setDone(next);
  };

  const totalUrgent = todayList.filter(c=>c.priority==="alta").length;
  const totalAmount = todayList.reduce((a,c) => a + c.avgMonthly, 0);

  return (
    <>
      <div className="page-head">
        <div style={{ position: "relative" }}>
          <div className="editorial-mark" style={{ left: -20, top: -28 }}>Cola</div>
          <h1 className="page-title">Hola <em>Diego</em>, hoy te toca llamar a {totalUrgent} urgentes</h1>
          <div className="page-sub">MARTES · 05 MAY 2026 · {filtered.length} LLAMADAS PROGRAMADAS</div>
        </div>
        <button className="btn btn-primary"><Icon name="phone" size={14}/> Empezar la primera</button>
      </div>

      <div className="kpi-grid">
        <KpiCard label="Por llamar hoy" value={String(filtered.length)} delta="+3 vs ayer" up />
        <KpiCard label="Mes en curso" value={fmtMoney(KPIS.ventasMes.value)} delta={`+${Math.round((KPIS.ventasMes.value-KPIS.ventasMes.prev)/KPIS.ventasMes.prev*100)}%`} up />
        <KpiCard label="Por cobrar" value={fmtMoney(KPIS.cobranzaPend.value)} delta="-7% vs mes ant." up />
        <KpiCard label="En riesgo" value={String(KPIS.enRiesgo.value)} delta="+4 nuevos" down />
      </div>

      <div className="today-grid">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Cola de llamadas</h2>
              <div className="panel-sub" style={{ marginTop: 4 }}>Click en cualquier fila → registra el resultado de la llamada</div>
            </div>
            <div className="filter-bar" style={{ margin: 0 }}>
              <button className={`filter-chip ${filter==="all"?"on":""}`} onClick={()=>setFilter("all")}>Todos</button>
              <button className={`filter-chip ${filter==="alta"?"on":""}`} onClick={()=>setFilter("alta")}>Urgentes</button>
              <button className={`filter-chip ${filter==="riesgo"?"on":""}`} onClick={()=>setFilter("riesgo")}>En riesgo</button>
              <button className={`filter-chip ${filter==="credito"?"on":""}`} onClick={()=>setFilter("credito")}>Crédito alto</button>
            </div>
          </div>
          <div className="task-list">
            {filtered.map((c, i) => {
              const isDone = done.has(c.id);
              const region = regionById(c.region);
              const days = daysSince(c.lastPurchase);
              const log = logged[c.id];
              return (
                <div key={c.id} className={`task-row ${isDone ? "done" : ""}`} onClick={() => openQuickFollowup(c)}>
                  <button
                    className={`task-check ${isDone ? "done" : ""}`}
                    onClick={(e) => { e.stopPropagation(); toggle(c.id); }}
                    aria-label="Marcar"
                  >
                    {isDone && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m4 12 5 5 11-12"/></svg>}
                  </button>
                  <div className="task-main">
                    <div className="task-client">
                      <span className={`dot-priority ${c.priority}`}></span>
                      {c.name}
                      {c.tier === "Oro" && <span className="chip gold">★ Oro</span>}
                      {c.status === "en-riesgo" && <span className="chip warn">en riesgo</span>}
                      {c.status === "dormido" && <span className="chip crit">dormido · {days}d</span>}
                      {log && <span className="chip ok">{log.emoji} {log.label}</span>}
                    </div>
                    <div className="task-reason">
                      <span>{c.followupReason}</span>
                      <span style={{ color: "var(--ink-3)" }}>·</span>
                      <span style={{ color: "var(--ink-3)" }}>{region?.name}</span>
                      <span style={{ color: "var(--ink-3)" }}>·</span>
                      <span style={{ color: "var(--ink-3)" }}>última: hace {days}d</span>
                    </div>
                  </div>
                  <div className="task-meta">
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={(e)=>{ e.stopPropagation(); openQuickFollowup(c); }} title="Registrar"><Icon name="check" size={14} /></button>
                      <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={(e)=>{ e.stopPropagation(); openClient(c.id); }} title="Ver ficha"><Icon name="eye" size={14} /></button>
                    </div>
                    <span>{fmtDate(c.nextFollowup)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="panel">
            <div className="panel-head">
              <h2 className="panel-title" style={{ fontSize: 16 }}>Resumen del día</h2>
            </div>
            <div style={{ padding: 18 }}>
              <div style={{ marginBottom: 16 }}>
                <div className="kpi-label">Potencial promedio</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 500, letterSpacing: "-0.02em", marginTop: 4 }}>
                  {fmtMoney(totalAmount)}
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
                  SI CONTACTAS A LOS {filtered.length} HOY
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12.5 }}>
                <MiniRow label="Visitas planeadas"      value="2" />
                <MiniRow label="Llamadas pendientes"     value="5" />
                <MiniRow label="WhatsApp por enviar"     value="4" />
                <MiniRow label="Cierres esperados"       value={fmtMoney(8400)} />
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2 className="panel-title" style={{ fontSize: 16 }}>Recién contactados</h2>
            </div>
            <div style={{ padding: "8px 18px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
              {INTERACTIONS.slice(0, 4).map(i => {
                const c = CLIENTS.find(c=>c.id===i.clientId);
                return (
                  <div key={i.id} style={{ display: "flex", gap: 10, fontSize: 12.5, paddingTop: 8, borderTop: "1px solid var(--paper-3)" }}>
                    <div className={`mini-avatar k${colorKey(c.id)}`} style={{ width: 28, height: 28, fontSize: 10 }}>
                      {initialsOf(c.name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 12.5 }}>{c.name}</div>
                      <div style={{ color: "var(--ink-3)", fontSize: 11, marginTop: 2 }}>
                        {i.type} · {fmtDate(i.date)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

const MiniRow = ({label, value}) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--paper-3)" }}>
    <span style={{ color: "var(--ink-2)" }}>{label}</span>
    <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{value}</span>
  </div>
);

// Tiny sparkline (decorative)
const Spark = ({ color = "var(--clay)" }) => {
  const points = "0,18 8,14 16,16 24,10 32,12 40,6 48,8 56,4";
  return (
    <svg className="kpi-spark" width="60" height="22" viewBox="0 0 60 22" fill="none">
      <polyline points={points} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
};

const KpiCard = ({ label, value, delta, up }) => (
  <div className="kpi">
    <div className="kpi-label">{label}</div>
    <div className="kpi-value">{value}</div>
    <div className={`kpi-delta ${up ? "up" : "down"}`}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: up ? "rotate(0)" : "rotate(180deg)" }}>
        <path d="M12 19V5M5 12l7-7 7 7"/>
      </svg>
      {delta}
    </div>
    <Spark color={up ? "var(--olive)" : "var(--clay)"} />
  </div>
);

// ─────────────────────────────────────────────────────────────
// CLIENTES — tabla con filtros
// ─────────────────────────────────────────────────────────────
function ViewClients({ openClient }) {
  const [region, setRegion] = useState("all");
  const [tier, setTier] = useState("all");
  const [brand, setBrand] = useState("all");
  const [q, setQ] = useState("");
  const [onlyPrincipals, setOnlyPrincipals] = useState(true);

  const filtered = useMemo(() => {
    return CLIENTS.filter(c => {
      if (onlyPrincipals && c.linkedTo) return false;
      if (region !== "all" && c.region !== region) return false;
      if (tier !== "all" && c.tier !== tier) return false;
      if (brand !== "all" && !c.brands.includes(brand)) return false;
      if (q) {
        const s = q.toLowerCase();
        if (!c.name.toLowerCase().includes(s) && !c.contact.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [region, tier, brand, q, onlyPrincipals]);

  // Conteo de vinculados por principal
  const linkedCount = useMemo(() => {
    const m = {};
    CLIENTS.forEach(c => { if (c.linkedTo) m[c.linkedTo] = (m[c.linkedTo] || 0) + 1; });
    return m;
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Cuentas <em>activas</em></h1>
          <div className="page-sub">{filtered.length} DE {CLIENTS.filter(c=>!c.linkedTo).length} CUENTAS PRINCIPALES · ORDENADAS POR ÚLTIMA COMPRA</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost"><Icon name="filter" size={14}/> Exportar</button>
          <button className="btn btn-primary"><Icon name="plus" /> Nuevo cliente</button>
        </div>
      </div>

      <div className="filter-bar">
        <input
          placeholder="Buscar por nombre o contacto…"
          value={q} onChange={(e)=>setQ(e.target.value)}
          style={{
            padding: "7px 14px", borderRadius: 999, border: "1px solid var(--line)",
            background: "var(--paper)", outline: "none", fontSize: 12, minWidth: 240
          }}
        />
        <FilterPills value={region} onChange={setRegion} options={[{v:"all",l:"Todas las regiones"}, ...REGIONS.slice(0,8).map(r=>({v:r.id,l:r.name}))]} />
        <FilterPills value={tier} onChange={setTier} options={[{v:"all",l:"Todos los tiers"},{v:"Oro",l:"★ Oro"},{v:"Plata",l:"Plata"},{v:"Bronce",l:"Bronce"}]} />
        <FilterPills value={brand} onChange={setBrand} options={[{v:"all",l:"Todas las marcas"}, ...BRANDS.map(b=>({v:b.id,l:b.name}))]} />
        <button
          className={`filter-chip ${onlyPrincipals ? "on" : ""}`}
          onClick={() => setOnlyPrincipals(!onlyPrincipals)}
          title="Oculta sucursales y muestra solo el cliente principal de cada grupo"
          style={{ marginLeft: "auto" }}
        >
          {onlyPrincipals ? "★ Solo principales" : "Todos (incluye vinculados)"}
        </button>
      </div>

      <div className="panel">
        <table className="tbl">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Región</th>
              <th>Familia</th>
              <th>Marcas</th>
              <th className="num">Última compra</th>
              <th className="num">Mes prom.</th>
              <th>Crédito</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => {
              const region = regionById(c.region);
              const fam = null;
              const credPct = Math.round(c.creditUsed / c.creditLine * 100);
              const credClass = credPct >= 80 ? "crit" : credPct >= 60 ? "warn" : "ok";
              return (
                <tr key={c.id} onClick={()=>openClient(c.id)}>
                  <td>
                    <div className="client-cell">
                      <div className={`mini-avatar k${colorKey(c.id)}`}>{initialsOf(c.name)}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                          {c.name}
                          {c.tier === "Oro" && <span className="chip gold">★</span>}
                          {linkedCount[c.id] && (
                            <span title={`${linkedCount[c.id]} cliente(s) vinculado(s)`} style={{ fontSize: 9.5, color: "#1F8A5B", fontFamily: "var(--font-mono)", padding: "2px 6px", background: "rgba(31,138,91,.1)", borderRadius: 4, letterSpacing: "0.06em" }}>
                              +{linkedCount[c.id]} VINC
                            </span>
                          )}
                          {c.linkedTo && (
                            <span title="Vinculado como sucursal" style={{ fontSize: 9.5, color: "#2A6FDB", fontFamily: "var(--font-mono)", padding: "2px 6px", background: "rgba(42,111,219,.08)", borderRadius: 4, letterSpacing: "0.06em" }}>
                              ↗ SUCURSAL
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>{c.contact} · {c.code}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5 }}>
                      <Icon name="pin" size={12}/> {region?.name}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{c.district}</div>
                  </td>
                  <td>
                    {fam ? <span className="chip ghost"><Icon name="family" size={11}/>{fam.surname}</span> : <span style={{ color: "var(--ink-3)", fontSize: 12 }}>—</span>}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                      {c.brands.slice(0,3).map(bid => {
                        const b = brandById(bid);
                        return <span key={bid} style={{
                          fontSize: 10.5, padding: "2px 7px", borderRadius: 4,
                          background: b.color + "22", color: b.color,
                          fontFamily: "var(--font-mono)", fontWeight: 500
                        }}>{b.name}</span>;
                      })}
                    </div>
                  </td>
                  <td className="num">
                    <div style={{ fontWeight: 500 }}>{fmtMoney(c.lastPurchaseAmount)}</div>
                    <div style={{ fontSize: 10.5, color: "var(--ink-3)" }}>hace {daysSince(c.lastPurchase)}d</div>
                  </td>
                  <td className="num">{fmtMoney(c.avgMonthly)}</td>
                  <td>
                    <div style={{ width: 100 }}>
                      <div className="bar-track" style={{ height: 5 }}>
                        <div className={`bar-fill ${credClass}`} style={{ width: credPct + "%" }}></div>
                      </div>
                      <div style={{ fontSize: 10.5, fontFamily: "var(--font-mono)", color: "var(--ink-3)", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                        {credPct}% · {fmtMoney(c.creditUsed)}/{fmtMoney(c.creditLine)}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`chip ${c.status==="activo"?"ok":c.status==="en-riesgo"?"warn":"crit"}`}>
                      {c.status === "activo" ? "Activo" : c.status === "en-riesgo" ? "En riesgo" : "Dormido"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

const FilterPills = ({ value, onChange, options }) => (
  <select
    value={value} onChange={(e)=>onChange(e.target.value)}
    style={{
      padding: "7px 14px", borderRadius: 999,
      border: "1px solid var(--line)", background: "var(--paper)",
      fontSize: 12, color: "var(--ink-2)", outline: "none", cursor: "pointer"
    }}
  >
    {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
  </select>
);

// ─────────────────────────────────────────────────────────────
// MAPA — Perú con pines por provincia
// ─────────────────────────────────────────────────────────────
function ViewMap({ openClient }) {
  const [hover, setHover] = useState(null);
  const [active, setActive] = useState(null);

  // Aggregate clients by region
  const regionStats = useMemo(() => {
    const map = {};
    REGIONS.forEach(r => { map[r.id] = { ...r, clients: [], total: 0 }; });
    CLIENTS.forEach(c => {
      if (map[c.region]) {
        map[c.region].clients.push(c);
        map[c.region].total += c.ytd;
      }
    });
    return Object.values(map).sort((a,b) => b.clients.length - a.clients.length);
  }, []);

  const maxCount = Math.max(...regionStats.map(r=>r.clients.length));

  const activeRegion = active ? regionStats.find(r=>r.id===active) : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Cartera por <em>territorio</em></h1>
          <div className="page-sub">{CLIENTS.length} CLIENTES · {REGIONS.filter(r=>regionStats.find(rs=>rs.id===r.id)?.clients.length).length} REGIONES ACTIVAS</div>
        </div>
      </div>

      <div className="map-grid">
        <div className="map-wrap">
          <svg viewBox="0 0 600 800" className="map-svg" style={{ maxHeight: 720 }}>
            <defs>
              <pattern id="weave" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(181,70,42,0.08)" strokeWidth="1"/>
              </pattern>
            </defs>

            {/* Silhouette */}
            <path d={PERU_SILHOUETTE_PATH} fill="var(--paper-2)" stroke="var(--line)" strokeWidth="1.2"/>
            <path d={PERU_SILHOUETTE_PATH} fill="url(#weave)" />

            {/* Decorative compass */}
            <g transform="translate(540, 80)" opacity="0.5">
              <circle cx="0" cy="0" r="22" fill="none" stroke="var(--line)" strokeWidth="0.8"/>
              <path d="M0 -18 L4 0 L0 18 L-4 0 Z" fill="var(--clay)" stroke="var(--clay)" strokeWidth="0.5"/>
              <text x="0" y="-26" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="var(--ink-3)">N</text>
            </g>

            {/* Region labels (subset) */}
            {REGIONS.map(r => (
              <text
                key={`l-${r.id}`}
                x={r.x + 12} y={r.y + 3}
                className="map-region-label"
                opacity={active === r.id || hover === r.id ? 1 : 0.4}
              >
                {r.name.toUpperCase()}
              </text>
            ))}

            {/* Pins */}
            {regionStats.map(r => {
              if (!r.clients.length) return null;
              const radius = 6 + (r.clients.length / maxCount) * 14;
              const isActive = active === r.id;
              const isHover  = hover === r.id;
              return (
                <g key={r.id} className={`map-pin ${isActive ? "active" : ""}`}
                   onClick={() => setActive(active === r.id ? null : r.id)}
                   onMouseEnter={() => setHover(r.id)}
                   onMouseLeave={() => setHover(null)}
                >
                  <circle cx={r.x} cy={r.y} r={radius + 4} fill="var(--clay)" opacity={isActive || isHover ? 0.18 : 0.08}/>
                  <circle cx={r.x} cy={r.y} r={radius} fill="var(--clay)" opacity={0.85}/>
                  <text x={r.x} y={r.y + 4} textAnchor="middle"
                        fontFamily="var(--font-mono)" fontSize="11" fontWeight="600"
                        fill="var(--paper)">
                    {r.clients.length}
                  </text>
                </g>
              );
            })}

            {/* Editorial labels */}
            <text x="40" y="60" fontFamily="var(--font-display)" fontSize="42" fontStyle="italic" fontWeight="500" fill="var(--ink)" letterSpacing="-1">
              Perú
            </text>
            <text x="40" y="78" fontFamily="var(--font-mono)" fontSize="9" fill="var(--ink-3)" letterSpacing="2">
              CARTERA · MAY 2026
            </text>
            <text x="40" y="780" fontFamily="var(--font-mono)" fontSize="8" fill="var(--ink-3)" letterSpacing="1.5">
              EL TAMAÑO DEL PIN INDICA Nº DE CLIENTES · COLOR INTENSIDAD = ACTIVIDAD
            </text>
          </svg>
        </div>

        <div className="map-side-list">
          <div className="panel-head" style={{ borderBottom: "1px solid var(--paper-3)" }}>
            <div>
              <h2 className="panel-title" style={{ fontSize: 16 }}>{activeRegion ? activeRegion.name : "Por región"}</h2>
              <div className="panel-sub" style={{ marginTop: 4 }}>
                {activeRegion ? `${activeRegion.clients.length} clientes` : "Click en un pin"}
              </div>
            </div>
            {activeRegion && (
              <button className="icon-btn" onClick={()=>setActive(null)}>
                <Icon name="close" size={14}/>
              </button>
            )}
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {(activeRegion ? [activeRegion] : regionStats.filter(r=>r.clients.length)).map(r => (
              <div key={r.id}>
                {!activeRegion && (
                  <div className={`map-region-row ${active===r.id?"active":""}`} onClick={()=>setActive(r.id)}>
                    <div className="map-region-name">{r.name}</div>
                    <div className="map-region-count">{r.clients.length} cli</div>
                    <div className="map-region-count">{fmtMoney(r.total)}</div>
                  </div>
                )}
                {activeRegion && r.clients.map(c => (
                  <div key={c.id} className="map-region-row" onClick={()=>openClient(c.id)}>
                    <div>
                      <div className="map-region-name" style={{ fontSize: 13 }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{c.contact} · {c.district}</div>
                    </div>
                    <span className={`chip ${c.status==="activo"?"ok":c.status==="en-riesgo"?"warn":"crit"}`} style={{ gridColumn: "2 / 4" }}>
                      {fmtMoney(c.avgMonthly)}/mes
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// ANALÍTICA
// ─────────────────────────────────────────────────────────────
function ViewAnalytics() {
  const brandStats = BRANDS.map(b => {
    const total = INTERACTIONS.filter(i => i.brand === b.id && i.amount).reduce((a,i) => a + i.amount, 0);
    const clientsCount = CLIENTS.filter(c => c.brands.includes(b.id)).length;
    return { ...b, total, clientsCount };
  }).sort((a,b) => b.total - a.total);

  const maxBrand = Math.max(...brandStats.map(b => b.total));

  // Top productos por tipo
  const typeStats = {};
  INTERACTIONS.forEach(i => {
    if (!i.items) return;
    i.items.forEach(it => {
      typeStats[it.type] = (typeStats[it.type] || 0) + it.qty * 35; // precio promedio estimado
    });
  });
  const topTypes = Object.entries(typeStats).sort((a,b) => b[1]-a[1]).slice(0, 6);
  const maxType = Math.max(...topTypes.map(t => t[1]));

  // Clientes top por YTD
  const topClients = [...CLIENTS].sort((a,b) => b.ytd - a.ytd).slice(0, 6);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Análisis de <em>cartera</em></h1>
          <div className="page-sub">YTD 2026 · COMPARATIVO POR MARCA, PRODUCTO Y CLIENTE</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost">Últimos 30 días</button>
          <button className="btn btn-ghost">Año en curso ▾</button>
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard label="Ventas YTD"           value={fmtMoney(brandStats.reduce((a,b)=>a+b.total,0) * 18)} delta="+18%" up />
        <KpiCard label="Ticket promedio"      value={fmtMoney(3420)}                                     delta="+6%"  up />
        <KpiCard label="Frecuencia recompra"  value="42 días"                                            delta="-3 días" up />
        <KpiCard label="Tasa de retención"    value="84%"                                                delta="+2 pts" up />
      </div>

      <div className="analytics-grid">
        <div className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Ventas por marca</h2>
            <span className="panel-sub">YTD · {brandStats.length} marcas</span>
          </div>
          <div>
            {brandStats.map((b, i) => (
              <div key={b.id} className="brand-row">
                <span className="brand-swatch" style={{ background: b.color }}></span>
                <div>
                  <div className="brand-name">{b.name}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                    {b.clientsCount} clientes · {b.types.join(" · ")}
                  </div>
                  <div className="brand-bar" style={{ marginTop: 8 }}>
                    <span style={{ width: (b.total/maxBrand*100) + "%", background: b.color }}></span>
                  </div>
                </div>
                <div style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{fmtMoney(b.total)}</div>
                  <div style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{Math.round(b.total/brandStats[0].total*100)}%</div>
                </div>
                <div style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 24, color: "var(--ink-3)", textAlign: "right" }}>
                  0{i+1}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Tipos de producto</h2>
              <span className="panel-sub">Top 6</span>
            </div>
            <div style={{ padding: "14px 18px" }}>
              {topTypes.map(([t, v], i) => (
                <div key={t} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 500 }}>{t}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)" }}>{fmtMoney(v)}</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: (v/maxType*100)+"%", background: BRANDS[i % BRANDS.length].color }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Top clientes YTD</h2>
            </div>
            <div>
              {topClients.map((c, i) => (
                <div key={c.id} style={{
                  display: "grid", gridTemplateColumns: "24px 1fr auto", gap: 10,
                  padding: "12px 18px", borderBottom: i < topClients.length - 1 ? "1px solid var(--paper-3)" : "none",
                  alignItems: "center"
                }}>
                  <span style={{ fontFamily: "var(--font-display)", fontStyle: "italic", color: "var(--ink-3)" }}>{i+1}</span>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{regionById(c.region)?.name}</div>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                    {fmtMoney(c.ytd)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// AUTOMATIZACIONES
// ─────────────────────────────────────────────────────────────
function ViewAutomations() {
  const [autos, setAutos] = useState(AUTOMATIONS);
  const toggle = (id) => setAutos(autos.map(a => a.id === id ? { ...a, active: !a.active } : a));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Automatizaciones <em>activas</em></h1>
          <div className="page-sub">{autos.filter(a=>a.active).length} DE {autos.length} REGLAS · DISPARADAS {autos.reduce((a,x)=>a+x.fired,0)} VECES ESTE MES</div>
        </div>
        <button className="btn btn-primary"><Icon name="plus" /> Nueva regla</button>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        {autos.map(a => (
          <div key={a.id} className="auto-card">
            <div>
              <h3 className="auto-name">
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, background: a.active ? "rgba(92,122,90,.15)" : "var(--paper-2)", marginRight: 10, color: a.active ? "var(--olive)" : "var(--ink-3)", verticalAlign: "middle" }}>
                  <Icon name="bolt" size={14} />
                </span>
                {a.name}
              </h3>
              <div className="auto-flow">
                <span className="step"><strong style={{ color: "var(--clay)" }}>SI</strong> {a.trigger}</span>
                <span className="auto-arrow">→</span>
                <span className="step"><strong style={{ color: "var(--olive)" }}>ENTONCES</strong> {a.action}</span>
              </div>
              <div style={{ marginTop: 12, fontSize: 11.5, color: "var(--ink-3)", fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Disparada {a.fired} veces · Última: hace {Math.floor(Math.random()*48)+1}h
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
              <button className={`toggle ${a.active ? "on" : ""}`} onClick={()=>toggle(a.id)} aria-label="Activar"></button>
              <button className="icon-btn" style={{ width: 30, height: 30 }}><Icon name="settings" size={14}/></button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

window.Views = { ViewToday, ViewClients, ViewMap, ViewAnalytics, ViewAutomations, ViewRoute: null, ViewTeam: null, ViewImport: null, ViewTemplates: null };
window.HiloHelpers = { fmtMoney, fmtDate, daysSince, initialsOf, colorKey, brandById, regionById, familyById };
