"""Copie le site généré et y ajoute des œuvres FICTIVES pour simuler la croissance du MCU.

Usage : py -3 -X utf8 tools/stress_fixture.py --out <dossier hors de site/> [--ans 10] [--par-an 7]

Simulation « dans N ans » au rythme de Marvel (6 à 8 sorties par an) : à partir de janvier 2028
(après Avengers: Secret Wars), des œuvres « Œuvre fictive NN » réparties dans le temps, une phase
tous les deux ans et demi, une saga toutes les trois phases (« Saga 3 (fictive) », « Saga 4
(fictive) »…), un tiers de séries, les dernières avec une date au mois près, une place provisoire dans
l'ordre de l'histoire. Rien n'est écrit dans site/ ni dans data/ : le dossier produit sert uniquement
à l'aperçu local (jamais publié). À lancer après `build_site.py --no-tmdb` (aucune donnée TMDB copiée ;
le dossier site/media n'est jamais copié).
"""
import argparse
import json
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, 'site')
ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV']
# couleurs fictives : une famille par saga (vert, rose, sable), contraste ≥ 4,5:1 sur le fond du site
SAGA_COLORS = [
    ('vert', ['#7BD389', '#B8E07A', '#5FD6A8']),
    ('rose', ['#F28DB2', '#F7A8D8', '#E58FF0']),
    ('sable', ['#E8C9A0', '#F0B98A', '#D9D27E']),
]
PHASE_YEARS = 2.5   # durée d'une phase (phases IV à VI : 2021–2027)
PHASES_PER_SAGA = 3


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--out', required=True)
    ap.add_argument('--ans', type=float, default=10, help='horizon de la simulation, en années à partir d’aujourd’hui (2026)')
    ap.add_argument('--par-an', type=float, default=7, help='sorties par an')
    args = ap.parse_args()
    out = os.path.abspath(args.out)
    if out == SITE or out.startswith(SITE + os.sep) or out.startswith(os.path.join(ROOT, 'data')):
        sys.exit('Le dossier de sortie doit être hors de site/ et de data/.')
    if os.path.exists(out):
        shutil.rmtree(out)
    shutil.copytree(SITE, out, ignore=shutil.ignore_patterns('media', 'sw.js'))
    dpath = os.path.join(out, 'data')

    def load(name):
        with open(os.path.join(dpath, name), encoding='utf-8') as f:
            return json.load(f)

    def save(name, obj):
        with open(os.path.join(dpath, name), 'w', encoding='utf-8') as f:
            json.dump(obj, f, ensure_ascii=False)

    data = load('works.json')
    works = data['works']
    if any(w.get('tagline') or w.get('poster') for w in works):
        sys.exit('Le site contient des données TMDB : lancer d’abord build_site.py --no-tmdb.')
    tax = load('taxonomy.json')

    # -- calendrier fictif ---------------------------------------------------------------------
    start, end = 2028.0, 2026.8 + args.ans  # janvier 2028 → « dans N ans » (octobre)
    n_extra = int(round((end - start) * args.par_an))
    last_phase = max(p['n'] for p in tax['phases'])
    n_sagas0 = len(tax['sagas'])

    def phase_at(t):
        return last_phase + 1 + int((t - start) // PHASE_YEARS)

    phases_needed = sorted({phase_at(start + (end - start) * i / max(1, n_extra)) for i in range(n_extra)})
    for k, n in enumerate(phases_needed):
        s_idx = k // PHASES_PER_SAGA
        sid = 'saga%d' % (n_sagas0 + 1 + s_idx)
        name, cols = SAGA_COLORS[s_idx % len(SAGA_COLORS)]
        if not any(s['id'] == sid for s in tax['sagas']):
            tax['sagas'].append({'id': sid, 'qid': 'Q0', 'label_fr': 'Saga %d (fictive)' % (n_sagas0 + 1 + s_idx),
                                 'label_original': 'Saga %d' % (n_sagas0 + 1 + s_idx), 'phases': [],
                                 'color': cols[0], 'color_name': name, 'source': 'fixture'})
        saga = next(s for s in tax['sagas'] if s['id'] == sid)
        saga['phases'].append(n)
        col = cols[k % PHASES_PER_SAGA]
        tax['phases'].append({'n': n, 'roman': ROMAN[n] if n < len(ROMAN) else str(n), 'qid': 'Q0', 'saga': sid,
                              'source': 'fixture', 'color': col, 'color_name': '%s %d' % (name, k % PHASES_PER_SAGA + 1),
                              'palette': {'sky': '#11172A', 'nebula': ['#2A1E3A', '#1C2A44'], 'accent': col}})
    save('taxonomy.json', tax)
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from build_site import colors_css  # même feuille que le vrai site
    with open(os.path.join(dpath, 'couleurs.css'), 'w', encoding='utf-8') as f:
        f.write(colors_css(tax))

    # -- œuvres fictives -----------------------------------------------------------------------
    n0 = len(works)
    max_story = max(w['story']['v'] for w in works if w.get('story'))
    at = 'fixture'
    saga_of = {p['n']: p['saga'] for p in tax['phases']}
    pal_of = {p['n']: p['palette'] for p in tax['phases']}
    for i in range(n_extra):
        k = i + 1
        t = start + (end - start) * (i + 0.5) / n_extra
        year = int(t)
        month = min(12, 1 + int((t - year) * 12))
        day = 1 + (i * 7) % 27
        phase = phase_at(t)
        kind = 'series' if i % 3 == 1 else 'film'
        qid = 'QF%03d' % k
        late = t > end - 1.2  # dernière année : date au mois près, comme les annonces lointaines
        rel = {'v': '%d-%02d' % (year, month), 'precision': 'month'} if late else {'v': '%d-%02d-%02d' % (year, month, day), 'precision': 'day'}
        works.append({
            'id': qid, 'slug': 'oeuvre-fictive-%02d' % k, 'kind': kind,
            'title_fr': {'v': 'Œuvre fictive %02d' % k, 'src': 'fixture', 'ref': qid, 'at': at},
            'title_original': {'v': 'Test Work %02d' % k, 'src': 'fixture', 'ref': qid, 'at': at, 'lang': 'en'},
            'release': {'fr': None, 'us': None, 'first': dict(rel, src='fixture', ref=qid, at=at)},
            'phase': {'v': phase, 'src': 'fixture', 'ref': qid, 'at': at},
            'saga': {'v': saga_of[phase], 'src': 'fixture', 'ref': qid, 'at': at},
            'universe': {'v': 'earth-616', 'src': 'fixture', 'ref': qid, 'at': at},
            'story': dict({'v': max_story + k, 'src': 'fixture', 'ref': qid, 'at': at},
                          **({'provisional': True} if i >= n_extra - 3 else {})),
            'order_release': {'v': n0 + k, 'src': 'fixture', 'ref': qid, 'at': at},
            'seasons': [], 'tagline': None, 'poster': None, 'directors': [], 'runtime_min': None,
            'palette': dict(pal_of[phase], band='#8C8FB0', source='phase'),
            'has_plot': False, 'frwiki': None,
        })
    save('works.json', data)
    # le préchargement de la page vise les vraies données : l'empreinte change, l'adresse reste servie
    print('Simulation : %d œuvres (%d réelles + %d fictives, %g par an jusqu’en %d), phases I à %s, %d sagas -> %s' % (
        len(works), n0, n_extra, args.par_an, int(end), ROMAN[max(phases_needed)], len(tax['sagas']), out))


if __name__ == '__main__':
    main()
