/**
 * Listas de opciones para el perfil de cuenta (Sprint CRM-D4 v2).
 * Usadas por InfoTab.jsx en modo edición.
 */

// 24 departamentos del Perú + Lima Metropolitana / Callao por separado
export const DEPARTAMENTOS_PE = [
  "Amazonas",
  "Áncash",
  "Apurímac",
  "Arequipa",
  "Ayacucho",
  "Cajamarca",
  "Callao",
  "Cusco",
  "Huancavelica",
  "Huánuco",
  "Ica",
  "Junín",
  "La Libertad",
  "Lambayeque",
  "Lima",
  "Loreto",
  "Madre de Dios",
  "Moquegua",
  "Pasco",
  "Piura",
  "Puno",
  "San Martín",
  "Tacna",
  "Tumbes",
  "Ucayali",
];

// 9 departamentos de Bolivia
export const DEPARTAMENTOS_BO = [
  "Beni",
  "Chuquisaca",
  "Cochabamba",
  "La Paz",
  "Oruro",
  "Pando",
  "Potosí",
  "Santa Cruz",
  "Tarija",
];

export const PAISES = [
  { code: "PE", label: "Perú", flag: "🇵🇪" },
  { code: "BO", label: "Bolivia", flag: "🇧🇴" },
];

export const TIPOS_NEGOCIO = [
  "Boutique",
  "Mayorista",
  "Distribuidor",
  "Galería",
  "Tienda multimarca",
  "Stand",
  "E-commerce",
  "Otro",
];

export const CANALES = [
  "WhatsApp",
  "Llamada",
  "Visita",
  "Email",
  "Boutique",
  "Showroom",
];

// ─── Normalización inteligente de departamentos ────────────────
// Odoo guarda los departamentos en distintas variantes ("CUSCO",
// "cusco", "Cusco", "SAN MARTIN", "Madre De Dios", etc.). Esta
// función mapea cualquier variante a la canónica de la lista,
// quitando tildes y case-insensitive. Si no encuentra match,
// devuelve "" (que el select muestra como "Sin especificar").
function _normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita tildes
    .replace(/[^a-z]/g, "")          // solo letras
    .trim();
}

function _buildLookup(lista) {
  const map = new Map();
  for (const d of lista) {
    map.set(_normalize(d), d);
  }
  return map;
}

const _LOOKUP_PE = _buildLookup(DEPARTAMENTOS_PE);
const _LOOKUP_BO = _buildLookup(DEPARTAMENTOS_BO);

// Aliases comunes / abreviaturas que aparecen en res_partner.state_name
const _ALIASES = {
  // Perú
  "lima":           "Lima",
  "limalimacallao": "Lima",     // a veces viene compuesto
  "callao":         "Callao",
  "ancash":         "Áncash",
  "apurimac":       "Apurímac",
  "huanuco":        "Huánuco",
  "junin":          "Junín",
  "sanmartin":      "San Martín",
  "madrededios":    "Madre de Dios",
  "laliberatad":    "La Libertad",
  "laliberta":      "La Libertad",
  // Bolivia
  "potosi":         "Potosí",
  "lapaz":          "La Paz",
  "santacruz":      "Santa Cruz",
};

/**
 * Normaliza el nombre de un departamento al formato canónico de la lista
 * para el país dado. Acepta cualquier variación de caso/tildes/espacios.
 * @param {string} raw  - valor crudo (ej: "CUSCO" de Odoo state_name)
 * @param {string} pais - "PE" o "BO" (default "PE")
 * @returns {string}    - nombre canónico ("Cusco") o "" si no matchea
 */
export function normalizeDepartamento(raw, pais = "PE") {
  if (!raw) return "";
  const key = _normalize(raw);
  if (!key) return "";
  const lookup = pais === "BO" ? _LOOKUP_BO : _LOOKUP_PE;
  if (lookup.has(key)) return lookup.get(key);
  if (_ALIASES[key]) {
    const canonico = _ALIASES[key];
    // Verificar que el alias existe en la lista del país actual
    if (lookup.has(_normalize(canonico))) return canonico;
  }
  return "";
}

/**
 * ¿El valor crudo matchea con un departamento canónico?
 * (true para deptos válidos, false para typos/basura/null)
 */
export function isCanonicalDepartamento(raw, pais = "PE") {
  return Boolean(raw) && Boolean(normalizeDepartamento(raw, pais));
}

/**
 * Normaliza nombre de provincia o distrito dentro de un set conocido.
 * Acepta cualquier variación de caso/tildes; devuelve el nombre canónico
 * del set, o "" si no matchea.
 *
 * @param {string} raw  - valor crudo (ej: "MIRAFLORES")
 * @param {string[]} options  - lista canónica (ej: ["Miraflores", "Surco", ...])
 */
export function normalizeFromList(raw, options) {
  if (!raw || !options || options.length === 0) return "";
  const key = _normalize(raw);
  if (!key) return "";
  for (const opt of options) {
    if (_normalize(opt) === key) return opt;
  }
  return "";
}
