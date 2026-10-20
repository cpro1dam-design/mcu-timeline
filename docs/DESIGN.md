# Design de la Frise MCU

Référence de l'interface telle qu'elle est codée : couleurs, polices, composants, mouvements et
tailles d'écran. Les valeurs viennent des feuilles de style (`site/shared/css/`, `site/concepts/*/`).
Si le code change, ce document suit. Les règles de données sont dans [DATA_SCHEMA.md](DATA_SCHEMA.md).

## Principes

- **La frise d'abord.** Le reste (fiche, réglages, marques) la complète sans la couvrir.
- **Rouge, blanc, noir**, comme le logo Marvel. Le rouge est réservé à l'action et au repère (aiguille,
  index, bouton choisi). Le ton reste sobre, « pas geek ».
- **Ciel étoilé et fil noir** dans les deux frises. Le ciel n'a pas d'animation autonome : il bouge
  seulement avec le défilement ou la rotation (parallaxe).
- **Pas de doublon.** Une information n'est affichée qu'à un endroit par écran.
- **Rien d'inventé.** Chaque texte affiché vient d'une source citée. Sans affiche TMDB, on affiche une
  affiche provisoire dessinée (`affiche.js`), jamais une image tirée d'ailleurs.

## Couleurs

Jetons communs (`base.css`, `:root`) ; le fond est toujours sombre (`color-scheme: dark`).

| Jeton | Valeur | Usage |
|---|---|---|
| `--bg` | `#08080B` | fond |
| `--bg-2` / `--surface` | `#111116` / `#16161C` | cases, panneaux |
| `--line` | `#2C2C35` | filets |
| `--fg` / `--fg-2` / `--fg-3` | `#F5F3EF` / `#B3B3BC` / `#8F8F9A` | texte, texte secondaire, discret |
| `--red` | `#E3262E` | aplats, aiguille, grands titres (blanc dessus : 4,6:1) |
| `--red-text` | `#FF5A5F` | petit texte rouge, liserés fins (6,5:1 sur `--bg`) |
| `--seen` / `--seen-ink` | `#3FCF6E` / `#04130A` | œuvre vue (vert, 9,9:1 sur `--bg`) et texte posé dessus |
| `--watch` | `#F5F3EF` | œuvre à voir (cerclée d'ivoire) |
| `--focus` | `#FFFFFF` | contour de focus |

**Code couleur des sagas et phases** : défini dans `data/curated/taxonomy.json` (champs `color`,
`color_name`), contrôlé par `check_data.py` (contrastes), publié en `site/data/couleurs.css`
(`[data-phase]` → `--phase-color`, `[data-saga]` → `--saga-color`).

| Saga | Couleur | Phases |
|---|---|---|
| La Saga de l'Infini | or `#F2B33D` | I or pâle `#F7D774` · II ambre `#F2A93B` · III cuivre `#EC7A3C` |
| La Saga du Multivers | bleu `#6FA8FF` | IV turquoise `#5ED6C8` · V bleu `#5B98FA` · VI lavande `#C3A6FF` |

Une nouvelle saga ou phase reçoit sa couleur dans `taxonomy.json`, avec un nom de couleur lisible.

## Polices

Toutes auto-hébergées (`site/shared/fonts/`, licence OFL, `tools/fetch_fonts.py`), déclarées dans
`fonts.css`. Les pages générées (accueil, fiches, pages légales) utilisent les polices du système.

| Frise | Titres | Texte |
|---|---|---|
| Éphémérides | Archivo (étroite) | Newsreader |
| Fil noir | Antonio | Inter, et Instrument Serif italique pour les dates |

Les polices du premier écran sont préchargées par `build_site.py` (`STATIC_PAGES`).

## Les deux frises

**Éphémérides** (`concepts/a-astrolabe/`) : un cadran. Les œuvres en cercle, une phase par secteur,
la saga en anneau ; un index rouge en haut désigne l'œuvre lue. Fil : un trait rouge fin et un ruban
de la couleur de la phase.
- Grand écran (≥ 1100 px) : colonne gauche (panneau Cadran, légende), cadran au centre, aperçu de la
  fiche à droite ; boutons ◀ ▶ ronds de part et d'autre du cadran.
- Téléphone : arc du cadran en bas, tourné au pouce ou avec ◀ ▶ ; l'affiche et le titre au-dessus.
- **Deux sagas par cadran** (Chronologie, sans filtre ; choix du 2026-10-20, trois sagas essayées : trop
  chargé) : un cadran porte deux sagas, une par anneau ; toutes les deux sagas, un nouveau cadran s'ajoute. Dès deux
  cadrans, le **grand cadran** (« Tous les cadrans », adresse sans `?cadran`) les réunit en petit, **en
  orbite, sans repère** : le cadran choisi (◀ ▶, flèches) vient en haut, grandit, liseré rouge, et il est
  décrit au centre (sagas, phases, années, nombre d'œuvres) ; chaque petit cadran montre ses sagas en
  anneaux teintés, la spirale des œuvres et son fil. Choisir un cadran y plonge (View Transitions,
  depuis son petit cadran) ; Échap ou « Tous les cadrans » en ressort ; au bout d'un cadran, ◀ ▶ passent
  au voisin (le cadran tourne d'un cran). Barre `.astro-plates` « Cadran » (un bouton par cadran :
  nom, années, sagas), adresse `?cadran=N`. Aujourd'hui (deux sagas) : un seul cadran, sans grand
  cadran. Modes Phases et Personnages : un seul cadran, un anneau par saga.
- **Points des œuvres** (2026-10-20, « pas assez gros ») : 17 px (23 px pour l'œuvre au centre et les
  phases repliées, 11 px vue « sagas »), liseré 2,5 px ; étiquettes à 5 px du point, et celles des
  œuvres les plus proches de l'index passent au-dessus des points voisins (`--nz`, `updateNear`).
- **Séparation des sagas** (2026-10-20, « pas assez voyante ») : anneaux teintés de la couleur de leur
  saga, et entre deux anneaux un trait ivoire en tirets posé sur un sillon sombre (`.astro-sep`,
  `.astro-sep-gap`).
- **Peu d'œuvres** (personnage, phase dépliée : moins d'un tour) : réparties sur tout le tour (trois
  œuvres à 0°, 120° et 240°), plus jamais alignées.
- **Mode Phases** : pas de libellés de phase sous la saga (les phases repliées les portent déjà).

**Fil noir** (`concepts/c-horizon/`) : une frise horizontale sur une bande d'horizon claire, aiguille
rouge au centre, sol-miroir avec les phases et de petites affiches ; verticale sur téléphone (fil à
gauche, une carte par œuvre).
- Arrivée sur ordinateur en vue d'ensemble ajustée à la largeur ; molette = zoom sous le pointeur.
- Titres de saga à la mesure de leur travée, verticaux si la travée est trop étroite ; libellés
  d'années calculés sur leur largeur réelle (une année sur deux ou trois si la place manque).
- L'œuvre sélectionnée et la phase active prennent la couleur de leur phase ; seule l'aiguille reste rouge.
- Téléphone : chaque saga ouvre sur un en-tête marqué (filet de 4 px de sa couleur, fond teinté, titre
  plus grand, grande marge au-dessus) ; en mode Phases, les cartes de phase n'ont plus de surtitre de saga.

## Composants communs

- **En-tête** : nom de la frise, Phases · Chronologie · Personnages, recherche, Sortie | Histoire,
  filtre des sagas, bouton œil « Vus et à voir », Réglages. Sur une ligne dès ≈ 1180 px.
- **Réglages** : vignettes miniatures des deux frises (passer de l'une à l'autre en gardant sa place),
  niveau de détail, « J'ai vu jusqu'à… », aide, et un lien « Versions à comparer » (page `comparer.html`).
- **Vus et à voir** : fenêtre plein écran (en-tête collant), filtre de la frise avec compteurs,
  « Tout vu » / « Tout à voir » par phase, « Sauvegarder ou transférer mes marques » (fichier ou lien
  `#marques=`). Mêmes marques partout : liste d'accueil, fiches, Archives (`marks.js`).
- **Archives** (fiche d'une œuvre, `archive-view.js`) : `<dialog>` plein écran, onglets Chronologie |
  Personnage, dispositions Codex (liste à gauche) ou Journal (carrousel d'affiches) ; boutons « Vu » /
  « À voir » sous le titre ; intrigue toujours sur demande ; apparitions en cases à monogramme
  (initiales, anneau aux couleurs des phases du personnage).
- **Œuvre vue** dans la liste d'accueil : toute la case en surbrillance verte (choix du 2026-10-20).
- **Affiches dans la liste d'accueil** (2026-10-20) : une affiche à gauche de chaque carte et dans
  « Prochaine sortie » (TMDB si le pipeline l'a, sinon l'affiche provisoire dessinée des frises :
  `poster_html` dans `build_site.py`, composition par `phVars` d'`affiche.js` ; bloc `.c-affiche`
  dans `base.css`). Décoratives : le titre est écrit à côté.
- **Mode Phases** : Sortie | Histoire masqué (en-tête, panneau du téléphone) ; l'ordre y est toujours
  celui de la sortie, et le choix de l'utilisateur est gardé pour les autres modes (`state.orderPref`).
- **Œuvres d'un autre univers** (Terre-828, Terre-10005 ; choix du 2026-10-20 : **losange**, la
  version « portail », un anneau en tirets, est écartée) : couleur à part `--uni` (fuchsia #E879F9 ;
  `--uni-ink` #A21CAF sur la bande claire), un losange plein à la place du point, nom de l'univers
  écrit, branche du fil en tirets fuchsia ; dans Fil noir, la carte est décalée avec un bord plein. Sur la frise horizontale de Fil noir, le nom est au bout de la branche (`.c-uni`) et
  dans la pièce exposée, pas dans les petits cartels (ils chevauchaient la rangée du dessus).
- **Comparer les versions** (`comparer.html`, `comparer.js`) : chaque apparence pas encore décidée,
  ses versions côte à côte (lien « Essayer », images d'aujourd'hui et de la simulation) et un bouton
  « Choisir cette version » (`aria-pressed`) qui enregistre le réglage sur l'appareil ; liste « Déjà
  choisi ». Une version écartée pour de bon disparaît du code et de la page.
- **Flèche « Revenir en haut »** (`totop.js`) : coin bas droit, anneau rouge de progression.
- **Squelette de chargement** (`boot.js`, `.c-skel`) : silhouette de la frise pendant le chargement.

## Tailles d'écran

| Seuil | Effet |
|---|---|
| ≤ 767 px, ou ≤ 1099 × 520 px | mode « appli » (`:root.is-app`) : barre du haut, onglets en bas, panneaux qui montent du bas |
| ≤ 400 px de large ou ≤ 420 px de haut | vue liste automatique (Éphémérides garde le cadran sur un téléphone en portrait) |
| ≥ 1100 px | Éphémérides en trois colonnes |

Toujours vérifier à 375 × 812, 768 × 1024 et 1280 × 800, sans défilement horizontal de la page,
avec une marge latérale de 16 px sur téléphone.

## Mouvement

- Préférence du système **et** réglage « Réduire les animations » (`is-reduced-motion`) : ni plongée
  ni inertie, défilements instantanés.
- Plongée (View Transitions, choix du 2026-10-20) : on entre dans une phase par son point, on en
  ressort vers lui ; d'une phase à la voisine, le cadran tourne (Éphémérides) ou la frise glisse (Fil
  noir). Même plongée entre le grand cadran et un cadran (`ctx.sceneTransition`).

## Accessibilité (rappels de construction)

- Contrastes : texte ≥ 4,5:1 ; couleurs de phase contrôlées par `check_data.py`.
- Une œuvre = un seul arrêt de tabulation ; `+ − 0` seulement quand la frise a le focus.
- Couches décoratives (ciel, fil, anneaux) en `aria-hidden` ; vue liste sur la même page.
- Règles `forced-colors` (contrastes forcés de Windows) dans les feuilles des frises, des Archives et du socle.
- CSP `default-src 'self'` : aucun style ni script en ligne (styles posés par CSSOM).
- Déclaration actuelle : « non conforme », aucun audit RGAA n'ayant encore été réalisé.

## Tester la croissance

`tools/stress_fixture.py` (voir le README) produit une copie du site avec des œuvres fictives,
par exemple 10 ans à 7 sorties par an : 118 œuvres, 4 sagas, phases I à X.
