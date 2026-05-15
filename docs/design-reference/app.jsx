// ============================================================
// APP SHELL
// ============================================================
const { ViewToday, ViewClients, ViewMap, ViewAnalytics, ViewAutomations, ViewTeam, ViewImport, ViewTemplates, ViewOpportunities, ViewCampaigns, ViewProducts, ViewTeamV2, ViewMapV2, ViewPipeline, ViewCredit, ViewCalendar, ViewGroups } = window.Views;
const { GlobalSearch, GroupDrawer } = window.HiloExtras;
const { ViewStock, CatalogBuilder } = window.HiloStock;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#B5462A",
  "density": "comfortable",
  "role": "vendedor",
  "theme": "minimal"
}/*EDITMODE-END*/;

function App() {
  const [view, setView] = useState("today");
  const [openId, setOpenId] = useState(null);
  const [openGroupId, setOpenGroupId] = useState(null);
  const [qfClient, setQfClient] = useState(null);
  const [toast, setToast] = useState(null);
  const [selection, setSelection] = useState([]);
  const [showBuilder, setShowBuilder] = useState(false);
  const [stockClientFilter, setStockClientFilter] = useState(null);

  const toggleSelection = (id) => setSelection(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const removeFromSelection = (id) => setSelection(s => s.filter(x => x !== id));
  const clearSelection = () => { setSelection([]); setShowBuilder(false); };

  useEffect(() => {
    window.__openClient = (id) => setOpenId(id);
    window.__openQuickFollowup = (c) => setQfClient(c);
    window.__showStockForClient = (c) => {
      setStockClientFilter(c);
      setView("stock");
      setOpenId(null);
    };
  }, []);

  const handleQfSave = ({ clientId, result, note, nextDays }) => {
    const opt = window.RESULT_OPTIONS.find(r => r.id === result);
    if (window.__logFollowup) {
      window.__logFollowup(clientId, { emoji: opt.emoji, label: opt.label });
    }
    setToast(`✓ Registrado · próximo seguimiento en ${nextDays} ${nextDays === 1 ? "día" : "días"}`);
    setTimeout(() => setToast(null), 2600);
  };

  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  useEffect(() => {
    document.documentElement.style.setProperty("--clay", t.accent);
  }, [t.accent]);

  useEffect(() => {
    if (t.theme === "tierra") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", t.theme);
    }
  }, [t.theme]);

  const isManager = t.role === "gerente";

  // Stats rápidas para el dashboard de llamadas
  const callStats = {
    pendientesHoy: 8,
    sinRespuesta: 3,
    completadas: 12,
  };

  const navSections = [
    {
      label: "PRINCIPAL",
      items: [
        { id: "today",     icon: "today",   label: "Cola de llamadas",  badge: String(callStats.pendientesHoy) },
        { id: "pipeline",  icon: "bolt",    label: "Pipeline comercial", badge: String(window.HiloLogic.PIPELINE_ENTRIES.length) },
        { id: "ops",       icon: "sparkle", label: "Oportunidades",     badge: String(window.HiloLogic.OPPORTUNITIES.length) },
        { id: "clients",   icon: "users",   label: "Cuentas" },
        { id: "map",       icon: "map",     label: "Mapa del Perú" },
        { id: "credit",    icon: "chart",   label: "Cobranzas" },
        { id: "calendar",  icon: "today",   label: "Calendario comercial" },
        { id: "stock",     icon: "cart",    label: "Stock y catálogo",   badge: selection.length ? String(selection.length) : null },
      ],
    },
    {
      label: "ANÁLISIS",
      items: [
        { id: "analytics", icon: "chart",   label: "Indicadores" },
        { id: "products",  icon: "cart",    label: "Productos" },
        ...(isManager ? [{ id: "team", icon: "family", label: "Equipo de ventas" }] : []),
        { id: "autos",     icon: "bolt",    label: "Automatizaciones", badge: "5" },
      ],
    },
    {
      label: "HERRAMIENTAS",
      items: [
        { id: "campaigns", icon: "wa",      label: "Campañas WhatsApp" },
        { id: "templates", icon: "wa",      label: "Plantillas" },
        { id: "import",    icon: "arrow",   label: "Importar clientes" },
      ],
    },
  ];

  const ViewComponent = {
    today:     <ViewToday      openClient={setOpenId} openQuickFollowup={setQfClient} />,
    pipeline:  <ViewPipeline   openClient={setOpenId} role={t.role} />,
    ops:       <ViewOpportunities openClient={setOpenId} openQuickFollowup={setQfClient} />,
    clients:   <ViewClients    openClient={setOpenId} />,
    map:       <ViewMapV2      openClient={setOpenId} />,
    groups:    <ViewGroups     openClient={setOpenId} openGroup={setOpenGroupId} />,
    credit:    <ViewCredit     openClient={setOpenId} />,
    calendar:  <ViewCalendar />,
    stock:     <ViewStock     selection={selection} toggleSelection={toggleSelection} openCatalogBuilder={() => setShowBuilder(true)} clientFilter={stockClientFilter} clearClientFilter={() => setStockClientFilter(null)} />,
    analytics: <ViewAnalytics />,
    products:  <ViewProducts />,
    team:      <ViewTeamV2 />,
    autos:     <ViewAutomations />,
    campaigns: <ViewCampaigns />,
    templates: <ViewTemplates />,
    import:    <ViewImport />,
  }[view] || <ViewToday openClient={setOpenId} openQuickFollowup={setQfClient} />;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">Hilo<em>·</em></div>
          <span className="brand-tag">CRM B2B</span>
        </div>

        {/* Role switch */}
        <div style={{ padding: "12px 14px 4px" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4,
            background: "rgba(232,221,200,.06)", padding: 4, borderRadius: 8
          }}>
            {["vendedor", "gerente"].map(r => (
              <button key={r}
                onClick={() => setTweak("role", r)}
                style={{
                  padding: "6px 8px", border: "none", borderRadius: 6,
                  background: t.role === r ? "var(--clay)" : "transparent",
                  color: t.role === r ? "var(--paper)" : "rgba(232,221,200,.7)",
                  fontSize: 11, fontWeight: 500, cursor: "pointer",
                  fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase"
                }}>{r}</button>
            ))}
          </div>
        </div>

        {navSections.map(sec => (
          <div key={sec.label} className="nav-section">
            <div className="nav-label">{sec.label}</div>
            {sec.items.map(it => (
              <button key={it.id} className={`nav-item ${view === it.id ? "active" : ""}`} onClick={() => setView(it.id)}>
                <Icon name={it.icon} />
                <span>{it.label}</span>
                {it.badge && <span className="badge">{it.badge}</span>}
              </button>
            ))}
          </div>
        ))}

        <div style={{ flex: 1 }}></div>

        <div style={{ padding: "0 14px 14px" }}>
          <div style={{ padding: 14, borderRadius: 10, background: "rgba(232,221,200,.05)", border: "1px solid rgba(232,221,200,.08)" }}>
            <div style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 15, color: "var(--paper)", marginBottom: 6, letterSpacing: "-0.01em", lineHeight: 1.3 }}>
              "El cliente que no llamas hoy, llama a la competencia mañana."
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(232,221,200,.4)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
              — Sabiduría comercial
            </div>
          </div>
        </div>

        <div className="user-card">
          <div className="avatar">{isManager ? "RM" : window.HiloData.ME.initials}</div>
          <div className="user-meta">
            <div className="user-name">{isManager ? "Roberto M." : window.HiloData.ME.name}</div>
            <div className="user-role">{isManager ? "Gerente comercial" : window.HiloData.ME.role}</div>
          </div>
          <button className="icon-btn" style={{ width: 28, height: 28, color: "rgba(232,221,200,.7)" }}>
            <Icon name="settings" size={14} />
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="search" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))} style={{ cursor: 'pointer', textAlign: 'left' }}>
            <Icon name="search" size={16} />
            <span style={{ flex: 1, color: 'var(--ink-3)', fontSize: 13 }}>Buscar cliente, RUC, teléfono, grupo…</span>
            <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '2px 7px', border: '1px solid var(--line)', borderRadius: 4, color: 'var(--ink-3)', background: 'var(--paper-2)' }}>⌘K</kbd>
          </button>
          <div className="topbar-actions">
            <span className="sync-pill" title="Las ventas se sincronizan desde Odoo automáticamente">
              <span className="sync-dot"></span>
              ODOO 10 · sincronizado · hace 2 min
            </span>
            <button className="icon-btn"><Icon name="bell" /><span className="dot"></span></button>
            <button className="btn btn-ghost"><Icon name="sparkle" size={14}/> Asistente</button>
          </div>
        </header>

        <div className="page">
          {ViewComponent}
        </div>
      </main>

      {openId && <ClientDrawer clientId={openId} onClose={() => setOpenId(null)} />}

      {openGroupId && <GroupDrawer groupId={openGroupId} onClose={() => setOpenGroupId(null)} openClient={(id) => { setOpenGroupId(null); setOpenId(id); }} />}

      <GlobalSearch
        onOpenClient={(id) => setOpenId(id)}
        onOpenGroup={(id) => setOpenGroupId(id)}
        onNav={(v) => setView(v)}
      />

      {qfClient && (
        <QuickFollowup client={qfClient} onSave={handleQfSave} onClose={() => setQfClient(null)} />
      )}

      {showBuilder && (
        <CatalogBuilder
          selection={selection}
          clearSelection={clearSelection}
          removeFromSelection={removeFromSelection}
          onClose={() => setShowBuilder(false)}
        />
      )}

      {toast && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: "var(--ink)", color: "var(--paper)",
          padding: "12px 20px", borderRadius: 999,
          fontSize: 13, fontWeight: 500,
          boxShadow: "var(--shadow-lg)", zIndex: 100,
          animation: "qfIn .25s"
        }}>{toast}</div>
      )}

      <TweaksPanel title="Tweaks">
        <TweakSelect label="Tema visual" value={t.theme}
          options={[
            { value: "tierra",   label: "1 · Editorial Tierra (actual)" },
            { value: "minimal",  label: "2 · Minimalista Corporativo" },
            { value: "terminal", label: "3 · Operativo Denso (oscuro)" },
            { value: "saas",     label: "4 · Stripe / Vercel SaaS" },
            { value: "andino",   label: "5 · Andino Contemporáneo" },
          ]}
          onChange={(v) => setTweak("theme", v)} />
        <TweakRadio label="Rol" value={t.role} options={["vendedor", "gerente"]}
          onChange={(v) => setTweak("role", v)} />
        <TweakColor label="Acento" value={t.accent}
          options={["#B5462A", "#7A4E7E", "#3F5566", "#5C7A5A", "#C98A3B"]}
          onChange={(v) => setTweak("accent", v)} />
        <TweakRadio label="Densidad" value={t.density} options={["compact", "comfortable"]}
          onChange={(v) => setTweak("density", v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
