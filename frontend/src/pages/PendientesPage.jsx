import React, { useState, useEffect, useCallback, useRef } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  Loader2, Search, Check, X, Link2, ChevronLeft, ChevronRight,
  MessageCircle, ShieldCheck, ShieldX, ArrowRightLeft, AlertTriangle, Users
} from "lucide-react";

const fmtDate = (d) => d ? new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }) : "-";

/* ───────── Main Page ───────── */
export default function PendientesPage() {
  const [entity, setEntity] = useState("cuenta");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState({ cuentas: 0, contactos: 0 });
  const limit = 30;
  const fetchRef = useRef(0);
  const debounceRef = useRef(null);

  /* Modal state */
  const [modal, setModal] = useState({ type: null, row: null });
  const [actionLoading, setActionLoading] = useState(false);

  /* Handle action dispatch */
  const handleAction = useCallback((action) => {
    if (action.type === "approve") {
      doApproveDirectly(action.row);
    } else {
      setModal(action);
    }
  }, []); // eslint-disable-line

  /* Fetch counts */
  const fetchCounts = useCallback(async () => {
    try {
      const r = await api.get("/approval/pending/count");
      setCounts(r.data);
    } catch { /* silent */ }
  }, []);

  /* Fetch rows */
  const fetchRows = useCallback(async (ent, pg, q) => {
    const id = ++fetchRef.current;
    setLoading(true);
    try {
      const r = await api.get("/approval/pending", { params: { entity: ent, page: pg, limit, search: q } });
      if (id !== fetchRef.current) return;
      setRows(r.data.rows || []);
      setTotal(r.data.total || 0);
    } catch {
      toast.error("Error cargando pendientes");
    } finally {
      if (id === fetchRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);
  useEffect(() => { fetchRows(entity, page, search); }, [entity, page]); // eslint-disable-line
  useEffect(() => { setPage(1); }, [entity]);

  const handleSearch = (val) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); fetchRows(entity, 1, val); }, 350);
  };

  const refresh = () => { fetchRows(entity, page, search); fetchCounts(); };
  const totalPages = Math.ceil(total / limit);

  /* ──── Actions ──── */
  const doApproveDirectly = async (row) => {
    try {
      await api.post(`/approval/${entity}/${row.id}/approve`, { note: null, set_active: true });
      toast.success(`"${row.nombre}" aprobada y activa`);
      refresh();
    } catch { toast.error("Error al aprobar"); }
  };

  const doApprove = async (row, setActive) => {
    setActionLoading(true);
    try {
      await api.post(`/approval/${entity}/${row.id}/approve`, { note: null, set_active: setActive });
      toast.success(setActive ? `"${row.nombre}" aprobada y activa` : `"${row.nombre}" aprobada (inactiva)`);
      refresh();
    } catch { toast.error("Error al aprobar"); }
    finally { setActionLoading(false); setModal({ type: null, row: null }); }
  };

  const doReject = async (row, note) => {
    setActionLoading(true);
    try {
      await api.post(`/approval/${entity}/${row.id}/reject`, { note });
      toast.success(`"${row.nombre}" rechazada`);
      refresh();
    } catch (e) { toast.error(e.response?.data?.detail || "Error al rechazar"); }
    finally { setActionLoading(false); setModal({ type: null, row: null }); }
  };

  const doLink = async (row, targetId, mode, note) => {
    setActionLoading(true);
    try {
      await api.post(`/approval/cuenta/${row.id}/link-to`, { target_cuenta_id: targetId, mode, note });
      toast.success(mode === "LINK" ? `"${row.nombre}" vinculada` : `"${row.nombre}" fusionada`);
      refresh();
    } catch (e) { toast.error(e.response?.data?.detail || "Error al vincular"); }
    finally { setActionLoading(false); setModal({ type: null, row: null }); }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50/50" data-testid="pendientes-page">
      {/* Header */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-heading font-semibold text-slate-900 tracking-tight" data-testid="pendientes-title">
              Pendientes de Aprobacion
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">Nuevos registros sincronizados desde Odoo</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-mono" data-testid="pending-total-badge">
              {counts.cuentas + counts.contactos} pendientes
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Tabs value={entity} onValueChange={setEntity} className="shrink-0">
            <TabsList className="h-8">
              <TabsTrigger value="cuenta" className="text-xs h-7 px-3 gap-1.5" data-testid="tab-cuentas">
                <Users size={13} />
                Cuentas
                {counts.cuentas > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold"
                    data-testid="tab-cuentas-badge">{counts.cuentas}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="contacto" className="text-xs h-7 px-3 gap-1.5" data-testid="tab-contactos">
                Contactos
                {counts.contactos > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold"
                    data-testid="tab-contactos-badge">{counts.contactos}</span>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Buscar por nombre, DNI/RUC, ciudad..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="h-8 pl-8 text-xs"
              data-testid="pending-search"
            />
            {search && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" onClick={() => handleSearch("")}>
                <X size={12} />
              </button>
            )}
          </div>

          <span className="text-[11px] text-slate-400 ml-auto">{total} registro(s)</span>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto min-h-0 px-4 py-3">
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
          <table className="w-full text-xs border-collapse" style={{ minWidth: entity === "cuenta" ? "800px" : "700px" }}>
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Nombre</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">DNI/RUC</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Ciudad</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Telefono</th>
                {entity === "contacto" && (
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Cuenta</th>
                )}
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Creado</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 min-w-[180px]">Sugerencia</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500 min-w-[200px]">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={entity === "contacto" ? 8 : 7} className="h-40 text-center">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-slate-400" />
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={entity === "contacto" ? 8 : 7} className="h-40 text-center text-slate-400">
                  <div className="flex flex-col items-center gap-2">
                    <ShieldCheck size={28} className="text-emerald-400" />
                    <span>No hay registros pendientes</span>
                  </div>
                </td></tr>
              ) : rows.map((r) => (
                <PendingRow key={r.id} row={r} entity={entity} onAction={handleAction} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-2 text-[11px] text-slate-500">
            <span>Pagina {page} de {totalPages}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" disabled={page <= 1} onClick={() => setPage(p => p - 1)} data-testid="prev-page">
                <ChevronLeft size={12} className="mr-0.5" /> Anterior
              </Button>
              <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} data-testid="next-page">
                Siguiente <ChevronRight size={12} className="ml-0.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <RejectModal
        open={modal.type === "reject"}
        row={modal.row}
        loading={actionLoading}
        onClose={() => setModal({ type: null, row: null })}
        onConfirm={(note) => doReject(modal.row, note)}
      />
      <LinkModal
        open={modal.type === "link"}
        row={modal.row}
        loading={actionLoading}
        onClose={() => setModal({ type: null, row: null })}
        onConfirm={(targetId, mode, note) => doLink(modal.row, targetId, mode, note)}
      />
      <ApproveConfirmDialog
        open={modal.type === "approve-inactive"}
        row={modal.row}
        loading={actionLoading}
        onClose={() => setModal({ type: null, row: null })}
        onConfirm={() => doApprove(modal.row, false)}
      />
    </div>
  );
}

/* ───────── Row Component ───────── */
function PendingRow({ row, entity, onAction }) {
  const s = row.suggestion;
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors h-[42px]" data-testid={`pending-row-${row.id}`}>
      <td className="px-3 py-1.5 font-medium text-slate-900 truncate max-w-[200px]" data-testid={`pending-name-${row.id}`}>
        {row.nombre || `ID: ${row.id}`}
      </td>
      <td className="px-3 py-1.5 text-slate-600 font-mono text-[11px]" data-testid={`pending-vat-${row.id}`}>{row.vat || "-"}</td>
      <td className="px-3 py-1.5 text-slate-500 truncate max-w-[100px]" data-testid={`pending-city-${row.id}`}>{row.ciudad || "-"}</td>
      <td className="px-3 py-1.5 whitespace-nowrap" data-testid={`pending-phone-${row.id}`}>
        {row.phone_display ? (
          row.phone_whatsapp ? (
            <a href={`https://wa.me/${row.phone_whatsapp}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-emerald-600 hover:underline text-[11px]">
              <MessageCircle size={11} />{row.phone_display}
            </a>
          ) : <span className="text-slate-500 text-[11px]">{row.phone_display}</span>
        ) : <span className="text-slate-300">-</span>}
      </td>
      {entity === "contacto" && (
        <td className="px-3 py-1.5 text-slate-500 truncate max-w-[140px]" data-testid={`pending-cuenta-${row.id}`}>{row.cuenta_nombre || "-"}</td>
      )}
      <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap" data-testid={`pending-created-${row.id}`}>{fmtDate(row.created_at)}</td>
      <td className="px-3 py-1.5" data-testid={`pending-suggestion-${row.id}`}>
        {s ? (
          <SuggestionBadge suggestion={s} onLink={() => onAction({ type: "link", row: { ...row, preselected: s.suggested_cuenta_id } })} />
        ) : <span className="text-slate-300 text-[10px]">Sin sugerencias</span>}
      </td>
      <td className="px-3 py-1.5">
        <RowActions row={row} entity={entity} onAction={onAction} />
      </td>
    </tr>
  );
}

/* ───────── Suggestion Badge ───────── */
function SuggestionBadge({ suggestion, onLink }) {
  const s = suggestion;
  const colors = {
    DOC: "bg-red-50 text-red-700 border-red-200",
    TEL: "bg-amber-50 text-amber-700 border-amber-200",
    NAME: "bg-blue-50 text-blue-700 border-blue-200",
  };
  const labels = { DOC: "DNI/RUC", TEL: "Telefono", NAME: "Nombre" };
  return (
    <div className="flex items-center gap-1.5">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium cursor-default ${colors[s.reason] || "bg-slate-50 text-slate-600 border-slate-200"}`}>
              <AlertTriangle size={10} />
              Dup. {labels[s.reason] || s.reason}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs max-w-[250px]">
            Posible duplicado de: <strong>{s.suggested_name}</strong> (ID: {s.suggested_cuenta_id})
            <br />Match: {labels[s.reason]} — Confianza: {(s.confidence * 100).toFixed(0)}%
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[9px] text-blue-600 hover:text-blue-800 hover:bg-blue-50"
        onClick={onLink} data-testid={`suggestion-link-${s.suggested_cuenta_id}`}>
        <Link2 size={10} className="mr-0.5" />Vincular
      </Button>
    </div>
  );
}

/* ───────── Row Actions ───────── */
function RowActions({ row, entity, onAction }) {
  return (
    <div className="flex items-center gap-1 justify-end" data-testid={`actions-${row.id}`}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" className="h-6 px-2 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => onAction({ type: "approve", row })} data-testid={`approve-btn-${row.id}`}>
              <Check size={11} className="mr-0.5" />Aprobar
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Aprobar y activar</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="outline" className="h-6 px-1.5 text-[10px] text-amber-700 border-amber-300 hover:bg-amber-50"
              onClick={() => onAction({ type: "approve-inactive", row })} data-testid={`approve-inactive-btn-${row.id}`}>
              <ShieldCheck size={11} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Aprobar pero inactiva</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="outline" className="h-6 px-1.5 text-[10px] text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => onAction({ type: "reject", row })} data-testid={`reject-btn-${row.id}`}>
              <ShieldX size={11} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Rechazar / Archivar</TooltipContent>
        </Tooltip>
        {entity === "cuenta" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" className="h-6 px-1.5 text-[10px] text-blue-600 border-blue-200 hover:bg-blue-50"
                onClick={() => onAction({ type: "link", row })} data-testid={`link-btn-${row.id}`}>
                <ArrowRightLeft size={11} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">Vincular a cuenta existente</TooltipContent>
          </Tooltip>
        )}
      </TooltipProvider>
    </div>
  );
}

/* ───────── Reject Modal ───────── */
function RejectModal({ open, row, loading, onClose, onConfirm }) {
  const [note, setNote] = useState("");
  useEffect(() => { if (open) setNote(""); }, [open]);
  if (!row) return null;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="reject-modal">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2"><ShieldX size={16} className="text-red-500" />Rechazar cuenta</DialogTitle>
          <DialogDescription className="text-xs">
            Se archivara <strong>"{row.nombre}"</strong>. No aparecera en listados.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-700">Nota (obligatoria)</label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motivo del rechazo..." className="text-xs min-h-[60px]" data-testid="reject-note" />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs" data-testid="reject-cancel">Cancelar</Button>
          <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white text-xs" disabled={loading || note.trim().length < 3}
            onClick={() => onConfirm(note)} data-testid="reject-confirm">
            {loading && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Rechazar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────── Approve Inactive Confirm ───────── */
function ApproveConfirmDialog({ open, row, loading, onClose, onConfirm }) {
  if (!row) return null;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm" data-testid="approve-inactive-modal">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2"><ShieldCheck size={16} className="text-amber-500" />Aprobar como inactiva</DialogTitle>
          <DialogDescription className="text-xs">
            <strong>"{row.nombre}"</strong> sera aprobada pero quedara inactiva (no visible para vendedores).
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs" data-testid="approve-inactive-cancel">Cancelar</Button>
          <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white text-xs" disabled={loading} onClick={onConfirm} data-testid="approve-inactive-confirm">
            {loading && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────── Link Modal ───────── */
function LinkModal({ open, row, loading, onClose, onConfirm }) {
  const [searchQ, setSearchQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [mode, setMode] = useState("LINK");
  const [note, setNote] = useState("");
  const debRef = useRef(null);

  useEffect(() => {
    if (open) {
      setSearchQ("");
      setResults([]);
      setSelectedTarget(null);
      setMode("LINK");
      setNote("");
      // If preselected from suggestion, auto-search
      if (row?.preselected) {
        searchAccounts(String(row.preselected));
      }
    }
  }, [open]); // eslint-disable-line

  const searchAccounts = async (q) => {
    if (!q || q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const r = await api.get("/cuentas/list", { params: { q, limit: 10, page: 1 } });
      setResults(r.data.rows || []);
    } catch { /* silent */ }
    finally { setSearching(false); }
  };

  const handleSearch = (val) => {
    setSearchQ(val);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => searchAccounts(val), 350);
  };

  if (!row) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="link-modal">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2"><Link2 size={16} className="text-blue-500" />Vincular cuenta</DialogTitle>
          <DialogDescription className="text-xs">
            Vincular <strong>"{row.nombre}"</strong> a una cuenta existente.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {/* Search */}
          <div>
            <label className="text-xs font-medium text-slate-700 mb-1 block">Buscar cuenta destino</label>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input value={searchQ} onChange={(e) => handleSearch(e.target.value)}
                placeholder="Nombre, DNI/RUC, telefono..."
                className="h-8 pl-8 text-xs" data-testid="link-search-input" />
              {searching && <Loader2 size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />}
            </div>
          </div>

          {/* Results */}
          <div className="max-h-[200px] overflow-auto border border-slate-200 rounded-md">
            {results.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                {searchQ.length >= 2 && !searching ? "Sin resultados" : "Escribe para buscar cuentas aprobadas"}
              </div>
            ) : results.map((acc) => (
              <div
                key={acc.id}
                onClick={() => setSelectedTarget(acc)}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-slate-100 last:border-0 text-xs transition-colors
                  ${selectedTarget?.id === acc.id ? "bg-blue-50 border-l-2 border-l-blue-500" : "hover:bg-slate-50"}`}
                data-testid={`link-result-${acc.id}`}
              >
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-slate-900 truncate block">{acc.nombre}</span>
                  <span className="text-[10px] text-slate-500">{acc.vat || ""} {acc.ciudad ? `· ${acc.ciudad}` : ""}</span>
                </div>
                {selectedTarget?.id === acc.id && <Check size={14} className="text-blue-600 shrink-0" />}
              </div>
            ))}
          </div>

          {/* Mode */}
          {selectedTarget && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-700">Modo de vinculacion</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setMode("LINK")}
                  className={`flex-1 p-2.5 rounded-md border text-left transition-colors ${mode === "LINK" ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}
                  data-testid="mode-link"
                >
                  <div className="text-xs font-medium text-slate-900">Vincular</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Ambas cuentas quedan activas. Las ventas se suman.</div>
                </button>
                <button
                  onClick={() => setMode("MERGE")}
                  className={`flex-1 p-2.5 rounded-md border text-left transition-colors ${mode === "MERGE" ? "border-amber-400 bg-amber-50" : "border-slate-200 hover:bg-slate-50"}`}
                  data-testid="mode-merge"
                >
                  <div className="text-xs font-medium text-slate-900">Fusionar (Merge)</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Este registro se oculta. Solo queda la cuenta destino.</div>
                </button>
              </div>
            </div>
          )}

          {/* Note */}
          {selectedTarget && (
            <div>
              <label className="text-xs font-medium text-slate-700 mb-1 block">Nota {mode === "MERGE" ? "(obligatoria)" : "(opcional)"}</label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Razon de la vinculacion..." className="text-xs min-h-[50px]" data-testid="link-note" />
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs" data-testid="link-cancel">Cancelar</Button>
          <Button size="sm" className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
            disabled={loading || !selectedTarget || (mode === "MERGE" && note.trim().length < 3)}
            onClick={() => onConfirm(selectedTarget.id, mode, note || null)}
            data-testid="link-confirm">
            {loading && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            {mode === "LINK" ? "Vincular" : "Fusionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
