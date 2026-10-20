# Schéma des données (version 1)

Règle absolue : **aucun fait n'est rédigé à la main ni généré**. Chaque valeur affichée est un objet
« sourcé » :

```json
{ "v": <valeur>, "src": "wikidata|frwiki|tmdb|curated|derived", "ref": "<référence précise>", "at": "AAAA-MM-JJ" }
```

| `src` | `ref` attendu | Licence |
|---|---|---|
| `wikidata` | `Q192724#P577` (élément + propriété) | CC0 |
| `frwiki` | `frwiki:<titre>@<revid>#<section>` | CC BY-SA 4.0 (attribution + « modifié ») |
| `tmdb` | `tmdb:movie/1726` ou `tmdb:tv/84958` | CGU TMDB (non versionné, ≤ 6 mois) |
| `curated` | URL de la source citée dans `data/curated/*.json` | selon la source |
| `derived` | nom de la règle (`rule:saga-from-phase`) | — |

`check_data.py` refuse tout champ affiché sans `src` et `ref`.

## Couches de fichiers

| Dossier | Contenu | Versionné | Écrit par |
|---|---|---|---|
| `data/curated/` | `taxonomy.json`, `scope.json`, `story_order.json`, `overrides.json`, `slugs.json` | oui | humain (chaque entrée sourcée) ; `slugs.json` complété automatiquement mais jamais modifié |
| `data/build/` | `works.json`, `characters.json`, `status.json` | oui | `tools/update.py` |
| `data/tmdb/` | `tmdb.json` (+ affiches dans `site/media/tmdb/`) | **non** | `tools/pipeline/fetch_tmdb.py` |
| `data/cache/` | réponses HTTP brutes | non | `tools/pipeline/http.py` |
| `site/data/` | `works.json` + `characters.json` + `taxonomy.json` fusionnés avec TMDB, `manifest.json` | non | `tools/build_site.py` |

## `data/build/works.json`

```json
{
  "schema_version": 1,
  "generated_at": "2026-10-14T21:00:00Z",
  "works": [ {
    "id": "Q192724",
    "slug": "iron-man",
    "kind": "film | series | special",
    "title_fr":       { "v": "Iron Man", "src": "frwiki", "ref": "frwiki:Iron Man (film, 2008)@<revid>#0", "at": "…" },
    "title_original": { "v": "Iron Man", "lang": "en", "src": "wikidata", "ref": "Q192724#P1476", "at": "…" },
    "release": {
      "fr": { "v": "2008-04-30", "precision": "day|month|year", "src": "wikidata", "ref": "Q192724#P577", "at": "…" },
      "us": { "v": "2008-05-02", "precision": "day", "src": "wikidata", "ref": "Q192724#P577", "at": "…" },
      "first": { … }            // première date connue, tous pays confondus (repli)
    },
    "phase":   { "v": 1, "src": "wikidata", "ref": "Q192724#P179", "at": "…" } | null,
    "saga":    { "v": "infinity", "src": "derived", "ref": "rule:saga-from-phase", "at": "…" } | null,
    "universe":{ "v": "earth-616", "src": "derived|curated", "ref": "rule:default-universe | <url>", "at": "…" },
    "story":   { "v": 3, "provisional": false, "src": "curated", "ref": "<url de la référence>", "at": "…" },
    "frwiki":  { "title": "Iron Man (film, 2008)", "revid": 123, "rev_timestamp": "…", "url": "https://fr.wikipedia.org/w/index.php?oldid=123" } | null,
    "presentation": { "v": ["paragraphe…"], "src": "frwiki", "ref": "frwiki:…@123#0", "at": "…", "modified": true } | null,
    "plot":         { "v": ["paragraphe…"], "src": "frwiki", "ref": "frwiki:…@123#Synopsis", "at": "…", "modified": true, "spoiler": "work" } | null,
    "directors": [ { "v": "Jon Favreau", "id": "Q295964", "src": "wikidata", "ref": "Q192724#P57", "at": "…" } ],
    "runtime_min": { "v": 126, "src": "wikidata", "ref": "Q192724#P2047", "at": "…" } | null,
    "tmdb": { "v": 1726, "type": "movie|tv", "src": "wikidata", "ref": "Q192724#P4947", "at": "…" } | null,
    "discovery": ["wikidata", "frwiki"],
    "conflicts": [ { "field": "release.fr", "values": [ … ], "note": "…" } ]
  } ]
}
```

- `kind` : `film` (P31 film / projet de film), `series` (série, mini-série, série animée), `special`
  (téléfilm spécial, « Marvel Studios Special Presentation »).
- Le **statut** (sorti / à venir / date à confirmer) n'est **pas** stocké : il est calculé dans le navigateur à
  partir de `release` (fuseau Europe/Paris), pour rester juste sans reconstruction.
- `story.provisional = true` : œuvre absente de `curated/story_order.json` ; placée juste après l'œuvre sortie
  précédente (ordre de sortie) avec le badge « Place dans l'histoire à confirmer ».

## `data/build/characters.json`

```json
{
  "schema_version": 1,
  "characters": [ { "id": "Q…", "name": { "v": "Tony Stark", "src": "wikidata", "ref": "Q…#label", "at": "…" } } ],
  "actors":     [ { "id": "Q…", "name": { "v": "Robert Downey Jr.", "src": "wikidata", "ref": "Q…#label", "at": "…" } } ],
  "appearances": [ {
    "work": "Q192724", "actor": "Q…", "character": "Q…" | null,
    "role": { "v": "Tony Stark", "src": "wikidata|tmdb", "ref": "…", "at": "…" },
    "level": { "v": "principal|secondaire|cameo" | null, "src": "tmdb|wikidata", "ref": "…", "rule": "…", "at": "…" }
  } ]
}
```

Règles de niveau (affichées sur la page « Méthode ») :
- **principal** : rang au générique TMDB ≤ 6 ;
- **secondaire** : crédité au-delà ;
- **caméo / non crédité** : qualificatif Wikidata P3831 = Q16582801 (non crédité) ou Q191796 (caméo), ou
  mention « uncredited » sur TMDB ;
- sinon `null` (« niveau non renseigné »). Jamais de déduction manuelle.

## `data/build/status.json`

```json
{ "schema_version": 1, "checked_at": "…",
  "sources": { "wikidata": { "ok": true, "at": "…" }, "frwiki": { … }, "tmdb": { "ok": false, "reason": "pas de clé" } },
  "counts": { "works": 70, "films": 40, "series": 28, "specials": 2 },
  "quarantine": [ { "id": "Q…", "label": "…", "signals": ["wikidata"], "reason": "une seule source" } ],
  "conflicts": [ … ] }
```

## Fichiers `data/curated/`

- `taxonomy.json` : sagas, phases (QID Wikidata + source), univers, niveaux, palettes de repli par phase
  (choix de design, pas des faits).
- `scope.json` : règle d'inclusion + `include` / `exclude` (chaque entrée : `id`, `reason`, `source`).
- `story_order.json` : `reference` (titre, URL, date de relevé) + `order` (liste de QID).
- `overrides.json` : `universes` et `fields` (chaque entrée : `work`, valeur, `source` URL, `quote` courte).
- `slugs.json` : `{ "Q192724": "iron-man" }`, figé une fois créé.
