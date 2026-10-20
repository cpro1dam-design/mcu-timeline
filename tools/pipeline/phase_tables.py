# -*- coding: utf-8 -*-
"""Lecture des tableaux des articles « Phase N de l'univers cinématographique Marvel » (Wikipédia FR).

Chaque article liste, dans ses sections « Films », « Séries télévisées » et « Téléfilms », les œuvres
de la phase avec leurs dates de sortie (drapeaux France / États-Unis pour les films) et les saisons
des séries. C'est une source précise et citable (article + révision) pour :
- l'appartenance d'une œuvre au MCU et à une phase ;
- les numéros de saison des séries ;
- les dates de sortie françaises et américaines.
"""
import re
from html.parser import HTMLParser

PHASE_SECTIONS = {'Films': 'film', 'Séries_télévisées': 'series', 'Téléfilms': 'special'}
FLAG_COUNTRIES = {'Drapeau de la France': 'fr', 'Drapeau des États-Unis': 'us'}
MONTHS_FR = {'janvier': 1, 'février': 2, 'mars': 3, 'avril': 4, 'mai': 5, 'juin': 6,
             'juillet': 7, 'août': 8, 'septembre': 9, 'octobre': 10, 'novembre': 11,
             'décembre': 12}
VOID = {'br', 'img', 'hr', 'meta', 'link', 'input', 'wbr', 'source', 'area', 'col', 'embed',
        'param', 'track'}


def _clean(text):
    return re.sub(r'[ \t\r\n ]+', ' ', text or '').strip()


class _TableParser(HTMLParser):
    def __init__(self):
        HTMLParser.__init__(self, convert_charrefs=True)
        self.section = None
        self.rows = []
        self._depth = 0          # profondeur de <table> dans une section retenue
        self._row = None
        self._cell = None
        self._skip = 0
        self._stack = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = (a.get('class') or '').split()
        if tag == 'h2':
            self.section = PHASE_SECTIONS.get(a.get('id'))
            return
        if tag in VOID or self.section is None:
            return
        if tag == 'table':
            self._depth += 1
            return
        if self._depth != 1:
            return
        style = (a.get('style') or '').replace(' ', '')
        skip = tag in ('sup', 'style') or 'reference' in cls or 'display:none' in style
        self._stack.append(skip)
        if skip:
            self._skip += 1
            return
        if self._skip:
            return
        if tag == 'tr':
            self._row = []
        elif tag in ('td', 'th') and self._row is not None:
            self._cell = {'tag': tag, 'text': [], 'links': [], 'events': []}
        elif self._cell is not None:
            if tag == 'a':
                title = a.get('title') or ''
                if title in FLAG_COUNTRIES:
                    self._cell['events'].append(('flag', FLAG_COUNTRIES[title]))
                elif (title and 'new' not in cls and 'mw-file-description' not in cls
                      and not title.startswith('Fichier:')):
                    self._cell['links'].append(title)
            elif tag == 'time' and a.get('datetime'):
                self._cell['events'].append(('time', a['datetime']))

    def handle_endtag(self, tag):
        if tag in VOID or self.section is None or tag == 'h2':
            return
        if tag == 'table':
            if self._depth:
                self._depth -= 1
            return
        if self._depth != 1 or not self._stack:
            return
        skip = self._stack.pop()
        if skip:
            self._skip -= 1
            return
        if self._skip:
            return
        if tag in ('td', 'th') and self._cell is not None and self._row is not None:
            self._cell['text'] = _clean(''.join(self._cell['text']))
            self._row.append(self._cell)
            self._cell = None
        elif tag == 'tr' and self._row is not None:
            if self._row:
                self.rows.append({'section': self.section, 'cells': self._row})
            self._row = None

    def handle_data(self, data):
        if self._cell is not None and self._skip == 0:
            self._cell['text'].append(data)


def parse_fr_date(text):
    """« 21 juin 2023 » → ('2023-06-21', 'day') ; « juin 2023 » → month ; « 2027 » → year."""
    t = (text or '').strip().lower().replace('1er', '1')
    m = re.search(r'(\d{1,2})\s+([a-zéû]+)\s+(\d{4})', t)
    if m and m.group(2) in MONTHS_FR:
        return '{:04d}-{:02d}-{:02d}'.format(int(m.group(3)), MONTHS_FR[m.group(2)],
                                             int(m.group(1))), 'day'
    m = re.search(r'([a-zéû]+)\s+(\d{4})', t)
    if m and m.group(1) in MONTHS_FR:
        return '{:04d}-{:02d}'.format(int(m.group(2)), MONTHS_FR[m.group(1)]), 'month'
    m = re.search(r'\b(\d{4})\b', t)
    if m:
        return m.group(1), 'year'
    return None, None


def _time_precision(val):
    return 'day' if len(val) >= 10 else ('month' if len(val) == 7 else 'year')


def entries(html):
    """HTML d'un article de phase → [{category, title, label, season, episodes, dates}].
    `dates` : {'fr': (date, précision), 'us': …, 'first': …, 'last': …} selon ce que donne le tableau."""
    p = _TableParser()
    p.feed(html)
    p.close()
    out = []
    last_series = None
    for row in p.rows:
        cells = row['cells']
        first = cells[0]
        if row['section'] in ('film', 'special'):
            if first['tag'] == 'th' and not first['links']:
                continue  # en-tête
            if not first['links']:
                continue
            dates = {}
            for c in cells[1:3]:
                country = None
                for kind, val in c['events']:
                    if kind == 'flag':
                        country = val
                    elif kind == 'time' and country and country not in dates:
                        dates[country] = (val[:10], _time_precision(val))
                if not dates:
                    d, prec = parse_fr_date(c['text'])
                    if d:
                        dates['first'] = (d, prec)
                if dates:
                    break
            out.append({'category': row['section'], 'title': first['links'][0],
                        'label': first['text'], 'season': None, 'episodes': None,
                        'dates': dates})
        else:
            if first['tag'] == 'th' and first['links']:
                last_series = first['links'][0]
                label = first['text']
                rest = cells[1:]
            elif first['tag'] == 'th':
                continue  # en-tête
            elif last_series:
                label = None
                rest = cells
            else:
                continue
            nums = [c['text'] for c in rest if re.fullmatch(r'\d{1,2}', c['text'] or '')]
            season = int(nums[0]) if nums else None
            episodes = int(nums[1]) if len(nums) > 1 else None
            dated = [c for c in rest
                     if not re.fullmatch(r'\d{1,2}', c['text'] or '') and parse_fr_date(c['text'])[0]]
            dates = {}
            if dated:
                dates['first'] = parse_fr_date(dated[0]['text'])
                if len(dated) > 1:
                    dates['last'] = parse_fr_date(dated[1]['text'])
            out.append({'category': 'series', 'title': last_series, 'label': label,
                        'season': season, 'episodes': episodes, 'dates': dates})
    return out
