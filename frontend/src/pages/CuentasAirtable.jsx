import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { CuentasToolbar } from "@/components/cuentas/CuentasToolbar";
import { CuentasDirectoryGrid } from "@/components/cuentas/CuentasDirectoryGrid";
import { InactivateNoSalesModal } from "@/components/cuentas/InactivateNoSalesModal";

/**
 * /cuentas — directorio de cuentas (full-width).
 *
 * El click en una fila navega a /cuentas/:partnerOdooId (página completa
 * con tab Resumen). El split-panel viejo (`?selected=`) fue removido en
 * Sprint CRM-D3 porque el flujo ya no lo usa: la ficha de cuenta es una
 * ruta dedicada, no un drawer dentro de la lista.
 */
export default function CuentasAirtable() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [filters, setFilters] = useState({
    q: searchParams.get("q") || "",
    estado: searchParams.get("estado") || "",
    clasificacion: searchParams.get("clasificacion") || "",
    ciudad: searchParams.get("ciudad") || "",
    asignado: searchParams.get("asignado") || "",
    tienda: searchParams.get("tienda") || "",
    estado_auto: searchParams.get("estado_auto") || "",  // D3
    tier: searchParams.get("tier") || "",                 // D3
    // CRM-D9: filtra cuentas con ≥1 tarea pendiente de este motivo.
    // Single-select; valor en mayúsculas (COBRAR/RECUPERAR/...).
    motivo: (searchParams.get("motivo") || "").toUpperCase(),
    // Default = "proxima_tarea" ASC: vencidas primero, después hoy, futuras,
    // y al final cuentas sin tarea pendiente. La vendedora abre /cuentas y ve
    // de inmediato qué atender. Se puede revertir al orden alfabético con ?sort=name.
    sort: searchParams.get("sort") || "proxima_tarea",
    dir: searchParams.get("dir") || "asc",
    page: parseInt(searchParams.get("page")) || 1,
    include_inactive: searchParams.get("include_inactive") === "true",
  });

  const [rows, setRows] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showInactivateModal, setShowInactivateModal] = useState(false);
  const limit = 50;
  const fetchRef = useRef(0);

  const syncUrl = useCallback((newFilters) => {
    const p = {};
    if (newFilters.q) p.q = newFilters.q;
    if (newFilters.estado) p.estado = newFilters.estado;
    if (newFilters.clasificacion) p.clasificacion = newFilters.clasificacion;
    if (newFilters.ciudad) p.ciudad = newFilters.ciudad;
    if (newFilters.asignado) p.asignado = newFilters.asignado;
    if (newFilters.tienda) p.tienda = newFilters.tienda;
    if (newFilters.estado_auto) p.estado_auto = newFilters.estado_auto;
    if (newFilters.tier) p.tier = newFilters.tier;
    if (newFilters.motivo) p.motivo = newFilters.motivo;  // CRM-D9
    if (newFilters.sort !== "proxima_tarea") p.sort = newFilters.sort;
    if (newFilters.dir !== "asc") p.dir = newFilters.dir;
    if (newFilters.page > 1) p.page = String(newFilters.page);
    if (newFilters.include_inactive) p.include_inactive = "true";
    setSearchParams(p, { replace: true });
  }, [setSearchParams]);

  const fetchData = useCallback(async (f) => {
    const id = ++fetchRef.current;
    setLoading(true);
    try {
      const r = await api.get("/cuentas/list", {
        params: {
          q: f.q, estado: f.estado, clasificacion: f.clasificacion,
          ciudad: f.ciudad, asignado: f.asignado, tienda: f.tienda,
          estado_auto: f.estado_auto, tier: f.tier,
          motivo: f.motivo || "",  // CRM-D9
          sort: f.sort, dir: f.dir,
          page: f.page, limit,
          include_inactive: f.include_inactive || false,
        }
      });
      if (id !== fetchRef.current) return;
      setRows(r.data.rows || []);
      setTotalRows(r.data.total_rows || 0);
    } catch {
      toast.error("Error cargando cuentas");
    } finally {
      if (id === fetchRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(filters);
    syncUrl(filters);
  }, [filters]); // eslint-disable-line

  const handleFiltersChange = (newFilters) => {
    setFilters(newFilters);
  };

  const handleSelectRow = (partnerOdooId) => {
    // Click navega a la ficha completa (Camino B desde D1)
    navigate(`/cuentas/${partnerOdooId}`);
  };

  const handleSort = (key) => {
    const newDir = key === filters.sort ? (filters.dir === "desc" ? "asc" : "desc") : "desc";
    setFilters(f => ({ ...f, sort: key, dir: newDir, page: 1 }));
  };

  const handlePageChange = (pg) => {
    setFilters(f => ({ ...f, page: pg }));
  };

  const totalPages = Math.ceil(totalRows / limit);

  return (
    <div className="flex flex-col" style={{ height: "100vh" }} data-testid="cuentas-airtable">
      {/* Toolbar superior con búsqueda + filtros + chips Estado/Tier */}
      <CuentasToolbar
        filters={filters}
        onFiltersChange={handleFiltersChange}
        totalRows={totalRows}
        onInactivateNoSales={() => setShowInactivateModal(true)}
      />

      {/* Lista a ancho total */}
      <div className="flex-1 min-h-0 bg-white">
        <CuentasDirectoryGrid
          rows={rows}
          loading={loading}
          selectedId={null}
          onSelectRow={handleSelectRow}
          sort={filters.sort}
          dir={filters.dir}
          onSort={handleSort}
          page={filters.page}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          onRefresh={() => fetchData(filters)}
        />
      </div>

      <InactivateNoSalesModal
        open={showInactivateModal}
        onClose={() => setShowInactivateModal(false)}
        onDone={() => fetchData(filters)}
      />
    </div>
  );
}
