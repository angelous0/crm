import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Calendar, AlertCircle, Phone, MessageCircle, Mail, Building2, Sparkles,
  RefreshCw, Check, Loader2, CheckCircle2, ArrowUpRight,
} from 'lucide-react';

const KPI_REFRESH_MS = 5 * 60 * 1000;

const channelIcon = (channel) => {
  const c = (channel || '').toUpperCase();
  if (c === 'WHATSAPP') return MessageCircle;
  if (c === 'LLAMADA') return Phone;
  if (c === 'EMAIL') return Mail;
  if (c === 'VISITA') return Building2;
  return Calendar;
};

const formatDueLabel = (esVencida, minutos) => {
  if (minutos == null) return '—';
  if (esVencida) {
    const dias = Math.floor(-minutos / (60 * 24));
    if (dias >= 1) return `Hace ${dias}d`;
    return `Hace ${Math.floor(-minutos / 60)}h`;
  }
  if (minutos < 60) return `En ${minutos}m`;
  if (minutos < 60 * 24) return `En ${Math.floor(minutos / 60)}h`;
  return `En ${Math.floor(minutos / 60 / 24)}d`;
};

const formatRelativeTime = (iso) => {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `${min}m`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
};

// Indicador de prioridad: línea vertical de color en el borde izquierdo de la fila
const priorityClass = (p) => {
  if (p === 1) return 'before:bg-red-500';
  if (p === 2) return 'before:bg-orange-400';
  if (p === 3) return 'before:bg-yellow-400';
  return 'before:bg-transparent';
};

// ── Motor de Cadencia ──────────────────────────────────────────────────────

const URGENCIA_BADGE = {
  urgente: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  alta:    'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  media:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
};
const URGENCIA_LABEL = { urgente: 'Urgente', alta: 'Alta', media: 'Normal' };

const CadenciaRow = ({ item, onVerCuenta }) => {
  const ratio = parseFloat(item.ratio_overdue || 0);
  const badgeClass = URGENCIA_BADGE[item.urgencia] || URGENCIA_BADGE.media;
  return (
    <div
      onClick={() => onVerCuenta(item.cuenta_partner_odoo_id)}
      className="group grid items-center gap-3 px-3 py-2 border-b text-sm cursor-pointer hover:bg-muted/40 transition-colors"
      style={{ gridTemplateColumns: 'minmax(180px,1.4fr) minmax(0,2fr) 90px 60px' }}
    >
      {/* Cuenta */}
      <div className="truncate font-medium">{item.cuenta_nombre || '—'}</div>

      {/* Descripción */}
      <div className="truncate text-xs text-muted-foreground">{item.descripcion}</div>

      {/* Badge urgencia */}
      <div>
        <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-medium ${badgeClass}`}>
          {URGENCIA_LABEL[item.urgencia] || 'Contactar'}
        </span>
      </div>

      {/* Ratio */}
      <div className="text-xs text-muted-foreground tabular-nums text-right">
        ×{ratio.toFixed(1)}
      </div>
    </div>
  );
};

const Kpi = ({ label, value, icon: Icon, accent = 'text-foreground' }) => (
  <div className="flex items-center gap-2.5 px-3 py-2 border rounded-md bg-card min-w-[140px]">
    <Icon className={`h-4 w-4 ${accent}`} />
    <div className="leading-tight">
      <div className="text-lg font-semibold">{value ?? 0}</div>
      <div className="text-[11px] text-muted-foreground -mt-0.5">{label}</div>
    </div>
  </div>
);

const SectionHeader = ({ children, count, accent }) => (
  <div className="flex items-baseline gap-2 pt-4 pb-1.5 border-b">
    <span className={`text-[11px] font-semibold tracking-wider uppercase ${accent || 'text-muted-foreground'}`}>{children}</span>
    {count != null && <span className="text-[11px] text-muted-foreground">· {count}</span>}
  </div>
);

const RowSkeleton = () => (
  <div className="h-9 border-b bg-muted/20 animate-pulse" />
);

const TareaRow = ({ tarea, vencida, onCompletar, onVerCuenta, completing }) => {
  const phone = tarea.contacto_telefono || tarea.contacto_whatsapp;
  return (
    <div
      onClick={() => onVerCuenta(tarea.cuenta_partner_odoo_id)}
      className={[
        'group relative grid items-center gap-3 px-3 py-2 border-b text-sm cursor-pointer',
        'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px]',
        priorityClass(tarea.prioridad),
        'hover:bg-muted/40 transition-colors',
      ].join(' ')}
      style={{ gridTemplateColumns: 'minmax(180px,1.2fr) minmax(0,2fr) 90px 130px 1fr' }}
    >
      {/* Cliente */}
      <div className="truncate font-medium">{tarea.cuenta_nombre || '—'}</div>

      {/* Descripción */}
      <div className="truncate text-muted-foreground">{tarea.descripcion}</div>

      {/* Vence */}
      <div className={`tabular-nums text-xs ${vencida ? 'text-red-600 dark:text-red-400 font-medium' : 'text-muted-foreground'}`}>
        {formatDueLabel(tarea.es_vencida, tarea.minutos_hasta_vencer)}
      </div>

      {/* Teléfono */}
      <div className="text-xs text-muted-foreground tabular-nums truncate">
        {phone ? (
          <a
            href={`tel:${phone}`}
            onClick={(e) => e.stopPropagation()}
            className="hover:underline hover:text-foreground inline-flex items-center gap-1"
          >
            <Phone className="h-3 w-3" />{phone}
          </a>
        ) : '—'}
      </div>

      {/* Acciones (hover-only) */}
      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={(e) => { e.stopPropagation(); onCompletar(tarea.id); }}
          disabled={completing}
          title="Completar (Enter)"
        >
          {completing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
          Completar
        </Button>
      </div>
    </div>
  );
};

const InteraccionRow = ({ item }) => {
  const Icon = channelIcon(item.channel);
  return (
    <div
      className="group grid items-center gap-3 px-3 py-2 border-b text-sm hover:bg-muted/40 transition-colors"
      style={{ gridTemplateColumns: '60px minmax(180px,1.2fr) 110px minmax(0,3fr)' }}
    >
      <div className="text-xs text-muted-foreground tabular-nums">{formatRelativeTime(item.happened_at)}</div>
      <div className="truncate font-medium">{item.cuenta_nombre || '—'}</div>
      <div className="text-xs flex items-center gap-1.5 truncate">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <span className="text-muted-foreground">{item.channel || item.tipo || '—'}</span>
        {item.outcome && <span className="text-foreground font-medium">· {item.outcome}</span>}
      </div>
      <div className="truncate text-muted-foreground">{item.resumen}</div>
    </div>
  );
};

const EmptyRow = ({ children }) => (
  <div className="px-3 py-3 text-sm text-muted-foreground italic">{children}</div>
);

export default function MiDia() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [asUser, setAsUser] = useState(null);
  const [equipo, setEquipo] = useState([]);
  const [completingIds, setCompletingIds] = useState(new Set());
  const loadStartRef = useRef(null);
  const [loadMs, setLoadMs] = useState(null);

  const isAdminUser = typeof isAdmin === 'function' ? isAdmin() : user?.rol === 'admin';

  const cargar = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    loadStartRef.current = performance.now();
    try {
      const res = await api.get('/mi-dia', { params: asUser ? { as_user: asUser } : {} });
      setData(res.data);
      setLoadMs(Math.round(performance.now() - loadStartRef.current));
    } catch (e) {
      setError(e.response?.data?.detail || e.message || 'Error desconocido');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [asUser]);

  const cargarKpis = useCallback(async () => {
    try {
      const res = await api.get('/mi-dia/kpis', { params: asUser ? { as_user: asUser } : {} });
      setData((d) => (d ? { ...d, kpis: res.data } : d));
    } catch { /* silencioso */ }
  }, [asUser]);

  const cargarEquipo = useCallback(async () => {
    if (!isAdminUser) return;
    try {
      const res = await api.get('/mi-dia/resumen-equipo');
      setEquipo(res.data.vendedores || []);
    } catch { /* silencioso */ }
  }, [isAdminUser]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { cargarEquipo(); }, [cargarEquipo]);
  useEffect(() => {
    const id = setInterval(cargarKpis, KPI_REFRESH_MS);
    return () => clearInterval(id);
  }, [cargarKpis]);

  const completar = async (tareaId) => {
    if (!data) return;
    const snapshot = {
      tareas_hoy: data.secciones.tareas_hoy.items,
      tareas_vencidas: data.secciones.tareas_vencidas.items,
      kpis: data.kpis,
    };
    const wasInHoy  = snapshot.tareas_hoy.some((t) => t.id === tareaId);
    const wasInVenc = snapshot.tareas_vencidas.some((t) => t.id === tareaId);

    setCompletingIds((s) => new Set(s).add(tareaId));
    setData((d) => ({
      ...d,
      kpis: {
        ...d.kpis,
        tareas_hoy:      Math.max(0, d.kpis.tareas_hoy      - (wasInHoy  ? 1 : 0)),
        tareas_vencidas: Math.max(0, d.kpis.tareas_vencidas - (wasInVenc ? 1 : 0)),
      },
      secciones: {
        ...d.secciones,
        tareas_hoy: {
          ...d.secciones.tareas_hoy,
          items: d.secciones.tareas_hoy.items.filter((t) => t.id !== tareaId),
          total: Math.max(0, d.secciones.tareas_hoy.total - (wasInHoy ? 1 : 0)),
        },
        tareas_vencidas: {
          ...d.secciones.tareas_vencidas,
          items: d.secciones.tareas_vencidas.items.filter((t) => t.id !== tareaId),
          total: Math.max(0, d.secciones.tareas_vencidas.total - (wasInVenc ? 1 : 0)),
          mostrados: Math.max(0, (d.secciones.tareas_vencidas.mostrados ?? d.secciones.tareas_vencidas.items.length) - (wasInVenc ? 1 : 0)),
        },
      },
    }));

    try {
      await api.patch(`/tareas/${tareaId}/completar`);
      toast.success('Tarea completada');
      cargarKpis();
    } catch (e) {
      setData((d) => ({
        ...d,
        kpis: snapshot.kpis,
        secciones: {
          ...d.secciones,
          tareas_hoy:      { ...d.secciones.tareas_hoy,      items: snapshot.tareas_hoy,      total: snapshot.tareas_hoy.length },
          tareas_vencidas: { ...d.secciones.tareas_vencidas, items: snapshot.tareas_vencidas, total: snapshot.tareas_vencidas.length, mostrados: snapshot.tareas_vencidas.length },
        },
      }));
      toast.error('No se pudo completar: ' + (e.response?.data?.detail || e.message));
    } finally {
      setCompletingIds((s) => {
        const next = new Set(s);
        next.delete(tareaId);
        return next;
      });
    }
  };

  const verCuenta = (partnerOdooId) => {
    if (!partnerOdooId) return;
    navigate(`/cuentas/${partnerOdooId}`);
  };

  const saludo = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
  })();

  const userNombre = data?.usuario?.nombre || data?.usuario?.username || user?.username || '';
  const viewingOther = asUser && asUser !== user?.username;

  if (loading) {
    return (
      <div className="px-6 py-4 max-w-6xl">
        <div className="h-6 w-64 bg-muted rounded animate-pulse mb-4" />
        <div className="flex gap-2 mb-4">
          {[0,1,2,3].map((i) => <div key={i} className="h-12 w-36 bg-muted rounded animate-pulse" />)}
        </div>
        {[...Array(8)].map((_, i) => <RowSkeleton key={i} />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-6 py-4 max-w-6xl">
        <div className="border rounded-md p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
          <div className="flex-1">
            <div className="font-medium text-sm">Error al cargar Mi Día</div>
            <div className="text-xs text-muted-foreground">{error}</div>
          </div>
          <Button size="sm" variant="outline" onClick={() => cargar()}>
            <RefreshCw className="h-3 w-3 mr-1" /> Reintentar
          </Button>
        </div>
      </div>
    );
  }

  if (!data) return null;
  const { kpis, secciones } = data;

  return (
    <div className="px-6 py-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            {saludo}, {userNombre.split(' ')[0]}
            {viewingOther && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                · viendo a <span className="font-medium text-foreground">{data.viewing_as}</span>
              </span>
            )}
          </h1>
          <p className="text-xs text-muted-foreground">
            {new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })}
            {loadMs != null && <span className="ml-2">· {loadMs}ms</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdminUser && (
            <Select value={asUser ?? '__me__'} onValueChange={(v) => setAsUser(v === '__me__' ? null : v)}>
              <SelectTrigger className="h-8 w-[200px] text-xs">
                <SelectValue placeholder="Ver Mi Día de…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__me__">Yo ({user?.username})</SelectItem>
                {equipo.filter((v) => v.username !== user?.username).map((v) => (
                  <SelectItem key={v.username} value={v.username}>
                    {v.nombre || v.username}
                    {v.tareas_vencidas > 0 && <span className="text-red-500 ml-2 tabular-nums">·{v.tareas_vencidas}</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => cargar()}>
            <RefreshCw className="h-3 w-3 mr-1" /> Actualizar
          </Button>
        </div>
      </div>

      {/* KPIs en una sola fila */}
      <div className="flex flex-wrap gap-2 mb-2">
        <Kpi label="Tareas hoy"        value={kpis.tareas_hoy}            icon={Calendar}      accent="text-blue-500" />
        <Kpi label="Vencidas"          value={kpis.tareas_vencidas}       icon={AlertCircle}   accent={kpis.tareas_vencidas > 0 ? 'text-red-500' : 'text-muted-foreground'} />
        <Kpi label="Contactar hoy"     value={kpis.cadencia_hoy ?? 0}     icon={Sparkles}      accent={(kpis.cadencia_hoy ?? 0) > 0 ? 'text-orange-500' : 'text-muted-foreground'} />
        <Kpi label="Interacciones 7d"  value={kpis.interacciones_semana}  icon={MessageCircle} accent="text-muted-foreground" />
        <Kpi label="Interacciones hoy" value={kpis.interacciones_hoy}     icon={CheckCircle2}  accent="text-muted-foreground" />
      </div>

      {/* Motor de cadencia: cuentas con frecuencia caída */}
      <SectionHeader
        accent="text-orange-600 dark:text-orange-400"
        count={secciones.urgente_proactivo.disponible ? secciones.urgente_proactivo.total : null}
      >
        <span className="inline-flex items-center gap-1.5"><Sparkles className="h-3 w-3" /> Contactar hoy</span>
      </SectionHeader>
      {secciones.urgente_proactivo.disponible ? (
        secciones.urgente_proactivo.items.length === 0
          ? <EmptyRow>Todas las cuentas asignadas están al día. ✓</EmptyRow>
          : secciones.urgente_proactivo.items.map((it) => (
              <CadenciaRow
                key={it.cuenta_partner_odoo_id}
                item={it}
                onVerCuenta={verCuenta}
              />
            ))
      ) : (
        <EmptyRow>{secciones.urgente_proactivo.mensaje_si_vacio}</EmptyRow>
      )}

      {/* Tareas hoy */}
      <SectionHeader count={secciones.tareas_hoy.total}>Tareas de hoy</SectionHeader>
      {secciones.tareas_hoy.items.length === 0 ? (
        <EmptyRow>
          {kpis.tareas_vencidas > 0
            ? 'Sin tareas para hoy. Atiende las vencidas más abajo.'
            : 'No hay tareas para hoy.'}
        </EmptyRow>
      ) : (
        secciones.tareas_hoy.items.map((t) => (
          <TareaRow
            key={t.id}
            tarea={t}
            onCompletar={completar}
            onVerCuenta={verCuenta}
            completing={completingIds.has(t.id)}
          />
        ))
      )}

      {/* Tareas vencidas */}
      <SectionHeader count={secciones.tareas_vencidas.total} accent={secciones.tareas_vencidas.total > 0 ? 'text-red-600 dark:text-red-400' : undefined}>
        Vencidas
      </SectionHeader>
      {secciones.tareas_vencidas.items.length === 0 ? (
        <EmptyRow>Ninguna tarea vencida.</EmptyRow>
      ) : (
        <>
          {secciones.tareas_vencidas.items.map((t) => (
            <TareaRow
              key={t.id}
              tarea={t}
              vencida
              onCompletar={completar}
              onVerCuenta={verCuenta}
              completing={completingIds.has(t.id)}
            />
          ))}
          {secciones.tareas_vencidas.total > secciones.tareas_vencidas.items.length && (
            <div className="px-3 py-1.5 text-[11px] text-muted-foreground italic border-b">
              Mostrando {secciones.tareas_vencidas.items.length} de {secciones.tareas_vencidas.total}.
              <button className="ml-1 hover:underline inline-flex items-center gap-0.5" onClick={() => navigate('/tareas?status=PENDIENTE')}>
                Ver todas <ArrowUpRight className="h-3 w-3" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Interacciones recientes */}
      <SectionHeader count={secciones.interacciones_recientes.total}>Últimas interacciones</SectionHeader>
      {secciones.interacciones_recientes.items.length === 0 ? (
        <EmptyRow>Sin interacciones recientes.</EmptyRow>
      ) : (
        secciones.interacciones_recientes.items.map((it) => <InteraccionRow key={it.id} item={it} />)
      )}
    </div>
  );
}
