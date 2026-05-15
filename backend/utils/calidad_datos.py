"""Detector de problemas de calidad de datos en cuentas del CRM.

Aplica reglas a una fila de cuenta y devuelve los problemas detectados,
con severidad y sugerencia de corrección.

Niveles de severidad:
    critico    → bloquea seguimiento (no se puede llamar / categorizar)
    sucio      → datos en el campo equivocado (corregir antes de usar)
    incompleto → falta info nice-to-have (no bloquea, pero conviene completar)

Cada regla retorna un dict:
    {
        "rule":      "sin_telefono",
        "severidad": "critico",
        "label":     "Sin teléfono válido",
        "detalle":   "Cliente sin tel ni móvil — no se puede llamar",
        "sugerencia": None,  # opcional: dict con fix automático
    }
"""
import re
from utils.depto_normalize import (
    normalize_depto, suggest_split, es_pais_o_ciudad, PAIS_DETECT,
    CIUDAD_A_DEPTO, _normalize_key,
)


# ─── Validadores de campo individual ────────────────────────────────────────

def _phone_valido(raw: str) -> bool:
    """Teléfono válido: ≥7 dígitos numéricos."""
    if not raw:
        return False
    digits = re.sub(r"\D", "", str(raw))
    return len(digits) >= 7


# ─── Reglas de detección ───────────────────────────────────────────────────

def evaluar_cuenta(row: dict) -> list:
    """Aplica todas las reglas y devuelve lista de problemas.

    `row` espera tener estos campos (vienen del SELECT del endpoint):
        cuenta_partner_odoo_id, nombre, ruc, phone, mobile, email,
        state_name, depto_crm, distrito, pais, tier, asignado_a,
        direccion, ltv_12m, dias_desde_alta
    """
    problemas = []

    # Phone: el negocio guarda el número a veces en `phone` y a veces en
    # `mobile`. Tomamos el primero no vacío (el que el vendedor haya llenado).
    phone = row.get("phone") or row.get("mobile") or ""
    pais = row.get("pais") or "PE"
    depto_raw = row.get("depto_crm") or row.get("state_name") or ""

    # ── CRÍTICOS ─────────────────────────────────────────────────────────

    if not _phone_valido(phone):
        problemas.append({
            "rule": "sin_telefono",
            "severidad": "critico",
            "label": "Sin teléfono válido",
            "detalle": "Cliente sin tel ni móvil — no se puede llamar",
        })

    depto_canon = normalize_depto(depto_raw, pais) if depto_raw else ""
    if not depto_canon:
        if not depto_raw:
            # Sin departamento del todo
            problemas.append({
                "rule": "sin_departamento",
                "severidad": "critico",
                "label": "Sin departamento",
                "detalle": "No se puede categorizar geográficamente",
            })
        elif es_pais_o_ciudad(depto_raw, pais):
            # Es un país o ciudad — SUCIO, no crítico
            sug = suggest_split(depto_raw, pais)
            problemas.append({
                "rule": "pais_o_ciudad_en_depto",
                "severidad": "sucio",
                "label": "Dato mal puesto en Departamento",
                "detalle": sug["razon"],
                "sugerencia": {
                    "departamento": sug["departamento_sugerido"],
                    "distrito": sug["distrito_sugerido"],
                    "pais": sug.get("pais_sugerido"),
                },
            })
        else:
            # Valor raro que no matchea nada conocido
            problemas.append({
                "rule": "depto_no_canonico",
                "severidad": "sucio",
                "label": "Departamento no canónico",
                "detalle": f"'{depto_raw}' no matchea ningún departamento conocido",
            })

    # ── SUCIOS (solo relacionados a phone/depto) ─────────────────────────

    if phone and re.search(r"[a-zA-Z]", phone):
        problemas.append({
            "rule": "phone_caracteres_raros",
            "severidad": "sucio",
            "label": "Teléfono con letras",
            "detalle": f"'{phone}' contiene caracteres no numéricos",
        })

    # NOTA: las reglas ruc_invalido, nombre_test, sin_distrito, sin_direccion,
    # sin_vendedor_asignado se eliminaron a propósito — para seguimiento el
    # vendedor solo necesita TELÉFONO y DEPARTAMENTO. Cuando esos dos estén
    # limpios, podemos reactivarlas si se quiere subir el estándar.

    return problemas


def severidad_max(problemas: list) -> str:
    """Devuelve la severidad más alta del set."""
    if not problemas:
        return None
    orden = {"critico": 0, "sucio": 1, "incompleto": 2}
    return min(problemas, key=lambda p: orden[p["severidad"]])["severidad"]


# Etiquetas legibles de las reglas (para chips de filtro)
# Solo phone + departamento: las otras se eliminaron (ver función evaluar_cuenta).
RULE_LABELS = {
    "sin_telefono":            "Sin teléfono",
    "phone_caracteres_raros":  "Teléfono con letras",
    "sin_departamento":        "Sin departamento",
    "depto_no_canonico":       "Depto no canónico",
    "pais_o_ciudad_en_depto":  "Dato mal puesto en depto",
}
