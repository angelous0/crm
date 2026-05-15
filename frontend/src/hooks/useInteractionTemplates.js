import { useEffect, useState } from "react";
import api from "@/lib/api";

// Cache module-scoped: la lista de templates rara vez cambia, así que la guardamos
// una sola vez por sesión. Si en el futuro hay edición desde admin, agregar invalidación.
let cache = null;
let pending = null;

export function useInteractionTemplates() {
  const [templates, setTemplates] = useState(cache || []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) return;
    if (!pending) {
      pending = api.get("/interaction-templates")
        .then(r => {
          cache = Array.isArray(r.data) ? r.data : (r.data?.items || []);
          return cache;
        })
        .catch(() => {
          cache = [];
          return [];
        })
        .finally(() => { pending = null; });
    }
    pending.then((data) => {
      setTemplates(data);
      setLoading(false);
    });
  }, []);

  return { templates, loading };
}
