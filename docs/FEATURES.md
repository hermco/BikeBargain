# BikeBargain - Fonctionnalites

## Vue d'ensemble

BikeBargain est un outil CLI + interface web pour scraper, stocker et analyser les annonces de motos d'occasion sur LeBonCoin. L'application permet de comparer objectivement les offres grace a un algorithme de classement qui calcule un **prix effectif** en tenant compte des accessoires, de l'usure des consommables et de la garantie restante.

L'application supporte plusieurs modeles de motos (multi-marque) et propose une interface bilingue FR/EN.

---

## 1. Classement intelligent des annonces

**Page : Rankings** (`/models/:slug/rankings`)

Le coeur de l'application. Chaque annonce recoit un **prix effectif** calcule selon la formule :

```
prix_effectif = prix_affiche
              - valeur_accessoires (occasion)
              + cout_usure_consommables
              + usure_mecanique (0.03 EUR/km)
              + risque_etat (0.04 EUR/km)
              - garantie_restante
```

Fonctionnalites :
- **Decomposition du score** : chaque composante est detaillee (accessoires individuels avec prix, consommables avec % d'usure)
- **Alertes court terme** : mise en evidence des consommables a remplacer dans les 3 000 km (pneus, chaine, plaquettes, vidange)
- **Filtre par variante** du modele
- **Estimation du temps de trajet** basee sur la distance a vol d'oiseau (haversine) avec code couleur par tranche
- **Annonces vendues** : restent dans le classement a leur position mais apparaissent en surbrillance attenuee
- **Verification en ligne** : bouton pour verifier en lot si les annonces sont toujours actives sur LeBonCoin (inaccessibles → marquees vendues)
- **Mise a jour des prix** : verification en lot des prix actuels sur LeBonCoin avec detection des variations depuis la derniere extraction

---

## 2. Gestion des annonces

**Page : Annonces** (`/models/:slug/ads`)

### Ajout d'annonces (workflow Preview/Confirm)

Que ce soit via le CLI ou l'interface web, l'ajout d'une annonce suit un processus en deux etapes :

1. **Preview** : extraction automatique des donnees depuis l'URL LeBonCoin (prix, km, variante, couleur, type de jantes, accessoires)
2. **Verification** : l'utilisateur revoit et corrige les informations detectees avant confirmation

### Liste et recherche

- Filtres : variante, recherche texte libre (ville, couleur, sujet, departement)
- Tri : prix, km, date de publication
- Carte par annonce avec photo, prix, km, variante, nombre d'accessoires

### Detail d'une annonce (`/models/:slug/ads/:id`)

- Galerie photo avec navigation clavier et mode lightbox
- Tous les attributs extraits de LeBonCoin
- **Mode edition** : correction de la couleur, variante, type de jantes, gestion des accessoires
- **Historique de prix** : timeline montrant les variations de prix a travers les republications
- Actions : rafraichir les accessoires, marquer vendue, supprimer

### Edition post-insertion

Les annonces deja enregistrees peuvent etre modifiees. Changer la variante, la couleur ou le type de jantes declenche un recalcul automatique du prix neuf de reference.

---

## 3. Crawl automatise

**Page : Recherche** (`/models/:slug/crawl`)

Workflow complet de recherche et d'import en masse depuis LeBonCoin :

1. **Recherche** : interroge LeBonCoin avec les mots-cles et la fourchette de cylindree du modele
2. **Apercu** : affiche les resultats avec miniatures, prix, localisation
3. **Extraction** : traitement annonce par annonce avec affichage des donnees extraites
4. **Vue diff** : si l'annonce existe deja en base, affiche les differences
5. **Decision** : confirmer, ignorer, ou fusionner (en cas de republication)

Fonctionnalites avancees :
- **Controles play/pause/skip** pour le traitement par lot
- **Mode selection manuelle** pour choisir quelles annonces extraire
- **Filtres** : afficher uniquement les nouvelles annonces, masquer les annonces neuves (pro)
- **Detection de changement de prix** : signale les annonces dont le prix a change depuis la derniere session
- **Gestion de session** : sauvegarde de l'etat, reprise possible, fermeture propre

---

## 4. Detection de republications et fusion

Le systeme detecte automatiquement les republications d'annonces grace a un **scoring multi-criteres** (seuil 80 pts) :

| Critere | Points |
|---------|--------|
| Meme ville | +35 |
| Prix dans une fourchette de +-15% | +20 |
| Similarite de description (Jaccard) | +25 |
| Accessoires en commun | +20 |
| Kilometrage proche | +15 |
| Annonce originale marquee vendue | +10 |
| Meme couleur | +5 |

Quand une republication est detectee :
- L'utilisateur peut **fusionner** la nouvelle annonce avec l'ancienne
- L'ancienne est marquee vendue, la nouvelle herite de l'historique de prix
- La **timeline de prix** montre l'evolution complete a travers les republications successives

---

## 5. Detection et valorisation des accessoires

### Detection automatique

- Matching par expressions regulieres sur la description de l'annonce
- Patterns configures en base de donnees, par modele de moto
- 8 categories : protection, bagagerie, confort, navigation, eclairage, esthetique, performance, autre
- **Patterns d'exclusion** : supprime les passages mentionnant les services garage avant la detection
- **Deduplication** : regroupement par `groupe_dedup` pour eviter les doublons (ex : "Crash bars SW-Motech" et "Crash bars" dans le meme groupe)

### Valorisation

- Chaque accessoire a un prix neuf de reference
- **Taux de depreciation** : les accessoires occasion valent 65% du prix neuf par defaut
- **Prix personnalisables** : l'utilisateur peut overrider le prix par groupe d'accessoires

### Crosscheck

Les annonces avec peu d'accessoires detectes malgre une longue description sont signalees (`needs_crosscheck`) pour une analyse manuelle — utile pour decouvrir des accessoires non couverts par le catalogue.

---

## 6. Catalogue d'accessoires editable

**Page : Accessoires** (`/models/:slug/catalog`)

Editeur complet du catalogue d'accessoires utilise pour la detection :

- **Groupes** : categories d'accessoires (protection, bagagerie, etc.) avec prix par defaut
- **Variantes** : accessoires individuels avec nom, qualificatifs, marques, alias, mots optionnels, prix
- **Compilateur de regex** : genere automatiquement les patterns a partir des champs structures
  - Gestion des synonymes (equivalences de qualificatifs et d'expressions)
  - Pluralisation francaise (eau/eaux, al/aux, etc.)
- **Preview regex** : test du pattern genere contre un texte echantillon
- **Test sur annonce** : verification du matching sur le texte reel d'une annonce
- **Preview diff** : simulation de l'impact des modifications du catalogue sur les accessoires detectes avant application
- **Actions globales** :
  - Rafraichir tous les accessoires (re-detection sur toutes les annonces) avec suivi de progression en arriere-plan
  - Export/import du catalogue (JSON)
  - Reset aux donnees par defaut

---

## 7. Suivi des prix

- **Historique de prix** par annonce : enregistrement de chaque changement de prix
- **Chaine de republications** : quand des annonces sont fusionnees, l'historique est consolide
- **Timeline visuelle** : affiche le prix initial, les prix successifs, les deltas et l'evolution totale
- **Detection de changement de prix** lors du crawl : signale les baisses/hausses significatives

---

## 8. Statistiques

**Page : Statistiques** (`/models/:slug/stats`)

- **KPIs** : nombre total d'annonces, prix moyen, kilometrage moyen, variante la plus courante
- **Histogramme des prix** (8 classes)
- **Histogramme des kilometres** (8 classes)
- **Repartition par variante** (camembert avec pourcentages)
- **Top 10 departements** (diagramme en barres)

---

## 9. Multi-modele

L'application supporte plusieurs modeles de motos simultanement :

- **Page d'accueil** (`/`) : grille de cartes par modele avec image, nom, nombre d'annonces et fourchette de prix
- **Auto-redirection** : quand un seul modele est configure, l'app redirige directement vers ses pages
- **Configuration par modele** en base de donnees :
  - Variantes (nom, couleur, type de jantes, prix neuf)
  - Consommables (nom, cout, duree de vie en km)
  - Patterns de detection (variante, accessoires, exclusions, annonces neuves)
  - Configuration de recherche (mots-cles, fourchette de cylindree)
  - Constantes de l'analyseur (garantie, usure mecanique)
- **Import de modele** : commande CLI `import-model` ou endpoint API `POST /api/bike-models/import` pour bootstrapper un nouveau modele depuis un fichier JSON
- **Clone de modele** : endpoint `POST /api/bike-models/{slug}/clone` pour dupliquer un modele existant avec toute sa configuration (variantes, accessoires, consommables, patterns, recherche)

---

## 10. Interface CLI

```bash
python main.py add <url> [<url2>...]      # Scraper et stocker des annonces
python main.py add -m himalayan-450 <url>  # Selection explicite du modele
python main.py list                         # Lister toutes les annonces
python main.py show <id>                    # Detail d'une annonce
python main.py stats                        # Statistiques agregees
python main.py export                       # Export CSV (aussi via GET /api/bike-models/{slug}/export)
python main.py import-model <file.json>     # Importer un modele (aussi via POST /api/bike-models/import)
python -m src.analyzer                      # Rapport de classement
```

Le CLI propose le meme workflow de verification que l'interface web : apercu, correction de la couleur, suppression d'accessoires, confirmation.

---

## 11. Internationalisation

L'interface web est disponible en **francais** et **anglais** via react-i18next. Toutes les chaines de texte utilisent des cles de traduction — aucun texte en dur dans les composants.

---

## 12. Architecture de deploiement

```
Frontend (Vercel) --> API (Railway) --> Service LBC (IP residentielle) --> LeBonCoin
                          |
                     PostgreSQL (Railway)
```

- **Frontend** : React 19 + Vite + Tailwind CSS v4, deploye sur Vercel
- **Backend** : FastAPI + SQLModel, deploye sur Railway
- **Base de donnees** : PostgreSQL (Docker en local, plugin Railway en production)
- **Service LBC** : micro-service FastAPI local pour contourner le blocage des IPs datacenter par Datadome. Tourne sur une machine avec IP residentielle, connecte via tunnel ngrok
- **Migrations** : Alembic, executees automatiquement au demarrage de l'API

---

## 13. Detection d'annonces neuves/pro

Le systeme identifie les annonces de professionnels et de motos neuves a deux niveaux :

- **Detection legere** (crawl) : 3 signaux rapides — type vendeur (pro), pattern dans le sujet, prix vs catalogue. Utilisee pour signaler les annonces neuves dans les resultats de recherche
- **Detection lourde** (extraction) : 8+ signaux conservateurs — signaux concessionnaire dans la description, kilometrage tres bas, prix proche du catalogue, listings multi-variantes/couleurs/jantes. Utilisee pour confirmer lors de l'extraction individuelle

Les patterns sont configures en base par modele (`BikeNewListingPattern`). Les annonces detectees sont signalees pendant le crawl avec un filtre pour les masquer.

---

## 14. Proxy de developpement multi-worktree

Pour le developpement en parallele sur plusieurs branches, un reverse proxy (`devproxy.py`) sert le frontend du worktree actif sur `localhost:3000`. Dashboard a `/_proxy/` pour switcher entre worktrees.
