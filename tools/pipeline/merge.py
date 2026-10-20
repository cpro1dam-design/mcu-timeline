# -*- coding: utf-8 -*-
"""Fusion des sources en `data/build/works.json` et `characters.json`.

Aucune valeur n'est inventée : chaque champ est un objet sourcé {v, src, ref, at}. Quand une source
manque, le champ vaut null (l'interface affiche « non renseigné »).
"""
import datetime
import re
import unicodedata

from . import wikidata as wd
from . import frwiki as fw

DISAMBIG = re.compile(r'\s*\((?:film|série|mini-série|série télévisée|série d’animation|'
                      r'série d\'animation|téléfilm|émission)[^)]*\)\s*$', re.I)


def sourced(v, src, ref, at, **extra):
    d = {'v': v, 'src': src, 'ref': ref, 'at': at}
    d.update(extra)
    return d


def slugify(text):
    t = unicodedata.normalize('NFKD', text or '').encode('ascii', 'ignore').decode('ascii')
    t = re.sub(r'[^a-zA-Z0-9]+', '-', t).strip('-').lower()
    return t or 'oeuvre'


def nbsp_fr(text):
    """Espaces insécables françaises (U+00A0) avant : ; ! ? » et après «, sans toucher au texte."""
    if not text:
        return text
    text = re.sub(r' ([:;!?»])', ' \\1', text)
    text = text.replace('« ', '« ').replace(' ', ' ')
    return text


# -- dates ------------------------------------------------------------------

def release_dates(ent, qid, at):
    """P577 → {'fr', 'us', 'first'} + conflits. Rang déprécié ignoré."""
    by_place = {}
    unplaced = []
    allvals = []
    for c in wd.statements(ent, 'P577'):
        date, prec = wd.time_value(wd.value(c))
        if not date:
            continue
        rec = {'date': date, 'prec': prec, 'rank': c.get('rank')}
        allvals.append(rec)
        places = wd.qualifier_items(c, 'P291')
        if not places:
            unplaced.append(rec)
        for p in places:
            by_place.setdefault(p, []).append(rec)
    conflicts = []

    def pick(recs, field):
        if not recs:
            return None
        order = {'day': 0, 'month': 1, 'year': 2}
        recs = sorted(recs, key=lambda r: (r['rank'] != 'preferred', order[r['prec']], r['date']))
        days = {r['date'] for r in recs if r['prec'] == 'day'}
        if len(days) > 1:
            conflicts.append({'field': field, 'values': sorted(days),
                              'note': 'plusieurs dates Wikidata pour le même pays'})
        r = recs[0]
        return sourced(r['date'], 'wikidata', qid + '#P577', at, precision=r['prec'])

    out = {'fr': pick(by_place.get(wd.Q_FRANCE), 'release.fr'),
           'us': pick(by_place.get(wd.Q_USA), 'release.us')}
    if not out['us'] and len({r['date'] for r in unplaced}) == 1:
        # date sans lieu, unique : considérée comme date de sortie générale
        out['first'] = sourced(unplaced[0]['date'], 'wikidata', qid + '#P577', at,
                               precision=unplaced[0]['prec'], note='date sans pays précisé')
    elif allvals:
        order = {'day': 0, 'month': 1, 'year': 2}
        best = sorted(allvals, key=lambda r: (r['date'][:4], order[r['prec']], r['date']))[0]
        earliest = sorted([r for r in allvals if r['prec'] == best['prec']],
                          key=lambda r: r['date'])[0]
        out['first'] = sourced(earliest['date'], 'wikidata', qid + '#P577', at,
                               precision=earliest['prec'])
    else:
        out['first'] = None
    return out, conflicts


def sort_date(work):
    rel = work['release']
    for k in ('fr', 'us', 'first'):
        if rel.get(k):
            d = rel[k]['v']
            return (d + '-99-99')[:10] if len(d) < 10 else d
    return '9999-99-99'


# -- fusion principale -----------------------------------------------------

def build_work(acc, ent, tax, overrides, slugs, texts, people, at):
    qid = acc['id']
    phase_by_qid = {p['qid']: p for p in tax['phases']}
    saga_by_qid = {s['qid']: s for s in tax['sagas']}
    saga_by_id = {s['id']: s for s in tax['sagas']}
    conflicts = []

    # titres
    frtitle = wd.sitelink(ent, 'frwiki')
    t = texts.get(qid) or {}
    if frtitle:
        title_fr = sourced(nbsp_fr(DISAMBIG.sub('', frtitle)), 'frwiki',
                           'frwiki:{}@{}#titre'.format(frtitle, t.get('revid', '')), at)
    else:
        lbl, lang = wd.label(ent, ('fr', 'mul'))
        title_fr = sourced(nbsp_fr(lbl), 'wikidata', qid + '#label-' + (lang or 'fr'), at) if lbl else None
    title_orig = None
    for c in wd.best_statements(ent, 'P1476'):
        text, lang = wd.monolingual(c)
        if text:
            title_orig = sourced(text, 'wikidata', qid + '#P1476', at, lang=(lang or 'en').split('-')[0])
            break
    if not title_orig:
        en = wd.sitelink(ent, 'enwiki')
        if en:
            title_orig = sourced(DISAMBIG.sub('', re.sub(r'\s*\([^)]*\)\s*$', '', en)), 'wikidata',
                                 qid + '#sitelink-enwiki', at, lang='en')

    release, c2 = release_dates(ent, qid, at)
    conflicts += c2

    # phase / saga : Wikidata P179, sinon tableau de l'article de phase frwiki
    rows = acc.get('frwiki_rows') or []
    phases = [phase_by_qid[i] for i in wd.item_ids(ent, 'P179') if i in phase_by_qid]
    phase = None
    if phases:
        if len({p['n'] for p in phases}) > 1:
            conflicts.append({'field': 'phase', 'values': sorted({p['n'] for p in phases}),
                              'note': 'plusieurs phases Wikidata'})
        phase = sourced(phases[0]['n'], 'wikidata', qid + '#P179', at)
    if rows:
        first_row = sorted(rows, key=lambda r: (r['phase'], r.get('season') or 0))[0]
        table_phase = sourced(first_row['phase'], 'frwiki', 'frwiki:{}@{}#tableau'.format(
            first_row['page'], first_row['revid']), at)
        if phase and phase['v'] != first_row['phase']:
            conflicts.append({'field': 'phase', 'values': [first_row['phase'], phase['v']],
                              'note': 'tableau de l’article de phase (retenu) et Wikidata diffèrent'})
        phase = table_phase   # liste tenue par phase et saison : prioritaire sur P179
    ov_phase = _override(overrides, qid, 'phase')
    if ov_phase:
        phase = sourced(ov_phase['value'], 'curated', ov_phase['source'], at, quote=ov_phase.get('quote'))
    saga = None
    if phase:
        saga_id = next(p['saga'] for p in tax['phases'] if p['n'] == phase['v'])
        saga = sourced(saga_id, 'derived', 'rule:saga-from-phase', at)
    else:
        sagas = [saga_by_qid[i] for i in wd.item_ids(ent, 'P179') if i in saga_by_qid]
        if sagas:
            saga = sourced(sagas[0]['id'], 'wikidata', qid + '#P179', at)

    # saisons (séries) et dates des tableaux frwiki
    seasons = []
    for r in sorted(rows, key=lambda r: (r.get('season') or 0)):
        if r['category'] != 'series' or not r.get('season'):
            continue
        ref = 'frwiki:{}@{}#tableau'.format(r['page'], r['revid'])
        s = {'n': r['season'], 'phase': r['phase'], 'episodes': r.get('episodes'),
             'src': 'frwiki', 'ref': ref, 'at': at}
        for k in ('first', 'last'):
            if r['dates'].get(k):
                s[k] = {'v': r['dates'][k][0], 'precision': r['dates'][k][1]}
        seasons.append(s)
    for r in rows:
        for country in ('fr', 'us'):
            d = r['dates'].get(country)
            if not d:
                continue
            ref = 'frwiki:{}@{}#tableau'.format(r['page'], r['revid'])
            cur = release.get(country)
            if not cur:
                release[country] = sourced(d[0], 'frwiki', ref, at, precision=d[1])
            elif cur['v'] != d[0] and cur.get('precision') == 'day' and d[1] == 'day':
                conflicts.append({'field': 'release.' + country, 'values': [cur['v'], d[0]],
                                  'note': 'Wikidata et l’article de phase frwiki diffèrent'})

    # date française citée dans l'article de l'œuvre (liste « Dates de sortie ») : prioritaire
    if t.get('fr_date'):
        cur = release.get('fr')
        if cur and cur['v'] != t['fr_date']:
            conflicts.append({'field': 'release.fr', 'values': [t['fr_date'], cur['v']],
                              'note': 'article Wikipédia (retenu) et {} diffèrent'.format(cur['src'])})
        release['fr'] = sourced(t['fr_date'], 'frwiki', 'frwiki:{}@{}#dates-de-sortie'.format(
            t['title'], t['revid']), at, precision='day', quote=t.get('fr_quote'))
    # séries : sans date Wikidata, première diffusion de la première saison (tableau frwiki)
    if not any(release.get(k) for k in ('fr', 'us', 'first')) and seasons and seasons[0].get('first'):
        s0 = seasons[0]
        release['first'] = sourced(s0['first']['v'], 'frwiki', s0['ref'], at,
                                   precision=s0['first']['precision'], note='première diffusion de la saison 1')

    # univers
    uni = next((u for u in overrides.get('universes', []) if u['work'] == qid), None)
    universe = (sourced(uni['universe'], 'curated', uni['source'], at, quote=uni.get('quote'))
                if uni else sourced('earth-616', 'derived', 'rule:default-universe', at))

    # textes Wikipédia
    frwiki = None
    presentation = plot = None
    if t.get('revid'):
        frwiki = {'title': t['title'], 'revid': t['revid'], 'rev_timestamp': t['timestamp'],
                  'url': fw.permalink(t['revid']), 'article_url': fw.article_url(t['title'])}
        if t.get('intro'):
            presentation = sourced(t['intro'], 'frwiki', 'frwiki:{}@{}#0'.format(t['title'], t['revid']),
                                   at, modified=True)
        if t.get('plot'):
            plot = sourced(t['plot'], 'frwiki', 'frwiki:{}@{}#{}'.format(t['title'], t['revid'],
                                                                       t.get('plot_section', 'Synopsis')),
                           at, modified=True, spoiler='work')

    directors = []
    for d in wd.item_ids(ent, 'P57'):
        name = people.get(d)
        if name:
            directors.append(sourced(name, 'wikidata', qid + '#P57', at, id=d))
    runtime = None
    for c in wd.best_statements(ent, 'P2047'):
        q = wd.quantity(wd.value(c))
        if q:
            runtime = sourced(int(round(q)), 'wikidata', qid + '#P2047', at)
            break
    tmdb = None
    for prop, typ in (('P4947', 'movie'), ('P4983', 'tv')):
        for c in wd.best_statements(ent, prop):
            s = wd.string_value(c)
            if s and s.isdigit():
                tmdb = sourced(int(s), 'wikidata', qid + '#' + prop, at, type=typ)
                break
        if tmdb:
            break

    if qid not in slugs:
        base = slugify((title_fr or {}).get('v') or (title_orig or {}).get('v') or qid)
        used = set(slugs.values())
        s, i = base, 2
        while s in used:
            s = '{}-{}'.format(base, i)
            i += 1
        slugs[qid] = s

    return {
        'id': qid, 'slug': slugs[qid], 'kind': acc['kind'],
        'title_fr': title_fr, 'title_original': title_orig,
        'release': release, 'phase': phase, 'saga': saga, 'universe': universe,
        'story': None, 'order_release': None,
        'frwiki': frwiki, 'presentation': presentation, 'plot': plot,
        'directors': directors, 'runtime_min': runtime, 'tmdb': tmdb, 'seasons': seasons,
        'discovery': acc['signals'], 'conflicts': conflicts,
    }


def _override(overrides, qid, field):
    for f in overrides.get('fields', []):
        if f.get('work') == qid and f.get('field') == field:
            return f
    return None


def first_release_day(work):
    """Première date de sortie connue au jour près (France, États-Unis ou autre), sinon None."""
    days = [r['v'] for r in (work.get('release') or {}).values()
            if r and len(r.get('v') or '') == 10]
    return min(days) if days else None


def official_order_exclusions(works, story_order, rule):
    """Règle de périmètre « ordre officiel » (scope.json › official_order_rule) : une œuvre sortie plus de
    `grace_days` jours avant la publication du relevé, mais absente de ce relevé, est écartée.
    Retourne (œuvres gardées, [écartées avec leur raison])."""
    ref = (story_order or {}).get('reference') or {}
    pub = ref.get('published')
    if not rule or not rule.get('enabled') or not pub:
        return list(works), []
    limit = (datetime.datetime.strptime(pub, '%Y-%m-%d').date()
             - datetime.timedelta(days=int(rule.get('grace_days', 30)))).isoformat()
    listed = {e['id'] for e in story_order.get('order', []) if e.get('id')}
    kept, out = [], []
    for w in works:
        d = first_release_day(w)
        if w['id'] not in listed and d and d < limit:
            out.append({'id': w['id'], 'kind': w.get('kind'),
                        'label': (w.get('title_fr') or {}).get('v') or w['id'], 'rule': 'official_order',
                        'reason': 'sortie le {} mais absente de l’ordre officiel publié le {}'.format(d, pub),
                        'short': 'absente de l’ordre officiel de Marvel',
                        'ref': ref.get('url', '')})
        else:
            kept.append(w)
    return kept, out


def assign_orders(works, story_order, at):
    """Rang de sortie (dérivé) + rang dans l'histoire (curated, sinon provisoire)."""
    by_release = sorted(works, key=lambda w: (sort_date(w), w['id']))
    for i, w in enumerate(by_release, 1):
        w['order_release'] = sourced(i, 'derived', 'rule:sort-by-release-date', at)
    ref = story_order.get('reference', {})
    ref_url = ref.get('url', '')
    pos = {}
    for i, entry in enumerate(story_order.get('order', []), 1):
        if entry.get('id'):
            pos.setdefault(entry['id'], i)
    keys = {}
    for w in by_release:
        if w['id'] in pos:
            keys[w['id']] = float(pos[w['id']])
    # provisoires : après toutes les œuvres déjà placées sorties avant elle
    max_key = 0.0
    bump = {}
    for w in by_release:
        if w['id'] in keys:
            max_key = max(max_key, keys[w['id']])
            continue
        n = bump.get(max_key, 0) + 1
        bump[max_key] = n
        keys[w['id']] = max_key + n / 1000.0
    ranked = sorted(works, key=lambda w: (keys[w['id']], sort_date(w)))
    for i, w in enumerate(ranked, 1):
        if w['id'] in pos:
            w['story'] = sourced(i, 'curated', ref_url, at, provisional=False, ref_position=pos[w['id']])
        else:
            w['story'] = sourced(i, 'derived', 'rule:provisional-after-earlier-releases', at,
                                 provisional=True)


def _norm_label(s):
    s = unicodedata.normalize('NFD', s or '')
    return re.sub(r'[^a-z0-9]+', ' ', ''.join(ch for ch in s if unicodedata.category(ch) != 'Mn').lower()).strip()


def canonical_characters(pairs, people_ents):
    """Un même personnage a parfois deux éléments Wikidata : la version des comics (souvent utilisée en
    qualificatif P453 de la distribution) et la version MCU (P1080 = univers cinématographique Marvel).
    On réunit X (comics, ou sans univers indiqué) sous M (MCU) quand, selon Wikidata, M est présent (P1441)
    dans l'œuvre où X est crédité et porte le même nom, ou quand M est fondé sur X (P144). Les variantes
    venues d'autres univers de cinéma (P1080 différent) restent des personnages distincts. Retourne {X: M}."""
    def ent(q):
        return people_ents.get(q) or {}
    mcu = [q for q in {ch for _, ch in pairs} if wd.Q_MCU in wd.item_ids(ent(q), 'P1080')]
    present = {m: set(wd.item_ids(ent(m), 'P1441')) for m in mcu}
    based = {m: set(wd.item_ids(ent(m), 'P144')) for m in mcu}
    labels = {}
    def lab(q):
        if q not in labels:
            labels[q] = _norm_label((wd.label(ent(q)) or (None,))[0])
        return labels[q]
    mapping = {}
    def comics_or_unknown(q):  # les variantes d'autres univers de cinéma (Spider-Man de Sam Raimi…) restent distinctes
        u = wd.item_ids(ent(q), 'P1080')
        return not u or wd.Q_MARVEL_COMICS in u
    for work, ch in sorted(pairs):
        if ch in present or ch in mapping or not comics_or_unknown(ch):
            continue
        for m in sorted(mcu):
            if ch in based[m] or (work in present[m] and lab(m) and lab(m) == lab(ch)):
                mapping[ch] = m
                break
    return mapping


def build_characters(works_ents, people_ents, at, level_cameo=(wd.Q_UNCREDITED, wd.Q_CAMEO)):
    """P161 (distribution) + P453 (rôle) + P3831 (non crédité / caméo) ; personnages réunis (comics → MCU) et alias."""
    raw = []
    for qid, ent in works_ents.items():
        for c in wd.statements(ent, 'P161'):
            actor = wd.item_id(c)
            if not actor:
                continue
            roles = wd.qualifier_items(c, 'P453')
            role_kinds = wd.qualifier_items(c, 'P3831')
            cameo = any(r in level_cameo for r in role_kinds)
            for ch in (roles or [None]):
                raw.append((qid, actor, ch, cameo))
    mapping = canonical_characters({(w, ch) for w, _, ch, _ in raw if ch and ch != wd.Q_THEMSELF}, people_ents)
    merged_from = {}
    for x, m in mapping.items():
        merged_from.setdefault(m, []).append(x)

    appearances = []
    actors, characters = {}, {}
    seen = set()
    for qid, actor, ch, cameo in raw:
        level = sourced('cameo', 'wikidata', qid + '#P161', at, rule='P3831 = non crédité / caméo') if cameo else None
        actors[actor] = True
        if ch == wd.Q_THEMSELF:  # dans son propre rôle : apparition gardée, hors liste des personnages
            appearances.append({'work': qid, 'actor': actor, 'character': None,
                                'role': sourced('dans son propre rôle', 'wikidata', qid + '#P161-P453', at,
                                                rule='P453 = Q18086706'),
                                'level': level})
            continue
        canon = mapping.get(ch, ch)
        key = (qid, actor, canon)
        if canon and key in seen:
            continue
        seen.add(key)
        if canon:
            characters[canon] = True
        ap = {'work': qid, 'actor': actor, 'character': canon, 'role': None, 'level': level}
        if canon and canon != ch:
            ap['merged_from'] = ch  # élément Wikidata d'origine (traçabilité)
        appearances.append(ap)

    def name_of(q):
        ent = people_ents.get(q)
        if not ent:
            return None
        lbl, lang = wd.label(ent)
        if lbl:  # retire les précisions d'homonymie des libellés (« Okoye (comics) » → « Okoye »)
            lbl = re.sub(r'\s*\((?:comics|personnage|Marvel(?: Comics)?|MCU|univers cinématographique Marvel)\)$', '', lbl)
        return sourced(lbl, 'wikidata', q + '#label-' + (lang or ''), at) if lbl else None

    def aliases_of(q):
        name = (name_of(q) or {}).get('v')
        out, refs = [], [q]
        for item in [q] + sorted(merged_from.get(q, [])):
            ent = people_ents.get(item) or {}
            other = (wd.label(ent) or (None,))[0]
            cands = wd.aliases(ent) + ([other] if item != q and other else [])
            for a in cands:
                a = re.sub(r'\s*\([^)]*\)$', '', a or '').strip()  # « Wanda Maximoff (Marvel Cinematic Universe) » → doublon du nom
                if a and _norm_label(a) != _norm_label(name) and a not in out:
                    out.append(a)
            if item != q:
                refs.append(item)
        return sourced(out, 'wikidata', '|'.join(r + '#aliases' for r in refs), at) if out else None

    actor_list = []
    for a in sorted(actors):
        ent = people_ents.get(a, {})
        tmdb_person = None
        for c in wd.best_statements(ent, 'P4985'):
            s = wd.string_value(c)
            if s and s.isdigit():
                tmdb_person = int(s)
        actor_list.append({'id': a, 'name': name_of(a), 'tmdb_person': tmdb_person})
    char_list = []
    for ch in sorted(characters):
        rec = {'id': ch, 'name': name_of(ch)}
        al = aliases_of(ch)
        if al:
            rec['aliases'] = al
        if merged_from.get(ch):
            rec['merged'] = sourced(sorted(merged_from[ch]), 'wikidata', ch + '#P1441|P144', at,
                                    rule='même personnage : présent (P1441) dans l’œuvre et même nom, ou fondé sur (P144)')
        char_list.append(rec)
    for ap in appearances:
        if ap['character']:
            n = name_of(ap['character'])
            if n:
                ap['role'] = sourced(n['v'], 'wikidata', ap['work'] + '#P161-P453', at)
    return {'actors': actor_list, 'characters': char_list, 'appearances': appearances}
