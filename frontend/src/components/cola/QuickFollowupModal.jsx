/**
 * QuickFollowupModal — registro rápido de resultado de llamada.
 *
 * Props:
 *   - cuenta: { partner_odoo_id, nombre, ... }
 *   - onClose: () => void
 *   - onSaved: (result) => void   // tras guardar exitosamente
 */
import React, { useState, useEffect } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import HiloIcon from "@/components/HiloIcons";

const RESULTADOS = [
  { id: "vendi",         emoji: "😊", label: "Vendí" },
  { id: "comprometio",   emoji: "🤝", label: "Comprometió" },
  { id: "tibio",         emoji: "😐", label: "Tibio" },
  { id: "no_interesado", emoji: "😞", label: "No interesado" },
  { id: "no_contesto",   emoji: "📞", label: "No contestó" },
];

const QUICK_DATES = [
  { id: 1,  label: "Mañana" },
  { id: 3,  label: "3 días" },
  { id: 7,  label: "1 semana" },
  { id: 14, label: "2 semanas" },
  { id: 30, label: "1 mes" },
];

const CANALES = [
  { id: "llamada", label: "Llamada" },
  { id: "wa",      label: "WhatsApp" },
  { id: "visita",  label: "Visita" },
  { id: "email",   label: "Email" },
];

export default function QuickFollowupModal({ cuenta, onClose, onSaved }) {
  const [resultado, setResultado] = useState(null);
  const [canal, setCanal] = useState("llamada");
  const [nota, setNota] = useState("");
  const [proximoDias, setProximoDias] = useState(null);
  const [saving, setSaving] = useState(false);

  // Auto-sugerir próximo seguimiento según resultado
  useEffect(() => {
    if (!resultado) return;
    const defaultDays = {
      vendi: 30,
      comprometio: 3,
      tibio: 7,
      no_interesado: 90,
      no_contesto: 1,
    };
    if (proximoDias === null) {
      setProximoDias(defaultDays[resultado] ?? 7);
    }
  }, [resultado]); // eslint-disable-line

  // ESC para cerrar
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!cuenta) return null;

  const canSave = !!resultado && !saving;

  const guardar = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const r = await api.post("/cola/quick-followup", {
        cuenta_partner_odoo_id: cuenta.partner_odoo_id,
        resultado,
        canal,
        nota: nota.trim() || null,
        proximo_seguimiento_dias: proximoDias,
      });
      const opt = RESULTADOS.find((x) => x.id === resultado);
      const sufijo = proximoDias ? ` · próximo en ${proximoDias} ${proximoDias === 1 ? "día" : "días"}` : "";
      toast.success(`${opt.emoji} Registrado${sufijo}`);
      onSaved?.(r.data);
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error al registrar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="hilo-qf-backdrop" onClick={onClose} />
      <div
        className="hilo-qf-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="qf-title"
        data-testid="quickfollowup-modal"
      >
        <div className="hilo-qf-head">
          <h3 className="hilo-qf-title" id="qf-title">
            ¿Cómo te fue con <em style={{ color: "var(--clay)", fontStyle: "italic" }}>{cuenta.nombre || `cuenta ${cuenta.partner_odoo_id}`}</em>?
          </h3>
        </div>

        <div className="hilo-qf-body">
          {/* Resultado */}
          <div>
            <label className="hilo-qf-label">Resultado</label>
            <div className="hilo-qf-results">
              {RESULTADOS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`hilo-qf-result ${resultado === r.id ? "on" : ""}`}
                  onClick={() => setResultado(r.id)}
                  data-testid={`qf-result-${r.id}`}
                >
                  <span className="hilo-qf-result-emoji">{r.emoji}</span>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Canal */}
          <div>
            <label className="hilo-qf-label">Canal</label>
            <div className="hilo-qf-quick-dates">
              {CANALES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`hilo-qf-quick-date ${canal === c.id ? "on" : ""}`}
                  onClick={() => setCanal(c.id)}
                  data-testid={`qf-canal-${c.id}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Nota */}
          <div>
            <label className="hilo-qf-label">Notas (opcional)</label>
            <textarea
              className="hilo-qf-textarea"
              placeholder="Detalles, próximos pasos, objeciones…"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              data-testid="qf-nota"
            />
          </div>

          {/* Próximo seguimiento */}
          <div>
            <label className="hilo-qf-label">Próximo seguimiento</label>
            <div className="hilo-qf-quick-dates">
              {QUICK_DATES.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`hilo-qf-quick-date ${proximoDias === d.id ? "on" : ""}`}
                  onClick={() => setProximoDias(d.id)}
                  data-testid={`qf-fecha-${d.id}`}
                >
                  {d.label}
                </button>
              ))}
              <button
                type="button"
                className={`hilo-qf-quick-date ${proximoDias === 0 ? "on" : ""}`}
                onClick={() => setProximoDias(0)}
                data-testid="qf-fecha-ninguno"
              >
                No programar
              </button>
            </div>
          </div>
        </div>

        <div className="hilo-qf-foot">
          <button
            className="hilo-btn hilo-btn-ghost"
            onClick={onClose}
            disabled={saving}
            data-testid="qf-cancel"
          >
            Cancelar
          </button>
          <button
            className="hilo-btn hilo-btn-primary"
            onClick={guardar}
            disabled={!canSave}
            data-testid="qf-save"
          >
            <HiloIcon name="check" size={14} />
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </>
  );
}
