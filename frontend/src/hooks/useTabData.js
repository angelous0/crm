import { useEffect, useState, useCallback, useRef } from "react";

/**
 * Lazy-loading + cache simple para data de tabs.
 *
 * - No hace fetch hasta que `enabled=true` (cuando el tab se vuelve activo).
 * - Una vez cargado, queda cacheado en estado local (no re-fetch al cambiar de tab).
 * - `staleKey` (cualquier primitivo): si cambia, fuerza recarga. Útil para
 *   invalidar después de mutaciones (modales que crean/editan/borran).
 *
 * @param fetchFn  () => Promise<data>
 * @param enabled  bool — si false, espera (data se mantiene en estado anterior)
 * @param staleKey primitivo — al cambiar, refetch en el siguiente render con enabled
 */
export function useTabData(fetchFn, { enabled = true, staleKey = 0 } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const lastKey = useRef(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await fetchFn();
      setData(d);
    } catch (e) {
      setError(e.response?.data?.detail || e.message || "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [fetchFn]);

  useEffect(() => {
    if (!enabled) return;
    // Solo carga si nunca cargó O el staleKey cambió
    const cacheKey = `${enabled}-${staleKey}`;
    if (lastKey.current === cacheKey && data !== null) return;
    lastKey.current = cacheKey;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, staleKey]);

  return { data, loading, error, reload };
}
