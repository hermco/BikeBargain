# Himalayan 450 Analyzer

Outil d'analyse des annonces de seconde main pour la **Royal Enfield Himalayan 450** sur LeBonCoin.

## Fonctionnalités

- **Extraction** d'annonces LeBonCoin via un simple lien
- **Détection automatique** de la variante (Base / Pass / Summit / Mana Black Edition), couleur et type de jantes
- **Détection des accessoires** mentionnés dans la description (86 patterns, 51 accessoires distincts)
- **Comparaison au prix neuf** de référence (catalogue France mars 2026)
- **Algorithme de classement** par décote réelle (prix effectif tenant compte des accessoires, usure, garantie)
- **Crawl LeBonCoin** avec détection de doublons/reposts et workflow d'import par lot
- **Détection de reposts** par scoring multi-critères (ville, prix, description, accessoires, kilométrage)
- **Fusion d'annonces** (merge) avec historique de prix entre annonces successives
- **Suivi des ventes** : marquage vendu manuel ou vérification automatique en ligne
- **Historique des prix** à travers les reposts (timeline prix initial → reposts → deltas)
- **Catalogue accessoires éditable** : surcharge des prix par défaut avec propagation aux annonces
- **Stockage SQLite** local avec historique
- **Export CSV** pour analyse dans un tableur
- **Statistiques** agrégées (prix, km, répartition par variante, accessoires les plus courants)
- **Interface web** React avec dashboard, classement par décote, gestion des annonces et crawl
- **API REST** FastAPI exposant toutes les fonctionnalités

## Installation

```bash
cd ~/Work/himalayan-450-analyzer
python3 -m venv .venv
source .venv/bin/activate
make install
```

## Usage

### Interface web (recommandé)

```bash
source .venv/bin/activate
make dev
```

Ouvre http://localhost:5173 dans le navigateur. Le backend API tourne sur le port 8000.

### CLI

```bash
source .venv/bin/activate

python main.py add https://www.leboncoin.fr/motos/2849506789.htm
python main.py add https://www.leboncoin.fr/motos/111.htm https://www.leboncoin.fr/motos/222.htm
python main.py list
python main.py show 2849506789
python main.py stats
python main.py export
```

### Rapport de classement

```bash
python -m src.analyzer
```

Affiche un rapport détaillé de toutes les annonces classées par décote (meilleur deal en premier).

## Structure du projet

```
himalayan-450-analyzer/
├── main.py                  # CLI principal (add/list/show/stats/export)
├── src/
│   ├── api.py               # API REST FastAPI (25 endpoints)
│   ├── database.py          # Schéma SQLite et opérations CRUD
│   ├── extractor.py         # Extraction LBC + détection variante/couleur
│   ├── analyzer.py          # Algorithme de scoring et classement
│   ├── accessories.py       # Détection des accessoires (86 patterns)
│   └── crawler.py           # Crawl/recherche LeBonCoin
├── frontend/                # Interface React (Vite + TypeScript + Tailwind)
│   ├── src/
│   │   ├── components/      # Composants UI (cards, sidebar, filtres, etc.)
│   │   ├── pages/           # Pages (annonces, détail, stats, classement)
│   │   ├── hooks/           # TanStack Query hooks
│   │   ├── lib/             # Client API et utilitaires
│   │   └── types.ts         # Types TypeScript
│   └── ...
├── Makefile                 # dev / install / build
├── modeles-prix-neuf.md     # Catalogue des prix neuf de référence
├── himalayan_450.db         # Base SQLite (générée automatiquement)
├── requirements.txt
└── README.md
```

## Algorithme de classement

Le classement calcule un **prix effectif réel** pour chaque annonce :

```
prix_effectif = prix_affiché
              - accessoires (valeur occasion, 65% du neuf)
              + usure consommables (coût garage proraté au km)
              + usure mécanique générale (0.03 €/km)
              + risque d'état (0.04 €/km)
              - garantie constructeur restante (200 €/an)
```

**Consommables pris en compte** (tarif garage pièces + main d'œuvre) :

| Consommable | Coût garage | Durée de vie |
|-------------|------------:|-------------:|
| Pneus (AV+AR) | 270 € | 12 000 km |
| Kit chaîne | 254 € | 20 000 km |
| Plaquettes (AV+AR) | 145 € | 15 000 km |
| Vidange (huile+filtre) | 140 € | 10 000 km |

Plus la décote est grande, meilleur est le deal. Les dépenses court terme (consommable à remplacer dans < 3 000 km) sont signalées.

## Workflow preview/confirm

L'ajout d'une annonce se fait en deux temps, en CLI comme en web :

1. **Preview** — Extraction des données depuis LeBonCoin (variante, couleur, jantes, accessoires, prix neuf)
2. **Vérification** — L'utilisateur peut corriger la couleur, retirer des accessoires, modifier la variante
3. **Confirm** — Sauvegarde en base avec recalcul automatique du prix neuf de référence

## Crawl et détection de reposts

Le système de crawl permet de scanner LeBonCoin et traiter les résultats par lot :

1. **Recherche** → récupère toutes les annonces Himalayan 450 en ligne
2. **Pré-check** → identifie celles déjà en base et les reposts potentiels (même ville + prix ±15%)
3. **Extraction** → pour chaque annonce sélectionnée, extraction complète avec détection de doublons
4. **Scoring de repost** (seuil 80 pts) : ville (+35), prix ±15% (+20), description similaire Jaccard (+25), accessoires similaires (+20), km proche (+15), annonce vendue (+10), même couleur (+5)
5. **Merge** → fusionne le repost avec l'annonce d'origine : marque l'ancienne comme vendue, copie l'historique de prix

## API REST

### Annonces

| Endpoint | Méthode | Description |
|---|---|---|
| `/api/ads` | GET | Liste les annonces (filtres : `variant`, `min_price`, `max_price`, `limit`, `offset`) |
| `/api/ads/{id}` | GET | Détail complet d'une annonce (accessoires, images, attributs) |
| `/api/ads` | POST | Ajouter une annonce via URL (sans preview) |
| `/api/ads/preview` | POST | Extraire une annonce sans sauvegarder (pour vérification) |
| `/api/ads/confirm` | POST | Sauvegarder une annonce après vérification/modification |
| `/api/ads/{id}` | PATCH | Modifier une annonce (couleur, variante, jantes, accessoires, sold) |
| `/api/ads/{id}` | DELETE | Supprimer une annonce |
| `/api/ads/merge` | POST | Fusionner un repost avec une annonce existante |
| `/api/ads/check-online` | POST | Vérifier si les annonces non vendues sont toujours en ligne |
| `/api/ads/{id}/check-online` | POST | Vérifier si une annonce est toujours en ligne |
| `/api/ads/{id}/price-history` | GET | Historique des prix (inclut les reposts) |

### Statistiques et classement

| Endpoint | Méthode | Description |
|---|---|---|
| `/api/stats` | GET | Statistiques agrégées (prix, km, variantes, départements, accessoires) |
| `/api/rankings` | GET | Classement par décote (prix effectif) |
| `/api/export` | GET | Télécharger le CSV |

### Catalogue accessoires

| Endpoint | Méthode | Description |
|---|---|---|
| `/api/accessory-catalog` | GET | Catalogue complet avec surcharges utilisateur |
| `/api/accessory-catalog/{group}` | PATCH | Surcharger le prix neuf d'un groupe d'accessoires |
| `/api/accessory-catalog/{group}/override` | DELETE | Réinitialiser au prix par défaut |
| `/api/accessories/refresh` | POST | Re-détecter les accessoires de toutes les annonces |
| `/api/ads/{id}/refresh-accessories` | POST | Re-détecter les accessoires d'une annonce |

### Crawl

| Endpoint | Méthode | Description |
|---|---|---|
| `/api/crawl/search` | GET | Lancer une recherche LeBonCoin et créer une session |
| `/api/crawl/sessions/active` | GET | Session de crawl active (la plus récente) |
| `/api/crawl/sessions/{id}/ads/{ad_id}` | PATCH | Mettre à jour le statut d'une annonce dans la session |
| `/api/crawl/sessions/{id}` | DELETE | Clôturer une session de crawl |
| `/api/crawl/sessions/{id}/ads/{ad_id}` | DELETE | Retirer une annonce de la session |
| `/api/crawl/extract` | POST | Extraire une annonce complète (avec diff et détection de doublons) |

## Catalogue des variantes (prix neuf France, mars 2026)

| Variante | Couleur | Jantes | Prix |
|----------|---------|--------|-----:|
| Base | Kaza Brown | Standard à rayons | 5 890 € |
| Pass | Slate Himalayan Salt | Standard à rayons | 5 990 € |
| Pass | Slate Poppy Blue | Standard à rayons | 5 990 € |
| Summit | Hanle Black | Standard à rayons | 6 190 € |
| Summit | Kamet White | Tubeless à rayons | 6 440 € |
| Summit | Hanle Black | Tubeless à rayons | 6 490 € |
| Mana Black Edition | Mana Black | Tubeless à rayons | 6 590 € |

## Catégories d'accessoires détectés

| Catégorie | Exemples |
|-----------|----------|
| Protection | Crash bars, protège-mains, sabot moteur, sliders, protège-carter, grille de phare |
| Bagagerie | Top case, valises latérales, sacoches, porte-bagages, platine, sac étanche |
| Confort | Selle rally, bulle, poignées chauffantes, repose-pieds, béquille centrale |
| Navigation | GPS, support téléphone, chargeur USB |
| Éclairage | Phares additionnels, antibrouillards, rampe LED |
| Esthétique | Clignotants LED, rétros bar-end, garde-boue, saute-vent |
| Performance | Échappement aftermarket, filtre à air, leviers réglables, kit chaîne, pneus |
| Autre | Antivol, alarme, housse, traceur GPS, kit rally |

## Dépendances

**Backend :**
- [lbc](https://github.com/etienne-hd/lbc) — Client non-officiel pour l'API LeBonCoin
- [FastAPI](https://fastapi.tiangolo.com/) + uvicorn — API REST
- [orjson](https://github.com/ijl/orjson) — Sérialisation JSON rapide
- Python 3.9+
- SQLite3 (inclus dans Python)

**Frontend :**
- React 19 + TypeScript + Vite
- Tailwind CSS v4
- TanStack Query v5
- React Router v7
- Recharts, framer-motion, Radix UI, Lucide icons
