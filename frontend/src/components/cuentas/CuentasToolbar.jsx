import React, { useState, useEffect, useRef } from "react";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X, EyeOff, Power } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

const ESTADOS = ["ACTIVO", "NUEVO", "SEGUIMIENTO", "DORMIDO", "NO_VOLVER"];
const CLASIFICACIONES = ["A", "B", "C"];

export function CuentasToolbar({ filters, onFiltersChange, totalRows, onInactivateNoSales }) {
  const [ciudades, setCiudades] = useState([]);
  const [asignados, setAsignados] = useState([]);
  const [tiendas, setTiendas] = useState([]);
  const debounceRef = useRef(null);

  useEffect(() => {
    api.get("/cuentas/list/filter-options").then(r => {
      setCiudades(r.data.ciudades || []);
      setAsignados(r.data.asignados || []);
      setTiendas(r.data.tiendas || []);
    }).catch(() => {});
  }, []);

  const handleSearch = (val) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onFiltersChange({ ...filters, q: val, page: 1 });
    }, 300);
  };

  const activeFilters = [filters.estado, filters.clasificacion, filters.ciudad, filters.asignado, filters.tienda].filter(Boolean).length;

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-white shrink-0" data-testid="cuentas-toolbar">
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
        <Input
          data-testid="cuentas-search"
          placeholder="Buscar cuentas..."
          className="pl-8 h-8 text-xs bg-slate-50 border-slate-200"
          defaultValue={filters.q}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      <Select value={filters.estado || "ALL"} onValueChange={v => onFiltersChange({ ...filters, estado: v === "ALL" ? "" : v, page: 1 })}>
        <SelectTrigger className="w-[130px] h-8 text-xs" data-testid="filter-estado">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Todos</SelectItem>
          {ESTADOS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={filters.clasificacion || "ALL"} onValueChange={v => onFiltersChange({ ...filters, clasificacion: v === "ALL" ? "" : v, page: 1 })}>
        <SelectTrigger className="w-[100px] h-8 text-xs" data-testid="filter-clasificacion">
          <SelectValue placeholder="Clasif." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Todas</SelectItem>
          {CLASIFICACIONES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>

      {ciudades.length > 0 && (
        <Select value={filters.ciudad || "ALL"} onValueChange={v => onFiltersChange({ ...filters, ciudad: v === "ALL" ? "" : v, page: 1 })}>
          <SelectTrigger className="w-[130px] h-8 text-xs hidden lg:flex" data-testid="filter-ciudad">
            <SelectValue placeholder="Ciudad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas</SelectItem>
            {ciudades.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {tiendas.length > 0 && (
        <Select value={filters.tienda || "ALL"} onValueChange={v => onFiltersChange({ ...filters, tienda: v === "ALL" ? "" : v, page: 1 })}>
          <SelectTrigger className="w-[130px] h-8 text-xs hidden lg:flex" data-testid="filter-tienda">
            <SelectValue placeholder="Tienda" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas</SelectItem>
            {tiendas.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {asignados.length > 0 && (
        <Select value={filters.asignado || "ALL"} onValueChange={v => onFiltersChange({ ...filters, asignado: v === "ALL" ? "" : v, page: 1 })}>
          <SelectTrigger className="w-[130px] h-8 text-xs hidden lg:flex" data-testid="filter-asignado">
            <SelectValue placeholder="Vendedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos</SelectItem>
            {asignados.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {activeFilters > 0 && (
        <button
          onClick={() => onFiltersChange({ q: filters.q, estado: "", clasificacion: "", ciudad: "", asignado: "", tienda: "", sort: filters.sort, dir: filters.dir, page: 1, include_inactive: filters.include_inactive })}
          className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-700 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 transition-colors"
          data-testid="clear-filters"
        >
          <X size={10} />Limpiar
        </button>
      )}

      <div className="flex items-center gap-1.5 border border-slate-200 rounded-md px-2 py-1 ml-1" data-testid="toggle-inactive-wrap">
        <Switch
          checked={!!filters.include_inactive}
          onCheckedChange={v => onFiltersChange({ ...filters, include_inactive: v, page: 1 })}
          className="scale-[0.7]"
          data-testid="toggle-inactive"
        />
        <span className="text-[10px] text-slate-500 whitespace-nowrap flex items-center gap-0.5"><EyeOff size={10} />Inactivos</span>
      </div>

      <div className="ml-auto shrink-0 flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 px-2 text-[10px] text-red-600 border-red-200 hover:bg-red-50 hidden lg:flex"
                onClick={onInactivateNoSales} data-testid="inactivate-no-sales-btn">
                <Power size={11} className="mr-1" />Sin ventas
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Inactivar cuentas/contactos sin ventas</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Badge variant="secondary" className="text-[10px] font-mono">{totalRows.toLocaleString("es-PE")} cuentas</Badge>
      </div>
    </div>
  );
}
