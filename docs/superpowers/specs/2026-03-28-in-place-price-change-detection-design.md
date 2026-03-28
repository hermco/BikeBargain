# Design : Detection des changements de prix in-place

## Contexte

Aujourd'hui, le systeme gere le cas ou un vendeur supprime son annonce et la reposte (potentiellement avec un prix different) via le mecanisme de merge/repost. Mais il ne gere pas le cas ou un vendeur **modifie le prix directement sur son annonce existante** sans la republier.

## Decisions

- Detection automatique pendant le crawl + check manuel global
- Confirmation explicite requise (l'utilisateur valide chaque changement)
- Le check manuel est un bouton "Verifier les prix" sur la page Crawl
- Integration comme 3e categorie de resultats dans le crawl (a cote des nouvelles annonces et des reposts)

## Design

### 1. Backend

#### Detection pendant le crawl

Dans le flow d'extraction du crawl, quand une annonce est reconnue comme deja en base (meme ID LeBonCoin), on compare `Ad.price` en base avec le prix fraichement extrait. Si le prix differe, l'annonce est renvoyee au frontend avec :

```json
{
  "price_changed": true,
  "current_price": 5500,
  "new_price": 5300,
  "price_delta": -200
}
```

Elle n'apparait ni comme "nouvelle" ni comme "repost" — c'est une 3e categorie distincte.

#### Nouvel endpoint : `POST /api/ads/{id}/confirm-price`

**Payload :**
```json
{
  "new_price": 5300
}
```

**Comportement :**
1. Met a jour `Ad.price` avec le nouveau prix
2. Si l'annonce n'a pas encore d'historique de prix, cree une entree `source='initial'` avec l'ancien prix et `recorded_at` = `Ad.first_publication_date` (meme logique que le merge)
3. Cree une entree `AdPriceHistory` avec :
   - `source = 'price_update'`
   - `note` auto-generee : "Baisse de 200EUR" / "Hausse de 100EUR"
   - `recorded_at` = maintenant
4. Met a jour `Ad.updated_at`

**Reponse :** l'annonce mise a jour avec le delta.

#### Nouvel endpoint : `POST /api/ads/check-prices`

**Comportement :**
1. Recupere toutes les annonces non-sold en base
2. Re-fetche chaque annonce depuis LeBonCoin (via le client LBC, respecte le mode split si `LBC_SERVICE_URL` est configure)
3. Compare les prix
4. Retourne la liste des annonces dont le prix a change, avec ancien prix, nouveau prix, et delta

**Reponse :**
```json
{
  "price_changes": [
    {
      "id": 2849506789,
      "subject": "Royal Enfield Himalayan 450...",
      "current_price": 5500,
      "new_price": 5300,
      "price_delta": -200,
      "city": "Paris",
      "thumbnail": "https://..."
    }
  ],
  "checked_count": 42,
  "unchanged_count": 40
}
```

### 2. Frontend — Page Crawl

#### Bouton "Verifier les prix"

- Place a cote du bouton de lancement de crawl
- Lance `POST /api/ads/check-prices`
- Meme spinner/etat de chargement que le crawl

#### Section "Prix mis a jour"

Nouvelle section dans les resultats du crawl, entre les nouvelles annonces et les reposts. Chaque carte affiche :

- Titre de l'annonce (lien vers la page detail)
- Ancien prix -> Nouveau prix
- Delta colore (vert si baisse, rouge si hausse)
- Bouton **"Confirmer"** : appelle `POST /api/ads/{id}/confirm-price`, la carte passe en etat confirme (grisee)
- Bouton **"Ignorer"** : retire la carte des resultats sans action

#### Resultats mixtes

Quand un crawl normal detecte des changements de prix sur des annonces connues, elles apparaissent dans cette meme section "Prix mis a jour", quel que soit le declencheur (crawl ou check-prices).

Un compteur dans le resume du crawl indique le nombre de prix mis a jour.

### 3. Historique de prix

#### Nouveau source type

`'price_update'` rejoint `'initial'`, `'repost'`, et `'manual'` dans `AdPriceHistory.source`.

#### Timeline (page detail)

Les entrees `price_update` s'affichent dans la timeline existante. La distinction est uniquement dans le label affiche :
- `initial` : "Prix initial"
- `repost` : "Republication"
- `price_update` : "Mise a jour du prix"
- `manual` : "Modification manuelle"

Pas de nouveau composant — juste un cas supplementaire dans le rendu conditionnel existant.

#### Transfert lors d'un merge

Si une annonce a accumule des entrees `price_update` dans son historique puis est repostee, le merge copie tout l'historique comme aujourd'hui. Les entrees `price_update` suivent naturellement la chaine.

#### Type frontend

```typescript
export interface PriceHistoryEntry {
  // ...
  source: 'initial' | 'repost' | 'manual' | 'price_update'
}
```

### 4. Migration Alembic

Une migration n'est pas necessaire pour ajouter une nouvelle valeur de `source` — c'est un champ `str` libre, pas un enum SQL.

## Fichiers impactes

**Backend :**
- `src/api.py` — Nouveaux endpoints `confirm-price` et `check-prices`, modification du flow crawl
- `src/crawler.py` — Detection des changements de prix pendant le crawl

**Frontend :**
- `frontend/src/pages/CrawlPage.tsx` — Bouton "Verifier les prix", section "Prix mis a jour", cartes de confirmation
- `frontend/src/pages/AdDetailPage.tsx` — Label `price_update` dans la timeline
- `frontend/src/types.ts` — Ajout de `'price_update'` au type source
- `frontend/src/lib/api.ts` — Fonctions `checkPrices()` et `confirmPrice()`
- `frontend/src/i18n/locales/fr.json` — Traductions FR
- `frontend/src/i18n/locales/en.json` — Traductions EN
