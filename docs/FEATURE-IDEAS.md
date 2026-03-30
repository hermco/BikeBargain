# BikeBargain - Idees de features

Brainstorm du 2026-03-30 — deux perspectives : Product Manager et Utilisateur.

---

## Convergences fortes (les deux perspectives s'alignent)

- **Vue comparative** — PM et user la veulent
- **Carte geographique** — visualisation spatiale manquante
- **Partage d'analyse** — levier viral (PM) + besoin quotidien (user)
- **Auto-crawl + alertes** — retention (PM) + gain de temps (user)
- **Arguments de negociation** — differenciateur produit (PM) + valeur directe (user)

---

## Perspective Product Manager

### Quick wins (S) — exploitent des donnees deja calculees

| # | Feature | Description | Impact | Taille |
|---|---------|-------------|--------|--------|
| 1 | Deal Score visuel | Note de A+ a D sur chaque annonce, calculee depuis le prix effectif vs. moyenne marche pour variante/km/annee similaires | High | S |
| 2 | Generateur d'arguments de negociation | Liste auto de points de negociation : consommables a remplacer, sous-equipement, surpoids vs. comparables, duree en ligne | High | S |
| 3 | Time on Market | Duree de mise en ligne comme signal de negociation (30+ jours = vendeur potentiellement flexible) | Medium | S |
| 4 | Vue comparative | Selection de 2-3 annonces, tableau comparatif structure : prix, prix effectif, accessoires, usure, garantie, localisation, images | Medium | S |

### Features medium (M)

| # | Feature | Description | Impact | Taille |
|---|---------|-------------|--------|--------|
| 5 | Estimateur de prix marche | "Combien vaut ma moto ?" — donner variante, km, annee, accessoires, localisation et obtenir un prix marche estime. Elargit l'audience au-dela des gens qui ont deja une URL | Very High | M |
| 6 | Carte geographique | Toutes les annonces actives sur une carte de France, colorees par qualite du deal, avec clustering par zoom. Revele les patterns geographiques | High | M |
| 7 | Courbes de depreciation | Prix vs. age et prix vs. km par variante, avec l'annonce courante positionnee sur la courbe | Medium | M |
| 8 | Rapport d'analyse partageable | Lien public ou PDF pour une annonce : position ranking, breakdown prix effectif, accessoires, usure, garantie, historique prix. Levier viral | High | M |
| 9 | Auto-crawl programme | Recherches LeBonCoin sur schedule configurable (ex: toutes les 6h). Prerequis pour les alertes et pour un dataset historique complet | High | M |
| 10 | Bot Telegram/Discord | Push d'alertes deals, resumes quotidiens, price checks on-demand. Cible les communautes moto actives sur ces canaux | Medium | M |

### Features large (L/XL)

| # | Feature | Description | Impact | Taille |
|---|---------|-------------|--------|--------|
| 11 | Alertes prix + watchlists | Criteres sauvegardes (variante, prix max, km max, rayon) avec notifications quand une annonce match ou baisse de prix | Very High | L |
| 12 | Comptes utilisateurs | Auth legere (email/OAuth) pour sauvegarder favoris, watchlists, preferences. Enabler pour retention et personnalisation | High | L |
| 13 | Intelligence vendeur | Identifier les vendeurs recurrents (tel, localisation, patterns) pour distinguer pros deguises des particuliers. Tracking comportement prix | High | L |
| 14 | Scraping multi-plateformes | ParuVendu, Facebook Marketplace, Moto-Occasion. Chaque plateforme = nouveau scraper + normalisation + dedup cross-plateforme | Very High | XL |

---

## Perspective Utilisateur

### Must-have

| # | Feature | User story | Pain point |
|---|---------|------------|------------|
| 1 | Favoris / Shortlist | Je veux star/bookmarker des annonces dans une shortlist pour acceder rapidement a mes 3-5 candidats finaux | Impossible d'isoler mes candidats sans ouvrir plusieurs onglets |
| 2 | Notes personnelles | Je veux attacher des notes libres a une annonce ("vendeur flexible", "verifier rouille cadre", "avis mecano : eviter cette annee") | Le contexte des appels/visites/avis se perd entre les sessions |
| 3 | Comparaison cote a cote | Je veux selectionner 2-3 annonces et les comparer dans une vue dediee avec tous les breakdowns | Pas moyen de voir 2 analyses detaillees simultanement |
| 4 | Dashboard baisses de prix | Je veux une vue consolidee de tous les changements de prix recents, pas juste l'historique par annonce | Pas de dashboard "Ad X a baisse de 300 EUR hier" |
| 5 | Notifications nouvelles annonces | Je veux etre notifie (push, email, Telegram) quand une annonce matchant mes criteres apparait | Les bonnes affaires partent vite, le crawl est 100% manuel |
| 6 | Toggle "masquer vendus" persistant | Je veux un toggle persistant pour masquer les annonces vendues du ranking et de la liste | 1/3 de l'ecran occupe par des annonces non achetables |

### Nice-to-have

| # | Feature | User story | Pain point |
|---|---------|------------|------------|
| 7 | Filtres sauvegardes | Je veux sauvegarder des combinaisons de filtres nommees et les appliquer en un clic | Les filtres se reinitialisent a chaque visite |
| 8 | Helper de negociation | Je veux voir un prix cible suggere pour chaque annonce, base sur l'analyse effective price + couts court terme + moyenne marche | Le ranking ne dit pas directement "propose X EUR" |
| 9 | Partage d'analyse | Je veux generer un lien ou PDF de l'analyse complete d'une annonce pour l'envoyer a mon mecanicien | Oblige de screenshoter pour partager une analyse |
| 10 | Vue carte | Je veux voir toutes les annonces sur une carte centree sur ma position, colorees par qualite du deal | Pas de vision des clusters geographiques pour planifier des visites groupees |
| 11 | Scatter plot prix/km | Je veux un nuage de points prix vs. km (et prix vs. annee) avec couleur par deal quality dans les stats | La correlation prix-kilometrage est invisible dans les histogrammes separes |
| 12 | Suivi contacts vendeurs | Je veux enregistrer que j'ai contacte un vendeur (date, canal, reponse) pour tracker mes negociations en cours | Pas de tracking des negociations, je me fie a ma memoire |

### Dream

| # | Feature | User story | Pain point |
|---|---------|------------|------------|
| 13 | Auto-crawl schedule | Je veux programmer des crawls automatiques (ex: toutes les 6h) qui tournent en arriere-plan | Le workflow crawl est entierement manuel |
| 14 | Projection cout total de possession | Je veux voir le cout total projete a 1 an et 3 ans (achat + consommables a venir + depreciation) | L'effective price ne couvre pas l'apres-achat |
| 15 | Swipe gestures mobile | Je veux swiper gauche pour ignorer une annonce et droite pour la favoriser sur mobile | Le triage mobile est trop lent avec des petits boutons |
