import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/lib/auth";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";

// Páginas existentes (live)
import CuentasAirtable from "@/pages/CuentasAirtable";
import CuentaDetalle from "@/pages/CuentaDetalle";
import Contactos from "@/pages/Contactos";
import Agenda from "@/pages/Agenda";

// Páginas Hilo
import ColaLlamadas from "@/pages/ColaLlamadas";    // /cola (D2)
import Placeholder from "@/pages/Placeholder";       // resto sprints
import CalidadDatos from "@/pages/CalidadDatos";
import VentasEnVivo from "@/pages/VentasEnVivo";
import Pipeline from "@/pages/Pipeline";
import EquipoVentas from "@/pages/EquipoVentas";
import MapaPeru from "@/pages/MapaPeru";
import CuentasVinculadas from "@/pages/CuentasVinculadas";
import VinculosRevision from "@/pages/VinculosRevision";
import RepartoCartera from "@/pages/RepartoCartera";
import Cobranzas from "@/pages/Cobranzas";

import { Loader2 } from "lucide-react";

/** ProtectedRoute — exige autenticación y opcionalmente rol mínimo. */
function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: "var(--paper)" }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--ink-3)" }} />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (role && Array.isArray(role)) {
    const userRole = user.rol || "vendedora";
    if (!role.includes(userRole)) {
      return <Navigate to="/cola" replace />;
    }
  }

  return <Layout>{children}</Layout>;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: "var(--paper)" }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--ink-3)" }} />
      </div>
    );
  }

  if (user) return <Navigate to="/cola" replace />;
  return children;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />

          {/* Home */}
          <Route path="/"        element={<Navigate to="/cola" replace />} />
          <Route path="/mi-dia"  element={<Navigate to="/cola" replace />} />

          {/* PRINCIPAL — todos los autenticados */}
          <Route path="/cola"          element={<ProtectedRoute><ColaLlamadas /></ProtectedRoute>} />
          <Route path="/pipeline"      element={<ProtectedRoute><Pipeline /></ProtectedRoute>} />
          <Route path="/oportunidades" element={<ProtectedRoute><Placeholder title="Oportunidades" subtitle="Cuentas con potencial accionable" sprint="CRM-D2" /></ProtectedRoute>} />
          <Route path="/cuentas"       element={<ProtectedRoute><CuentasAirtable /></ProtectedRoute>} />
          <Route path="/cuentas-vinculadas" element={<ProtectedRoute><CuentasVinculadas /></ProtectedRoute>} />
          <Route path="/admin/vinculaciones-revision" element={<ProtectedRoute role={["admin", "supervisor"]}><VinculosRevision /></ProtectedRoute>} />
          <Route path="/admin/reparto-cartera" element={<ProtectedRoute role={["admin", "supervisor"]}><RepartoCartera /></ProtectedRoute>} />
          <Route path="/cuentas/:partnerOdooId" element={<ProtectedRoute><CuentaDetalle /></ProtectedRoute>} />
          <Route path="/mapa"          element={<ProtectedRoute><MapaPeru /></ProtectedRoute>} />
          <Route path="/cobranzas"     element={<ProtectedRoute><Cobranzas /></ProtectedRoute>} />
          <Route path="/calendario"    element={<ProtectedRoute><Placeholder title="Calendario comercial" subtitle="Eventos, ferias y campañas" sprint="CRM-D4" /></ProtectedRoute>} />

          {/* Compatibilidad rutas viejas */}
          <Route path="/contactos"     element={<ProtectedRoute><Contactos /></ProtectedRoute>} />
          <Route path="/agenda"        element={<ProtectedRoute><Agenda /></ProtectedRoute>} />

          {/* ANÁLISIS */}
          <Route path="/indicadores"      element={<ProtectedRoute><Placeholder title="Indicadores" subtitle="KPIs y dashboards comerciales" sprint="CRM-D5" /></ProtectedRoute>} />
          <Route path="/productos"        element={<ProtectedRoute><Placeholder title="Productos" subtitle="Catálogo y stock" sprint="CRM-D5" /></ProtectedRoute>} />
          <Route path="/equipo"           element={<ProtectedRoute role={["admin", "supervisor"]}><EquipoVentas /></ProtectedRoute>} />
          <Route path="/automatizaciones" element={<ProtectedRoute><Placeholder title="Automatizaciones" subtitle="Reglas, triggers y plantillas activas" sprint="CRM-D6" /></ProtectedRoute>} />

          {/* HERRAMIENTAS */}
          <Route path="/campanias"  element={<ProtectedRoute><Placeholder title="Campañas WhatsApp" subtitle="Envíos masivos y seguimiento" sprint="CRM-D6" /></ProtectedRoute>} />
          <Route path="/plantillas" element={<ProtectedRoute><Placeholder title="Plantillas" subtitle="Mensajes pre-aprobados" sprint="CRM-D6" /></ProtectedRoute>} />
          <Route path="/importar"   element={<ProtectedRoute role={["admin", "supervisor"]}><Placeholder title="Importar clientes" subtitle="Carga masiva desde CSV/Excel" sprint="CRM-D7" /></ProtectedRoute>} />

          {/* ADMIN */}
          <Route path="/cuentas/calidad-datos" element={<ProtectedRoute role={["admin", "supervisor"]}><CalidadDatos /></ProtectedRoute>} />
          <Route path="/ventas-en-vivo" element={<ProtectedRoute><VentasEnVivo /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/cola" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" theme="light" richColors />
    </AuthProvider>
  );
}

export default App;
