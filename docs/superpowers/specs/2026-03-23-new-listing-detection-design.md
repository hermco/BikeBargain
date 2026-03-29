# Detection des annonces neuves concessionnaire

## Contexte

Certaines annonces sur LeBonCoin sont en realite des concessionnaires qui vendent des motos neuves au prix du neuf. Ces annonces polluent les resultats de crawl qui ciblent le marche de l'occasion. L'objectif est de les detecter automatiquement et de permettre a l'utilisateur de les cacher dans la liste de crawl.

Exemple typique : prix catalogue, specs constructeur copie-colle, mention "concessionnaire", "frais de mise a la route", promo en cours.

## Logique de detection

Fonction `detect_new_listing(ad_data) -> bool` combinant plusieurs signaux.

### Condition necessaire

`seller_type == "pro"` (provient de `owner_type` LBC).

### Signaux confirmants (au moins un requis)

1. **Prix proche du neuf** : prix dans une fourchette de +-5% du catalogue `NEW_PRICES` (apres detection de la variante)
2. **Kilometrage nul ou quasi-nul** : km = 0 ou < 100
3. **Patterns texte** dans le body ou le subject :
   - `concessionnaire`
   - `frais de mise a la route`
   - `frais d'immatriculation`
   - `remise promo` / `remise` + montant
   - `disponible a l'essai`
   - `garantie .* ans pieces`
   - `garantie constructeur`
   - Specs constructeur : `refroidissement liquide`, `SHERPA 450`, `40CV`, `monocylindre 452`

### Resultat

Booleen `is_new_listing`. True si condition necessaire + au moins un signal confirmant.

## Integration dans le crawl

### Probleme

Au moment du search (`/api/crawl/search`), on dispose uniquement de : subject, price, city, department, thumbnail. Pas de body, seller_type, ni km.

### Solution en 2 temps

- **Search** : heuristique legere sur le subject (patterns type "remise", "concessionnaire") + prix approximativement egal au neuf. Flag preliminaire `is_new_listing` sur `CrawlSessionAd`.
- **Extract** : detection complete (body + seller_type + km + prix). Mise a jour du flag `is_new_listing`.

## Changements modele

Ajout d'un champ sur `CrawlSessionAd` (table existante) :

```python
is_new_listing: bool = Field(default=False)
```

Migration Alembic requise.

## Changements backend

### `src/extractor.py`

Nouvelle fonction :

```python
def detect_new_listing(ad_data: dict) -> bool:
    """Detecte si une annonce est une moto neuve vendue par concessionnaire."""
```

Prend un dict avec les champs : `seller_type`, `price`, `mileage`, `body`, `subject`, `variant`.

### `src/api.py`

- **Endpoint `/api/crawl/search`** : apres creation des `CrawlSessionAd`, appliquer l'heuristique legere (subject + prix) et setter `is_new_listing`.
- **Endpoint `/api/crawl/extract`** : apres extraction complete, appeler `detect_new_listing()` avec toutes les donnees et mettre a jour `is_new_listing` sur le `CrawlSessionAd`.
- **Reponses** : inclure `is_new_listing` dans les reponses de `/api/crawl/sessions/active` et `/api/crawl/extract`.

## Changements frontend

### `frontend/src/pages/CrawlPage.tsx`

- **Badge** : tag visuel "Neuf" (couleur distincte, ex: bleu ou orange) sur les annonces flaggees `is_new_listing` dans la liste.
- **Toggle** : bouton/switch "Cacher les annonces neuves" au-dessus de la liste. Filtre cote client sur `is_new_listing`. Etat local (pas persiste).

### Traductions `frontend/src/i18n/locales/{fr,en}.json`

- `crawl.new_listing_badge` : "Neuf" / "New"
- `crawl.hide_new_listings` : "Cacher les annonces neuves" / "Hide new listings"

## Fichiers impactes

| Fichier | Changement |
|---------|-----------|
| `src/extractor.py` | Fonction `detect_new_listing()` |
| `src/models.py` | `is_new_listing` sur `CrawlSessionAd` |
| `src/api.py` | Appel detection au search + extract |
| `alembic/versions/` | Nouvelle migration |
| `frontend/src/pages/CrawlPage.tsx` | Badge + toggle |
| `frontend/src/i18n/locales/fr.json` | Traductions FR |
| `frontend/src/i18n/locales/en.json` | Traductions EN |
