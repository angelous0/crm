import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard, Package, Users, UserCircle,
  CalendarClock, ShoppingCart, LogOut, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/catalogo", icon: Package, label: "Catalogo" },
  { to: "/cuentas", icon: Users, label: "Cuentas" },
  { to: "/contactos", icon: UserCircle, label: "Contactos" },
  { to: "/agenda", icon: CalendarClock, label: "Agenda" },
  { to: "/ventas", icon: ShoppingCart, label: "Ventas" },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50/50">
      {/* Sidebar */}
      <aside className="w-[250px] flex-shrink-0 bg-white border-r border-border flex flex-col" data-testid="sidebar">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-900 rounded-md flex items-center justify-center">
              <span className="text-white font-heading font-bold text-sm">C</span>
            </div>
            <span className="font-heading font-semibold text-lg tracking-tight text-slate-900">CRM B2B</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-1" data-testid="sidebar-nav">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors duration-200 group ${
                  isActive
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`
              }
              data-testid={`nav-${label.toLowerCase()}`}
            >
              <Icon size={18} strokeWidth={1.5} />
              <span>{label}</span>
              <ChevronRight size={14} className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
              <span className="text-xs font-semibold text-slate-600">
                {user?.nombre?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{user?.nombre || user?.email}</p>
              <p className="text-xs text-slate-500 truncate">{user?.rol || "vendedor"}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-slate-500 hover:text-slate-900"
            onClick={handleLogout}
            data-testid="logout-btn"
          >
            <LogOut size={16} className="mr-2" />
            Cerrar sesion
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
