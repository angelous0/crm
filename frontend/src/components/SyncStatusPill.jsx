/**
 * SyncStatusPill — pill del topbar que muestra estado de sincronización
 * de todas las fuentes de datos. Click → popover con detalle por tabla.
 *
 * Color del dot:
 *   verde: todo ok
 *   ámbar: alguna tabla envejecida
 *   rojo:  alguna tabla atrasada (>24h Odoo, >30h matviews)
 *
 * Refresh automático cada 60s.
 */
import React, { useState, useEffect, useRef } from "react";
import api from "@/lib/api";
import { ChevronDown, X } from "lucide-react";

const ESTADO_STYLE = {
  ok:   { dot: "var(--olive)",  ring: "rgba(92,122,90,.28)", bg: "rgba(92,122,90,.10)", color: "#3F5A3D", label: "Sincronizado" },
  warn: { dot: "#D97706",       ring: "rgba(217,119,6,.28)", bg: "rgba(217,119,6,.10)", color: "#B45309", label: "Algunas tablas envejecidas" },
  crit: { dot: "#DC2626",       ring: "rgba(220,38,38,.30)", bg: "rgba(220,38,38,.10)", color: "#991B1B", label: "Algunas tablas atrasadas" },
};

export default function SyncStatusPill() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const popoverRef = useRef(null);

  const cargar = async () => {
    try {
      const r = await api.get("/sync/status");
      setData(r.data);
    } catch {
      // silencioso — el pill mantendrá el último estado
    }
  };

  useEffect(() => {
    cargar();
    const id = setInterval(cargar, 60_000);  // refresca cada 60s
    return () => clearInterval(id);
  }, []);

  // Click fuera del popover lo cierra
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const g = data?.global || { estado: "ok", label: "Cargando…", venta_real_hace: "—" };
  const style = ESTADO_STYLE[g.estado] || ESTADO_STYLE.ok;

  // Agrupar items por categoría
  const byCategoria = {};
  (data?.items || []).forEach((it) => {
    if (!byCategoria[it.categoria]) byCategoria[it.categoria] = [];
    byCategoria[it.categoria].push(it);
  });

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="hilo-sync-pill cursor-pointer hover:opacity-80 transition-opacity"
        style={{
          background: style.bg,
          borderColor: style.ring,
          color: style.color,
        }}
        title="Click para ver detalle"
        data-testid="sync-status-pill"
      >
        <span
          className="hilo-sync-dot"
          style={{ background: style.dot }}
        />
        <span>{g.label.toUpperCase()} · venta real {g.venta_real_hace}</span>
        <ChevronDown
          size={11}
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0)",
            transition: "transform .15s",
            opacity: 0.6,
          }}
        />
      </button>

      {open && data && (
        <div
          className="absolute right-0 top-full mt-2 z-50 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden"
          style={{ width: 480, maxHeight: "80vh" }}
          data-testid="sync-status-popover"
        >
          {/* Header */}
          <div
            className="px-4 py-3 border-b border-slate-100 flex items-center justify-between"
            style={{ background: style.bg }}
          >
            <div>
              <div
                className="text-base font-semibold leading-tight"
                style={{ color: style.color, fontFamily: "var(--font-display)" }}
              >
                {g.label}
              </div>
              <div className="text-[11px] text-slate-600 mt-0.5">
                Datos de venta real actualizados{" "}
                <b style={{ color: style.color }}>{g.venta_real_hace}</b>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-md hover:bg-white/50 flex items-center justify-center text-slate-500"
            >
              <X size={14} />
            </button>
          </div>

          {/* Lista por categorías */}
          <div className="overflow-y-auto" style={{ maxHeight: "calc(80vh - 90px)" }}>
            {Object.entries(byCategoria).map(([cat, items]) => (
              <div key={cat} className="border-b border-slate-100 last:border-b-0">
                <div className="px-4 py-2 bg-slate-50/60 text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500 font-medium">
                  {cat}
                </div>
                <div className="divide-y divide-slate-100">
                  {items.map((it) => {
                    const itStyle = ESTADO_STYLE[it.estado];
                    const isOdoo = cat === "Sync Odoo";
                    // Para Odoo: el "hace" oficial es last_sync_hace (corrida del job).
                    // El ultima_actualizacion es la fila más reciente (informativo).
                    const haceMain = isOdoo ? (it.last_sync_hace || it.hace) : it.hace;
                    const fechaMain = isOdoo ? it.last_sync_at : it.ultima_actualizacion;
                    return (
                      <div
                        key={`${cat}-${it.tabla}`}
                        className="px-4 py-2.5 flex items-start gap-3"
                        data-testid={`sync-item-${it.tabla}`}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0 mt-1.5"
                          style={{ background: itStyle.dot }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate">
                            {it.descripcion || it.tabla}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            {it.tabla}
                            {typeof it.filas === "number" && (
                              <span className="ml-2">· {it.filas.toLocaleString("es-PE")} filas</span>
                            )}
                            {typeof it.size_mb === "number" && (
                              <span className="ml-2">· {it.size_mb} MB</span>
                            )}
                            {it.schedule && (
                              <span className="ml-2">· {it.schedule}</span>
                            )}
                          </div>
                          {/* Para Odoo: mostrar también última fila modificada */}
                          {isOdoo && it.ultima_actualizacion && (
                            <div className="text-[10px] text-slate-400 font-mono mt-1">
                              dato más reciente: {it.hace}
                            </div>
                          )}
                          {it.ultimo_error && (
                            <div className="text-[10px] text-red-600 mt-1 truncate" title={it.ultimo_error}>
                              ⚠ {it.ultimo_error}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div
                            className="text-xs font-semibold"
                            style={{ color: itStyle.color }}
                          >
                            {haceMain}
                          </div>
                          {fechaMain && (
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                              {new Date(fechaMain).toLocaleString("es-PE", {
                                day: "2-digit",
                                month: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          )}
                          {isOdoo && (
                            <div className="text-[9px] text-slate-400 font-mono uppercase tracking-wider mt-0.5">
                              último sync
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/40 text-[10px] text-slate-400 font-mono uppercase tracking-wider">
            Auto-refresh cada 60s
          </div>
        </div>
      )}
    </div>
  );
}
