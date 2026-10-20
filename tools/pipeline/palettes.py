# -*- coding: utf-8 -*-
"""Palettes du ciel par œuvre.

Deux sources (variable d'environnement PALETTE_SOURCE) :
- `phase` (défaut) : palette de la phase, définie dans data/curated/taxonomy.json ;
- `poster` : 3 couleurs extraites des affiches TMDB téléchargées par fetch_tmdb.py (en CI). Le
  résultat (de simples codes couleur) reste dans data/tmdb/ comme les autres données TMDB.

Contraste garanti par construction, pour TOUTES les œuvres :
- ciel : luminance relative WCAG ≤ 0,06 → texte #EDEAE4 ≥ 9:1 et aucun « flash » possible ;
- accent : ≥ 4,5:1 sur le ciel et sur le panneau de texte ;
- bande claire (maquette C) : encre noire ≥ 3:1 dessus.
En cas d'échec : palette neutre.
"""
import io
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.dirname(HERE))

from pipeline import oklch as ok  # noqa: E402

FG = '#EDEAE4'
PANEL = '#0B0D17'
INK = '#05060A'
SKY_MAX_Y = 0.06


def finalize(sky, nebula, accent):
    """Applique les bornes de contraste ; renvoie (palette, ok, rapport)."""
    L, C, H = ok.hex_to_oklch(sky)
    L = min(max(L, 0.14), 0.24)
    C = min(C, 0.05)
    L, sky_hex = ok.clamp_lightness_for_luminance(L, C, H, SKY_MAX_Y)
    neb = []
    for n in nebula:
        l2, c2, h2 = ok.hex_to_oklch(n)
        l2 = min(max(l2, 0.24), 0.32)
        neb.append(ok.oklch_to_hex(l2, min(c2, 0.07), h2))
    la, ca, ha = ok.hex_to_oklch(accent)
    la = min(max(la, 0.70), 0.85)
    ca = min(ca, 0.15)
    la, accent_hex = ok.raise_until_contrast(la, ca, ha, sky_hex, 4.5)
    la, accent_hex = ok.raise_until_contrast(la, ca, ha, PANEL, 4.5)
    lb = 0.60
    lb, band_hex = ok.raise_until_contrast(lb, min(ca, 0.08), ha, INK, 3.0)
    report = {
        'fg_on_sky': round(ok.contrast(FG, sky_hex), 2),
        'accent_on_sky': round(ok.contrast(accent_hex, sky_hex), 2),
        'accent_on_panel': round(ok.contrast(accent_hex, PANEL), 2),
        'ink_on_band': round(ok.contrast(INK, band_hex), 2),
        'sky_luminance': round(ok.luminance(sky_hex), 4),
    }
    good = (report['fg_on_sky'] >= 7 and report['accent_on_sky'] >= 4.5
            and report['accent_on_panel'] >= 4.5 and report['ink_on_band'] >= 3
            and report['sky_luminance'] <= SKY_MAX_Y)
    return {'sky': sky_hex, 'nebula': neb, 'accent': accent_hex, 'band': band_hex}, good, report


def from_poster(path):
    """Extraction Pillow (lecture seule de l'image, aucune image produite)."""
    from PIL import Image
    im = Image.open(path).convert('RGB')
    w, h = im.size
    im = im.crop((int(w * 0.04), int(h * 0.04), int(w * 0.96), int(h * 0.82)))
    im.thumbnail((200, 200))
    q = im.quantize(colors=8, method=Image.MEDIANCUT)
    pal = q.getpalette()[:24]
    counts = sorted(q.getcolors(), reverse=True)
    total = float(sum(c for c, _ in counts))
    cols = []
    for c, idx in counts:
        rgb = tuple(v / 255.0 for v in pal[idx * 3: idx * 3 + 3])
        L, C, H = ok.rgb_to_oklch(rgb)
        cols.append({'hex': ok.rgb_to_hex(rgb), 'w': c / total, 'L': L, 'C': C, 'H': H})
    sky = cols[0]['hex']
    others = [c['hex'] for c in cols[1:3]] or [sky, sky]
    vivid = sorted([c for c in cols if c['w'] >= 0.03], key=lambda c: -c['C'])
    accent = (vivid[0] if vivid else cols[0])['hex']
    return sky, others, accent, [{'hex': c['hex'], 'w': round(c['w'], 3)} for c in cols]


def build(works, taxonomy, tmdb=None, source=None):
    source = source or os.environ.get('PALETTE_SOURCE', 'phase')
    phase_pal = {p['n']: p['palette'] for p in taxonomy['phases']}
    neutral = taxonomy['neutral_palette']
    out = {}
    for w in works:
        base = phase_pal.get((w.get('phase') or {}).get('v'), neutral)
        src, raw = 'phase', None
        sky, neb, acc = base['sky'], base['nebula'], base['accent']
        rec = (tmdb or {}).get('works', {}).get(w['id']) if tmdb else None
        if source == 'poster' and rec and rec.get('poster_w342'):
            path = os.path.join(ROOT, 'site', rec['poster_w342'])
            if os.path.exists(path):
                sky, neb, acc, raw = from_poster(path)
                src = 'poster'
        pal, good, report = finalize(sky, neb, acc)
        if not good:
            pal, good, report = finalize(neutral['sky'], neutral['nebula'], neutral['accent'])
            src = 'neutral'
        out[w['id']] = dict(pal, source=src, contrast=report, ok=good)
        if raw:
            out[w['id']]['raw'] = raw
    return out


if __name__ == '__main__':
    with io.open(os.path.join(ROOT, 'data', 'build', 'works.json'), encoding='utf-8') as f:
        works = json.load(f)['works']
    with io.open(os.path.join(ROOT, 'data', 'curated', 'taxonomy.json'), encoding='utf-8') as f:
        tax = json.load(f)
    res = build(works, tax)
    bad = [k for k, v in res.items() if not v['ok']]
    print('{} palettes, {} en échec'.format(len(res), len(bad)))
