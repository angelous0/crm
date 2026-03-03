import { useState, useEffect, useCallback, useRef } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, CheckCircle2, XCircle, Clock } from "lucide-react";

const fmtAgo = (d) => {
  if (!d) return "nunca";
  const ms = Date.now() - new Date(d).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "hace instantes";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
};

const STATUS_CONFIG = {
  SUCCESS: { icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-50", border: "border-emerald-200", label: "OK" },
  RUNNING: { icon: Loader2, color: "text-blue-500", bg: "bg-blue-50", border: "border-blue-200", label: "Sincronizando..." },
  ERROR: { icon: XCircle, color: "text-red-500", bg: "bg-red-50", border: "border-red-200", label: "Error" },
  IDLE: { icon: Clock, color: "text-slate-400", bg: "bg-slate-50", border: "border-slate-200", label: "Sin datos" },
};

/**
 * Reusable sync button + status badge.
 * @param {string} jobCode - e.g. 'RES_PARTNER', 'POS_ORDERS'
 * @param {string} label - Button text, e.g. 'Actualizar Clientes'
 * @param {function} onSuccess - Called when sync completes successfully
 * @param {string} variant - 'bar' (dark bg) or 'card' (light bg, default)
 */
export function SyncButton({ jobCode, label, onSuccess, variant = "card" }) {
  const [status, setStatus] = useState(null); // { status, last_success_at, last_error, ... }
  const [running, setRunning] = useState(false);
  const pollRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    fetchStatus();
    return () => { mountedRef.current = false; clearInterval(pollRef.current); };
  }, [jobCode]); // eslint-disable-line

  const fetchStatus = useCallback(async () => {
    try {
      const r = await api.get("/ods-sync/job-status", { params: { job_code: jobCode } });
      if (mountedRef.current) setStatus(r.data);
      return r.data;
    } catch {
      if (mountedRef.current) setStatus(null);
      return null;
    }
  }, [jobCode]);

  const startPolling = useCallback(() => {
    clearInterval(pollRef.current);
    let polls = 0;
    pollRef.current = setInterval(async () => {
      polls++;
      const s = await fetchStatus();
      // Job finished (SUCCESS or ERROR) or max polls reached
      if (!s || s.status !== "RUNNING" || polls >= 30) {
        clearInterval(pollRef.current);
        if (mountedRef.current) {
          setRunning(false);
          if (s?.status === "SUCCESS") {
            toast.success(`${label}: sincronizacion completada`, { duration: 4000 });
            if (onSuccess) onSuccess();
          } else if (s?.status === "ERROR") {
            toast.error(`${label}: error - ${s.last_error || "desconocido"}`);
          }
        }
      }
    }, 3000);
  }, [fetchStatus, label, onSuccess]);

  const handleRun = async () => {
    setRunning(true);
    try {
      await api.post("/ods-sync/run", { job_code: jobCode });
      toast.info(`${label}: sincronizacion iniciada...`);
      // Small delay then start polling (ODS processes in background)
      setTimeout(() => startPolling(), 1500);
    } catch (e) {
      setRunning(false);
      const msg = e.response?.data?.detail || `Error al iniciar ${label}`;
      if (e.response?.status === 503) {
        toast.error("Servidor ODS no disponible. Asegurate de que este activo.", { duration: 5000 });
      } else {
        toast.error(msg);
      }
    }
  };

  const st = running ? "RUNNING" : (status?.status || "IDLE");
  const cfg = STATUS_CONFIG[st] || STATUS_CONFIG.IDLE;
  const Icon = cfg.icon;
  const isDark = variant === "bar";

  return (
    <div className={`inline-flex items-center gap-2 ${isDark ? "" : ""}`} data-testid={`sync-${jobCode.toLowerCase()}`}>
      {/* Status badge */}
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] ${isDark ? "border-slate-600 bg-slate-800" : `${cfg.bg} ${cfg.border}`}`}
        data-testid={`sync-status-${jobCode.toLowerCase()}`}>
        <Icon size={11} className={`${cfg.color} ${st === "RUNNING" ? "animate-spin" : ""}`} />
        <span className={isDark ? "text-slate-300" : "text-slate-600"}>
          {st === "RUNNING" ? cfg.label : fmtAgo(status?.last_success_at)}
        </span>
      </div>

      {/* Run button */}
      <Button
        size="sm"
        variant={isDark ? "secondary" : "outline"}
        className={`h-7 px-2.5 text-[10px] gap-1 ${isDark ? "bg-slate-700 hover:bg-slate-600 text-white border-0" : ""}`}
        disabled={running}
        onClick={handleRun}
        data-testid={`sync-run-${jobCode.toLowerCase()}`}
      >
        {running ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
        {label}
      </Button>

      {/* Error tooltip */}
      {status?.last_error && st !== "RUNNING" && (
        <span className="text-[9px] text-red-500 max-w-[150px] truncate" title={status.last_error}
          data-testid={`sync-error-${jobCode.toLowerCase()}`}>
          {status.last_error}
        </span>
      )}
    </div>
  );
}
