import React, { createContext, useContext, useState, useEffect } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Hard timeout: si por cualquier motivo no se resuelve en 10s, liberamos
    // el spinner y dejamos que el usuario vea login/contenido.
    const timeoutId = setTimeout(() => {
      console.warn("[AuthProvider] hard timeout 10s — forzando loading=false");
      setLoading(false);
    }, 10000);

    const token = localStorage.getItem("crm_token");
    const savedUserRaw = localStorage.getItem("crm_user");

    // Parse defensivo: si el JSON está corrupto, limpiamos y vamos a login
    let savedUser = null;
    if (savedUserRaw && savedUserRaw !== "undefined" && savedUserRaw !== "null") {
      try {
        savedUser = JSON.parse(savedUserRaw);
      } catch (e) {
        console.warn("[AuthProvider] crm_user corrupto, limpiando localStorage");
        localStorage.removeItem("crm_token");
        localStorage.removeItem("crm_user");
      }
    }

    if (token && savedUser) {
      setUser(savedUser);
      // Verify token
      api.get("/auth/me").then(res => {
        setUser(res.data);
        try { localStorage.setItem("crm_user", JSON.stringify(res.data)); } catch {}
      }).catch(() => {
        localStorage.removeItem("crm_token");
        localStorage.removeItem("crm_user");
        setUser(null);
      }).finally(() => {
        clearTimeout(timeoutId);
        setLoading(false);
      });
    } else {
      clearTimeout(timeoutId);
      setLoading(false);
    }

    return () => clearTimeout(timeoutId);
  }, []);

  const login = async (usuario, password) => {
    // Backend espera `username` y devuelve `access_token` (compatible con ventas)
    const res = await api.post("/auth/login", { username: usuario, password });
    localStorage.setItem("crm_token", res.data.access_token);
    localStorage.setItem("crm_user", JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data;
  };

  const register = async (usuario, password, nombre) => {
    // Endpoint /auth/register aún no existe en el backend nuevo (los usuarios se
    // gestionan desde produccion). Mantenemos la firma para no romper Login.jsx.
    throw new Error("Registro deshabilitado. Pide un usuario al admin.");
  };

  const logout = () => {
    localStorage.removeItem("crm_token");
    localStorage.removeItem("crm_user");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
