"""Normalización canónica de departamentos PE/BO.

Espejo del helper JS `crm/frontend/src/components/cuentas/perfil-options.js`.
Mantener ambos en sync — si agregas un alias acá, agrégalo también en JS.

Uso:
    from utils.depto_normalize import normalize_depto, is_canonical_depto

    normalize_depto("UCAYALI", "PE")  # → "Ucayali"
    normalize_depto("Cuzco", "PE")    # → "" (typo, no matchea)
    is_canonical_depto("UCAYALI", "PE")  # → True
"""
import re
import unicodedata

DEPARTAMENTOS_PE = [
    "Amazonas", "Áncash", "Apurímac", "Arequipa", "Ayacucho", "Cajamarca",
    "Callao", "Cusco", "Huancavelica", "Huánuco", "Ica", "Junín",
    "La Libertad", "Lambayeque", "Lima", "Loreto", "Madre de Dios",
    "Moquegua", "Pasco", "Piura", "Puno", "San Martín", "Tacna", "Tumbes",
    "Ucayali",
]

DEPARTAMENTOS_BO = [
    "Beni", "Chuquisaca", "Cochabamba", "La Paz", "Oruro", "Pando",
    "Potosí", "Santa Cruz", "Tarija",
]

# Aliases comunes que aparecen en odoo.res_partner.state_name
_ALIASES = {
    # Perú
    "lima":           "Lima",
    "limalimacallao": "Lima",
    "callao":         "Callao",
    "ancash":         "Áncash",
    "apurimac":       "Apurímac",
    "huanuco":        "Huánuco",
    "junin":          "Junín",
    "sanmartin":      "San Martín",
    "madrededios":    "Madre de Dios",
    "laliberatad":    "La Libertad",
    "laliberta":      "La Libertad",
    # Bolivia
    "potosi":         "Potosí",
    "lapaz":          "La Paz",
    "santacruz":      "Santa Cruz",
}


def _normalize_key(s: str) -> str:
    """Reduce a alfa-lowercase sin tildes — match insensible a caso/tildes."""
    if not s:
        return ""
    s2 = unicodedata.normalize("NFD", str(s).lower())
    s2 = "".join(c for c in s2 if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z]", "", s2).strip()


_LOOKUP_PE = {_normalize_key(d): d for d in DEPARTAMENTOS_PE}
_LOOKUP_BO = {_normalize_key(d): d for d in DEPARTAMENTOS_BO}


def normalize_depto(raw, pais: str = "PE") -> str:
    """Devuelve el nombre canónico del departamento o "" si no matchea."""
    if not raw:
        return ""
    key = _normalize_key(raw)
    if not key:
        return ""
    lookup = _LOOKUP_BO if pais == "BO" else _LOOKUP_PE
    if key in lookup:
        return lookup[key]
    if key in _ALIASES:
        canon = _ALIASES[key]
        if _normalize_key(canon) in lookup:
            return canon
    return ""


def is_canonical_depto(raw, pais: str = "PE") -> bool:
    """True si el valor crudo matchea con un departamento canónico."""
    return bool(raw) and bool(normalize_depto(raw, pais))


# ─── Ciudades / distritos confundidos con departamentos ─────────────────────
#
# Casos típicos: alguien escribe "TRUJILLO" en el campo `state_name` de Odoo
# cuando en realidad Trujillo es la capital de La Libertad. El dato no es
# basura — es un distrito/ciudad mal categorizado.
#
# Este mapa sugiere cómo dividirlo: el valor crudo va al campo `distrito`
# y el departamento real al campo `departamento`.
#
# Mantener en sync con el JS si se decide replicarlo allá.
CIUDAD_A_DEPTO = {
    # Perú — ciudad / capital → departamento
    "trujillo":               "La Libertad",
    "chiclayo":               "Lambayeque",
    "chachapoyas":            "Amazonas",
    "huancayo":               "Junín",
    "iquitos":                "Loreto",
    "tarapoto":               "San Martín",
    "moyobamba":              "San Martín",
    "yurimaguas":             "Loreto",
    "pucallpa":               "Ucayali",
    "puertomaldonado":        "Madre de Dios",
    "chimbote":               "Áncash",
    "huaraz":                 "Áncash",
    "cerrodepasco":           "Pasco",
    "abancay":                "Apurímac",
    "andahuaylas":            "Apurímac",
    "desaguadero":            "Puno",
    "juliaca":                "Puno",
    "ilave":                  "Puno",
    "barranca":               "Lima",
    "huacho":                 "Lima",
    "canete":                 "Lima",
    "sanjuandelurigancho":    "Lima",
    "sanmartindeporres":      "Lima",
    "miraflores":             "Lima",
    "surco":                  "Lima",
    "lavictoria":             "Lima",
    "ate":                    "Lima",
    "comas":                  "Lima",
    "villaelsalvador":        "Lima",
    "villamariadeltriunfo":   "Lima",
    "puentepiedra":           "Lima",
    "sullana":                "Piura",
    "talara":                 "Piura",
    "paita":                  "Piura",
    "jaen":                   "Cajamarca",
    "chota":                  "Cajamarca",
    "huanta":                 "Ayacucho",
    "satipo":                 "Junín",
    "tarma":                  "Junín",
    "lamerced":               "Junín",
    "oxapampa":               "Pasco",
    "moquegua":               "Moquegua",  # ya canónico pero por defensa
    # Bolivia
    "sucre":                  "Chuquisaca",
    "elalto":                 "La Paz",
    "tarija":                 "Tarija",
}


# Países conocidos (cuando alguien pone el país en el campo state_name)
PAIS_DETECT = {
    "peru":         "PE",
    "republicadelperupero": "PE",  # con tilde quitada
    "bolivia":      "BO",
    "estadoplurinacionaldelbolivia": "BO",
}

# Países fuera del scope CRM (PE/BO) — los detectamos para flag claro
PAISES_FUERA_SCOPE = {
    # USA y estados/ciudades comunes
    "estadosunidos", "eeuu", "usa", "us",
    "idaho", "florida", "california", "texas", "newyork", "newjersey",
    "newmexico", "arizona", "nevada", "oregon", "washington", "virginia",
    "georgia", "ohio", "illinois", "maryland", "massachusetts",
    # Otros países hispanohablantes / vecinos
    "chile", "argentina", "ecuador", "colombia", "venezuela", "brasil",
    "brazil", "uruguay", "paraguay", "mexico", "espana", "españa",
    # Países comunes en migración
    "canada", "italia", "francia", "alemania", "reinounido", "uk",
}


def suggest_split(raw, pais: str = "PE") -> dict:
    """Dado un valor crudo no-canónico, sugiere distrito + departamento + país.

    Returns:
        { "departamento_sugerido": str|None,
          "distrito_sugerido":     str|None,
          "pais_sugerido":         str|None,  # "PE", "BO" o None
          "confianza":             "alta"|"media"|"ninguna",
          "razon":                 str }
    """
    key = _normalize_key(raw)

    # Si es canónico, no hay nada que sugerir
    if normalize_depto(raw, pais):
        return {
            "departamento_sugerido": normalize_depto(raw, pais),
            "distrito_sugerido": None,
            "pais_sugerido": None,
            "confianza": "alta",
            "razon": "valor ya canónico",
        }

    # Ciudad/distrito conocido → mover a distrito + asignar depto real
    if key in CIUDAD_A_DEPTO:
        depto = CIUDAD_A_DEPTO[key]
        if pais == "PE" and depto in DEPARTAMENTOS_PE:
            return {
                "departamento_sugerido": depto,
                "distrito_sugerido": _titleize(raw),
                "pais_sugerido": None,
                "confianza": "alta",
                "razon": f"'{raw}' es ciudad/distrito de {depto}",
            }

    # Si el valor matchea un depto de OTRO país → sugerir cambio de país
    otro_pais = "BO" if pais == "PE" else "PE"
    if normalize_depto(raw, otro_pais):
        return {
            "departamento_sugerido": normalize_depto(raw, otro_pais),
            "distrito_sugerido": None,
            "pais_sugerido": otro_pais,
            "confianza": "alta",
            "razon": f"'{raw}' es departamento de {otro_pais} — cambiar país",
        }

    # Es el nombre de un país (PE/BO) — cambiar país, limpiar depto
    if key in PAIS_DETECT:
        pais_detectado = PAIS_DETECT[key]
        if pais_detectado != pais:
            return {
                "departamento_sugerido": None,
                "distrito_sugerido": None,
                "pais_sugerido": pais_detectado,
                "confianza": "media",
                "razon": (
                    f"'{raw}' es nombre de país — cambiar a {pais_detectado} y "
                    "completar departamento manualmente"
                ),
            }
        # Mismo país: dato redundante, limpiar
        return {
            "departamento_sugerido": None,
            "distrito_sugerido": None,
            "pais_sugerido": None,
            "confianza": "media",
            "razon": f"'{raw}' es el nombre del país (redundante) — limpiar campo",
        }

    # País fuera del scope CRM (USA, Chile, etc.)
    if key in PAISES_FUERA_SCOPE:
        return {
            "departamento_sugerido": None,
            "distrito_sugerido": None,
            "pais_sugerido": None,
            "confianza": "ninguna",
            "razon": (
                f"'{raw}' está fuera del scope PE/BO — revisar manualmente "
                "(¿es realmente cliente local o internacional?)"
            ),
        }

    return {
        "departamento_sugerido": None,
        "distrito_sugerido": _titleize(raw),
        "pais_sugerido": None,
        "confianza": "ninguna",
        "razon": "no matchea ningún departamento ni ciudad conocida",
    }


def _titleize(s: str) -> str:
    """'SAN JUAN DE LURIGANCHO' → 'San Juan de Lurigancho'."""
    if not s:
        return ""
    minusculas = {"de", "del", "la", "las", "los", "y", "el"}
    palabras = str(s).strip().lower().split()
    out = []
    for i, w in enumerate(palabras):
        if i > 0 and w in minusculas:
            out.append(w)
        else:
            out.append(w.capitalize())
    return " ".join(out)


def es_pais_o_ciudad(raw, pais: str = "PE") -> bool:
    """True si el valor crudo es realmente un país o ciudad/distrito —
    es decir, tiene una sugerencia con confianza alta o media (no es basura).
    """
    sug = suggest_split(raw, pais)
    return sug["confianza"] in ("alta", "media") and not normalize_depto(raw, pais)
