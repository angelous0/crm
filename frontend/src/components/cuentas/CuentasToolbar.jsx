import React, { useState, useEffect, useRef } from "react";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Search, X, EyeOff, Power, MapPin, Check, ChevronsUpDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

// Fallback si el backend no devuelve datos. Lo real viene del endpoint
// /cuentas/list/filter-options (valores en uso en la DB).
const ESTADOS_FALLBACK = ["ACTIVO", "NUEVO", "SEGUIMIENTO", "DORMIDO", "NO_VOLVER"];
const CLASIFICACIONES_FALLBACK = ["A", "B", "C"];

// Estados simplificados (5): basados solo en recencia de última compra.
// El tier (oro/plata/bronce) es independiente del estado.
const ESTADOS_AUTO = [
  { id: "nuevo",    label: "Nuevo",    color: "#1E54B0" },  // 1-3 compras + creado ≤60d
  { id: "activo",   label: "Activo",   color: "#15803D" },  // compra ≤60d
  { id: "alerta",   label: "Alerta",   color: "#C2410C" },  // 61-120d
  { id: "olvidado", label: "Olvidado", color: "#92400E" },  // 121-180d
  { id: "perdido",  label: "Perdido",  color: "#991B1B" },  // >180d
];

// Clasificación por percentil dentro del departamento
//   estrella → top 10%
//   alto     → 10-25%
//   medio    → 25-40%
//   bajo     → 60% restante
const TIERS = [
  { id: "estrella", label: "Estrella", color: "#8B6A1F" },  // dorado
  { id: "alto",     label: "Alto",     color: "#1E54B0" },  // azul
  { id: "medio",    label: "Medio",    color: "#4A4136" },  // gris cálido
  { id: "bajo",     label: "Bajo",     color: "#8A2F18" },  // rojo tierra
];

// CRM-D9: motivos de tarea pendiente. Single-select (a diferencia de
// Estado/Tier que son multi). Backend espera el valor crudo (COBRAR,
// POST_VENTA, etc.); el UI lo envía en mayúsculas.
const MOTIVOS_FILTRO = [
  { id: "COBRAR",           label: "💵 Cobrar",      color: "#B45309" },  // ámbar fuerte (más urgente)
  { id: "RECUPERAR",        label: "🚨 Recuperar",   color: "#991B1B" },  // rojo
  { id: "POST_VENTA",       label: "🛒 Post-venta",  color: "#1E54B0" },  // azul
  { id: "VENDER",           label: "💰 Vender",      color: "#15803D" },  // verde
  { id: "SEGUIMIENTO",      label: "🔄 Seguimiento", color: "#475569" },  // slate
  { id: "DEVOLVER_LLAMADA", label: "📞 Devolver",    color: "#5B21B6" },  // indigo
];

function toggleCsv(current, value) {
  const set = new Set(String(current || "").split(",").filter(Boolean));
  if (set.has(value)) set.delete(value); else set.add(value);
  return [...set].join(",");
}

function ChipMulti({ label, value, options, onChange, dataTestid }) {
  const active = String(value || "").split(",").filter(Boolean);
  return (
    <div className="flex items-center gap-1 flex-wrap" data-testid={dataTestid}>
      <span className="text-[10px] uppercase tracking-wider text-slate-500 font-mono mr-1">{label}:</span>
      {options.map((o) => {
        const on = active.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(toggleCsv(value, o.id))}
            data-testid={`chip-${dataTestid}-${o.id}`}
            className="px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors"
            style={
              on
                ? { background: o.color, color: "#fff", borderColor: o.color }
                : { background: "transparent", color: "#475569", borderColor: "#E5E7EB" }
            }
          >
            {o.label}
          </button>
        );
      })}
      {active.length > 0 && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-[10px] text-slate-400 hover:text-slate-600 ml-1"
          data-testid={`chip-${dataTestid}-clear`}
        >
          ×
        </button>
      )}
    </div>
  );
}

// CRM-D9: variante single-select. Click en el chip activo lo deselecciona
// (toggle); click en otro chip cambia la selección (no acumula).
function ChipSingle({ label, value, options, onChange, dataTestid }) {
  const current = value || "";
  return (
    <div className="flex items-center gap-1 flex-wrap" data-testid={dataTestid}>
      <span className="text-[10px] uppercase tracking-wider text-slate-500 font-mono mr-1">{label}:</span>
      {options.map((o) => {
        const on = current === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(on ? "" : o.id)}
            data-testid={`chip-${dataTestid}-${o.id.toLowerCase()}`}
            className="px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors"
            style={
              on
                ? { background: o.color, color: "#fff", borderColor: o.color }
                : { background: "transparent", color: "#475569", borderColor: "#E5E7EB" }
            }
          >
            {o.label}
          </button>
        );
      })}
      {current && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-[10px] text-slate-400 hover:text-slate-600 ml-1"
          data-testid={`chip-${dataTestid}-clear`}
        >
          ×
        </button>
      )}
    </div>
  );
}

export function CuentasToolbar({ filters, onFiltersChange, totalRows, onInactivateNoSales }) {
  const [ciudades, setCiudades] = useState([]);
  const [asignados, setAsignados] = useState([]);
  const [tiendas, setTiendas] = useState([]);
  const [estados, setEstados] = useState(ESTADOS_FALLBACK);
  const [clasificaciones, setClasificaciones] = useState(CLASIFICACIONES_FALLBACK);
  const debounceRef = useRef(null);

  useEffect(() => {
    api.get("/cuentas/list/filter-options").then(r => {
      setCiudades(r.data.ciudades || []);
      setAsignados(r.data.asignados || []);
      setTiendas(r.data.tiendas || []);
      // Estados/clasificaciones: si backend devuelve datos, usar; si no, fallback
      if (r.data.estados && r.data.estados.length > 0) {
        setEstados(r.data.estados);
      }
      if (r.data.clasificaciones && r.data.clasificaciones.length > 0) {
        setClasificaciones(r.data.clasificaciones);
      }
    }).catch(() => {});
  }, []);

  const handleSearch = (val) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onFiltersChange({ ...filters, q: val, page: 1 });
    }, 300);
  };

  // CRM-D9: motivo cuenta como filtro activo y se incluye en "Limpiar".
  // Estado/Tier viven en chips multi y NO entran en este contador (visualmente
  // se ven activos por sí solos), pero se preservan si se llama clear vía
  // el ícono "×" de cada ChipMulti.
  const activeFilters = [
    filters.estado, filters.clasificacion, filters.ciudad,
    filters.asignado, filters.tienda, filters.motivo,
  ].filter(Boolean).length;

  return (
   <div className="border-b border-slate-200 bg-white shrink-0" data-testid="cuentas-toolbar">
    <div className="flex items-center gap-2 px-3 py-2">
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

      {/* Filtro Estado removido: estado_comercial limpio (NULL para todas).
          Se va a re-introducir cuando definamos reglas automáticas de
          clasificación (ej: RESCATABLE auto-calculado por reglas). */}

      {/* Clasificación: removida — sin uso comercial real, solo agregaba ruido visual.
          Si se vuelve a necesitar tier A/B/C, reactivar este Select. */}

      {ciudades.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs justify-between hidden lg:flex min-w-[150px]"
              data-testid="filter-departamento"
            >
              <span className="inline-flex items-center gap-1.5 truncate">
                <MapPin className="h-3 w-3 text-slate-400" />
                {filters.ciudad ? filters.ciudad : "Departamento"}
              </span>
              <ChevronsUpDown className="h-3 w-3 text-slate-400 shrink-0 ml-1" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[220px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar departamento…" className="h-8 text-xs" />
              <CommandList>
                <CommandEmpty>Sin resultados</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    key="__all__"
                    value="todos"
                    onSelect={() => onFiltersChange({ ...filters, ciudad: "", page: 1 })}
                    className="text-xs"
                  >
                    <Check className={`mr-2 h-3 w-3 ${!filters.ciudad ? "opacity-100" : "opacity-0"}`} />
                    Todos los departamentos
                  </CommandItem>
                  {ciudades.map(c => (
                    <CommandItem
                      key={c}
                      value={c}
                      onSelect={() => onFiltersChange({ ...filters, ciudad: filters.ciudad === c ? "" : c, page: 1 })}
                      className="text-xs"
                    >
                      <Check className={`mr-2 h-3 w-3 ${filters.ciudad === c ? "opacity-100" : "opacity-0"}`} />
                      {c}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      {tiendas.length > 0 && (
        <Select value={filters.tienda || "ALL"} onValueChange={v => onFiltersChange({ ...filters, tienda: v === "ALL" ? "" : v, page: 1 })}>
          <SelectTrigger className="w-[130px] h-8 text-xs hidden lg:flex" data-testid="filter-tienda">
            <SelectValue placeholder="Tienda" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tienda: Todas</SelectItem>
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
            <SelectItem value="ALL">Vendedor: Todos</SelectItem>
            {asignados.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {activeFilters > 0 && (
        <button
          onClick={() => onFiltersChange({ q: filters.q, estado: "", clasificacion: "", ciudad: "", asignado: "", tienda: "", motivo: "", estado_auto: "", tier: "", sort: filters.sort, dir: filters.dir, page: 1, include_inactive: filters.include_inactive })}
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
    {/* Sprint D3: segunda fila con chips multi-toggle Estado y Tier */}
    <div className="px-3 py-1.5 flex items-center gap-4 flex-wrap border-t border-slate-100 bg-slate-50/40">
      <ChipMulti
        label="Estado"
        value={filters.estado_auto}
        options={ESTADOS_AUTO}
        onChange={(v) => onFiltersChange({ ...filters, estado_auto: v, page: 1 })}
        dataTestid="estado-auto"
      />
      <ChipMulti
        label="Tier"
        value={filters.tier}
        options={TIERS}
        onChange={(v) => onFiltersChange({ ...filters, tier: v, page: 1 })}
        dataTestid="tier"
      />
    </div>
    {/* CRM-D9: tercera fila con filtro single-select por Motivo de tarea */}
    <div className="px-3 py-1.5 flex items-center gap-4 flex-wrap border-t border-slate-100 bg-slate-50/40">
      <ChipSingle
        label="Motivo"
        value={filters.motivo}
        options={MOTIVOS_FILTRO}
        onChange={(v) => onFiltersChange({ ...filters, motivo: v, page: 1 })}
        dataTestid="motivo"
      />
    </div>
   </div>
  );
}
