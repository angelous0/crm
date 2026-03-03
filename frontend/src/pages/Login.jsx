import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ usuario: "", password: "", nombre: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isRegister) {
        await register(form.usuario, form.password, form.nombre);
        toast.success("Cuenta creada exitosamente");
      } else {
        await login(form.usuario, form.password);
        toast.success("Bienvenido");
      }
      navigate("/");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error de autenticacion");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" data-testid="login-page">
      {/* Left - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 bg-slate-900 rounded-lg flex items-center justify-center">
                <span className="text-white font-heading font-bold text-lg">C</span>
              </div>
              <span className="font-heading font-semibold text-2xl tracking-tight text-slate-900">CRM B2B</span>
            </div>
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-slate-900 mb-2">
              {isRegister ? "Crear cuenta" : "Iniciar sesion"}
            </h1>
            <p className="text-sm text-slate-500">
              {isRegister
                ? "Registrate para acceder al CRM"
                : "Ingresa tus credenciales para continuar"
              }
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {isRegister && (
              <div className="space-y-2">
                <Label htmlFor="nombre" className="text-xs uppercase tracking-wider font-semibold text-slate-500">
                  Nombre
                </Label>
                <Input
                  id="nombre"
                  data-testid="register-nombre-input"
                  placeholder="Tu nombre completo"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="usuario" className="text-xs uppercase tracking-wider font-semibold text-slate-500">
                Usuario
              </Label>
              <Input
                id="usuario"
                type="text"
                data-testid="login-usuario-input"
                placeholder="Tu usuario"
                required
                value={form.usuario}
                onChange={(e) => setForm({ ...form, usuario: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs uppercase tracking-wider font-semibold text-slate-500">
                Contrasena
              </Label>
              <Input
                id="password"
                type="password"
                data-testid="login-password-input"
                placeholder="Tu contrasena"
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11"
              disabled={loading}
              data-testid="login-submit-btn"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isRegister ? "Registrarse" : "Iniciar sesion"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
              onClick={() => setIsRegister(!isRegister)}
              data-testid="toggle-auth-mode"
            >
              {isRegister
                ? "Ya tienes cuenta? Inicia sesion"
                : "No tienes cuenta? Registrate"
              }
            </button>
          </div>
        </div>
      </div>

      {/* Right - Branding */}
      <div className="hidden lg:flex flex-1 bg-slate-900 items-center justify-center p-12">
        <div className="max-w-md text-center">
          <div className="w-20 h-20 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-8">
            <span className="text-white font-heading font-bold text-4xl">C</span>
          </div>
          <h2 className="font-heading text-3xl font-semibold text-white mb-4 tracking-tight">
            Gestiona tus clientes B2B
          </h2>
          <p className="text-slate-400 text-base leading-relaxed">
            Control total de cuentas, contactos, ventas POS y seguimiento de interacciones por WhatsApp, llamadas y visitas.
          </p>
        </div>
      </div>
    </div>
  );
}
