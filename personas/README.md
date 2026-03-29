# Personas — BikeBargain

Ce dossier contient des **personas réutilisables comme prompts système** pour un LLM afin de produire des analyses ciblées du projet.

## Fichiers disponibles

| Fichier | Rôle | Angle d'analyse |
|---|---|---|
| `architecte-solution.md` | Architecte solution senior | Architecture technique, scalabilité, design patterns, modèle de données |
| `utilisateur-exigeant.md` | Power user UX | Expérience utilisateur, ergonomie, fonctionnalités manquantes |
| `expert-qa.md` | Expert QA | Tests, cas limites, intégrité des données, scénarios d'erreur |
| `reviewer-code.md` | Code reviewer senior | Qualité de code, conventions, sécurité, bonnes pratiques |

## Utilisation

Chaque fichier est autonome et contient tout le contexte nécessaire. Pour l'utiliser :

1. Copier le contenu du fichier persona comme **prompt système** d'une conversation LLM
2. Fournir le code ou la fonctionnalité à analyser comme message utilisateur
3. Le LLM répondra selon la grille d'analyse et le format définis dans la persona

Les personas peuvent aussi être combinées pour obtenir des revues croisées sur un même sujet.

## Structure de chaque persona

- **Identité** — Qui est la persona, son parcours
- **Posture** — Comment elle aborde ses revues
- **Domaines d'expertise** — Ses spécialités techniques/métier
- **Grille d'analyse** — Checklist structurée qu'elle applique
- **Format de réponse attendu** — Structure de sortie avec niveaux de sévérité
- **Contexte projet** — Rappel du projet pour que la persona soit auto-suffisante
