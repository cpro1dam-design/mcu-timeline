# -*- coding: utf-8 -*-
"""Mise à jour des données sourcées.

Usage :
    py -3 -X utf8 tools/update.py [--refresh] [--no-frwiki] [--no-tmdb] [--today AAAA-MM-JJ]

Étapes : découverte (Wikidata × Wikipédia FR × TMDB) → détails Wikidata → textes Wikipédia (révision
figée) → fusion → écriture de data/build/*.json. Les données TMDB sont récupérées par
`pipeline/fetch_tmdb.py` (si une clé est disponible) et restent hors git (data/tmdb/).
Lancer ensuite `tools/check_data.py` : la publication n'a lieu que s'il réussit.
"""
import argparse
import datetime
import io
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from pipeline.http import Http, HttpError  # noqa: E402
from pipeline.wikidata import Wikidata  # noqa: E402
from pipeline import wikidata as wd  # noqa: E402
from pipeline.frwiki import FrWiki, html_to_paragraphs, france_release  # noqa: E402
from pipeline.discover import discover  # noqa: E402
from pipeline import merge  # noqa: E402

CURATED = os.path.join(ROOT, 'data', 'curated')
BUILD = os.path.join(ROOT, 'data', 'build')
TMDB_DIR = os.path.join(ROOT, 'data', 'tmdb')
SCHEMA_VERSION = 1


def load(path, default=None):
    if not os.path.exists(path):
        return default
    with io.open(path, encoding='utf-8') as f:
        return json.load(f)


def save(path, data):
    d = os.path.dirname(path)
    if not os.path.isdir(d):
        os.makedirs(d)
    tmp = path + '.tmp'
    with io.open(tmp, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=False)
        f.write('\n')
    os.replace(tmp, path)


def log(msg):
    print(msg, flush=True)


def fetch_texts(F, accepted, ents, log, max_intro_paras=1):
    texts = {}
    for i, acc in enumerate(accepted, 1):
        qid = acc['id']
        title = wd.sitelink(ents.get(qid, {}), 'frwiki')
        if not title:
            continue
        try:
            rev = F.pinned_revision(title)
            if not rev:
                continue
            intro_html, parts, secs = F.revision_sections(rev['revid'])
            intro = html_to_paragraphs(intro_html)[:max_intro_paras]
            idx, line, anchor = F.find_synopsis_index(secs)
            plot = html_to_paragraphs(parts.get(anchor, '')) if anchor else []
            fr_date, fr_quote = france_release(getattr(F, 'last_wikitext', ''))
            texts[qid] = {'title': rev['title'], 'revid': rev['revid'],
                          'timestamp': rev['timestamp'], 'intro': intro or None,
                          'plot': plot or None, 'plot_section': line,
                          'young_revision': bool(rev.get('young')),
                          'fr_date': fr_date, 'fr_quote': fr_quote}
        except HttpError as e:
            log('  ! frwiki {} : {}'.format(title, e))
        if i % 10 == 0:
            log('  textes : {}/{}'.format(i, len(accepted)))
    return texts


def changelog(prev, works, at, excluded=()):
    """Journal lisible des changements (œuvres ajoutées, dates, placements confirmés)."""
    path = os.path.join(BUILD, 'changelog.json')
    log_data = load(path, {'entries': []})
    entries = []
    title = lambda w: (w.get('title_fr') or {}).get('v') or w['id']
    if not prev:
        entries.append({'date': at, 'text': 'Premier relevé : {} œuvres.'.format(len(works))})
    else:
        old = {w['id']: w for w in prev.get('works', [])}
        cur = {w['id'] for w in works}
        why = {x['id']: x.get('short') or x['reason'] for x in excluded}
        for wid, o in old.items():
            if wid not in cur:
                entries.append({'date': at, 'text': 'Œuvre retirée : {}{}.'.format(
                    title(o), ' ({})'.format(why[wid]) if wid in why else '')})
        for w in works:
            o = old.get(w['id'])
            if not o:
                entries.append({'date': at, 'text': 'Nouvelle œuvre : {}.'.format(title(w))})
                continue
            for k, lab in (('fr', 'France'), ('us', 'États-Unis')):
                a = ((o.get('release') or {}).get(k) or {}).get('v')
                b = ((w.get('release') or {}).get(k) or {}).get('v')
                if a != b and b:
                    entries.append({'date': at, 'text': 'Date de sortie ({}) de {} : {} → {}.'.format(
                        lab, title(w), a or 'inconnue', b)})
            if (o.get('story') or {}).get('provisional') and not (w.get('story') or {}).get('provisional'):
                entries.append({'date': at, 'text': 'Place dans l’histoire confirmée : {}.'.format(title(w))})
    if entries:
        log_data['entries'] = (entries + log_data.get('entries', []))[:300]
        save(path, log_data)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--refresh', action='store_true', help='ignore le cache HTTP')
    ap.add_argument('--no-frwiki', action='store_true', help='ne récupère pas les textes Wikipédia')
    ap.add_argument('--today', default=None, help='date de relevé (défaut : aujourd’hui UTC)')
    args = ap.parse_args(argv)

    at = args.today or datetime.datetime.utcnow().strftime('%Y-%m-%d')
    http = Http(min_interval=1.0, refresh=args.refresh)
    W, F = Wikidata(http), FrWiki(http)

    tax = load(os.path.join(CURATED, 'taxonomy.json'))
    scope = load(os.path.join(CURATED, 'scope.json'))
    story = load(os.path.join(CURATED, 'story_order.json'), {'order': []})
    overrides = load(os.path.join(CURATED, 'overrides.json'), {})
    slugs = load(os.path.join(CURATED, 'slugs.json'), {})

    tmdb = load(os.path.join(TMDB_DIR, 'tmdb.json'), {})
    tmdb_qids = tmdb.get('discovery_qids', []) if tmdb else []

    status = {'schema_version': SCHEMA_VERSION, 'checked_at': at, 'sources': {}}
    log('1/4 Découverte…')
    try:
        accepted, quarantine, excluded, ents, page_revs = discover(W, F, tax, scope, tmdb_qids, log=log)
        status['sources']['wikidata'] = {'ok': True, 'at': at}
        status['sources']['frwiki'] = {'ok': True, 'at': at,
                                       'discovery_pages': page_revs}
    except HttpError as e:
        log('ÉCHEC découverte : {}'.format(e))
        return 2
    status['sources']['tmdb'] = ({'ok': True, 'at': tmdb.get('fetched_at')} if tmdb
                                 else {'ok': False, 'reason': 'pas de données TMDB (clé absente)'})
    log('  {} œuvres retenues, {} en quarantaine'.format(len(accepted), len(quarantine)))

    log('2/4 Personnes (réalisateurs, distribution, personnages)…')
    people = set()
    for acc in accepted:
        e = ents[acc['id']]
        people.update(wd.item_ids(e, 'P57'))
        for c in wd.statements(e, 'P161'):
            a = wd.item_id(c)
            if a:
                people.add(a)
            people.update(wd.qualifier_items(c, 'P453'))
    people_ents = W.entities(sorted(people), props='labels|aliases|claims', languages='fr|mul|en')  # alias : « Iron Man » pour Tony Stark
    people_names = {q: wd.label(e)[0] for q, e in people_ents.items()}

    texts = {}
    if not args.no_frwiki:
        log('3/4 Textes Wikipédia (révisions figées)…')
        texts = fetch_texts(F, accepted, ents, log)

    log('4/4 Fusion…')
    works = [merge.build_work(acc, ents[acc['id']], tax, overrides, slugs, texts, people_names, at)
             for acc in accepted]
    works, off_order = merge.official_order_exclusions(works, story, scope.get('official_order_rule'))
    for x in off_order:
        log('  écartée (ordre officiel) : {} — {}'.format(x['label'], x['reason']))
    excluded += off_order
    merge.assign_orders(works, story, at)
    works.sort(key=lambda w: w['order_release']['v'])
    chars = merge.build_characters({w['id']: ents[w['id']] for w in works}, people_ents, at)

    counts = {'works': len(works)}
    for k in ('film', 'series', 'special'):
        counts[k] = sum(1 for w in works if w['kind'] == k)
    status['counts'] = counts
    status['quarantine'] = quarantine
    status['excluded'] = excluded
    status['conflicts'] = [dict(c, work=w['id']) for w in works for c in w['conflicts']]
    status['provisional_story'] = [w['id'] for w in works if w['story'] and w['story'].get('provisional')]
    status['http_requests'] = http.requests_made

    changelog(load(os.path.join(BUILD, 'works.json')), works, at, excluded)
    save(os.path.join(BUILD, 'works.json'), {'schema_version': SCHEMA_VERSION,
                                             'generated_at': at, 'works': works})
    save(os.path.join(BUILD, 'characters.json'), dict({'schema_version': SCHEMA_VERSION,
                                                       'generated_at': at}, **chars))
    save(os.path.join(BUILD, 'status.json'), status)
    save(os.path.join(CURATED, 'slugs.json'), dict(sorted(slugs.items())))
    log('Terminé : {} œuvres ({films} films, {series} séries, {special} spéciaux) ; '
        '{x} écartées par une règle ; {q} en quarantaine ; {c} conflits ; {p} placements provisoires.'.format(
            counts['works'], films=counts['film'], series=counts['series'],
            special=counts['special'], x=len(excluded), q=len(quarantine), c=len(status['conflicts']),
            p=len(status['provisional_story'])))
    return 0


if __name__ == '__main__':
    sys.exit(main())
