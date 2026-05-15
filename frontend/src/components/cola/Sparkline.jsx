import React from "react";

/**
 * Sparkline minimalista (SVG inline). Recibe array de números y dibuja un
 * trazo polylínea normalizado al ancho/alto del SVG. Si data está vacía
 * renderiza un placeholder.
 */
export default function Sparkline({ data = [], height = 28, color }) {
  const stroke = color || "var(--clay)";
  if (!data || data.length < 2) {
    return (
      <svg className="hilo-kpi-spark" viewBox="0 0 100 28" preserveAspectRatio="none">
        <line
          x1="0" y1="14" x2="100" y2="14"
          stroke="var(--paper-3)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
      </svg>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 100;
  const h = height;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  // Area fill
  const areaPath = `M0,${h} L${points.join(" L")} L${w},${h} Z`;
  const linePath = `M${points.join(" L")}`;

  return (
    <svg
      className="hilo-kpi-spark"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={areaPath} fill={stroke} fillOpacity="0.10" />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth="1.5" />
    </svg>
  );
}
