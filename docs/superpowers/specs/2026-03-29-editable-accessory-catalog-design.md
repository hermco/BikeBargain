# Catalogue d'accessoires editable

**Date** : 2026-03-29
**Statut** : Draft

## Objectif

Permettre a l'utilisateur d'editer le catalogue des accessoires d'un modele de moto depuis l'UI web, en remplacement du catalogue hardcode dans `accessories.py`. Le systeme doit generer automatiquement la detection des variantes orthographiques (accents, tirets, pluriels) et suggerer des synonymes pertinents, sans que l'utilisateur ait a saisir chaque forme manuellement.

## Decisions de design

| Decision | Choix | Justification |
|---|---|---|
| Catalogue hardcode vs DB | Hybride : migration en DB + seed par defaut + bouton reset | Flexible, le user peut tout editer et revenir aux valeurs par defaut |
| Controle regex | Assiste avec preview : le user saisit des mots-cles, le systeme genere la regex | Le user ne voit jamais de regex sauf en preview |
| Moteur de matching | Regex auto-generees depuis des donnees structurees | Le word-sequence matching pur cause trop de faux negatifs (mots intercales, troncs, lookbehinds). Les regex restent le meilleur moteur pour du texte libre francais |
| Preprocesseur texte | Normalisation Unicode (strip accents, lowercase) avant matching | Simplifie les regex generees : plus besoin de `[eè]`, `[éê]` dans les patterns |
| Scope catalogue | Preparation multi-modele (champ `model_id`) mais nullable pour l'instant | Le multi-bike est planifie, on pose la FK sans creer la table `bike_models` |
| Granularite | Groupe + variantes (comme aujourd'hui) | Un groupe = un type d'accessoire, des variantes = declinaisons avec prix specifiques |
| Dictionnaire synonymes | Regles hardcodees dans le code (vocabulaire fini et stable du domaine moto FR) | Gratuit, deterministe, pas de dependance externe |
| Langue | Francais uniquement pour l'instant | Les annonces LeBonCoin sont en francais |

## Approches rejetees

### Normalisation pure (sans regex)

Approche proposee puis rejetee apres review lead dev + architecte : normaliser agressivement le texte (strip accents, tirets→espaces, strip pluriels) puis faire du word-sequence matching sans regex.

**Pourquoi rejetee :**
- ~60% des patterns actuels ne se traduisent pas proprement (mots intercales `de/du`, troncs `prot/renforc`, lookbehinds GPS)
- Le stemming "strip s final" est trop simpliste pour le francais (`bras` → `bra`, `feux` ≠ `feu`)
- Les mots optionnels intercales (`grille de phare`, `protection du radiateur`) causent des faux negatifs systematiques
- Les product aliases avec caracteres speciaux (`H&B` → `h b`, `K&N` → `k n`) produisent des tokens trop courts

**Ce qu'on en a garde :** la normalisation Unicode (strip accents) comme preprocesseur du texte avant matching regex. Ca simplifie les regex generees sans sacrifier la precision.

### Fuzzy matching (Levenshtein/rapidfuzz)

Approche envisagee pour detecter les fautes de frappe automatiquement.

**Pourquoi rejetee :** risque eleve de faux positifs, non deterministe, difficile a debugger, plus lent. Le rapport benefice/risque ne justifie pas la complexite.

### Suggestion de synonymes par LLM

Appeler Claude Haiku a chaque creation d'accessoire pour suggerer des synonymes.

**Pourquoi rejetee :** cout non nul (meme faible). Remplace par des regles linguistiques hardcodees (prefixes interchangeables + equivalences domaine moto) qui couvrent 90% des cas gratuitement.

## Architecture des synonymes a 3 niveaux

L'insight cle : les synonymes existent a des niveaux differents. Les reconnaitre elimine la redondance.

### Niveau 1 : Expressions (groupe)

Differentes facons de nommer le MEME type d'accessoire. Definies sur le **groupe**, heritees par toutes ses variantes.

Exemples :
- Groupe "Pare-mains" → expressions : `["pare-mains", "protege-mains"]`
- Groupe "Bulle" → expressions : `["bulle", "pare-brise"]`
- Groupe "Echappement" → expressions : `["echappement", "silencieux", "pot", "ligne"]`
- Groupe "Sabot moteur" → expressions : `["sabot moteur", "protection moteur"]`

Le compilateur genere `(expression1|expression2|...)` dans la regex de chaque variante du groupe.

### Niveau 2 : Qualificatifs partages

Paires d'equivalence de vocabulaire technique, appliquees automatiquement par le compilateur. Non editables par le user — c'est du vocabulaire stable.

```python
QUALIFIER_EQUIVALENCES = {
    "alu": "aluminium",
    "aluminium": "alu",
    "additionnel": "auxiliaire",
    "auxiliaire": "additionnel",
    "phare": "feu",
    "feu": "phare",
}
```

Quand une variante a le qualificatif "alu", le compilateur genere `(alu|aluminium)` automatiquement.

### Niveau 3 : Noms produits / aliases (variante)

Patterns autonomes stockes sur la variante. Matchent independamment des expressions du groupe.

Exemples :
- Variante "Top case Givi Alaska" → product_aliases : `["alaska trekker", "alaska"]`
- Variante "Support Quad Lock" → product_aliases : `["quad lock"]`
- Variante "Platine Givi M9A" → product_aliases : `["m9a"]`
- Variante "Sacoche Givi XS307" → product_aliases : `["xs307", "xs 307"]`

## Regles d'auto-suggestion de synonymes

Trois types de regles, hardcodees dans `accessories.py`. Appelees uniquement a la configuration (creation/edition d'un groupe), jamais a la detection.

### Regle 1 : Prefixes interchangeables (la plus puissante)

```python
PREFIX_RULES = [
    {"prefixes": ["protege", "pare", "protection", "grille"],
     "context": "Accessoires de protection"},
]
```

Quand l'utilisateur saisit "protege-radiateur" comme expression :
1. Normalise : `protege radiateur`
2. Detecte le prefixe `protege` dans les regles
3. Suggere : `pare-radiateur`, `protection radiateur`, `grille radiateur`
4. L'utilisateur coche celles qui font sens

Cette seule regle couvre : pare-mains, protege-carter, protege-phare, protege-levier, protection reservoir, protection radiateur, protection echappement, etc.

### Regle 2 : Equivalences semantiques du domaine moto

```python
EXPRESSION_EQUIVALENCES = {
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
```

Quand l'utilisateur cree le groupe "Echappement", le systeme suggere immediatement "silencieux", "pot", "ligne" comme expressions alternatives.

### Regle 3 : Equivalences qualificatifs

Appliquees automatiquement par le compilateur sans intervention du user (cf. Niveau 2 ci-dessus).

## Flow UI

```
1. Page "Catalogue" → liste des groupes par categorie
   Chaque groupe affiche : nom, categorie, nb variantes, expressions

2. Creer un groupe :
   - Saisir nom ("Protection radiateur"), categorie (protection), prix par defaut (69EUR)
   - Saisir l'expression principale : "protection radiateur"
   - Suggestions automatiques affichees :
     ┌─────────────────────────────────────────────┐
     │ Prefixes interchangeables :                 │
     │  ☑ protege-radiateur                        │
     │  ☑ grille radiateur                         │
     │  ☐ pare-radiateur                           │
     │                                              │
     │ Equivalences domaine :                      │
     │  (aucune suggestion)                         │
     │                                              │
     │ + Ajouter une expression manuellement        │
     └─────────────────────────────────────────────┘
   - Valider → expressions du groupe sauvegardees

3. Ajouter une variante au groupe :
   - Saisir nom ("Protection radiateur alu aftermarket")
   - Qualificatifs : ["alu"] → compilateur ajoute auto "aluminium"
   - Marques : ["sw-motech", "givi"]
   - Product aliases : [] (aucun nom produit specifique)
   - Mots optionnels : ["de", "du"] (mots qui peuvent s'intercaler)
   - Prix neuf : 80EUR
   - Preview regex affichee + nombre d'annonces qui matcheraient

4. Sauvegarder → refresh des accessoires en background (202 Accepted)
```

## Modele de donnees

### Table `accessory_catalog_group`

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| `id` | int | PK | |
| `group_key` | str | UNIQUE, NOT NULL | Slug stable (ex: `"pare_mains"`) — lien avec AdAccessory |
| `model_id` | int | NULLABLE | FK future vers table bike_models. NULL = tous modeles |
| `name` | str | NOT NULL | Nom affiche ("Pare-mains") |
| `category` | str | NOT NULL | protection, bagagerie, confort, navigation, eclairage, esthetique, performance, autre |
| `expressions` | JSON | NOT NULL, DEFAULT [] | Liste de str — facons de nommer cet accessoire |
| `default_price` | int | NOT NULL | Prix neuf fallback du groupe |

Index : `category`, `model_id`

### Table `accessory_catalog_variant`

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| `id` | int | PK | |
| `group_id` | int | FK NOT NULL (cascade delete) | Groupe parent |
| `name` | str | NOT NULL | Nom affiche ("Pare-mains SW-Motech") |
| `qualifiers` | JSON | NOT NULL, DEFAULT [] | Qualificatifs de cette variante (ex: `["rally", "alu"]`) |
| `brands` | JSON | NOT NULL, DEFAULT [] | Marques (ex: `["sw-motech", "givi"]`) |
| `product_aliases` | JSON | NOT NULL, DEFAULT [] | Noms produit autonomes (ex: `["alaska trekker"]`) |
| `optional_words` | JSON | NOT NULL, DEFAULT [] | Mots intercalables (ex: `["de", "du", "complete"]`) |
| `regex_override` | str | NULLABLE | Regex manuelle pour cas complexes (ex: GPS). Bypass le compilateur |
| `estimated_new_price` | int | NOT NULL | Prix neuf |
| `sort_order` | int | NOT NULL, DEFAULT 0 | Ordre dans le groupe (0 = plus prioritaire). Calcule auto mais surchargeable |

Contraintes : UNIQUE `(group_id, name)`<br/>
Index : `group_id`

### Tables supprimees

- **`accessory_overrides`** : les surcharges de prix existantes sont migrees dans `estimated_new_price` des variantes correspondantes, puis la table est supprimee. Le mecanisme de prix est desormais directement dans le catalogue.

### Table inchangee

- **`ad_accessories`** : garde sa structure actuelle. Le champ `name` (str) reste le lien avec le catalogue via le `name` de la variante matchee. Pas de FK vers `accessory_catalog_variant` pour l'instant (dette technique documentee).

## Compilateur de regex

### Preprocesseur texte (normalisation)

Applique au texte de l'annonce **avant** le matching. Ajoute dans `_clean_text_for_detection()` :

1. Lowercase (deja fait)
2. Strip accents Unicode (NFD + suppression combining marks) — **nouveau**
3. Les zones d'exclusion (`EXCLUSION_PATTERNS`) restent appliquees apres normalisation — **inchange**

L'avantage : les regex generees n'ont plus besoin de gerer les accents. `protege` matche `protège`, `protégé`, `PROTEGE`, etc.

### Generation de regex par variante

Pour chaque variante, le compilateur produit une regex en combinant les donnees structurees.

**Regles de compilation par champ :**

- **Word boundaries (`\b`)** : CHAQUE mot compile recoit un `\b` en debut et fin. C'est la regle la plus importante — sans elle, "deco" matche dans "deconnectable" et "cartographie" matche dans "cartographique". Validee par l'evaluation sur corpus reel.
- **Pluralisation francaise** : pas un simple `s?` mais une gestion des cas francais :
  - Defaut : `mot[sx]?` (couvre "pneu" → "pneus" et "feu" → "feux")
  - Mots en `-eau`, `-eu`, `-au` : `mot[sx]?` (couvre pluriel en -x ET en -s)
  - Feminin : `mot` finissant par `-e` → `mot_sans_e` + `e?s?` (couvre "additionnel", "additionnelle", "additionnels", "additionnelles")
  - Mots finissant deja en `-x` : `(feu|feux)` (alternance explicite singulier/pluriel)
- **Expressions** : stockees telles que saisies (pour affichage), normalisees a la compilation (strip accents). Les mots sont joints par `[\s-]*`. Les `optional_words` sont inseres entre CHAQUE paire de mots consecutifs : `(de\s*|du\s*)?`.
- **Qualificatifs et marques en alternation** : compiles dans un SEUL groupe `(qualifier1|qualifier2|brand1|brand2)`, pas en sequence. Permet a une marque de suivre directement l'expression sans qualificatif intercale (ex: "pneus bridgestone" matche directement).
- **Brands courtes (≤3 chars)** : recoivent un `\b` supplementaire pour eviter les matchs partiels (ex: "re" ne matche pas dans "reglable").
- **Brands multi-mots** : chaque mot joint par `[\s]*` (ex: "royal enfield" → `royal[\s]*enfield`). Les marques avec tiret utilisent `[\s-]*` (ex: "sw-motech" → `sw[\s-]*motech`).
- **Qualificatifs** : chaque qualificatif est etendu avec ses equivalences automatiques (ex: "alu" → `(alu|aluminium)`).
- **Product aliases** : ajoutes comme alternatives autonomes avec `|` a la fin de la regex. Ils matchent independamment des expressions du groupe.

**Exemple complet :**

```
ENTREES :
  Groupe expressions: ["protection radiateur", "protege-radiateur", "grille radiateur"]
  Variante qualifiers: ["alu"]
  Variante brands: ["sw-motech", "givi"]
  Variante optional_words: ["de", "du"]
  Variante product_aliases: []

ETAPES :
  1. Normaliser chaque expression : strip accents
     → ["protection radiateur", "protege radiateur", "grille radiateur"]

  2. Pour chaque expression, generer un pattern flexible :
     - Chaque mot : \b + pluralisation francaise + \b
     - Entre chaque paire de mots : [\s-]* + optional_words
     → \bprotection[sx]?\b[\s-]*(de\s*|du\s*)?\bradiateur[sx]?\b
     → \bprotege[sx]?\b[\s-]*(de\s*|du\s*)?\bradiateur[sx]?\b
     → \bgrille[sx]?\b[\s-]*(de\s*|du\s*)?\bradiateur[sx]?\b

  3. Joindre les expressions avec | :
     → (\bprotection[sx]?\b[\s-]*(de\s*|du\s*)?\bradiateur[sx]?\b|...)

  4. Ajouter qualificatifs ET marques en alternation unique :
     → ...\s*(\balu\b|\baluminium\b|\bsw[\s-]*motech\b|\bgivi\b)

  6. Ajouter les product_aliases comme alternatives autonomes (|) :
     → (rien ici)

REGEX FINALE :
  (\bprotection[sx]?\b[\s-]*(de\s*|du\s*)?\bradiateur[sx]?\b|...)\s*(\balu\b|\baluminium\b|\bsw[\s-]*motech\b|\bgivi\b)
```

### Cas du regex_override

Si `regex_override` est renseigne sur la variante, il est utilise tel quel a la place de la regex generee. Prevu pour les cas complexes comme le GPS (lookbehind/lookahead negatifs).

### Tri par specificite

Au sein d'un groupe, les variantes sont triees par `sort_order` (plus bas = plus prioritaire). A la creation, le `sort_order` est calcule automatiquement :

```
sort_order = -(len(qualifiers) + len(brands) + len(product_aliases))
```

Plus une variante a de qualificatifs/marques/aliases, plus elle est specifique, plus elle est testee en premier. La variante generique (sans qualificatifs ni marques) est toujours testee en dernier.

L'utilisateur peut surcharger le `sort_order` manuellement si l'heuristique ne convient pas.

## Couche domaine (`accessories.py`)

Le fichier garde son role de couche domaine pure (pas de dependance DB). Les changements :

### Supprime

- `ACCESSORY_PATTERNS` : remplace par le catalogue en DB

### Conserve

- `DEPRECIATION_RATE` : inchange
- `EXCLUSION_PATTERNS` : inchange, appliques avant detection
- `_clean_text_for_detection()` : enrichi avec strip accents Unicode
- `detect_accessories()` : meme signature, mais recoit les patterns depuis la DB
- `estimate_total_accessories_value()` : inchange

### Nouveau

- `PREFIX_RULES` : regles de prefixes interchangeables
- `EXPRESSION_EQUIVALENCES` : dictionnaire d'equivalences semantiques moto FR
- `QUALIFIER_EQUIVALENCES` : paires de qualificatifs equivalents
- `suggest_synonyms(expression: str) -> list[str]` : applique les regles et retourne les suggestions
- `suggest_qualifier_alternatives(qualifier: str) -> list[str]` : retourne les equivalences
- `compile_variant_regex(group_expressions, variant) -> str` : genere la regex depuis les donnees structurees
- `build_patterns_from_catalog(groups) -> list[tuple]` : construit la liste de patterns (meme format que l'ancien `ACCESSORY_PATTERNS`) depuis les donnees DB. `detect_accessories()` consomme cette liste sans changement

## Endpoints API

### Catalogue groupes

```
GET    /api/catalog/groups                     → liste des groupes (avec variantes imbriquees)
POST   /api/catalog/groups                     → creer un groupe
GET    /api/catalog/groups/{id}                → detail avec variantes
PATCH  /api/catalog/groups/{id}                → modifier nom/categorie/expressions/prix
DELETE /api/catalog/groups/{id}                → supprimer (cascade variantes)
```

### Variantes

```
POST   /api/catalog/groups/{id}/variants       → ajouter une variante
PATCH  /api/catalog/variants/{id}              → modifier qualifiers/brands/aliases/prix
DELETE /api/catalog/variants/{id}              → supprimer
```

### Utilitaires

```
POST   /api/catalog/suggest-synonyms           → suggestions auto pour une expression donnee
POST   /api/catalog/preview-regex              → preview regex + nb annonces matchees (sans sauvegarder)
POST   /api/catalog/reset                      → reset au catalogue par defaut (seed)
POST   /api/accessories/refresh                → existant, retourne 202 + BackgroundTasks
```

### Detail endpoint suggest-synonyms

```
POST /api/catalog/suggest-synonyms
Body: { "expression": "protege-radiateur" }
Response: {
  "normalized": "protege radiateur",
  "suggestions": [
    { "expression": "pare-radiateur", "rule": "prefix", "context": "Accessoires de protection" },
    { "expression": "protection radiateur", "rule": "prefix", "context": "Accessoires de protection" },
    { "expression": "grille radiateur", "rule": "prefix", "context": "Accessoires de protection" }
  ]
}
```

### Detail endpoint preview-regex

```
POST /api/catalog/preview-regex
Body: {
  "group_expressions": ["protection radiateur", "protege-radiateur", "grille radiateur"],
  "qualifiers": ["alu"],
  "brands": ["sw-motech"],
  "product_aliases": [],
  "optional_words": ["de", "du"],
  "regex_override": null
}
Response: {
  "generated_regex": "(protections?[\\s-]*(de\\s*|du\\s*)?radiateurs?|...) ...",
  "matching_ads_count": 3,
  "matching_ads_sample": [
    { "id": 42, "title": "Himalayan 450 full equip", "matched_text": "...grille alu de radiateur SW-Motech..." }
  ]
}
```

Cet endpoint permet au user de tester sa config avant de sauvegarder, en voyant combien d'annonces matcheraient et un extrait du texte matche.

### Endpoints supprimes

- `PATCH /api/accessory-catalog/{group}` : remplace par `PATCH /api/catalog/groups/{id}` et `PATCH /api/catalog/variants/{id}`
- `DELETE /api/accessory-catalog/{group}/override` : plus necessaire (AccessoryOverride supprime)

### Endpoint adapte

- `GET /api/accessory-catalog` : redirige vers `GET /api/catalog/groups` ou supprime avec adaptation frontend

## Migration

### Phase 1 : Creer les nouvelles tables

Migration Alembic qui cree `accessory_catalog_group` et `accessory_catalog_variant`.

### Phase 2 : Seed depuis ACCESSORY_PATTERNS

Script de migration (dans la meme migration Alembic) qui :

1. Parcourt `ACCESSORY_PATTERNS` (70+ tuples)
2. Pour chaque `group_key` unique, cree un `accessory_catalog_group` avec :
   - `group_key` : la cle existante (ex: `"pare_mains"`)
   - `name` : le nom de la variante generique du groupe
   - `category` : la categorie
   - `expressions` : extraites des patterns regex (ex: `["pare-mains", "protege-mains"]` depuis `(prot[eè]ge[s]?|pare)[\s-]*main`)
   - `default_price` : le prix de la variante generique
3. Pour chaque tuple, cree un `accessory_catalog_variant` avec les champs structures extraits du regex
4. Convertit les `AccessoryOverride` existants en `estimated_new_price` sur les variantes correspondantes (matching par `group_key`)
5. Migration idempotente : skip si les groupes existent deja

### Phase 3 : Supprimer l'ancien systeme

1. Supprimer la table `accessory_overrides`
2. Supprimer `ACCESSORY_PATTERNS` de `accessories.py`
3. Adapter les endpoints API existants
4. Adapter le frontend

Le seed initial est conserve comme fichier JSON (`alembic/seed_accessory_catalog.json`) pour le bouton "reset au catalogue par defaut".

## Refresh des accessoires

### Declenchement

Le refresh est declenche automatiquement apres toute modification du catalogue (creation/edition/suppression de groupe ou variante). Il recalcule les accessoires de toutes les annonces non-manuelles.

### Execution asynchrone

Pour ne pas bloquer le retour HTTP :

1. L'endpoint de modification retourne `202 Accepted` immediatement
2. Le refresh est lance via `BackgroundTasks` de FastAPI
3. Le frontend invalide le cache TanStack Query apres un court delai

### Respect du flag `accessories_manual`

Les annonces avec `accessories_manual = 1` ne sont PAS affectees par le refresh automatique. Un refresh manuel par annonce est possible via `POST /api/ads/{ad_id}/refresh-accessories` (endpoint existant, inchange).

### Bouton reset

Le reset au catalogue par defaut :
1. Reecrit les tables `accessory_catalog_group` et `accessory_catalog_variant` depuis le seed JSON
2. Declenche un `refresh_accessories(skip_manual=True)`
3. Ne supprime ni les annonces ni leurs accessoires manuels

## Cache du catalogue

Le catalogue est charge depuis la DB a chaque detection. Pour eviter des requetes repetees :

- Cache applicatif au niveau module (`@lru_cache` avec TTL ou invalidation explicite)
- Invalide a chaque ecriture sur le catalogue (POST/PATCH/DELETE)
- En mono-process (uvicorn), un dict global suffit
- Le refresh bulk charge le catalogue une seule fois en debut de batch

## Suppression d'un groupe

Quand un groupe est supprime :
- Les variantes sont supprimees en cascade (FK cascade delete)
- Les `ad_accessories` existantes qui referenceaient ce groupe conservent leur `name` (str) en base — elles ne sont pas supprimees. C'est un orphelin volontaire : l'accessoire a ete detecte historiquement, il reste dans les donnees de l'annonce
- Un refresh automatique est declenche : les annonces non-manuelles sont re-scannees avec le catalogue mis a jour, ce qui supprime les accessoires qui ne matchent plus

## Ce qui ne change pas

- `detect_accessories()` : meme signature et meme output (liste de dicts)
- `estimate_total_accessories_value()` : inchange
- `DEPRECIATION_RATE` : global, inchange
- `EXCLUSION_PATTERNS` : inchanges
- Le ranking (`analyzer.py`) : inchange
- Le flow preview/confirm des annonces : inchange
- Le flow d'edition manuelle des accessoires par annonce : inchange
- Le flag `accessories_manual` : inchange
- La table `ad_accessories` : structure inchangee

## Exemple concret : migration du groupe "Pare-mains"

### Avant (hardcode)

```python
(r"(prot[eè]ge[s]?|pare)[\s-]*main[s]?\s*(rally|renforc|alu)",
 "Pare-mains rally aluminium", "protection", 120, "pare_mains"),
(r"(prot[eè]ge[s]?|pare)[\s-]*main[s]?\s*(re\b|royal\s*enfield|genuine|origine)",
 "Pare-mains Royal Enfield", "protection", 120, "pare_mains"),
(r"(prot[eè]ge[s]?|pare)[\s-]*main[s]?\s*(acerbis|barkbuster|sw[\s-]*motech|givi)",
 "Pare-mains aftermarket", "protection", 140, "pare_mains"),
(r"(prot[eè]ge[s]?|pare)[\s-]*main|hand\s*guard",
 "Pare-mains", "protection", 120, "pare_mains"),
```

### Apres (DB)

**Groupe** :
```json
{
  "group_key": "pare_mains",
  "name": "Pare-mains",
  "category": "protection",
  "expressions": ["pare-mains", "protege-mains", "handguard"],
  "default_price": 120
}
```

**Variantes** (sort_order croissant = plus specifique en premier) :
```json
[
  {
    "name": "Pare-mains rally aluminium",
    "qualifiers": ["rally", "renforce", "alu"],
    "brands": [],
    "product_aliases": [],
    "optional_words": [],
    "estimated_new_price": 120,
    "sort_order": -3
  },
  {
    "name": "Pare-mains Royal Enfield",
    "qualifiers": [],
    "brands": ["royal enfield", "re", "genuine", "origine"],
    "product_aliases": [],
    "optional_words": [],
    "estimated_new_price": 120,
    "sort_order": -4
  },
  {
    "name": "Pare-mains aftermarket",
    "qualifiers": [],
    "brands": ["acerbis", "barkbuster", "sw-motech", "givi"],
    "product_aliases": [],
    "optional_words": [],
    "estimated_new_price": 140,
    "sort_order": -4
  },
  {
    "name": "Pare-mains",
    "qualifiers": [],
    "brands": [],
    "product_aliases": [],
    "optional_words": [],
    "estimated_new_price": 120,
    "sort_order": 0
  }
]
```

**Regex compilees** (generees a la volee par `compile_variant_regex`) :

```
Variante "rally alu" :
  (\bpare[sx]?\b[\s-]*\bmain[sx]?\b|\bprotege[sx]?\b[\s-]*\bmain[sx]?\b|\bhandguard[sx]?\b)\s*(\brally[sx]?\b|\brenforce[sx]?\b|\balu\b|\baluminium\b)

Variante "Royal Enfield" :
  regex_override car "re\b" necessite un word boundary specifique :
  (pares?[\s-]*mains?|proteges?[\s-]*mains?|hand\s*guards?)\s*(re\b|royal\s*enfield|genuine|origine)

Variante "aftermarket" :
  (\bpare[sx]?\b[\s-]*\bmain[sx]?\b|...)\s*(\bacerbis\b|\bbarkbuster[sx]?\b|\bsw[\s-]*motech\b|\bgivi\b)

Variante generique :
  (\bpare[sx]?\b[\s-]*\bmain[sx]?\b|\bprotege[sx]?\b[\s-]*\bmain[sx]?\b|\bhandguard[sx]?\b)
```

## Evaluation sur corpus reel

Le compilateur a ete evalue sur les 12 annonces non-sold en base (corpus reel LeBonCoin).

### Resultats

| Metrique | Ancien (hardcode) | Nouveau (catalogue structure) |
|---|---|---|
| Groupes detectes identiques | — | 21/25 (84%) |
| Groupes perdus (regressions) | — | **0** |
| Groupes gagnes (ameliorations) | — | +2 (HP Corse, retros) |
| Variante differente (meme groupe) | — | 2 (selection de variante, pas un bug) |
| Rappel vs DB reference | 65.4% | 62.5% |

### Analyse du gap de rappel

Sur les 11 accessoires "en base mais non detectes par le nouveau" :
- **9 ne sont pas non plus detectes par l'ancien** → ajouts manuels (accessoires visibles sur photos mais pas mentionnes dans le texte). Limitation acceptee et documentee.
- **2 sont des differences de variante** (meme groupe detecte, nom de variante different) → pas un vrai manque.

Le nouveau moteur a la **meme couverture effective** que l'ancien, avec 2 detections supplementaires.

### Bugs trouves et corriges

| Bug | Cause | Fix integre dans la spec |
|---|---|---|
| "deco" matche dans "deconnectable" | Pas de word boundary | `\b` autour de chaque mot compile |
| "cartographie" matche "cartographique" | Prefixe matche un mot different | `\b` en fin de mot |
| "feux additionnelles" non matche | Pluriel `-x` et feminin non geres | Pluralisation francaise complete |
| "selle reglable" → faux positif "RE" | "re" matche debut de "reglable" | `\b` apres marques courtes (≤3 chars) |
| "pneus bridgestone" non matche | Qualifiers et brands en sequence | Mis en alternation unique |
| "bulle haute wrs" → mauvaise variante | Sort_order incorrect | regex_override + sort_order ajuste |

### Conclusion

Le catalogue structure avec regex auto-generees reproduit fidelement le comportement du catalogue hardcode, sans regression. Les bugs identifies pendant l'evaluation ont permis d'affiner les regles de compilation (word boundaries, pluralisation FR, alternation qualifiers/brands) qui sont maintenant integrees dans la spec.

## Exemple concret : le cas GPS (regex_override)

Le pattern GPS actuel est le plus complexe du catalogue : lookbehinds et lookaheads negatifs pour eviter "support GPS" et "GPS/telephone".

### Avant (hardcode)

```python
(r"(?<!support\s)(?<!suport\s)\bgps\b(?!\s*/\s*t[eé]l[eé]phone)(?!\s*/\s*smartphone)",
 "GPS", "navigation", 350, "gps"),
```

### Apres (DB)

**Groupe** :
```json
{
  "group_key": "gps",
  "name": "GPS",
  "category": "navigation",
  "expressions": ["gps"],
  "default_price": 350
}
```

**Variantes** :
```json
[
  {
    "name": "GPS Garmin/TomTom",
    "qualifiers": [],
    "brands": ["garmin", "zumo", "tomtom"],
    "product_aliases": [],
    "optional_words": [],
    "regex_override": null,
    "estimated_new_price": 350,
    "sort_order": -3
  },
  {
    "name": "GPS",
    "qualifiers": [],
    "brands": [],
    "product_aliases": [],
    "optional_words": [],
    "regex_override": "(?<!support\\s)(?<!suport\\s)\\bgps\\b(?!\\s*/\\s*telephone)(?!\\s*/\\s*smartphone)",
    "estimated_new_price": 350,
    "sort_order": 0
  }
]
```

Le `regex_override` preserve le comportement exact du pattern actuel. Le texte est deja normalise (accents strippes), donc `telephone` suffit au lieu de `t[eé]l[eé]phone`.

Ce cas illustre pourquoi le `regex_override` est necessaire : certains patterns ont une logique de contexte negatif qui ne peut pas etre exprimee par la combinaison expressions + qualificatifs + marques.

## Risques identifies

| Risque | Severite | Mitigation |
|---|---|---|
| Regression silencieuse a la migration seed (70+ patterns a convertir) | Haute | Script de comparaison side-by-side deja realise : 0 regressions sur corpus reel. A re-executer apres implementation |
| Double source de verite pendant la transition (code + DB) | Haute | Migration en une seule phase : seed DB puis suppression immediat du hardcode dans le meme PR |
| Faux positifs par mots courts sans word boundary | Haute | `\b` systematique autour de chaque mot compile. Valide par l'evaluation ("deco"/"re"/"cartographie") |
| Pluralisation francaise incomplete | Moyenne | Gestion explicite des pluriels en -x, feminins en -e/-es. Valide par l'evaluation ("feux", "additionnelles") |
| Refresh synchrone bloquant sur HTTP avec gros catalogue | Moyenne | BackgroundTasks FastAPI avec 202 Accepted |
| Cache catalogue desynchronise apres ecriture | Moyenne | Invalidation explicite a chaque POST/PATCH/DELETE sur le catalogue |
| Breaking change API frontend (group string → id int) | Moyenne | Garder `group_key` string dans les reponses API pour compatibilite. Adapter le frontend progressivement |
| Variantes avec regex_override necessaires pour cas complexes | Basse | Identifies : GPS (lookbehind/lookahead), WRS (qualificatifs optionnels avant marque), top case 40L RE, stickers/deco. ~5-6 variantes sur ~88 |
| Absence de FK `ad_accessories → catalog_variant` | Basse | Dette technique documentee. Les noms (str) restent le lien. A adresser en v2 |
