# -*- coding: utf-8 -*-
"""Découverte des œuvres : croisement de signaux indépendants.

Signaux :
- `wikidata`            : P1434 (univers de fiction) = MCU, P179 (série) = MCU / phase / saga, ou
                          P272 (production) = Marvel Studios / Marvel Studios Animation — une seule source ;
- `frwiki`              : œuvre listée dans les tableaux des articles « Phase N » de Wikipédia FR ;
- `tmdb`                : œuvre trouvée par la découverte TMDB (si une clé est disponible).

Une œuvre n'est publiée que si elle passe le filtre de périmètre (scope.json) ET réunit au moins
`min_signals` signaux, ou figure dans `scope.include`. Les autres partent en quarantaine.
Les œuvres écartées par une règle explicite (`scope.exclude`, nature exclue comme les épisodes
spéciaux) sont listées à part (`excluded`) pour la page Méthode et les contrôles.
"""
from . import wikidata as wd
from . import phase_tables


def wikidata_signal(W, taxonomy):
    exprs = ['haswbstatement:P1434=' + taxonomy['mcu']['id'],
             'haswbstatement:P179=' + taxonomy['mcu']['id']]
    exprs += ['haswbstatement:P179=' + p['qid'] for p in taxonomy['phases']]
    exprs += ['haswbstatement:P179=' + s['qid'] for s in taxonomy['sagas']]
    found = {}
    for e in exprs:
        for q in W.search_ids(e):
            found.setdefault(q, []).append(e)
    return found


def frwiki_signal(W, F, taxonomy):
    """Tableaux des articles de phase → ({QID: [entrée…]}, [révisions des pages])."""
    phase_ents = W.entities([p['qid'] for p in taxonomy['phases']], props='sitelinks')
    found, pages = {}, []
    for p in taxonomy['phases']:
        title = wd.sitelink(phase_ents.get(p['qid'], {}), 'frwiki')
        if not title:
            continue
        real_title, revid, html = F.parse_page(title)
        pages.append({'phase': p['n'], 'title': real_title, 'revid': revid})
        rows = phase_tables.entries(html)
        mapping = F.titles_to_qids([r['title'] for r in rows])
        for r in rows:
            q = mapping.get(r['title'])
            if not q:
                continue
            r = dict(r, phase=p['n'], page=real_title, revid=revid)
            found.setdefault(q, []).append(r)
    return found, pages


def in_scope(ent, scope, frwiki_rows=None, phase_qids=()):
    """(bool, kind, raison)"""
    qid = ent.get('id')
    excl = {x['id']: x for x in scope.get('exclude', [])}
    incl = {x['id']: x for x in scope.get('include', [])}
    if qid in excl:
        return False, None, 'exclu : ' + excl[qid]['reason']
    types = wd.item_ids(ent, 'P31')
    if any(t in scope['excluded_types'] for t in types):
        return False, None, 'type exclu'
    kinds = [scope['allowed_types'][t] for t in types if t in scope['allowed_types']]
    if frwiki_rows:
        kind = frwiki_rows[0]['category']
    elif kinds:
        kind = 'special' if 'special' in kinds else ('film' if 'film' in kinds else 'series')
    else:
        return False, None, 'type non retenu'
    if not kinds and not frwiki_rows:
        return False, None, 'type non retenu'
    excl_kinds = scope.get('excluded_kinds', {})
    if kind in excl_kinds and qid not in incl:
        return False, kind, 'nature exclue : ' + excl_kinds[kind]
    producers = set(scope['production_companies'])
    in_phase = bool(frwiki_rows) or any(q in phase_qids for q in wd.item_ids(ent, 'P179'))
    if not (producers & set(wd.item_ids(ent, 'P272'))) and not in_phase and qid not in incl:
        return False, kind, 'ni produit par Marvel Studios (P272) ni rattaché à une phase'
    return True, kind, ''


def discover(W, F, taxonomy, scope, tmdb_qids=None, log=print):
    sig_wd = wikidata_signal(W, taxonomy)
    log('  wikidata : {} candidats'.format(len(sig_wd)))
    sig_fr, pages = frwiki_signal(W, F, taxonomy)
    log('  frwiki   : {} œuvres listées dans les articles de phase'.format(len(sig_fr)))
    sig_tm = set(tmdb_qids or [])
    incl = {x['id'] for x in scope.get('include', [])}
    candidates = set(sig_wd) | set(sig_fr) | sig_tm | incl
    ents = W.entities(sorted(candidates), props='claims|labels|sitelinks')
    phase_qids = {p['qid'] for p in taxonomy['phases']}
    producers = set(scope['production_companies'])
    accepted, quarantine, excluded = [], [], []
    for qid in sorted(candidates):
        ent = ents.get(qid)
        if not ent:
            continue
        rows = sig_fr.get(qid, [])
        ok, kind, why = in_scope(ent, scope, rows, phase_qids)
        if not ok:
            if why.startswith(('exclu', 'nature exclue')):
                excluded.append({'id': qid, 'kind': kind, 'label': wd.label(ent)[0],
                                 'rule': 'scope', 'reason': why,
                                 'short': 'épisode spécial, hors périmètre' if kind == 'special' else 'hors périmètre'})
            continue
        # trois sources indépendantes : Wikidata (univers, phase OU société de production),
        # Wikipédia FR (tableaux des articles de phase), TMDB
        signals = []
        if qid in sig_wd or producers & set(wd.item_ids(ent, 'P272')):
            signals.append('wikidata')
        if rows:
            signals.append('frwiki')
        if qid in sig_tm:
            signals.append('tmdb')
        lbl, _ = wd.label(ent)
        rec = {'id': qid, 'kind': kind, 'label': lbl, 'signals': signals, 'frwiki_rows': rows}
        if len(signals) >= scope.get('min_signals', 2) or qid in incl:
            accepted.append(rec)
        else:
            rec['reason'] = 'une seule source ({})'.format(', '.join(signals) or 'aucune')
            quarantine.append(rec)
    return accepted, quarantine, excluded, ents, pages
