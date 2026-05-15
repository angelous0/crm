// Set de iconos SVG inline del diseño Hilo Andino.
// Convertido del icons.jsx de la referencia a un componente React moderno.
import React from "react";

const PATHS = {
  today: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15 20c0-2.5 1.8-4.5 4-4.5" />
    </>
  ),
  map: (
    <>
      <path d="M9 3 3 5v16l6-2 6 2 6-2V3l-6 2z" />
      <path d="M9 3v16M15 5v16" />
    </>
  ),
  chart: <path d="M4 20V8M10 20V4M16 20v-8M22 20H2" />,
  bolt: <path d="M13 3 4 14h7l-1 7 9-11h-7z" />,
  family: (
    <>
      <circle cx="7" cy="8" r="3" />
      <circle cx="17" cy="8" r="3" />
      <path d="M2 20c0-2.8 2.2-5 5-5s5 2.2 5 5" />
      <path d="M12 20c0-2.8 2.2-5 5-5s5 2.2 5 5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  bell: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 21a2 2 0 0 0 4 0" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  phone: (
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
  ),
  wa: (
    <>
      <path d="M3 21l1.6-5.4A8.4 8.4 0 1 1 12 21a8.4 8.4 0 0 1-4.2-1.1z" />
      <path d="M9 9c.3 1.5 1 3 2.5 4.5S14.5 15 16 15.3l-1 1.5c-2 .2-5-2-6.7-3.7S6.7 8 7 6l1.5-1z" />
    </>
  ),
  pin: (
    <>
      <path d="M12 22s7-7.5 7-13a7 7 0 1 0-14 0c0 5.5 7 13 7 13z" />
      <circle cx="12" cy="9" r="2.5" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  cart: (
    <>
      <path d="M3 3h3l2 13h11l2-9H6" />
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="17" cy="20" r="1.5" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  check: <path d="m4 12 5 5 11-12" />,
  filter: <path d="M3 5h18M6 12h12M10 19h4" />,
  sparkle: (
    <path d="M12 3v6M12 15v6M3 12h6M15 12h6M6 6l4 4M14 14l4 4M18 6l-4 4M10 14l-4 4" />
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.3 2.5a7 7 0 0 0-1.7 1l-2.4-1-2 3.5L5.1 11a7 7 0 0 0 0 2L3.1 14.5l2 3.5 2.4-1a7 7 0 0 0 1.7 1L9.5 21h5l.3-2.5a7 7 0 0 0 1.7-1l2.4 1 2-3.5L19 13z" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </>
  ),
  upload: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m17 8-5-5-5 5M12 3v12" />
    </>
  ),
};

export default function HiloIcon({ name, size = 16, className = "" }) {
  const path = PATHS[name];
  if (!path) return null;
  return (
    <svg
      className={`ic ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}
