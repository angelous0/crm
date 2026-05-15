/**
 * Layout — shell del CRM Hilo Andino.
 *
 * Estructura:
 *   ┌──────────┬──────────────────────────┐
 *   │ Sidebar  │  Topbar                   │
 *   │ 240px    ├──────────────────────────┤
 *   │ tema     │  Page                     │
 *   │ tierra   │                           │
 *   └──────────┴──────────────────────────┘
 *
 * Roles:
 *   - admin:      ve todo
 *   - supervisor: ve casi todo (no /admin/*)
 *   - vendedora:  no ve /equipo ni /admin/*
 *
 * El TweaksPanel permite a admin/supervisor previsualizar la vista de
 * vendedora sin loguearse (el rol real viene del JWT y no cambia).
 */
import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import HiloIcon from "@/components/HiloIcons";
import TweaksPanel, { useTweaks } from "@/components/TweaksPanel";
import SyncStatusPill from "@/components/SyncStatusPill";

const QUOTES = [
  {
    text: "El cliente que no llamas hoy, llama a la competencia mañana.",
    author: "Sabiduría comercial",
  },
  {
    text: "Una venta sin seguimiento es solo una conversación.",
    author: "Manual del vendedor",
  },
  {
    text: "Conoce a tu cliente y vende menos. Sigue al cliente y vende siempre.",
    author: "Filosofía Hilo",
  },
];

// Sección de navegación. Cada item tiene un `roles` opcional con los
// roles que pueden VER el item; si no se especifica, todos lo ven.
const NAV_SECTIONS = [
  {
    label: "Principal",
    items: [
      { to: "/ventas-en-vivo", icon: "bolt", label: "Ventas en vivo", live: true },
      { to: "/cola",         icon: "today",   label: "Cola de llamadas" },
      { to: "/pipeline",     icon: "bolt",    label: "Pipeline comercial" },
      { to: "/oportunidades",icon: "sparkle", label: "Oportunidades" },
      { to: "/cuentas",            icon: "users",   label: "Cuentas" },
      { to: "/cuentas-vinculadas", icon: "users",   label: "Cuentas vinculadas" },
      { to: "/mapa",         icon: "map",     label: "Mapa del Perú" },
      { to: "/cobranzas",    icon: "chart",   label: "Cobranzas" },
      { to: "/calendario",   icon: "today",   label: "Calendario comercial" },
    ],
  },
  {
    label: "Análisis",
    items: [
      { to: "/indicadores",     icon: "chart",  label: "Indicadores" },
      { to: "/productos",       icon: "cart",   label: "Productos" },
      { to: "/equipo",          icon: "family", label: "Equipo de ventas",
        roles: ["admin", "supervisor"] },
      { to: "/automatizaciones",icon: "bolt",   label: "Automatizaciones" },
    ],
  },
  {
    label: "Herramientas",
    items: [
      { to: "/campanias",  icon: "wa",     label: "Campañas WhatsApp" },
      { to: "/plantillas", icon: "wa",     label: "Plantillas" },
      { to: "/importar",   icon: "upload", label: "Importar clientes" },
      { to: "/cuentas/calidad-datos", icon: "bolt", label: "Calidad de datos",
        roles: ["admin", "supervisor"] },
      { to: "/admin/reparto-cartera", icon: "family", label: "Reparto de cartera",
        roles: ["admin", "supervisor"] },
    ],
  },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const realRole = user?.rol || "vendedora";
  const [tweaks, setTweak] = useTweaks(user?.username);

  // Rol efectivo (preview o real). Solo admin/supervisor pueden simular vendedora.
  const effectiveRole = useMemo(() => {
    if (!tweaks.rolePreview) return realRole;
    if (realRole === "admin" || realRole === "supervisor") return tweaks.rolePreview;
    return realRole;
  }, [realRole, tweaks.rolePreview]);

  const canSee = (item) => {
    if (!item.roles) return true;
    return item.roles.includes(effectiveRole);
  };

  const handleLogout = () => { logout(); navigate("/login"); };

  // Contador de alertas de "Ventas en vivo" — poll cada 30s.
  // (antes era 10s pero la query toma ~3s y saturaba el backend; 30s alcanza
  // de sobra para un badge informativo).
  const [alertCount, setAlertCount] = useState(0);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const fetchCount = async () => {
      try {
        const r = await api.get("/cuentas/ventas-en-vivo", { params: { horas: 2 } });
        if (!cancelled) setAlertCount(r.data?.con_alerta || 0);
      } catch {}
    };
    fetchCount();
    const id = setInterval(fetchCount, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [user]);

  // Quote rotativa por día del año (estable durante el día)
  const quote = useMemo(() => {
    const day = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    return QUOTES[day % QUOTES.length];
  }, []);

  const initials = user?.iniciales
    || (user?.nombre_completo
        ? user.nombre_completo.split(/\s+/).slice(0, 2).map((s) => s[0]).join("").toUpperCase()
        : (user?.username || "U").slice(0, 2).toUpperCase());

  const displayName = user?.nombre_completo || user?.nombre || user?.username || "Usuario";
  const displayRole =
    effectiveRole === "admin" ? "Administrador"
    : effectiveRole === "supervisor" ? "Supervisor"
    : "Vendedora";

  // Búsqueda global (Cmd+K). Por ahora abrir el campo enfoca, sin overlay.
  // El overlay lo entregamos en CRM-D2.
  const onSearchClick = () => {
    // placeholder
  };

  return (
    <div className="hilo-app-shell">
      {/* ─── SIDEBAR ─── */}
      <aside className="hilo-sidebar" data-testid="sidebar">
        <div className="hilo-brand">
          <div className="hilo-brand-mark">
            Hilo<em>·</em>
          </div>
          <span className="hilo-brand-tag">CRM B2B</span>
        </div>

        {/* Switch de rol (preview, solo admin/supervisor) */}
        {(realRole === "admin" || realRole === "supervisor") && (
          <div className="hilo-role-switch">
            {[
              { value: null, label: "Real" },
              { value: "vendedora", label: "Vendedora" },
            ].map((r) => (
              <button
                key={String(r.value)}
                className={`hilo-role-btn ${tweaks.rolePreview === r.value ? "active" : ""}`}
                onClick={() => setTweak("rolePreview", r.value)}
                data-testid={`role-preview-${r.value || "real"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}

        {NAV_SECTIONS.map((section) => {
          const visibleItems = section.items.filter(canSee);
          if (visibleItems.length === 0) return null;
          return (
            <div key={section.label} className="hilo-nav-section">
              <div className="hilo-nav-label">{section.label}</div>
              {visibleItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `hilo-nav-item ${isActive ? "active" : ""}`
                  }
                  data-testid={`nav-${item.to.replace(/[^a-z0-9]/gi, "-")}`}
                >
                  <HiloIcon name={item.icon} />
                  <span>
                    {item.label}
                    {item.live && (
                      <span
                        className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 align-middle animate-pulse"
                        title="Tiempo real"
                      />
                    )}
                  </span>
                  {/* Badge dinámico para Ventas en vivo */}
                  {item.live && alertCount > 0 && (
                    <span
                      className="hilo-nav-badge"
                      style={{ background: "#DC2626", color: "white" }}
                    >
                      {alertCount}
                    </span>
                  )}
                  {item.badge && <span className="hilo-nav-badge">{item.badge}</span>}
                </NavLink>
              ))}
            </div>
          );
        })}

        <div style={{ flex: 1 }} />

        <div className="hilo-quote">
          <div className="hilo-quote-text">"{quote.text}"</div>
          <div className="hilo-quote-author">— {quote.author}</div>
        </div>

        <div className="hilo-user-card">
          <div className="hilo-avatar">{initials}</div>
          <div className="hilo-user-meta">
            <div className="hilo-user-name">{displayName}</div>
            <div className="hilo-user-role">{displayRole}</div>
          </div>
          <button
            className="hilo-icon-btn"
            style={{ width: 28, height: 28, color: "var(--sidebar-fg-mute)" }}
            onClick={handleLogout}
            data-testid="logout-btn"
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <HiloIcon name="logout" size={14} />
          </button>
        </div>
      </aside>

      {/* ─── MAIN ─── */}
      <main className="hilo-main">
        <header className="hilo-topbar">
          <button
            className="hilo-search"
            onClick={onSearchClick}
            data-testid="topbar-search"
            type="button"
          >
            <HiloIcon name="search" size={16} />
            <span className="hilo-search-placeholder">
              Buscar cliente, RUC, teléfono, grupo…
            </span>
            <kbd className="hilo-search-kbd">⌘K</kbd>
          </button>

          <div className="hilo-topbar-actions">
            <SyncStatusPill />

            <button className="hilo-icon-btn" title="Notificaciones" aria-label="Notificaciones">
              <HiloIcon name="bell" />
              <span className="dot" />
            </button>

            <button className="hilo-btn hilo-btn-ghost" title="Asistente IA (próximamente)">
              <HiloIcon name="sparkle" size={14} /> Asistente
            </button>
          </div>
        </header>

        <div className="hilo-page">{children}</div>
      </main>

      <TweaksPanel
        tweaks={tweaks}
        setTweak={setTweak}
        canPreviewRole={realRole === "admin" || realRole === "supervisor"}
        realRole={realRole}
      />
    </div>
  );
}
