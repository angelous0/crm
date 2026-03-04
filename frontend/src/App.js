import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/lib/auth";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Catalogo from "@/pages/Catalogo";
import Cuentas from "@/pages/Cuentas";
import CuentasAirtable from "@/pages/CuentasAirtable";
import CuentaDetalle from "@/pages/CuentaDetalle";
import Contactos from "@/pages/Contactos";
import Agenda from "@/pages/Agenda";
import StockDashboard from "@/pages/StockDashboard";
import BalanceTallas from "@/pages/BalanceTallas";
import ComercialPage from "@/pages/ComercialPage";
import CreditosPage from "@/pages/CreditosPage";
import PendientesPage from "@/pages/PendientesPage";
import MiDiaPage from "@/pages/MiDiaPage";
import { Loader2 } from "lucide-react";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Layout>{children}</Layout>;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/" element={<ProtectedRoute><MiDiaPage /></ProtectedRoute>} />
          <Route path="/mi-dia" element={<ProtectedRoute><MiDiaPage /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/stock-dashboard" element={<ProtectedRoute><StockDashboard /></ProtectedRoute>} />
          <Route path="/balance-tallas" element={<ProtectedRoute><BalanceTallas /></ProtectedRoute>} />
          <Route path="/comercial" element={<ProtectedRoute><ComercialPage /></ProtectedRoute>} />
          <Route path="/creditos" element={<ProtectedRoute><CreditosPage /></ProtectedRoute>} />
          <Route path="/catalogo" element={<ProtectedRoute><Catalogo /></ProtectedRoute>} />
          <Route path="/cuentas" element={<ProtectedRoute><CuentasAirtable /></ProtectedRoute>} />
          <Route path="/cuentas/:id" element={<ProtectedRoute><CuentaDetalle /></ProtectedRoute>} />
          <Route path="/pendientes" element={<ProtectedRoute><PendientesPage /></ProtectedRoute>} />
          <Route path="/contactos" element={<ProtectedRoute><Contactos /></ProtectedRoute>} />
          <Route path="/agenda" element={<ProtectedRoute><Agenda /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" theme="light" richColors />
    </AuthProvider>
  );
}

export default App;
