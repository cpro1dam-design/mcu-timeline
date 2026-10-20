# Frise MCU (nom provisoire)

Site de fan **non officiel et non commercial** qui donne une forme visuelle à l’univers
cinématographique Marvel : une frise d’œuvres reliées par un fil noir, par phase, dans l’ordre de
l’histoire ou par personnage.

Deux frises, sur les mêmes données et le même socle : **Éphémérides** (un cadran,
`site/concepts/a-astrolabe/`) et **Fil noir** (une frise horizontale, verticale sur téléphone,
`site/concepts/c-horizon/`). On passe de l’une à l’autre depuis Réglages ; la page `site/hub/` les présente.

**Aucune information n’est rédigée à la main** : tout vient de sources citées (Wikidata, Wikipédia
en français, TMDB) et chaque fiche affiche ses sources. Voir [docs/DATA_SCHEMA.md](docs/DATA_SCHEMA.md) ;
l'interface (couleurs, polices, composants, tailles d'écran) est décrite dans [docs/DESIGN.md](docs/DESIGN.md).

## Démarrer en local

Prérequis : Python 3.7 ou plus récent (`py` sous Windows), Pillow.

```bash
py -3 -X utf8 tools/update.py        # récupère les données (Wikidata, Wikipédia FR)
py -3 -X utf8 tools/check_data.py    # contrôles : 0 = publiable
py -3 -X utf8 tools/build_site.py    # génère site/
py -3 -X utf8 tools/serve.py         # http://127.0.0.1:8760/
```

Le site doit être servi en HTTP (pas en double-cliquant sur un fichier `file://`).

## Activer TMDB (accroches, affiches, ordre des génériques)

1. Créez vous-même un compte sur [themoviedb.org](https://www.themoviedb.org/) et une clé d’API
   (usage non commercial).
2. Copiez le jeton « API Read Access Token » dans `tools/tmdb_key.txt` (ce fichier est ignoré par git ;
   modèle : `tools/tmdb_key.example.txt`).
3. Lancez `py -3 -X utf8 tools/pipeline/fetch_tmdb.py`, puis `tools/build_site.py`.

Les données et affiches TMDB restent **hors git** (`data/tmdb/`, `site/media/tmdb/`) : les conditions
de TMDB limitent leur conservation à 6 mois ; la tâche automatique les rafraîchit chaque semaine.

## Versions

**V1.0** (20 octobre 2026) : première mise en ligne ; le détail et les versions suivantes sont dans
[CHANGELOG.md](CHANGELOG.md). Chaque version porte une étiquette git (`v1.0`, `v1.1`…).

## Mise en ligne et mise à jour automatique (GitHub)

Le fichier [.github/workflows/site.yml](.github/workflows/site.yml) est prêt mais inactif tant que le
dépôt n’existe pas sur GitHub. La marche à suivre pas à pas est dans
[docs/MISE_EN_LIGNE.md](docs/MISE_EN_LIGNE.md) ; en bref :

1. créer un dépôt **public** (condition de GitHub Pages gratuit) et y pousser ce projet ;
2. Settings → Pages → Source : « GitHub Actions » ;
3. Settings → Secrets → Actions : `TMDB_TOKEN` ; Variables : `FRISE_CONTACT` (URL du dépôt) ;
4. `site.config.json` : `base_url`, `repo_url` et la formule des mentions légales (`editor` : anonyme, choix du 20 octobre 2026).

Chaque lundi, la tâche récupère les nouveautés, lance les contrôles et ne publie que s’ils
réussissent ; sinon elle ouvre un ticket et la version précédente reste en ligne. GitHub désactive
les tâches planifiées d’un dépôt sans activité depuis 60 jours : le commit hebdomadaire de
`data/build/status.json` maintient l’activité ; à défaut, réactiver le workflow dans l’onglet Actions.

## Tester la croissance (simulation)

`tools/stress_fixture.py` fabrique une copie du site avec des œuvres fictives ajoutées au rythme
voulu, pour voir comment les frises tiennent dans quelques années (sans toucher aux vraies données ;
la copie n'emporte ni `site/media/` ni données TMDB) :

```bash
py -3 -X utf8 tools/build_site.py --no-tmdb
py -3 -X utf8 tools/stress_fixture.py --out ../site-stress --ans 20 --par-an 7
py -3 -X utf8 tools/serve.py --dir ../site-stress --port 8761
```

Avec 20 ans à 7 sorties par an : 188 œuvres, 5 sagas, phases I à XIV. Dans Éphémérides, un cadran
porte deux sagas (trois cadrans), réunis en orbite dans le grand cadran.

## Arborescence

| Dossier | Rôle |
|---|---|
| `data/curated/` | seules saisies humaines, chacune avec sa source (périmètre, ordre de l’histoire, univers) |
| `data/build/` | données sourcées générées par `tools/update.py` (versionnées) |
| `tools/` | pipeline Python, contrôles, génération du site, serveur local |
| `site/` | racine publiée (CSS/JS partagés, les deux frises, pages générées) |
| `maquettes_ecartees/` | maquettes B et D du Lot 2, mises de côté (sur l’ordinateur seulement, hors du dépôt) |

## Licences

Code : MIT ([LICENSE](LICENSE)). Textes issus de Wikipédia : CC BY-SA 4.0
([LICENSES/](LICENSES/)). Données Wikidata : CC0.
