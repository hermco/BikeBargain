# Himalayan 450 Analyzer

Outil d'analyse des annonces de seconde main pour la **Royal Enfield Himalayan 450** sur LeBonCoin.

## Fonctionnalites

- **Extraction** d'annonces LeBonCoin via un simple lien
- **Detection automatique** de la variante (Base / Pass / Summit / Mana Black), couleur et type de jantes
- **Detection des accessoires** mentionnes dans la description (60+ patterns)
- **Comparaison au prix neuf** de reference (catalogue France mars 2026)
- **Stockage SQLite** local avec historique
- **Export CSV** pour analyse dans un tableur
- **Statistiques** agregees (prix, km, repartition par variante, accessoires les plus courants)
- **Interface web** React avec dashboard, classement par decote, et gestion des annonces
- **API REST** FastAPI exposant toutes les fonctionnalites

## Installation

```bash
cd ~/Work/himalayan-450-analyzer
python3 -m venv .venv
source .venv/bin/activate
make install
```

## Usage

### Interface web (recommande)

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

## Structure du projet

```
himalayan-450-analyzer/
├── main.py                  # CLI principal
├── src/
│   ├── api.py               # API REST FastAPI
│   ├── database.py          # Schema SQLite et operations CRUD
│   ├── extractor.py         # Extraction LBC + detection variante/couleur
│   ├── analyzer.py          # Algorithme de scoring et classement
│   └── accessories.py       # Detection des accessoires (60+ patterns)
├── frontend/                # Interface React (Vite + TypeScript + Tailwind)
│   ├── src/
│   │   ├── components/      # Composants UI (cards, sidebar, filtres, etc.)
│   │   ├── pages/           # Pages (annonces, detail, stats, classement)
│   │   ├── hooks/           # TanStack Query hooks
│   │   ├── lib/             # Client API et utilitaires
│   │   └── types.ts         # Types TypeScript
│   └── ...
├── Makefile                 # dev / install / build
├── modeles-prix-neuf.md     # Catalogue des prix neuf de reference
├── himalayan_450.db         # Base SQLite (generee automatiquement)
├── requirements.txt
└── README.md
```

## API REST

| Endpoint | Methode | Description |
|---|---|---|
| `/api/ads` | GET | Liste les annonces (filtres : `variant`, `min_price`, `max_price`) |
| `/api/ads/{id}` | GET | Detail complet d'une annonce |
| `/api/ads` | POST | Ajouter une annonce via URL (`{"url": "..."}`) |
| `/api/ads/{id}` | DELETE | Supprimer une annonce |
| `/api/stats` | GET | Statistiques agregees |
| `/api/rankings` | GET | Classement par decote |
| `/api/export` | GET | Telecharger le CSV |

## Catalogue des variantes (prix neuf France)

| Variante | Couleur | Jantes | Prix |
|----------|---------|--------|-----:|
| Base | Kaza Brown | Standard | 5 890 EUR |
| Pass | Slate Himalayan Salt | Standard | 5 990 EUR |
| Pass | Slate Poppy Blue | Standard | 5 990 EUR |
| Summit | Hanle Black | Standard | 6 190 EUR |
| Summit | Kamet White | Tubeless | 6 440 EUR |
| Summit | Hanle Black | Tubeless | 6 490 EUR |
| Mana Black | Mana Black | Tubeless | 6 590 EUR |

## Categories d'accessoires detectes

| Categorie | Exemples |
|-----------|----------|
| Protection | Crash bars, protege-mains, sabot moteur, sliders |
| Bagagerie | Top case, valises laterales, sacoches, porte-bagages |
| Confort | Selle rally, bulle, poignees chauffantes, repose-pieds |
| Navigation | GPS, support telephone, chargeur USB |
| Esthetique | Feux additionnels, clignotants LED, retros bar-end |
| Performance | Echappement aftermarket, filtre a air, leviers reglables |
| Autre | Antivol, housse, kit rally, traceur GPS |

## Dependances

**Backend :**
- [lbc](https://github.com/etienne-hd/lbc) - Client non-officiel pour l'API LeBonCoin
- [FastAPI](https://fastapi.tiangolo.com/) + uvicorn - API REST
- Python 3.9+
- SQLite3 (inclus dans Python)

**Frontend :**
- React 19 + TypeScript + Vite
- Tailwind CSS v4
- TanStack Query v5
- Recharts, framer-motion, Radix UI
