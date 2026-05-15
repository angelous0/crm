/**
 * VentasEnVivo — panel real-time de ventas POS con alertas.
 *
 * Patrón:
 *   - Polling /api/cuentas/ventas-en-vivo cada 5s
 *   - Comparar con el snapshot anterior → detectar ventas NUEVAS
 *   - Para cada nueva venta con alerta:
 *       • Toast en pantalla
 *       • Sonido beep
 *       • Browser notification (si user permitió)
 *       • Title flash (badge en la pestaña)
 *
 * Alertas posibles por venta:
 *   - cliente_nuevo (<30d): pedir datos
 *   - falta_telefono: pedir teléfono
 *   - falta_departamento: pedir depto
 *   - tiene_credito_pendiente: recordar cuenta pendiente
 *   - tiene_reservas: revisar reservas
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle, Loader2, Bell, BellOff, Volume2, VolumeX, Phone,
  MapPin, CreditCard, Bookmark, Sparkles, MessageCircle, Clock,
  Store, User as UserIcon, ArrowRight, FlaskConical, ExternalLink,
} from "lucide-react";
import { CorregirDrawer } from "@/components/cuentas/CorregirDrawer";

const fmtMoney = (n) =>
  "S/ " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtMoneyDec = (n) =>
  "S/ " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function timeAgo(iso) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `hace ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

// Hora exacta en formato corto "14:43" — Lima TZ
function horaCorta(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("es-PE", {
    hour: "2-digit", minute: "2-digit", hour12: false,
    timeZone: "America/Lima",
  });
}

// Beep sintético con Web Audio API — sin necesidad de archivo MP3
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 660;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    // segundo beep
    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.value = 880;
      osc2.type = "sine";
      gain2.gain.setValueAtTime(0.12, ctx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc2.start();
      osc2.stop(ctx.currentTime + 0.25);
    }, 200);
  } catch (e) {}
}

// Browser notification (requiere permiso del usuario)
function notifyBrowser(title, body, onClick) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, {
      body,
      icon: "/favicon.ico",
      tag: "venta-en-vivo",
      requireInteraction: false,
    });
    if (onClick) n.onclick = () => { window.focus(); onClick(); n.close(); };
  } catch (e) {}
}

// Title flash — pone contador en la pestaña
let _flashTimer = null;
function flashTitle(count) {
  const orig = document.title.replace(/^\(\d+\)\s*/, "");
  if (count <= 0) {
    document.title = orig;
    if (_flashTimer) { clearInterval(_flashTimer); _flashTimer = null; }
    return;
  }
  const flashed = `🔴 (${count}) ${orig}`;
  document.title = flashed;
  if (_flashTimer) clearInterval(_flashTimer);
  let toggled = false;
  _flashTimer = setInterval(() => {
    toggled = !toggled;
    document.title = toggled ? orig : flashed;
  }, 1200);
}

// ─────────────────────────────────────────────────────────────
// Card de venta
// ─────────────────────────────────────────────────────────────
const COMP_LABEL = {
  FE: { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200" },
  BE: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  NV: { bg: "bg-slate-100",  text: "text-slate-600",   border: "border-slate-200" },
  TK: { bg: "bg-slate-100",  text: "text-slate-600",   border: "border-slate-200" },
};

function VentaCard({ venta, onClick }) {
  const { flags, has_alert, _is_fake } = venta;
  const compCfg = COMP_LABEL[venta.tipo_comp] || COMP_LABEL.NV;
  // Alertas GRAVES (rojas): bloquean seguimiento o son riesgo financiero
  const isGrave = flags.falta_telefono || flags.falta_departamento || flags.tiene_credito_pendiente;
  const borderClr = _is_fake && !has_alert
    ? "border-purple-300 bg-purple-50/30"
    : !has_alert
      ? "border-slate-200"
      : isGrave
        ? "border-red-300 bg-red-50/30"
        : "border-amber-200";

  return (
    <div
      className={`bg-white border rounded-lg px-4 py-3 hover:shadow-md transition-shadow cursor-pointer ${borderClr}`}
      onClick={onClick}
      data-testid={`venta-card-${venta.order_id}`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {_is_fake && (
              <Badge variant="outline" className="text-[9px] font-bold bg-purple-100 text-purple-700 border-purple-300">
                🎭 DEMO
              </Badge>
            )}
            <h3 className="text-sm font-semibold text-slate-900 truncate">
              {venta.partner_name || "Sin cliente"}
            </h3>
            {flags.cliente_nuevo && (
              <Badge variant="outline" className="text-[9px] font-bold bg-blue-50 text-blue-700 border-blue-200">
                NUEVO · {venta.dias_desde_alta}d
              </Badge>
            )}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
            {venta.tipo_comp && (
              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${compCfg.bg} ${compCfg.text} ${compCfg.border}`}>
                {venta.tipo_comp} {venta.num_comp}
              </span>
            )}
            {venta.tienda && (
              <span className="inline-flex items-center gap-1"><Store className="h-2.5 w-2.5" /> {venta.tienda}</span>
            )}
            {venta.vendedor && (
              <span className="inline-flex items-center gap-1"><UserIcon className="h-2.5 w-2.5" /> {venta.vendedor}</span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-base font-semibold tabular-nums" style={{ fontFamily: "var(--font-display)" }}>
            {fmtMoneyDec(venta.amount_total)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 inline-flex items-center gap-1 font-mono tabular-nums">
            <Clock className="h-2.5 w-2.5" />
            <span className="font-semibold text-slate-700">{horaCorta(venta.date_order)}</span>
            <span className="text-slate-400">·</span>
            <span>{timeAgo(venta.date_order)}</span>
          </div>
        </div>
      </div>

      {/* Alertas */}
      {has_alert && (
        <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
          {flags.falta_telefono && (
            <div className="flex items-start gap-2 text-[12px]">
              <Phone className="h-3 w-3 text-red-500 shrink-0 mt-0.5" />
              <span className="text-slate-700">
                <b className="text-red-700">Pide el teléfono</b> antes que se vaya el cliente
              </span>
            </div>
          )}
          {flags.falta_departamento && (
            <div className="flex items-start gap-2 text-[12px]">
              <MapPin className="h-3 w-3 text-red-500 shrink-0 mt-0.5" />
              <span className="text-slate-700">
                <b className="text-red-700">Pregunta de dónde es</b> (departamento)
              </span>
            </div>
          )}
          {flags.tiene_credito_pendiente && (
            <div className="flex items-start gap-2 text-[12px]">
              <CreditCard className="h-3 w-3 text-red-600 shrink-0 mt-0.5" />
              <span className="text-slate-700">
                <b className="text-red-700">⚠ Debe {fmtMoney(venta.credito_pendiente)}</b> — recuérdaselo antes que se vaya
              </span>
            </div>
          )}
          {flags.tiene_reservas && (
            <div className="flex items-start gap-2 text-[12px]">
              <Bookmark className="h-3 w-3 text-amber-600 shrink-0 mt-0.5" />
              <span className="text-slate-700">
                <b className="text-amber-700">Tiene {venta.reservas_pendientes} reserva{venta.reservas_pendientes !== 1 ? "s" : ""} pendiente{venta.reservas_pendientes !== 1 ? "s" : ""}</b>
              </span>
            </div>
          )}
          {flags.cliente_nuevo && !flags.falta_telefono && !flags.falta_departamento && (
            <div className="flex items-start gap-2 text-[12px]">
              <Sparkles className="h-3 w-3 text-blue-600 shrink-0 mt-0.5" />
              <span className="text-slate-700">
                <b className="text-blue-700">Cliente nuevo</b> — preséntate y pregunta cómo se enteró
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 5000;
const STORAGE_KEY = "ventas_vivo_prefs";

// ─── Generador de ventas falsas para demo ───────────────────────────────
const FAKE_NOMBRES = [
  "MARÍA QUISPE MAMANI",
  "CARLOS VILCA HUAMÁN",
  "ANA PAREDES SUCA",
  "PEDRO ROJAS HUAYTA",
  "ROSA CHOQUE TICONA",
  "JUAN PÉREZ FLORES",
  "LUZ MAMANI APAZA",
  "MIGUEL TORRES CHURA",
];
const FAKE_TIENDAS = ["GM209", "GM207", "ZAP", "GR238", "GM218", "BOOSH"];
const FAKE_VENDEDORAS = ["Luz", "Jaqueline", "Karla", "Diana"];
const FAKE_DEPTOS = [null, "Lima", "Cusco", "Puno", null, "Arequipa"];

function generarVentaFalsa() {
  const id = -Math.floor(Math.random() * 1000000); // ID negativo = fake (no choca con reales)
  const tipoComp = ["FE", "BE", "NV"][Math.floor(Math.random() * 3)];
  const amount = Math.floor(Math.random() * 800 + 80);
  const partnerName = FAKE_NOMBRES[Math.floor(Math.random() * FAKE_NOMBRES.length)];
  const tienda = FAKE_TIENDAS[Math.floor(Math.random() * FAKE_TIENDAS.length)];
  const vendedor = FAKE_VENDEDORAS[Math.floor(Math.random() * FAKE_VENDEDORAS.length)];
  const dias = Math.floor(Math.random() * 100);
  const depto = FAKE_DEPTOS[Math.floor(Math.random() * FAKE_DEPTOS.length)];
  const phone = Math.random() < 0.4 ? null : `9${Math.floor(Math.random() * 99999999).toString().padStart(8, "0")}`;
  const creditoPendiente = Math.random() < 0.3 ? Math.floor(Math.random() * 5000 + 500) : 0;
  const reservasPendientes = Math.random() < 0.2 ? Math.floor(Math.random() * 3 + 1) : 0;

  const flags = {
    cliente_nuevo: dias < 30,
    falta_telefono: !phone,
    falta_departamento: !depto,
    tiene_credito_pendiente: creditoPendiente > 0,
    tiene_reservas: reservasPendientes > 0,
  };

  return {
    order_id: id,
    order_name: `${tienda}/DEMO-${Math.abs(id) % 10000}`,
    date_order: new Date().toISOString(),
    amount_total: amount,
    tipo_comp: tipoComp,
    num_comp: String(Math.floor(Math.random() * 99999)).padStart(6, "0"),
    empresa: "Ambission",
    partner_id: id,
    partner_name: partnerName,
    phone,
    phone_source: phone ? "mobile" : null,
    depto_actual: depto,
    distrito: null,
    tienda,
    vendedor,
    lines_count: Math.floor(Math.random() * 5 + 1),
    qty_total: Math.floor(Math.random() * 10 + 1),
    credito_pendiente: creditoPendiente,
    reservas_pendientes: reservasPendientes,
    dias_desde_alta: dias,
    flags,
    has_alert: Object.values(flags).some(Boolean),
    _is_fake: true,  // marca para distinguir en la UI
  };
}

export default function VentasEnVivo() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Preferencias persistentes
  const loadPrefs = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
    catch { return {}; }
  };
  const [prefs, setPrefs] = useState(() => ({
    soundEnabled: true,
    notificationsEnabled: false,
    ...loadPrefs(),
  }));

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  }, [prefs]);

  // Snapshot de IDs vistos para detectar nuevas
  const seenIdsRef = useRef(new Set());
  const newCountRef = useRef(0);

  // Ventas fake para demo (no se guardan en backend, solo en memoria del browser)
  const [fakeVentas, setFakeVentas] = useState([]);

  // Drawer de corregir — abre cuando user clickea una venta con problemas
  const [corregirItem, setCorregirItem] = useState(null);

  // Convierte una venta (con flags) al formato que espera CorregirDrawer
  const abrirCorregir = useCallback((venta) => {
    if (venta._is_fake) {
      // Demo: navegar no abre, pero podemos mostrar un toast simulado
      alert("🎭 Esta es una venta DEMO. En vivo, click abre el drawer para completar datos.");
      return;
    }
    if (!venta.flags?.falta_telefono && !venta.flags?.falta_departamento) {
      // Sin problemas críticos en el cliente → mejor navegar a ficha completa
      navigate(`/cuentas/${venta.partner_id}?tab=info`);
      return;
    }
    // Construir cuentaItem compatible con CorregirDrawer
    const problemas = [];
    if (venta.flags.falta_telefono) {
      problemas.push({
        rule: "sin_telefono",
        severidad: "critico",
        label: "Sin teléfono válido",
        detalle: "Cliente sin tel ni móvil — pídelo ahora antes que se vaya",
      });
    }
    if (venta.flags.falta_departamento) {
      problemas.push({
        rule: "sin_departamento",
        severidad: "critico",
        label: "Sin departamento",
        detalle: "Pregunta de dónde es",
      });
    }
    setCorregirItem({
      cuenta_partner_odoo_id: venta.partner_id,
      nombre: venta.partner_name,
      severidad: "critico",
      problemas,
      phone: venta.phone,
      phone_source: venta.phone_source,
      depto_actual: venta.depto_actual,
      tier: null,
      es_nuevo: venta.flags.cliente_nuevo,
    });
  }, [navigate]);

  const simularVenta = useCallback(() => {
    const fake = generarVentaFalsa();
    setFakeVentas((prev) => [fake, ...prev].slice(0, 10)); // máx 10 fakes
    // Disparar alertas igual que una venta real nueva
    if (fake.has_alert) {
      newCountRef.current += 1;
      flashTitle(newCountRef.current);
      if (prefs.soundEnabled) playBeep();
      if (prefs.notificationsEnabled) {
        const titulo = `🎭 [DEMO] ${fake.partner_name} compró`;
        const cuerpo = [
          fake.flags.falta_telefono && "Falta teléfono",
          fake.flags.falta_departamento && "Falta depto",
          fake.flags.tiene_credito_pendiente && `Crédito ${fmtMoney(fake.credito_pendiente)}`,
          fake.flags.cliente_nuevo && "Cliente nuevo",
        ].filter(Boolean).join(" · ");
        notifyBrowser(titulo, cuerpo);
      }
    }
  }, [prefs.soundEnabled, prefs.notificationsEnabled]);

  const limpiarFakes = useCallback(() => {
    setFakeVentas([]);
    newCountRef.current = 0;
    flashTitle(0);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const r = await api.get("/cuentas/ventas-en-vivo", { params: { horas: 2 } });
      const items = r.data?.items || [];

      // Detectar nuevas (que no estaban en el snapshot anterior)
      const prevIds = seenIdsRef.current;
      const newOnes = items.filter((it) => !prevIds.has(it.order_id));
      const isFirstLoad = prevIds.size === 0;

      // Disparar alertas solo si no es la primera carga (evita spam al abrir)
      if (!isFirstLoad && newOnes.length > 0) {
        const conAlerta = newOnes.filter(n => n.has_alert);
        if (conAlerta.length > 0) {
          newCountRef.current += conAlerta.length;
          flashTitle(newCountRef.current);
          if (prefs.soundEnabled) playBeep();
          if (prefs.notificationsEnabled) {
            const v = conAlerta[0];
            const titulo = `🔴 ${v.partner_name || "Sin cliente"} acaba de comprar`;
            const cuerpo = [
              v.flags.falta_telefono && "Falta teléfono",
              v.flags.falta_departamento && "Falta departamento",
              v.flags.tiene_credito_pendiente && `Crédito pendiente ${fmtMoney(v.credito_pendiente)}`,
              v.flags.cliente_nuevo && "Cliente nuevo",
            ].filter(Boolean).join(" · ");
            notifyBrowser(titulo, cuerpo, () => navigate(`/cuentas/${v.partner_id}?tab=info`));
          }
        }
      }

      // Actualizar el snapshot
      seenIdsRef.current = new Set(items.map((it) => it.order_id));
      setData(r.data);
      setError(null);
    } catch (e) {
      setError(e?.message || "Error cargando ventas");
    } finally {
      setLoading(false);
    }
  }, [prefs.soundEnabled, prefs.notificationsEnabled, navigate]);

  // Polling cada 5s
  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  // Limpiar flash de título cuando user vuelve a la pestaña
  useEffect(() => {
    const handler = () => {
      if (!document.hidden) {
        newCountRef.current = 0;
        flashTitle(0);
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  const toggleNotifications = async () => {
    if (prefs.notificationsEnabled) {
      setPrefs(p => ({ ...p, notificationsEnabled: false }));
      return;
    }
    if (!("Notification" in window)) {
      alert("Tu navegador no soporta notificaciones");
      return;
    }
    const permission = await Notification.requestPermission();
    setPrefs(p => ({ ...p, notificationsEnabled: permission === "granted" }));
  };

  // Combinar ventas reales del backend + fakes inyectadas para demo
  const itemsReales = data?.items || [];
  const items = [...fakeVentas, ...itemsReales];
  const conAlertaReales = data?.con_alerta || 0;
  const conAlertaFake = fakeVentas.filter(f => f.has_alert).length;
  const conAlerta = conAlertaReales + conAlertaFake;
  const ventasConAlerta = items.filter(it => it.has_alert);
  const ventasOk = items.filter(it => !it.has_alert);

  return (
    <div className="px-6 py-4 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
              Ventas en vivo
            </h1>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700 font-mono uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              real-time
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Últimas 2 horas · refresca cada 5s · {items.length} ventas · {conAlerta} requieren atención
          </p>
        </div>

        {/* Controles */}
        <div className="flex items-center gap-2">
          {/* Demo: simular venta */}
          <Button
            size="sm"
            variant="outline"
            onClick={simularVenta}
            className="h-8 gap-1.5 border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100"
            data-testid="btn-simular-venta"
            title="Inyecta una venta falsa para ver cómo se siente una alerta"
          >
            <FlaskConical className="h-3.5 w-3.5" /> Simular venta
          </Button>
          {fakeVentas.length > 0 && (
            <Button
              size="sm" variant="ghost"
              onClick={limpiarFakes}
              className="h-8 gap-1.5 text-purple-600 hover:text-purple-700"
              title="Quitar todas las ventas demo"
            >
              Limpiar demo ({fakeVentas.length})
            </Button>
          )}
          <Button
            size="sm" variant="outline"
            onClick={() => setPrefs(p => ({ ...p, soundEnabled: !p.soundEnabled }))}
            className="h-8 gap-1.5"
            title={prefs.soundEnabled ? "Sonido activado" : "Sonido desactivado"}
          >
            {prefs.soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5 text-slate-400" />}
            {prefs.soundEnabled ? "Sonido" : "Silencio"}
          </Button>
          <Button
            size="sm" variant="outline"
            onClick={toggleNotifications}
            className="h-8 gap-1.5"
            title={prefs.notificationsEnabled ? "Notificaciones activas" : "Notificaciones desactivadas"}
          >
            {prefs.notificationsEnabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5 text-slate-400" />}
            {prefs.notificationsEnabled ? "Notificaciones" : "Activar alertas"}
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-3 border rounded p-3 flex items-center gap-2 text-sm bg-amber-50 border-amber-200">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <span className="text-amber-700 flex-1">{error} — reintentando en {POLL_INTERVAL_MS/1000}s</span>
        </div>
      )}

      {/* Loading */}
      {loading && !data ? (
        <div className="space-y-2">
          {[0,1,2].map(i => <div key={i} className="h-24 bg-slate-100 rounded-lg animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="border rounded-md px-3 py-12 text-center text-sm text-slate-400 italic">
          Sin ventas en las últimas 2 horas
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Columna alertas (izquierda) */}
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] font-mono text-slate-500 mb-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              Requieren atención · {ventasConAlerta.length}
            </div>
            <div className="space-y-2">
              {ventasConAlerta.length === 0 ? (
                <div className="border rounded-md px-3 py-6 text-center text-xs text-slate-400 italic">
                  ✓ Sin alertas — todo bajo control
                </div>
              ) : ventasConAlerta.map(v => (
                <VentaCard
                  key={v.order_id}
                  venta={v}
                  onClick={() => abrirCorregir(v)}
                />
              ))}
            </div>
          </div>

          {/* Columna OK (derecha) */}
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] font-mono text-slate-500 mb-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Todo en orden · {ventasOk.length}
            </div>
            <div className="space-y-2">
              {ventasOk.length === 0 ? (
                <div className="border rounded-md px-3 py-6 text-center text-xs text-slate-400 italic">
                  —
                </div>
              ) : ventasOk.map(v => (
                <VentaCard
                  key={v.order_id}
                  venta={v}
                  onClick={() => abrirCorregir(v)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer info */}
      <div className="mt-6 px-4 py-3 bg-slate-50/60 border border-slate-200 rounded-lg text-[11px] text-slate-600 leading-relaxed">
        <span className="font-semibold text-slate-700">Cómo funciona:</span>{" "}
        el CRM consulta a Odoo cada 5s para detectar nuevas ventas POS. Cuando hay una nueva con datos faltantes o saldo
        pendiente, suena un beep y aparece notificación (si la activas) <b>aunque tengas POS en otra pestaña</b>. Click
        en una venta con <b className="text-red-700">datos faltantes</b> abre un drawer rápido para completarlos sin
        salir de esta página.
      </div>

      {/* Drawer para completar datos rápido */}
      {corregirItem && (
        <CorregirDrawer
          cuentaItem={corregirItem}
          onClose={() => setCorregirItem(null)}
          onSaved={() => {
            setCorregirItem(null);
            fetchData();  // refresh para que la venta corregida ya no aparezca en alertas
          }}
        />
      )}
    </div>
  );
}
