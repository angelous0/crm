/**
 * TweaksPanel — selector flotante de tema/rol/densidad/acento.
 *
 * Hook useTweaks: persiste en localStorage por usuario (key:
 * `crm_tweaks_<username>` si hay user, sino `crm_tweaks_anon`).
 *
 * Aplica al DOM:
 *   - <html data-theme="...">  ← cambia el tema CSS
 *   - <html data-density="..."> ← compact / comfortable
 *   - --clay (si el usuario eligió color custom)
 *
 * El selector de rol es solo visual (preview): el rol REAL viene del JWT.
 * Admin/supervisor pueden previsualizar la vista de vendedora desde aquí.
 */
import React, { useState, useEffect, useCallback } from "react";
import HiloIcon from "@/components/HiloIcons";

const THEMES = [
  { value: "minimal",  label: "Minimalista Corporativo (default)" },
  { value: "tierra",   label: "Editorial Tierra" },
  { value: "terminal", label: "Operativo Denso (oscuro)" },
  { value: "saas",     label: "Stripe / Vercel SaaS" },
  { value: "andino",   label: "Andino Contemporáneo" },
];

const ACCENTS = [
  { value: "#2A6FDB", label: "Blue" },     // Minimal default
  { value: "#B5462A", label: "Clay" },
  { value: "#7A4E7E", label: "Plum" },
  { value: "#3F5566", label: "Indigo" },
  { value: "#5C7A5A", label: "Olive" },
  { value: "#C98A3B", label: "Ochre" },
];

const DEFAULTS = {
  theme: "minimal",
  density: "comfortable",
  rolePreview: null, // null = usar rol real; string = forzar vista
  accent: "#2A6FDB",
};

function storageKey(username) {
  return `crm_tweaks_${username || "anon"}`;
}

export function useTweaks(username) {
  const [t, setT] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey(username));
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    } catch {
      return { ...DEFAULTS };
    }
  });

  // Persistir
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(username), JSON.stringify(t));
    } catch {}
  }, [t, username]);

  // Aplicar al DOM. Siempre seteamos el atributo (incluso para minimal, que
  // es el default del :root) porque hilo-shell.css tiene reglas hardcoded
  // (.hilo-state-pill.vip color, sync-pill verde, etc.) que necesitan
  // overrides explícitos por tema en themes.css.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", t.theme || "minimal");
  }, [t.theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-density", t.density || "comfortable");
  }, [t.density]);

  useEffect(() => {
    if (t.accent && t.accent !== DEFAULTS.accent) {
      document.documentElement.style.setProperty("--clay", t.accent);
    } else {
      document.documentElement.style.removeProperty("--clay");
    }
  }, [t.accent]);

  const set = useCallback((key, value) => {
    setT((prev) => ({ ...prev, [key]: value }));
  }, []);

  return [t, set];
}

export default function TweaksPanel({ tweaks, setTweak, canPreviewRole, realRole }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="hilo-tweaks-toggle"
        aria-label="Ajustes de tema"
        onClick={() => setOpen((o) => !o)}
        title="Ajustes visuales"
      >
        <HiloIcon name="settings" size={18} />
      </button>

      {open && (
        <div className="hilo-tweaks-panel" role="dialog" aria-label="Tweaks">
          <div className="hilo-tweaks-head">
            <b>Ajustes</b>
            <button
              className="hilo-icon-btn"
              style={{ width: 26, height: 26 }}
              onClick={() => setOpen(false)}
              aria-label="Cerrar"
            >
              <HiloIcon name="close" size={14} />
            </button>
          </div>

          <div className="hilo-tweaks-body">
            {/* Tema */}
            <div className="hilo-tweaks-row">
              <span className="hilo-tweaks-label">Tema visual</span>
              <select
                className="hilo-search-kbd"
                style={{ padding: "8px 10px", fontFamily: "var(--font-sans)", fontSize: 12, cursor: "pointer", background: "var(--paper-2)" }}
                value={tweaks.theme}
                onChange={(e) => setTweak("theme", e.target.value)}
              >
                {THEMES.map((th) => (
                  <option key={th.value} value={th.value}>{th.label}</option>
                ))}
              </select>
            </div>

            {/* Densidad */}
            <div className="hilo-tweaks-row">
              <span className="hilo-tweaks-label">Densidad</span>
              <div className="hilo-tweaks-seg">
                {["compact", "comfortable"].map((d) => (
                  <button
                    key={d}
                    className={tweaks.density === d ? "on" : ""}
                    onClick={() => setTweak("density", d)}
                  >
                    {d === "compact" ? "Compacto" : "Cómodo"}
                  </button>
                ))}
              </div>
            </div>

            {/* Color de acento */}
            <div className="hilo-tweaks-row">
              <span className="hilo-tweaks-label">Acento</span>
              <div className="hilo-tweaks-chips">
                {ACCENTS.map((c) => (
                  <button
                    key={c.value}
                    className={`hilo-tweaks-chip ${tweaks.accent === c.value ? "on" : ""}`}
                    style={{ background: c.value }}
                    title={c.label}
                    onClick={() => setTweak("accent", c.value)}
                    aria-label={c.label}
                  />
                ))}
              </div>
            </div>

            {/* Preview de rol (solo admin/supervisor) */}
            {canPreviewRole && (
              <div className="hilo-tweaks-row">
                <span className="hilo-tweaks-label">
                  Vista previa de rol{" "}
                  <span style={{ color: "var(--ink-3)", textTransform: "none" }}>
                    (real: {realRole})
                  </span>
                </span>
                <div className="hilo-tweaks-seg">
                  {[
                    { v: null, l: "Real" },
                    { v: "vendedora", l: "Vendedora" },
                    { v: "supervisor", l: "Supervisor" },
                  ].map(({ v, l }) => (
                    <button
                      key={String(v)}
                      className={tweaks.rolePreview === v ? "on" : ""}
                      onClick={() => setTweak("rolePreview", v)}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
