import { useEffect, useState } from "react";
import api from "@/lib/api";

/** Hook: busca partners "unlinked" (sin vinculación a ninguna cuenta CRM)
 *  con debounce de 300ms sobre la query. Solo dispara cuando enabled=true.
 *
 *  Si `includeLinked=true` también trae partners ya vinculados a otra cuenta
 *  (con `linked_cuenta_id` y `linked_cuenta_name` en cada item).
 *  `excludeCuentaId` excluye partners ya vinculados a esa misma cuenta
 *  específica (no tiene sentido mostrarlos como opción para vincular ahí).
 */
export function usePartnersUnlinked(
  query,
  { enabled = true, limit = 20, includeLinked = false, excludeCuentaId = null } = {}
) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setItems([]); setTotal(0); setLoading(false); setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await api.get("/partners/unlinked", {
          params: {
            search: query || undefined,
            limit,
            include_linked: includeLinked || undefined,
            exclude_cuenta_id: excludeCuentaId || undefined,
          },
          signal: ctrl.signal,
        });
        setItems(r.data?.items || []);
        setTotal(r.data?.total ?? 0);
      } catch (e) {
        if (e.name !== "CanceledError") {
          setError(e.response?.data?.detail || e.message);
        }
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query, enabled, limit, includeLinked, excludeCuentaId]);

  return { items, total, loading, error };
}
