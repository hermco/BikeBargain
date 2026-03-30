"""
Compilateur de regex et moteur de synonymes pour le catalogue d'accessoires.

Couche domaine pure — pas de dependance DB.
"""

import re
import unicodedata


def strip_accents(text: str) -> str:
    """Supprime les accents Unicode (NFD + suppression combining marks)."""
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def normalize_text(text: str) -> str:
    """Lowercase + strip accents. Utilisé avant le matching regex."""
    return strip_accents(text.lower())


def _pluralize_word(word: str) -> str:
    """Genere un pattern regex qui matche singulier et pluriel francais d'un mot."""
    if not word:
        return word

    # Mots finissant en -x : fixe (pluriel deja couvert)
    if word.endswith("x"):
        return rf"\b{re.escape(word)}\b"

    # Mots finissant en -s : le s est optionnel (match singulier et pluriel)
    if word.endswith("s"):
        stem = re.escape(word[:-1])
        return rf"\b{stem}s?\b"

    # Mots en -eau, -eu, -au : pluriel en -x ET -s
    if word.endswith(("eau", "eu", "au")):
        return rf"\b{re.escape(word)}[sx]?\b"

    # Mots en -al : pluriel en -aux (ex: lateral → lateraux)
    if word.endswith("al"):
        stem = word[:-2]
        return rf"\b{re.escape(stem)}(al|aux)\b"

    # Default : mot + [sx]?
    return rf"\b{re.escape(word)}[sx]?\b"


# ─── EQUIVALENCES ─────────────────────────────────────────────────────────────

QUALIFIER_EQUIVALENCES: dict[str, str] = {
    "alu": "aluminium",
    "aluminium": "alu",
    "additionnel": "auxiliaire",
    "auxiliaire": "additionnel",
    "phare": "feu",
    "feu": "phare",
}

PREFIX_RULES: list[dict] = [
    {
        "prefixes": ["protege", "pare", "protection", "grille"],
        "context": "Accessoires de protection",
    },
]

EXPRESSION_EQUIVALENCES: dict[str, list[str]] = {
    "bulle": ["pare-brise"],
    "pare-brise": ["bulle"],
    "sabot": ["protection moteur"],
    "protection moteur": ["sabot"],
    "echappement": ["silencieux", "pot", "ligne"],
    "silencieux": ["echappement", "pot"],
    "pot": ["echappement", "silencieux"],
    "ligne": ["echappement"],
    "antivol": ["bloque-disque"],
    "bloque-disque": ["antivol"],
    "bequille centrale": ["leve-moto"],
    "leve-moto": ["bequille centrale"],
    "retroviseur": ["retro"],
    "retro": ["retroviseur"],
    "porte-bagages": ["support bagages"],
    "sacoche cavaliere": ["sacoche de selle"],
    "sacoche de selle": ["sacoche cavaliere"],
}


def suggest_synonyms(expression: str) -> list[dict]:
    """
    Suggere des synonymes pour une expression d'accessoire.

    Returns: [{"expression": str, "rule": "prefix"|"equivalence", "context": str}]
    """
    normalized = normalize_text(expression)
    # Normalize: replace tirets by spaces for matching
    words = normalized.replace("-", " ").split()
    suggestions: list[dict] = []

    # Rule 1: prefix interchangeables
    for rule in PREFIX_RULES:
        prefixes = [normalize_text(p) for p in rule["prefixes"]]
        if words and words[0] in prefixes:
            suffix = " ".join(words[1:])
            for prefix in prefixes:
                if prefix != words[0]:
                    candidate = f"{prefix}-{suffix}" if "-" in expression else f"{prefix} {suffix}"
                    suggestions.append({
                        "expression": candidate,
                        "rule": "prefix",
                        "context": rule["context"],
                    })

    # Rule 2: expression equivalences
    for key, equivalents in EXPRESSION_EQUIVALENCES.items():
        if normalize_text(key) == normalized.replace("-", " ").strip():
            for equiv in equivalents:
                suggestions.append({
                    "expression": equiv,
                    "rule": "equivalence",
                    "context": "",
                })

    return suggestions


def suggest_qualifier_alternatives(qualifier: str) -> list[str]:
    """Retourne les equivalences pour un qualificatif."""
    normalized = normalize_text(qualifier)
    equiv = QUALIFIER_EQUIVALENCES.get(normalized)
    return [equiv] if equiv else []


def _compile_expression(expression: str, optional_words: list[str]) -> str:
    """Compile une expression en pattern regex avec mots optionnels intercalés."""
    normalized = normalize_text(expression).replace("-", " ")
    words = normalized.split()
    if not words:
        return ""

    parts = []
    for i, word in enumerate(words):
        parts.append(_pluralize_word(word))
        if i < len(words) - 1:
            # Between words: optional separator + optional words
            sep = r"[\s-]*"
            if optional_words:
                opt_group = "|".join(rf"{re.escape(normalize_text(w))}\s*" for w in optional_words)
                sep += rf"({opt_group})?"
            parts.append(sep)

    return "".join(parts)


def _compile_qualifiers(qualifiers: list[str]) -> str:
    """Compile qualificatifs en groupe d'alternation."""
    alternatives = []
    for q in qualifiers:
        nq = normalize_text(q)
        equiv = QUALIFIER_EQUIVALENCES.get(nq)
        if equiv:
            alternatives.append(rf"({_pluralize_word(nq)}|{_pluralize_word(equiv)})")
        else:
            alternatives.append(_pluralize_word(nq))
    return "|".join(alternatives) if alternatives else ""


def _compile_brands(brands: list[str]) -> str:
    """Compile marques en groupe d'alternation."""
    alternatives = []
    for brand in brands:
        nb = normalize_text(brand)
        brand_words = nb.replace("-", " ").split()
        if len(brand_words) > 1:
            sep = r"[\s-]*" if "-" in brand else r"[\s]*"
            brand_pattern = sep.join(re.escape(w) for w in brand_words)
            brand_pattern = rf"\b{brand_pattern}\b"
            alternatives.append(brand_pattern)
        else:
            if len(nb) <= 3:
                alternatives.append(rf"\b{re.escape(nb)}\b")
            else:
                alternatives.append(_pluralize_word(nb))
    return "|".join(alternatives) if alternatives else ""


def compile_variant_regex(group_expressions: list[str], variant: dict) -> str:
    """
    Compile une variante en regex complete.

    Args:
        group_expressions: liste d'expressions du groupe parent
        variant: dict avec qualifiers, brands, product_aliases, optional_words, regex_override

    Returns:
        Regex string prete pour re.search()
    """
    # If regex_override, use it directly
    if variant.get("regex_override"):
        return variant["regex_override"]

    optional_words = variant.get("optional_words", [])
    qualifiers = variant.get("qualifiers", [])
    brands = variant.get("brands", [])
    product_aliases = variant.get("product_aliases", [])

    # Step 1: compile each group expression
    expr_patterns = []
    for expr in group_expressions:
        compiled = _compile_expression(expr, optional_words)
        if compiled:
            expr_patterns.append(compiled)

    # Step 2: join expressions with |
    expressions_group = f"({'|'.join(expr_patterns)})" if expr_patterns else ""

    # Step 3: compile qualifiers and brands separately
    brand_pattern = _compile_brands(brands)

    # Step 3b: split qualifiers into redundant (already in expressions) vs additive
    expr_normalized = {normalize_text(e) for e in group_expressions}
    expr_words = set()
    for e in expr_normalized:
        expr_words.update(e.replace("-", " ").split())
    # Also add singular/plural/feminine forms for fuzzy matching
    expr_stems = set()
    for w in expr_words:
        expr_stems.add(w)
        # Strip common French suffixes to find the stem
        for suffix in ("es", "s", "e", "aux"):
            if w.endswith(suffix) and len(w) > len(suffix) + 1:
                stem = w[:-len(suffix)]
                expr_stems.add(stem)
                if suffix == "aux":
                    expr_stems.add(stem + "al")
        # Also add common plural/feminine forms
        expr_stems.add(w + "s")
        expr_stems.add(w + "e")
        expr_stems.add(w + "es")
    redundant_quals = [q for q in qualifiers if normalize_text(q) in expr_stems]
    additive_quals = [q for q in qualifiers if normalize_text(q) not in expr_stems]

    redundant_pattern = _compile_qualifiers(redundant_quals)
    additive_pattern = _compile_qualifiers(additive_quals)

    # Step 4: combine
    # - Brands: always required (distinguish brand-specific variants)
    # - Redundant qualifiers: optional (already in expression, e.g. "selle confort" + qual "confort")
    # - Additive qualifiers: required (add info, e.g. "retroviseurs" + qual "bar-end")
    if expressions_group and brand_pattern:
        qual_parts = []
        if redundant_pattern:
            qual_parts.append(rf"(?:\s+(?:{redundant_pattern}))?")
        if additive_pattern:
            qual_parts.append(rf"(?:\s+(?:{additive_pattern}))?")
        qual_suffix = "".join(qual_parts)
        main_pattern = rf"{expressions_group}{qual_suffix}\s*(?:{brand_pattern})"
    elif expressions_group and additive_pattern:
        # Additive qualifiers required — this is a specific variant (e.g. "retros bar-end")
        if redundant_pattern:
            main_pattern = rf"{expressions_group}(?:\s+(?:{redundant_pattern}))?\s*(?:{additive_pattern})"
        else:
            main_pattern = rf"{expressions_group}\s*(?:{additive_pattern})"
    elif expressions_group and redundant_pattern:
        # Only redundant qualifiers — optional (generic variant)
        main_pattern = rf"{expressions_group}(?:\s+(?:{redundant_pattern}))?"
    elif expressions_group:
        main_pattern = expressions_group
    else:
        main_pattern = ""

    # Step 5: add product aliases as autonomous alternatives
    if product_aliases:
        alias_patterns = []
        for alias in product_aliases:
            na = normalize_text(alias)
            alias_words = na.split()
            if len(alias_words) > 1:
                alias_patterns.append(r"[\s-]*".join(rf"\b{re.escape(w)}\b" for w in alias_words))
            else:
                alias_patterns.append(rf"\b{re.escape(na)}\b")

        aliases_group = "|".join(alias_patterns)
        if main_pattern:
            return f"{main_pattern}|{aliases_group}"
        return aliases_group

    return main_pattern


def build_patterns_from_catalog(groups: list[dict]) -> list[tuple[str, str, str, int, str]]:
    """
    Construit la liste de patterns depuis les donnees catalogue (meme format que ACCESSORY_PATTERNS).

    Args:
        groups: list of group dicts with nested "variants" list

    Returns:
        list of (regex, name, category, price, group_key) tuples,
        ordered by group then sort_order within group.
    """
    patterns = []
    for group in groups:
        group_expressions = group["expressions"]
        group_key = group["group_key"]
        category = group["category"]

        # Sort variants by sort_order (lowest first = most specific)
        variants = sorted(group.get("variants", []), key=lambda v: v.get("sort_order", 0))

        for variant in variants:
            regex = compile_variant_regex(group_expressions, variant)
            if regex:
                patterns.append((
                    regex,
                    variant["name"],
                    category,
                    variant["estimated_new_price"],
                    group_key,
                ))

    return patterns
