/**
 * MapaPeru — distribución geográfica de cartera (Sprint CRM-D7).
 *
 * Dos vistas:
 * 1) Nacional: mapa de Perú con burbujas por departamento + sidebar lista deptos
 * 2) Detalle: zoom al depto con pins de clientes/locales + sidebar de clientes
 *
 * En la vista detalle hay toggle "Por cliente" / "Por local":
 *   - Por cliente: 1 pin por cliente (en su local principal); click expande locales
 *   - Por local:   1 pin por cada local del depto
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Loader2, ArrowLeft, MapPin, ChevronRight, Sparkles, X, CheckCircle2, AlertCircle, Wand2, Settings, ExternalLink, Eye, EyeOff } from "lucide-react";

// Leaflet via CDN (mismo patrón que LocalesTab)
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS  = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
let leafletLoadingPromise = null;
function loadLeaflet() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.L) return Promise.resolve(window.L);
  if (leafletLoadingPromise) return leafletLoadingPromise;
  leafletLoadingPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
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

// Centroides aproximados de cada departamento del Perú
const CENTROIDES_PE = {
  "Amazonas":      [-5.7, -78.0],
  "Áncash":        [-9.5, -77.6],
  "Apurímac":      [-14.0, -73.0],
  "Arequipa":      [-16.0, -72.0],
  "Ayacucho":      [-13.5, -74.0],
  "Cajamarca":     [-7.2, -78.5],
  "Callao":        [-12.0, -77.1],
  "Cusco":         [-13.5, -71.9],
  "Huancavelica":  [-13.2, -75.0],
  "Huánuco":       [-9.9, -76.2],
  "Ica":           [-14.0, -75.7],
  "Junín":         [-11.5, -75.2],
  "La Libertad":   [-8.0, -78.5],
  "Lambayeque":    [-6.7, -79.9],
  "Lima":          [-12.0, -76.8],
  "Loreto":        [-4.5, -73.5],
  "Madre de Dios": [-12.0, -70.5],
  "Moquegua":      [-17.0, -71.0],
  "Pasco":         [-10.5, -75.5],
  "Piura":         [-5.2, -80.0],
  "Puno":          [-15.5, -70.0],
  "San Martín":    [-7.0, -76.5],
  "Tacna":         [-18.0, -70.3],
  "Tumbes":        [-3.6, -80.4],
  "Ucayali":       [-9.5, -73.5],
};

const PERU_BOUNDS = [[-18.5, -81.5], [-0.0, -68.5]];

// Lookup case-insensitive de centroides (los locales viejos pueden tener
// "CUSCO" en vez de "Cusco" si fueron auto-creados desde Odoo sin normalizar)
function centroidOf(nombre) {
  if (!nombre) return null;
  if (CENTROIDES_PE[nombre]) return CENTROIDES_PE[nombre];
  const lower = nombre.toLowerCase().trim();
  const key = Object.keys(CENTROIDES_PE).find((k) => k.toLowerCase() === lower);
  return key ? CENTROIDES_PE[key] : null;
}

// Estilo visual por tipo de local
const TIPO_META = {
  galeria:  { label: "Galería",  emoji: "🏬", color: "#7A4E7E" },
  calle:    { label: "Calle",    emoji: "🏪", color: "#1E54B0" },
  mercado:  { label: "Mercado",  emoji: "🧺", color: "#B45309" },
  boutique: { label: "Boutique", emoji: "👗", color: "#9D174D" },
  mall:     { label: "Mall",     emoji: "🛍️", color: "#15803D" },
  otro:     { label: "Otro",     emoji: "📍", color: "#374151" },
};

const fmtMoney = (n) => "S/ " + Number(n || 0).toLocaleString("es-PE", { maximumFractionDigits: 0 });
const fmtMoneyShort = (n) => {
  if (!n) return "S/ 0";
  const v = Number(n);
  if (v >= 1000000) return `S/ ${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `S/ ${Math.round(v / 1000)}k`;
  return `S/ ${Math.round(v)}`;
};

export default function MapaPeru() {
  const [view, setView] = useState("nacional"); // 'nacional' | 'detalle'
  const [departamentos, setDepartamentos] = useState([]);
  const [loadingNacional, setLoadingNacional] = useState(true);

  const [deptoSeleccionado, setDeptoSeleccionado] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [modoDetalle, setModoDetalle] = useState("clientes"); // 'clientes' | 'locales'

  // Geocoding batch
  const [pendientesCount, setPendientesCount] = useState(0);
  const [geocodeModalOpen, setGeocodeModalOpen] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);

  const cargarNacional = useCallback(async () => {
    setLoadingNacional(true);
    try {
      const [r, cnt] = await Promise.all([
        api.get("/mapa/resumen"),
        api.get("/mapa/geocode-pendientes/count").catch(() => ({ data: { pendientes: 0 } })),
      ]);
      setDepartamentos(r.data?.departamentos || []);
      setPendientesCount(cnt.data?.pendientes || 0);
    } catch (e) {
      toast.error("Error cargando mapa");
    } finally {
      setLoadingNacional(false);
    }
  }, []);

  useEffect(() => { cargarNacional(); }, [cargarNacional]);

  const abrirDepto = useCallback(async (nombre) => {
    setDeptoSeleccionado(nombre);
    setView("detalle");
    setLoadingDetalle(true);
    setDetalle(null);
    try {
      const r = await api.get(`/mapa/departamento/${encodeURIComponent(nombre)}`);
      setDetalle(r.data);
    } catch (e) {
      toast.error("Error cargando departamento");
    } finally {
      setLoadingDetalle(false);
    }
  }, []);

  const volverNacional = () => {
    setView("nacional");
    setDeptoSeleccionado(null);
    setDetalle(null);
  };

  const totalClientes = useMemo(
    () => departamentos.reduce((s, d) => s + d.total_clientes, 0),
    [departamentos]
  );
  const totalLocales = useMemo(
    () => departamentos.reduce((s, d) => s + d.total_locales, 0),
    [departamentos]
  );

  return (
    <div className="px-6 py-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Mapa de <span className="text-amber-700">{view === "detalle" ? deptoSeleccionado : "locales"}</span>
          </h1>
          <div className="text-xs text-slate-500 uppercase tracking-wider mt-1.5">
            {view === "nacional" ? (
              <>{departamentos.length} departamentos · {totalLocales} locales · click para ver pins</>
            ) : (
              <>{detalle?.kpis?.total_clientes || 0} clientes · {detalle?.kpis?.total_locales || 0} locales</>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {view === "nacional" && (
            <button
              onClick={() => setAiSettingsOpen(true)}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              title="Configurar IA para geocoding"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden md:inline">IA</span>
            </button>
          )}
          {view === "nacional" && pendientesCount > 0 && (
            <button
              onClick={() => setGeocodeModalOpen(true)}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md bg-amber-500 text-white hover:bg-amber-600 shadow-sm transition-colors"
              title="Geocodificar locales que aún no tienen coordenadas"
            >
              <Sparkles className="h-4 w-4" />
              Geocodificar {pendientesCount} pendientes
            </button>
          )}
          {view === "detalle" && (
            <button
              onClick={volverNacional}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> Ver todo el Perú
            </button>
          )}
        </div>
      </div>

      {/* Loading inicial */}
      {loadingNacional && view === "nacional" && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      )}

      {/* Vista nacional */}
      {!loadingNacional && view === "nacional" && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-2">
            <MapaNacional departamentos={departamentos} onClickDepto={abrirDepto} />
          </div>
          <div className="lg:col-span-3">
            <SidebarDeptos departamentos={departamentos} onClickDepto={abrirDepto} />
          </div>
        </div>
      )}

      {/* Vista detalle */}
      {view === "detalle" && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-2">
            {loadingDetalle ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 h-[520px] flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : detalle ? (
              <MapaDetalle detalle={detalle} modo={modoDetalle} setModo={setModoDetalle} />
            ) : null}
          </div>
          <div className="lg:col-span-3">
            {loadingDetalle ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 h-[520px] animate-pulse" />
            ) : detalle ? (
              <SidebarDetalle detalle={detalle} modo={modoDetalle} setModo={setModoDetalle} />
            ) : null}
          </div>
        </div>
      )}

      {/* Modal de geocodificación batch */}
      {geocodeModalOpen && (
        <GeocodeModal
          totalPendientes={pendientesCount}
          onClose={() => {
            setGeocodeModalOpen(false);
            cargarNacional();
          }}
        />
      )}

      {/* Modal de configuración de IA */}
      {aiSettingsOpen && (
        <AISettingsModal onClose={() => setAiSettingsOpen(false)} />
      )}
    </div>
  );
}

// ────────────── Modal: configuración de IA (provider + key + spend) ──────────────
function AISettingsModal({ onClose }) {
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Form
  const [provider, setProvider] = useState("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("claude-3-5-haiku-20241022");
  const [showKey, setShowKey] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/ai-config");
      setCfg(r.data);
      if (r.data?.provider) setProvider(r.data.provider);
      if (r.data?.model) setModel(r.data.model);
    } catch (e) {
      if (e?.response?.status === 403) {
        toast.error("Solo admin puede configurar IA");
        onClose();
      } else {
        toast.error("Error cargando configuración");
      }
    } finally {
      setLoading(false);
    }
  }, [onClose]);

  useEffect(() => { cargar(); }, [cargar]);

  // Modelos por provider
  const modelosPorProvider = {
    anthropic: [
      { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku · $0.80/$4 por 1M tok", recommended: true },
      { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet · $3/$15 por 1M tok" },
      { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku · $0.25/$1.25 por 1M tok" },
    ],
    openai: [
      { value: "gpt-4o-mini", label: "GPT-4o mini · $0.15/$0.60 por 1M tok", recommended: true },
      { value: "gpt-4o", label: "GPT-4o · $2.50/$10 por 1M tok" },
    ],
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post("/admin/ai-config", {
        provider,
        api_key: apiKey.trim() || null,
        model,
      });
      toast.success("Configuración guardada");
      setApiKey("");
      cargar();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error guardando");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api.post("/admin/ai-config/test");
      setTestResult({ ok: true, ...r.data });
      toast.success("Key válida — IA lista para usar");
    } catch (e) {
      setTestResult({ ok: false, error: e?.response?.data?.detail || "Error" });
      toast.error("La key no funcionó");
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("¿Borrar la configuración de IA? El geocoding seguirá funcionando con Nominatim solo.")) return;
    try {
      await api.delete("/admin/ai-config");
      toast.success("Configuración borrada");
      cargar();
      setApiKey("");
    } catch (e) {
      toast.error("Error al borrar");
    }
  };

  const s = cfg?.stats;
  const fmt$ = (n) => "$ " + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  const fmt$Big = (n) => "$ " + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[2000] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-violet-600" />
              <h2 className="text-base font-semibold text-slate-900">Configuración de IA</h2>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              Limpieza de direcciones para geocoding y otras tareas
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : (
            <>
              {/* Estado actual */}
              {cfg?.has_key && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
                  <div className="flex-1 text-sm">
                    <div className="font-medium text-emerald-900">IA activa</div>
                    <div className="text-emerald-800 text-xs mt-0.5">
                      {cfg.provider === "anthropic" ? "Anthropic Claude" : "OpenAI"} · {cfg.model} · Key: <code className="text-[11px] bg-white px-1 rounded">{cfg.key_masked || "•••"}</code>
                    </div>
                  </div>
                  <button
                    onClick={handleDelete}
                    className="text-xs text-rose-600 hover:text-rose-800 font-medium"
                  >
                    Desactivar
                  </button>
                </div>
              )}

              {/* Stats de gasto */}
              {s && s.total_calls > 0 && (
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wider text-slate-500 font-medium">Gasto registrado</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="border border-slate-200 rounded-md p-3 bg-white">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">Hoy</div>
                      <div className="text-lg font-bold text-slate-900 mt-0.5 font-mono">{fmt$(s.cost_today)}</div>
                    </div>
                    <div className="border border-slate-200 rounded-md p-3 bg-white">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">Este mes</div>
                      <div className="text-lg font-bold text-slate-900 mt-0.5 font-mono">{fmt$(s.cost_this_month)}</div>
                    </div>
                    <div className="border border-slate-200 rounded-md p-3 bg-white">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">Total</div>
                      <div className="text-lg font-bold text-slate-900 mt-0.5 font-mono">{fmt$Big(s.total_cost)}</div>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center justify-between">
                    <span>
                      {s.total_calls} llamadas · {s.calls_ok} exitosas · {(s.total_in_tokens + s.total_out_tokens).toLocaleString()} tokens totales
                    </span>
                    <a
                      href={cfg.provider === "openai" ? cfg.dashboards.openai : cfg.dashboards.anthropic}
                      target="_blank" rel="noopener noreferrer"
                      className="text-violet-700 hover:text-violet-900 font-medium flex items-center gap-1"
                    >
                      Ver saldo real <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              )}

              {/* Form */}
              <div className="border-t border-slate-200 pt-4 space-y-4">
                <div className="text-xs uppercase tracking-wider text-slate-500 font-medium">
                  {cfg?.has_key ? "Actualizar configuración" : "Configurar IA"}
                </div>

                {/* Provider selector */}
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-1.5 block">Proveedor</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => { setProvider("anthropic"); setModel("claude-3-5-haiku-20241022"); }}
                      className={`px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
                        provider === "anthropic"
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                      }`}
                    >
                      Anthropic (Claude)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setProvider("openai"); setModel("gpt-4o-mini"); }}
                      className={`px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
                        provider === "openai"
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                      }`}
                    >
                      OpenAI (GPT)
                    </button>
                  </div>
                </div>

                {/* Modelo */}
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-1.5 block">Modelo</label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full h-10 px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    {(modelosPorProvider[provider] || []).map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}{m.recommended ? " ⭐" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* API Key */}
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-1.5 block">
                    API Key {cfg?.has_key && <span className="text-slate-400 font-normal">· dejá vacío para conservar la actual</span>}
                  </label>
                  <div className="relative">
                    <input
                      type={showKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={provider === "anthropic" ? "sk-ant-api03-..." : "sk-..."}
                      autoComplete="off"
                      className="w-full h-10 pl-3 pr-10 py-2 text-sm border border-slate-300 rounded-md bg-white font-mono focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {provider === "anthropic" ? (
                      <>Crea una key en <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-violet-700 hover:underline">console.anthropic.com</a></>
                    ) : (
                      <>Crea una key en <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-violet-700 hover:underline">platform.openai.com</a></>
                    )}
                  </div>
                </div>

                {/* Test result */}
                {testResult && (
                  <div className={`rounded-md p-3 text-sm border ${
                    testResult.ok
                      ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                      : "bg-rose-50 border-rose-200 text-rose-900"
                  }`}>
                    {testResult.ok ? (
                      <>
                        <div className="flex items-center gap-1.5 font-medium">
                          <CheckCircle2 className="h-4 w-4" /> Key válida
                        </div>
                        <div className="text-xs mt-1">
                          Respuesta: <code className="bg-white px-1 rounded">{testResult.respuesta}</code>
                          {" · "}
                          {testResult.tokens.input + testResult.tokens.output} tokens · {fmt$(testResult.cost_usd)}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-1.5 font-medium">
                          <AlertCircle className="h-4 w-4" /> Error
                        </div>
                        <div className="text-xs mt-1">{testResult.error}</div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Tips */}
              <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-xs text-slate-600">
                <div className="font-medium text-slate-700 mb-1">💡 Costos estimados</div>
                <ul className="space-y-0.5 list-disc pl-4">
                  <li>Limpiar 1 dirección con <b>Claude Haiku</b>: ~$0.001 USD</li>
                  <li>Procesar 1000 direcciones: ~$1 USD</li>
                  <li>Solo se usa IA cuando Nominatim no encuentra la dirección</li>
                </ul>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between bg-slate-50">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
          >
            Cerrar
          </button>
          <div className="flex gap-2">
            {cfg?.has_key && (
              <button
                onClick={handleTest}
                disabled={testing}
                className="px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-60 flex items-center gap-1.5"
              >
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Probar
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving || (!cfg?.has_key && !apiKey.trim())}
              className="px-3 py-1.5 text-sm rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────── Modal: geocodificar locales pendientes ──────────────
function GeocodeModal({ totalPendientes, onClose }) {
  const [running, setRunning] = useState(false);
  const [autoLoop, setAutoLoop] = useState(false);
  const autoLoopRef = useRef(false);
  const [batches, setBatches] = useState([]); // [{ok, failed, results, has_ai, fase_a}]
  const [hasAi, setHasAi] = useState(false);
  const [pendientes, setPendientes] = useState(totalPendientes);
  const [breakdown, setBreakdown] = useState({ locales_sin_coords: 0, cuentas_sin_local: 0 });

  const totalOk = batches.reduce((s, b) => s + b.ok, 0);
  const totalFailed = batches.reduce((s, b) => s + b.failed, 0);
  const totalCreados = batches.reduce((s, b) => s + (b.fase_a?.creados?.length || 0), 0);
  const totalSkippedA = batches.reduce((s, b) => s + (b.fase_a?.skipped?.length || 0), 0);
  const failedList = batches.flatMap((b) => b.results.filter((r) => !r.ok));
  const creadosList = batches.flatMap((b) => b.fase_a?.creados || []);
  const skippedAList = batches.flatMap((b) => b.fase_a?.skipped || []);

  // Cargar breakdown inicial
  useEffect(() => {
    api.get("/mapa/geocode-pendientes/count")
      .then(r => setBreakdown({
        locales_sin_coords: r.data?.locales_sin_coords || 0,
        cuentas_sin_local:  r.data?.cuentas_sin_local || 0,
      }))
      .catch(() => {});
  }, []);

  // Una sola tanda (sin loop). Retorna {pendientesRestantes, batch}.
  const runOneBatch = async () => {
    const r = await api.post("/mapa/geocode-pendientes", null, { params: { limit: 30 } });
    setBatches((prev) => [...prev, r.data]);
    setHasAi(!!r.data.has_ai);
    // Refrescar contador
    let nuevoPendiente = pendientes;
    try {
      const cnt = await api.get("/mapa/geocode-pendientes/count");
      nuevoPendiente = cnt.data?.pendientes || 0;
      setPendientes(nuevoPendiente);
      setBreakdown({
        locales_sin_coords: cnt.data?.locales_sin_coords || 0,
        cuentas_sin_local:  cnt.data?.cuentas_sin_local || 0,
      });
    } catch (_) {}
    return { pendientesRestantes: nuevoPendiente, batch: r.data };
  };

  const runBatch = async () => {
    setRunning(true);
    try {
      await runOneBatch();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error al geocodificar");
    } finally {
      setRunning(false);
    }
  };

  // Auto-loop: corre tandas hasta que no queden pendientes o el user pida stop.
  const runAuto = async () => {
    setAutoLoop(true);
    autoLoopRef.current = true;
    setRunning(true);
    try {
      while (autoLoopRef.current) {
        const { pendientesRestantes } = await runOneBatch();
        if (pendientesRestantes <= 0) {
          toast.success("✓ Procesamiento completo");
          break;
        }
        // Pequeño respiro antes de la siguiente tanda
        await new Promise((res) => setTimeout(res, 500));
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error en auto-loop — paro");
    } finally {
      autoLoopRef.current = false;
      setAutoLoop(false);
      setRunning(false);
    }
  };

  const stopAuto = () => {
    autoLoopRef.current = false;
    toast.info("Pausando al terminar la tanda actual…");
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[2000] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-600" />
              <h2 className="text-base font-semibold text-slate-900">Geocodificar locales</h2>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {pendientes} pendientes · {breakdown.cuentas_sin_local} cuentas sin local · {breakdown.locales_sin_coords} locales sin coords
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Explicación inicial */}
          {batches.length === 0 && (
            <div className="text-sm text-slate-700 space-y-3">
              <p className="font-medium">Cada tanda procesa hasta 30 cuentas/locales en dos fases:</p>

              <div className="rounded-md border border-violet-200 bg-violet-50 p-3">
                <div className="text-xs font-semibold text-violet-900 uppercase tracking-wider mb-1">
                  Fase A · Crear local para cuentas que no tienen
                </div>
                <p className="text-xs text-violet-800">
                  Busca dirección en cascada: perfil CRM → partner principal en Odoo → <b>vinculados</b> (otros partners enlazados al cliente). Si encuentra, crea el local principal con esa info.
                </p>
              </div>

              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                <div className="text-xs font-semibold text-emerald-900 uppercase tracking-wider mb-1">
                  Fase B · Geocodificar locales sin coords
                </div>
                <ul className="text-xs text-emerald-800 list-disc pl-5 space-y-0.5">
                  <li>Normaliza dirección, busca en OpenStreetMap (Nominatim).</li>
                  <li>Si encuentra → guarda lat/lng + autocompleta distrito/depto.</li>
                  <li>Si falla → reintenta sin número, luego con IA (si está configurada).</li>
                </ul>
              </div>

              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                ⚠️ Nominatim tiene rate limit de 1 req/s. 30 candidatos ≈ 40-70 segundos por tanda.
              </p>
            </div>
          )}

          {/* Resumen acumulado */}
          {batches.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              <div className="border border-violet-200 bg-violet-50 rounded-md p-3">
                <div className="text-[10px] uppercase tracking-wider text-violet-700 font-medium">Locales creados</div>
                <div className="text-2xl font-bold text-violet-700 mt-1">{totalCreados}</div>
              </div>
              <div className="border border-emerald-200 bg-emerald-50 rounded-md p-3">
                <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-medium">Geocodificados</div>
                <div className="text-2xl font-bold text-emerald-700 mt-1">{totalOk}</div>
              </div>
              <div className="border border-rose-200 bg-rose-50 rounded-md p-3">
                <div className="text-[10px] uppercase tracking-wider text-rose-700 font-medium">Sin match</div>
                <div className="text-2xl font-bold text-rose-700 mt-1">{totalFailed + totalSkippedA}</div>
              </div>
              <div className="border border-slate-200 bg-slate-50 rounded-md p-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-600 font-medium">Quedan</div>
                <div className="text-2xl font-bold text-slate-700 mt-1">{pendientes}</div>
              </div>
            </div>
          )}

          {/* Locales creados desde vinculados */}
          {creadosList.length > 0 && (
            <div className="border border-violet-200 rounded-md overflow-hidden">
              <div className="px-3 py-2 bg-violet-50 border-b border-violet-200 text-[10px] uppercase tracking-wider text-violet-700 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Locales recién creados ({creadosList.length})
              </div>
              <ul className="divide-y divide-violet-100 max-h-32 overflow-y-auto">
                {creadosList.slice(0, 20).map((c, i) => (
                  <li key={i} className="px-3 py-1.5 text-xs flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-900 truncate">{c.cliente || `Cuenta #${c.cuenta_id}`}</div>
                      <div className="text-slate-500 truncate">
                        <span className="text-violet-700">{c.source}</span>
                        {c.direccion && <span> · {c.direccion}</span>}
                      </div>
                    </div>
                  </li>
                ))}
                {creadosList.length > 20 && (
                  <li className="px-3 py-1.5 text-xs text-slate-500 italic text-center">
                    … y {creadosList.length - 20} más
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Cuentas sin dirección en ningún lado */}
          {skippedAList.length > 0 && (
            <div className="border border-slate-200 rounded-md overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-600 font-medium flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-slate-500" />
                Cuentas sin dirección — ni en perfil, ni en odoo, ni en vinculados ({skippedAList.length})
              </div>
              <ul className="divide-y divide-slate-100 max-h-32 overflow-y-auto">
                {skippedAList.slice(0, 10).map((s, i) => (
                  <li key={i} className="px-3 py-1.5 text-xs flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-900 truncate">{s.cliente || `Cuenta #${s.cuenta_id}`}</div>
                      <div className="text-slate-500 truncate">{s.reason}</div>
                    </div>
                    <a
                      href={`/cuentas/${s.cuenta_id}?tab=info`}
                      className="text-[11px] text-slate-600 hover:text-slate-900 font-medium whitespace-nowrap"
                    >
                      Ver →
                    </a>
                  </li>
                ))}
                {skippedAList.length > 10 && (
                  <li className="px-3 py-1.5 text-xs text-slate-500 italic text-center">
                    … y {skippedAList.length - 10} más
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Lista de fallidos */}
          {failedList.length > 0 && (
            <div className="border border-slate-200 rounded-md overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-600 font-medium flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                Sin match — revisar manualmente ({failedList.length})
              </div>
              <ul className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                {failedList.map((f, i) => (
                  <li key={i} className="px-3 py-2 text-xs flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-900 truncate">{f.cliente || `Cuenta #${f.cuenta_id}`}</div>
                      <div className="text-slate-500 truncate" title={f.direccion}>{f.direccion}</div>
                    </div>
                    <a
                      href={`/cuentas/${f.cuenta_id}?tab=locales`}
                      className="text-[11px] text-amber-700 hover:text-amber-900 font-medium whitespace-nowrap"
                    >
                      Ver →
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* IA flag */}
          {batches.length > 0 && (
            <div className="text-[11px] text-slate-500 italic flex items-center gap-1.5">
              <Wand2 className="h-3 w-3" />
              IA: {hasAi ? "activa" : "no configurada (agrega ANTHROPIC_API_KEY al .env para activar)"}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="text-xs text-slate-500">
            {pendientes === 0 && batches.length > 0 && (
              <span className="text-emerald-700 font-medium flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" /> Todos los locales geocodificados
              </span>
            )}
            {autoLoop && pendientes > 0 && (
              <span className="text-violet-700 font-medium flex items-center gap-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Auto-loop activo · faltan {pendientes}
              </span>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={onClose}
              disabled={autoLoop}
              className="px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Cerrar
            </button>
            {pendientes > 0 && !autoLoop && (
              <>
                <button
                  onClick={runBatch}
                  disabled={running}
                  className="px-3 py-1.5 text-sm rounded-md border border-amber-300 bg-white text-amber-700 hover:bg-amber-50 disabled:opacity-60 flex items-center gap-1.5"
                >
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {running ? "Procesando…" : `Una tanda (${Math.min(30, pendientes)})`}
                </button>
                <button
                  onClick={runAuto}
                  disabled={running}
                  className="px-3 py-1.5 text-sm rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60 flex items-center gap-1.5"
                  title="Procesa todas las pendientes en loop hasta terminar"
                >
                  <Wand2 className="h-4 w-4" />
                  Procesar todo ({pendientes})
                </button>
              </>
            )}
            {autoLoop && (
              <button
                onClick={stopAuto}
                className="px-3 py-1.5 text-sm rounded-md bg-rose-500 text-white hover:bg-rose-600 flex items-center gap-1.5"
              >
                <X className="h-4 w-4" /> Pausar auto-loop
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────── Vista nacional: mapa con burbujas ──────────────
function MapaNacional({ departamentos, onClickDepto }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  // Threshold para colorear burbujas: top tercio = alta, resto = media
  const maxVentas = useMemo(
    () => departamentos.length > 0 ? Math.max(...departamentos.map((d) => d.amount_12m || 0)) : 0,
    [departamentos]
  );

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !L || !containerRef.current) return;
      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, {
          center: [-9.5, -75.0],
          zoom: 5,
          scrollWheelZoom: false,
          zoomControl: true,
          attributionControl: false,
        });
        L.tileLayer(
          "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
          { maxZoom: 19, subdomains: "abcd" }
        ).addTo(mapRef.current);
        mapRef.current.fitBounds(PERU_BOUNDS);
      }

      // Limpiar burbujas previas
      if (layerRef.current) {
        layerRef.current.remove();
      }
      layerRef.current = L.layerGroup().addTo(mapRef.current);

      // Crear burbujas por depto
      departamentos.forEach((d) => {
        const coords = centroidOf(d.nombre);
        if (!coords) return;
        const ratio = maxVentas > 0 ? (d.amount_12m || 0) / maxVentas : 0;
        const isAlta = ratio >= 0.5;
        const radius = 14 + Math.sqrt(d.total_locales) * 8;
        const color = isAlta ? "#b54635" : "#d4a85a";
        const bg = isAlta ? "rgba(181,70,53,0.18)" : "rgba(212,168,90,0.18)";

        const html = `
          <div style="
            position:relative;display:flex;align-items:center;justify-content:center;
            width:${radius * 2}px;height:${radius * 2}px;border-radius:50%;
            background:${bg};
            border:2px solid ${color};
            font-weight:700;color:${color};font-size:13px;
            box-shadow:0 1px 3px rgba(0,0,0,0.12);cursor:pointer;
          ">${d.total_locales}</div>
          <div style="
            position:absolute;top:${radius * 2 + 2}px;left:50%;transform:translateX(-50%);
            font-size:10px;color:#475569;font-weight:500;white-space:nowrap;
            text-shadow:0 0 3px white;
          ">${d.nombre}</div>
        `;
        const icon = L.divIcon({
          html,
          className: "depto-bubble-icon",
          iconSize: [radius * 2, radius * 2],
          iconAnchor: [radius, radius],
        });
        const m = L.marker(coords, { icon }).addTo(layerRef.current);
        m.on("click", () => onClickDepto(d.nombre));
        m.bindTooltip(
          `<b>${d.nombre}</b><br>${d.total_clientes} clientes · ${d.total_locales} locales<br>${fmtMoneyShort(d.amount_12m)} (12m)`,
          { direction: "top", offset: [0, -8] }
        );
      });
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [departamentos, maxVentas, onClickDepto]);

  useEffect(() => () => {
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
  }, []);

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="rounded-lg border border-slate-200 overflow-hidden bg-slate-50"
        style={{ height: 520 }}
      />
      <div className="flex items-center gap-3 text-[11px] text-slate-500 pl-1">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#b54635]" /> Alta venta
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#d4a85a]" /> Media
        </span>
        <span className="italic">· click para ver locales</span>
      </div>
    </div>
  );
}

// ────────────── Sidebar nacional: lista de deptos ──────────────
function SidebarDeptos({ departamentos, onClickDepto }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <div className="font-semibold text-slate-900">Departamentos</div>
        <div className="text-[10px] text-slate-400 uppercase tracking-wider">
          {departamentos.length} con clientes
        </div>
      </div>
      <ul className="divide-y divide-slate-100 max-h-[460px] overflow-y-auto">
        {departamentos.map((d) => (
          <li key={d.nombre}>
            <button
              onClick={() => onClickDepto(d.nombre)}
              className="w-full px-4 py-3 hover:bg-slate-50 flex items-center justify-between text-left transition-colors group"
            >
              <div className="min-w-0">
                <div className="font-medium text-slate-900">{d.nombre}</div>
                <div className="text-xs text-slate-500 mt-0.5 font-mono">
                  {d.total_clientes} clientes · {d.total_locales} locales · {d.clientes_activos} activos
                </div>
              </div>
              <div className="text-right ml-4 flex items-center gap-2">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">YTD</div>
                  <div className="font-bold text-slate-900 font-mono">{fmtMoneyShort(d.amount_ytd)}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500" />
              </div>
            </button>
          </li>
        ))}
        {departamentos.length === 0 && (
          <li className="px-4 py-10 text-sm text-slate-500 text-center">
            Aún no hay locales registrados en ningún departamento.
          </li>
        )}
      </ul>
    </div>
  );
}

// ────────────── Vista detalle: mapa zoom al depto ──────────────
function MapaDetalle({ detalle, modo, setModo }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  // Pins agrupados según el modo (clientes vs locales)
  const pins = useMemo(() => {
    if (!detalle?.clientes) return [];
    if (modo === "locales") {
      return detalle.clientes.flatMap((c) =>
        c.locales
          .filter((l) => l.latitud != null && l.longitud != null)
          .map((l) => ({
            id: l.id,
            lat: l.latitud,
            lng: l.longitud,
            tipo: l.tipo,
            titulo: l.nombre || c.nombre,
            subtitulo: [l.direccion, l.distrito].filter(Boolean).join(" · "),
            es_principal: l.es_principal,
            cliente: c.nombre,
          }))
      );
    }
    // modo === clientes: un pin por cliente (en su local principal)
    return detalle.clientes
      .map((c) => {
        const principal = c.locales.find((l) => l.es_principal && l.latitud != null);
        const cualquiera = principal || c.locales.find((l) => l.latitud != null);
        if (!cualquiera) return null;
        return {
          id: `cli-${c.cuenta_partner_odoo_id}`,
          lat: cualquiera.latitud,
          lng: cualquiera.longitud,
          tipo: cualquiera.tipo,
          titulo: c.nombre,
          subtitulo: c.locales.length > 1 ? `${c.locales.length} locales` : (cualquiera.direccion || ""),
          es_principal: true,
          amount_12m: c.amount_12m,
          estado_auto: c.estado_auto,
        };
      })
      .filter(Boolean);
  }, [detalle, modo]);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !L || !containerRef.current) return;
      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, {
          center: centroidOf(detalle.departamento) || [-12, -77],
          zoom: 11,
          scrollWheelZoom: true,
          attributionControl: false,
        });
        L.tileLayer(
          "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
          { maxZoom: 19, subdomains: "abcd" }
        ).addTo(mapRef.current);
      }

      // Limpiar pins previos
      if (layerRef.current) layerRef.current.remove();
      layerRef.current = L.layerGroup().addTo(mapRef.current);

      const bounds = [];
      pins.forEach((p) => {
        const tipoMeta = TIPO_META[p.tipo] || TIPO_META.otro;
        const html = `
          <div style="
            display:flex;align-items:center;justify-content:center;
            width:32px;height:32px;border-radius:50%;
            background:${tipoMeta.color};color:#fff;
            border:2px solid #fff;
            font-size:16px;line-height:1;
            box-shadow:0 1px 4px rgba(0,0,0,0.25);
          ">${tipoMeta.emoji}</div>
        `;
        const icon = L.divIcon({
          html,
          className: "depto-pin-icon",
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });
        const m = L.marker([p.lat, p.lng], { icon }).addTo(layerRef.current);
        m.bindTooltip(
          `<div style="min-width:140px"><b>${p.titulo}</b><br><span style="color:#64748b;font-size:11px">${p.subtitulo || tipoMeta.label}</span></div>`,
          { direction: "top", offset: [0, -8] }
        );
        bounds.push([p.lat, p.lng]);
      });

      if (bounds.length > 1) {
        mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      } else if (bounds.length === 1) {
        mapRef.current.setView(bounds[0], 13);
      } else if (detalle.bounds) {
        mapRef.current.fitBounds(
          [[detalle.bounds.min_lat, detalle.bounds.min_lng], [detalle.bounds.max_lat, detalle.bounds.max_lng]],
          { padding: [40, 40] }
        );
      }
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [pins, detalle]);

  useEffect(() => () => {
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
  }, []);

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="rounded-lg border border-slate-200 overflow-hidden bg-slate-50"
        style={{ height: 520 }}
      />
      <div className="flex items-center gap-3 text-[11px] text-slate-500 pl-1 flex-wrap">
        <span>{pins.length} pins en {detalle.departamento.toLowerCase()}</span>
        <span>·</span>
        {Object.entries(TIPO_META).filter(([k]) => k !== "otro").map(([key, meta]) => (
          <span key={key} className="flex items-center gap-1">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ background: meta.color }}
            />
            {meta.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ────────────── Sidebar detalle: KPIs + lista de clientes ──────────────
function SidebarDetalle({ detalle, modo, setModo }) {
  const k = detalle.kpis || {};
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      {/* Toggle modo */}
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <div className="font-semibold text-slate-900">{detalle.departamento}</div>
        <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-xs">
          <button
            onClick={() => setModo("clientes")}
            className={`px-2.5 py-1 ${modo === "clientes" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            Por cliente
          </button>
          <button
            onClick={() => setModo("locales")}
            className={`px-2.5 py-1 ${modo === "locales" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            Por local
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 p-3 border-b border-slate-200">
        <KpiBox label="Venta YTD"      value={fmtMoneyShort(k.amount_ytd)} />
        <KpiBox label="Ticket prom."   value={fmtMoneyShort(k.ticket_promedio)} />
        <KpiBox label="Activos"        value={`${k.activos || 0}/${k.total_clientes || 0}`} accent="text-emerald-700" />
        <KpiBox label="Clientes"       value={`${k.total_clientes || 0}`} sublabel={`${k.total_locales || 0} locales`} />
      </div>

      {/* Lista */}
      <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between bg-slate-50">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
          {modo === "clientes" ? `Clientes (${detalle.clientes.length})` : `Locales (${k.total_locales || 0})`}
        </span>
      </div>
      <ul className="divide-y divide-slate-100 max-h-[360px] overflow-y-auto">
        {modo === "clientes" ? (
          detalle.clientes.map((c) => (
            <ClienteRow key={c.cuenta_partner_odoo_id} cliente={c} />
          ))
        ) : (
          detalle.clientes.flatMap((c) =>
            c.locales.map((l) => (
              <LocalRow key={l.id} local={l} clienteNombre={c.nombre} />
            ))
          )
        )}
        {detalle.clientes.length === 0 && (
          <li className="px-4 py-8 text-sm text-slate-500 text-center">
            Sin clientes en este departamento.
          </li>
        )}
      </ul>
    </div>
  );
}

function KpiBox({ label, value, sublabel, accent }) {
  return (
    <div className="border border-slate-200 rounded-md px-3 py-2 bg-white">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">{label}</div>
      <div className={`text-lg font-bold mt-0.5 font-mono ${accent || "text-slate-900"}`}>{value}</div>
      {sublabel && <div className="text-[10px] text-slate-400 mt-0.5">{sublabel}</div>}
    </div>
  );
}

function ClienteRow({ cliente }) {
  const tipoMeta = TIPO_META[cliente.locales[0]?.tipo] || TIPO_META.otro;
  const principal = cliente.locales.find((l) => l.es_principal) || cliente.locales[0];
  const estadoBadge = {
    vip:       { bg: "rgba(217,119,6,.12)",  fg: "#B45309", label: "VIP" },
    activo:    { bg: "rgba(22,163,74,.12)",  fg: "#15803D", label: "Activo" },
    nuevo:     { bg: "rgba(42,111,219,.12)", fg: "#1E54B0", label: "Nuevo" },
    en_riesgo: { bg: "rgba(249,115,22,.16)", fg: "#C2410C", label: "Riesgo" },
    dormido:   { bg: "rgba(107,114,128,.14)",fg: "#374151", label: "Dormido" },
    perdido:   { bg: "rgba(220,38,38,.12)",  fg: "#991B1B", label: "Perdido" },
  }[cliente.estado_auto];

  return (
    <li className="px-4 py-3">
      <a
        href={`/cuentas/${cliente.cuenta_partner_odoo_id}?tab=locales`}
        className="flex items-start gap-3 hover:bg-slate-50 -mx-4 px-4 py-1 rounded transition-colors"
      >
        <div
          className="flex-shrink-0 w-9 h-9 rounded-md flex items-center justify-center text-lg mt-0.5"
          style={{ background: tipoMeta.color + "22", color: tipoMeta.color }}
        >
          {tipoMeta.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-900 truncate">{cliente.nombre}</span>
            {estadoBadge && (
              <span
                className="text-[9px] font-bold uppercase px-1 py-0.5 rounded"
                style={{ background: estadoBadge.bg, color: estadoBadge.fg }}
              >
                {estadoBadge.label}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {principal?.nombre || tipoMeta.label}
            {cliente.locales.length > 1 && (
              <span className="text-slate-400"> · {cliente.locales.length} locales</span>
            )}
            {principal?.distrito && <span> · {principal.distrito}</span>}
          </div>
        </div>
        <div className="text-right">
          <div className="font-bold text-slate-900 text-sm font-mono">
            {fmtMoneyShort(cliente.amount_12m)}
          </div>
          <div className="text-[10px] uppercase text-slate-400 tracking-wider">12m</div>
        </div>
      </a>
    </li>
  );
}

function LocalRow({ local, clienteNombre }) {
  const tipoMeta = TIPO_META[local.tipo] || TIPO_META.otro;
  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div
          className="flex-shrink-0 w-9 h-9 rounded-md flex items-center justify-center text-lg mt-0.5"
          style={{ background: tipoMeta.color + "22", color: tipoMeta.color }}
        >
          {tipoMeta.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-900 truncate">{local.nombre || tipoMeta.label}</span>
            {local.es_principal && (
              <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-slate-900 text-white">
                Principal
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {clienteNombre}
            {local.distrito && <span> · {local.distrito}</span>}
          </div>
        </div>
        <div
          className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded self-center"
          style={{ background: tipoMeta.color + "22", color: tipoMeta.color }}
        >
          {tipoMeta.label}
        </div>
      </div>
    </li>
  );
}
