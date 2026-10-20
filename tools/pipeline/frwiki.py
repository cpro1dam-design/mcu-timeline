# -*- coding: utf-8 -*-
"""Accès à Wikipédia en français par l'API Action.

- révision figée : la plus récente ayant au moins `min_age_hours` d'ancienneté et sans balise
  `mw-reverted` (protection contre le vandalisme récent) ;
- texte obtenu par `action=parse&oldid=…&section=…&prop=text`, puis converti en paragraphes de
  texte brut (références, notes, images, tableaux et boîtes retirés) : c'est un **extrait modifié**
  de l'article, sous licence CC BY-SA 4.0.
"""
import datetime
import re
from html.parser import HTMLParser

FR_API = 'https://fr.wikipedia.org/w/api.php'
SYNOPSIS_TITLES = ('synopsis', 'résumé', 'intrigue', 'résumé détaillé', 'synopsis détaillé')


class FrWiki(object):
    def __init__(self, http, min_age_hours=72):
        self.http = http
        self.min_age = datetime.timedelta(hours=min_age_hours)

    def _q(self, params):
        p = {'format': 'json', 'formatversion': 2}
        p.update(params)
        return self.http.get_json(FR_API, p)

    def links(self, page):
        """Liens internes (espace principal) d'une page, redirections suivies."""
        out = []
        cont = {}
        while True:
            p = {'action': 'query', 'prop': 'links', 'titles': page, 'plnamespace': 0,
                 'pllimit': 500, 'redirects': 1}
            p.update(cont)
            d = self._q(p)
            for pg in d.get('query', {}).get('pages', []):
                out.extend(l['title'] for l in pg.get('links', []))
            if 'continue' in d:
                cont = {k: v for k, v in d['continue'].items()}
            else:
                break
        return out

    def page_revision(self, page):
        """Révision courante d'une page (pour citer une page de liste)."""
        d = self._q({'action': 'query', 'prop': 'revisions', 'titles': page,
                     'rvprop': 'ids|timestamp', 'redirects': 1})
        pages = d.get('query', {}).get('pages', [])
        if not pages or 'revisions' not in pages[0]:
            return None
        r = pages[0]['revisions'][0]
        return {'title': pages[0]['title'], 'revid': r['revid'], 'timestamp': r['timestamp']}

    def titles_to_qids(self, titles):
        """Titres frwiki → {titre demandé: QID} (normalisations et redirections suivies)."""
        res = {}
        titles = list(dict.fromkeys(titles))
        for i in range(0, len(titles), 50):
            batch = titles[i:i + 50]
            d = self._q({'action': 'query', 'prop': 'pageprops', 'ppprop': 'wikibase_item',
                         'titles': '|'.join(batch), 'redirects': 1})
            q = d.get('query', {})
            alias = {}
            for n in q.get('normalized', []):
                alias[n['from']] = n['to']
            for r in q.get('redirects', []):
                alias[r['from']] = r['to']
            final = {}
            for pg in q.get('pages', []):
                qid = pg.get('pageprops', {}).get('wikibase_item')
                if qid:
                    final[pg['title']] = qid
            for t in batch:
                cur, seen = t, set()
                while cur in alias and cur not in seen:
                    seen.add(cur)
                    cur = alias[cur]
                if cur in final:
                    res[t] = final[cur]
        return res

    def parse_page(self, page):
        """HTML complet + révision courante d'une page."""
        d = self._q({'action': 'parse', 'page': page, 'prop': 'text|revid', 'redirects': 1})
        p = d.get('parse', {})
        return p.get('title'), p.get('revid'), p.get('text', '')

    def pinned_revision(self, page, now=None):
        """Choisit la révision à citer (≥ min_age, non annulée). Renvoie dict ou None."""
        now = now or datetime.datetime.utcnow()
        d = self._q({'action': 'query', 'prop': 'revisions', 'titles': page, 'rvlimit': 50,
                     'rvprop': 'ids|timestamp|tags|size', 'redirects': 1})
        pages = d.get('query', {}).get('pages', [])
        if not pages or 'revisions' not in pages[0]:
            return None
        title = pages[0]['title']
        for r in pages[0]['revisions']:
            ts = datetime.datetime.strptime(r['timestamp'], '%Y-%m-%dT%H:%M:%SZ')
            if now - ts < self.min_age:
                continue
            if 'mw-reverted' in (r.get('tags') or []):
                continue
            return {'title': title, 'revid': r['revid'], 'timestamp': r['timestamp'],
                    'size': r.get('size')}
        # Page entièrement récente : on prend la plus ancienne révision non annulée de la fenêtre
        for r in reversed(pages[0]['revisions']):
            if 'mw-reverted' not in (r.get('tags') or []):
                return {'title': title, 'revid': r['revid'], 'timestamp': r['timestamp'],
                        'size': r.get('size'), 'young': True}
        return None

    def sections(self, revid):
        d = self._q({'action': 'parse', 'oldid': revid, 'prop': 'sections'})
        return d.get('parse', {}).get('sections', [])

    def section_html(self, revid, index):
        d = self._q({'action': 'parse', 'oldid': revid, 'section': index, 'prop': 'text',
                     'disableeditsection': 1, 'disabletoc': 1})
        return d.get('parse', {}).get('text', '')

    def revision_sections(self, revid):
        """Un seul rendu de l'article (révision figée) → (intro_html, {ancre: html}, sections)."""
        d = self._q({'action': 'parse', 'oldid': revid, 'prop': 'text|sections|wikitext',
                     'disableeditsection': 1, 'disabletoc': 1})
        p = d.get('parse', {})
        html = p.get('text', '')
        self.last_wikitext = p.get('wikitext', '')
        sections = p.get('sections', [])
        starts = []
        for s in sections:
            if str(s.get('toclevel')) != '1':
                continue
            i = html.find('id="{}"'.format(s.get('anchor')))
            if i < 0:
                continue
            j = html.rfind('<div class="mw-heading', 0, i)
            starts.append((j if j >= 0 else html.rfind('<h2', 0, i), s))
        starts.sort(key=lambda t: t[0])
        intro = html[:starts[0][0]] if starts else html
        parts = {}
        for k, (pos, s) in enumerate(starts):
            end = starts[k + 1][0] if k + 1 < len(starts) else len(html)
            parts[s.get('anchor')] = html[pos:end]
        return intro, parts, sections

    def find_synopsis_index(self, sections):
        for s in sections:
            if str(s.get('toclevel')) == '1' and _norm(s.get('line', '')) in SYNOPSIS_TITLES:
                return s.get('index'), s.get('line'), s.get('anchor')
        return None, None, None


def _norm(s):
    s = re.sub(r'<[^>]+>', '', s)
    return s.strip().lower()


# -- conversion HTML → paragraphes ----------------------------------------

SKIP_TAGS = {'table', 'style', 'script', 'figure', 'sup', 'math', 'img', 'audio', 'video',
             'noscript', 'link', 'meta', 'ol', 'ul', 'dl', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'}
SKIP_CLASSES = ('reference', 'mw-editsection', 'noprint', 'thumb', 'infobox', 'bandeau',
                'hatnote', 'navbox', 'mw-references-wrap', 'references', 'metadata',
                'mw-empty-elt', 'homonymie', 'bandeau-container', 'printfooter', 'error',
                'mw-cite-backlink', 'need_ref', 'API', 'plainlinks', 'citation-needed')
VOID = {'br', 'img', 'hr', 'meta', 'link', 'input', 'wbr', 'source', 'area', 'col', 'embed',
        'param', 'track'}


class _ParaExtractor(HTMLParser):
    def __init__(self):
        HTMLParser.__init__(self, convert_charrefs=True)
        self.paras = []
        self._buf = None
        self._skip_depth = 0
        self._stack = []

    def handle_starttag(self, tag, attrs):
        if tag in VOID:
            return
        a = dict(attrs)
        classes = (a.get('class') or '').split()
        skip = (tag in SKIP_TAGS or any(c in SKIP_CLASSES for c in classes)
                or a.get('role') == 'note' or 'display:none' in (a.get('style') or '').replace(' ', ''))
        self._stack.append(skip)
        if skip:
            self._skip_depth += 1
            return
        if tag == 'p' and self._skip_depth == 0:
            self._buf = []

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self._stack:
            return
        skip = self._stack.pop()
        if skip:
            self._skip_depth -= 1
            return
        if tag == 'p' and self._buf is not None and self._skip_depth == 0:
            text = _clean(''.join(self._buf))
            if text:
                self.paras.append(text)
            self._buf = None

    def handle_data(self, data):
        if self._buf is not None and self._skip_depth == 0:
            self._buf.append(data)


def _clean(text):
    text = re.sub(r'\[(?:\d+|[a-z]|réf\. nécessaire|Quoi \?|Lequel \?|Où \?)\]', '', text)
    text = re.sub(r'[ \t\r\n ]+', ' ', text).strip()
    # typographie française : espace insécable avant ; : ! ? et à l'intérieur des guillemets
    text = re.sub(r' ([;:!?»])', ' \\1', text)
    text = re.sub(r'« ', '« ', text)
    text = text.replace(' ', ' ')
    return text


def html_to_paragraphs(html):
    p = _ParaExtractor()
    p.feed(html)
    p.close()
    return p.paras


def permalink(revid):
    return 'https://fr.wikipedia.org/w/index.php?oldid={}'.format(revid)


def article_url(title):
    from urllib.parse import quote
    return 'https://fr.wikipedia.org/wiki/' + quote(title.replace(' ', '_'))


MONTHS_FR = {'janvier': 1, 'février': 2, 'mars': 3, 'avril': 4, 'mai': 5, 'juin': 6, 'juillet': 7,
             'août': 8, 'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12}


def france_release(wikitext):
    """Date de sortie en France dans la liste « Dates de sortie » d'un article de film.
    Ex. « [[France]], [[Belgique]] : {{date|14|février|2018|au cinéma}} » → ('2018-02-14', ligne)."""
    lines = (wikitext or '').splitlines()
    # on ne lit que la liste à puces qui suit « Dates de sortie » (pas la prose de l'article)
    block, inside = [], False
    for line in lines:
        if not inside:
            if re.search(r'Dates? de sortie', line) and line.lstrip().startswith('*'):
                inside = True
            continue
        if line.lstrip().startswith('**') or line.lstrip().startswith('*:'):
            block.append(line)
        else:
            break
    for line in block:
        if '[[France]]' not in line or ':' not in line:
            continue
        # plusieurs dates possibles (« avant-première … ; … (sortie nationale) ») :
        # on préfère la sortie nationale, sinon la première date qui n'est pas une avant-première
        cands = []
        for mm in re.finditer(r'\{\{date\|(1er|\d{1,2})[| ]([a-zéû]+)[| ](\d{4})[^}]*\}\}([^;{]*)', line):
            tail = mm.group(4).lower()
            score = 0 if 'sortie nationale' in tail else (2 if re.search(r'avant-premi|festival|premi[eè]re', tail) else 1)
            cands.append((score, mm))
        m = sorted(cands, key=lambda c: c[0])[0][1] if cands else None
        if m and m.group(2) in MONTHS_FR:
            day = 1 if m.group(1) == '1er' else int(m.group(1))
            quote = re.sub(r'<ref[^>]*>.*?</ref>|<ref[^>]*/>', '', line)
            quote = re.sub(r'\{\{date\|([^}]*)\}\}', lambda x: ' '.join(x.group(1).split('|')[:3]), quote)
            quote = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]+)\]\]', lambda x: x.group(1), quote)
            quote = re.sub(r"'{2,}|<[^>]+>|^[*\s]+", '', quote).strip()[:160]
            return '{:04d}-{:02d}-{:02d}'.format(int(m.group(3)), MONTHS_FR[m.group(2)], day), quote
    return None, None
