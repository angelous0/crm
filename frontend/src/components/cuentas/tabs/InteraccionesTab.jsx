import React, { useCallback, useMemo, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Phone, MessageCircle, Mail, Building2, Calendar, Plus,
  AlertCircle, Filter,
} from "lucide-react";
import { useTabData } from "@/hooks/useTabData";
import { NuevaInteraccionModal } from "@/components/cuentas/modals/NuevaInteraccionModal";
import { InteraccionDetalleModal } from "@/components/cuentas/InteraccionDetalleModal";

const FILTERS = [
  { key: "ALL",      label: "Todas" },
  { key: "WHATSAPP", label: "WhatsApp" },
  { key: "LLAMADA",  label: "Llamada" },
  { key: "EMAIL",    label: "Email" },
  { key: "VISITA",   label: "Visita" },
  { key: "REUNION",  label: "Reunión" },
];

const channelIcon = (ch) => {
  const c = (ch || "").toUpperCase();
  if (c === "WHATSAPP") return MessageCircle;
  if (c === "LLAMADA")  return Phone;
  if (c === "EMAIL")    return Mail;
  if (c === "VISITA")   return Building2;
  return Calendar;
};

const outcomeBadgeClass = (o) => {
  const map = {
    COMPRO:      "bg-emerald-100 text-emerald-700 border-emerald-200",
    INTERESADO:  "bg-blue-100 text-blue-700 border-blue-200",
    AGENDO:      "bg-orange-100 text-orange-700 border-orange-200",
    COTIZO:      "bg-orange-100 text-orange-700 border-orange-200",
    RECHAZO:     "bg-red-100 text-red-700 border-red-200",
    NO_RESPONDE: "bg-red-100 text-red-700 border-red-200",
    NEUTRO:      "bg-slate-100 text-slate-600 border-slate-200",
  };
  return map[o] || "bg-slate-100 text-slate-600 border-slate-200";
};

const fmtRelative = (iso) => {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1)  return "ahora";
  if (min < 60) return `hace ${min}m`;
  const h = Math.round(min / 60);
  if (h < 24)   return `hace ${h}h`;
  const d = Math.round(h / 24);
  if (d === 1)  return "ayer";
  if (d < 30)   return `hace ${d}d`;
  const m = Math.floor(d / 30);
  if (m < 12)   return `hace ${m} mes${m === 1 ? "" : "es"}`;
  return `hace ${Math.floor(m / 12)}a`;
};

const truncate = (s, max = 80) => {
  if (!s) return "";
  return s.length <= max ? s : s.slice(0, max).trimEnd() + "…";
};

const Skeleton = () => (
  <div className="space-y-1.5">
    {[0,1,2,3,4].map(i => (
      <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />
    ))}
  </div>
);

export function InteraccionesTab({ partnerOdooId, contactos = [], active, staleKey, onMutate }) {
  const fetchInteracciones = useCallback(async () => {
    const r = await api.get(`/cuentas/${partnerOdooId}/interacciones`);
    return Array.isArray(r.data) ? r.data : (r.data?.items || []);
  }, [partnerOdooId]);

  const { data: items, loading, error, reload } = useTabData(fetchInteracciones, {
    enabled: active,
    staleKey,
  });

  const [filter, setFilter] = useState("ALL");
  const [openCreate, setOpenCreate] = useState(false);
  const [selected, setSelected]     = useState(null);
  const [openEdit, setOpenEdit]     = useState(false);

  const itemsList = items || [];
  const filtered = useMemo(() => {
    if (filter === "ALL") return itemsList;
    return itemsList.filter(i => (i.channel || "").toUpperCase() === filter);
  }, [itemsList, filter]);

  const total = itemsList.length;
  const filterCount = (key) => key === "ALL" ? total : itemsList.filter(i => (i.channel || "").toUpperCase() === key).length;

  const refresh = async () => {
    await reload();
    onMutate?.();
  };

  if (loading && !items) return <Skeleton />;
  if (error) {
    return (
      <div className="border rounded p-3 flex items-center gap-2 text-sm">
        <AlertCircle className="h-4 w-4 text-red-500" />
        <span className="text-slate-600 flex-1">{error}</span>
        <Button size="sm" variant="outline" onClick={reload}>Reintentar</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[11px] font-semibold tracking-wider uppercase text-slate-500">
          Interacciones <span className="text-slate-400 font-normal ml-1">· {total}</span>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
          onClick={() => setOpenCreate(true)}>
          <Plus className="h-3 w-3" /> Nueva interacción
        </Button>
      </div>

      {total > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <Filter className="h-3 w-3 text-slate-400 mr-1" />
          {FILTERS.map(f => {
            const c = filterCount(f.key);
            const isActive = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-2 py-0.5 rounded-full text-[11px] border transition-colors ${
                  isActive
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                }`}
              >
                {f.label} {c > 0 && <span className={isActive ? "text-slate-300" : "text-slate-400"}>· {c}</span>}
              </button>
            );
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="px-3 py-8 text-center text-sm text-slate-400 italic border rounded-md">
          {total === 0
            ? <>Aún no hay interacciones registradas. <button className="text-slate-700 hover:underline font-medium" onClick={() => setOpenCreate(true)}>Click aquí</button> para crear la primera.</>
            : `Sin interacciones con filtro "${FILTERS.find(f => f.key === filter)?.label}".`}
        </div>
      ) : (
        <div className="border-t">
          {filtered.map((i) => {
            const Icon = channelIcon(i.channel);
            return (
              <div
                key={i.id}
                onClick={() => setSelected(i)}
                className="group grid items-center gap-3 px-3 py-2 border-b text-sm hover:bg-slate-50 transition-colors cursor-pointer"
                style={{ gridTemplateColumns: "70px 110px 110px minmax(0,1fr)" }}
              >
                <div className="text-xs text-slate-500 tabular-nums">{fmtRelative(i.happened_at)}</div>
                <div className="text-xs flex items-center gap-1.5 truncate">
                  <Icon className="h-3 w-3 text-slate-400 shrink-0" />
                  <span className="text-slate-700">{i.channel || i.tipo || "—"}</span>
                </div>
                <div>
                  {i.outcome && (
                    <Badge variant="outline" className={`text-[9px] font-semibold ${outcomeBadgeClass(i.outcome)}`}>
                      {i.outcome}
                    </Badge>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-slate-900 truncate">{truncate(i.resumen)}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">por {i.created_by || "—"}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <NuevaInteraccionModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        partnerOdooId={partnerOdooId}
        contactos={contactos}
        onSuccess={refresh}
      />
      <NuevaInteraccionModal
        open={openEdit}
        onClose={() => { setOpenEdit(false); setSelected(null); }}
        partnerOdooId={partnerOdooId}
        contactos={contactos}
        initialData={openEdit ? selected : null}
        onSuccess={refresh}
      />
      <InteraccionDetalleModal
        open={!!selected && !openEdit}
        onClose={() => setSelected(null)}
        interaccion={selected}
        onEdit={(i) => { setSelected(i); setOpenEdit(true); }}
        onDeleted={refresh}
      />
    </div>
  );
}
