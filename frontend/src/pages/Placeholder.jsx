/**
 * Placeholder — página vacía con estilo Hilo. Acepta prop `title` y
 * opcionalmente `sprint` (etiqueta de cuándo se entrega).
 */
import React from "react";

export default function Placeholder({ title, sprint = "CRM-D2", subtitle }) {
  return (
    <div data-testid={`placeholder-${title.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="hilo-page-head">
        <div>
          <h1 className="hilo-page-title">{title}</h1>
          {subtitle && <p className="hilo-page-sub">{subtitle}</p>}
        </div>
      </div>

      <div className="hilo-page-empty">
        <h2>{title}</h2>
        <p>Próximamente · Sprint {sprint}</p>
      </div>
    </div>
  );
}
