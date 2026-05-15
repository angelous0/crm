/**
 * LocalModal — crear / editar un local comercial de la cuenta.
 *
 * Características:
 * - Selector visual de tipo (galería, calle, mercado, boutique, mall, otro)
 * - Departamento/distrito como selectores cargados desde UBIGEO
 * - Buscador de dirección por texto (geocoder Nominatim)
 * - Mapa Leaflet con click para fijar pin + marker arrastrable
 * - Toggle "Marcar como local principal"
 */
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Crosshair, Search, ExternalLink, ClipboardPaste, AlertTriangle } from "lucide-react";
import { useUbigeo } from "@/hooks/useUbigeo";
import { DEPARTAMENTOS_PE, DEPARTAMENTOS_BO, normalizeDepartamento } from "@/components/cuentas/perfil-options";

// Misma carga lazy de Leaflet que en LocalesTab
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

const TIPOS = [
  { value: "galeria",  label: "Galería",  emoji: "🏬" },
  { value: "calle",    label: "Calle",    emoji: "🏪" },
  { value: "mercado",  label: "Mercado",  emoji: "🧺" },
  { value: "boutique", label: "Boutique", emoji: "👗" },
  { value: "mall",     label: "Mall",     emoji: "🛍️" },
  { value: "otro",     label: "Otro",     emoji: "📍" },
];

const LIMA_CENTER = [-12.0464, -77.0428];

// ─── Normalizador de direcciones peruanas ───
// Las vendedoras (y Odoo) escriben con abreviaciones, números mal puestos,
// repeticiones tipo "CUSCO - CUSCO - CUSCO", etc. Esta función limpia esos
// patrones para que Nominatim pueda parsear la calle real.
function normalizarDireccion(raw) {
  if (!raw) return "";
  let q = String(raw).trim();

  // 1) Quitar prefijos de número que rompen el parsing
  //    "NRO. 238" → "238" / "Nº 455" → "455" / "N° 12" → "12"
  q = q.replace(/\b(NRO\.?|N°|Nº|No\.?|NUM(?:ERO)?\.?)\s*/gi, "");

  // 2) Quitar interior/dpto/piso/manzana/lote — Nominatim no los entiende
  q = q.replace(/\bINT(?:ERIOR)?\.?\s*[A-Z0-9\-]+/gi, "");
  q = q.replace(/\bDPTO\.?\s*[A-Z0-9\-]+/gi, "");
  q = q.replace(/\bDEPTO\.?\s*[A-Z0-9\-]+/gi, "");
  q = q.replace(/\bPISO\s*[A-Z0-9\-]+/gi, "");
  q = q.replace(/\bMZ(?:A|NA)?\.?\s*[A-Z0-9\-]+/gi, "");
  q = q.replace(/\bLT\.?\s*[A-Z0-9\-]+/gi, "");
  q = q.replace(/\bSEC(?:TOR)?\.?\s*[A-Z0-9\-]+/gi, "");

  // 3) Expandir abreviaciones de vía. Usamos lookahead para que el "."
  //    opcional se consuma SIEMPRE (sino "AV." quedaría como "Avenida.").
  q = q.replace(/\bAV\.?(?=\s|$|[,;])/gi, "Avenida");
  q = q.replace(/\bJR\.?(?=\s|$|[,;])/gi, "Jirón");
  q = q.replace(/\bCA\.?(?=\s|$|[,;])/gi, "Calle");
  q = q.replace(/\bPSJE\.?(?=\s|$|[,;])/gi, "Pasaje");
  q = q.replace(/\bPSJ\.?(?=\s|$|[,;])/gi, "Pasaje");
  q = q.replace(/\bPROL\.?(?=\s|$|[,;])/gi, "Prolongación");
  q = q.replace(/\bURB\.?(?=\s|$|[,;])/gi, "Urbanización");
  q = q.replace(/\bAA\.?HH\.?(?=\s|$|[,;])/gi, "Asentamiento Humano");

  // 4) Aplanar guiones y comas a espacio simple ANTES de la dedup
  //    para que "LIMA - LIMA" cuente como duplicado consecutivo.
  q = q.replace(/\s*[-,]\s*/g, " ");

  // 5) Quitar repeticiones consecutivas: "CUSCO CUSCO CUSCO" → "CUSCO"
  const tokens = q.split(/\s+/).filter(Boolean);
  const dedup = [];
  let lastLower = null;
  for (const t of tokens) {
    const low = t.replace(/[^\wáéíóúñ]/gi, "").toLowerCase();
    if (low && low === lastLower) continue;
    dedup.push(t);
    if (low) lastLower = low;
  }
  q = dedup.join(" ").replace(/\s+/g, " ").trim();

  return q;
}

// Construye la query final con distrito + departamento al final (sin duplicar)
function armarQuery(direccion, distrito, departamento) {
  const dir = normalizarDireccion(direccion);
  const dist = (distrito || "").trim();
  const dep = (departamento || "").trim();
  const dirLower = dir.toLowerCase();
  const partes = [dir];
  if (dist && !dirLower.includes(dist.toLowerCase())) partes.push(dist);
  if (dep && !dirLower.includes(dep.toLowerCase())) partes.push(dep);
  return partes.filter(Boolean).join(", ");
}

// Versión simplificada: quita el número de calle para fallback
function quitarNumero(dir) {
  return dir.replace(/\b\d{1,5}[A-Z]?\b/g, "").replace(/\s+/g, " ").trim();
}

// Geocoder vía Nominatim (OpenStreetMap) con fallbacks
async function nominatimSearch(query, pais = "PE") {
  const country = pais === "BO" ? "bo" : "pe";
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=${country}&q=${encodeURIComponent(query)}`;
  const r = await fetch(url, { headers: { "Accept-Language": "es" } });
  if (!r.ok) throw new Error("Error en geocoder");
  const data = await r.json();
  return data.map((d) => ({
    lat: Number(d.lat),
    lng: Number(d.lon),
    label: d.display_name,
    // addresstype: "house"/"building" → match preciso (con número)
    //              "road"/"highway"   → solo calle (sin número)
    //              otros              → ciudad/distrito/etc
    addresstype: d.addresstype || d.type,
    osmType: d.osm_type,
    isPrecise: ["house", "building"].includes(d.addresstype),
    isStreetOnly: ["road"].includes(d.addresstype) || d.category === "highway",
  }));
}

// Estrategia de búsqueda con cascada de fallbacks
async function buscarConFallback({ texto, direccion, distrito, departamento, pais }) {
  const intentos = [];

  if (texto && texto.trim()) {
    // Si el user escribió algo, primero lo intentamos normalizado
    const norm = normalizarDireccion(texto);
    intentos.push(norm);
    // Y como fallback, agregamos depto/distrito si no están
    const conTail = armarQuery(texto, distrito, departamento);
    if (conTail !== norm) intentos.push(conTail);
  } else {
    // Sin texto del user: armar desde los campos del form
    const full = armarQuery(direccion, distrito, departamento);
    if (full) intentos.push(full);

    // Fallback: dirección sin número
    const sinNum = armarQuery(quitarNumero(direccion || ""), distrito, departamento);
    if (sinNum && sinNum !== full) intentos.push(sinNum);

    // Fallback final: solo distrito + depto
    const soloLocalidad = [distrito, departamento].filter(Boolean).join(", ");
    if (soloLocalidad) intentos.push(soloLocalidad);
  }

  for (const q of intentos) {
    if (!q || !q.trim()) continue;
    const results = await nominatimSearch(q, pais);
    if (results.length > 0) return { results, queryUsada: q };
  }
  return { results: [], queryUsada: intentos[intentos.length - 1] || "" };
}

export function LocalModal({ partnerOdooId, local, onClose, onSaved }) {
  const isEdit = !!local;
  const [form, setForm] = useState(() => ({
    nombre:       local?.nombre || "",
    tipo:         local?.tipo || "calle",
    referencia:   local?.referencia || "",
    direccion:    local?.direccion || "",
    distrito:     local?.distrito || "",
    departamento: local?.departamento ? (normalizeDepartamento(local.departamento, local?.pais || "PE") || local.departamento) : "",
    pais:         local?.pais || "PE",
    latitud:      local?.latitud != null ? Number(local.latitud) : null,
    longitud:     local?.longitud != null ? Number(local.longitud) : null,
    es_principal: !!local?.es_principal,
  }));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  // Tracking del origen del pin: 'auto' = lo puso la búsqueda automática,
  // 'manual' = el user lo movió/clickeó/pegó/buscó explícito.
  // Si es 'auto', se re-dispara la búsqueda al cambiar dirección/depto/distrito.
  // Si es 'manual', NO se re-dispara (respetamos lo que ajustó la vendedora).
  const [pinSource, setPinSource] = useState(() => {
    if (local?.latitud != null && local?.longitud != null) return "manual";
    return null;
  });
  const [autoSearching, setAutoSearching] = useState(false);

  // Signal para que el mapa haga zoom + centrado cuando una búsqueda
  // (manual, automática o paste) coloca el pin. Cada incremento dispara
  // el flyTo en PinMap. No se incrementa por drags/clicks dentro del mapa.
  const [flyToSignal, setFlyToSignal] = useState(0);
  const triggerFlyTo = () => setFlyToSignal((n) => n + 1);

  // UBIGEO (depto/distrito)
  const { ubigeo, loading: ubigeoLoading } = useUbigeo(form.pais);
  const deptosUbigeo = useMemo(() => ubigeo ? Object.keys(ubigeo).sort() : [], [ubigeo]);
  const distritosUbigeo = useMemo(() => {
    if (!ubigeo || !form.departamento) return [];
    const provs = ubigeo[form.departamento] || {};
    const lista = new Set();
    Object.values(provs).forEach((dists) => (dists || []).forEach((d) => lista.add(d)));
    return Array.from(lista).sort();
  }, [ubigeo, form.departamento]);
  const departamentosFallback = form.pais === "BO" ? DEPARTAMENTOS_BO : DEPARTAMENTOS_PE;
  const departamentosOptions = deptosUbigeo.length > 0 ? deptosUbigeo : departamentosFallback;

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleMapClick = useCallback((lat, lng) => {
    setForm((f) => ({ ...f, latitud: lat, longitud: lng }));
    // Si el user ajusta manualmente, ya no es impreciso ni se re-busca
    setImprecisoWarning(false);
    setPinSource("manual");
  }, []);

  // ─── Geocoder: busca dirección y posiciona el pin ───
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [imprecisoWarning, setImprecisoWarning] = useState(false);

  // ─── Auto-búsqueda silenciosa al cambiar dirección / depto / distrito ───
  // Se dispara debounced 1.2s después de la última edición. Solo si:
  //   1) Hay al menos dirección o (depto + distrito) que justifique buscar.
  //   2) No hay pin manual fijado por la vendedora (pinSource !== 'manual').
  // Si encuentra match, posiciona el pin pero deja pinSource='auto' para
  // que la próxima edición vuelva a re-buscar.
  const lastAutoQueryRef = useRef("");
  useEffect(() => {
    // No auto-buscar si el user ya ajustó el pin a mano
    if (pinSource === "manual") return;

    const tieneDireccion = !!(form.direccion && form.direccion.trim().length >= 4);
    const tieneLocalidad = !!(form.departamento || form.distrito);
    if (!tieneDireccion && !tieneLocalidad) return;

    // Construir la query a probar
    const q = armarQuery(form.direccion, form.distrito, form.departamento);
    if (!q || q.length < 4) return;
    // Evitar re-buscar la misma query
    if (q === lastAutoQueryRef.current) return;

    const timer = setTimeout(async () => {
      lastAutoQueryRef.current = q;
      setAutoSearching(true);
      try {
        const { results } = await buscarConFallback({
          texto: "",
          direccion:    form.direccion,
          distrito:     form.distrito,
          departamento: form.departamento,
          pais:         form.pais,
        });
        if (results.length > 0) {
          const r0 = results[0];
          setForm((f) => ({ ...f, latitud: r0.lat, longitud: r0.lng }));
          setPinSource("auto");
          setImprecisoWarning(!!r0.isStreetOnly);
          triggerFlyTo();
        }
      } catch (_) {
        // silencioso: si falla, el user puede usar el botón manual
      } finally {
        setAutoSearching(false);
      }
    }, 1200);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.direccion, form.distrito, form.departamento, form.pais, pinSource]);

  const handleBuscar = async () => {
    const texto = (searchQuery || "").trim();
    const tieneAlgo = texto || form.direccion || form.distrito || form.departamento;
    if (!tieneAlgo) {
      toast.warning("Escribe una dirección o llena los campos para buscar");
      return;
    }
    setSearching(true);
    setSearchResults([]);
    setImprecisoWarning(false);
    try {
      const { results, queryUsada } = await buscarConFallback({
        texto,
        direccion:    form.direccion,
        distrito:     form.distrito,
        departamento: form.departamento,
        pais:         form.pais,
      });
      if (results.length === 0) {
        toast.info(
          "No se encontró ubicación. Probá una dirección más simple (ej: 'Jr Dafnes 455 Lima') o haz click en el mapa.",
          { duration: 6000 }
        );
      } else if (results.length === 1) {
        const r0 = results[0];
        setForm((f) => ({ ...f, latitud: r0.lat, longitud: r0.lng }));
        setPinSource("manual"); // búsqueda explícita = intención manual
        triggerFlyTo();
        if (r0.isStreetOnly) {
          // OpenStreetMap no tiene el número exacto, solo la calle
          setImprecisoWarning(true);
          toast.warning("Solo encontramos la calle. Ajusta el pin al edificio exacto.", { duration: 5000 });
        } else if (r0.isPrecise) {
          toast.success("Ubicación encontrada (precisa)");
        } else {
          toast.success("Ubicación aproximada encontrada");
        }
      } else {
        setSearchResults(results);
      }
      // Mostrar al user qué query terminó funcionando (debug ligero)
      if (queryUsada && queryUsada !== texto) {
        setSearchQuery(queryUsada);
      }
    } catch (e) {
      toast.error("Error buscando dirección");
    } finally {
      setSearching(false);
    }
  };

  // Abre Google Maps con la query para verificación visual
  const abrirEnGoogleMaps = () => {
    const q = (searchQuery || "").trim()
      || [form.direccion, form.distrito, form.departamento].filter(Boolean).join(", ");
    if (!q) {
      toast.warning("Escribe una dirección primero");
      return;
    }
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  // Pega coordenadas copiadas desde Google Maps (formato: "lat, lng")
  const pegarCoordsDesdePortapapeles = async () => {
    try {
      const text = await navigator.clipboard.readText();
      // Acepta "-13.5229086, -71.9809856" o "-13.5229086,-71.9809856"
      const m = text.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
      if (!m) {
        toast.warning("No encontré coordenadas en el portapapeles. Copia desde Google Maps haciendo click derecho.");
        return;
      }
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        toast.error("Las coordenadas copiadas son inválidas");
        return;
      }
      setForm((f) => ({ ...f, latitud: lat, longitud: lng }));
      setImprecisoWarning(false);
      setPinSource("manual");
      triggerFlyTo();
      toast.success("Coordenadas pegadas");
    } catch (e) {
      toast.error("No pude leer el portapapeles");
    }
  };

  const pickResult = (r) => {
    setForm((f) => ({ ...f, latitud: r.lat, longitud: r.lng }));
    setSearchResults([]);
    setPinSource("manual");
    triggerFlyTo();
    if (r.isStreetOnly) {
      setImprecisoWarning(true);
      toast.warning("Es solo la calle. Arrastra el pin al edificio exacto.");
    } else {
      setImprecisoWarning(false);
      toast.success("Ubicación fijada");
    }
  };

  // Validación + guardar
  const handleGuardar = async () => {
    const errs = {};
    if (!form.tipo) errs.tipo = "Selecciona un tipo";
    if (form.latitud != null && Math.abs(form.latitud) > 90) errs.latitud = "Latitud inválida";
    if (form.longitud != null && Math.abs(form.longitud) > 180) errs.longitud = "Longitud inválida";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      const body = { ...form };
      // Normalizar strings vacíos → null
      Object.keys(body).forEach((k) => {
        if (typeof body[k] === "string" && body[k].trim() === "") body[k] = null;
      });
      if (isEdit) {
        await api.patch(`/cuentas/${partnerOdooId}/locales/${local.id}`, body);
        toast.success("Local actualizado");
      } else {
        await api.post(`/cuentas/${partnerOdooId}/locales`, body);
        toast.success("Local creado");
      }
      onSaved?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error guardando local");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar local" : "Nuevo local"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tipo de local */}
          <div>
            <Label className="text-xs uppercase tracking-wide text-slate-500">Tipo de local</Label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-1.5">
              {TIPOS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setField("tipo", t.value)}
                  className={`flex flex-col items-center gap-1 py-2 px-1 rounded-md border text-xs transition-colors ${
                    form.tipo === t.value
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                  }`}
                >
                  <span className="text-xl leading-none">{t.emoji}</span>
                  <span className="font-medium uppercase tracking-wide">{t.label}</span>
                </button>
              ))}
            </div>
            {errors.tipo && <div className="text-xs text-rose-600 mt-1">{errors.tipo}</div>}
          </div>

          {/* Nombre + Referencia */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="loc-nombre" className="text-xs uppercase tracking-wide text-slate-500">
                Nombre del local
              </Label>
              <Input
                id="loc-nombre"
                value={form.nombre}
                onChange={(e) => setField("nombre", e.target.value)}
                placeholder="Ej: Distribuidora Vilca · Sucursal Centro"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="loc-ref" className="text-xs uppercase tracking-wide text-slate-500">
                Referencia
              </Label>
              <Input
                id="loc-ref"
                value={form.referencia}
                onChange={(e) => setField("referencia", e.target.value)}
                placeholder="Frente a la plaza, al lado de..."
                className="mt-1"
              />
            </div>
          </div>

          {/* Dirección */}
          <div>
            <Label htmlFor="loc-dir" className="text-xs uppercase tracking-wide text-slate-500">
              Dirección
            </Label>
            <Input
              id="loc-dir"
              value={form.direccion}
              onChange={(e) => setField("direccion", e.target.value)}
              placeholder="Jr. Mercaderes 318"
              className="mt-1"
            />
          </div>

          {/* Distrito + Departamento (selectors) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="loc-depto" className="text-xs uppercase tracking-wide text-slate-500">
                Departamento {ubigeoLoading && <span className="text-slate-400">(cargando…)</span>}
              </Label>
              <select
                id="loc-depto"
                value={form.departamento}
                onChange={(e) => setField("departamento", e.target.value)}
                className="mt-1 w-full h-10 px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="">— Seleccionar —</option>
                {departamentosOptions.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="loc-dist" className="text-xs uppercase tracking-wide text-slate-500">
                Distrito
              </Label>
              {distritosUbigeo.length > 0 ? (
                <select
                  id="loc-dist"
                  value={form.distrito}
                  onChange={(e) => setField("distrito", e.target.value)}
                  className="mt-1 w-full h-10 px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="">— Seleccionar —</option>
                  {distritosUbigeo.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              ) : (
                <Input
                  id="loc-dist"
                  value={form.distrito}
                  onChange={(e) => setField("distrito", e.target.value)}
                  placeholder={form.departamento ? "Escribir distrito" : "Selecciona depto primero"}
                  disabled={!form.departamento}
                  className="mt-1"
                />
              )}
            </div>
          </div>

          {/* Buscador en mapa + Mapa */}
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-slate-500">
                Ubicación en el mapa
              </Label>
              {autoSearching ? (
                <span className="text-[11px] text-slate-500 italic flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> buscando automáticamente…
                </span>
              ) : pinSource === "auto" ? (
                <span className="text-[11px] text-emerald-700 italic">
                  ubicación automática · arrastra para ajustar
                </span>
              ) : (
                <span className="text-[11px] text-slate-500 italic">buscar o click para fijar</span>
              )}
            </div>

            <div className="flex gap-2 mt-1.5">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleBuscar(); } }}
                placeholder='Ej: "Jr. Dafnes 455, Lima"'
                className="flex-1"
              />
              <Button type="button" onClick={handleBuscar} disabled={searching} variant="outline">
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="ml-1.5">Buscar</span>
              </Button>
            </div>

            {searchResults.length > 1 && (
              <div className="mt-2 border border-slate-200 rounded-md bg-white overflow-hidden">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 px-3 py-1.5 bg-slate-50 border-b border-slate-200">
                  Elige el resultado correcto
                </div>
                <ul className="max-h-44 overflow-y-auto">
                  {searchResults.map((r, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => pickResult(r)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0"
                      >
                        <div className="flex items-center gap-1.5">
                          {r.isPrecise && (
                            <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-emerald-100 text-emerald-700">
                              preciso
                            </span>
                          )}
                          {r.isStreetOnly && (
                            <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-amber-100 text-amber-700">
                              solo calle
                            </span>
                          )}
                          <span className="text-slate-900 truncate">{r.label}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          {r.lat.toFixed(5)}, {r.lng.toFixed(5)}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Warning cuando OSM solo tiene la calle, no el edificio */}
            {imprecisoWarning && (
              <div className="mt-2 border border-amber-300 bg-amber-50 rounded-md px-3 py-2 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 text-xs text-amber-900">
                  <div className="font-semibold">OpenStreetMap no tiene el número exacto</div>
                  <div className="mt-0.5">
                    Solo encontramos la calle. Para mayor precisión: <b>arrastra el pin</b> al edificio
                    correcto, o usa Google Maps abajo para verificar.
                  </div>
                </div>
              </div>
            )}

            {/* Acciones de verificación con Google Maps */}
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                type="button"
                onClick={abrirEnGoogleMaps}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Verificar en Google Maps
              </button>
              <button
                type="button"
                onClick={pegarCoordsDesdePortapapeles}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                title="Click derecho en Google Maps → copia las coordenadas → pégalas acá"
              >
                <ClipboardPaste className="h-3.5 w-3.5" /> Pegar coords de Google Maps
              </button>
            </div>

            <div className="mt-2">
              <PinMap
                lat={form.latitud}
                lng={form.longitud}
                onPick={handleMapClick}
                flyToSignal={flyToSignal}
                isPrecise={!imprecisoWarning && (form.latitud != null)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-slate-400">Latitud</Label>
                <Input
                  type="number"
                  step="0.0000001"
                  value={form.latitud != null ? form.latitud : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setField("latitud", v === "" ? null : Number(v));
                    setPinSource("manual");
                  }}
                  className="mt-0.5 h-8 text-xs font-mono"
                />
                {errors.latitud && <div className="text-[11px] text-rose-600 mt-0.5">{errors.latitud}</div>}
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-slate-400">Longitud</Label>
                <Input
                  type="number"
                  step="0.0000001"
                  value={form.longitud != null ? form.longitud : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setField("longitud", v === "" ? null : Number(v));
                    setPinSource("manual");
                  }}
                  className="mt-0.5 h-8 text-xs font-mono"
                />
                {errors.longitud && <div className="text-[11px] text-rose-600 mt-0.5">{errors.longitud}</div>}
              </div>
            </div>
          </div>

          {/* Toggle principal */}
          <div className="flex items-center justify-between border border-slate-200 rounded-md px-3 py-2.5 bg-slate-50">
            <div>
              <div className="text-sm font-medium text-slate-900">Marcar como local principal</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Solo un local puede ser principal por cuenta.
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.es_principal}
              onClick={() => setField("es_principal", !form.es_principal)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                form.es_principal ? "bg-slate-900" : "bg-slate-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                  form.es_principal ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleGuardar} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {isEdit ? "Guardar cambios" : "Crear local"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───── Mapa con click para fijar pin ─────
function PinMap({ lat, lng, onPick, flyToSignal = 0, isPrecise = false }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // Inicialización del mapa
  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !L || !containerRef.current || mapRef.current) return;
      const center = (lat != null && lng != null) ? [lat, lng] : LIMA_CENTER;
      const zoom = (lat != null && lng != null) ? 17 : 6;
      mapRef.current = L.map(containerRef.current, { center, zoom });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(mapRef.current);

      mapRef.current.on("click", (e) => {
        const { lat: la, lng: lo } = e.latlng;
        onPickRef.current?.(Number(la.toFixed(7)), Number(lo.toFixed(7)));
      });

      // Forzar resize cuando el modal termina de animar
      setTimeout(() => mapRef.current?.invalidateSize(), 250);
    }).catch(() => {});

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Actualizar el marker cuando cambia lat/lng
  useEffect(() => {
    if (!window.L || !mapRef.current) return;
    const L = window.L;
    if (lat == null || lng == null) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }
    const html = `
      <div style="
        display:flex;align-items:center;justify-content:center;
        width:36px;height:36px;border-radius:50%;
        background:#1f2937;color:#fff;border:2px solid #1f2937;
        font-size:18px;line-height:1;box-shadow:0 1px 3px rgba(0,0,0,0.3);
      ">📍</div>
    `;
    const icon = L.divIcon({
      html,
      className: "local-marker-icon",
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
      markerRef.current.setIcon(icon);
    } else {
      markerRef.current = L.marker([lat, lng], { icon, draggable: true }).addTo(mapRef.current);
      markerRef.current.on("dragend", (e) => {
        const ll = e.target.getLatLng();
        onPickRef.current?.(Number(ll.lat.toFixed(7)), Number(ll.lng.toFixed(7)));
      });
    }
    mapRef.current.panTo([lat, lng]);
  }, [lat, lng]);

  // ─── flyTo cuando el padre dispara una nueva búsqueda ───
  // Esto pasa cuando la search (manual/auto/paste) coloca el pin desde
  // afuera. Forzamos zoom 17-18 + centro para que el pin sea visible.
  // Clicks/drags DENTRO del mapa no bumpean flyToSignal, así que no zooma.
  useEffect(() => {
    if (!mapRef.current || flyToSignal === 0) return;
    if (lat == null || lng == null) return;
    const targetZoom = isPrecise ? 18 : 17;
    try {
      mapRef.current.flyTo([lat, lng], targetZoom, { duration: 0.8 });
    } catch (_) {
      mapRef.current.setView([lat, lng], targetZoom);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyToSignal]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden relative">
      <div ref={containerRef} style={{ height: 220, width: "100%" }} />
      {(lat == null || lng == null) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-white/90 backdrop-blur px-3 py-1.5 rounded-md text-xs text-slate-700 shadow flex items-center gap-1.5">
            <Crosshair className="h-3.5 w-3.5" /> Click sobre el mapa o usa el buscador
          </div>
        </div>
      )}
    </div>
  );
}
