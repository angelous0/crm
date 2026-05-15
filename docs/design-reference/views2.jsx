// ============================================================
// Vistas adicionales: Ruta, Equipo, Importar, Plantillas
// ============================================================
const { useState: uS2 } = React;
const { CLIENTS: CL2, REGIONS: RG2, SALESPEOPLE, WA_TEMPLATES } = window.HiloData;
const { fmtMoney: fM, fmtDate: fDt, daysSince: dSn, initialsOf: iOn, colorKey: cKn, regionById: rIn } = window.HiloHelpers;

// ─────────────────────────────────────────────────────────────
// RUTA DE HOY — orden óptimo de visitas
// ─────────────────────────────────────────────────────────────
function ViewRoute({ openClient, openQuickFollowup }) {
  const [region, setRegion] = uS2("cusco");

  const stops = CL2
    .filter(c => c.region === region && c.salesperson === "Diego R.")
    .sort((a,b) => (a.priority === "alta" ? -1 : 1));

  const reg = rIn(region);
  const regionsWithMine = [...new Set(CL2.filter(c => c.salesperson === "Diego R.").map(c => c.region))];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Ruta de <em>visitas</em></h1>
          <div className="page-sub">{stops.length} PARADAS · ORDEN SUGERIDO POR PRIORIDAD Y CERCANÍA</div>
        </div>
        <button className="btn btn-primary"><Icon name="pin" size={14}/> Iniciar ruta</button>
      </div>

      <div className="filter-bar">
        {regionsWithMine.map(r => {
          const rg = rIn(r);
          return (
            <button key={r} className={`filter-chip ${region===r?"on":""}`} onClick={()=>setRegion(r)}>
              {rg.name} · {CL2.filter(c=>c.region===r && c.salesperson==="Diego R.").length}
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 22 }}>
        <div className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Paradas — {reg?.name}</h2>
            <span className="panel-sub">Ruta sugerida</span>
          </div>
          <div>
            {stops.map((c, i) => (
              <div key={c.id} style={{
                display: "grid", gridTemplateColumns: "44px 1fr auto", gap: 14,
                padding: "16px 18px", borderBottom: i < stops.length - 1 ? "1px solid var(--paper-3)" : "none",
                alignItems: "center", cursor: "pointer"
              }}
              onClick={() => openClient(c.id)}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: c.priority === "alta" ? "var(--clay)" : "var(--paper-2)",
                  color: c.priority === "alta" ? "var(--paper)" : "var(--ink)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16,
                  border: "2px solid var(--paper)",
                  boxShadow: "0 0 0 1px var(--line)"
                }}>{i+1}</div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 500 }}>
                    {c.name}
                    {c.tier === "Oro" && <span className="chip gold">★</span>}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 3 }}>
                    {c.address} · {c.district}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 3, fontFamily: "var(--font-mono)" }}>
                    {c.followupReason}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                  <span className={`chip ${c.priority==="alta"?"crit":c.priority==="media"?"warn":"ok"}`}>
                    {c.priority}
                  </span>
                  <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={(e)=>{e.stopPropagation(); openQuickFollowup(c);}}><Icon name="check" size={14}/></button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel" style={{ height: "fit-content" }}>
          <div className="panel-head">
            <h2 className="panel-title" style={{ fontSize: 16 }}>Resumen de ruta</h2>
          </div>
          <div style={{ padding: 18 }}>
            <div style={{ display: "grid", gap: 10, fontSize: 12.5 }}>
              <MR label="Paradas" v={stops.length} />
              <MR label="Tiempo estimado" v={`${stops.length * 35} min`} />
              <MR label="Distancia aprox." v={`${(stops.length * 2.4).toFixed(1)} km`} />
              <MR label="Potencial" v={fM(stops.reduce((a,c)=>a+c.avgMonthly,0))} />
            </div>
            <div style={{ marginTop: 18, padding: 14, background: "var(--paper-2)", borderRadius: 10, fontSize: 12, color: "var(--ink-2)", lineHeight: 1.55 }}>
              💡 Empieza por las paradas en <strong>rojo</strong> (alta prioridad) y deja para el final las visitas de cortesía.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
const MR = ({label, v}) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--paper-3)" }}>
    <span style={{ color: "var(--ink-2)" }}>{label}</span>
    <strong style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{v}</strong>
  </div>
);

// ─────────────────────────────────────────────────────────────
// EQUIPO — vista gerente con vendedores
// ─────────────────────────────────────────────────────────────
function ViewTeam({ openClient }) {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Equipo de <em>ventas</em></h1>
          <div className="page-sub">{SALESPEOPLE.length} VENDEDORES · MAYO 2026</div>
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard2 label="Cuota total" value={fM(SALESPEOPLE.reduce((a,s)=>a+s.quota,0))} delta="" />
        <KpiCard2 label="Vendido" value={fM(SALESPEOPLE.reduce((a,s)=>a+s.sold,0))} delta="64% del mes" />
        <KpiCard2 label="Clientes activos" value={String(SALESPEOPLE.reduce((a,s)=>a+s.clients,0))} delta="" />
        <KpiCard2 label="Seguimientos hoy" value="14" delta="3 atrasados" />
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        {SALESPEOPLE.map(s => {
          const pct = Math.round(s.sold / s.quota * 100);
          return (
            <div key={s.id} className="panel" style={{ padding: 18 }}>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 200px 200px", gap: 22, alignItems: "center" }}>
                <div className="avatar" style={{ width: 48, height: 48, fontSize: 18 }}>{s.initials}</div>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 500 }}>{s.name}</div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-3)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em", marginTop: 3 }}>
                    {s.territory.toUpperCase()} · {s.clients} CLIENTES
                  </div>
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                    <span style={{ color: "var(--ink-3)" }}>Cuota</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>{fM(s.sold)} / {fM(s.quota)}</span>
                  </div>
                  <div className="bar-track" style={{ height: 8 }}>
                    <div className={`bar-fill ${pct>=80?"ok":pct>=50?"warn":"crit"}`} style={{ width: pct+"%" }}></div>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)", marginTop: 4, textAlign: "right" }}>
                    {pct}% del mes
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button className="btn btn-ghost">Ver pipeline</button>
                  <button className="btn btn-ghost">Reasignar</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
const KpiCard2 = ({label, value, delta}) => (
  <div className="kpi">
    <div className="kpi-label">{label}</div>
    <div className="kpi-value">{value}</div>
    {delta && <div className="kpi-delta up">{delta}</div>}
  </div>
);

// ─────────────────────────────────────────────────────────────
// IMPORTAR clientes
// ─────────────────────────────────────────────────────────────
function ViewImport() {
  const [step, setStep] = uS2(0);
  const cols = ["Nombre comercial", "RUC", "Contacto", "Teléfono", "Región", "Distrito", "Dirección", "Tipo negocio", "Línea crédito"];
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Importar <em>clientes</em></h1>
          <div className="page-sub">EXCEL · CSV · DESDE ODOO 10</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 22 }}>
        <div className="panel">
          <div className="panel-head">
            <h2 className="panel-title">{step === 0 ? "1. Sube tu archivo" : step === 1 ? "2. Mapea columnas" : "3. Confirma"}</h2>
            <span className="panel-sub">Paso {step+1} de 3</span>
          </div>
          <div style={{ padding: 22 }}>
            {step === 0 && (
              <>
                <div style={{
                  border: "2px dashed var(--line)", borderRadius: 14,
                  padding: 50, textAlign: "center", background: "var(--paper-2)",
                  cursor: "pointer"
                }}
                  onClick={() => setStep(1)}
                >
                  <div style={{ fontSize: 42, marginBottom: 8 }}>📂</div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 500 }}>
                    Arrastra tu Excel o CSV aquí
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 6 }}>
                    O haz click para seleccionar un archivo · máx 5MB
                  </div>
                </div>
                <div style={{ marginTop: 22, display: "flex", gap: 10 }}>
                  <button className="btn btn-ghost" onClick={()=>setStep(1)}>Descargar plantilla Excel</button>
                  <button className="btn btn-ghost">Importar desde Odoo 10</button>
                </div>
              </>
            )}
            {step === 1 && (
              <>
                <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginBottom: 16 }}>
                  Detectamos <strong>1,248 filas</strong> y <strong>11 columnas</strong>. Asocia cada columna de tu archivo con un campo de Hilo:
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {cols.map((c, i) => (
                    <div key={c} style={{ display: "grid", gridTemplateColumns: "1fr 14px 1fr", gap: 12, alignItems: "center" }}>
                      <div style={{ padding: "10px 12px", background: "var(--paper-2)", borderRadius: 8, fontSize: 12.5, fontFamily: "var(--font-mono)" }}>
                        Columna {String.fromCharCode(65 + i)} · "{c}"
                      </div>
                      <Icon name="arrow" size={14}/>
                      <select style={{ padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--paper)", fontSize: 12.5 }}>
                        <option>{c}</option>
                        <option>— No importar</option>
                      </select>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 22, display: "flex", justifyContent: "space-between" }}>
                  <button className="btn btn-ghost" onClick={()=>setStep(0)}>← Atrás</button>
                  <button className="btn btn-primary" onClick={()=>setStep(2)}>Continuar →</button>
                </div>
              </>
            )}
            {step === 2 && (
              <div style={{ textAlign: "center", padding: 30 }}>
                <div style={{ fontSize: 48, marginBottom: 10 }}>✓</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 500 }}>1,248 clientes listos</div>
                <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 6, marginBottom: 20 }}>
                  Se detectaron 47 posibles duplicados. ¿Vincular como mismo cliente o crear nuevos?
                </div>
                <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                  <button className="btn btn-ghost" onClick={()=>setStep(1)}>← Revisar mapeo</button>
                  <button className="btn btn-primary">Importar 1,248</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="panel" style={{ height: "fit-content" }}>
          <div className="panel-head">
            <h2 className="panel-title" style={{ fontSize: 16 }}>Tips de importación</h2>
          </div>
          <div style={{ padding: 18, fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.6 }}>
            <p><strong>RUC único.</strong> Si dos filas tienen el mismo RUC se vincularán como sucursales del mismo cliente.</p>
            <p><strong>Familia.</strong> Si tus filas tienen una columna "Grupo" con el apellido familiar, los detectaremos como un solo grupo.</p>
            <p><strong>Región.</strong> Acepta nombres en español o ISO (PE-LIM, PE-CUS).</p>
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// PLANTILLAS WhatsApp
// ─────────────────────────────────────────────────────────────
function ViewTemplates() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Plantillas <em>WhatsApp</em></h1>
          <div className="page-sub">{WA_TEMPLATES.length} PLANTILLAS · USA {`{contacto} {nombre} {marca} {dias} {monto} {vendedor}`} COMO VARIABLES</div>
        </div>
        <button className="btn btn-primary"><Icon name="plus" /> Nueva plantilla</button>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        {WA_TEMPLATES.map(t => (
          <div key={t.id} className="panel" style={{ padding: 22 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 24, alignItems: "flex-start" }}>
              <div>
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 500, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(92,122,90,.14)", color: "#3F5A3D", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name="wa" size={16}/>
                  </span>
                  {t.name}
                </h3>
                <div style={{
                  padding: 14, background: "#DCF8C6",
                  borderRadius: 10, borderTopLeftRadius: 2,
                  fontSize: 13, color: "#1F1A14", lineHeight: 1.5,
                  fontFamily: "system-ui, -apple-system, sans-serif",
                  maxWidth: 520
                }}>
                  {t.body}
                </div>
                <div style={{ marginTop: 12, fontSize: 11.5, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
                  USADA 47 VECES · ÚLTIMOS 30 DÍAS
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button className="btn btn-ghost">Editar</button>
                <button className="btn btn-ghost">Duplicar</button>
                <button className="btn btn-ghost" style={{ color: "var(--clay)" }}>Eliminar</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

window.Views.ViewRoute = ViewRoute;
window.Views.ViewTeam = ViewTeam;
window.Views.ViewImport = ViewImport;
window.Views.ViewTemplates = ViewTemplates;
