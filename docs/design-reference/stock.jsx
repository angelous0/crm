// ============================================================
// STOCK + CATÁLOGO — vista de inventario con fotos + generador
// ============================================================

const { PRODUCTS, PRODUCT_COLORS, BRANDS: STK_BRANDS, CLIENTS: STK_CLIENTS, WA_TEMPLATES: STK_WA } = (() => ({
  PRODUCTS: window.HiloLogic.PRODUCTS,
  PRODUCT_COLORS: window.HiloLogic.PRODUCT_COLORS,
  BRANDS: window.HiloData.BRANDS,
  CLIENTS: window.HiloData.CLIENTS,
  WA_TEMPLATES: window.HiloData.WA_TEMPLATES,
}))();

const stkFmt = (n) => "S/ " + n.toLocaleString("es-PE");
const colorById = (id) => PRODUCT_COLORS.find(c => c.id === id);
const brandById = (id) => STK_BRANDS.find(b => b.id === id);

function stockState(p) {
  if (p.stock === 0) return { id:"agotado",  label:"Agotado",   color:"#A8351F", bg:"rgba(168,53,31,.10)" };
  if (p.stock <= p.lowStock) return { id:"bajo", label:"Bajo stock", color:"#C98A3B", bg:"rgba(201,138,59,.12)" };
  return { id:"ok", label:"En stock", color:"#3F5A3D", bg:"rgba(63,90,61,.08)" };
}

// ─────────────────────────────────────────────────────────────
// PRODUCT CARD
// ─────────────────────────────────────────────────────────────
function ProductCard({ p, selected, onToggle, onOpen, compact }) {
  const st = stockState(p);
  const brand = brandById(p.brand);
  return (
    <div
      className="prod-card"
      style={{
        background: "var(--paper)",
        border: selected ? "2px solid var(--ink)" : "1px solid var(--line)",
        borderRadius: 12,
        overflow: "hidden",
        cursor: "pointer",
        position: "relative",
        transition: "transform .15s, box-shadow .15s",
      }}
      onClick={() => onOpen?.(p)}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 18px rgba(60,40,20,.08)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
    >
      {/* Selector */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggle?.(p); }}
        style={{
          position: "absolute", top: 10, right: 10, zIndex: 2,
          width: 28, height: 28, borderRadius: 50,
          background: selected ? "var(--ink)" : "rgba(255,255,255,.85)",
          border: selected ? "none" : "1px solid var(--line)",
          color: selected ? "var(--paper)" : "var(--ink-3)",
          cursor: "pointer", display: "grid", placeItems: "center",
          fontSize: 14, fontWeight: 600,
          backdropFilter: "blur(4px)",
        }}
        title={selected ? "Quitar del catálogo" : "Agregar al catálogo"}
      >
        {selected ? "✓" : "+"}
      </button>

      {/* Badges */}
      <div style={{ position:"absolute", top:10, left:10, zIndex:2, display:"flex", flexDirection:"column", gap:4 }}>
        {p.isNew && (
          <span style={{ fontFamily:"var(--font-mono)", fontSize:9, letterSpacing:".12em", padding:"3px 7px", background:"var(--ink)", color:"var(--paper)", borderRadius:3 }}>NUEVO</span>
        )}
        {p.isBestseller && (
          <span style={{ fontFamily:"var(--font-mono)", fontSize:9, letterSpacing:".12em", padding:"3px 7px", background:"#C98A3B", color:"#fff", borderRadius:3 }}>TOP</span>
        )}
      </div>

      {/* Image */}
      <div style={{ background:"var(--paper-2)", aspectRatio:"1/1", display:"grid", placeItems:"center", borderBottom:"1px solid var(--paper-3)" }}>
        <img src={p.img} alt={p.name} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
      </div>

      {/* Body */}
      <div style={{ padding: compact ? "8px 10px 10px" : "12px 14px 14px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
          <span style={{ width:7, height:7, borderRadius:50, background: brand?.color }}></span>
          <span style={{ fontFamily:"var(--font-mono)", fontSize:9.5, color:"var(--ink-3)", letterSpacing:".1em", textTransform:"uppercase" }}>{brand?.name}</span>
        </div>
        <div style={{ fontFamily:"var(--font-display)", fontSize:16, fontWeight:500, color:"var(--ink)", letterSpacing:"-0.01em", marginBottom:2 }}>{p.name}</div>
        <div style={{ fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--ink-3)" }}>{p.sku} · {p.type}</div>

        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:10, gap:8 }}>
          <div>
            <div style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:500 }}>{stkFmt(p.price)}</div>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--ink-3)" }}>POR MAYOR</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <span style={{ fontFamily:"var(--font-mono)", fontSize:10, padding:"3px 8px", borderRadius:3, background:st.bg, color:st.color, fontWeight:500 }}>
              {st.label}
            </span>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--ink-2)", marginTop:4, fontVariantNumeric:"tabular-nums" }}>
              {p.stock} u.
            </div>
          </div>
        </div>

        {/* Color chips */}
        <div style={{ display:"flex", gap:4, marginTop:10, alignItems:"center" }}>
          {p.colors.slice(0,6).map(cid => {
            const c = colorById(cid);
            return c ? <span key={cid} style={{ width:14, height:14, borderRadius:50, background:c.hex, border:"1px solid rgba(0,0,0,.1)" }} title={c.label}></span> : null;
          })}
          {p.colors.length > 6 && <span style={{ fontSize:10, color:"var(--ink-3)" }}>+{p.colors.length-6}</span>}
          <span style={{ flex:1 }}></span>
          <span style={{ fontFamily:"var(--font-mono)", fontSize:9.5, color:"var(--ink-3)" }}>{p.sizes.length} TALLAS</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// VISTA STOCK
// ─────────────────────────────────────────────────────────────
// Genera matriz talla x color con stock pseudo-aleatorio determinista
function stockMatrix(p) {
  const seed = p.sku.split("").reduce((a,c)=>a + c.charCodeAt(0), 0);
  const total = p.stock;
  const cells = p.colors.length * p.sizes.length;
  if (cells === 0) return [];
  const matrix = [];
  let remaining = total;
  let counter = 0;
  for (let i = 0; i < p.colors.length; i++) {
    for (let j = 0; j < p.sizes.length; j++) {
      const r = ((seed * (i+1) * (j+3)) % 17) / 17;
      const avg = remaining / Math.max(1, cells - counter);
      const variance = avg * 1.6;
      let qty = Math.round(avg * (0.4 + r * 1.2));
      if (qty > remaining) qty = remaining;
      if (counter === cells - 1) qty = Math.max(0, remaining);
      // Inject some zeros for variety
      if (((seed + i*7 + j*11) % 9) === 0) qty = 0;
      remaining -= qty;
      counter++;
      matrix.push({ color: p.colors[i], size: p.sizes[j], qty });
    }
  }
  return matrix;
}

// ─────────────────────────────────────────────────────────────
// PANEL ¿Qué reponer?
// ─────────────────────────────────────────────────────────────
function RestockPanel({ active, onSelect }) {
  const out  = PRODUCTS.filter(p => p.stock === 0);
  const low  = PRODUCTS.filter(p => p.stock > 0 && p.stock <= p.lowStock);
  const dead = PRODUCTS.filter(p => p.stock > p.lowStock * 8);
  const fresh= PRODUCTS.filter(p => p.isNew);

  const cards = [
    { id:"agotado",   label:"Agotados",       desc:"Sin stock — reponer ya",       count: out.length,  color:"#A8351F", bg:"rgba(168,53,31,.08)" },
    { id:"bajo",      label:"Bajo stock",     desc:"≤ punto de reposición",        count: low.length,  color:"#C98A3B", bg:"rgba(201,138,59,.10)" },
    { id:"sobre",     label:"Sobrestockeado", desc:"+8× sobre mínimo, poca rotación", count: dead.length, color:"#7A4E7E", bg:"rgba(122,78,126,.08)" },
    { id:"nuevo",     label:"Nueva colección", desc:"Llegados recientemente",        count: fresh.length, color:"#3F5A3D", bg:"rgba(63,90,61,.08)" },
  ];

  return (
    <div className="panel" style={{ marginBottom:18 }}>
      <div className="panel-head">
        <div>
          <h2 className="panel-title" style={{ fontSize:16 }}>¿Qué tengo que mover?</h2>
          <div className="panel-sub" style={{ marginTop:3 }}>CLICK PARA FILTRAR EL CATÁLOGO</div>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", borderTop:"1px solid var(--paper-3)" }}>
        {cards.map((c, i) => {
          const isOn = active === c.id;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(isOn ? null : c.id)}
              style={{
                padding:"18px 16px", textAlign:"left",
                background: isOn ? c.bg : "var(--paper)",
                borderRight: i < cards.length-1 ? "1px solid var(--paper-3)" : "none",
                borderBottom: isOn ? `2px solid ${c.color}` : "2px solid transparent",
                border:"none", borderLeft:"none", borderTop:"none",
                cursor:"pointer", transition:"background .15s",
              }}
              onMouseEnter={(e) => { if (!isOn) e.currentTarget.style.background = "var(--paper-2)"; }}
              onMouseLeave={(e) => { if (!isOn) e.currentTarget.style.background = "var(--paper)"; }}
            >
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                <span style={{ width:8, height:8, borderRadius:50, background:c.color }}></span>
                <span style={{ fontFamily:"var(--font-mono)", fontSize:9.5, letterSpacing:".12em", textTransform:"uppercase", color:"var(--ink-3)" }}>{c.label}</span>
              </div>
              <div style={{ fontFamily:"var(--font-display)", fontSize:32, fontWeight:500, color:c.color, letterSpacing:"-0.02em", lineHeight:1 }}>{c.count}</div>
              <div style={{ fontSize:10.5, color:"var(--ink-3)", marginTop:6, fontStyle:"italic", lineHeight:1.3 }}>{c.desc}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// VISTA TABLA DENSA
// ─────────────────────────────────────────────────────────────
function StockTable({ products, selection, toggleSelection, onOpen }) {
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const sorted = [...products].sort((a,b) => {
    let av = a[sortKey], bv = b[sortKey];
    if (typeof av === "string") { av = av.toLowerCase(); bv = bv.toLowerCase(); }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });
  const tog = (k) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  };
  const Th = ({ k, children, align }) => (
    <th onClick={()=>tog(k)} style={{ textAlign: align || "left", padding:"10px 12px", cursor:"pointer", fontFamily:"var(--font-mono)", fontSize:10, color:"var(--ink-3)", letterSpacing:".1em", textTransform:"uppercase", borderBottom:"1px solid var(--line)", userSelect:"none" }}>
      {children} {sortKey === k && <span>{sortDir === "asc" ? "▲" : "▼"}</span>}
    </th>
  );
  return (
    <div className="panel" style={{ overflow:"hidden" }}>
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"var(--paper-2)" }}>
              <th style={{ width:48 }}></th>
              <Th k="name">Producto</Th>
              <Th k="sku">SKU</Th>
              <Th k="brand">Marca</Th>
              <Th k="type">Tipo</Th>
              <Th k="stock" align="right">Stock</Th>
              <Th k="price" align="right">Precio</Th>
              <th style={{ padding:"10px 12px", fontFamily:"var(--font-mono)", fontSize:10, color:"var(--ink-3)", letterSpacing:".1em", textTransform:"uppercase", borderBottom:"1px solid var(--line)" }}>Estado</th>
              <th style={{ width:60, padding:"10px 12px", borderBottom:"1px solid var(--line)" }}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => {
              const st = stockState(p);
              const brand = brandById(p.brand);
              const isSel = selection.includes(p.id);
              return (
                <tr key={p.id} onClick={()=>onOpen(p)} style={{ cursor:"pointer", borderBottom:"1px solid var(--paper-3)", background: isSel ? "rgba(181,70,42,.04)" : "transparent" }}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--paper-2)"}
                    onMouseLeave={e=>e.currentTarget.style.background=isSel ? "rgba(181,70,42,.04)" : "transparent"}>
                  <td style={{ padding:"8px 12px" }}>
                    <div style={{ width:36, height:36, borderRadius:6, overflow:"hidden", background:"var(--paper-2)" }}>
                      <img src={p.img} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                    </div>
                  </td>
                  <td style={{ padding:"8px 12px", fontWeight:500 }}>
                    {p.name}
                    {p.isNew && <span style={{ marginLeft:8, fontFamily:"var(--font-mono)", fontSize:9, padding:"2px 6px", background:"var(--ink)", color:"var(--paper)", borderRadius:3 }}>NUEVO</span>}
                    {p.isBestseller && <span style={{ marginLeft:6, fontFamily:"var(--font-mono)", fontSize:9, padding:"2px 6px", background:"#C98A3B", color:"#fff", borderRadius:3 }}>TOP</span>}
                  </td>
                  <td style={{ padding:"8px 12px", fontFamily:"var(--font-mono)", fontSize:11, color:"var(--ink-2)" }}>{p.sku}</td>
                  <td style={{ padding:"8px 12px" }}>
                    <span style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
                      <span style={{ width:6, height:6, borderRadius:50, background:brand?.color }}></span>
                      <span style={{ fontSize:12 }}>{brand?.name}</span>
                    </span>
                  </td>
                  <td style={{ padding:"8px 12px", fontSize:12 }}>{p.type}</td>
                  <td style={{ padding:"8px 12px", textAlign:"right", fontFamily:"var(--font-mono)", fontVariantNumeric:"tabular-nums", fontWeight:500, color:st.color }}>{p.stock}</td>
                  <td style={{ padding:"8px 12px", textAlign:"right", fontFamily:"var(--font-mono)", fontVariantNumeric:"tabular-nums" }}>{stkFmt(p.price)}</td>
                  <td style={{ padding:"8px 12px" }}>
                    <span style={{ fontFamily:"var(--font-mono)", fontSize:10, padding:"3px 8px", borderRadius:3, background:st.bg, color:st.color, fontWeight:500 }}>{st.label}</span>
                  </td>
                  <td style={{ padding:"8px 12px", textAlign:"right" }} onClick={e=>{ e.stopPropagation(); toggleSelection(p.id); }}>
                    <button style={{ width:26, height:26, borderRadius:50, background: isSel ? "var(--ink)" : "transparent", color: isSel ? "var(--paper)" : "var(--ink-3)", border:"1px solid " + (isSel ? "var(--ink)" : "var(--line)"), cursor:"pointer", fontSize:14, fontWeight:600 }}>{isSel ? "✓" : "+"}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ViewStock({ openCatalogBuilder, selection, toggleSelection, clientFilter, clearClientFilter }) {
  const [brand, setBrand]   = useState("all");
  const [type, setType]     = useState("all");
  const [stockF, setStockF] = useState("all");
  const [q, setQ]           = useState("");
  const [openProd, setOpenProd] = useState(null);
  const [layout, setLayout] = useState("grid");  // grid | table
  const [mobile, setMobile] = useState(false);   // modo tienda física

  const types = useMemo(() => {
    const s = new Set();
    PRODUCTS.forEach(p => s.add(p.type));
    return [...s];
  }, []);

  // Si hay un cliente filtrando, sus marcas favoritas
  const clientBrands = clientFilter ? clientFilter.brands || [] : null;

  const filtered = useMemo(() => PRODUCTS.filter(p => {
    if (brand !== "all" && p.brand !== brand) return false;
    if (type !== "all"  && p.type  !== type) return false;
    if (stockF === "bajo"    && (p.stock === 0 || p.stock > p.lowStock)) return false;
    if (stockF === "agotado" && p.stock !== 0) return false;
    if (stockF === "sobre"   && p.stock <= p.lowStock * 8) return false;
    if (stockF === "nuevo"   && !p.isNew) return false;
    if (stockF === "top"     && !p.isBestseller) return false;
    if (clientBrands && clientBrands.length && !clientBrands.includes(p.brand)) return false;
    if (q) {
      const s = q.toLowerCase();
      if (!p.name.toLowerCase().includes(s) && !p.sku.toLowerCase().includes(s)) return false;
    }
    return true;
  }), [brand, type, stockF, q, clientFilter]);

  const totalUnits = PRODUCTS.reduce((a,p)=>a+p.stock, 0);
  const lowCount   = PRODUCTS.filter(p => p.stock <= p.lowStock && p.stock > 0).length;
  const outCount   = PRODUCTS.filter(p => p.stock === 0).length;
  const totalValue = PRODUCTS.reduce((a,p)=>a+p.stock*p.price, 0);

  return (
    <>
      <div className="page-head">
        <div style={{ position:"relative" }}>
          <div className="editorial-mark" style={{ left:-20, top:-28 }}>Stock</div>
          <h1 className="page-title">Catálogo de <em>productos</em></h1>
          <div className="page-sub">{PRODUCTS.length} productos · {totalUnits.toLocaleString("es-PE")} unidades · valor inventario {stkFmt(totalValue)}</div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {/* Toggle vista */}
          <div style={{ display:"flex", gap:0, background:"var(--paper-2)", border:"1px solid var(--line)", borderRadius:8, padding:2 }}>
            <button onClick={()=>setLayout("grid")} title="Vista grilla con fotos" style={{ padding:"6px 10px", border:"none", background: layout==="grid" ? "var(--ink)" : "transparent", color: layout==="grid" ? "var(--paper)" : "var(--ink-3)", borderRadius:6, cursor:"pointer", display:"grid", placeItems:"center" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            </button>
            <button onClick={()=>setLayout("table")} title="Vista tabla densa" style={{ padding:"6px 10px", border:"none", background: layout==="table" ? "var(--ink)" : "transparent", color: layout==="table" ? "var(--paper)" : "var(--ink-3)", borderRadius:6, cursor:"pointer", display:"grid", placeItems:"center" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <button onClick={()=>setMobile(m=>!m)} title="Modo tienda física" style={{ padding:"6px 10px", border:"none", background: mobile ? "var(--ink)" : "transparent", color: mobile ? "var(--paper)" : "var(--ink-3)", borderRadius:6, cursor:"pointer", display:"grid", placeItems:"center" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="7" y="2" width="10" height="20" rx="2"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
            </button>
          </div>
          {selection.length > 0 && (
            <button className="btn btn-primary" onClick={openCatalogBuilder}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
              </svg>
              Generar catálogo · {selection.length}
            </button>
          )}
        </div>
      </div>

      {clientFilter && (
        <div style={{ marginBottom:16, padding:"12px 16px", background:"rgba(181,70,42,.06)", border:"1px solid rgba(181,70,42,.15)", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--clay)", letterSpacing:".1em", textTransform:"uppercase" }}>Mostrando disponibilidad para</div>
            <div style={{ fontWeight:500, marginTop:2 }}>{clientFilter.name} · {clientFilter.brands?.map(bid => brandById(bid)?.name).filter(Boolean).join(" · ")}</div>
          </div>
          <button className="btn btn-ghost" onClick={clearClientFilter}>Limpiar filtro</button>
        </div>
      )}

      <RestockPanel active={stockF !== "all" ? stockF : null} onSelect={(id)=>setStockF(id || "all")} />

      {/* Filtros */}
      <div className="panel" style={{ marginBottom:18 }}>
        <div style={{ padding:"14px 18px", display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
          <input
            placeholder="Buscar por nombre o SKU…"
            value={q}
            onChange={(e)=>setQ(e.target.value)}
            className="search"
            style={{ paddingLeft:14, flex:"1 1 240px", minWidth:240 }}
          />
          <select className="filter-select" value={brand} onChange={(e)=>setBrand(e.target.value)}>
            <option value="all">Todas las marcas</option>
            {STK_BRANDS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select className="filter-select" value={type} onChange={(e)=>setType(e.target.value)}>
            <option value="all">Todos los tipos</option>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="filter-select" value={stockF} onChange={(e)=>setStockF(e.target.value)}>
            <option value="all">Todo el stock</option>
            <option value="bajo">Bajo stock</option>
            <option value="agotado">Agotados</option>
            <option value="nuevo">Solo nuevos</option>
            <option value="top">Solo top venta</option>
          </select>
        </div>
      </div>

      {/* Render */}
      {layout === "grid" ? (
        <div style={{ display:"grid", gridTemplateColumns: mobile ? "repeat(2, 1fr)" : "repeat(auto-fill, minmax(220px, 1fr))", gap: mobile ? 10 : 16, maxWidth: mobile ? 420 : "none", margin: mobile ? "0 auto" : "0" }}>
          {filtered.map(p => (
            <ProductCard
              key={p.id}
              p={p}
              selected={selection.includes(p.id)}
              onToggle={() => toggleSelection(p.id)}
              onOpen={setOpenProd}
              compact={mobile}
            />
          ))}
          {filtered.length === 0 && (
            <div style={{ gridColumn:"1/-1", padding:60, textAlign:"center", color:"var(--ink-3)", fontStyle:"italic" }}>
              No se encontraron productos con esos filtros.
            </div>
          )}
        </div>
      ) : (
        <StockTable products={filtered} selection={selection} toggleSelection={toggleSelection} onOpen={setOpenProd} />
      )}

      {openProd && <ProductDetail p={openProd} onClose={()=>setOpenProd(null)} selected={selection.includes(openProd.id)} onToggle={()=>toggleSelection(openProd.id)} />}
    </>
  );
}

function KpiBox({ label, value, sub, tone }) {
  const color = tone === "warn" ? "#C98A3B" : tone === "danger" ? "#A8351F" : "var(--ink)";
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color }}>{value}</div>
      <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--ink-3)", marginTop:6, letterSpacing:".06em", textTransform:"uppercase" }}>{sub}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PRODUCT DETAIL DRAWER
// ─────────────────────────────────────────────────────────────
function ProductDetail({ p, onClose, selected, onToggle }) {
  const st = stockState(p);
  const brand = brandById(p.brand);
  return (
    <>
      <div className="drawer-scrim" onClick={onClose}></div>
      <aside className="drawer" style={{ width: 520 }}>
        <div className="drawer-head">
          <div>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--ink-3)", letterSpacing:".12em", textTransform:"uppercase" }}>
              {brand?.name} · {p.sku}
            </div>
            <div style={{ fontFamily:"var(--font-display)", fontSize:24, fontWeight:500, marginTop:4 }}>{p.name}</div>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        <div className="drawer-body" style={{ padding:"0 24px 24px" }}>
          <div style={{ background:"var(--paper-2)", aspectRatio:"1/1", display:"grid", placeItems:"center", borderRadius:12, marginBottom:20, overflow:"hidden" }}>
            <img src={p.img} alt={p.name} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
          </div>

          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:18 }}>
            <div>
              <div style={{ fontFamily:"var(--font-display)", fontSize:32, fontWeight:500 }}>{stkFmt(p.price)}</div>
              <div style={{ fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--ink-3)" }}>POR MAYOR · COSTO {stkFmt(p.cost)} · MARGEN {Math.round((p.price-p.cost)/p.price*100)}%</div>
            </div>
            <button
              className={selected ? "btn btn-ghost" : "btn btn-primary"}
              onClick={onToggle}
            >
              {selected ? "✓ Agregado al catálogo" : "+ Agregar al catálogo"}
            </button>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:18 }}>
            <div style={{ padding:"12px 14px", background:"var(--paper-2)", borderRadius:10 }}>
              <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--ink-3)", letterSpacing:".1em", textTransform:"uppercase", marginBottom:4 }}>Stock</div>
              <div style={{ fontFamily:"var(--font-display)", fontSize:24, fontWeight:500, color:st.color }}>{p.stock} u.</div>
              <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--ink-3)", marginTop:2 }}>Mínimo: {p.lowStock}</div>
            </div>
            <div style={{ padding:"12px 14px", background:"var(--paper-2)", borderRadius:10 }}>
              <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--ink-3)", letterSpacing:".1em", textTransform:"uppercase", marginBottom:4 }}>Temporada</div>
              <div style={{ fontSize:14, fontWeight:500, marginTop:4 }}>{p.season}</div>
              <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--ink-3)", marginTop:6 }}>{p.type}</div>
            </div>
          </div>

          {/* Matriz talla × color */}
          <div style={{ marginBottom:18 }}>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--ink-3)", letterSpacing:".1em", textTransform:"uppercase", marginBottom:8 }}>Stock por talla y color</div>
            <div style={{ overflowX:"auto", border:"1px solid var(--paper-3)", borderRadius:8 }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11.5 }}>
                <thead>
                  <tr style={{ background:"var(--paper-2)" }}>
                    <th style={{ padding:"8px 10px", textAlign:"left", fontFamily:"var(--font-mono)", fontSize:10, color:"var(--ink-3)", letterSpacing:".08em", textTransform:"uppercase", borderBottom:"1px solid var(--paper-3)" }}>Color</th>
                    {p.sizes.map(s => <th key={s} style={{ padding:"8px 10px", textAlign:"center", fontFamily:"var(--font-mono)", fontSize:10, color:"var(--ink-3)", letterSpacing:".08em", borderBottom:"1px solid var(--paper-3)" }}>{s}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {p.colors.map(cid => {
                    const c = colorById(cid);
                    if (!c) return null;
                    return (
                      <tr key={cid}>
                        <td style={{ padding:"6px 10px", borderBottom:"1px solid var(--paper-3)" }}>
                          <span style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
                            <span style={{ width:14, height:14, borderRadius:50, background:c.hex, border:"1px solid rgba(0,0,0,.1)" }}></span>
                            {c.label}
                          </span>
                        </td>
                        {p.sizes.map(s => {
                          const cell = stockMatrix(p).find(m => m.color === cid && m.size === s);
                          const qty = cell ? cell.qty : 0;
                          const tone = qty === 0 ? { bg:"rgba(168,53,31,.08)", color:"#A8351F" } : qty <= 3 ? { bg:"rgba(201,138,59,.10)", color:"#C98A3B" } : { bg:"transparent", color:"var(--ink)" };
                          return (
                            <td key={s} style={{ padding:"6px 10px", textAlign:"center", borderBottom:"1px solid var(--paper-3)", fontFamily:"var(--font-mono)", fontVariantNumeric:"tabular-nums", background:tone.bg, color:tone.color, fontWeight: qty <= 3 ? 600 : 400 }}>
                              {qty === 0 ? "—" : qty}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize:10.5, color:"var(--ink-3)", marginTop:6, fontStyle:"italic" }}>Rojo = agotado · Ámbar = ≤3 unidades</div>
          </div>

          <div style={{ marginBottom:18 }}>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--ink-3)", letterSpacing:".1em", textTransform:"uppercase", marginBottom:8 }}>Colores disponibles</div>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
              {p.colors.map(cid => {
                const c = colorById(cid);
                if (!c) return null;
                return (
                  <div key={cid} style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 10px 4px 4px", background:"var(--paper-2)", borderRadius:50 }}>
                    <span style={{ width:18, height:18, borderRadius:50, background:c.hex, border:"1px solid rgba(0,0,0,.1)" }}></span>
                    <span style={{ fontSize:12 }}>{c.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--ink-3)", letterSpacing:".1em", textTransform:"uppercase", marginBottom:8 }}>Tallas</div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {p.sizes.map(s => (
                <span key={s} style={{ padding:"6px 12px", border:"1px solid var(--line)", borderRadius:6, fontFamily:"var(--font-mono)", fontSize:11 }}>{s}</span>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// CATALOG BUILDER — generador de plantilla
// ─────────────────────────────────────────────────────────────
function CatalogBuilder({ selection, clearSelection, removeFromSelection, onClose }) {
  const [tpl, setTpl] = useState("grid");
  const [client, setClient] = useState("");
  const [title, setTitle] = useState("Catálogo Hilo Andino");
  const [subtitle, setSubtitle] = useState("Octubre 2026 · Por mayor");
  const [showPrice, setShowPrice] = useState(true);
  const [showStock, setShowStock] = useState(false);
  const [accent, setAccent] = useState("#3F2914");
  const [intro, setIntro] = useState("¡Hola! Te comparto la selección que prometí. Cualquier duda me avisas y armamos el pedido por WhatsApp.");

  const items = PRODUCTS.filter(p => selection.includes(p.id));

  const tplOptions = [
    { id:"grid",     label:"Cuadrícula 3×",  desc:"Ideal para WhatsApp" },
    { id:"list",     label:"Lista detalle",  desc:"Con tallas y colores" },
    { id:"editorial",label:"Editorial",      desc:"Producto destacado" },
  ];

  const sendWA = () => {
    const c = STK_CLIENTS.find(x => x.id === client);
    const lines = [
      `*${title}*`,
      subtitle,
      "",
      intro,
      "",
      ...items.map(p => `• ${p.name} (${p.sku})${showPrice ? ` — ${stkFmt(p.price)}` : ""}${showStock ? ` · ${p.stock} u.` : ""}`),
      "",
      "Saludos,",
      "Diego · Hilo Andino",
    ].join("\n");
    if (c) {
      alert(`📱 WhatsApp a ${c.name}\n\n${lines}`);
    } else {
      alert(`📱 Plantilla generada\n\n${lines}`);
    }
  };

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} style={{ background:"rgba(20,12,8,.55)" }}></div>
      <div style={{
        position:"fixed", inset:"40px", zIndex:60,
        background:"var(--paper)", borderRadius:14,
        boxShadow:"0 20px 60px rgba(20,12,8,.30)",
        display:"grid", gridTemplateColumns:"360px 1fr",
        overflow:"hidden",
      }}>
        {/* PANEL CONFIGURACIÓN */}
        <div style={{ padding:24, borderRight:"1px solid var(--paper-3)", overflowY:"auto", background:"var(--paper-2)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18 }}>
            <div>
              <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--ink-3)", letterSpacing:".12em", textTransform:"uppercase" }}>Generador</div>
              <div style={{ fontFamily:"var(--font-display)", fontSize:22, fontWeight:500, marginTop:2 }}>Catálogo</div>
            </div>
            <button className="drawer-close" onClick={onClose}>×</button>
          </div>

          <BuilderField label="Plantilla">
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {tplOptions.map(o => (
                <button
                  key={o.id}
                  onClick={()=>setTpl(o.id)}
                  style={{
                    padding:"10px 12px", textAlign:"left",
                    background: tpl===o.id ? "var(--ink)" : "var(--paper)",
                    color: tpl===o.id ? "var(--paper)" : "var(--ink)",
                    border:"1px solid " + (tpl===o.id ? "var(--ink)" : "var(--line)"),
                    borderRadius:8, cursor:"pointer",
                  }}
                >
                  <div style={{ fontWeight:500, fontSize:13 }}>{o.label}</div>
                  <div style={{ fontSize:11, opacity:.7, marginTop:2 }}>{o.desc}</div>
                </button>
              ))}
            </div>
          </BuilderField>

          <BuilderField label="Cliente destino">
            <select className="filter-select" value={client} onChange={(e)=>setClient(e.target.value)} style={{ width:"100%" }}>
              <option value="">— Sin cliente específico —</option>
              {STK_CLIENTS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </BuilderField>

          <BuilderField label="Título">
            <input className="search" value={title} onChange={(e)=>setTitle(e.target.value)} style={{ width:"100%", paddingLeft:12 }} />
          </BuilderField>
          <BuilderField label="Subtítulo">
            <input className="search" value={subtitle} onChange={(e)=>setSubtitle(e.target.value)} style={{ width:"100%", paddingLeft:12 }} />
          </BuilderField>
          <BuilderField label="Mensaje al cliente">
            <textarea
              value={intro}
              onChange={(e)=>setIntro(e.target.value)}
              rows={3}
              style={{ width:"100%", padding:10, fontFamily:"inherit", fontSize:12, border:"1px solid var(--line)", borderRadius:8, background:"var(--paper)", resize:"vertical" }}
            />
          </BuilderField>

          <BuilderField label="Color de acento">
            <div style={{ display:"flex", gap:6 }}>
              {["#3F2914","#B5462A","#3F5A3D","#7A4E7E","#2A6FDB","#C98A3B"].map(c => (
                <button key={c} onClick={()=>setAccent(c)} style={{
                  width:30, height:30, borderRadius:50, background:c,
                  border: accent===c ? "2px solid var(--ink)" : "1px solid var(--line)",
                  cursor:"pointer",
                }} />
              ))}
            </div>
          </BuilderField>

          <BuilderField label="Mostrar">
            <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:12.5, cursor:"pointer", padding:"4px 0" }}>
              <input type="checkbox" checked={showPrice} onChange={(e)=>setShowPrice(e.target.checked)} /> Precios por mayor
            </label>
            <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:12.5, cursor:"pointer", padding:"4px 0" }}>
              <input type="checkbox" checked={showStock} onChange={(e)=>setShowStock(e.target.checked)} /> Stock disponible
            </label>
          </BuilderField>

          <div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:24, paddingTop:16, borderTop:"1px solid var(--paper-3)" }}>
            <button className="btn btn-primary" onClick={sendWA} style={{ justifyContent:"center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
              </svg>
              Enviar por WhatsApp
            </button>
            <button className="btn btn-ghost" style={{ justifyContent:"center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
              </svg>
              Descargar PDF
            </button>
            <button className="btn btn-ghost" onClick={()=>{ if(confirm("Vaciar selección?")) clearSelection(); }} style={{ justifyContent:"center", color:"#A8351F" }}>
              Vaciar selección
            </button>
          </div>
        </div>

        {/* PREVIEW */}
        <div style={{ overflowY:"auto", background:"#E8E2D6", padding:32 }}>
          <div style={{ maxWidth: 720, margin:"0 auto", background:"var(--paper)", borderRadius:6, boxShadow:"0 8px 24px rgba(20,12,8,.10)", overflow:"hidden" }}>
            {/* Header */}
            <div style={{ padding:"32px 32px 24px", borderBottom:`3px solid ${accent}` }}>
              <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--ink-3)", letterSpacing:".15em", textTransform:"uppercase", marginBottom:6 }}>Hilo Andino · Catálogo</div>
              <div style={{ fontFamily:"var(--font-display)", fontSize:36, fontWeight:500, color:accent, lineHeight:1.05, letterSpacing:"-0.02em" }}>{title}</div>
              <div style={{ fontFamily:"var(--font-display)", fontSize:14, color:"var(--ink-2)", marginTop:6, fontStyle:"italic" }}>{subtitle}</div>
              {client && (
                <div style={{ marginTop:14, fontSize:12, color:"var(--ink-2)" }}>Para: <strong>{STK_CLIENTS.find(c=>c.id===client)?.name}</strong></div>
              )}
              <div style={{ marginTop:14, fontSize:13, color:"var(--ink-2)", lineHeight:1.5, fontStyle:"italic" }}>{intro}</div>
            </div>

            {/* Items */}
            <div style={{ padding: tpl === "grid" ? "20px 24px" : "0", background:"var(--paper)" }}>
              {items.length === 0 && (
                <div style={{ padding:60, textAlign:"center", color:"var(--ink-3)", fontStyle:"italic" }}>
                  Selecciona productos del stock para armar el catálogo.
                </div>
              )}

              {tpl === "grid" && (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14 }}>
                  {items.map(p => (
                    <CatalogItemGrid key={p.id} p={p} accent={accent} showPrice={showPrice} showStock={showStock} onRemove={()=>removeFromSelection(p.id)} />
                  ))}
                </div>
              )}

              {tpl === "list" && (
                <div>
                  {items.map((p, i) => (
                    <CatalogItemList key={p.id} p={p} accent={accent} showPrice={showPrice} showStock={showStock} idx={i+1} onRemove={()=>removeFromSelection(p.id)} />
                  ))}
                </div>
              )}

              {tpl === "editorial" && (
                <div>
                  {items.map((p, i) => (
                    <CatalogItemEditorial key={p.id} p={p} accent={accent} showPrice={showPrice} showStock={showStock} flip={i % 2 === 1} onRemove={()=>removeFromSelection(p.id)} />
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding:"22px 32px", background:accent, color:"#F0EDE5", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:500 }}>Hilo Andino</div>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:10, opacity:.8, letterSpacing:".1em", textTransform:"uppercase", marginTop:2 }}>Ropa por mayor · Lima, Perú</div>
              </div>
              <div style={{ textAlign:"right", fontFamily:"var(--font-mono)", fontSize:11, opacity:.85 }}>
                <div>Diego R. · ventas</div>
                <div>+51 999 000 111</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function BuilderField({ label, children }) {
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--ink-3)", letterSpacing:".1em", textTransform:"uppercase", marginBottom:6 }}>{label}</div>
      {children}
    </div>
  );
}

// Catalog item — grid format
function CatalogItemGrid({ p, accent, showPrice, showStock, onRemove }) {
  const brand = brandById(p.brand);
  return (
    <div style={{ position:"relative", group:"true" }} onMouseEnter={(e)=>{ e.currentTarget.querySelector('.cat-rm').style.opacity = 1; }} onMouseLeave={(e)=>{ e.currentTarget.querySelector('.cat-rm').style.opacity = 0; }}>
      <button className="cat-rm" onClick={onRemove} style={{ opacity:0, transition:"opacity .15s", position:"absolute", top:6, right:6, zIndex:2, width:22, height:22, borderRadius:50, background:"rgba(255,255,255,.92)", border:"1px solid var(--line)", cursor:"pointer", fontSize:14, lineHeight:1, display:"grid", placeItems:"center" }}>×</button>
      <div style={{ background:"var(--paper-2)", aspectRatio:"1/1.1", overflow:"hidden", borderRadius:4 }}>
        <img src={p.img} alt={p.name} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
      </div>
      <div style={{ marginTop:8 }}>
        <div style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--ink-3)", letterSpacing:".1em", textTransform:"uppercase" }}>{brand?.name}</div>
        <div style={{ fontFamily:"var(--font-display)", fontSize:14, fontWeight:500, marginTop:2, lineHeight:1.2 }}>{p.name}</div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:6 }}>
          <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--ink-3)" }}>{p.sku}</div>
          {showPrice && <div style={{ fontFamily:"var(--font-display)", fontSize:14, fontWeight:500, color:accent }}>{stkFmt(p.price)}</div>}
        </div>
        <div style={{ display:"flex", gap:3, marginTop:6 }}>
          {p.colors.slice(0,5).map(cid => { const c = colorById(cid); return c ? <span key={cid} style={{ width:10, height:10, borderRadius:50, background:c.hex, border:"1px solid rgba(0,0,0,.1)" }}></span> : null; })}
        </div>
        {showStock && <div style={{ fontFamily:"var(--font-mono)", fontSize:9.5, color:"var(--ink-3)", marginTop:4 }}>{p.stock} u. disponibles</div>}
      </div>
    </div>
  );
}

function CatalogItemList({ p, accent, showPrice, showStock, idx, onRemove }) {
  const brand = brandById(p.brand);
  return (
    <div style={{ display:"grid", gridTemplateColumns:"110px 1fr auto", gap:18, padding:"18px 28px", borderBottom:"1px solid var(--paper-3)", position:"relative" }}>
      <button onClick={onRemove} style={{ position:"absolute", top:10, right:10, width:22, height:22, borderRadius:50, background:"transparent", border:"none", color:"var(--ink-3)", cursor:"pointer", fontSize:14, lineHeight:1 }}>×</button>
      <div style={{ background:"var(--paper-2)", aspectRatio:"1/1", overflow:"hidden", borderRadius:4 }}>
        <img src={p.img} alt={p.name} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
      </div>
      <div>
        <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
          <span style={{ fontFamily:"var(--font-mono)", fontSize:11, color:accent, fontWeight:600 }}>{String(idx).padStart(2,"0")}</span>
          <span style={{ fontFamily:"var(--font-mono)", fontSize:9.5, color:"var(--ink-3)", letterSpacing:".1em", textTransform:"uppercase" }}>{brand?.name}</span>
        </div>
        <div style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:500, marginTop:4 }}>{p.name}</div>
        <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--ink-3)", marginTop:2 }}>{p.sku} · {p.type} · {p.season}</div>
        <div style={{ display:"flex", gap:14, marginTop:10, fontSize:11.5, color:"var(--ink-2)" }}>
          <div>
            <span style={{ fontFamily:"var(--font-mono)", fontSize:9.5, color:"var(--ink-3)", letterSpacing:".1em", textTransform:"uppercase" }}>Tallas: </span>
            {p.sizes.join(" · ")}
          </div>
        </div>
        <div style={{ display:"flex", gap:6, marginTop:8, alignItems:"center" }}>
          <span style={{ fontFamily:"var(--font-mono)", fontSize:9.5, color:"var(--ink-3)", letterSpacing:".1em", textTransform:"uppercase" }}>Colores:</span>
          {p.colors.map(cid => { const c = colorById(cid); return c ? <span key={cid} title={c.label} style={{ width:14, height:14, borderRadius:50, background:c.hex, border:"1px solid rgba(0,0,0,.1)" }}></span> : null; })}
        </div>
      </div>
      <div style={{ textAlign:"right" }}>
        {showPrice && <div style={{ fontFamily:"var(--font-display)", fontSize:24, fontWeight:500, color:accent }}>{stkFmt(p.price)}</div>}
        {showPrice && <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--ink-3)" }}>POR MAYOR</div>}
        {showStock && <div style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--ink-2)", marginTop:8 }}>{p.stock} u.</div>}
      </div>
    </div>
  );
}

function CatalogItemEditorial({ p, accent, showPrice, showStock, flip, onRemove }) {
  const brand = brandById(p.brand);
  const meta = (
    <div style={{ padding:"32px 28px", display:"flex", flexDirection:"column", justifyContent:"center" }}>
      <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--ink-3)", letterSpacing:".15em", textTransform:"uppercase" }}>{brand?.name}</div>
      <div style={{ fontFamily:"var(--font-display)", fontSize:30, fontWeight:500, marginTop:6, color:accent, letterSpacing:"-0.02em", lineHeight:1.05 }}>{p.name}</div>
      <div style={{ fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--ink-3)", marginTop:8 }}>{p.sku} · {p.type}</div>
      {showPrice && <div style={{ fontFamily:"var(--font-display)", fontSize:32, fontWeight:500, marginTop:18 }}>{stkFmt(p.price)}</div>}
      <div style={{ display:"flex", gap:6, marginTop:14, alignItems:"center" }}>
        {p.colors.map(cid => { const c = colorById(cid); return c ? <span key={cid} title={c.label} style={{ width:16, height:16, borderRadius:50, background:c.hex, border:"1px solid rgba(0,0,0,.1)" }}></span> : null; })}
      </div>
      <div style={{ marginTop:12, fontSize:11.5, color:"var(--ink-2)", fontStyle:"italic" }}>Tallas: {p.sizes.join(" · ")}</div>
      {showStock && <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--ink-3)", marginTop:6 }}>{p.stock} u. disponibles</div>}
    </div>
  );
  const photo = (
    <div style={{ background:"var(--paper-2)", overflow:"hidden" }}>
      <img src={p.img} alt={p.name} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
    </div>
  );
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", borderBottom:"1px solid var(--paper-3)", position:"relative", minHeight: 320 }}>
      <button onClick={onRemove} style={{ position:"absolute", top:10, right:10, zIndex:3, width:22, height:22, borderRadius:50, background:"rgba(255,255,255,.92)", border:"1px solid var(--line)", cursor:"pointer", fontSize:14, lineHeight:1 }}>×</button>
      {flip ? <>{meta}{photo}</> : <>{photo}{meta}</>}
    </div>
  );
}

window.HiloStock = { ViewStock, CatalogBuilder };
