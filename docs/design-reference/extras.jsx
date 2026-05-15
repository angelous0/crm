// ============================================================
// EXTRAS — Búsqueda global, Cobranzas, Calendario, Grupo Comercial, Ficha 360
// ============================================================
const { useState: useStateEX, useMemo: useMemoEX, useEffect: useEffectEX, useRef: useRefEX } = React;
const _DATA = () => window.HiloData;
const _LOG = () => window.HiloLogic;
const _H = () => window.HiloHelpers;

// ─────────────────────────────────────────────────────────────
// 1. BÚSQUEDA GLOBAL · COMMAND PALETTE (⌘K)
// ─────────────────────────────────────────────────────────────
function GlobalSearch({ onOpenClient, onOpenGroup, onNav }) {
  const [open, setOpen] = useStateEX(false);
  const [q, setQ] = useStateEX("");
  const [hover, setHover] = useStateEX(0);
  const inputRef = useRefEX(null);

  useEffectEX(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffectEX(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQ("");
      setHover(0);
    }
  }, [open]);

  // Search across clients, families, sellers, brands
  const results = useMemoEX(() => {
    if (!q || q.length < 1) return [];
    const lower = q.toLowerCase();
    const out = [];
    const { CLIENTS, FAMILIES, SALESPEOPLE, BRANDS, REGIONS } = _DATA();
    // Clients
    CLIENTS.forEach(c => {
      const score =
        (c.name.toLowerCase().includes(lower) ? 10 : 0) +
        (c.contact?.toLowerCase().includes(lower) ? 8 : 0) +
        (c.ruc?.includes(q) ? 9 : 0) +
        (c.phone?.replace(/\D/g, "").includes(q.replace(/\D/g, "")) && q.length >= 3 ? 7 : 0) +
        (c.code?.toLowerCase().includes(lower) ? 6 : 0) +
        (c.district?.toLowerCase().includes(lower) ? 3 : 0);
      if (score > 0) out.push({ kind: "client", id: c.id, title: c.name, sub: `${c.contact} · ${c.code} · ${REGIONS.find(r=>r.id===c.region)?.name || ""}`, icon: "👤", score });
    });
    // Groups
    FAMILIES.forEach(f => {
      const score = (f.surname.toLowerCase().includes(lower) ? 10 : 0) + (f.note?.toLowerCase().includes(lower) ? 4 : 0);
      if (score > 0) out.push({ kind: "group", id: f.id, title: `Grupo ${f.surname}`, sub: f.note, icon: "👨‍👩‍👧", score });
    });
    // Sellers
    SALESPEOPLE.forEach(s => {
      const score = (s.name.toLowerCase().includes(lower) ? 8 : 0) + (s.territory?.toLowerCase().includes(lower) ? 4 : 0);
      if (score > 0) out.push({ kind: "seller", id: s.id, title: s.name, sub: s.territory, icon: "👔", score });
    });
    // Quick navs
    [
      { v:"hoy", l:"Cola de llamadas", i:"📞" },
      { v:"pipeline", l:"Pipeline comercial", i:"📊" },
      { v:"clients", l:"Clientes", i:"👥" },
      { v:"groups", l:"Grupos comerciales", i:"👨‍👩‍👧" },
      { v:"map", l:"Mapa del Perú", i:"🗺️" },
      { v:"credit", l:"Cobranzas y crédito", i:"💳" },
      { v:"calendar", l:"Calendario comercial", i:"📅" },
      { v:"opportunities", l:"Oportunidades", i:"💡" },
      { v:"campaigns", l:"Campañas", i:"📢" },
      { v:"products", l:"Análisis de productos", i:"👕" },
    ].forEach(n => {
      if (n.l.toLowerCase().includes(lower)) out.push({ kind: "nav", id: n.v, title: n.l, sub: "Ir a la sección", icon: n.i, score: 5 });
    });

    return out.sort((a, b) => b.score - a.score).slice(0, 12);
  }, [q]);

  const fire = (r) => {
    setOpen(false);
    if (r.kind === "client") onOpenClient(r.id);
    else if (r.kind === "group") onOpenGroup(r.id);
    else if (r.kind === "nav") onNav(r.id);
  };

  if (!open) return null;
  return (
    <div onClick={() => setOpen(false)} style={{
      position: "fixed", inset: 0, background: "rgba(43,34,21,.55)", zIndex: 300,
      display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "12vh",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 640, maxWidth: "92vw", background: "var(--paper)", borderRadius: 14,
        boxShadow: "var(--shadow-lg)", overflow: "hidden", animation: "qfIn .18s",
      }}>
        <div style={{ display: "flex", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--line)", gap: 10 }}>
          <span style={{ fontSize: 18 }}>🔍</span>
          <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setHover(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setHover(h => Math.min(h + 1, results.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setHover(h => Math.max(h - 1, 0)); }
              if (e.key === "Enter" && results[hover]) { e.preventDefault(); fire(results[hover]); }
            }}
            placeholder="Buscar cliente, RUC, teléfono, grupo, vendedor…"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 16, fontFamily: "var(--font-sans)", color: "var(--ink)" }} />
          <kbd style={{ fontSize: 10, color: "var(--ink-3)", border: "1px solid var(--line)", borderRadius: 4, padding: "2px 7px", fontFamily: "var(--font-mono)" }}>ESC</kbd>
        </div>
        <div style={{ maxHeight: "50vh", overflowY: "auto" }}>
          {q && results.length === 0 && (
            <div style={{ padding: "32px 18px", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
              Sin resultados para "{q}"
            </div>
          )}
          {!q && (
            <div style={{ padding: "20px 18px", color: "var(--ink-3)", fontSize: 12.5 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", marginBottom: 8, textTransform: "uppercase" }}>SUGERENCIAS</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {["Quispe", "VIP", "Cusco", "Element", "QEPO"].map(s => (
                  <button key={s} onClick={() => setQ(s)} style={{ padding: "5px 10px", borderRadius: 999, border: "1px solid var(--line)", background: "var(--paper-2)", fontSize: 11.5, color: "var(--ink-2)", cursor: "pointer" }}>
                    {s}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 16, fontSize: 11.5, lineHeight: 1.6 }}>
                Atajos: <kbd style={kbdSt}>↑↓</kbd> mover · <kbd style={kbdSt}>↵</kbd> abrir · <kbd style={kbdSt}>⌘K</kbd> alternar
              </div>
            </div>
          )}
          {results.map((r, i) => (
            <div key={`${r.kind}-${r.id}`}
              onMouseEnter={() => setHover(i)}
              onClick={() => fire(r)}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 18px",
                background: hover === i ? "var(--paper-2)" : "transparent",
                cursor: "pointer", borderLeft: hover === i ? "3px solid var(--clay)" : "3px solid transparent",
              }}>
              <span style={{ fontSize: 18, width: 22, textAlign: "center" }}>{r.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.title}</div>
                <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{r.sub}</div>
              </div>
              <span style={{ fontSize: 9.5, fontFamily: "var(--font-mono)", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-3)", padding: "2px 7px", border: "1px solid var(--paper-3)", borderRadius: 4 }}>
                {r.kind === "client" ? "CLIENTE" : r.kind === "group" ? "GRUPO" : r.kind === "seller" ? "VENDEDOR" : "IR A"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
const kbdSt = { fontFamily: "var(--font-mono)", fontSize: 10, padding: "1px 6px", border: "1px solid var(--line)", borderRadius: 3, marginRight: 4, background: "var(--paper-2)" };

// ─────────────────────────────────────────────────────────────
// 2. VISTA COBRANZAS Y CRÉDITO
// ─────────────────────────────────────────────────────────────
function ViewCredit({ openClient }) {
  const { CLIENTS } = _DATA();
  const [filter, setFilter] = useStateEX("all");

  const enriched = CLIENTS.map(c => {
    const used = c.creditUsed || 0;
    const line = c.creditLine || 1;
    const pct = Math.round(used / line * 100);
    const dueDays = c.paymentTerms ? parseInt(c.paymentTerms) : 30;
    const lastPurchaseDays = window.HiloHelpers.daysSince(c.lastPurchase);
    // simulated dueIn: termDays - daysSinceLastPurchase
    const dueIn = dueDays - lastPurchaseDays;
    const status = dueIn < 0 && used > 0 ? "vencido" : dueIn <= 5 && used > 0 ? "por-vencer" : pct >= 85 ? "linea-tope" : pct >= 60 ? "linea-alta" : "ok";
    return { ...c, _pct: pct, _dueIn: dueIn, _status: status };
  });

  const filtered = enriched.filter(c => filter === "all" ? true : c._status === filter);
  const totals = {
    porCobrar: enriched.reduce((s, c) => s + (c.creditUsed || 0), 0),
    vencido: enriched.filter(c => c._status === "vencido").reduce((s, c) => s + (c.creditUsed || 0), 0),
    porVencer: enriched.filter(c => c._status === "por-vencer").reduce((s, c) => s + (c.creditUsed || 0), 0),
    enLinea: enriched.filter(c => c._status === "linea-tope" || c._status === "linea-alta").length,
  };

  const STATUS_META = {
    "vencido":    { color:"#B5462A", bg:"rgba(181,70,42,.10)", label:"Vencido" },
    "por-vencer": { color:"#C98A3B", bg:"rgba(201,138,59,.10)", label:"Por vencer" },
    "linea-tope": { color:"#7A4E7E", bg:"rgba(122,78,126,.10)", label:"Línea al tope" },
    "linea-alta": { color:"#3F5566", bg:"rgba(63,85,102,.10)", label:"Línea alta" },
    "ok":         { color:"#3F5A3D", bg:"rgba(63,90,61,.10)", label:"Al día" },
  };

  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <div className="page-eyebrow">CRÉDITO Y COBRANZAS</div>
        <h1 className="page-title" style={{ marginTop: 4 }}>
          Por cobrar · <em style={{ fontStyle: "italic", color: "var(--clay)" }}>S/ {totals.porCobrar.toLocaleString("es-PE")}</em>
        </h1>
        <div className="page-sub" style={{ marginTop: 6 }}>
          Línea de crédito ocupada · vencimientos · clientes que llegan al tope
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, marginBottom: 18, overflow: "hidden" }}>
        <CreditKpi label="Total por cobrar"   value={`S/ ${totals.porCobrar.toLocaleString("es-PE")}`} hint={`${enriched.filter(c => c.creditUsed > 0).length} clientes con saldo`} />
        <CreditKpi label="Vencido"            value={`S/ ${totals.vencido.toLocaleString("es-PE")}`} hint={`${enriched.filter(c => c._status === "vencido").length} clientes`} alert={totals.vencido > 0} />
        <CreditKpi label="Por vencer ≤ 5d"   value={`S/ ${totals.porVencer.toLocaleString("es-PE")}`} hint={`${enriched.filter(c => c._status === "por-vencer").length} clientes`} warn={totals.porVencer > 0} />
        <CreditKpi label="Línea ≥ 60% ocupada" value={String(totals.enLinea)} hint="Clientes en zona caliente" warn={totals.enLinea > 0} />
      </div>

      {/* filtros */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {[
          { id:"all",         label:"Todos",         count: enriched.length },
          { id:"vencido",     label:"⚠️ Vencidos",   count: enriched.filter(c => c._status === "vencido").length },
          { id:"por-vencer",  label:"🔔 Por vencer", count: enriched.filter(c => c._status === "por-vencer").length },
          { id:"linea-tope",  label:"🟣 Línea tope", count: enriched.filter(c => c._status === "linea-tope").length },
          { id:"linea-alta",  label:"🔵 Línea alta", count: enriched.filter(c => c._status === "linea-alta").length },
          { id:"ok",          label:"✓ Al día",      count: enriched.filter(c => c._status === "ok").length },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            style={{
              padding: "8px 14px", borderRadius: 999, border: "1px solid var(--line)",
              background: filter === f.id ? "var(--ink)" : "var(--paper)",
              color: filter === f.id ? "var(--paper)" : "var(--ink-2)",
              fontSize: 12, fontWeight: 500, cursor: "pointer",
            }}>
            {f.label} <span style={{ opacity: .7, fontFamily: "var(--font-mono)" }}>· {f.count}</span>
          </button>
        ))}
      </div>

      {/* tabla */}
      <div className="panel" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--paper-2)", textAlign: "left" }}>
              {["Cliente","Estado","Línea","Ocupada","%","Vence en","Plazo","Acción"].map(h => (
                <th key={h} style={{ padding: "11px 12px", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, borderBottom: "1px solid var(--line)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.sort((a, b) => {
              const order = { vencido: 0, "por-vencer": 1, "linea-tope": 2, "linea-alta": 3, ok: 4 };
              return order[a._status] - order[b._status];
            }).map(c => {
              const meta = STATUS_META[c._status];
              return (
                <tr key={c.id} style={{ borderBottom: "1px solid var(--paper-3)", cursor: "pointer" }}
                  onClick={() => openClient(c.id)}
                  onMouseEnter={(e) => e.currentTarget.style.background = "var(--paper-2)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "12px" }}>
                    <div style={{ fontWeight: 500 }}>{c.name}</div>
                    <div style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{c.code} · {c.district}</div>
                  </td>
                  <td style={{ padding: "12px" }}>
                    <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 4, fontSize: 10.5, fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase", background: meta.bg, color: meta.color, fontWeight: 600 }}>
                      {meta.label}
                    </span>
                  </td>
                  <td style={{ ...tdNumX }}>S/ {(c.creditLine || 0).toLocaleString("es-PE")}</td>
                  <td style={{ ...tdNumX, fontWeight: 600 }}>S/ {(c.creditUsed || 0).toLocaleString("es-PE")}</td>
                  <td style={{ padding: "12px", width: 140 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: "var(--paper-3)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.min(c._pct, 100)}%`, background: c._pct >= 85 ? "var(--clay)" : c._pct >= 60 ? "#C98A3B" : "var(--olive)" }}></div>
                      </div>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-2)", width: 36, textAlign: "right" }}>{c._pct}%</span>
                    </div>
                  </td>
                  <td style={{ ...tdNumX, color: c._dueIn < 0 ? "var(--clay)" : c._dueIn <= 5 ? "#C98A3B" : "var(--ink-2)", fontWeight: c._dueIn <= 5 ? 600 : 400 }}>
                    {c.creditUsed > 0 ? (c._dueIn < 0 ? `${Math.abs(c._dueIn)}d vencido` : `${c._dueIn}d`) : "—"}
                  </td>
                  <td style={tdNumX}>{c.paymentTerms || "—"}</td>
                  <td style={{ padding: "12px" }}>
                    <a href={`https://wa.me/51${(c.phone || "").replace(/\D/g, "")}?text=Hola%20${encodeURIComponent(c.contact || "")}%2C%20te%20escribimos%20por%20el%20saldo%20pendiente%20de%20S%2F%20${(c.creditUsed||0).toLocaleString("es-PE")}.`}
                      target="_blank" rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{ padding: "5px 10px", fontSize: 11, background: "rgba(31,138,91,.12)", color: "#1F8A5B", borderRadius: 5, textDecoration: "none", fontWeight: 500, display: "inline-block" }}>
                      💬 Cobrar
                    </a>
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

const tdNumX = { padding: "12px", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", color: "var(--ink-2)" };

function CreditKpi({ label, value, hint, alert, warn }) {
  const color = alert ? "#B5462A" : warn ? "#C98A3B" : "var(--ink)";
  return (
    <div style={{ padding: "16px 18px", borderRight: "1px solid var(--paper-3)" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 500, color, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 3. CALENDARIO COMERCIAL
// ─────────────────────────────────────────────────────────────
function ViewCalendar() {
  const cal = _LOG().COMMERCIAL_CALENDAR;
  const today = new Date("2026-05-06");
  const enriched = cal.map(e => {
    const eventDate = new Date(e.date);
    const prepStart = new Date(e.prepStart);
    const daysToEvent = Math.round((eventDate - today) / 86400000);
    const daysToPrep = Math.round((prepStart - today) / 86400000);
    const inPrepWindow = today >= prepStart && today <= eventDate;
    return { ...e, daysToEvent, daysToPrep, inPrepWindow };
  });
  const upcoming = enriched.filter(e => e.daysToEvent >= -7).sort((a, b) => a.daysToEvent - b.daysToEvent);
  const inPrep = upcoming.filter(e => e.inPrepWindow);
  const nextPrep = upcoming.filter(e => !e.inPrepWindow && e.daysToPrep > 0).slice(0, 4);

  // Build a 9-month grid
  const months = [];
  for (let m = today.getMonth(); m < 12; m++) {
    months.push({ idx: m, name: new Date(2026, m, 1).toLocaleDateString("es-PE", { month: "long" }) });
  }

  const IMPACT_COLOR = { alta: "#B5462A", media: "#C98A3B", baja: "#8A7B5C" };
  const CAT_ICON = { fecha: "🎉", temporada: "🌤️", campaña: "📢" };

  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <div className="page-eyebrow">CALENDARIO COMERCIAL 2026</div>
        <h1 className="page-title" style={{ marginTop: 4 }}>
          {inPrep.length > 0
            ? <>En preparación · <em style={{ fontStyle: "italic", color: "var(--clay)" }}>{inPrep.length} campaña{inPrep.length > 1 ? "s" : ""}</em></>
            : <>Próximo hito en <em style={{ fontStyle: "italic" }}>{upcoming[0]?.daysToEvent}d</em></>}
        </h1>
        <div className="page-sub" style={{ marginTop: 6 }}>
          Fechas clave de venta mayorista en Perú · cuándo empezar a preparar campañas
        </div>
      </div>

      {/* En preparación AHORA */}
      {inPrep.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div className="panel-sub" style={{ marginBottom: 8 }}>EMPEZAR HOY · CAMPAÑAS EN VENTANA</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: 12 }}>
            {inPrep.map(e => (
              <div key={e.id} style={{
                background: "var(--paper)", border: `1.5px solid ${IMPACT_COLOR[e.impact]}33`,
                borderLeft: `4px solid ${IMPACT_COLOR[e.impact]}`,
                borderRadius: 10, padding: 16,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 20 }}>{CAT_ICON[e.category]}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 500, letterSpacing: "-0.01em" }}>{e.name}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
                      {new Date(e.date).toLocaleDateString("es-PE", { day: "numeric", month: "long" })} · falta {e.daysToEvent}d
                    </div>
                  </div>
                  <span style={{ fontSize: 9.5, padding: "2px 8px", borderRadius: 4, background: IMPACT_COLOR[e.impact] + "20", color: IMPACT_COLOR[e.impact], fontFamily: "var(--font-mono)", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    {e.impact}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.45, marginBottom: 10 }}>
                  {e.note}
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
                  {e.brands.map(b => {
                    const brand = _DATA().BRANDS.find(x => x.id === b);
                    return brand ? <span key={b} style={{ fontSize: 10.5, padding: "3px 8px", borderRadius: 4, background: brand.color + "18", color: brand.color, fontWeight: 500 }}>{brand.name}</span> : null;
                  })}
                </div>
                <button className="btn btn-primary" style={{ width: "100%", padding: "7px 12px", fontSize: 12 }}>
                  Crear campaña de preparación →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Próximas */}
      <div style={{ marginBottom: 22 }}>
        <div className="panel-sub" style={{ marginBottom: 8 }}>PREPARAR PRONTO</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
          {nextPrep.map(e => (
            <div key={e.id} style={{
              background: "var(--paper)", border: "1px solid var(--line)",
              borderRadius: 8, padding: 12, position: "relative",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                <span style={{ fontSize: 15 }}>{CAT_ICON[e.category]}</span>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 500 }}>{e.name}</div>
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--font-mono)", marginBottom: 6 }}>
                {new Date(e.date).toLocaleDateString("es-PE", { day: "numeric", month: "long" })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 10.5, color: "var(--ink-2)" }}>Empezar en {e.daysToPrep}d</span>
                <span style={{ width: 6, height: 6, borderRadius: 50, background: IMPACT_COLOR[e.impact] }}></span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Vista calendario lineal */}
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2 className="panel-title" style={{ fontSize: 17 }}>Año comercial</h2>
            <div className="panel-sub" style={{ marginTop: 3 }}>VISTA ANUAL · TIMELINE DE FECHAS CLAVE</div>
          </div>
        </div>
        <div style={{ padding: 18 }}>
          {months.map(m => {
            const monthEvents = enriched.filter(e => new Date(e.date).getMonth() === m.idx);
            return (
              <div key={m.idx} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 16, padding: "12px 0", borderBottom: "1px solid var(--paper-3)" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-3)", paddingTop: 4 }}>
                  {m.name}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {monthEvents.length === 0 ? (
                    <span style={{ fontSize: 11, color: "var(--ink-3)", fontStyle: "italic" }}>—</span>
                  ) : (
                    monthEvents.map(e => (
                      <div key={e.id} style={{
                        padding: "5px 11px", borderRadius: 6,
                        background: IMPACT_COLOR[e.impact] + "12",
                        border: `1px solid ${IMPACT_COLOR[e.impact]}30`,
                        fontSize: 12, color: IMPACT_COLOR[e.impact], fontWeight: 500,
                        display: "flex", alignItems: "center", gap: 5,
                      }}>
                        <span>{CAT_ICON[e.category]}</span>
                        <span>{e.name}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, opacity: .7 }}>· {new Date(e.date).getDate()}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// 4. GRUPOS COMERCIALES — vista lista + detalle
// ─────────────────────────────────────────────────────────────
function groupAggregates(family, clients) {
  const members = clients.filter(c => c.familyId === family.id);
  const totalYTD = members.reduce((s, c) => s + (c.ytd || 0), 0);
  const totalAvg = members.reduce((s, c) => s + (c.avgMonthly || 0), 0);
  const lastPurchase = members.reduce((latest, c) => {
    if (!c.lastPurchase) return latest;
    if (!latest || new Date(c.lastPurchase) > new Date(latest)) return c.lastPurchase;
    return latest;
  }, null);
  const states = members.map(c => window.HiloLogic.calcStatus(c).state);
  const enRiesgo = states.filter(s => s === "en-riesgo" || s === "dormido").length;
  const vip = states.filter(s => s === "vip").length;
  const creditUsed = members.reduce((s, c) => s + (c.creditUsed || 0), 0);
  const creditLine = members.reduce((s, c) => s + (c.creditLine || 0), 0);
  const opps = members.reduce((s, c) => s + window.HiloLogic.calcOpportunities(c).length, 0);
  const oppEstimate = window.HiloLogic.OPPORTUNITIES.filter(o => members.some(m => m.id === o.clientId)).reduce((s, o) => s + (o.estimate || 0), 0);
  // Brand consolidation
  const brandMix = {};
  members.forEach(m => (m.brands || []).forEach(b => brandMix[b] = (brandMix[b] || 0) + 1));
  const topBrands = Object.entries(brandMix).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return { members, totalYTD, totalAvg, lastPurchase, enRiesgo, vip, creditUsed, creditLine, opps, oppEstimate, topBrands };
}

function ViewGroups({ openClient, openGroup }) {
  const { FAMILIES, CLIENTS } = _DATA();
  const groups = FAMILIES.map(f => ({ ...f, agg: groupAggregates(f, CLIENTS) }));
  const sorted = groups.sort((a, b) => b.agg.totalYTD - a.agg.totalYTD);

  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <div className="page-eyebrow">GRUPOS COMERCIALES</div>
        <h1 className="page-title" style={{ marginTop: 4 }}>
          {groups.length} grupos · <em style={{ fontStyle: "italic" }}>familias y negocios vinculados</em>
        </h1>
        <div className="page-sub" style={{ marginTop: 6 }}>
          Familias con varios negocios · ventas consolidadas · oportunidad de venta por volumen
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16 }}>
        {sorted.map(g => {
          const { agg } = g;
          const lastDays = agg.lastPurchase ? window.HiloHelpers.daysSince(agg.lastPurchase) : null;
          const creditPct = agg.creditLine ? Math.round(agg.creditUsed / agg.creditLine * 100) : 0;
          return (
            <div key={g.id} onClick={() => openGroup(g.id)} style={{
              background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: 18, cursor: "pointer", transition: "all .15s",
            }}
              onMouseEnter={(e) => e.currentTarget.style.boxShadow = "var(--shadow-md)"}
              onMouseLeave={(e) => e.currentTarget.style.boxShadow = "none"}>

              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: 10, background: "var(--clay)", color: "var(--paper)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 600, fontFamily: "var(--font-display)" }}>
                  {g.surname.split(" ").map(w => w[0]).slice(0, 2).join("")}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 500, letterSpacing: "-0.02em" }}>
                    Familia {g.surname}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2, lineHeight: 1.4 }}>{g.note}</div>
                </div>
                {agg.vip > 0 && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "rgba(201,138,59,.18)", color: "#8B6914", fontFamily: "var(--font-mono)", letterSpacing: "0.1em", fontWeight: 600 }}>★ VIP</span>}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ink-3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>Venta YTD grupo</div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 500, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>S/ {(agg.totalYTD / 1000).toFixed(1)}k</div>
                </div>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ink-3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>Promedio mensual</div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 500, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>S/ {(agg.totalAvg / 1000).toFixed(1)}k</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, padding: "10px 0", borderTop: "1px solid var(--paper-3)", borderBottom: "1px solid var(--paper-3)", marginBottom: 12 }}>
                <Mini label="Negocios" value={agg.members.length} />
                <Mini label="En riesgo" value={agg.enRiesgo} alert={agg.enRiesgo > 0} />
                <Mini label="Oport." value={agg.opps} good={agg.opps > 0} />
                <Mini label="Última" value={lastDays != null ? `${lastDays}d` : "—"} />
              </div>

              {/* Crédito */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ink-3)", marginBottom: 4 }}>
                  <span>Crédito grupo</span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>S/ {agg.creditUsed.toLocaleString("es-PE")} / {agg.creditLine.toLocaleString("es-PE")}</span>
                </div>
                <div style={{ height: 5, background: "var(--paper-3)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${creditPct}%`, background: creditPct >= 80 ? "var(--clay)" : creditPct >= 60 ? "#C98A3B" : "var(--olive)" }}></div>
                </div>
              </div>

              {/* Tiendas */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {agg.members.slice(0, 3).map(m => (
                  <div key={m.id} onClick={(e) => { e.stopPropagation(); openClient(m.id); }}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderRadius: 6, fontSize: 11.5 }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--paper-2)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                    <span style={{ color: "var(--ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📍 {m.name}</span>
                    <span style={{ color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: 10.5 }}>S/ {((m.ytd || 0) / 1000).toFixed(1)}k</span>
                  </div>
                ))}
                {agg.members.length > 3 && (
                  <div style={{ fontSize: 10.5, color: "var(--ink-3)", padding: "4px 8px", fontStyle: "italic" }}>
                    +{agg.members.length - 3} negocio{agg.members.length - 3 > 1 ? "s" : ""}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

const Mini = ({ label, value, alert, good }) => (
  <div>
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 2 }}>{label}</div>
    <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 500, fontVariantNumeric: "tabular-nums", color: alert ? "var(--clay)" : good ? "#3F5A3D" : "var(--ink)", letterSpacing: "-0.01em" }}>{value}</div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// GROUP DETAIL DRAWER
// ─────────────────────────────────────────────────────────────
function GroupDrawer({ groupId, onClose, openClient }) {
  const { FAMILIES, CLIENTS, INTERACTIONS } = _DATA();
  const family = FAMILIES.find(f => f.id === groupId);
  if (!family) return null;
  const agg = groupAggregates(family, CLIENTS);
  const lastDays = agg.lastPurchase ? window.HiloHelpers.daysSince(agg.lastPurchase) : null;
  const groupInteractions = INTERACTIONS.filter(i => agg.members.some(m => m.id === i.clientId)).slice(0, 8);

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(43,34,21,.45)", zIndex: 90,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        position: "absolute", top: 0, right: 0, bottom: 0, width: "min(820px, 95vw)",
        background: "var(--paper)", overflowY: "auto", boxShadow: "var(--shadow-lg)",
      }}>
        {/* Header */}
        <div style={{ padding: "24px 28px 18px", background: "var(--paper-2)", borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
            <div style={{ width: 56, height: 56, borderRadius: 12, background: "var(--clay)", color: "var(--paper)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 600, fontFamily: "var(--font-display)" }}>
              {family.surname.split(" ").map(w => w[0]).slice(0, 2).join("")}
            </div>
            <div style={{ flex: 1 }}>
              <div className="page-eyebrow">GRUPO COMERCIAL</div>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 500, letterSpacing: "-0.02em", marginTop: 4 }}>
                Familia {family.surname}
              </h2>
              <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 4 }}>{family.note}</div>
            </div>
            <button onClick={onClose} style={{ background: "transparent", border: "none", fontSize: 22, cursor: "pointer", color: "var(--ink-3)" }}>×</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 0, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
            <GMini label="Venta YTD"     value={`S/ ${(agg.totalYTD / 1000).toFixed(1)}k`} />
            <GMini label="Mensual prom." value={`S/ ${(agg.totalAvg / 1000).toFixed(1)}k`} />
            <GMini label="Negocios"      value={agg.members.length} />
            <GMini label="Última compra" value={lastDays != null ? `hace ${lastDays}d` : "—"} alert={lastDays > 90} />
            <GMini label="Oport. pot."   value={`S/ ${(agg.oppEstimate / 1000).toFixed(1)}k`} good={agg.oppEstimate > 0} />
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: 28 }}>
          {/* Tiendas */}
          <div style={{ marginBottom: 28 }}>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 500, marginBottom: 10 }}>Tiendas / negocios del grupo</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {agg.members.map(m => {
                const calc = window.HiloLogic.calcStatus(m);
                const days = window.HiloHelpers.daysSince(m.lastPurchase);
                return (
                  <div key={m.id} onClick={() => openClient(m.id)} style={{
                    background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 8, padding: 14, cursor: "pointer",
                    display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", alignItems: "center", gap: 12,
                  }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--paper-2)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "var(--paper)"}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{m.contact} · {m.role}</div>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink-2)" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Provincia</div>
                      <div>{_DATA().REGIONS.find(r => r.id === m.region)?.name}</div>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink-2)" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Última</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>hace {days}d</div>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink-2)" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>YTD</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>S/ {((m.ytd || 0) / 1000).toFixed(1)}k</div>
                    </div>
                    <div>
                      <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 4, fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase", background: calc.bg, color: calc.color, fontWeight: 600 }}>
                        {calc.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Marcas top del grupo */}
          {agg.topBrands.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 500, marginBottom: 10 }}>Marcas que compra el grupo</h3>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {agg.topBrands.map(([bid, count]) => {
                  const b = _DATA().BRANDS.find(x => x.id === bid);
                  if (!b) return null;
                  return (
                    <div key={bid} style={{ padding: "8px 14px", borderRadius: 8, background: b.color + "12", border: `1px solid ${b.color}33`, color: b.color, fontWeight: 500, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                      {b.name}
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, opacity: .7 }}>· {count} tiendas</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Oportunidad volumen */}
          {agg.members.length >= 2 && (
            <div style={{ background: "rgba(31,138,91,.07)", border: "1px solid rgba(31,138,91,.20)", borderRadius: 10, padding: 16, marginBottom: 22 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ fontSize: 22 }}>💡</span>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 500, marginBottom: 4 }}>Oportunidad por volumen consolidado</div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
                    Esta familia opera <strong>{agg.members.length} negocios</strong>. Pueden negociar mejor precio si compran consolidado a través de un solo despacho ({agg.totalAvg.toLocaleString("es-PE")} S/mes potenciales). <strong>Acción sugerida:</strong> proponer descuento por volumen al contacto principal.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Actividad reciente del grupo */}
          <div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 500, marginBottom: 10 }}>Actividad reciente del grupo</h3>
            <div style={{ borderLeft: "2px solid var(--paper-3)", paddingLeft: 16 }}>
              {groupInteractions.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--ink-3)", fontStyle: "italic" }}>Sin actividad reciente</div>
              ) : groupInteractions.map(i => {
                const m = agg.members.find(x => x.id === i.clientId);
                return (
                  <div key={i.id} style={{ position: "relative", marginBottom: 14, fontSize: 12 }}>
                    <div style={{ position: "absolute", left: -23, top: 4, width: 10, height: 10, borderRadius: 50, background: "var(--paper)", border: "2px solid var(--clay)" }}></div>
                    <div style={{ fontWeight: 500 }}>{i.type === "compra" ? "🛒 Compra" : i.type === "llamada" ? "📞 Llamada" : "💬 WhatsApp"} · {m?.name}</div>
                    <div style={{ color: "var(--ink-3)", fontSize: 11, marginTop: 2 }}>
                      {window.HiloHelpers.fmtDate(i.date)} {i.amount ? ` · S/ ${i.amount.toLocaleString("es-PE")}` : ""} {i.note ? ` · ${i.note}` : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const GMini = ({ label, value, alert, good }) => (
  <div style={{ padding: "12px 14px", borderRight: "1px solid var(--paper-3)" }}>
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ink-3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
    <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 500, color: alert ? "var(--clay)" : good ? "#3F5A3D" : "var(--ink)", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{value}</div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// 5. FICHA 360 HEADER REFORZADA — usado en drawer de cliente
// ─────────────────────────────────────────────────────────────
function ClientHeader360({ client }) {
  const calc = window.HiloLogic.calcStatus(client);
  const days = window.HiloHelpers.daysSince(client.lastPurchase);
  const freq = window.HiloLogic.FREQ_EXPECTED[client.channel] || 30;
  const ratio = days / freq;
  const credPct = Math.round((client.creditUsed || 0) / (client.creditLine || 1) * 100);
  const opps = window.HiloLogic.calcOpportunities(client);
  const oppEst = opps.reduce((s, o) => s + (o.estimate || 0), 0);
  const inCampaigns = (window.HiloLogic.SALES_CAMPAIGNS || []).filter(sc => sc.clientIds.includes(client.id));
  const followups = (window.HiloData.FOLLOWUPS || []).filter(f => f.clientId === client.id);
  const noPurchaseReasons = followups.filter(f => f.reason).reduce((acc, f) => {
    acc[f.reason] = (acc[f.reason] || 0) + 1; return acc;
  }, {});

  return (
    <div style={{ background: "var(--paper-2)", padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
      {/* Estado pill */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ display: "inline-block", padding: "4px 11px", borderRadius: 5, fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase", background: calc.bg, color: calc.color, fontWeight: 700 }}>
          {calc.label}
        </span>
        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{calc.detail}</span>
      </div>

      {/* KPIs grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 14 }}>
        <KMini label="Última compra" value={`hace ${days}d`} sub={window.HiloHelpers.fmtDate(client.lastPurchase)} alert={days > freq * 1.5} />
        <KMini label="Frecuencia" value={`${freq}d esperado`} sub={ratio > 1.4 ? `+${Math.round((ratio-1)*100)}% sobre frec.` : "al día"} alert={ratio > 1.4} />
        <KMini label="Ticket prom." value={`S/ ${((client.lastPurchaseAmount || client.avgMonthly) / 1000).toFixed(1)}k`} sub={`S/ ${(client.avgMonthly || 0).toLocaleString("es-PE")}/mes`} />
        <KMini label="YTD acumulado" value={`S/ ${((client.ytd || 0) / 1000).toFixed(1)}k`} sub="Año en curso" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {/* Crédito */}
        <div style={{ background: "var(--paper)", borderRadius: 8, padding: 12, border: "1px solid var(--line)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 6 }}>Crédito</div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>S/ {(client.creditUsed || 0).toLocaleString("es-PE")} <span style={{ fontWeight: 400, color: "var(--ink-3)", fontSize: 11 }}>/ {(client.creditLine || 0).toLocaleString("es-PE")}</span></div>
          <div style={{ height: 5, background: "var(--paper-3)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(credPct, 100)}%`, background: credPct >= 80 ? "var(--clay)" : credPct >= 60 ? "#C98A3B" : "var(--olive)" }}></div>
          </div>
          <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 4, fontFamily: "var(--font-mono)" }}>{credPct}% ocupada · {client.paymentTerms || "—"}</div>
        </div>

        {/* Oportunidades */}
        <div style={{ background: "var(--paper)", borderRadius: 8, padding: 12, border: "1px solid var(--line)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 6 }}>Oportunidades</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{opps.length} detectadas</div>
          {oppEst > 0 && <div style={{ fontSize: 11, color: "var(--olive)", fontWeight: 500, marginTop: 2 }}>≈ S/ {oppEst.toLocaleString("es-PE")} potencial</div>}
          {opps.length === 0 && <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2, fontStyle: "italic" }}>Sin oportunidades activas</div>}
        </div>

        {/* Campañas */}
        <div style={{ background: "var(--paper)", borderRadius: 8, padding: 12, border: "1px solid var(--line)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 6 }}>En campañas</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{inCampaigns.length} {inCampaigns.length === 1 ? "campaña" : "campañas"}</div>
          {inCampaigns.length > 0 ? (
            <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 3, fontStyle: "italic", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {inCampaigns[0].name}{inCampaigns.length > 1 ? ` +${inCampaigns.length - 1}` : ""}
            </div>
          ) : <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2, fontStyle: "italic" }}>No asignado</div>}
        </div>
      </div>

      {/* Motivos de no compra anteriores */}
      {Object.keys(noPurchaseReasons).length > 0 && (
        <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(181,70,42,.06)", borderLeft: "3px solid var(--clay)", borderRadius: 4 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clay)", marginBottom: 4, fontWeight: 600 }}>MOTIVOS ANTERIORES DE NO COMPRA</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Object.entries(noPurchaseReasons).map(([rid, count]) => {
              const r = window.HiloLogic.NO_PURCHASE_REASONS.find(x => x.id === rid);
              if (!r) return null;
              return <span key={rid} style={{ fontSize: 11.5, padding: "3px 9px", borderRadius: 4, background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink-2)" }}>
                {r.emoji} {r.label} {count > 1 && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-3)" }}>×{count}</span>}
              </span>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
const KMini = ({ label, value, sub, alert }) => (
  <div>
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ink-3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
    <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 500, color: alert ? "var(--clay)" : "var(--ink)", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: alert ? "var(--clay)" : "var(--ink-3)", marginTop: 3, fontFamily: "var(--font-mono)" }}>{sub}</div>}
  </div>
);

// Export
window.Views = window.Views || {};
window.Views.ViewCredit = ViewCredit;
window.Views.ViewCalendar = ViewCalendar;
window.Views.ViewGroups = ViewGroups;
window.HiloExtras = { GlobalSearch, GroupDrawer, ClientHeader360 };
