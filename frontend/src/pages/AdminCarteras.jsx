/**
 * AdminCarteras — gestión de carteras (admin/supervisor).
 *
 * Por ahora muestra la lista de usuarios + cuántas cuentas tiene asignadas
 * cada uno. La asignación masiva se entrega en CRM-D3.
 */
import React, { useState, useEffect } from "react";
import api from "@/lib/api";

export default function AdminCarteras() {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get("/admin/usuarios")
      .then((r) => setUsuarios(r.data.items || []))
      .catch((e) => setError(e?.response?.data?.detail || "Error cargando usuarios"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div data-testid="admin-carteras-page">
      <div className="hilo-page-head">
        <div>
          <h1 className="hilo-page-title">
            Gestión de <em>carteras</em>
          </h1>
          <p className="hilo-page-sub">Asignación de cuentas a vendedoras</p>
        </div>
      </div>

      {error && (
        <div className="hilo-panel" style={{ padding: 18, color: "var(--crit)" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="hilo-page-empty">
          <p>Cargando…</p>
        </div>
      ) : (
        <div className="hilo-panel">
          <div className="hilo-panel-head">
            <h3 className="hilo-panel-title">Usuarios del CRM</h3>
            <span className="hilo-panel-sub">{usuarios.length} usuarios</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--paper-2)" }}>
                <th style={th}>Usuario</th>
                <th style={th}>Nombre</th>
                <th style={th}>Rol</th>
                <th style={{ ...th, textAlign: "right" }}>Cuentas</th>
                <th style={th}>Estado</th>
                <th style={th}>Último login</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.username} style={{ borderBottom: "1px solid var(--paper-3)" }}>
                  <td style={td}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                      {u.username}
                    </span>
                  </td>
                  <td style={td}>{u.nombre_completo || "—"}</td>
                  <td style={td}>
                    <span className={`hilo-state-pill ${rolPillClass(u.rol)}`}>
                      {u.rol}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)" }}>
                    {u.cuentas_asignadas}
                  </td>
                  <td style={td}>
                    <span className={`hilo-chip ${u.activo ? "ok" : "crit"}`}>
                      {u.activo ? "activo" : "inactivo"}
                    </span>
                  </td>
                  <td style={{ ...td, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                    {u.ultimo_login ? new Date(u.ultimo_login).toLocaleDateString("es-PE") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ marginTop: 18, color: "var(--ink-3)", fontSize: 12, fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
        Asignación masiva próximamente · Sprint CRM-D3
      </p>
    </div>
  );
}

const th = {
  textAlign: "left",
  padding: "10px 14px",
  borderBottom: "1px solid var(--paper-3)",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
  fontWeight: 500,
};
const td = {
  padding: "10px 14px",
};

function rolPillClass(rol) {
  if (rol === "admin") return "vip";
  if (rol === "supervisor") return "nuevo";
  return "activo";
}
