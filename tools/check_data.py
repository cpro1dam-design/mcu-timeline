# -*- coding: utf-8 -*-
"""Contrôles avant publication. Code de sortie 0 = publiable, 1 = erreurs (on garde la dernière
version valide), 2 = fichiers illisibles.

Usage : py -3 -X utf8 tools/check_data.py [--strict] [--json] [--today AAAA-MM-JJ]
                                          [--previous chemin/vers/works.json]

Contrôles :
- schéma (types, formats QID, dates ISO + précision, valeurs autorisées) ;
- provenance : chaque champ affiché a `src` et `ref` ;
- intégrité : références entre fichiers, identifiants uniques, ordres sans doublon ;
- règles d'usage : fraîcheur TMDB (< 170 jours), typographie française (pas de U+202F) ;
- contraste de TOUTES les palettes (ciel ≤ 0,06 de luminance, accent ≥ 4,5:1) et du code couleur des sagas et phases ;
- règles de périmètre (scope.json) : aucune œuvre d'une nature exclue (épisodes spéciaux), aucune
  œuvre sortie avant le relevé de l'ordre officiel (moins le délai de grâce) sans y figurer ;
- différences avec la dernière publication (`git show HEAD:data/build/works.json` par défaut) :
  le nombre d'œuvres ne baisse pas (sauf œuvres écartées par une règle de périmètre, listées dans
  status.json), la date d'une œuvre déjà sortie ne change pas, au plus 10 % des champs modifiés en
  un passage ;
- tests de non-régression sur la sémantique Wikidata (rangs, libellés « mul »).
"""
import argparse
import datetime
import io
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from pipeline import palettes as palmod  # noqa: E402
from pipeline import merge  # noqa: E402

QID = re.compile(r'^Q[1-9]\d*$')
DATE = {'day': re.compile(r'^\d{4}-\d{2}-\d{2}$'), 'month': re.compile(r'^\d{4}-\d{2}$'),
        'year': re.compile(r'^\d{4}$')}
SRC = {'wikidata', 'frwiki', 'tmdb', 'curated', 'derived'}
KINDS = {'film', 'series', 'special'}
TMDB_MAX_AGE_DAYS = 170

# Non-régression (constats vérifiés lors du diagnostic du 14/10/2026)
REGRESSION = [
    ('Q192724', 'phase', 1, 'Iron Man doit être en phase 1 (rang préféré P179 = MCU masquait la phase)'),
    ('Q54860489', 'phase', 4, 'Wakanda Forever doit être en phase 4'),
]
DOOMSDAY = 'Q113244839'


class Report(object):
    def __init__(self):
        self.errors, self.warnings = [], []

    def err(self, msg):
        self.errors.append(msg)

    def warn(self, msg):
        self.warnings.append(msg)


def load(path):
    with io.open(path, encoding='utf-8') as f:
        return json.load(f)


def check_sourced(r, where, obj, required=False):
    if obj is None:
        if required:
            r.err('{} : champ obligatoire manquant'.format(where))
        return
    if not isinstance(obj, dict) or 'v' not in obj:
        r.err('{} : champ non sourcé (objet {{v, src, ref, at}} attendu)'.format(where))
        return
    if obj.get('src') not in SRC:
        r.err('{} : source inconnue « {} »'.format(where, obj.get('src')))
    if not obj.get('ref'):
        r.err('{} : référence de source manquante'.format(where))
    if not obj.get('at'):
        r.warn('{} : date de relevé manquante'.format(where))


def check_text(r, where, text):
    if not isinstance(text, str):
        return
    if ' ' in text:
        r.err('{} : espace fine U+202F (absente des polices) — utiliser U+00A0'.format(where))
    if re.search(r'<[a-z/][^>]*>', text):
        r.err('{} : balise HTML dans un texte (risque d’injection)'.format(where))


def check_works(r, data, taxonomy, today):
    works = data.get('works', [])
    if data.get('schema_version') != 1:
        r.err('works.json : schema_version inattendu')
    ids, slugs = set(), set()
    orders = {'order_release': {}, 'story': {}}
    phases = {p['n'] for p in taxonomy['phases']}
    universes = {u['id'] for u in taxonomy['universes']}
    for w in works:
        wid = w.get('id', '?')
        tag = 'œuvre {} ({})'.format(wid, (w.get('title_fr') or {}).get('v', '?'))
        if not QID.match(wid):
            r.err('{} : identifiant non QID'.format(tag))
        if wid in ids:
            r.err('{} : identifiant en double'.format(tag))
        ids.add(wid)
        if w.get('slug') in slugs:
            r.err('{} : slug en double'.format(tag))
        slugs.add(w.get('slug'))
        if w.get('kind') not in KINDS:
            r.err('{} : type « {} » inconnu'.format(tag, w.get('kind')))
        check_sourced(r, tag + ' title_fr', w.get('title_fr'), required=True)
        check_text(r, tag + ' title_fr', (w.get('title_fr') or {}).get('v'))
        check_sourced(r, tag + ' title_original', w.get('title_original'))
        rel = w.get('release') or {}
        if not any(rel.get(k) for k in ('fr', 'us', 'first')):
            r.warn('{} : aucune date de sortie'.format(tag))
        for k in ('fr', 'us', 'first'):
            d = rel.get(k)
            if d:
                check_sourced(r, '{} release.{}'.format(tag, k), d)
                prec = d.get('precision')
                if prec not in DATE or not DATE[prec].match(str(d.get('v'))):
                    r.err('{} release.{} : date « {} » incohérente avec la précision « {} »'.format(
                        tag, k, d.get('v'), prec))
        if w.get('phase'):
            check_sourced(r, tag + ' phase', w['phase'])
            if w['phase']['v'] not in phases:
                r.err('{} : phase {} inconnue'.format(tag, w['phase']['v']))
        else:
            r.warn('{} : phase à préciser'.format(tag))
        if w.get('universe'):
            check_sourced(r, tag + ' universe', w['universe'])
            if w['universe']['v'] not in universes:
                r.err('{} : univers « {} » inconnu'.format(tag, w['universe']['v']))
        for k in ('presentation', 'plot'):
            t = w.get(k)
            if t:
                check_sourced(r, '{} {}'.format(tag, k), t)
                if t.get('src') == 'frwiki' and not w.get('frwiki', {}).get('revid'):
                    r.err('{} {} : texte Wikipédia sans révision citée'.format(tag, k))
                for i, para in enumerate(t.get('v') or []):
                    check_text(r, '{} {}[{}]'.format(tag, k, i), para)
        if w.get('plot') and w['plot'].get('spoiler') != 'work':
            r.err('{} : l’intrigue doit être marquée spoiler'.format(tag))
        for key in orders:
            o = w.get(key)
            if not o:
                r.err('{} : rang « {} » manquant'.format(tag, key))
                continue
            check_sourced(r, '{} {}'.format(tag, key), o)
            if o['v'] in orders[key]:
                r.err('{} : rang {} = {} déjà utilisé par {}'.format(tag, key, o['v'], orders[key][o['v']]))
            orders[key][o['v']] = wid
        for s in w.get('seasons') or []:
            if not s.get('src') or not s.get('ref'):
                r.err('{} saison {} : non sourcée'.format(tag, s.get('n')))
        for c in w.get('conflicts') or []:
            r.warn('{} : conflit {} {}'.format(tag, c.get('field'), c.get('values')))
    for key, seen in orders.items():
        if seen and sorted(seen) != list(range(1, len(seen) + 1)):
            r.err('rang « {} » : la suite n’est pas continue (1..{})'.format(key, len(seen)))
    # non-régression
    byid = {w['id']: w for w in works}
    for qid, field, expected, why in REGRESSION:
        w = byid.get(qid)
        if w is None:
            r.err('non-régression : {} absent ({})'.format(qid, why))
        elif (w.get(field) or {}).get('v') != expected:
            r.err('non-régression : {}'.format(why))
    endgame = byid.get('Q23781155')
    if endgame and not (endgame.get('title_fr') or {}).get('v'):
        r.err('non-régression : titre d’Endgame vide (libellés « mul » ignorés ?)')
    dd = byid.get(DOOMSDAY)
    if dd:
        for k in ('us', 'first'):
            if ((dd.get('release') or {}).get(k) or {}).get('v') == '2026-05-01':
                r.err('non-régression : date dépréciée de Doomsday (2026-05-01) utilisée')
    return byid


def check_characters(r, chars, work_ids):
    actors = {a['id'] for a in chars.get('actors', [])}
    characters = {c['id'] for c in chars.get('characters', [])}
    keys = set()
    for a in chars.get('appearances', []):
        k = (a.get('work'), a.get('actor'), a.get('character'))
        if k in keys:
            r.warn('apparition en double {}'.format(k))
        keys.add(k)
        if a.get('work') not in work_ids:
            r.err('apparition : œuvre {} inconnue'.format(a.get('work')))
        if a.get('actor') not in actors:
            r.err('apparition : acteur {} inconnu'.format(a.get('actor')))
        if a.get('character') and a['character'] not in characters:
            r.err('apparition : personnage {} inconnu'.format(a.get('character')))
        if a.get('level') is not None:
            check_sourced(r, 'apparition {} niveau'.format(k), a['level'])
            if a['level']['v'] not in ('principal', 'secondaire', 'cameo'):
                r.err('apparition {} : niveau inconnu'.format(k))
    for coll in ('actors', 'characters'):
        for p in chars.get(coll, []):
            if p.get('name'):
                check_sourced(r, '{} {}'.format(coll, p['id']), p['name'])


def check_curated(r, curated_dir, work_ids):
    story = load(os.path.join(curated_dir, 'story_order.json'))
    ref = story.get('reference', {})
    if not ref.get('url') or not ref.get('retrieved_at'):
        r.err('story_order.json : référence (url, date de relevé) manquante')
    seen = set()
    for e in story.get('order', []):
        if e.get('id'):
            if e['id'] in seen:
                r.err('story_order.json : {} en double'.format(e['id']))
            seen.add(e['id'])
            if e['id'] not in work_ids:
                r.warn('story_order.json : {} ({}) absent des œuvres publiées'.format(e['id'], e.get('title')))
    ov = load(os.path.join(curated_dir, 'overrides.json'))
    for group in ('universes', 'fields'):
        for e in ov.get(group, []):
            if not str(e.get('source', '')).startswith('http'):
                r.err('overrides.json/{} : entrée {} sans URL de source'.format(group, e.get('work')))
    scope = load(os.path.join(curated_dir, 'scope.json'))
    for group in ('include', 'exclude'):
        for e in scope.get(group, []):
            if not str(e.get('source', '')).startswith('http') or not e.get('reason'):
                r.err('scope.json/{} : entrée {} sans source ou raison'.format(group, e.get('id')))


def check_tmdb(r, tmdb_path, today):
    if not os.path.exists(tmdb_path):
        r.warn('TMDB : aucune donnée (clé absente) — affiches typographiques et accroches indisponibles')
        return
    d = load(tmdb_path)
    try:
        fetched = datetime.datetime.strptime(d.get('fetched_at', ''), '%Y-%m-%d').date()
    except ValueError:
        r.err('TMDB : date de récupération illisible')
        return
    age = (today - fetched).days
    if age > TMDB_MAX_AGE_DAYS:
        r.err('TMDB : données vieilles de {} jours (> {}) — CGU : cache limité à 6 mois'.format(
            age, TMDB_MAX_AGE_DAYS))


def check_palettes(r, works, taxonomy, tmdb):
    pals = palmod.build(works, taxonomy, tmdb)
    for wid, p in pals.items():
        if not p['ok']:
            r.err('palette {} : contraste insuffisant {}'.format(wid, p['contrast']))
    return pals


COLOR_BG = '#08080B'      # fond du site (base.css --bg)
COLOR_PANEL = '#16161C'   # panneau le plus clair (base.css --surface)


def check_colors(r, taxonomy):
    """Code couleur : chaque saga et chaque phase a une couleur lisible (≥ 4,5:1 sur le fond et les panneaux)."""
    from pipeline import oklch as ok
    seen = {}
    for kind, items, key in (('saga', taxonomy.get('sagas', []), 'id'), ('phase', taxonomy.get('phases', []), 'n')):
        for it in items:
            c = it.get('color')
            if not c:
                r.warn('code couleur : {} {} sans couleur (repli neutre)'.format(kind, it.get(key)))
                continue
            low = min(ok.contrast(c, COLOR_BG), ok.contrast(c, COLOR_PANEL))
            if low < 4.5:
                r.err('code couleur : {} {} {} trop peu contrastée ({:.2f}:1)'.format(kind, it.get(key), c, low))
            if kind == 'phase':
                if c.upper() in seen:
                    r.err('code couleur : phases {} et {} ont la même couleur'.format(seen[c.upper()], it.get('n')))
                seen[c.upper()] = it.get('n')


def previous_works(path):
    if path:
        return load(path) if os.path.exists(path) else None
    try:
        out = subprocess.check_output(['git', 'show', 'HEAD:data/build/works.json'], cwd=ROOT,
                                      stderr=subprocess.DEVNULL)
        return json.loads(out.decode('utf-8'))
    except (subprocess.CalledProcessError, OSError, ValueError):
        return None


def check_scope(r, works, scope, story):
    """Les règles de périmètre tiennent dans les données publiées (garde-fou si une étape est sautée)."""
    excl = scope.get('excluded_kinds', {})
    for w in works:
        if w.get('kind') in excl:
            r.err('périmètre : {} est de nature exclue ({})'.format(w['id'], w['kind']))
    _, out = merge.official_order_exclusions(works, story, scope.get('official_order_rule'))
    for x in out:
        r.err('périmètre : {} {}'.format(x['id'], x['reason']))


def check_diff(r, prev, cur_byid, today_s, excluded=()):
    if not prev:
        r.warn('diff : pas de version publiée précédente (premier passage)')
        return
    gone = {x['id']: x for x in excluded}
    prev_byid = {w['id']: w for w in prev.get('works', [])}
    for wid in list(prev_byid):
        if wid not in cur_byid and wid in gone:
            r.warn('diff : œuvre {} retirée par une règle de périmètre ({})'.format(
                wid, gone[wid].get('short') or gone[wid]['reason']))
            del prev_byid[wid]
    if len(cur_byid) < len(prev_byid):
        r.err('diff : le nombre d’œuvres baisse ({} → {})'.format(len(prev_byid), len(cur_byid)))
    changed = total = 0
    for wid, pw in prev_byid.items():
        cw = cur_byid.get(wid)
        if not cw:
            r.err('diff : œuvre {} disparue'.format(wid))
            continue
        for k in ('fr', 'us'):
            pv = ((pw.get('release') or {}).get(k) or {}).get('v')
            cv = ((cw.get('release') or {}).get(k) or {}).get('v')
            if pv and len(pv) == 10 and pv <= today_s and cv != pv:
                r.err('diff : date de sortie {} de l’œuvre déjà sortie {} modifiée ({} → {})'.format(
                    k, wid, pv, cv))
        for field in ('title_fr', 'title_original', 'phase', 'presentation', 'plot', 'universe'):
            total += 1
            if (pw.get(field) or {}).get('v') != (cw.get(field) or {}).get('v'):
                changed += 1
    if total and changed / float(total) > 0.10:
        r.err('diff : {:.0%} des champs modifiés en un passage (> 10 %) — vérification humaine requise'.format(
            changed / float(total)))


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--strict', action='store_true', help='les avertissements deviennent des erreurs')
    ap.add_argument('--json', action='store_true')
    ap.add_argument('--today', default=None)
    ap.add_argument('--previous', default=None)
    args = ap.parse_args(argv)
    today = (datetime.datetime.strptime(args.today, '%Y-%m-%d').date() if args.today
             else datetime.date.today())
    r = Report()
    try:
        taxonomy = load(os.path.join(ROOT, 'data', 'curated', 'taxonomy.json'))
        works = load(os.path.join(ROOT, 'data', 'build', 'works.json'))
        chars = load(os.path.join(ROOT, 'data', 'build', 'characters.json'))
    except (OSError, ValueError) as e:
        print('Fichiers illisibles : {}'.format(e))
        return 2
    curated = os.path.join(ROOT, 'data', 'curated')
    scope = load(os.path.join(curated, 'scope.json'))
    story = load(os.path.join(curated, 'story_order.json'))
    status_path = os.path.join(ROOT, 'data', 'build', 'status.json')
    status = load(status_path) if os.path.exists(status_path) else {}
    tmdb_path = os.path.join(ROOT, 'data', 'tmdb', 'tmdb.json')
    tmdb = load(tmdb_path) if os.path.exists(tmdb_path) else None
    byid = check_works(r, works, taxonomy, today)
    check_characters(r, chars, set(byid))
    check_curated(r, os.path.join(ROOT, 'data', 'curated'), set(byid))
    check_tmdb(r, tmdb_path, today)
    check_palettes(r, works.get('works', []), taxonomy, tmdb)
    check_colors(r, taxonomy)
    check_scope(r, works.get('works', []), scope, story)
    check_diff(r, previous_works(args.previous), byid, today.isoformat(), status.get('excluded', []))
    if args.strict:
        r.errors += r.warnings
        r.warnings = []
    if args.json:
        print(json.dumps({'errors': r.errors, 'warnings': r.warnings}, ensure_ascii=False, indent=2))
    else:
        for w in r.warnings:
            print('AVERTISSEMENT  ' + w)
        for e in r.errors:
            print('ERREUR         ' + e)
        print('\n{} erreur(s), {} avertissement(s) — {}'.format(
            len(r.errors), len(r.warnings), 'publication BLOQUÉE' if r.errors else 'publiable'))
    return 1 if r.errors else 0


if __name__ == '__main__':
    sys.exit(main())
