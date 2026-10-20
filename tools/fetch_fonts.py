# -*- coding: utf-8 -*-
"""Auto-hébergement des polices Google Fonts (licence OFL 1.1) — aucun appel à Google depuis le
navigateur des visiteurs (RGPD).

Télécharge les fichiers woff2 (sous-ensembles latin + latin-ext uniquement) dans
site/shared/fonts/<famille>/ et écrit site/shared/css/fonts.css (@font-face locaux, font-display: swap),
ainsi que le texte de licence OFL de chaque famille dans LICENSES/fonts/.

Usage : py -3 -X utf8 tools/fetch_fonts.py [--dry-run]
"""
import argparse
import io
import os
import re
import sys
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from pipeline.http import Http  # noqa: E402

FONTS_DIR = os.path.join(ROOT, 'site', 'shared', 'fonts')
CSS_OUT = os.path.join(ROOT, 'site', 'shared', 'css', 'fonts.css')
LIC_DIR = os.path.join(ROOT, 'LICENSES', 'fonts')
KEEP_SUBSETS = ('latin', 'latin-ext')
# famille Google Fonts → (paramètre CSS2, dossier du dépôt google/fonts pour la licence)
FAMILIES = [
    ('Archivo', 'Archivo:ital,wdth,wght@0,62..125,100..900;1,62..125,100..900', 'ofl/archivo'),
    ('Newsreader', 'Newsreader:ital,opsz,wght@0,6..72,200..800;1,6..72,200..800', 'ofl/newsreader'),
    ('Inter', 'Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900', 'ofl/inter'),
    ('Antonio', 'Antonio:wght@100..700', 'ofl/antonio'),
    ('Instrument Serif', 'Instrument+Serif:ital@0;1', 'ofl/instrumentserif'),
]
# un navigateur récent obtient du woff2 et des sous-ensembles annotés /* latin */
BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'


def fetch_css(http, spec):
    import ssl
    import urllib.request
    url = 'https://fonts.googleapis.com/css2?family={}&display=swap'.format(spec)
    req = urllib.request.Request(url, headers={'User-Agent': BROWSER_UA})
    with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=30) as r:
        return r.read().decode('utf-8')


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args(argv)
    http = Http(min_interval=0.3, cache=False)
    css_out = ['/* Polices auto-hébergées (licence SIL OFL 1.1, voir LICENSES/fonts/). Généré par tools/fetch_fonts.py. */']
    total = 0
    for name, spec, repo_dir in FAMILIES:
        css = fetch_css(http, spec)
        blocks = re.findall(r'/\*\s*([\w-]+)\s*\*/\s*(@font-face\s*{[^}]+})', css)
        slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
        for subset, block in blocks:
            if subset not in KEEP_SUBSETS:
                continue
            m = re.search(r'url\((https://fonts\.gstatic\.com/[^)]+\.woff2)\)', block)
            style = re.search(r'font-style:\s*(\w+)', block).group(1)
            if not m:
                continue
            fname = '{}-{}-{}.woff2'.format(slug, style, subset)
            dest = os.path.join(FONTS_DIR, slug, fname)
            if not args.dry_run:
                total += http.download(m.group(1), dest)
            local = block.replace(m.group(0), "url('../fonts/{}/{}') format('woff2')".format(slug, fname))
            local = re.sub(r"\s*format\('woff2'\)\s*format\('woff2'\)", " format('woff2')", local)
            css_out.append('/* {} — {} */\n{}'.format(name, subset, local))
        if not args.dry_run:
            lic_url = 'https://raw.githubusercontent.com/google/fonts/main/{}/OFL.txt'.format(repo_dir)
            try:
                import ssl
                import urllib.request
                with urllib.request.urlopen(urllib.request.Request(lic_url, headers={'User-Agent': BROWSER_UA}),
                                            context=ssl.create_default_context(), timeout=30) as r:
                    text = r.read().decode('utf-8')
                os.makedirs(LIC_DIR, exist_ok=True)
                with io.open(os.path.join(LIC_DIR, slug + '-OFL.txt'), 'w', encoding='utf-8', newline='\n') as f:
                    f.write(text)
            except Exception as e:  # licence obligatoire : on le signale
                print('  ! licence {} introuvable : {}'.format(name, e))
        print('{} : {} sous-ensembles'.format(name, sum(1 for s, _ in blocks if s in KEEP_SUBSETS)))
    if not args.dry_run:
        with io.open(CSS_OUT, 'w', encoding='utf-8', newline='\n') as f:
            f.write('\n\n'.join(css_out) + '\n')
    print('Total téléchargé : {:.0f} Ko'.format(total / 1024.0))
    return 0


if __name__ == '__main__':
    sys.exit(main())
