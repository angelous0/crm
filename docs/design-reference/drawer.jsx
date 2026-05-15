// ============================================================
// CLIENT DRAWER — Ficha + historial + familia
// ============================================================
const { fmtMoney: f$, fmtDate: fD, daysSince: dS, initialsOf: iO, colorKey: cK, brandById: bI, regionById: rI } = window.HiloHelpers;

function ClientDrawer({ clientId, onClose }) {
  const [tab, setTab] = useState("seguimiento");
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState({});
  const baseClient = window.HiloData.CLIENTS.find(cc => cc.id === clientId);
  if (!baseClient) return null;
  const c = { ...baseClient, ...edits };

  // Persist field edit (in-memory only, since Odoo es la fuente de verdad)
  const saveField = (key, val) => {
    setEdits(prev => ({ ...prev, [key]: val }));
    Object.assign(baseClient, { [key]: val });
  };

  const region = rI(c.region);
  // Vinculados: clientes con linkedTo === c.id (si c es principal) o hermanos del principal
  const principalId = c.linkedTo || c.id;
  const linkedSiblings = window.HiloData.CLIENTS.filter(cc => cc.id !== c.id && (cc.linkedTo === principalId || cc.id === principalId));
  const linkedCount = linkedSiblings.length;
  const interactions = window.HiloData.INTERACTIONS.filter(i => i.clientId === c.id).sort((a,b) => new Date(b.date) - new Date(a.date));
  const followups = (window.HiloData.FOLLOWUPS || []).filter(f => f.clientId === c.id).sort((a,b) => new Date(b.date) - new Date(a.date));
  const credPct = Math.round(c.creditUsed / c.creditLine * 100);

  // Estado calculado + frecuencia + oportunidades
  const stat = window.HiloLogic.calcStatus(c);
  const ops = window.HiloLogic.calcOpportunities(c);
  const tlEvents = (window.HiloLogic.TIMELINE_EVENTS || []).filter(e => e.clientId === c.id);
  // Timeline unificado: compras + llamadas + WA + visitas + reclamos + pagos + despachos + notas
  const unified = [
    ...interactions.map(i => ({ id:i.id, date:i.date, type:i.type, title: i.type === "compra" && i.brand ? `Compra ${window.HiloHelpers.brandById(i.brand)?.name} · ${f$(i.amount)}` : i.type === "llamada" ? "Llamada" : i.type === "visita" ? "Visita" : "Interacción", detail:i.note, items:i.items, channel:i.channel, by:"Vendedor" })),
    ...followups.map(f => ({ id:f.id, date:f.date, type:"whatsapp", title: `Seguimiento · ${f.label}`, detail:f.note, by:f.by })),
    ...tlEvents,
  ].sort((a,b) => new Date(b.date) - new Date(a.date));

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose}></div>
      <div className="drawer">
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose}><Icon name="close" size={14}/></button>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            <div className={`mini-avatar k${cK(c.id)}`} style={{ width: 56, height: 56, fontSize: 18, borderRadius: 14 }}>
              {iO(c.name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.1em" }}>{c.code}</span>
                {c.tier === "Oro" && <span className="chip gold">★ Oro</span>}
                {c.tier === "Plata" && <span className="chip silver">Plata</span>}
                {c.tier === "Bronce" && <span className="chip bronze">Bronce</span>}
                {window.StatePill && <window.StatePill state={stat.state} />}
                {c.tags.map(t => <span key={t} className="chip ghost">{t}</span>)}
              </div>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 500, letterSpacing: "-0.02em", margin: "8px 0 4px", lineHeight: 1.05 }}>
                {c.name}
              </h2>
              <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
                {c.contact} · <span style={{ color: "var(--ink-3)" }}>{c.role}</span>
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <button className="btn btn-primary"><Icon name="wa" size={14}/> WhatsApp</button>
                <button className="btn btn-ghost"><Icon name="phone" size={14}/> Llamar</button>
                <button className="btn btn-ghost" onClick={() => window.__showStockForClient && window.__showStockForClient(c)}><Icon name="cart" size={14}/> Ver stock para este cliente</button>
              </div>
            </div>
          </div>
        </div>

        <div className="drawer-tabs">
          {[
            { id: "seguimiento", label: `Seguimiento · ${followups.length}` },
            { id: "ventas", label: "Ventas" },
            { id: "timeline", label: `Timeline · ${unified.length}` },
            { id: "perfil", label: "Perfil" },
            { id: "oportunidades", label: `Oportunidades · ${ops.length}` },
            { id: "familia", label: linkedCount > 0 ? `Vinculados · ${linkedCount+1}` : "Vinculados" },
            { id: "marcas", label: "Marcas" },
          ].map(t => (
            <button key={t.id} className={`drawer-tab ${tab===t.id?"active":""}`} onClick={()=>setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="drawer-body">
          {tab === "seguimiento" && (
            <>
              <div style={{
                padding: 16, borderRadius: 12,
                background: "linear-gradient(135deg, rgba(181,70,42,.08), rgba(201,138,59,.05))",
                border: "1px solid var(--line)",
                marginBottom: 22,
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16
              }}>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--ink-3)", textTransform: "uppercase" }}>
                    Próximo seguimiento
                  </div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 500, marginTop: 4 }}>
                    {fD(c.nextFollowup)}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 4 }}>
                    {c.followupReason}
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => { window.__openQuickFollowup && window.__openQuickFollowup(c); onClose(); }}
                >
                  <Icon name="check" size={14}/> Registrar contacto
                </button>
              </div>

              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 500, marginBottom: 14 }}>Bitácora de seguimientos</h3>

              {followups.length === 0 ? (
                <div style={{
                  padding: 32, textAlign: "center",
                  border: "1px dashed var(--line)", borderRadius: 12,
                  background: "var(--paper-2)"
                }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontStyle: "italic", color: "var(--ink-3)", marginBottom: 6 }}>
                    Sin seguimientos registrados
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                    Cada vez que contactes al cliente, registra qué pasó en 5 segundos.
                  </div>
                </div>
              ) : (
                <div className="timeline">
                  {followups.map(f => (
                    <div key={f.id} className="tl-item">
                      <div className="tl-date">
                        {fD(f.date)} · {f.by}
                      </div>
                      <div className="tl-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 22 }}>{f.emoji}</span>
                        {f.label}
                      </div>
                      {f.note && <div className="tl-body">"{f.note}"</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* Plantillas WhatsApp accesibles desde aquí */}
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 500, margin: "24px 0 14px" }}>Plantillas rápidas</h3>
              <div style={{ display: "grid", gap: 8 }}>
                {window.HiloData.WA_TEMPLATES.slice(0, 3).map(t => (
                  <button key={t.id} style={{
                    textAlign: "left", padding: 12,
                    border: "1px solid var(--line)", borderRadius: 10,
                    background: "var(--paper)", cursor: "pointer", display: "flex", gap: 12, alignItems: "flex-start"
                  }}
                  onClick={() => { /* would copy/send */ }}
                  >
                    <span style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: "rgba(92,122,90,.14)", color: "#3F5A3D",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                    }}>
                      <Icon name="wa" size={16}/>
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{t.name}</div>
                      <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3, lineHeight: 1.45 }}>
                        {t.body.replace("{contacto}", c.contact.split(" ")[0]).replace("{vendedor}", c.salesperson).replace("{nombre}", c.name).replace("{dias}", String(dS(c.lastPurchase))).replace("{marca}", "Element Premium").replace("{monto}", f$(c.creditUsed))}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {tab === "timeline" && (
            <>
              <div style={{ marginBottom: 16, fontSize: 12, color: "var(--ink-3)" }}>
                Todo lo que pasó con este cliente: compras (Odoo), llamadas, WhatsApp, visitas, despachos, pagos y reclamos.
              </div>
              <div className="timeline">
                {unified.map(e => {
                  const tType = window.HiloLogic.TIMELINE_TYPES[e.type] || { emoji:"·", label:e.type, color:"var(--ink-3)" };
                  return (
                    <div key={e.id} className={`tl-item ${e.type}`} style={{ borderLeftColor: tType.color }}>
                      <div className="tl-date">
                        <span style={{ marginRight: 6 }}>{tType.emoji}</span>
                        {fD(e.date)} · <span style={{ color: tType.color, fontWeight: 600 }}>{tType.label.toUpperCase()}</span>
                        {e.channel && <span> · {e.channel}</span>}
                        {e.by && <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--ink-3)" }}>· {e.by}</span>}
                      </div>
                      <div className="tl-title">{e.title}</div>
                      {e.items && (
                        <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 6, fontFamily: "var(--font-mono)" }}>
                          {e.items.map(it => `${it.qty}× ${it.type}`).join("  ·  ")}
                        </div>
                      )}
                      {e.detail && <div className="tl-body">"{e.detail}"</div>}
                    </div>
                  );
                })}
                {unified.length === 0 && (
                  <div style={{ fontSize: 13, color: "var(--ink-3)", padding: 20, textAlign: "center" }}>Sin eventos registrados</div>
                )}
              </div>
            </>
          )}

          {tab === "oportunidades" && (
            <>
              {/* Frecuencia esperada */}
              <div className="panel" style={{ marginBottom: 20 }}>
                <div className="panel-head">
                  <h3 className="panel-title" style={{ fontSize: 15 }}>Frecuencia de recompra</h3>
                  <span className={`chip ${stat.ratio>1.4?"crit":stat.ratio>1?"warn":"ok"}`}>
                    {stat.days}d / {stat.expected}d esperados
                  </span>
                </div>
                <div style={{ padding: 18 }}>
                  <div className="freq-bar">
                    <div className={`freq-fill ${stat.ratio>1.4?"crit":stat.ratio>1?"warn":"ok"}`} style={{ width: Math.min(100, stat.ratio * 50) + "%" }}></div>
                    <div className="freq-marker" style={{ left: "50%" }}></div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-3)", letterSpacing: "0.04em" }}>
                    <span>HOY · {stat.days} DÍAS</span>
                    <span>ESPERADO · {stat.expected}d</span>
                    <span>RIESGO · {Math.round(stat.expected*1.4)}d</span>
                  </div>
                  <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
                    {stat.ratio < 1 ? `✓ Está dentro del ciclo esperado para un canal "${c.channel}".` :
                     stat.ratio < 1.4 ? `⚠ Lleva ${stat.days - stat.expected} días por encima de lo esperado.` :
                     `✗ Lleva ${stat.days - stat.expected} días sin comprar — accionar ahora.`}
                  </div>
                </div>
              </div>

              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 500, marginBottom: 14 }}>Oportunidades detectadas</h3>
              {ops.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: "var(--ink-3)", fontSize: 13, border: "1px dashed var(--line)", borderRadius: 10 }}>
                  Sin oportunidades automáticas detectadas. Cliente al día.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {ops.map((o, i) => (
                    <div key={i} className={`op-card ${o.priority}`}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                        <div>
                          <span className="op-type">{o.type.replace("-", " ")}</span>
                          <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 500 }}>{o.title}</div>
                          <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 4 }}>{o.detail}</div>
                          <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 8 }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", color: "var(--ink-3)", textTransform: "uppercase", marginRight: 6 }}>ACCIÓN</span>
                            {o.action}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 500, color: "var(--clay)" }}>{f$(o.estimate)}</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", color: "var(--ink-3)" }}>EST/MES</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === "ventas" && (
            window.SalesTab
              ? React.createElement(window.SalesTab, { client })
              : <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>Cargando ventas...</div>
          )}

          {tab === "perfil" && (
            <>
              {/* Quick stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
                <DrawerStat label="YTD" value={f$(c.ytd)} />
                <DrawerStat label="Mes prom." value={f$(c.avgMonthly)} />
                <DrawerStat label="Última compra" value={`hace ${dS(c.lastPurchase)}d`} sub={fD(c.lastPurchase)} />
                <DrawerStat label="Cliente desde" value={new Date(c.since).getFullYear()} sub={`${Math.floor((new Date("2026-05-05") - new Date(c.since))/86400000/365)} años`} />
              </div>

              {/* Edit toggle */}
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
                <button
                  className={`btn ${editing ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setEditing(!editing)}
                  style={{ fontSize: 12 }}
                >
                  {editing ? "✓ Listo" : "✎ Editar perfil"}
                </button>
              </div>

              {/* Crédito */}
              <div className="panel" style={{ marginBottom: 20 }}>
                <div className="panel-head">
                  <div>
                    <h3 className="panel-title" style={{ fontSize: 15 }}>Crédito y pago</h3>
                  </div>
                  <span className={`chip ${credPct>=80?"crit":credPct>=60?"warn":"ok"}`}>{credPct}% usado</span>
                </div>
                <div style={{ padding: 18 }}>
                  <div className="bar-track" style={{ height: 10 }}>
                    <div className={`bar-fill ${credPct>=80?"crit":credPct>=60?"warn":"ok"}`} style={{ width: credPct+"%" }}></div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--ink-3)" }}>
                    <span>USADO {f$(c.creditUsed)}</span>
                    <span>DISPONIBLE {f$(c.creditLine - c.creditUsed)}</span>
                    <span>LÍNEA {f$(c.creditLine)}</span>
                  </div>
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--paper-3)", fontSize: 12.5, color: "var(--ink-2)" }}>
                    Términos de pago: <strong>{c.paymentTerms}</strong> · Canal preferido: <strong>{c.channel}</strong>
                  </div>
                </div>
              </div>

              {/* Datos */}
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 500, marginBottom: 14 }}>Datos del negocio</h3>
              {editing ? (
                <EditableProfile c={c} saveField={saveField} />
              ) : (
                <div className="kv-grid" style={{ marginBottom: 24 }}>
                  <KV label="RUC / DNI" value={c.ruc} />
                  <KV label="Teléfono" value={<>{c.phone} {c.whatsapp && <Icon name="wa" size={12}/>}</>} />
                  <KV label="Email" value={c.email || "—"} />
                  <KV label="Tipo de negocio" value={c.channel} />
                  <KV label="País" value={(window.HiloData.COUNTRIES.find(co => co.id === (c.country || "PE")) || {name:"Perú", flag:"🇵🇪"}).flag + " " + (window.HiloData.COUNTRIES.find(co => co.id === (c.country || "PE")) || {name:"Perú"}).name} />
                  <KV label="Departamento" value={c.department || region?.name || "—"} />
                  <KV label="Distrito" value={c.district} />
                  <KV label="Dirección" value={c.address} />
                  <KV label="Vendedor asignado" value={c.salesperson} />
                </div>
              )}

              {/* Tienda placeholder */}
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 500, marginBottom: 14 }}>Foto de la tienda</h3>
              <div style={{
                height: 180, borderRadius: 10, border: "1px dashed var(--line)",
                background: "repeating-linear-gradient(45deg, var(--paper-2) 0 12px, var(--paper) 12px 24px)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.12em", textTransform: "uppercase"
              }}>
                [ Subir foto de la fachada / vitrina ]
              </div>
            </>
          )}

          {tab === "historial" && (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                <button className="filter-chip on">Todo</button>
                <button className="filter-chip">Compras</button>
                <button className="filter-chip">Llamadas</button>
                <button className="filter-chip">Visitas</button>
              </div>
              <div className="timeline">
                {interactions.map(i => (
                  <div key={i.id} className={`tl-item ${i.type}`}>
                    <div className="tl-date">
                      {fD(i.date)} · <span style={{ color: i.type==="compra"?"var(--clay)":i.type==="llamada"?"var(--olive)":"var(--plum)" }}>{i.type.toUpperCase()}</span>
                      {i.channel && <span> · {i.channel}</span>}
                    </div>
                    <div className="tl-title">
                      {i.type === "compra" && i.brand
                        ? <>Compra <span style={{ color: bI(i.brand)?.color }}>{bI(i.brand)?.name}</span> · {f$(i.amount)}</>
                        : i.type === "llamada" ? "Llamada de seguimiento"
                        : i.type === "visita" ? "Visita comercial"
                        : "Interacción"}
                    </div>
                    {i.items && (
                      <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 6, fontFamily: "var(--font-mono)" }}>
                        {i.items.map(it => `${it.qty}× ${it.type}`).join("  ·  ")}
                      </div>
                    )}
                    {i.note && <div className="tl-body">"{i.note}"</div>}
                  </div>
                ))}
                {interactions.length === 0 && (
                  <div style={{ fontSize: 13, color: "var(--ink-3)", padding: 20, textAlign: "center" }}>Sin interacciones registradas</div>
                )}
              </div>
            </>
          )}

          {tab === "familia" && (
            <LinkedClients client={c} />
          )}

          {tab === "marcas" && (
            <>
              <div style={{ marginBottom: 20 }}>
                <div className="kpi-label">Marca preferida</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 500, marginTop: 6 }}>
                  {bI(c.brands[0])?.name} <span style={{ color: "var(--ink-3)", fontStyle: "italic" }}>· {c.topType}</span>
                </div>
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                {c.brands.map(bid => {
                  const b = bI(bid);
                  const myInteractions = interactions.filter(i => i.brand === bid && i.amount);
                  const total = myInteractions.reduce((a,i)=>a+i.amount, 0);
                  return (
                    <div key={bid} style={{
                      padding: 16, borderRadius: 10, border: "1px solid var(--line)",
                      borderLeft: `4px solid ${b.color}`,
                      background: "var(--paper)"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <div>
                          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 500 }}>{b.name}</div>
                          <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                            {b.types.join(" · ")}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 14, fontVariantNumeric: "tabular-nums" }}>
                            {f$(total)}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{myInteractions.length} compras</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

const DrawerStat = ({ label, value, sub }) => (
  <div style={{
    padding: 14, borderRadius: 10, border: "1px solid var(--line)",
    background: "var(--paper-2)"
  }}>
    <div className="kpi-label">{label}</div>
    <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em", marginTop: 4 }}>
      {value}
    </div>
    {sub && <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2, fontFamily: "var(--font-mono)" }}>{sub}</div>}
  </div>
);

const KV = ({ label, value }) => (
  <div className="kv">
    <div className="kv-label">{label}</div>
    <div className="kv-value">{value}</div>
  </div>
);

// Vinculación de clientes (cliente principal + sucursales/relacionados)
function LinkedClients({ client }) {
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");
  const [, force] = useState(0);
  const refresh = () => force(x => x + 1);

  const ALL = window.HiloData.CLIENTS;
  // Determinar quién es el principal del grupo de este cliente
  const principalId = client.linkedTo || client.id;
  const principal = ALL.find(cc => cc.id === principalId) || client;
  const linked = ALL.filter(cc => cc.id !== principal.id && (cc.linkedTo === principal.id));
  const isPrincipal = !client.linkedTo;
  const allInGroup = [principal, ...linked];

  const totalYTD = allInGroup.reduce((a, b) => a + (b.ytd || 0), 0);
  const totalMonthly = allInGroup.reduce((a, b) => a + (b.avgMonthly || 0), 0);

  const linkClient = (otherId) => {
    const other = ALL.find(cc => cc.id === otherId);
    if (!other) return;
    other.linkedTo = principal.id;
    setShowPicker(false);
    setSearch("");
    refresh();
  };
  const unlinkClient = (otherId) => {
    const other = ALL.find(cc => cc.id === otherId);
    if (!other) return;
    delete other.linkedTo;
    refresh();
  };
  const setAsPrincipal = (newPrincipalId) => {
    const newP = ALL.find(cc => cc.id === newPrincipalId);
    if (!newP) return;
    // El principal anterior pasa a estar vinculado al nuevo
    delete newP.linkedTo;
    allInGroup.forEach(m => {
      if (m.id !== newP.id) m.linkedTo = newP.id;
    });
    refresh();
  };

  // Candidatos para vincular: solo cuentas "libres" (sin grupo)
  // - Excluye al principal de este grupo
  // - Excluye a las ya vinculadas a este grupo
  // - Excluye a las vinculadas a CUALQUIER otro grupo
  // - Excluye a las que ya son principal de otro grupo (tienen vinculados propios)
  const principalsWithLinks = new Set(ALL.filter(x => x.linkedTo).map(x => x.linkedTo));
  const candidates = ALL.filter(cc => {
    if (cc.id === principal.id) return false;
    if (cc.linkedTo === principal.id) return false;
    if (cc.linkedTo) return false;
    if (principalsWithLinks.has(cc.id)) return false; // es principal de otro grupo
    if (!search) return true;
    const q = search.toLowerCase();
    return cc.name.toLowerCase().includes(q) || (cc.ruc || "").includes(q) || (cc.contact || "").toLowerCase().includes(q);
  });

  return (
    <>
      {/* Banner de estado */}
      <div style={{
        padding: 14, borderRadius: 10,
        background: isPrincipal ? "rgba(31,138,91,.08)" : "rgba(42,111,219,.08)",
        border: `1px solid ${isPrincipal ? "rgba(31,138,91,.3)" : "rgba(42,111,219,.3)"}`,
        marginBottom: 18, fontSize: 12.5, display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ fontSize: 16 }}>{isPrincipal ? "★" : "↗"}</span>
        <div>
          {isPrincipal ? (
            <>Este es el <strong>cliente principal</strong> del grupo · {linked.length} {linked.length === 1 ? "vinculado" : "vinculados"}</>
          ) : (
            <>Vinculado a <strong style={{ cursor: "pointer", textDecoration: "underline" }} onClick={()=>window.__openClient(principal.id)}>{principal.name}</strong> como sucursal/relacionado</>
          )}
        </div>
      </div>

      {/* Resumen del grupo */}
      <div className="family-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--ink-3)", textTransform: "uppercase" }}>
              Grupo comercial
            </div>
            <div className="family-name">{principal.name}</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 4 }}>{allInGroup.length} {allInGroup.length === 1 ? "cliente" : "clientes vinculados"}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 500 }}>
              {f$(totalYTD)}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", color: "var(--ink-3)", textTransform: "uppercase" }}>
              YTD combinado · {f$(totalMonthly)}/mes
            </div>
          </div>
        </div>

        <div className="family-members">
          {allInGroup.map(m => {
            const isViewing = m.id === client.id;
            const isP = m.id === principal.id;
            return (
              <div
                key={m.id}
                className="family-row"
                style={{
                  borderColor: isViewing ? "var(--clay)" : isP ? "rgba(31,138,91,.3)" : undefined,
                  background: isViewing ? "rgba(181,70,42,.05)" : isP ? "rgba(31,138,91,.04)" : undefined,
                  cursor: isViewing ? "default" : "pointer",
                }}
                onClick={() => { if (!isViewing) window.__openClient(m.id); }}
              >
                <div className={`mini-avatar k${cK(m.id)}`}>{iO(m.name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: isP ? 600 : 500, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                    {m.name}
                    {isP && <span style={{ fontSize: 9, color: "#1F8A5B", letterSpacing: "0.1em", fontFamily: "var(--font-mono)", padding: "2px 6px", background: "rgba(31,138,91,.12)", borderRadius: 4 }}>★ PRINCIPAL</span>}
                    {isViewing && <span style={{ fontSize: 10, color: "var(--clay)" }}>● VIENDO</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{m.contact} · {rI(m.region)?.name || m.department}</div>
                </div>
                <div style={{ textAlign: "right", marginRight: 12 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500 }}>{f$(m.avgMonthly)}/mes</div>
                  <div style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{m.tier}</div>
                </div>
                {!isP && (
                  <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                    <button
                      className="btn btn-ghost"
                      style={{ padding: "4px 8px", fontSize: 10.5 }}
                      title="Marcar como principal"
                      onClick={() => setAsPrincipal(m.id)}
                    >
                      ★
                    </button>
                    <button
                      className="btn btn-ghost"
                      style={{ padding: "4px 8px", fontSize: 10.5, color: "var(--clay)" }}
                      title="Desvincular"
                      onClick={() => unlinkClient(m.id)}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 14, fontSize: 12, color: "var(--ink-3)", fontStyle: "italic", lineHeight: 1.5 }}>
          💡 En la tabla de Clientes activa "Solo principales" para ocultar las sucursales y ver solo el grupo consolidado.
        </div>
      </div>

      {/* Vincular más */}
      {!showPicker ? (
        <button
          className="btn btn-primary"
          style={{ width: "100%", justifyContent: "center" }}
          onClick={() => setShowPicker(true)}
        >
          <Icon name="plus" size={14}/> Vincular otro cliente a este grupo
        </button>
      ) : (
        <div style={{ padding: 14, border: "1px solid var(--line)", borderRadius: 10, background: "var(--paper-2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <strong style={{ fontSize: 13 }}>Buscar cliente para vincular</strong>
            <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => { setShowPicker(false); setSearch(""); }}>Cancelar</button>
          </div>
          <input
            autoFocus
            value={search}
            onChange={(e)=>setSearch(e.target.value)}
            placeholder="Nombre, RUC o contacto..."
            style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 13, background: "var(--paper)", boxSizing: "border-box", marginBottom: 10 }}
          />
          <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {candidates.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "var(--ink-3)" }}>
                {search ? "Sin coincidencias" : "Empieza a escribir para buscar"}
              </div>
            )}
            {candidates.slice(0, 12).map(cand => (
              <div
                key={cand.id}
                onClick={() => linkClient(cand.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                  background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 8, cursor: "pointer",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--paper-3)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "var(--paper)"}
              >
                <div className={`mini-avatar k${cK(cand.id)}`} style={{ width: 28, height: 28, fontSize: 10 }}>{iO(cand.name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>{cand.name}</div>
                  <div style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{cand.ruc} · {rI(cand.region)?.name || cand.department}</div>
                </div>
                <span style={{ fontSize: 11, color: "var(--olive)", fontFamily: "var(--font-mono)" }}>+ VINCULAR</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// Editable profile form
function EditableProfile({ c, saveField }) {
  const country = c.country || "PE";
  const departments = window.HiloData.DEPARTMENTS[country] || [];
  // If switching country wipes the dept, default to first
  const currentDept = c.department && departments.includes(c.department)
    ? c.department
    : (c.department || "");

  const fieldStyle = {
    width: "100%",
    padding: "10px 12px",
    background: "var(--paper)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    fontSize: 13,
    fontFamily: "inherit",
    color: "var(--ink-1)",
    boxSizing: "border-box",
  };
  const labelStyle = {
    fontFamily: "var(--font-mono)",
    fontSize: 9.5,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "var(--ink-3)",
    marginBottom: 6,
    display: "block",
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14, marginBottom: 24 }}>
      <div>
        <label style={labelStyle}>Razón social / Nombre</label>
        <input style={fieldStyle} defaultValue={c.name} onBlur={(e)=>saveField("name", e.target.value)} />
      </div>
      <div>
        <label style={labelStyle}>Contacto</label>
        <input style={fieldStyle} defaultValue={c.contact || ""} onBlur={(e)=>saveField("contact", e.target.value)} />
      </div>
      <div>
        <label style={labelStyle}>RUC / DNI</label>
        <input style={fieldStyle} defaultValue={c.ruc || ""} onBlur={(e)=>saveField("ruc", e.target.value)} />
      </div>
      <div>
        <label style={labelStyle}>Teléfono</label>
        <input style={fieldStyle} defaultValue={c.phone || ""} onBlur={(e)=>saveField("phone", e.target.value)} />
      </div>
      <div>
        <label style={labelStyle}>Email</label>
        <input style={fieldStyle} type="email" defaultValue={c.email || ""} onBlur={(e)=>saveField("email", e.target.value)} />
      </div>
      <div>
        <label style={labelStyle}>Tipo de negocio</label>
        <select style={fieldStyle} defaultValue={c.channel || "Boutique"} onChange={(e)=>saveField("channel", e.target.value)}>
          {["Boutique","Galería","Mayorista","Mercado","Cadena","Online"].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* PAÍS — Perú default */}
      <div>
        <label style={labelStyle}>País</label>
        <select
          style={fieldStyle}
          value={country}
          onChange={(e)=>{
            const newCountry = e.target.value;
            saveField("country", newCountry);
            // Reset department when country changes
            const firstDept = (window.HiloData.DEPARTMENTS[newCountry] || [])[0] || "";
            saveField("department", firstDept);
          }}
        >
          {window.HiloData.COUNTRIES.map(co => (
            <option key={co.id} value={co.id}>{co.flag} {co.name}</option>
          ))}
        </select>
      </div>

      {/* DEPARTAMENTO — depende del país */}
      <div>
        <label style={labelStyle}>Departamento</label>
        <select
          style={fieldStyle}
          value={currentDept}
          onChange={(e)=>saveField("department", e.target.value)}
        >
          <option value="">— Selecciona —</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <div>
        <label style={labelStyle}>Provincia / Ciudad</label>
        <input style={fieldStyle} defaultValue={c.province || ""} onBlur={(e)=>saveField("province", e.target.value)} placeholder="Ej. Cusco, Wanchaq..." />
      </div>
      <div>
        <label style={labelStyle}>Distrito</label>
        <input style={fieldStyle} defaultValue={c.district || ""} onBlur={(e)=>saveField("district", e.target.value)} />
      </div>
      <div style={{ gridColumn: "1 / -1" }}>
        <label style={labelStyle}>Dirección</label>
        <input style={fieldStyle} defaultValue={c.address || ""} onBlur={(e)=>saveField("address", e.target.value)} />
      </div>
      <div>
        <label style={labelStyle}>Vendedor asignado</label>
        <select style={fieldStyle} defaultValue={c.salesperson || ""} onChange={(e)=>saveField("salesperson", e.target.value)}>
          {(window.HiloData.SALESPEOPLE || []).map(sp => (
            <option key={sp.id} value={sp.name}>{sp.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Términos de pago</label>
        <select style={fieldStyle} defaultValue={c.paymentTerms || "Contado"} onChange={(e)=>saveField("paymentTerms", e.target.value)}>
          {["Contado","Crédito 15 días","Crédito 30 días","Crédito 60 días","50% adelanto"].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div style={{ gridColumn: "1 / -1", padding: "10px 14px", background: "var(--paper-2)", border: "1px dashed var(--line)", borderRadius: 8, fontSize: 11.5, color: "var(--ink-3)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
        ⓘ Cambios se sincronizan con Odoo en el próximo ciclo (cada 15 min).
      </div>
    </div>
  );
}

window.ClientDrawer = ClientDrawer;
