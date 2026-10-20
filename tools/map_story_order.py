# -*- coding: utf-8 -*-
"""Aide à la maintenance : rattache les titres de data/curated/story_order.json aux QID des œuvres
publiées (par titre original / titre anglais). Ne remplit que les identifiants manquants et affiche
les entrées non rattachées pour vérification humaine. Ne modifie jamais l'ordre ni la référence.

Usage : py -3 -X utf8 tools/map_story_order.py [--write]
"""
import io
import json
import os
import re
import sys
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def norm(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode('ascii').lower()
    s = s.replace('&', 'and')
    s = re.sub(r'\bthe\b', ' ', s)
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def main():
    write = '--write' in sys.argv
    p = os.path.join(ROOT, 'data', 'curated', 'story_order.json')
    with io.open(p, encoding='utf-8') as f:
        story = json.load(f)
    with io.open(os.path.join(ROOT, 'data', 'build', 'works.json'), encoding='utf-8') as f:
        works = json.load(f)['works']
    index = {}
    for w in works:
        for t in ((w.get('title_original') or {}).get('v'), (w.get('title_fr') or {}).get('v')):
            if t:
                index.setdefault(norm(t), w['id'])
    used = {e['id'] for e in story['order'] if e.get('id')}
    missing = []
    for e in story['order']:
        if e.get('id'):
            continue
        title = re.sub(r'\s+Season\s+\d+$', '', e['title'])
        q = index.get(norm(title))
        if q and e['title'] != title:
            e['note'] = 'saison supplémentaire : rattachée à la série, déjà placée'
            q = None
        if q and q not in used:
            e['id'] = q
            used.add(q)
        elif not q:
            missing.append(e['title'])
    print('Rattachées : {} / {}'.format(len(used), len(story['order'])))
    print('Non rattachées (hors périmètre ou à vérifier) :')
    for t in missing:
        print('  -', t)
    if write:
        with io.open(p, 'w', encoding='utf-8', newline='\n') as f:
            json.dump(story, f, ensure_ascii=False, indent=2)
            f.write('\n')
        print('story_order.json mis à jour.')


if __name__ == '__main__':
    main()
