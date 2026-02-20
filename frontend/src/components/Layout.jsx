import React, { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard, Package, Users, UserCircle,
  CalendarClock, ShoppingCart, LogOut, ChevronRight, BarChart3,
  PanelLeftClose, PanelLeftOpen, Grid3X3, ShoppingBag, FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/stock-dashboard", icon: BarChart3, label: "Stock Dashboard" },
  { to: "/balance-tallas", icon: Grid3X3, label: "Balance de Tallas" },
  { to: "/comercial", icon: ShoppingBag, label: "Ventas y Reservas" },
  { to: "/creditos", icon: FileText, label: "Creditos" },
  { to: "/catalogo", icon: Package, label: "Catalogo" },
  { to: "/cuentas", icon: Users, label: "Cuentas" },
  { to: "/contactos", icon: UserCircle, label: "Contactos" },
  { to: "/agenda", icon: CalendarClock, label: "Agenda" },
  { to: "/ventas", icon: ShoppingCart, label: "Ventas" },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebar_collapsed") === "true"; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem("sidebar_collapsed", collapsed); } catch {}
  }, [collapsed]);

  const handleLogout = () => { logout(); navigate("/login"); };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen overflow-hidden bg-slate-50/50">
        {/* Sidebar */}
        <aside
          className={`flex-shrink-0 bg-white border-r border-border flex flex-col transition-all duration-200 ${collapsed ? "w-[60px]" : "w-[220px]"}`}
          data-testid="sidebar"
        >
          {/* Logo + Toggle */}
          <div className="h-14 flex items-center justify-between px-3 border-b border-border">
            {!collapsed && (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-slate-900 rounded-md flex items-center justify-center">
                  <span className="text-white font-heading font-bold text-xs">C</span>
                </div>
                <span className="font-heading font-semibold text-sm tracking-tight text-slate-900">CRM B2B</span>
              </div>
            )}
            <Button
              variant="ghost" size="sm"
              className={`h-7 w-7 p-0 text-slate-400 hover:text-slate-700 ${collapsed ? "mx-auto" : ""}`}
              onClick={() => setCollapsed(c => !c)}
              data-testid="sidebar-toggle"
            >
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 py-3 px-2 space-y-0.5" data-testid="sidebar-nav">
            {navItems.map(({ to, icon: Icon, label }) => {
              const link = (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium transition-colors duration-150 group ${
                      isActive
                        ? "bg-slate-900 text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    } ${collapsed ? "justify-center px-0" : ""}`
                  }
                  data-testid={`nav-${label.toLowerCase().replace(/\s/g, '-')}`}
                >
                  <Icon size={17} strokeWidth={1.5} />
                  {!collapsed && <span className="truncate">{label}</span>}
                  {!collapsed && <ChevronRight size={13} className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />}
                </NavLink>
              );

              if (collapsed) {
                return (
                  <Tooltip key={to}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">{label}</TooltipContent>
                  </Tooltip>
                );
              }
              return link;
            })}
          </nav>

          {/* User section */}
          <div className={`p-3 border-t border-border ${collapsed ? "flex flex-col items-center" : ""}`}>
            {!collapsed && (
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center">
                  <span className="text-[10px] font-semibold text-slate-600">
                    {user?.nombre?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-900 truncate">{user?.nombre || user?.email}</p>
                  <p className="text-[10px] text-slate-500 truncate">{user?.rol || "vendedor"}</p>
                </div>
              </div>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost" size="sm"
                  className={`text-slate-500 hover:text-slate-900 ${collapsed ? "h-8 w-8 p-0" : "w-full justify-start text-xs h-8"}`}
                  onClick={handleLogout}
                  data-testid="logout-btn"
                >
                  <LogOut size={15} className={collapsed ? "" : "mr-2"} />
                  {!collapsed && "Cerrar sesion"}
                </Button>
              </TooltipTrigger>
              {collapsed && <TooltipContent side="right" className="text-xs">Cerrar sesion</TooltipContent>}
            </Tooltip>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto flex flex-col min-h-0">
          {children}
        </main>
      </div>
    </TooltipProvider>
  );
}
