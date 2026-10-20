# -*- coding: utf-8 -*-
"""Accès à Wikidata par l'API Action (pas de SPARQL : le service WDQS migre en 2026-2027).

Sémantique des rangs : on ignore toujours le rang « deprecated » ; pour les propriétés à valeurs
multiples légitimes (P179, P161, P577…), on garde toutes les déclarations « normal » et « preferred ».
Libellés : repli fr → mul → en.
"""
WD_API = 'https://www.wikidata.org/w/api.php'

# Éléments de référence
Q_MCU = 'Q642878'
Q_MARVEL_STUDIOS = 'Q367466'
Q_FRANCE = 'Q142'
Q_USA = 'Q30'
Q_UNCREDITED = 'Q16582801'
Q_CAMEO = 'Q191796'
Q_THEMSELF = 'Q18086706'  # rôle « lui/elle-même » (P453) : pas un personnage
Q_MCU = 'Q642878'  # univers cinématographique Marvel (P1080, univers de fiction)
Q_MARVEL_COMICS = 'Q2246088'  # univers Marvel des comics (P1080)

PRECISIONS = {11: 'day', 10: 'month', 9: 'year'}


class Wikidata(object):
    def __init__(self, http):
        self.http = http

    def search_ids(self, expr, limit=500):
        """Recherche CirrusSearch (ex. `haswbstatement:P1434=Q642878`) → liste de QID."""
        out = []
        offset = 0
        while True:
            d = self.http.get_json(WD_API, {
                'action': 'query', 'list': 'search', 'srsearch': expr, 'srlimit': limit,
                'sroffset': offset, 'srnamespace': 0, 'format': 'json'})
            out.extend(h['title'] for h in d.get('query', {}).get('search', []))
            cont = d.get('continue')
            if cont and 'sroffset' in cont:
                offset = cont['sroffset']
            else:
                break
        return out

    def entities(self, ids, props='labels|claims|sitelinks', languages='fr|mul|en'):
        """wbgetentities par lots de 50 → {QID: entité}."""
        ids = [i for i in dict.fromkeys(ids) if i]
        res = {}
        for i in range(0, len(ids), 50):
            d = self.http.get_json(WD_API, {
                'action': 'wbgetentities', 'ids': '|'.join(ids[i:i + 50]), 'props': props,
                'languages': languages, 'sitefilter': 'frwiki|enwiki', 'format': 'json'})
            for qid, ent in d.get('entities', {}).items():
                if 'missing' not in ent:
                    res[qid] = ent
        return res


# -- aides de lecture -------------------------------------------------------

def statements(ent, prop):
    """Déclarations non dépréciées d'une propriété."""
    return [c for c in ent.get('claims', {}).get(prop, []) if c.get('rank') != 'deprecated']


def best_statements(ent, prop):
    """Déclarations de meilleur rang (preferred si présent, sinon normal)."""
    st = statements(ent, prop)
    pref = [c for c in st if c.get('rank') == 'preferred']
    return pref or st


def value(c):
    return c.get('mainsnak', {}).get('datavalue', {}).get('value')


def item_id(c):
    v = value(c)
    return v.get('id') if isinstance(v, dict) else None


def qualifier_items(c, prop):
    out = []
    for q in c.get('qualifiers', {}).get(prop, []):
        v = q.get('datavalue', {}).get('value')
        if isinstance(v, dict) and v.get('id'):
            out.append(v['id'])
    return out


def qualifier_values(c, prop):
    return [q.get('datavalue', {}).get('value') for q in c.get('qualifiers', {}).get(prop, [])
            if q.get('datavalue')]


def item_ids(ent, prop, best=False):
    src = best_statements(ent, prop) if best else statements(ent, prop)
    return [i for i in (item_id(c) for c in src) if i]


def label(ent, langs=('fr', 'mul', 'en')):
    labels = ent.get('labels', {})
    for l in langs:
        if l in labels:
            return labels[l]['value'], l
    return None, None


def aliases(ent, langs=('fr', 'mul', 'en')):
    """Alias d'un élément (dans l'ordre des langues), puis ses pseudonymes (P742), sans doublon."""
    out = []
    for l in langs:
        for a in (ent.get('aliases') or {}).get(l, []):
            if a.get('value') and a['value'] not in out:
                out.append(a['value'])
    for c in statements(ent, 'P742'):
        v = string_value(c)
        if isinstance(v, dict):
            v = v.get('text')
        if v and v not in out:
            out.append(v)
    return out


def sitelink(ent, site='frwiki'):
    s = ent.get('sitelinks', {}).get(site)
    return s.get('title') if s else None


def time_value(v):
    """Valeur temporelle Wikidata → (AAAA-MM-JJ tronquée à la précision, précision texte)."""
    if not isinstance(v, dict) or 'time' not in v:
        return None, None
    prec = PRECISIONS.get(v.get('precision'))
    if not prec:
        return None, None
    t = v['time'].lstrip('+')
    date = t[:10]
    if prec == 'year':
        date = date[:4]
    elif prec == 'month':
        date = date[:7]
    return date, prec


def quantity(v):
    if isinstance(v, dict) and 'amount' in v:
        try:
            return float(v['amount'])
        except ValueError:
            return None
    return None


def string_value(c):
    v = value(c)
    return v if isinstance(v, str) else None


def monolingual(c):
    v = value(c)
    if isinstance(v, dict) and 'text' in v:
        return v['text'], v.get('language')
    return None, None
