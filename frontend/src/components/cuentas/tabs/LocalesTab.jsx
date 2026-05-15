/**
 * LocalesTab — locales comerciales de la cuenta con mapa interactivo (Sprint CRM-D7).
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ Locales comerciales · N LOCALES REGISTRADOS  [+ Agregar]    │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │  [ Mapa Leaflet con pins por local ]                        │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │  Card local 1 (PRINCIPAL) — calle / galería / mercado / ... │
 *   │  Card local 2                                                │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Leaflet se carga vía CDN (lazy) para no añadir dependencias npm.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  Loader2, Plus, MapPin, Edit2, Trash2, ExternalLink, Star,
  Building2, Store, Tent, Crown, ShoppingBag,
} from "lucide-react";
import { LocalModal } from "@/components/cuentas/modals/LocalModal";

// Carga Leaflet desde CDN una sola vez. Devuelve `window.L` cuando esté listo.
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS  = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

let leafletLoadingPromise = null;
function loadLeaflet() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.L) return Promise.resolve(window.L);
  if (leafletLoadingPromise) return leafletLoadingPromise;

  leafletLoadingPromise = new Promise((resolve, reject) => {
    // CSS
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    // JS
    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.L));
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return leafletLoadingPromise;
}

export const TIPO_META = {
  galeria:  { label: "Galería",  emoji: "🏬", icon: Building2,   bg: "rgba(122,78,126,.10)",  fg: "#7A4E7E" },
  calle:    { label: "Calle",    emoji: "🏪", icon: Store,       bg: "rgba(42,111,219,.10)",  fg: "#1E54B0" },
  mercado:  { label: "Mercado",  emoji: "🧺", icon: Tent,        bg: "rgba(217,119,6,.10)",   fg: "#B45309" },
  boutique: { label: "Boutique", emoji: "👗", icon: Crown,       bg: "rgba(190,24,93,.10)",   fg: "#9D174D" },
  mall:     { label: "Mall",     emoji: "🛍️", icon: ShoppingBag, bg: "rgba(22,163,74,.12)",   fg: "#15803D" },
  otro:     { label: "Otro",     emoji: "📍", icon: MapPin,      bg: "rgba(107,114,128,.10)", fg: "#374151" },
};

// Centro por defecto del mapa: Lima Centro (cuando no hay locales geocodeados)
const LIMA_CENTER = [-12.0464, -77.0428];

function tipoLabel(tipo) {
  return (TIPO_META[tipo] || TIPO_META.otro).label;
}
function tipoEmoji(tipo) {
  return (TIPO_META[tipo] || TIPO_META.otro).emoji;
}
function tipoStyle(tipo) {
  const m = TIPO_META[tipo] || TIPO_META.otro;
  return { bg: m.bg, fg: m.fg };
}

export function LocalesTab({ partnerOdooId }) {
  const [locales, setLocales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // local actual o null para crear

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/cuentas/${partnerOdooId}/locales`);
      let lista = r.data?.locales || [];

      // Si no hay locales, intentar autocrear desde los datos de Info.
      // Idempotente: si la cuenta no tiene dirección, el backend retorna skipped.
      if (lista.length === 0) {
        try {
          const ac = await api.post(`/cuentas/${partnerOdooId}/locales/autocreate`);
          if (ac.data?.created) {
            const r2 = await api.get(`/cuentas/${partnerOdooId}/locales`);
            lista = r2.data?.locales || [];
          }
        } catch (_) {
          // best-effort: si falla autocreate, seguimos con lista vacía
        }
      }

      setLocales(lista);
    } catch (e) {
      toast.error("Error cargando locales");
    } finally {
      setLoading(false);
    }
  }, [partnerOdooId]);

  useEffect(() => { cargar(); }, [cargar]);

  const handleEliminar = async (local) => {
    if (!window.confirm(`¿Eliminar el local "${local.nombre || tipoLabel(local.tipo)}"?`)) return;
    try {
      await api.delete(`/cuentas/${partnerOdooId}/locales/${local.id}`);
      toast.success("Local eliminado");
      cargar();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error eliminando local");
    }
  };

  const handleAbrirMapa = (local) => {
    if (local.latitud && local.longitud) {
      window.open(
        `https://www.google.com/maps?q=${local.latitud},${local.longitud}`,
        "_blank",
        "noopener,noreferrer"
      );
    } else if (local.direccion) {
      const q = encodeURIComponent(
        [local.direccion, local.distrito, local.departamento].filter(Boolean).join(", ")
      );
      window.open(
        `https://www.google.com/maps/search/?api=1&query=${q}`,
        "_blank",
        "noopener,noreferrer"
      );
    } else {
      toast.warning("Sin coordenadas ni dirección");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  const localesConCoord = locales.filter((l) => l.latitud && l.longitud);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-base font-semibold text-slate-900">Locales comerciales</div>
          <div className="text-xs text-slate-500 mt-0.5 uppercase tracking-wide">
            {locales.length} {locales.length === 1 ? "local registrado" : "locales registrados"}
          </div>
        </div>
        <button
          onClick={() => { setEditing(null); setModalOpen(true); }}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800 transition-colors"
        >
          <Plus className="h-4 w-4" /> Agregar local
        </button>
      </div>

      {/* Mapa */}
      <LocalesMap locales={localesConCoord} />

      {/* Lista de locales */}
      {locales.length === 0 ? (
        <div className="border border-dashed border-slate-300 rounded-lg py-10 text-center text-sm text-slate-500">
          Aún no hay locales registrados.
          <br />
          <button
            onClick={() => { setEditing(null); setModalOpen(true); }}
            className="mt-3 inline-flex items-center gap-1.5 text-slate-900 font-medium hover:underline"
          >
            <Plus className="h-4 w-4" /> Agregar el primer local
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {locales.map((local) => (
            <LocalCard
              key={local.id}
              local={local}
              onEditar={() => { setEditing(local); setModalOpen(true); }}
              onEliminar={() => handleEliminar(local)}
              onAbrirMapa={() => handleAbrirMapa(local)}
            />
          ))}
        </div>
      )}

      {/* Modal crear/editar */}
      {modalOpen && (
        <LocalModal
          partnerOdooId={partnerOdooId}
          local={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); cargar(); }}
        />
      )}
    </div>
  );
}

// ───── Mapa Leaflet ─────
function LocalesMap({ locales }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !L || !containerRef.current) return;
      // Inicializar mapa una sola vez
      if (!mapRef.current) {
        const center = locales.length
          ? [Number(locales[0].latitud), Number(locales[0].longitud)]
          : LIMA_CENTER;
        const zoom = locales.length ? 14 : 6;
        mapRef.current = L.map(containerRef.current, {
          center,
          zoom,
          scrollWheelZoom: false,
        });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap',
        }).addTo(mapRef.current);
      }

      // Limpiar markers previos
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      // Añadir markers
      const bounds = [];
      locales.forEach((local) => {
        const lat = Number(local.latitud);
        const lng = Number(local.longitud);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        const emoji = tipoEmoji(local.tipo);
        const isPrincipal = local.es_principal;
        const html = `
          <div style="
            display:flex;align-items:center;justify-content:center;
            width:36px;height:36px;border-radius:50%;
            background:${isPrincipal ? "#1f2937" : "#ffffff"};
            color:${isPrincipal ? "#ffffff" : "#1f2937"};
            border:2px solid ${isPrincipal ? "#1f2937" : "#cbd5e1"};
            font-size:18px;line-height:1;
            box-shadow:0 1px 3px rgba(0,0,0,0.2);
          ">${emoji}</div>
        `;
        const icon = L.divIcon({
          html,
          className: "local-marker-icon",
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });
        const marker = L.marker([lat, lng], { icon }).addTo(mapRef.current);
        const titulo = local.nombre || tipoLabel(local.tipo);
        const dir = [local.direccion, local.distrito, local.departamento]
          .filter(Boolean).join(", ");
        marker.bindPopup(`
          <div style="font-family:inherit;font-size:13px;line-height:1.4;min-width:160px">
            <div style="font-weight:600;color:#0f172a">${isPrincipal ? "⭐ " : ""}${titulo}</div>
            <div style="color:#64748b;font-size:11px;text-transform:uppercase;margin-top:2px">${tipoLabel(local.tipo)}</div>
            ${dir ? `<div style="color:#475569;margin-top:4px">${dir}</div>` : ""}
          </div>
        `);
        markersRef.current.push(marker);
        bounds.push([lat, lng]);
      });

      // Ajustar zoom al conjunto
      if (bounds.length > 1) {
        mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      } else if (bounds.length === 1) {
        mapRef.current.setView(bounds[0], 15);
      }
    }).catch(() => {
      // Silencioso: el mapa simplemente no se renderiza
    });

    return () => { cancelled = true; };
  }, [locales]);

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  if (locales.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 h-64 flex items-center justify-center text-sm text-slate-500">
        <div className="text-center">
          <MapPin className="h-6 w-6 mx-auto mb-2 text-slate-400" />
          Sin locales geolocalizados aún.
          <br />
          Agrega un local con coordenadas para verlo en el mapa.
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="rounded-lg border border-slate-200 overflow-hidden"
      style={{ height: 320, width: "100%" }}
    />
  );
}

// ───── Card de un local ─────
function LocalCard({ local, onEditar, onEliminar, onAbrirMapa }) {
  const t = tipoStyle(local.tipo);
  const Icon = (TIPO_META[local.tipo] || TIPO_META.otro).icon;
  const titulo = local.nombre || tipoLabel(local.tipo);
  const lineaDir = [local.direccion, local.distrito, local.departamento]
    .filter(Boolean).join(" · ");

  return (
    <div className={`rounded-lg border ${local.es_principal ? "border-slate-900" : "border-slate-200"} bg-white p-3.5 hover:shadow-sm transition-shadow`}>
      <div className="flex items-start gap-3">
        {/* Icon del tipo */}
        <div
          className="flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center text-xl"
          style={{ background: t.bg, color: t.fg }}
          aria-hidden
        >
          {tipoEmoji(local.tipo)}
        </div>

        {/* Contenido */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {local.es_principal && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-900 text-white">
                <Star className="h-3 w-3 fill-current" /> Principal
              </span>
            )}
            <span
              className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ background: t.bg, color: t.fg }}
            >
              {tipoLabel(local.tipo)}
            </span>
          </div>
          <div className="font-semibold text-slate-900 mt-1 truncate">{titulo}</div>
          {lineaDir && (
            <div className="text-sm text-slate-600 mt-0.5">{lineaDir}</div>
          )}
          {local.referencia && (
            <div className="text-xs text-slate-500 mt-1 italic">Ref: {local.referencia}</div>
          )}
          {(local.latitud != null && local.longitud != null) && (
            <div className="text-xs text-slate-500 mt-1 font-mono">
              {Number(local.latitud).toFixed(4)}, {Number(local.longitud).toFixed(4)}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 mt-3 pt-3 border-t border-slate-100">
        <button
          onClick={onEditar}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <Edit2 className="h-3.5 w-3.5" /> Editar
        </button>
        <button
          onClick={onAbrirMapa}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Abrir en mapa
        </button>
        <button
          onClick={onEliminar}
          className="ml-auto inline-flex items-center gap-1 text-xs px-2 py-1 rounded text-rose-600 hover:bg-rose-50 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" /> Eliminar
        </button>
      </div>
    </div>
  );
}
