// ============================================================
// QUICK FOLLOWUP — registro rápido de seguimiento (5 segundos)
// ============================================================
const { useState: useStateQF } = React;

const RESULT_OPTIONS = [
  { id: "compro",        emoji: "🛒", label: "Compró / pedido",     color: "var(--olive)",  next: 30 },
  { id: "no-contesta",   emoji: "📵", label: "No contesta",          color: "var(--ochre)",  next: 2 },
  { id: "interesado",    emoji: "💬", label: "Interesado · pendiente", color: "var(--clay)",  next: 7 },
  { id: "no-interesado", emoji: "🚫", label: "No interesado ahora",  color: "var(--ink-3)",  next: 60 },
  { id: "visita",        emoji: "📍", label: "Agendar visita",        color: "var(--plum)",   next: 3 },
  { id: "cobranza",      emoji: "💳", label: "Cobranza pendiente",   color: "var(--clay-deep)", next: 5 },
];

function QuickFollowup({ client, onSave, onClose }) {
  const [result, setResult] = useStateQF(null);
  const [reason, setReason] = useStateQF(null);
  const [note, setNote] = useStateQF("");
  const [nextDays, setNextDays] = useStateQF(7);

  const onResultPick = (r) => {
    setResult(r.id);
    setNextDays(r.next);
    if (r.id === "compro") setReason(null);
  };

  const showReasons = result && result !== "compro" && result !== "visita";

  const dateOptions = [
    { d: 1, l: "Mañana" },
    { d: 3, l: "En 3 días" },
    { d: 7, l: "Próx. semana" },
    { d: 15, l: "En 15 días" },
    { d: 30, l: "En 1 mes" },
  ];

  const handleSave = () => {
    onSave({ clientId: client.id, result, reason, note, nextDays });
    onClose();
  };

  return (
    <>
      <div className="qf-backdrop" onClick={onClose}></div>
      <div className="qf-modal">
        <div className="qf-head">
          <div className={`mini-avatar k${window.HiloHelpers.colorKey(client.id)}`} style={{ width: 38, height: 38 }}>
            {window.HiloHelpers.initialsOf(client.name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--ink-3)", textTransform: "uppercase" }}>
              Registro rápido
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 500, letterSpacing: "-0.01em", lineHeight: 1.15 }}>
              {client.name}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}><Icon name="close" size={14}/></button>
        </div>

        <div className="qf-body">
          <span className="qf-label">¿Qué pasó? · 1 click</span>
          <div className="qf-results">
            {RESULT_OPTIONS.map(r => (
              <button
                key={r.id}
                className={`qf-result ${result === r.id ? "on" : ""}`}
                onClick={() => onResultPick(r)}
              >
                <span className="qf-result-emoji">{r.emoji}</span>
                <span>{r.label}</span>
              </button>
            ))}
          </div>

          <div style={{ marginTop: 18, display: showReasons ? "block" : "none", animation: "qfIn .2s" }}>
            <span className="qf-label">¿Por qué no compró?</span>
            <div className="qf-results" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              {(window.HiloLogic?.NO_PURCHASE_REASONS || []).map(r => (
                <button
                  key={r.id}
                  className={`qf-result ${reason === r.id ? "on" : ""}`}
                  onClick={() => setReason(r.id)}
                  style={{ padding: "10px 12px", fontSize: 12 }}
                >
                  <span className="qf-result-emoji" style={{ width: 24, height: 24, fontSize: 14 }}>{r.emoji}</span>
                  <span>{r.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <span className="qf-label">Nota rápida (opcional)</span>
            <textarea
              className="qf-textarea"
              placeholder="Ej: Pidió cotización de 40 chompas Killari para el 15…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div style={{ marginTop: 18 }}>
            <span className="qf-label">Volver a contactar</span>
            <div className="qf-quick-dates">
              {dateOptions.map(o => (
                <button
                  key={o.d}
                  className={`qf-quick-date ${nextDays === o.d ? "on" : ""}`}
                  onClick={() => setNextDays(o.d)}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="qf-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!result}
            style={{ opacity: result ? 1 : 0.4, pointerEvents: result ? "auto" : "none" }}
          >
            <Icon name="check" size={14}/> Guardar y siguiente
          </button>
        </div>
      </div>
    </>
  );
}

window.QuickFollowup = QuickFollowup;
window.RESULT_OPTIONS = RESULT_OPTIONS;
