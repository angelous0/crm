/**
 * Helper para mostrar el tipo de documento de un partner peruano.
 *
 * Estrategia:
 *   1) Si el backend devolvió `catalog_06_name` o `tipo_doc` (sincronizado
 *      desde Odoo res.partner.catalog_06_id), usar ese valor canónico.
 *   2) Si no, inferir por longitud/formato del VAT (fallback para datos viejos):
 *        - DNI:       8 dígitos (persona natural)
 *        - RUC:       11 dígitos (negocio/empresa)
 *        - CE:        9 dígitos (carnet de extranjería)
 *        - Pasaporte: alfanumérico variable (suele tener letras)
 */

// Mapa de nombres canónicos de Odoo SUNAT catalog_06 → label corto
const ODOO_LABEL_MAP = {
  // SUNAT estándar
  "RUC":                        "RUC",
  "DNI":                        "DNI",
  "CARNET DE EXTRANJERIA":      "CE",
  "CARNET DE EXTRANJERÍA":      "CE",
  "PASAPORTE":                  "PAS",
  "CEDULA DIPLOMATICA":         "CDI",
  "CÉDULA DIPLOMÁTICA":         "CDI",
  "DOC.TRIB.NO.DOM.SIN.RUC":    "OTRO",
  "DOC TRIB NO DOM SIN RUC":    "OTRO",
  "OTROS":                      "OTRO",
};

function normalizeOdooLabel(rawLabel) {
  if (!rawLabel) return null;
  const upper = String(rawLabel).toUpperCase().trim();
  if (ODOO_LABEL_MAP[upper]) return ODOO_LABEL_MAP[upper];
  // Match parcial por keyword
  if (upper.includes("DNI")) return "DNI";
  if (upper.includes("RUC")) return "RUC";
  if (upper.includes("EXTRANJER")) return "CE";
  if (upper.includes("PASAPORTE")) return "PAS";
  if (upper.includes("DIPLOM")) return "CDI";
  return upper.substring(0, 6);
}

export function inferirTipoDoc(vat) {
  if (!vat) return null;
  const s = String(vat).trim().replace(/[\s\-]/g, "");
  if (!s) return null;
  if (/[a-zA-Z]/.test(s)) return s.length >= 8 ? "PAS" : "OTRO";
  if (s.length === 8)  return "DNI";
  if (s.length === 9)  return "CE";
  if (s.length === 11) return "RUC";
  if (s.length >= 7 && s.length <= 12) return "DOC";
  return "OTRO";
}

/**
 * Devuelve la etiqueta corta: "RUC", "DNI", "CE", "PAS", "DOC".
 *
 * Acepta:
 *   - String (solo vat) → infiere por longitud
 *   - Object {vat, catalog_06_name?, tipo_doc?} → usa el campo sincronizado si existe
 */
export function labelTipoDoc(input) {
  if (!input) return "";
  if (typeof input === "string") return inferirTipoDoc(input) || "";
  // Objeto con campos del backend
  const odooLabel = input.catalog_06_name || input.tipo_doc;
  const normalized = normalizeOdooLabel(odooLabel);
  if (normalized) return normalized;
  return inferirTipoDoc(input.vat) || "";
}

/**
 * Devuelve "RUC 20512345678" / "DNI 09916600" listo para mostrar.
 *
 * Acepta:
 *   - String (solo vat) → infiere
 *   - Object {vat, catalog_06_name?} → usa el sincronizado si existe
 */
export function formatDoc(input) {
  if (!input) return null;
  const vat = typeof input === "string" ? input : input.vat;
  if (!vat) return null;
  const label = labelTipoDoc(input);
  return label ? `${label} ${vat}` : String(vat);
}
