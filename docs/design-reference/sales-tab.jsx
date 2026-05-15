// ============================================================
// SALES TAB — Comparativo YoY por cliente
// Replica el patrón de Dynaminds: filtros de fecha, comparativa
// YTD vs Año completo, tabla resumen, gráfico mensual, top productos
// ============================================================
const { useState: useS_ST, useMemo: useM_ST } = React;

function SalesTab({ client }) {
  const ALL_LINES = window.HiloData.SALES_LINES.filter(l => l.clientId === client.id);

  const [yearA, setYearA] = useS_ST(2026);
  const [yearB, setYearB] = useS_ST(2025);
  const [mode, setMode]   = useS_ST("ytd");      // ytd | full
  const [sortBy, setSortBy] = useS_ST("delta-pct"); // delta-pct | delta-soles | sales-current
  const [from, setFrom]   = useS_ST("");          // override fecha
  const [to, setTo]       = useS_ST("");

  const today = new Date("2026-05-07");
  const ytdMonth = today.getMonth(); // 0-indexed → 4 = mayo
  const ytdDay   = today.getDate();

  const inRange = (line, year) => {
    const d = new Date(line.date);
    if (d.getFullYear() !== year) return false;
    if (mode === "ytd") {
      const m = d.getMonth();
      if (m > ytdMonth) return false;
      if (m === ytdMonth && d.getDate() > ytdDay) return false;
    }
    if (from) { if (d < new Date(from)) return false; }
    if (to)   { if (d > new Date(to))   return false; }
    return true;
  };

  // Resumen: ventas, unidades, órdenes
  const summary = useM_ST(() => {
    const sumYear = (y) => {
      const lines = ALL_LINES.filter(l => inRange(l, y));
      const orders = new Set(lines.map(l => l.orderId));
      return {
        sales: lines.reduce((a,l) => a + l.total, 0),
        units: lines.reduce((a,l) => a + l.qty, 0),
        orders: orders.size,
      };
    };
    return { a: sumYear(yearA), b: sumYear(yearB) };
  }, [yearA, yearB, mode, from, to, ALL_LINES]);

  // Ventas mensuales por año
  const monthly = useM_ST(() => {
    const months = Array.from({length: 12}, (_, i) => ({ idx: i, a: 0, b: 0 }));
    ALL_LINES.forEach(l => {
      const d = new Date(l.date);
      if (inRange(l, yearA)) months[d.getMonth()].a += l.total;
      if (inRange(l, yearB)) months[d.getMonth()].b += l.total;
    });
    return months;
  }, [yearA, yearB, mode, from, to, ALL_LINES]);

  // Top productos comparativo
  const topProducts = useM_ST(() => {
    const map = new Map(); // key = brand|model|fit|finish
    const upsert = (l, year) => {
      const key = `${l.brand}|${l.model}|${l.fit}|${l.finish}`;
      let row = map.get(key);
      if (!row) {
        row = { key, brand: l.brand, type: l.type, model: l.model, fit: l.fit, finish: l.finish, a: 0, b: 0, qa: 0, qb: 0 };
        map.set(key, row);
      }
      if (year === "a") { row.a += l.total; row.qa += l.qty; }
      else { row.b += l.total; row.qb += l.qty; }
    };
    ALL_LINES.forEach(l => {
      if (inRange(l, yearA)) upsert(l, "a");
      if (inRange(l, yearB)) upsert(l, "b");
    });
    let rows = Array.from(map.values());
    rows.forEach(r => {
      r.deltaSoles = r.a - r.b;
      r.deltaPct = r.b > 0 ? (r.a - r.b) / r.b * 100 : (r.a > 0 ? 100 : 0);
      // Estado: nuevo / mantenido / creciendo / decreciendo / perdido
      if (r.b === 0 && r.a > 0) r.state = "nuevo";
      else if (r.a === 0 && r.b > 0) r.state = "perdido";
      else if (r.a >= r.b * 1.1) r.state = "creciendo";
      else if (r.a <= r.b * 0.9) r.state = "decreciendo";
      else r.state = "mantenido";
    });
    rows.sort((x, y) => {
      if (sortBy === "delta-pct")    return y.deltaPct - x.deltaPct;
      if (sortBy === "delta-soles")  return y.deltaSoles - x.deltaSoles;
      return y.a - x.a;
    });
    return rows;
  }, [yearA, yearB, mode, from, to, sortBy, ALL_LINES]);

  const fm = (n) => "S/ " + Math.round(n).toLocaleString("es-PE");
  const pct = (n) => (n > 0 ? "+" : "") + n.toFixed(1) + "%";
  const monthLabels = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const maxMonth = Math.max(1, ...monthly.flatMap(m => [m.a, m.b]));
  const visibleMonths = mode === "ytd" ? monthly.slice(0, ytdMonth + 1) : monthly;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* Filtros */}
      <div className="sales-filters">
        <div className="sf-row">
          <label className="sf-label">Comparativa:</label>
          <div className="seg-toggle">
            <button className={`seg ${mode==="ytd"?"on":""}`} onClick={()=>setMode("ytd")}>YTD al 7 may</button>
            <button className={`seg ${mode==="full"?"on":""}`} onClick={()=>setMode("full")}>Año completo</button>
          </div>
        </div>
        <div className="sf-row">
          <label className="sf-label">Año actual:</label>
          <select className="sf-select" value={yearA} onChange={e=>setYearA(+e.target.value)}>
            <option value={2026}>2026</option>
            <option value={2025}>2025</option>
          </select>
          <label className="sf-label" style={{ marginLeft: 14 }}>Comparar contra:</label>
          <select className="sf-select" value={yearB} onChange={e=>setYearB(+e.target.value)}>
            <option value={2025}>2025</option>
            <option value={2024}>2024</option>
          </select>
          {(from || to) && (
            <button className="btn btn-ghost" style={{ marginLeft: "auto", fontSize: 11, padding: "4px 10px" }} onClick={()=>{setFrom("");setTo("");}}>↻ Reset</button>
          )}
        </div>
      </div>

      {/* Resumen comparativo */}
      <div>
        <div className="sales-section-head">
          <span className="sales-mono">COMPARATIVO {yearA} VS {yearB}</span>
          <span className="sales-mono dim">{mode === "ytd" ? "YTD al 7 may" : "Año completo"}</span>
        </div>
        <div className="sales-table">
          <div className="sales-row sales-row-head">
            <span></span>
            <span style={{ textAlign: "right" }}>{yearA}</span>
            <span style={{ textAlign: "right" }}>{yearB}</span>
            <span style={{ textAlign: "right" }}>Δ</span>
          </div>
          {[
            { lbl: "Ventas",   a: fm(summary.a.sales),  b: fm(summary.b.sales),  d: summary.b.sales ? (summary.a.sales-summary.b.sales)/summary.b.sales*100 : 0 },
            { lbl: "Unidades", a: summary.a.units.toLocaleString(),  b: summary.b.units.toLocaleString(),  d: summary.b.units ? (summary.a.units-summary.b.units)/summary.b.units*100 : 0 },
            { lbl: "Órdenes",  a: String(summary.a.orders), b: String(summary.b.orders), d: summary.b.orders ? (summary.a.orders-summary.b.orders)/summary.b.orders*100 : 0 },
          ].map(r => {
            const up = r.d >= 0;
            return (
              <div className="sales-row" key={r.lbl}>
                <span>{r.lbl}</span>
                <span className="sales-num strong">{r.a}</span>
                <span className="sales-num dim">{r.b}</span>
                <span className={`sales-num delta ${up ? "up" : "down"}`}>
                  {up ? "↑" : "↓"} {pct(r.d)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Gráfico mensual */}
      <div>
        <div className="sales-section-head">
          <span className="sales-mono">VENTAS MENSUALES · {yearA} VS {yearB}</span>
          <span className="sales-mono dim">{mode === "ytd" ? "YTD" : "Año completo"}</span>
        </div>
        <div className="sales-chart">
          <div className="sales-chart-yaxis">
            <span>{fm(maxMonth)}</span>
            <span>{fm(maxMonth * 0.75)}</span>
            <span>{fm(maxMonth * 0.5)}</span>
            <span>{fm(maxMonth * 0.25)}</span>
            <span>0</span>
          </div>
          <div className="sales-chart-bars">
            {visibleMonths.map((m, i) => (
              <div key={i} className="sales-chart-month">
                <div className="sales-chart-pair">
                  <div className="sales-bar a" style={{ height: (m.a/maxMonth*100)+"%" }} title={`${yearA}: ${fm(m.a)}`}></div>
                  <div className="sales-bar b" style={{ height: (m.b/maxMonth*100)+"%" }} title={`${yearB}: ${fm(m.b)}`}></div>
                </div>
                <div className="sales-chart-label">{monthLabels[m.idx]}</div>
              </div>
            ))}
          </div>
          <div className="sales-chart-legend">
            <span><i className="leg-dot a"></i> {yearA}</span>
            <span><i className="leg-dot b"></i> {yearB}</span>
          </div>
        </div>
      </div>

      {/* Top productos */}
      <div>
        <div className="sales-section-head">
          <span className="sales-mono">TOP PRODUCTOS · {yearA} VS {yearB} · {topProducts.length}</span>
          <div style={{ display: "flex", gap: 6 }}>
            <span className="sales-mono dim" style={{ marginRight: 8 }}>ORDENAR:</span>
            <button className={`mini-tab ${sortBy==="delta-pct"?"on":""}`}    onClick={()=>setSortBy("delta-pct")}>Δ%</button>
            <button className={`mini-tab ${sortBy==="delta-soles"?"on":""}`}  onClick={()=>setSortBy("delta-soles")}>Δ S/</button>
            <button className={`mini-tab ${sortBy==="sales-current"?"on":""}`} onClick={()=>setSortBy("sales-current")}>Ventas {yearA}</button>
          </div>
        </div>
        <div className="sales-products-table">
          <div className="spt-row spt-head">
            <span>PRODUCTO</span>
            <span style={{textAlign:"right"}}>{yearA}</span>
            <span style={{textAlign:"right"}}>{yearB}</span>
            <span style={{textAlign:"right"}}>Δ%</span>
            <span style={{textAlign:"right"}}>Δ S/</span>
            <span style={{textAlign:"right"}}>UNID {String(yearA).slice(2)}/{String(yearB).slice(2)}</span>
            <span style={{textAlign:"center"}}>ESTADO</span>
          </div>
          {topProducts.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
              Sin ventas en el período seleccionado
            </div>
          )}
          {topProducts.slice(0, 30).map((r, i) => {
            const up = r.deltaPct >= 0;
            const stateColor = {
              nuevo:       { bg: "rgba(31,138,91,.10)",  fg: "#1F8A5B" },
              creciendo:   { bg: "rgba(31,138,91,.10)",  fg: "#1F8A5B" },
              mantenido:   { bg: "rgba(92,92,92,.08)",   fg: "#5C5C5C" },
              decreciendo: { bg: "rgba(181,70,42,.10)",  fg: "#B5462A" },
              perdido:     { bg: "rgba(181,70,42,.14)",  fg: "#B5462A" },
            }[r.state];
            return (
              <div className="spt-row" key={r.key}>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 500, letterSpacing: "-0.01em", textTransform: "uppercase" }}>
                    {window.HiloData.BRANDS.find(b=>b.id===r.brand)?.name || r.brand}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                    {r.type} · {r.fit} · {r.finish}
                  </div>
                </div>
                <span className="sales-num strong">{r.a > 0 ? fm(r.a) : "S/. 0"}</span>
                <span className="sales-num dim">{r.b > 0 ? fm(r.b) : "S/. 0"}</span>
                <span className={`sales-num delta ${up ? "up" : "down"}`}>
                  {up ? "↑" : "↓"} {pct(r.deltaPct)}
                </span>
                <span className={`sales-num ${up ? "delta up" : "delta down"}`}>
                  {(r.deltaSoles >= 0 ? "S/. +" : "S/. ") + Math.round(r.deltaSoles).toLocaleString("es-PE")}
                </span>
                <span className="sales-num">{r.qa} / {r.qb}</span>
                <span style={{ textAlign: "center" }}>
                  <span className="state-pill" style={{ background: stateColor.bg, color: stateColor.fg }}>
                    {r.state}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

window.SalesTab = SalesTab;
