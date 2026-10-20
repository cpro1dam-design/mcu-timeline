# -*- coding: utf-8 -*-
"""Génère le site statique dans site/ à partir des données sourcées.

Usage : py -3 -X utf8 tools/build_site.py [--no-tmdb]

Produit :
- site/data/{works,characters,taxonomy,status,search}.json + manifest.json (hashs, schema_version) ;
- site/index.html (liste accessible des œuvres, fonctionne sans JavaScript) ;
- site/oeuvres/<slug>/index.html (une fiche par œuvre, sources et licences) ;
- site/pages/*.html (mentions légales, confidentialité, accessibilité, sources, méthode, à propos,
  mises à jour) et site/404.html ;
- dans chaque page (générée, ou réécrite entre deux marqueurs pour les frises et « Les deux frises ») :
  le préchargement des modules JavaScript (graphe des imports statiques), des données du premier
  affichage et des polices du premier écran, plus les empreintes des données (meta frise-data) pour
  que data.js n'attende pas manifest.json.

Tous les textes issus des sources sont échappés (html.escape) : un Wikipédia vandalisé ne peut pas
injecter de code. Aucune ressource tierce n'est chargée (CSP default-src 'self').
"""
import argparse
import datetime
import hashlib
import html
import io
import json
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from pipeline import palettes as palmod  # noqa: E402

SITE = os.path.join(ROOT, 'site')
SCHEMA_VERSION = 1
TMDB_MAX_AGE_DAYS = 170
MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre',
          'octobre', 'novembre', 'décembre']
KIND_LABEL = {'film': 'Film', 'series': 'Série', 'special': 'Épisode spécial'}
LEVEL_ORDER = ['principal', 'secondaire', 'cameo', None]
LEVEL_LABEL = {'principal': 'Rôles principaux', 'secondaire': 'Rôles secondaires',
               'cameo': 'Caméos et rôles non crédités', None: 'Distribution (niveau non renseigné)'}
CSP = ("default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
       "font-src 'self'; connect-src 'self'; frame-src 'self'; object-src 'none'; "
       "base-uri 'none'; form-action 'none'")
TMDB_ATTRIBUTION = 'This product uses the TMDB API but is not endorsed or certified by TMDB.'
TMDB_ATTRIBUTION_FR = 'Ce site utilise l’API TMDB mais n’est ni approuvé ni certifié par TMDB.'
NOT_SET = '[à compléter]'


def esc(s):
    return html.escape('' if s is None else str(s), quote=True)


def load(path, default=None):
    if not os.path.exists(path):
        return default
    with io.open(path, encoding='utf-8') as f:
        return json.load(f)


def write(path, text):
    d = os.path.dirname(path)
    if not os.path.isdir(d):
        os.makedirs(d)
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)


def write_json(path, data):
    text = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    write(path, text)
    return hashlib.sha256(text.encode('utf-8')).hexdigest()[:10]


# -- préchargement ------------------------------------------------------------------------
# Sans outil de regroupement, le navigateur découvre les modules en cascade (5 niveaux d'imports),
# puis manifest.json, puis les données. Les pages annoncent donc tout d'emblée : modulepreload pour
# chaque module du graphe, preload des données du premier affichage (avec leur empreinte, l'adresse
# exacte que demandera data.js) et des polices visibles au premier écran.
IMPORT_RE = re.compile(r'''^\s*(?:import|export)\s+(?:[\w*{}\s,$]*?\s+from\s+)?['"](\.{1,2}/[^'"]+\.js)['"]''', re.M)
PRELOAD_START = '<!-- précharge : début (généré par tools/build_site.py, ne pas modifier à la main) -->'
PRELOAD_END = '<!-- précharge : fin -->'
FIRST_DATA = ['works.json', 'taxonomy.json', 'status.json']  # characters.json : à la demande (shell.js)
STATIC_PAGES = {  # page → (module d'entrée, données du premier affichage, polices du premier écran)
    'concepts/a-astrolabe/index.html': ('concepts/a-astrolabe/a.js', FIRST_DATA,
                                        ['archivo/archivo-normal-latin.woff2', 'newsreader/newsreader-normal-latin.woff2']),
    'concepts/c-horizon/index.html': ('concepts/c-horizon/c.js', FIRST_DATA,
                                      ['antonio/antonio-normal-latin.woff2', 'inter/inter-normal-latin.woff2',
                                       'instrument-serif/instrument-serif-italic-latin.woff2']),
    'hub/index.html': ('hub/hub.js', [], ['archivo/archivo-normal-latin.woff2', 'antonio/antonio-normal-latin.woff2']),
}
GENERATED_DATA = {'index': ['works.json', 'taxonomy.json'], 'oeuvre': ['works.json']}
PRELOAD = {'hashes': {}}


def module_graph(entry):
    """Modules importés (statiquement) par `entry`, en largeur d'abord, sans l'entrée elle-même."""
    seen, order, queue = {os.path.normpath(entry)}, [], [os.path.normpath(entry)]
    while queue:
        cur = queue.pop(0)
        try:
            with io.open(cur, encoding='utf-8') as f:
                src = f.read()
        except OSError:
            continue
        for rel in IMPORT_RE.findall(src):
            p = os.path.normpath(os.path.join(os.path.dirname(cur), rel))
            if p not in seen:
                seen.add(p)
                order.append(p)
                queue.append(p)
    return order


def preload_lines(page_dir, entry, data_names, fonts, prefix=None):
    """Lignes de préchargement ; adresses relatives au dossier de la page (`page_dir`), ou bien
    `prefix` (chemin de la page vers la racine du site, « ../../ ») suivi du chemin depuis la racine."""
    if prefix is not None:
        url = lambda p: prefix + os.path.relpath(p, SITE).replace(os.sep, '/')
    else:
        url = lambda p: os.path.relpath(p, page_dir).replace(os.sep, '/')
    h = PRELOAD['hashes']
    out = ['<meta name="frise-data" content="{}">'.format(esc(json.dumps(h, separators=(',', ':'), sort_keys=True)))]
    out += ['<link rel="preload" href="{}" as="font" type="font/woff2" crossorigin>'.format(
        url(os.path.join(SITE, 'shared', 'fonts', f))) for f in fonts]
    out += ['<link rel="preload" href="{}?v={}" as="fetch" crossorigin>'.format(
        url(os.path.join(SITE, 'data', n)), h[n]) for n in data_names if n in h]
    out += ['<link rel="modulepreload" href="{}">'.format(url(p)) for p in module_graph(entry)]
    return out


def preload_head(rel, page_id):
    """Bloc de préchargement d'une page générée (toutes chargent shared/js/app.js)."""
    if not PRELOAD['hashes'] or rel.startswith('/'):  # 404 : chemins absolus, pas de préchargement
        return ''
    # `rel` mène de la page à la racine (« ../../ » pour une fiche) : les adresses partent de là
    lines = preload_lines(None, os.path.join(SITE, 'shared', 'js', 'app.js'),
                          GENERATED_DATA.get(page_id, []), [], prefix=rel or '')
    return ''.join(l + '\n' for l in lines)


def inject_static_preloads():
    """Réécrit le bloc de préchargement des pages statiques (frises, « Les deux frises »)."""
    for page_rel, (entry, data_names, fonts) in STATIC_PAGES.items():
        path = os.path.join(SITE, *page_rel.split('/'))
        if not os.path.exists(path):
            continue
        with io.open(path, encoding='utf-8') as f:
            doc = f.read()
        lines = preload_lines(os.path.dirname(path), os.path.join(SITE, *entry.split('/')), data_names, fonts)
        block = '\n'.join([PRELOAD_START] + lines + [PRELOAD_END])
        if PRELOAD_START in doc and PRELOAD_END in doc:
            a = doc.index(PRELOAD_START)
            b = doc.index(PRELOAD_END) + len(PRELOAD_END)
            doc = doc[:a] + block + doc[b:]
        else:  # première fois : après la dernière feuille de style
            last = list(re.finditer(r'<link rel="stylesheet"[^>]*>\n', doc))
            at = last[-1].end() if last else doc.index('</head>')
            doc = doc[:at] + block + '\n' + doc[at:]
        write(path, doc)


def colors_css(taxonomy):
    """Code couleur (choix de design tenu dans taxonomy.json) → variables CSS, sélectionnées par data-saga / data-phase."""
    neutral = taxonomy.get('neutral_color', '#C9C9D1')
    root = ['--phase-none: {};'.format(neutral)]
    rules = []
    for sg in taxonomy['sagas']:
        c = sg.get('color', neutral)
        root.append('--saga-{}: {};'.format(sg['id'], c))
        rules.append('[data-saga="{}"] {{ --saga-color: {}; }}'.format(sg['id'], c))
    for p in taxonomy['phases']:
        c = p.get('color', neutral)
        root.append('--phase-{}: {};'.format(p['n'], c))
        rules.append('[data-phase="{}"] {{ --phase-color: {}; }}'.format(p['n'], c))
    return ('/* Généré par tools/build_site.py depuis data/curated/taxonomy.json : ne pas modifier à la main. */\n'
            ':root {{ {} }}\n{}\n'.format(' '.join(root), '\n'.join(rules)))


def color_key_html(taxonomy):
    """Légende du code couleur (le texte suffit : la couleur n'est jamais la seule information)."""
    items = []
    for sg in taxonomy['sagas']:
        phases = []
        for n in sg['phases']:
            p = next((x for x in taxonomy['phases'] if x['n'] == n), None)
            if p:
                phases.append('<li data-phase="{n}"><span class="color-key__sw" aria-hidden="true"></span>Phase {r}'
                              '<span class="color-key__name"> ({c})</span></li>'.format(
                                  n=n, r=esc(p['roman']), c=esc(p.get('color_name', ''))))
        items.append('<li class="color-key__saga" data-saga="{id}"><span class="color-key__sw" aria-hidden="true"></span>'
                     '{label}<span class="color-key__name"> ({c})</span><ul>{ph}</ul></li>'.format(
                         id=esc(sg['id']), label=esc(sg['label_fr']), c=esc(sg.get('color_name', '')), ph=''.join(phases)))
    return ('<section class="color-key" aria-labelledby="h-couleurs"><h2 id="h-couleurs" class="color-key__title">Code couleur</h2>'
            '<ul class="color-key__list">{}</ul></section>'.format(''.join(items)))


def date_fr(v, precision):
    if not v:
        return ''
    parts = v.split('-')
    if precision == 'year' or len(parts) == 1:
        return parts[0]
    if precision == 'month' or len(parts) == 2:
        return '{} {}'.format(MONTHS[int(parts[1]) - 1], parts[0])
    day = int(parts[2])
    return '{} {} {}'.format('1er' if day == 1 else day, MONTHS[int(parts[1]) - 1], parts[0])


def sv(obj):
    return (obj or {}).get('v')


# -- fusion de la couche TMDB ---------------------------------------------------

def tmdb_layer(cfg, no_tmdb):
    if no_tmdb or not cfg.get('tmdb_enabled', True):
        return None
    t = load(os.path.join(ROOT, 'data', 'tmdb', 'tmdb.json'))
    if not t:
        return None
    try:
        fetched = datetime.datetime.strptime(t.get('fetched_at', ''), '%Y-%m-%d').date()
    except ValueError:
        return None
    if (datetime.date.today() - fetched).days > TMDB_MAX_AGE_DAYS:
        print('TMDB : données trop anciennes, ignorées (CGU : 6 mois max).')
        return None
    return t


def apply_tmdb(work, rec, actors_by_tmdb):
    """Priorité TMDB pour le titre FR, l'accroche et les dates (plan, tableau des sources)."""
    ref, at = rec['ref'], rec['at']
    if rec.get('title_fr'):
        if sv(work.get('title_fr')) and sv(work['title_fr']) != rec['title_fr']:
            work.setdefault('conflicts', []).append({'field': 'title_fr', 'values': [
                sv(work['title_fr']), rec['title_fr']], 'note': 'TMDB et Wikipédia diffèrent'})
        work['title_fr'] = {'v': rec['title_fr'], 'src': 'tmdb', 'ref': ref, 'at': at}
    if rec.get('overview'):
        work['tagline'] = {'v': rec['overview'], 'src': 'tmdb', 'ref': ref, 'at': at}
    for k, key in (('fr', 'release_fr'), ('us', 'release_us')):
        if rec.get(key):
            cur = work['release'].get(k)
            if cur and cur['v'] != rec[key] and cur.get('precision') == 'day':
                work.setdefault('conflicts', []).append({'field': 'release.' + k, 'values': [
                    cur['v'], rec[key]], 'note': 'TMDB et Wikidata diffèrent'})
            work['release'][k] = {'v': rec[key], 'precision': 'day', 'src': 'tmdb', 'ref': ref, 'at': at}
    if rec.get('poster_w342'):
        work['poster'] = {'w342': rec['poster_w342'], 'w780': rec.get('poster_w780'),
                          'src': 'tmdb', 'ref': ref, 'at': at}
    if rec.get('original_language'):
        work['original_language'] = rec['original_language']
    work['tmdb_cast'] = rec.get('cast', [])


# -- gabarits ---------------------------------------------------------------------------

# -- consultation hors connexion -----------------------------------------------------------
# site/sw.js : réseau d'abord (en ligne, tout est toujours à jour), copie locale si le réseau manque.
# Mis en cache dès la première visite : les pages des deux frises, de l'accueil et du site, leurs
# modules et styles, toutes les données. Ensuite, chaque page ouverte (fiches, polices) s'ajoute.
# Jamais en cache : les affiches TMDB (site/media), les outils de développement.
SW_TEMPLATE = """// Consultation hors connexion (généré par tools/build_site.py, ne pas modifier à la main).
// Réseau d'abord ; sans réseau, la copie gardée sur l'appareil. Affiches TMDB jamais gardées.
const VERSION = 'frise-mcu-%(build)s';
const PRECACHE = %(files)s;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION)
    .then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('frise-mcu-') && k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function fromCache(req) {
  const c = await caches.open(VERSION);
  let hit = await c.match(req) || await c.match(req, { ignoreSearch: true });
  if (!hit && req.mode === 'navigate') {
    const u = new URL(req.url);
    u.search = '';
    if (u.pathname.endsWith('/')) u.pathname += 'index.html';
    hit = await c.match(u.href) || await c.match(new URL('hors-connexion.html', self.registration.scope).href);
  }
  return hit || Response.error();
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const path = url.pathname.slice(scope.pathname.length);
  if (path.startsWith('media/') || path.startsWith('__dev/')) return;
  // données versionnées (?v=empreinte) et polices : elles ne changent jamais à adresse égale → copie
  // locale d'abord (visites suivantes sans attendre le réseau)
  if ((path.startsWith('data/') && url.searchParams.has('v')) || path.startsWith('shared/fonts/')) {
    e.respondWith(caches.open(VERSION).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') c.put(req, res.clone()).catch(() => {});
      return res;
    }))).catch(() => fromCache(req)));
    return;
  }
  e.respondWith(fetch(req).then((res) => {
    if (res.ok && res.type === 'basic' && !req.headers.has('range')) {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
    }
    return res;
  }).catch(() => fromCache(req)));
});
"""
SW_ENTRIES = ['shared/js/app.js', 'concepts/a-astrolabe/a.js', 'concepts/c-horizon/c.js', 'hub/hub.js']
SW_FILES = ['index.html', 'hors-connexion.html', 'hub/index.html', 'hub/hub.css',
            'concepts/a-astrolabe/index.html', 'concepts/a-astrolabe/manifest.json', 'concepts/a-astrolabe/a.css',
            'concepts/c-horizon/index.html', 'concepts/c-horizon/manifest.json', 'concepts/c-horizon/c.css',
            'shared/js/boot.js', 'data/couleurs.css']


def write_service_worker(build_id, hashes):
    def rel(p):
        return os.path.relpath(p, SITE).replace(os.sep, '/')
    files = list(SW_FILES)
    for e in SW_ENTRIES:
        p = os.path.join(SITE, *e.split('/'))
        files += [e] + [rel(m) for m in module_graph(p)]
    for d, ext in (('shared/css', '.css'), ('shared/img', '.svg'), ('pages', '.html')):
        full = os.path.join(SITE, *d.split('/'))
        files += sorted('{}/{}'.format(d, f) for f in os.listdir(full) if f.endswith(ext))
    files += ['data/{}?v={}'.format(n, h) for n, h in sorted(hashes.items())]
    seen, out = set(), []
    for f in files:
        if f in seen:
            continue
        seen.add(f)
        if not os.path.exists(os.path.join(SITE, *f.split('?')[0].split('/'))):
            raise SystemExit('service worker : fichier introuvable {}'.format(f))
        out.append(f)
    write(os.path.join(SITE, 'sw.js'), SW_TEMPLATE % {
        'build': build_id, 'files': json.dumps(out, ensure_ascii=False, indent=1)})
    return len(out)


def page(cfg, title, body, rel, page_id, description='', status=None, tmdb_used=False,
         extra_head=''):
    name = cfg['site_name']
    checked = status.get('checked_at') if status else None
    foot_tmdb = ('<p class="footer__tmdb">{} <span lang="en">({})</span></p>'.format(
        esc(TMDB_ATTRIBUTION_FR), esc(TMDB_ATTRIBUTION)) if tmdb_used else '')
    return '''<!doctype html>
<html lang="fr" data-page="{page_id}">
<head>
<meta http-equiv="Content-Security-Policy" content="{csp}">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="color-scheme" content="dark">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:type" content="website">
<link rel="stylesheet" href="{rel}shared/css/base.css">
<link rel="stylesheet" href="{rel}data/couleurs.css">
<link rel="icon" href="{rel}shared/img/favicon.svg" type="image/svg+xml">
{preload}{extra_head}<script type="module" src="{rel}shared/js/app.js"></script>
</head>
<body>
<a class="skip" href="#contenu">Aller au contenu</a>
<header class="site-header">
  <p class="site-header__name"><a href="{rel}index.html">{name}</a></p>
  <p class="site-header__tag">Site de fan non officiel</p>
  <nav aria-label="Navigation principale" class="site-nav">
    <ul>
      <li><a href="{rel}index.html">Les œuvres</a></li>
      <li><a href="{rel}hub/index.html">Les frises</a></li>
      <li><a href="{rel}pages/a-propos.html">À propos</a></li>
      <li><a href="{rel}pages/methode.html">Méthode</a></li>
    </ul>
  </nav>
</header>
<main id="contenu" tabindex="-1">
{body}
</main>
<footer class="site-footer">
  <p>Site de fan non officiel et non commercial. Non affilié à Marvel Studios, Marvel Entertainment ni à The Walt Disney Company. Les titres, noms et marques cités appartiennent à leurs propriétaires.</p>
  <p>Textes issus de Wikipédia : licence <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.fr">CC BY-SA 4.0</a>. Données structurées : <a href="https://www.wikidata.org/">Wikidata</a> (CC0).</p>
  {foot_tmdb}
  <nav aria-label="Informations légales">
    <ul class="site-footer__links">
      <li><a href="{rel}pages/mentions-legales.html">Mentions légales</a></li>
      <li><a href="{rel}pages/confidentialite.html">Confidentialité</a></li>
      <li><a href="{rel}pages/accessibilite.html">Accessibilité : non conforme</a></li>
      <li><a href="{rel}pages/sources.html">Sources, crédits et licences</a></li>
      <li><a href="{rel}pages/mises-a-jour.html">Mises à jour</a></li>
    </ul>
  </nav>
  <p class="site-footer__checked">{checked_line}</p>
</footer>
</body>
</html>
'''.format(page_id=esc(page_id), csp=CSP, title=esc(title), desc=esc(description), rel=rel,
           name=esc(name), body=body, foot_tmdb=foot_tmdb, extra_head=extra_head,
           preload=preload_head(rel, page_id),
           checked_line=('Données vérifiées le {}.'.format(esc(date_fr(checked, 'day')))
                         if checked else ''))


def release_line(w):
    rel = w.get('release') or {}
    parts = []
    if rel.get('fr'):
        parts.append('<time datetime="{}">{}</time> (France)'.format(
            esc(rel['fr']['v']), esc(date_fr(rel['fr']['v'], rel['fr'].get('precision')))))
    if rel.get('us'):
        parts.append('<time datetime="{}">{}</time> (États-Unis)'.format(
            esc(rel['us']['v']), esc(date_fr(rel['us']['v'], rel['us'].get('precision')))))
    if not parts and rel.get('first'):
        parts.append('<time datetime="{}">{}</time>'.format(
            esc(rel['first']['v']), esc(date_fr(rel['first']['v'], rel['first'].get('precision')))))
    return ' · '.join(parts) or 'Date de sortie non renseignée'


def main_date(w):
    rel = w.get('release') or {}
    for k in ('fr', 'us', 'first'):
        if rel.get(k):
            return rel[k]
    return None


def is_upcoming(d, today):
    """Même règle que dates.js (statusOf) : à venir si la date (ou son mois, son année) est après aujourd'hui."""
    if not d or not d.get('v'):
        return False
    v = d['v']
    return v > today[:len(v)] if d.get('precision') != 'day' else v > today


POSTER_ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV']


def poster_html(w, rel, cls):
    """Affiche d'une œuvre (décorative : le titre est écrit à côté). TMDB si disponible, sinon affiche
    provisoire dessinée en CSS (phase et titre sourcés ; composition placée par app.js, voir affiche.js)."""
    p = w.get('poster') or {}
    if p.get('w342'):
        return ('<img class="{} c-affiche" src="{}{}" width="342" height="513" alt="" loading="lazy" decoding="async">'
                .format(cls, rel, esc(p['w342'])))
    phase = sv(w.get('phase'))
    roman = POSTER_ROMAN[phase] if isinstance(phase, int) and 0 < phase < len(POSTER_ROMAN) else ''
    return ('<span class="{} c-affiche c-affiche--ph" aria-hidden="true" data-phase="{}" data-ph-id="{}">'
            '<span class="c-affiche__roman">{}</span><span class="c-affiche__t">{}</span>'
            '<span class="c-affiche__tag">Affiche provisoire</span></span>').format(
                cls, esc(phase or ''), esc(w['id']), roman, esc(sv(w.get('title_fr')) or w['id']))


def next_release_html(works):
    """« Prochaine sortie » sur l'accueil, calculée à la construction (le navigateur la recalcule chaque jour)."""
    today = datetime.datetime.utcnow().strftime('%Y-%m-%d')
    nxt = [w for w in sorted(works, key=lambda w: sv(w.get('order_release'))) if is_upcoming(main_date(w), today)]
    if not nxt:
        return '<section class="next-release" id="prochaine-sortie" aria-labelledby="h-prochaine" hidden></section>'
    def when(w):
        rel = w.get('release') or {}
        d = main_date(w)
        where = ' en France' if rel.get('fr') else (' aux États-Unis' if rel.get('us') else '')
        return '{}{}{}'.format('le ' if d.get('precision') == 'day' else 'en ', date_fr(d['v'], d.get('precision')), where)
    w = nxt[0]
    then = ''
    if len(nxt) > 1:
        then = '<p class="next-release__then">Ensuite : <a href="oeuvres/{}/index.html">{}</a>, {}</p>'.format(
            esc(nxt[1]['slug']), esc(sv(nxt[1].get('title_fr'))), esc(when(nxt[1])))
    return ('<section class="next-release" id="prochaine-sortie" aria-labelledby="h-prochaine">{poster}'
            '<h2 id="h-prochaine" class="next-release__k">Prochaine sortie</h2>'
            '<p class="next-release__t"><a href="oeuvres/{slug}/index.html">{title}</a></p>'
            '<p class="next-release__d">{when}<span class="next-release__in"></span></p>{then}</section>').format(
                poster=poster_html(w, '', 'next-release__poster'),
                slug=esc(w['slug']), title=esc(sv(w.get('title_fr'))), when=esc(when(w)), then=then)


def work_li(w, rel):
    d = main_date(w)
    title_o = w.get('title_original') or {}
    vo = ''
    if title_o.get('v') and title_o['v'] != sv(w.get('title_fr')):
        vo = '<p class="work__vo" lang="{}">{}</p>'.format(esc(title_o.get('lang', 'en')), esc(title_o['v']))
    phase = sv(w.get('phase'))
    prov = (w.get('story') or {}).get('provisional')
    badge = ('<p class="badge badge--provisional">Place dans l’histoire à confirmer</p>' if prov else '')
    return '''<li class="work" data-id="{id}" data-kind="{kind}" data-phase="{phase}" data-saga="{saga}" data-release="{date}" data-precision="{prec}" data-order-release="{orel}" data-order-story="{ostory}"{provattr}>
  <article class="work__card" aria-labelledby="t-{id}">
    {poster}
    <h4 class="work__title" id="t-{id}"><a href="{rel}oeuvres/{slug}/">{title}</a></h4>
    {vo}
    <p class="work__meta"><span class="work__kind">{kind_label}</span> · {release} · <span>{phase_label}</span></p>
    <p class="work__status" data-status hidden></p>
    {badge}
  </article>
</li>'''.format(id=esc(w['id']), kind=esc(w['kind']), phase=esc(phase or ''), saga=esc(sv(w.get('saga')) or ''),
               date=esc(d['v'] if d else ''), prec=esc(d.get('precision', '') if d else ''),
               orel=esc(sv(w.get('order_release'))), ostory=esc(sv(w.get('story'))),
               provattr=' data-provisional="true"' if prov else '', rel=rel, slug=esc(w['slug']),
               title=esc(sv(w.get('title_fr')) or title_o.get('v') or w['id']), vo=vo,
               kind_label=esc(KIND_LABEL.get(w['kind'], w['kind'])), release=release_line(w),
               phase_label='Phase {}'.format(phase) if phase else 'Phase à préciser', badge=badge,
               poster=poster_html(w, rel, 'work__poster'))


def index_body(cfg, works, taxonomy, status):
    sagas = taxonomy['sagas']
    by_phase = {}
    for w in works:
        by_phase.setdefault(sv(w.get('phase')), []).append(w)
    out = ['<h1>Les œuvres de l’univers cinématographique Marvel</h1>',
           '<p class="lead">{} œuvres : {} films et {} séries, reliés par le fil noir. '
           'Cette liste est la vue de référence, accessible à tous ; les deux frises graphiques en sont des '
           'vues enrichies.</p>'.format(len(works), sum(w['kind'] == 'film' for w in works),
                                        sum(w['kind'] == 'series' for w in works)),
           next_release_html(works),
           FRISES,
           TOOLBAR,
           color_key_html(taxonomy),
           '<p id="annonces" class="visually-hidden" role="status" aria-live="polite" aria-atomic="true"></p>',
           '<div id="vue-phases" class="works-by-phase">']
    for s in sagas:
        out.append('<section class="saga" data-saga="{id}" aria-labelledby="saga-{id}"><h2 id="saga-{id}">{label}</h2>'.format(
            id=esc(s['id']), label=esc(s['label_fr'])))
        for n in s['phases']:
            p = next(x for x in taxonomy['phases'] if x['n'] == n)
            items = sorted(by_phase.get(n, []), key=lambda w: sv(w.get('order_release')))
            out.append('<section class="phase" data-phase="{n}" aria-labelledby="phase-{n}"><h3 id="phase-{n}">'
                       '<span class="phase__roman" aria-hidden="true">{roman}</span> Phase {n} '
                       '<span class="phase__count">({c} œuvres)</span></h3><ol class="works">'.format(
                           n=n, roman=esc(p['roman']), c=len(items)))
            out.extend(work_li(w, '') for w in items)
            out.append('</ol></section>')
        out.append('</section>')
    orphans = by_phase.get(None, [])
    if orphans:
        out.append('<section class="phase" aria-labelledby="phase-x"><h2 id="phase-x">Phase à préciser</h2><ol class="works">')
        out.extend(work_li(w, '') for w in sorted(orphans, key=lambda w: sv(w.get('order_release'))))
        out.append('</ol></section>')
    out.append('</div>')
    out.append('<section id="vue-histoire" class="works-story" aria-labelledby="h-histoire" hidden>'
               '<h2 id="h-histoire">Dans l’ordre de l’histoire</h2>'
               '<p class="note">Ordre établi d’après <a href="{url}">{title}</a> (relevé du {date}). '
               'Les œuvres absentes de cette liste sont placées provisoirement après toutes les '
               'œuvres sorties avant elles.</p><ol class="works" id="liste-histoire"></ol></section>'.format(
                   url=esc(STORY_REF.get('url')), title=esc(STORY_REF.get('title')),
                   date=esc(date_fr(STORY_REF.get('retrieved_at'), 'day'))))
    return '\n'.join(out)


# les deux frises, en vignettes (miniatures dessinées : shared/img/apercu-*.svg)
FRISES = '''<section class="frises" aria-labelledby="h-frises">
<h2 id="h-frises" class="visually-hidden">Les deux frises</h2>
<ul class="frises__list">
<li><a class="frise-card" href="concepts/a-astrolabe/index.html"><img src="shared/img/apercu-ephemerides.svg" alt="" width="160" height="100"><span class="frise-card__name">Éphémérides</span><span class="frise-card__d">le cadran : les œuvres en cercle, phase par phase</span></a></li>
<li><a class="frise-card" href="concepts/c-horizon/index.html"><img src="shared/img/apercu-fil-noir.svg" alt="" width="160" height="100"><span class="frise-card__name">Fil noir</span><span class="frise-card__d">la frise : de film en film, avec les affiches</span></a></li>
</ul>
</section>'''

TOOLBAR = '''<div class="toolbar">
  <div class="search" data-search>
    <label for="recherche" class="search__label">Rechercher une œuvre ou un personnage</label>
    <input id="recherche" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="recherche-resultats" autocomplete="off" spellcheck="false">
    <ul id="recherche-resultats" role="listbox" aria-label="Résultats" class="search__results" hidden></ul>
  </div>
  <div class="segmented" role="group" aria-label="Ordre d’affichage">
    <button type="button" data-order="release" aria-pressed="true">Par phase (sortie)</button>
    <button type="button" data-order="story" aria-pressed="false">Ordre de l’histoire</button>
  </div>
  <details class="settings">
    <summary>Réglages et spoilers</summary>
    <div class="settings__body">
      <label for="vu-jusqua">J’ai vu jusqu’à…</label>
      <select id="vu-jusqua"><option value="">Je ne précise pas</option></select>
      <p class="settings__hint">Les caméos des œuvres sorties après restent masqués ; l’intrigue complète ne s’affiche que si vous la demandez. Raccourci dans l’ordre de sortie.</p>
      <label class="switch"><input type="checkbox" id="tout-afficher" role="switch"> Tout afficher (révèle les spoilers)</label>
      <label class="switch"><input type="checkbox" id="reduire-animations" role="switch"> Réduire les animations</label>
      <p class="settings__counts" id="compteurs" aria-live="off"></p>
    </div>
  </details>
</div>'''

STORY_REF = {}


def appearance_rows(apps, chars_by, actors_by):
    groups = {}
    for a in apps:
        lvl = (a.get('level') or {}).get('v')
        groups.setdefault(lvl, []).append(a)
    out = []
    for lvl in LEVEL_ORDER:
        items = groups.get(lvl)
        if not items:
            continue
        rows = []
        for a in items:
            actor = sv((actors_by.get(a['actor']) or {}).get('name')) or a.get('actor_name') or '?'
            role = sv(a.get('role')) or sv((chars_by.get(a.get('character')) or {}).get('name')) or ''
            rows.append('<li><span class="cast__role">{}</span>{}<span class="cast__actor">{}</span></li>'.format(
                esc(role) if role else '<span class="muted">rôle non renseigné</span>',
                ' — ' if role else ' ', esc(actor)))
        block = '<h3>{}</h3><ul class="cast">{}</ul>'.format(esc(LEVEL_LABEL[lvl]), ''.join(rows))
        if lvl == 'cameo':
            out.append('<div class="spoiler" data-spoiler="cameo" data-work="{w}">'
                       '<button type="button" class="spoiler__reveal" aria-expanded="false">'
                       'Afficher les caméos et rôles non crédités (révèle des surprises)</button>'
                       '<template class="spoiler__content">{b}</template></div>'.format(
                           w=esc(items[0]['work']), b=block))
        else:
            out.append(block)
    return ''.join(out)


def sources_block(w, taxonomy, tmdb_used):
    items = []
    fw = w.get('frwiki')
    if fw:
        items.append('<li>Textes : Wikipédia, article « <a href="{url}">{t}</a> » (<a href="{perma}">version du {d}</a>, '
                     'auteurs : <a href="{hist}">historique</a>). Licence <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.fr">CC BY-SA 4.0</a>. '
                     'Extrait modifié : références, notes et images retirées.</li>'.format(
                         url=esc(fw['article_url']), t=esc(fw['title']), perma=esc(fw['url']),
                         d=esc(date_fr(fw['rev_timestamp'][:10], 'day')),
                         hist=esc(fw['article_url'] + '?action=history')))
    items.append('<li>Données (dates, phase, distribution) : Wikidata, élément <a href="https://www.wikidata.org/wiki/{q}">{q}</a> (CC0).</li>'.format(q=esc(w['id'])))
    refs = set()
    for f in ('phase', 'release'):
        pass
    for s in w.get('seasons') or []:
        refs.add(s['ref'])
    if (w.get('phase') or {}).get('src') == 'frwiki':
        refs.add(w['phase']['ref'])
    for r in sorted(refs):
        # frwiki:<titre>@<revid>#tableau
        try:
            title, rest = r[len('frwiki:'):].split('@', 1)
            revid = rest.split('#', 1)[0]
            items.append('<li>Phase et saisons : Wikipédia, article « {} » (<a href="https://fr.wikipedia.org/w/index.php?oldid={}">version citée</a>), CC BY-SA 4.0.</li>'.format(
                esc(title), esc(revid)))
        except ValueError:
            continue
    st = w.get('story') or {}
    if st.get('provisional'):
        items.append('<li>Place dans l’ordre de l’histoire : <strong>provisoire</strong> (absente de la liste de référence ; placée après les œuvres sorties avant elle).</li>')
    elif st.get('ref'):
        items.append('<li>Place dans l’ordre de l’histoire : <a href="{}">{}</a>.</li>'.format(
            esc(st['ref']), esc(STORY_REF.get('title', 'liste de référence'))))
    if (w.get('universe') or {}).get('src') == 'curated':
        items.append('<li>Univers : <a href="{}">source citée</a>.</li>'.format(esc(w['universe']['ref'])))
    if tmdb_used and (w.get('tagline') or w.get('poster')):
        items.append('<li>Accroche, affiche et ordre du générique : <a href="https://www.themoviedb.org/">TMDB</a>. {}</li>'.format(esc(TMDB_ATTRIBUTION_FR)))
    return '<ul class="sources">{}</ul>'.format(''.join(items))


def work_page(cfg, w, prev, nxt, apps, chars_by, actors_by, taxonomy, status, tmdb_used):
    rel = '../../'
    title = sv(w.get('title_fr')) or sv(w.get('title_original')) or w['id']
    to = w.get('title_original') or {}
    vo = ('<p class="fiche__vo" lang="{}">{}</p>'.format(esc(to.get('lang', 'en')), esc(to['v']))
          if to.get('v') and to['v'] != title else '')
    phase = sv(w.get('phase'))
    saga = next((s for s in taxonomy['sagas'] if s['id'] == sv(w.get('saga'))), None)
    uni = sv(w.get('universe'))
    uni_label = next((u['label_fr'] for u in taxonomy['universes'] if u['id'] == uni), uni)
    facts = ['<div><dt>Sortie</dt><dd>{}</dd></div>'.format(release_line(w)),
             '<div><dt>Phase</dt><dd>{}</dd></div>'.format('Phase {}'.format(phase) if phase else 'À préciser')]
    if saga:
        facts.append('<div><dt>Saga</dt><dd>{}</dd></div>'.format(esc(saga['label_fr'])))
    if uni and uni != 'earth-616':
        facts.append('<div><dt>Univers</dt><dd>{}</dd></div>'.format(esc(uni_label)))
    if w.get('directors'):
        facts.append('<div><dt>Réalisation</dt><dd>{}</dd></div>'.format(
            ', '.join(esc(d['v']) for d in w['directors'])))
    if w.get('runtime_min'):
        facts.append('<div><dt>Durée</dt><dd>{} min</dd></div>'.format(esc(w['runtime_min']['v'])))
    seasons = ''
    if w.get('seasons'):
        rows = ''.join('<tr><th scope="row">Saison {n}</th><td>{ep}</td><td>{d}</td><td>Phase {p}</td></tr>'.format(
            n=esc(s['n']), ep=esc(s.get('episodes') or '—'),
            d=esc(date_fr(s['first']['v'], s['first']['precision']) if s.get('first') else '—'),
            p=esc(s['phase'])) for s in w['seasons'])
        seasons = ('<table class="seasons"><caption>Saisons (d’après Wikipédia)</caption><thead><tr><th scope="col">Saison</th>'
                   '<th scope="col">Épisodes</th><th scope="col">Première diffusion</th><th scope="col">Phase</th></tr></thead>'
                   '<tbody>{}</tbody></table>'.format(rows))
    if w.get('tagline'):
        intro = '<section aria-labelledby="h-accroche"><h2 id="h-accroche">Accroche</h2><p>{}</p><p class="credit">Accroche : TMDB.</p></section>'.format(esc(w['tagline']['v']))
    elif w.get('presentation'):
        intro = ('<section aria-labelledby="h-presentation"><h2 id="h-presentation">Présentation</h2>{}'
                 '<p class="credit">Extrait de Wikipédia (introduction de l’article), licence CC BY-SA 4.0.</p></section>').format(
            ''.join('<p>{}</p>'.format(esc(p)) for p in w['presentation']['v']))
    else:
        intro = '<section aria-labelledby="h-accroche"><h2 id="h-accroche">Accroche</h2><p class="muted">Accroche indisponible.</p></section>'
    if w.get('plot'):
        fw = w.get('frwiki') or {}
        plot = ('<section aria-labelledby="h-intrigue"><h2 id="h-intrigue">Intrigue</h2>'
                '<div class="spoiler" data-spoiler="plot" data-work="{id}">'
                '<button type="button" class="spoiler__reveal" aria-expanded="false">Révéler l’intrigue complète (Wikipédia, contient des spoilers)</button>'
                '<template class="spoiler__content">{paras}<p class="credit">Section « {sec} » de l’article Wikipédia, licence CC BY-SA 4.0, extrait modifié.</p></template>'
                '<noscript><p><a href="{url}">Lire l’intrigue sur Wikipédia</a> (révèle l’histoire).</p></noscript>'
                '</div></section>').format(
            id=esc(w['id']), paras=''.join('<p>{}</p>'.format(esc(p)) for p in w['plot']['v']),
            sec=esc(w['plot']['ref'].rsplit('#', 1)[-1]), url=esc(fw.get('article_url', '')))
    else:
        plot = '<section aria-labelledby="h-intrigue"><h2 id="h-intrigue">Intrigue</h2><p class="muted">Intrigue non disponible dans la source.</p></section>'
    cast = appearance_rows(apps, chars_by, actors_by) if apps else '<p class="muted">Distribution non renseignée dans les sources.</p>'
    nav = []
    if prev:
        nav.append('<a rel="prev" href="../{}/">← {}</a>'.format(esc(prev['slug']), esc(sv(prev.get('title_fr')))))
    if nxt:
        nav.append('<a rel="next" href="../{}/">{} →</a>'.format(esc(nxt['slug']), esc(sv(nxt.get('title_fr')))))
    poster = ''
    if w.get('poster'):
        poster = '<img class="fiche__poster" src="{}{}" width="342" height="513" alt="Affiche de « {} »">'.format(
            rel, esc(w['poster']['w342']), esc(title))
    else:
        poster = ('<div class="fiche__poster fiche__poster--ph" aria-hidden="true"><span>{}</span><span>{}</span></div>'.format(
            esc(title), esc(phase and 'Phase {}'.format(phase) or '')))
    prov = (w.get('story') or {}).get('provisional')
    body = '''<article class="fiche" data-id="{id}" data-phase="{phase_n}" data-saga="{saga_id}" data-release="{date}" data-precision="{prec}" data-order-release="{orel}">
<nav aria-label="Fil d’Ariane" class="breadcrumb"><ol><li><a href="{rel}index.html">Les œuvres</a></li><li>{phase_crumb}</li><li aria-current="page">{title}</li></ol></nav>
<div class="fiche__head">
  {poster}
  <div>
    <p class="fiche__kind">{kind}</p>
    <h1>{title}</h1>
    {vo}
    <p class="work__status" data-status hidden></p>
    {badge}
    <dl class="facts">{facts}</dl>
  </div>
</div>
{seasons}
{intro}
{plot}
<section aria-labelledby="h-distribution"><h2 id="h-distribution">Distribution</h2>{cast}
<p class="credit">Distribution : Wikidata (rôles) ; niveaux selon les règles de la page <a href="{rel}pages/methode.html">Méthode</a>.</p></section>
<section aria-labelledby="h-sources"><h2 id="h-sources">Sources</h2>{sources}
<p><a href="{rel}pages/mentions-legales.html#signaler">Signaler une erreur</a></p></section>
<nav aria-label="Œuvre précédente et suivante (ordre de sortie)" class="prevnext">{nav}</nav>
</article>'''.format(id=esc(w['id']), phase_n=esc(phase or ''), saga_id=esc(sv(w.get('saga')) or ''), date=esc((main_date(w) or {}).get('v', '')),
                     prec=esc((main_date(w) or {}).get('precision', '')),
                     orel=esc(sv(w.get('order_release'))), rel=rel,
                     phase_crumb='Phase {}'.format(phase) if phase else 'Phase à préciser',
                     title=esc(title), poster=poster, kind=esc(KIND_LABEL.get(w['kind'])), vo=vo,
                     badge=('<p class="badge badge--provisional">Place dans l’histoire à confirmer</p>' if prov else ''),
                     facts=''.join(facts), seasons=seasons, intro=intro, plot=plot, cast=cast,
                     sources=sources_block(w, taxonomy, tmdb_used), nav=' '.join(nav))
    d = main_date(w)
    desc = '{} — {}{}, fiche sourcée (Wikipédia, Wikidata).'.format(
        title, KIND_LABEL.get(w['kind']), ' sorti en {}'.format(d['v'][:4]) if d else '')
    return page(cfg, '{} · {}'.format(title, cfg['site_name']), body, rel, 'oeuvre', desc, status, tmdb_used)


def compare_body():
    """Page « Comparer les versions » : les apparences pas encore choisies, côte à côte ; « Choisir cette
    version » (shared/js/comparer.js) enregistre le réglage sur l'appareil."""
    def opt(value, label, desc, extra=''):
        return ('<figure class="cmp__opt" data-value="{v}" data-label="{l}"><figcaption><h3>{l}'
                '<span class="cmp__badge" hidden><span class="visually-hidden">, </span>version choisie</span></h3><p>{d}</p></figcaption>{x}'
                '<button type="button" class="cmp__pick" hidden aria-pressed="false">Choisir cette version'
                '<span class="visually-hidden"> : {l}</span></button></figure>').format(
                    v=value, l=label, d=desc, x=extra)

    def img(name, w, h, alt, cap):
        return ('<li><figure><img src="shared/img/comparer/{}.jpg" width="{}" height="{}" alt="{}" loading="lazy">'
                '<figcaption>{}</figcaption></figure></li>').format(name, w, h, alt, cap)

    return '\n'.join([
        '<h1>Comparer les versions</h1>',
        '<p class="lead">Les apparences du site pas encore décidées sont réunies ici, côte à côte. « Choisir cette '
        'version » l’applique tout de suite, partout sur le site, sur cet appareil (réglage gardé avec les autres, voir '
        '<a href="pages/confidentialite.html">Confidentialité</a>). Une fois le choix fait pour de bon, l’autre version '
        'sera retirée du site.</p>',
        '<p class="visually-hidden" role="status" aria-live="polite" data-cmp-live></p>',

        '<p class="cmp__none">Aucune version n’attend votre choix pour le moment.</p>',

        '<section class="cmp" aria-labelledby="cmp-fait">',
        '<h2 id="cmp-fait">Déjà choisi</h2>',
        '<ul class="cmp__done">',
        '<li>Les deux frises gardées : Éphémérides et Fil noir.</li>',
        '<li>Éphémérides : deux sagas par cadran, un nouveau cadran toutes les deux sagas ; le grand cadran les '
        'réunit en orbite, sans repère.</li>',
        '<li>Points des œuvres, dans Éphémérides : plus gros.</li>',
        '<li>Œuvres d’un autre univers, dans les deux frises : losange (losange fuchsia plein, nom de l’univers '
        'écrit, branche du fil en tirets ; dans Fil noir, carte décalée avec un bord fuchsia).</li>',
        '<li>Œuvre vue, dans la liste des œuvres : surbrillance (toute la case passe en vert).</li>',
        '<li>Passage d’une phase à l’autre, dans les deux frises : plongée.</li>',
        '<li>Flèche de la frise : avec anneau (l’anneau rouge montre la progression).</li>',
        '<li>Distribution, dans les Archives : monogramme (grand carré aux initiales).</li>',
        '<li>Aperçu de l’autre frise, dans les Réglages : miniature dessinée.</li>',
        '</ul></section>',
    ])


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--no-tmdb', action='store_true')
    args = ap.parse_args(argv)
    cfg = load(os.path.join(ROOT, 'site.config.json'))
    taxonomy = load(os.path.join(ROOT, 'data', 'curated', 'taxonomy.json'))
    scope = load(os.path.join(ROOT, 'data', 'curated', 'scope.json'))
    story = load(os.path.join(ROOT, 'data', 'curated', 'story_order.json'), {})
    STORY_REF.update(story.get('reference', {}))
    data = load(os.path.join(ROOT, 'data', 'build', 'works.json'))
    chars = load(os.path.join(ROOT, 'data', 'build', 'characters.json'))
    status = load(os.path.join(ROOT, 'data', 'build', 'status.json'), {})
    changelog = load(os.path.join(ROOT, 'data', 'build', 'changelog.json'), {'entries': []})
    works = data['works']
    tmdb = tmdb_layer(cfg, args.no_tmdb)
    actors_by = {a['id']: a for a in chars['actors']}
    chars_by = {c['id']: c for c in chars['characters']}
    apps_by_work = {}
    for a in chars['appearances']:
        apps_by_work.setdefault(a['work'], []).append(a)
    if tmdb:
        actors_by_tmdb = {a['tmdb_person']: a for a in chars['actors'] if a.get('tmdb_person')}
        for w in works:
            rec = tmdb['works'].get(w['id'])
            if rec:
                apply_tmdb(w, rec, actors_by_tmdb)
                # niveaux d'apparition selon l'ordre du générique TMDB
                level_by_person = {c['person']: c for c in rec.get('cast', [])}
                for a in apps_by_work.get(w['id'], []):
                    tp = (actors_by.get(a['actor']) or {}).get('tmdb_person')
                    c = level_by_person.get(tp)
                    if c and not (a.get('level') or {}).get('v') == 'cameo':
                        a['level'] = {'v': c['level'], 'src': 'tmdb', 'ref': c['ref'],
                                      'rule': c['rule'], 'at': c['at']}
    tmdb_used = bool(tmdb)
    pals = palmod.build(works, taxonomy, tmdb)

    # nettoyage des pages générées
    for d in ('oeuvres', 'pages', 'data'):
        p = os.path.join(SITE, d)
        if os.path.isdir(p):
            shutil.rmtree(p)

    # données pour le front
    site_works = []
    for w in works:
        sw = {k: w.get(k) for k in ('id', 'slug', 'kind', 'title_fr', 'title_original', 'release',
                                    'phase', 'saga', 'universe', 'story', 'order_release',
                                    'seasons', 'tagline', 'poster', 'directors', 'runtime_min')}
        sw['palette'] = {k: pals[w['id']][k] for k in ('sky', 'nebula', 'accent', 'band', 'source')}
        sw['has_plot'] = bool(w.get('plot'))
        sw['frwiki'] = w.get('frwiki')
        site_works.append(sw)
    hashes = {}
    hashes['works.json'] = write_json(os.path.join(SITE, 'data', 'works.json'),
                                      {'schema_version': SCHEMA_VERSION, 'works': site_works})
    work_ids = {w['id'] for w in works}
    hashes['characters.json'] = write_json(os.path.join(SITE, 'data', 'characters.json'), {
        'schema_version': SCHEMA_VERSION, 'characters': chars['characters'], 'actors': chars['actors'],
        'appearances': [a for a in chars['appearances'] if a['work'] in work_ids]})
    hashes['texts.json'] = write_json(os.path.join(SITE, 'data', 'texts.json'), {
        'schema_version': SCHEMA_VERSION,
        'texts': {w['id']: {'presentation': (w.get('presentation') or {}).get('v'),
                            'plot': (w.get('plot') or {}).get('v'),
                            'plot_section': ((w.get('plot') or {}).get('ref') or '').rsplit('#', 1)[-1] or None,
                            'frwiki': w.get('frwiki')} for w in works}})
    hashes['taxonomy.json'] = write_json(os.path.join(SITE, 'data', 'taxonomy.json'), taxonomy)
    write(os.path.join(SITE, 'data', 'couleurs.css'), colors_css(taxonomy))
    hashes['status.json'] = write_json(os.path.join(SITE, 'data', 'status.json'), {
        'checked_at': status.get('checked_at'), 'counts': status.get('counts'),
        'story_reference': STORY_REF, 'tmdb_used': tmdb_used})
    # index de recherche (titres FR/VO, personnages récurrents)
    char_count = {}
    char_actors = {}  # interprètes (recherche par acteur), hors caméos
    actor_name = {x['id']: sv(x.get('name')) for x in chars.get('actors', [])}
    for a in chars['appearances']:  # caméos exclus, comme dans les maquettes (ce sont des surprises)
        if a.get('character') and (a.get('level') or {}).get('v') != 'cameo' and a['work'] in work_ids:
            char_count.setdefault(a['character'], set()).add(a['work'])
            n = actor_name.get(a.get('actor'))
            if n:
                m = char_actors.setdefault(a['character'], {})
                m[n] = m.get(n, 0) + 1
    search = {'works': [{'id': w['id'], 'slug': w['slug'], 'fr': sv(w.get('title_fr')),
                         'vo': sv(w.get('title_original')), 'kind': w['kind'],
                         'year': ((main_date(w) or {}).get('v') or '')[:4]} for w in works],
              'characters': [{'id': c['id'], 'name': sv(c.get('name')),
                              'aka': sv(c.get('aliases')) or [],  # alias Wikidata (« Iron Man » pour Tony Stark)
                              'actors': [n for n, _ in sorted(char_actors.get(c['id'], {}).items(), key=lambda kv: (-kv[1], kv[0]))],
                              'works': sorted(char_count.get(c['id'], []))}
                             for c in chars['characters'] if len(char_count.get(c['id'], ())) >= 2 and c.get('name')]}
    hashes['search.json'] = write_json(os.path.join(SITE, 'data', 'search.json'), search)
    build_id = hashlib.sha256(''.join(sorted(hashes.values())).encode()).hexdigest()[:10]
    PRELOAD['hashes'] = dict(hashes)
    inject_static_preloads()
    write_json(os.path.join(SITE, 'data', 'manifest.json'), {
        'schema_version': SCHEMA_VERSION, 'build_id': build_id,
        'generated_at': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'), 'files': hashes})

    # pages
    ordered = sorted(works, key=lambda w: sv(w.get('order_release')))
    write(os.path.join(SITE, 'index.html'), page(
        cfg, '{} · les œuvres du MCU'.format(cfg['site_name']), index_body(cfg, ordered, taxonomy, status),
        '', 'index', 'Les films et séries de l’univers cinématographique Marvel, par phase et dans l’ordre de l’histoire, avec leurs sources.',
        status, tmdb_used, extra_head='<link rel="stylesheet" href="shared/css/fonts.css">'))  # Antonio : titres des affiches provisoires
    for i, w in enumerate(ordered):
        prev = ordered[i - 1] if i > 0 else None
        nxt = ordered[i + 1] if i + 1 < len(ordered) else None
        write(os.path.join(SITE, 'oeuvres', w['slug'], 'index.html'), work_page(
            cfg, w, prev, nxt, apps_by_work.get(w['id'], []), chars_by, actors_by, taxonomy, status, tmdb_used))
    from legal_pages import build_pages
    build_pages(cfg, page, esc, date_fr, works, scope, taxonomy, status, STORY_REF, changelog,
                tmdb_used, os.path.join(SITE, 'pages'), write)
    # la page 404 peut être servie à n'importe quelle profondeur : chemins absolus depuis base_url
    from urllib.parse import urlparse
    base_abs = (urlparse(cfg['base_url']).path.rstrip('/') + '/') if cfg.get('base_url') else '/'
    write(os.path.join(SITE, '404.html'), page(
        cfg, 'Page introuvable · {}'.format(cfg['site_name']),
        '<h1>Page introuvable</h1><p>Cette page n’existe pas ou a été déplacée.</p>'
        '<p><a href="{0}index.html">Revenir à la liste des œuvres</a></p>'.format(base_abs), base_abs, '404', '',
        status, tmdb_used))
    # page affichée hors connexion quand la page demandée n'a jamais été ouverte sur l'appareil
    write(os.path.join(SITE, 'hors-connexion.html'), page(
        cfg, 'Hors connexion · {}'.format(cfg['site_name']),
        '<h1>Hors connexion</h1><p>Cette page n’a pas encore été ouverte sur cet appareil : elle n’est pas '
        'disponible sans connexion.</p><p>Hors connexion, restent consultables la liste des œuvres, les deux '
        'frises (avec les fiches de leurs Archives) et les pages déjà ouvertes.</p>'
        '<ul><li><a href="index.html">Liste des œuvres</a></li><li><a href="concepts/a-astrolabe/index.html">'
        'Éphémérides</a></li><li><a href="concepts/c-horizon/index.html">Fil noir</a></li></ul>',
        '', 'hors-connexion', '', status, tmdb_used))
    write(os.path.join(SITE, 'comparer.html'), page(
        cfg, 'Comparer les versions · {}'.format(cfg['site_name']), compare_body(), '', 'comparer',
        'Les apparences du site pas encore décidées, côte à côte, avec le choix de la version.',
        status, tmdb_used))
    n_sw = write_service_worker(build_id, hashes)
    print('Site généré : {} fiches, build {} ; hors connexion : {} fichiers gardés dès la première visite.'.format(
        len(works), build_id, n_sw))
    return 0


if __name__ == '__main__':
    sys.exit(main())
