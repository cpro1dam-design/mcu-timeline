# Contrat des maquettes (Lot 2) — à lire avant d'écrire une ligne

> **Depuis le 2026-10-19**, le projet garde deux frises : A « Éphémérides » et C « Fil noir ». Les
> maquettes B et D sont rangées dans `maquettes_ecartees/` (hors du site publié). Le socle n'est plus figé :
> il évolue pour les deux frises à la fois (même coquille, mêmes commandes, `shared/js/versions.js` pour
> passer de l'une à l'autre).

Projet : site de fan **non officiel** sur l'univers cinématographique Marvel. Le socle commun (données
sourcées, coquille, ciel, fil, zoom, vue Archives) est **figé** : chaque maquette ne fait que dessiner sa
vue d'ensemble et son habillage. Une maquette = un dossier `site/concepts/<x>/` (`index.html`,
`<x>.css`, `<x>.js`) et **rien d'autre**. Ne modifiez jamais `site/shared/`, `data/`, `tools/` : si un
manque bloque, contournez localement et signalez-le dans votre rapport final.

Aperçu local (déjà lancé) : `http://localhost:8760/concepts/<x>/index.html?debug=1` (expose
`window.__app`). Références : les deux frises, `site/concepts/a-astrolabe/` et `site/concepts/c-horizon/` (la démo et le gabarit du Lot 2 sont archivés dans `maquettes_ecartees/socle-lot2/`).

## 1. Fichiers à produire

1. `index.html` : copie de la page d'une des deux frises (ou du gabarit archivé
   `maquettes_ecartees/socle-lot2/_template.html`, avec `{{CONCEPT}}`, `{{NOM}}`, `{{CSS}}` et `{{JS}}` remplacés).
   Ajouter la page à `STATIC_PAGES` dans `tools/build_site.py` (préchargement). Vous pouvez ajouter des éléments décoratifs
   (`aria-hidden="true"`, classe `frise-deco`) mais ne retirez **aucun identifiant** du gabarit.
2. `<x>.css` : typographie, couleur signature, disposition de la frise, mobile, contrastes forcés.
3. `<x>.js` : module ES qui appelle `bootConcept({...})` et dessine la frise à chaque `render`.

## 2. API de la coquille (`../../shared/js/shell.js`)

```js
import { bootConcept } from '../../shared/js/shell.js';
import { createThread } from '../../shared/js/thread.js';
import { branches, spiral, mainDate, sortWorks, dateToNumber } from '../../shared/js/layout.js';

bootConcept({
  concept: 'a',
  decorate(li, work, ctx) { /* facultatif : enrichir le <li> (classes, éléments aria-hidden) */ },
  layout(ctx) {
    ctx.on('render', ({ reason, transition }) => { /* placer les <li>, tracer le fil */ });
    ctx.on('focus', ({ id }) => { /* l'œuvre focalisée a changé (clavier) */ });
  },
});
```

`ctx` fournit :
- `ctx.data` : `{ works, characters, taxonomy, status }` (voir `docs/DATA_SCHEMA.md` ; champs sourcés
  `{v, src, ref}` → lire `.v`). Une œuvre : `id`, `slug`, `kind` (film|series|special), `title_fr.v`,
  `title_original.v/.lang`, `release.{fr,us,first}.{v,precision}`, `phase.v` (1–6, peut manquer),
  `saga.v`, `universe.v` (earth-616 | earth-828 | earth-10005), `story.v` (rang) + `story.provisional`,
  `order_release.v` (rang), `seasons[]`, `palette` `{sky, nebula[2], accent, band}`.
- `ctx.state` : `{ mode: 'phases'|'chronologie'|'personnages', order: 'release'|'story', series,
  character, focusId, listView }`.
- `ctx.visible()` : œuvres visibles, **déjà triées** dans l'ordre courant.
- Filtre saga / phase : barre toujours visible insérée par la coquille juste après Sortie / Histoire ([Toutes | Infini | Multivers], qui se déplie sur place en [‹ | Infini | I | II | III] ; boutons jamais recréés, le focus reste) ; « Vue liste » est rangée dans Réglages pour que l'en-tête tienne sur une ligne dès 1100 px ; appliquée dans `ctx.visible()` ; `ctx.state.phases` (Set), `ctx.isFiltered()`, adresse partageable `?phases=4,5,6`. Une maquette ne filtre jamais elle-même.
- Mode Phases : sans phase dépliée, `ctx.visible()` renvoie une pseudo-œuvre par phase (`kind: 'phase'`, `id: 'phase-N'`, `years`, `count`, `members`) que la maquette dessine comme une œuvre (son `<li>` existe dans `ctx.items`) ; un clic ou Entrée la déplie (`ctx.openPhase(n)`, `?phase=N`), Échap la replie ; `ctx.phaseWorks` (Map). Cartes de phase au-dessus de la frise (coquille).
- Mode Personnages : fiche du personnage, puis « Changer de personnage » (recherche) et la liste complète sur demande (coquille, dans `#champ-personnage`, que la maquette peut déplacer) ; `ctx.visible()` ne renvoie que ses œuvres (caméos seulement avec « Tout afficher ») ; `ctx.selectCharacter(id)`.
- Vue Archives, disposition Journal : carrousel d’affiches façon catalogue de streaming (l’œuvre au centre, voisines sur les côtés, défilement au doigt / à la molette / aux flèches, l’œuvre centrée devient l’œuvre affichée), titre et court synopsis dessous, fiche détaillée plus bas. Codex inchangé.
- Aperçu de la fiche : `createPreview()` (shared/js/preview.js) affiche une fiche miniature de l'œuvre choisie (pas des phases), avec un bouton vers les Archives.
- Recherche toujours visible dans l'en-tête, résultats groupés (Films, Séries et épisodes spéciaux, Personnages) : une œuvre ouvre ses Archives, un personnage passe en mode Personnages.
- Ciel : aucune animation autonome ; parallaxe au défilement de la page et de `#frise` (coquille) ; une maquette qui bouge autrement (rotation) appelle `ctx.skyCamera(x, y)`. Plus de bouton pause.
- Code couleur : `data/couleurs.css` (généré depuis taxonomy.json) donne `--phase-color` / `--saga-color` à tout élément portant `data-phase` / `data-saga` (les `<li class="node">` les ont déjà) ; `ctx.colorKey()` construit la légende. Le rouge reste réservé à l'action et à l'œuvre courante ; la couleur ne porte jamais seule l'information (chiffre romain ou nom à côté).
- `ctx.items` : `Map<id, li.node>` (le `<li>` contient `button.node__btn` > `.node__title`, `.node__meta`).
- `ctx.zoom.level` (0 sagas, 1 phases, 2 œuvres, 3 détail), `ctx.LEVELS`, `ctx.ROMAN`.
- `ctx.worksOfCharacter(id)` → `Set` ; `ctx.charName` ; `ctx.recurring`.
- `ctx.laneOf(work)` (0 = univers principal, ±1 = branches) ; `ctx.reducedMotion()`.
- `ctx.setCenterWork(id)` : à appeler quand l'œuvre au **centre de l'écran** change (défilement,
  panoramique, rotation) → le ciel prend sa teinte. `ctx.tintFor(id)` force une teinte.
- `ctx.focusWork(id)` ; `ctx.openArchive(id, opener)` ; `ctx.announce(texte)`.

La coquille gère déjà : modes (URL `?mode=`), ordre, séries, réglages et spoilers, pause du ciel,
vue liste (bouton + automatique ≤ 400 px de large / ≤ 420 px de haut), zoom (boutons, + − 0, pincement),
navigation clavier dans la liste (flèches, Début/Fin, Page préc./suiv.), ouverture de la vue Archives
au clic / Entrée, mise en évidence en mode Personnages (`.is-highlighted` / `.is-dimmed`).

### Placement des œuvres

Les `<li class="node">` sont en `position:absolute` dans `#frise` : placez-les avec
`li.style.setProperty('--x', …)` et `--y` (CSSOM : autorisé par la CSP ; **jamais** d'attribut `style`
écrit en HTML ni de `<style>`/`<script>` inline). Le fil : `createThread(svg, { treatment })` puis
`thread.set(pointsPrincipaux, branches, { reduced })` à chaque rendu (voir `demo.js`).
`#frise` peut défiler (horizontalement ou verticalement) ou être une carte : à vous de choisir.

## 3. Règles non négociables

- **Aucune donnée inventée.** N'affichez que les champs fournis. Pas d'année « dans l'histoire » :
  l'ordre de l'histoire est un **rang** (`story.v`) ; les échelles de temps ne valent qu'en ordre de sortie.
  Les placements provisoires (`story.provisional`) restent signalés.
- **Aucune requête tierce**, aucune police externe (polices déjà auto-hébergées dans
  `shared/css/fonts.css`), pas de CDN, pas de `innerHTML` avec des données : `textContent` uniquement.
- **CSP** : pas de script ni de style inline, pas d'`eval`.
- **Contrastes** : texte ≥ 4,5:1 (≥ 3:1 au-delà de 24 px ou 18,66 px gras) sur le fond le plus clair
  qu'il recouvre ; fil, liserés, bandes, contours de focus ≥ 3:1. Le texte posé sur le ciel doit être
  sur un panneau `rgb(11 13 23 / ≥ .80)`. Rouge #ED1D24 : grands textes et aplats uniquement
  (#FC5950 pour le petit texte).
- **Accessibilité** : la couche graphique (SVG, canvas, décors) est `aria-hidden` ; les `<li>` restent
  l'unique contenu interactif de la frise (un seul arrêt de tabulation, déjà géré) ; cibles ≥ 44 px ;
  focus visible partout (ne pas le masquer) ; rien ne clignote plus de 3 fois par seconde ;
  `prefers-reduced-motion` et `.is-reduced-motion` : pas de rotation, de zoom animé ni de parallaxe
  (fondus ≤ 200 ms) ; `@media (forced-colors: active)` : le fil reste visible (`CanvasText`) ;
  aucun verrouillage d'orientation ; pas de `user-scalable=no` ; Ctrl+molette jamais intercepté.
- **Vue liste** : en `.is-list-view`, la frise devient une liste lisible (règles déjà dans
  `concept.css`) ; masquez vos décors avec `.frise-deco`.
- **Interdits (clichés « geek »)** : Bebas/Anton seuls, Teko, Impact, polices comics, trames de points,
  habillages TVA/Stark/HUD, Pierres d'Infinité décoratives, compte à rebours, axe vertical à cartes
  alternées, plan de métro, étoiles ✦ décoratives, logo Marvel, « marvel » dans un nom.
- **Performance** : < 60 Ko de JS propre à la maquette, `requestAnimationFrame` pour les animations,
  pas de calcul de mise en page dans les boucles de défilement (lire les positions une fois).

## 4. Habillage de la vue Archives (commune)

Dans `<x>.css`, sur `.archives`, redéfinissez seulement : `--arch-font-display`, `--arch-font-text`,
`--arch-accent` (≥ 4,5:1 sur #0B0D17), `--arch-selected-bg`, `--arch-selected-fg`, `--arch-panel`.
Ne touchez pas à sa structure.

## 4 bis. Interface « appli » sur téléphone (maquettes A et C)

Activée par l'attribut `data-app` sur `<html>` et le seuil `APP_MQ` (`shared/js/appshell.js`, même valeur
dans `shared/css/app.css` et `archive.css`) : largeur ≤ 767 px, ou ≤ 1099 px et hauteur ≤ 520 px.
- **À l'écran** : barre du haut d'une ligne (nom, bouton `#btn-reglages`) ; ligne de contexte du mode
  (Chronologie : `.m-context` = ordre Sortie | Histoire, relais des boutons d'origine, et puce Filtre ;
  Phases : puces `.c-phasecards` ; Personnages : nom, nombre d'œuvres, « Changer » = liste plein écran
  avec sa recherche, « Fiche » = détail repliable) ; la frise ; barre d'onglets du bas (`.c-modes`, fixe :
  Phases, Chronologie, Personnages, `#btn-recherche`). Toucher un onglet ramène en haut.
- **Panneau Réglages** (`.m-sheet`, bas de l'écran) : ordre, filtre, niveau de détail, réglages, aide,
  mentions. Les éléments d'origine y sont **déplacés** (écouteurs conservés), puis remis en place au-delà
  du seuil : un seul jeu de commandes, rien à dupliquer dans les maquettes.
- **Recherche plein écran** (`.m-search`) : le champ `.c-search` y est déplacé ; un choix ferme d'abord
  la recherche (`app.settle()`), puis ouvre les Archives ou le personnage.
- **Historique** (`shared/js/overlays.js`) : chaque panneau ouvert ajoute une entrée ; le Retour du
  téléphone le ferme. Pendant le retour lancé par une fermeture, `overlayPop()` vaut vrai : la coquille et
  les Archives ignorent ce `popstate`, et l'adresse modifiée dans le panneau (filtre, personnage) est gardée.
- **Archives sur téléphone** : Retour en haut à gauche, Codex | Journal à droite, onglets dessous ; en
  bas, barre précédente / position (« Phase I · 3 / 6 ») / suivante ; mentions retirées de l'écran.
- **Maquette** : la frise ne doit pas passer sous la barre d'onglets : `ctx.bottomInset()` donne sa
  hauteur (A la retire de la hauteur du cadran ; C laisse le `padding-bottom` du `body`).
- **Piège** : un élément `position: absolute` (ex. `.visually-hidden`) dans une rangée qui défile
  s'échappe du défilement si aucun ancêtre dans la rangée n'est positionné : il élargit alors la page
  (sur téléphone, toute la fenêtre « dézoome »). Donner `position: relative` aux puces.

## 5. Définition de « terminé »

- Les 3 modes fonctionnent ; les 2 ordres (le fil se réorganise, branches Terre-828 / Terre-10005
  visibles) ; les 4 niveaux de zoom changent réellement l'affichage ; séries masquables.
- Ordinateur (1280 px) **et** mobile (375 px) conçus séparément ; pas de défilement horizontal de page
  non voulu ; tablette (768 px) correcte.
- `setCenterWork` appelé pendant la navigation (le ciel change de teinte).
- Aucune erreur console ; aucune requête hors de `localhost:8760`.
- Rapport final : ce qui est fait, ce qui manque, écarts au contrat, besoins sur le socle.
