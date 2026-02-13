import React, { createContext, useContext, useState, useEffect } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("crm_token");
    const savedUser = localStorage.getItem("crm_user");
    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
      // Verify token
      api.get("/auth/me").then(res => {
        setUser(res.data);
        localStorage.setItem("crm_user", JSON.stringify(res.data));
      }).catch(() => {
        localStorage.removeItem("crm_token");
        localStorage.removeItem("crm_user");
        setUser(null);
      }).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const res = await api.post("/auth/login", { email, password });
    localStorage.setItem("crm_token", res.data.token);
    localStorage.setItem("crm_user", JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data;
  };

  const register = async (email, password, nombre) => {
    const res = await api.post("/auth/register", { email, password, nombre });
    localStorage.setItem("crm_token", res.data.token);
    localStorage.setItem("crm_user", JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data;
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
