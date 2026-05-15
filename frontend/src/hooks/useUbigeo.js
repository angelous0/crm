/**
 * useUbigeo — carga la jerarquía depto→provincia→distrito del país dado.
 *
 * El ubigeo es data estática (rara vez cambia), así que:
 *   - Cachea por país en memoria del módulo (1 fetch por sesión)
 *   - Devuelve { ubigeo, loading, error }
 *
 * Estructura del ubigeo:
 *   {
 *     "Lima": { "Lima": ["Miraflores", ...], "Cañete": [...] },
 *     "Cusco": { "Cusco": ["Wanchaq", ...], ... }
 *   }
 */
import { useEffect, useState } from "react";
import api from "@/lib/api";

const _cache = new Map();   // pais → ubigeo
const _promises = new Map(); // pais → Promise (dedup en vuelo)

export function useUbigeo(pais = "PE") {
  const [data, setData] = useState(() => _cache.get(pais) || null);
  const [loading, setLoading] = useState(() => !_cache.has(pais));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (_cache.has(pais)) {
      setData(_cache.get(pais));
      setLoading(false);
      return;
    }
    setLoading(true);
    let p = _promises.get(pais);
    if (!p) {
      p = api.get(`/cuentas/ubigeo`, { params: { pais } })
        .then(r => r.data.ubigeo)
        .then(ub => { _cache.set(pais, ub); _promises.delete(pais); return ub; })
        .catch(e => { _promises.delete(pais); throw e; });
      _promises.set(pais, p);
    }
    let cancelled = false;
    p.then(ub => { if (!cancelled) { setData(ub); setLoading(false); } })
     .catch(e => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [pais]);

  return { ubigeo: data, loading, error };
}
