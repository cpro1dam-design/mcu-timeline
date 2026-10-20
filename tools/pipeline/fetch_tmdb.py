# -*- coding: utf-8 -*-
"""Récupération des données TMDB (accroche fr-FR, titres, dates FR/US, distribution, affiches).

Règles (CGU TMDB) :
- traitement uniquement par ce script déterministe ; les sorties restent hors git (data/tmdb/,
  site/media/tmdb/) et sont rafraîchies au moins tous les 6 mois (la CI le fait chaque semaine) ;
- affiches enregistrées telles que fournies (JPEG), sans conversion ni recadrage (pas d'œuvre dérivée) ;
- attribution affichée sur le site : « This product uses the TMDB API but is not endorsed or certified
  by TMDB. » + logo TMDB.

Clé : variable d'environnement TMDB_TOKEN (jeton « API Read Access Token », envoyé en Bearer) ou
TMDB_API_KEY (clé v3), sinon première ligne non commentée de tools/tmdb_key.txt. La clé n'est
jamais affichée ni écrite ailleurs.

Usage : py -3 -X utf8 tools/pipeline/fetch_tmdb.py [--no-posters] [--only Q1,Q2]
"""
import argparse
import datetime
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
ROOT = os.path.dirname(TOOLS)
# lancé comme script, ce dossier passe en tête de sys.path : pipeline/http.py masquerait alors
# le module http de Python (urllib.request ne se chargerait plus)
if sys.path and os.path.abspath(sys.path[0] or os.curdir) == HERE:
    sys.path.pop(0)
sys.path.insert(0, TOOLS)

from pipeline.http import Http, HttpError  # noqa: E402

API = 'https://api.themoviedb.org/3'
IMG = 'https://image.tmdb.org/t/p/'
OUT = os.path.join(ROOT, 'data', 'tmdb', 'tmdb.json')
MEDIA = os.path.join(ROOT, 'site', 'media', 'tmdb')
ATTRIBUTION = 'This product uses the TMDB API but is not endorsed or certified by TMDB.'
COMPANY_MARVEL_STUDIOS = 420
KEYWORD_MCU = 180547
KEY_LIKE = re.compile(r'eyJ[\w-]{20,}|[0-9a-f]{32}')  # jeton v4 ou clé v3
PRINCIPAL_MAX_ORDER = 5   # rang 0 à 5 = 6 premiers noms au générique
UNCREDITED = re.compile(r'\((?:uncredited|non crédité|non créditée)\)', re.I)


def key_from_text(text):
    """Première ligne non vide qui ne commence pas par # : le secret GitHub peut ainsi recevoir tout le
    contenu de tools/tmdb_key.txt, commentaires compris, sans que la clé soit faussée."""
    for line in (text or '').splitlines():
        line = line.strip()
        if line and not line.startswith('#'):
            return line
    return None


def read_key():
    for var in ('TMDB_TOKEN', 'TMDB_API_KEY'):
        v = key_from_text(os.environ.get(var, ''))
        if v:
            return v
    p = os.path.join(TOOLS, 'tmdb_key.txt')
    if os.path.exists(p):
        in_comment = False
        with io.open(p, encoding='utf-8-sig') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    return line
                if KEY_LIKE.search(line):
                    in_comment = True
        if in_comment:
            # la clé n'est jamais affichée : on signale seulement où elle se trouve
            print('  ! tools/tmdb_key.txt : la clé semble collée dans une ligne de commentaire (qui commence '
                  'par #). Mettez-la seule sur une nouvelle ligne, tout en bas du fichier.')
    return None


class Tmdb(object):
    def __init__(self, key, http):
        self.http = http
        if key.startswith('eyJ'):
            self.params, self.headers = {}, {'Authorization': 'Bearer ' + key}
        else:
            self.params, self.headers = {'api_key': key}, {}

    def get(self, path, **params):
        p = dict(self.params)
        p.update(params)
        # la clé n'entre jamais dans la clé de cache
        cache_key = API + path + '?' + '&'.join('{}={}'.format(k, v) for k, v in sorted(params.items()))
        return self.http.get_json(API + path, p, headers=self.headers, cache_key=cache_key)

    def discover_ids(self):
        out = {'movie': set(), 'tv': set()}
        for kind, extra in (('movie', {'with_keywords': KEYWORD_MCU}), ('tv', {})):
            page = 1
            while True:
                d = self.get('/discover/' + kind, with_companies=COMPANY_MARVEL_STUDIOS,
                             page=page, language='fr-FR', **extra)
                for r in d.get('results', []):
                    out[kind].add(r['id'])
                if page >= d.get('total_pages', 1) or page >= 20:
                    break
                page += 1
        return out


def release_from_dates(release_dates, country):
    for block in release_dates.get('results', []):
        if block.get('iso_3166_1') != country:
            continue
        ranked = sorted(block.get('release_dates', []), key=lambda r: {3: 0, 2: 1, 1: 2}.get(r.get('type'), 9))
        for r in ranked:
            if r.get('release_date'):
                return r['release_date'][:10]
    return None


def credits_list(cast, at, ref):
    out = []
    for c in cast:
        character = c.get('character') or ''
        if 'roles' in c:  # aggregate_credits (séries)
            character = ' / '.join(r.get('character', '') for r in c['roles'] if r.get('character'))
        order = c.get('order')
        uncredited = bool(UNCREDITED.search(character))
        if uncredited:
            level, rule = 'cameo', 'mention « uncredited » sur TMDB'
        elif order is not None and order <= PRINCIPAL_MAX_ORDER:
            level, rule = 'principal', 'rang au générique TMDB ≤ 6'
        else:
            level, rule = 'secondaire', 'rang au générique TMDB > 6'
        out.append({'person': c.get('id'), 'name': c.get('name'),
                    'character': UNCREDITED.sub('', character).strip() or None,
                    'order': order, 'level': level, 'rule': rule, 'ref': ref, 'at': at})
    return out


def fetch(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--no-posters', action='store_true')
    ap.add_argument('--only', default='')
    args = ap.parse_args(argv)
    key = read_key()
    if not key:
        print('Pas de clé TMDB : étape ignorée (voir README, section TMDB).')
        return 0
    at = datetime.datetime.utcnow().strftime('%Y-%m-%d')
    http = Http(min_interval=0.25, cache_ttl=6 * 3600)
    T = Tmdb(key, http)
    with io.open(os.path.join(ROOT, 'data', 'build', 'works.json'), encoding='utf-8') as f:
        works = json.load(f)['works']
    only = set(filter(None, args.only.split(',')))
    result = {'fetched_at': at, 'attribution': ATTRIBUTION, 'works': {}, 'discovery_qids': [],
              'unmatched_discovery': []}
    by_tmdb = {}
    for w in works:
        if w.get('tmdb'):
            by_tmdb[(w['tmdb']['type'], w['tmdb']['v'])] = w['id']
    try:
        disc = T.discover_ids()
        for kind, ids in disc.items():
            for i in sorted(ids):
                q = by_tmdb.get((kind, i))
                if q:
                    result['discovery_qids'].append(q)
                else:
                    result['unmatched_discovery'].append({'type': kind, 'id': i})
    except HttpError as e:
        print('  ! découverte TMDB : {}'.format(e))
    for w in works:
        if only and w['id'] not in only:
            continue
        t = w.get('tmdb')
        if not t:
            continue
        kind, tid = t['type'], t['v']
        ref = 'tmdb:{}/{}'.format(kind, tid)
        try:
            if kind == 'movie':
                d = T.get('/movie/{}'.format(tid), language='fr-FR',
                          append_to_response='release_dates,credits')
                rec = {'title_fr': d.get('title'), 'title_original': d.get('original_title'),
                       'original_language': d.get('original_language'),
                       'release_fr': release_from_dates(d.get('release_dates', {}), 'FR'),
                       'release_us': release_from_dates(d.get('release_dates', {}), 'US'),
                       'cast': credits_list(d.get('credits', {}).get('cast', []), at, ref)}
            else:
                d = T.get('/tv/{}'.format(tid), language='fr-FR',
                          append_to_response='aggregate_credits')
                rec = {'title_fr': d.get('name'), 'title_original': d.get('original_name'),
                       'original_language': d.get('original_language'),
                       'first_air_date': d.get('first_air_date'),
                       'cast': credits_list(d.get('aggregate_credits', {}).get('cast', []), at, ref)}
            rec.update({'overview': (d.get('overview') or '').strip() or None,
                        'poster_path': d.get('poster_path'), 'ref': ref, 'at': at})
            if rec['poster_path'] and not args.no_posters:
                for size in ('w342', 'w780'):
                    name = '{}-{}-{}.jpg'.format(kind, tid, size)
                    dest = os.path.join(MEDIA, name)
                    http.download(IMG + size + rec['poster_path'], dest)
                    rec['poster_' + size] = 'media/tmdb/' + name
            result['works'][w['id']] = rec
        except HttpError as e:
            print('  ! TMDB {} ({}) : {}'.format(w['id'], ref, e))
    d = os.path.dirname(OUT)
    if not os.path.isdir(d):
        os.makedirs(d)
    tmp = OUT + '.tmp'
    with io.open(tmp, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    os.replace(tmp, OUT)
    # affiches des œuvres sorties du périmètre (ou remplacées) : retirées du dossier local
    pruned = 0
    if not args.no_posters and not args.only and os.path.isdir(MEDIA):
        keep = {os.path.basename(v) for rec in result['works'].values() for k, v in rec.items()
                if k.startswith('poster_') and k != 'poster_path' and v}
        for name in os.listdir(MEDIA):
            if name not in keep and os.path.isfile(os.path.join(MEDIA, name)):
                os.remove(os.path.join(MEDIA, name))
                pruned += 1
    if pruned:
        print('TMDB : {} affiches inutilisées retirées.'.format(pruned))
    print('TMDB : {} œuvres, {} trouvées par la découverte, {} non rapprochées.'.format(
        len(result['works']), len(result['discovery_qids']), len(result['unmatched_discovery'])))
    return 0


if __name__ == '__main__':
    sys.exit(fetch())
