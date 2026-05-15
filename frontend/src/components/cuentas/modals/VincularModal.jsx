/**
 * VincularModal — busca otra cuenta y la vincula al grupo comercial.
 *
 * Si la cuenta actual no tiene grupo, al vincular se crea uno nuevo con
 * la cuenta actual como principal.
 */
import React, { useState, useEffect, useRef } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import HiloIcon from "@/components/HiloIcons";

const fmtMoneyShort = (n) => {
  if (!n) return "S/ 0";
  const v = Number(n);
  if (v >= 1000000) return `S/ ${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `S/ ${(v / 1000).toFixed(0)}k`;
  return `S/ ${v.toFixed(0)}`;
};

export default function VincularModal({ partnerOdooId, viewingNombre, tieneGrupo, onClose, onSaved }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [rolDescripcion, setRolDescripcion] = useState("");
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef(null);

  // Buscar al tipear
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q || q.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await api.get(`/cuentas/${partnerOdooId}/vinculados/buscar`, {
          params: { q: q.trim(), limit: 10 },
        });
        setResults(r.data.items || []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 280);
  }, [q, partnerOdooId]);

  // ESC para cerrar
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const guardar = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.post(`/cuentas/${partnerOdooId}/vinculados/link`, {
        partner_odoo_id: selected.partner_odoo_id,
        rol_descripcion: rolDescripcion.trim() || null,
      });
      toast.success(
        tieneGrupo
          ? `"${selected.name}" vinculada al grupo`
          : `Grupo creado con "${selected.name}"`
      );
      onSaved?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error al vincular");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[60]"
        style={{ background: "rgba(31,26,20,.40)", backdropFilter: "blur(3px)" }}
        onClick={onClose}
      />
      <div
        className="fixed top-1/2 left-1/2 z-[61] bg-white rounded-xl shadow-2xl flex flex-col"
        style={{
          transform: "translate(-50%, -50%)",
          width: 580, maxWidth: "92vw", maxHeight: "85vh",
          border: "1px solid var(--line)",
        }}
        role="dialog"
        aria-modal="true"
        data-testid="vincular-modal"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-lg text-slate-900" style={{ fontFamily: "var(--font-display)" }}>
            Vincular cuenta al grupo
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {tieneGrupo
              ? <>Buscá otra cuenta para sumar al grupo de <b>{viewingNombre}</b></>
              : <>Al vincular, se creará un grupo nuevo con <b>{viewingNombre}</b> como principal</>
            }
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col p-5 gap-3 min-h-0">
          {/* Search */}
          <div className="relative">
            <HiloIcon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              autoFocus
              placeholder="Buscar por nombre o RUC…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400 transition-colors"
              data-testid="vincular-search"
            />
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto min-h-0 -mx-1 px-1">
            {q.trim().length < 2 ? (
              <p className="text-xs text-slate-400 text-center py-8">
                Escribí al menos 2 caracteres
              </p>
            ) : searching ? (
              <p className="text-xs text-slate-400 text-center py-8">Buscando…</p>
            ) : results.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">Sin resultados</p>
            ) : (
              <div className="space-y-1">
                {results.map((r) => {
                  const isSelected = selected?.partner_odoo_id === r.partner_odoo_id;
                  return (
                    <button
                      key={r.partner_odoo_id}
                      onClick={() => setSelected(r)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors ${
                        isSelected
                          ? "border-amber-400 bg-amber-50/50"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                      data-testid={`result-${r.partner_odoo_id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-slate-900 truncate">
                          {r.name}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                          {r.vat && <span className="font-mono">{r.vat}</span>}
                          {r.city && <><span className="text-slate-300">·</span><span>{r.city}</span></>}
                          {r.tier && <><span className="text-slate-300">·</span><span className="font-bold uppercase tracking-wider" style={{ color: r.tier === "estrella" ? "#8B6A1F" : r.tier === "alto" ? "#1E54B0" : r.tier === "medio" ? "#4A4136" : "#8A2F18" }}>{r.tier === "estrella" && "★ "}{r.tier}</span></>}
                        </div>
                      </div>
                      {r.ltv_12m > 0 && (
                        <div className="text-right shrink-0">
                          <div className="text-xs font-mono font-bold text-slate-700">{fmtMoneyShort(r.ltv_12m)}</div>
                          <div className="text-[9px] text-slate-400 uppercase tracking-wider">LTV 12m</div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Rol descripcion (opcional) */}
          {selected && (
            <div className="border-t border-slate-100 pt-3">
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-mono block mb-1.5">
                Rol en el grupo (opcional)
              </label>
              <input
                type="text"
                placeholder="ej: Sucursal Cusco, Hijo del dueño…"
                value={rolDescripcion}
                onChange={(e) => setRolDescripcion(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400"
                data-testid="vincular-rol"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/40">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-700 border border-slate-200 hover:bg-white"
            data-testid="vincular-cancel"
          >
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={!selected || saving}
            className="px-4 py-1.5 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            data-testid="vincular-save"
          >
            {saving ? "Vinculando…" : tieneGrupo ? "Vincular" : "Crear grupo y vincular"}
          </button>
        </div>
      </div>
    </>
  );
}
