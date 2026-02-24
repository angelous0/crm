import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { CuentasToolbar } from "@/components/cuentas/CuentasToolbar";
import { CuentasDirectoryGrid } from "@/components/cuentas/CuentasDirectoryGrid";
import { CuentaDetailPanel } from "@/components/cuentas/CuentaDetailPanel";
import { InactivateNoSalesModal } from "@/components/cuentas/InactivateNoSalesModal";
import { Loader2, PanelLeftClose, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CuentasAirtable() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("selected") ? parseInt(searchParams.get("selected")) : null;
  const activeTab = searchParams.get("tab") || "resumen";

  const [filters, setFilters] = useState({
    q: searchParams.get("q") || "",
    estado: searchParams.get("estado") || "",
    clasificacion: searchParams.get("clasificacion") || "",
    ciudad: searchParams.get("ciudad") || "",
    asignado: searchParams.get("asignado") || "",
    sort: searchParams.get("sort") || "name",
    dir: searchParams.get("dir") || "asc",
    page: parseInt(searchParams.get("page")) || 1,
    include_inactive: searchParams.get("include_inactive") === "true",
  });

  const [rows, setRows] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [showInactivateModal, setShowInactivateModal] = useState(false);
  const limit = 50;
  const fetchRef = useRef(0);

  const syncUrl = useCallback((newFilters, newSelected, newTab) => {
    const p = {};
    if (newFilters.q) p.q = newFilters.q;
    if (newFilters.estado) p.estado = newFilters.estado;
    if (newFilters.clasificacion) p.clasificacion = newFilters.clasificacion;
    if (newFilters.ciudad) p.ciudad = newFilters.ciudad;
    if (newFilters.asignado) p.asignado = newFilters.asignado;
    if (newFilters.sort !== "name") p.sort = newFilters.sort;
    if (newFilters.dir !== "asc") p.dir = newFilters.dir;
    if (newFilters.page > 1) p.page = String(newFilters.page);
    if (newFilters.include_inactive) p.include_inactive = "true";
    if (newSelected) p.selected = String(newSelected);
    if (newTab && newTab !== "resumen") p.tab = newTab;
    setSearchParams(p, { replace: true });
  }, [setSearchParams]);

  const fetchData = useCallback(async (f) => {
    const id = ++fetchRef.current;
    setLoading(true);
    try {
      const r = await api.get("/cuentas/list", {
        params: {
          q: f.q, estado: f.estado, clasificacion: f.clasificacion,
          ciudad: f.ciudad, asignado: f.asignado,
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
    syncUrl(filters, selectedId, activeTab);
  }, [filters]); // eslint-disable-line

  const handleFiltersChange = (newFilters) => {
    setFilters(newFilters);
  };

  const handleSelectRow = (id) => {
    syncUrl(filters, id, "resumen");
  };

  const handleTabChange = (tab) => {
    syncUrl(filters, selectedId, tab);
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
      {/* Top Toolbar */}
      <CuentasToolbar filters={filters} onFiltersChange={handleFiltersChange} totalRows={totalRows}
        onInactivateNoSales={() => setShowInactivateModal(true)} />

      {/* Split View */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Directory (Desktop) */}
        <div
          className={`hidden lg:flex flex-col border-r border-slate-200 bg-white shrink-0 transition-all duration-200 ${panelCollapsed ? "w-0 overflow-hidden" : "w-[740px]"}`}
          data-testid="left-pane"
        >
          <CuentasDirectoryGrid
            rows={rows}
            loading={loading}
            selectedId={selectedId}
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

        {/* Collapse toggle */}
        <div className="hidden lg:flex items-start pt-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-slate-400 hover:text-slate-600"
            onClick={() => setPanelCollapsed(!panelCollapsed)}
            data-testid="toggle-panel"
          >
            {panelCollapsed ? <PanelLeft size={14} /> : <PanelLeftClose size={14} />}
          </Button>
        </div>

        {/* Mobile: Show directory as list when no selection */}
        <div className={`lg:hidden flex-1 ${selectedId ? "hidden" : "flex flex-col"}`}>
          <CuentasDirectoryGrid
            rows={rows}
            loading={loading}
            selectedId={selectedId}
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

        {/* Right: Detail Panel */}
        <div className={`flex-1 flex flex-col min-w-0 ${!selectedId ? "hidden lg:flex" : "flex"}`}>
          {selectedId && (
            <div className="lg:hidden shrink-0 border-b border-slate-200 bg-white px-3 py-1.5">
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => syncUrl(filters, null, null)} data-testid="back-to-list">
                Volver a lista
              </Button>
            </div>
          )}
          <CuentaDetailPanel
            cuentaId={selectedId}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onCuentaChanged={() => fetchData(filters)}
          />
        </div>
      </div>

      <InactivateNoSalesModal
        open={showInactivateModal}
        onClose={() => setShowInactivateModal(false)}
        onDone={() => fetchData(filters)}
      />
    </div>
  );
}
