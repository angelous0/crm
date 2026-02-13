import React, { useState, useEffect } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Users, UserCircle, CalendarClock, MessageSquare, Package,
  Loader2, Play, BarChart3
} from "lucide-react";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get("/stats");
        setStats(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleBootstrap = async () => {
    setBootstrapping(true);
    try {
      const res = await api.post("/bootstrap/inicializar");
      toast.success(`Inicializacion completa: ${res.data.cuentas_creadas} cuentas, ${res.data.contactos_creados} contactos creados`);
      // Refresh stats
      const statsRes = await api.get("/stats");
      setStats(statsRes.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error en inicializacion");
    } finally {
      setBootstrapping(false);
    }
  };

  const statCards = [
    { label: "Cuentas", value: stats?.cuentas || 0, icon: Users, color: "text-blue-600 bg-blue-50" },
    { label: "Contactos", value: stats?.contactos || 0, icon: UserCircle, color: "text-emerald-600 bg-emerald-50" },
    { label: "Tareas pendientes", value: stats?.tareas_pendientes || 0, icon: CalendarClock, color: "text-amber-600 bg-amber-50" },
    { label: "Interacciones", value: stats?.interacciones || 0, icon: MessageSquare, color: "text-violet-600 bg-violet-50" },
    { label: "Productos aprobados", value: stats?.productos_aprobados || 0, icon: Package, color: "text-slate-600 bg-slate-100" },
  ];

  return (
    <div data-testid="dashboard-page">
      <div className="px-8 py-6 border-b border-border bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
            <p className="text-sm text-slate-500 mt-1">Vista general del CRM</p>
          </div>
          <Button
            onClick={handleBootstrap}
            disabled={bootstrapping}
            variant="outline"
            data-testid="bootstrap-btn"
          >
            {bootstrapping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2" size={16} />}
            Inicializar CRM
          </Button>
        </div>
      </div>

      <div className="p-8">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
              {statCards.map(({ label, value, icon: Icon, color }) => (
                <Card key={label} className="border shadow-sm hover:shadow-md transition-shadow duration-300">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
                        <Icon size={20} strokeWidth={1.5} />
                      </div>
                    </div>
                    <p className="text-3xl font-heading font-semibold text-slate-900 tracking-tight">
                      {value.toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-medium">{label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Quick info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="border shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <BarChart3 size={20} className="text-slate-500" strokeWidth={1.5} />
                    <h3 className="font-heading font-medium text-lg text-slate-900">Flujo de trabajo</h3>
                  </div>
                  <ol className="space-y-3 text-sm text-slate-600">
                    <li className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                      <span>Ve a <strong>Catalogo</strong> y aprueba los productos que quieres gestionar en el CRM</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                      <span>Haz clic en <strong>Inicializar CRM</strong> para crear cuentas y contactos desde las ventas POS</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                      <span>Gestiona <strong>Cuentas</strong>, asigna estados comerciales y clasificaciones</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
                      <span>Registra <strong>interacciones</strong> y crea <strong>tareas</strong> de seguimiento</span>
                    </li>
                  </ol>
                </CardContent>
              </Card>

              <Card className="border shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Package size={20} className="text-slate-500" strokeWidth={1.5} />
                    <h3 className="font-heading font-medium text-lg text-slate-900">Sobre este CRM</h3>
                  </div>
                  <div className="space-y-3 text-sm text-slate-600">
                    <p>Este CRM esta integrado con <strong>Odoo</strong> (solo lectura). Los datos de clientes y ventas vienen del schema <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">odoo</code>.</p>
                    <p>Solo los productos <strong>aprobados</strong> en el catalogo se muestran en las ventas filtradas. Las cuentas se consolidan por "cliente principal".</p>
                    <p>Las interacciones y tareas se guardan en el schema <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">crm</code>, independiente de Odoo.</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
