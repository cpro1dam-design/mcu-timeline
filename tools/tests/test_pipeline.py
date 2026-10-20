# -*- coding: utf-8 -*-
"""Tests hors réseau des briques du pipeline (bibliothèque standard, Python 3.7+)."""
import os
import sys
import unittest

TOOLS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, TOOLS)

from pipeline import wikidata as wd  # noqa: E402
from pipeline import merge, oklch, palettes, phase_tables  # noqa: E402
from pipeline.frwiki import html_to_paragraphs, france_release  # noqa: E402
from pipeline.fetch_tmdb import key_from_text  # noqa: E402


def claim(value, rank='normal', quals=None):
    c = {'rank': rank, 'mainsnak': {'datavalue': {'value': value}}}
    if quals:
        c['qualifiers'] = {p: [{'datavalue': {'value': v}} for v in vs] for p, vs in quals.items()}
    return c


def item(q):
    return {'id': q, 'entity-type': 'item'}


def time(t, prec=11):
    return {'time': t, 'precision': prec}


class WikidataSemantics(unittest.TestCase):
    def test_deprecated_ignored_and_preferred_does_not_hide_others(self):
        ent = {'claims': {'P179': [claim(item('Q642878'), 'preferred'),
                                   claim(item('Q51963292')), claim(item('Q1'), 'deprecated')]}}
        self.assertEqual(wd.item_ids(ent, 'P179'), ['Q642878', 'Q51963292'])
        self.assertEqual(wd.item_ids(ent, 'P179', best=True), ['Q642878'])

    def test_label_fallback_mul(self):
        ent = {'labels': {'mul': {'value': 'Iron Man'}, 'en': {'value': 'Iron Man (en)'}}}
        self.assertEqual(wd.label(ent), ('Iron Man', 'mul'))

    def test_time_precision(self):
        self.assertEqual(wd.time_value(time('+2027-12-17T00:00:00Z')), ('2027-12-17', 'day'))
        self.assertEqual(wd.time_value(time('+2027-12-00T00:00:00Z', 10)), ('2027-12', 'month'))
        self.assertEqual(wd.time_value(time('+2027-00-00T00:00:00Z', 9)), ('2027', 'year'))


class Characters(unittest.TestCase):
    def test_themself_is_not_a_character(self):
        work = {'claims': {'P161': [
            claim(item('Q10'), quals={'P453': [item(wd.Q_THEMSELF)], 'P3831': [item(wd.Q_CAMEO)]}),
            claim(item('Q11'), quals={'P453': [item('Q20')]}),
        ]}}
        people = {q: {'labels': {'fr': {'value': n}}} for q, n in
                  (('Q10', 'Stan Lee'), ('Q11', 'Robert Downey Jr.'), ('Q20', 'Tony Stark'),
                   (wd.Q_THEMSELF, 'lui/elle-même'))}
        out = merge.build_characters({'Q1': work}, people, '2026-10-16')
        self.assertEqual([c['id'] for c in out['characters']], ['Q20'])
        self_app = next(a for a in out['appearances'] if a['actor'] == 'Q10')
        self.assertIsNone(self_app['character'])
        self.assertEqual(self_app['role']['v'], 'dans son propre rôle')
        self.assertEqual(self_app['level']['v'], 'cameo')


class CharacterMerge(unittest.TestCase):
    def test_comics_item_merged_into_mcu_item_and_aliases(self):
        # WandaVision crédite la version comics d'Agatha (Q2) ; la version MCU (Q1) y est présente (P1441)
        wv = {'claims': {'P161': [claim(item('Q10'), quals={'P453': [item('Q2')]})]}}
        aaa = {'claims': {'P161': [claim(item('Q10'), quals={'P453': [item('Q1')]})]}}
        people = {
            'Q10': {'labels': {'fr': {'value': 'Kathryn Hahn'}}},
            'Q1': {'labels': {'en': {'value': 'Agatha Harkness'}},
                   'claims': {'P1080': [claim(item(wd.Q_MCU))], 'P1441': [claim(item('QWV')), claim(item('QAAA'))]}},
            'Q2': {'labels': {'fr': {'value': 'Agatha Harkness'}}, 'aliases': {'en': [{'value': 'Agnes'}]}},
        }
        out = merge.build_characters({'QWV': wv, 'QAAA': aaa}, people, '2026-10-17')
        self.assertEqual([c['id'] for c in out['characters']], ['Q1'])
        self.assertEqual(sorted(a['work'] for a in out['appearances']), ['QAAA', 'QWV'])
        self.assertEqual(out['characters'][0]['aliases']['v'], ['Agnes'])

    def test_variant_from_another_film_universe_stays_distinct(self):
        w = {'claims': {'P161': [claim(item('Q10'), quals={'P453': [item('Q1')]}), claim(item('Q11'), quals={'P453': [item('Q3')]})]}}
        people = {
            'Q10': {'labels': {'fr': {'value': 'Tom Holland'}}}, 'Q11': {'labels': {'fr': {'value': 'Tobey Maguire'}}},
            'Q1': {'labels': {'fr': {'value': 'Peter Parker'}}, 'claims': {'P1080': [claim(item(wd.Q_MCU))], 'P1441': [claim(item('QNWH'))]}},
            'Q3': {'labels': {'fr': {'value': 'Peter Parker'}}, 'claims': {'P1080': [claim(item('Q63728626'))]}},
        }
        out = merge.build_characters({'QNWH': w}, people, '2026-10-17')
        self.assertEqual(sorted(c['id'] for c in out['characters']), ['Q1', 'Q3'])

    def test_pseudonym_is_an_alias(self):
        w = {'claims': {'P161': [claim(item('Q10'), quals={'P453': [item('Q1')]})]}}
        people = {'Q10': {'labels': {'fr': {'value': 'Robert Downey Jr.'}}},
                  'Q1': {'labels': {'fr': {'value': 'Tony Stark'}}, 'aliases': {'mul': [{'value': 'Iron Man'}]},
                         'claims': {'P742': [claim('Iron Man')]}}}
        out = merge.build_characters({'QIM': w}, people, '2026-10-17')
        self.assertEqual(out['characters'][0]['aliases']['v'], ['Iron Man'])


class ColorCode(unittest.TestCase):
    TAX = {'sagas': [{'id': 'infinity', 'label_fr': 'Saga A', 'phases': [1, 2], 'color': '#F2B33D'}],
           'phases': [{'n': 1, 'roman': 'I', 'saga': 'infinity', 'color': '#F7D774'},
                      {'n': 2, 'roman': 'II', 'saga': 'infinity', 'color': '#222222'}]}

    def test_css_variables_per_saga_and_phase(self):
        import build_site
        css = build_site.colors_css(self.TAX)
        self.assertIn('[data-saga="infinity"] { --saga-color: #F2B33D; }', css)
        self.assertIn('[data-phase="1"] { --phase-color: #F7D774; }', css)
        self.assertIn('--phase-none:', css)

    def test_low_contrast_is_rejected(self):
        import check_data

        class R:
            def __init__(self):
                self.errors, self.warnings = [], []

            def err(self, m):
                self.errors.append(m)

            def warn(self, m):
                self.warnings.append(m)
        r = R()
        check_data.check_colors(r, self.TAX)
        self.assertEqual(len(r.errors), 1)
        self.assertIn('phase 2', r.errors[0])


class ReleaseDates(unittest.TestCase):
    def test_country_qualifiers_and_deprecated(self):
        ent = {'claims': {'P577': [
            claim(time('+2026-05-01T00:00:00Z'), 'deprecated', {'P291': [item('Q30')]}),
            claim(time('+2026-12-18T00:00:00Z'), 'normal', {'P291': [item('Q30')]}),
            claim(time('+2026-12-16T00:00:00Z'), 'normal', {'P291': [item('Q142')]}),
        ]}}
        rel, conflicts = merge.release_dates(ent, 'Q113244839', '2026-10-14')
        self.assertEqual(rel['us']['v'], '2026-12-18')
        self.assertEqual(rel['fr']['v'], '2026-12-16')
        self.assertEqual(conflicts, [])

    def test_unplaced_single_date_is_first(self):
        ent = {'claims': {'P577': [claim(time('+2027-12-17T00:00:00Z'))]}}
        rel, _ = merge.release_dates(ent, 'Q1', '2026-10-14')
        self.assertIsNone(rel['us'])
        self.assertEqual(rel['first']['v'], '2027-12-17')


class Orders(unittest.TestCase):
    def w(self, q, date):
        return {'id': q, 'release': {'fr': {'v': date, 'precision': 'day'}, 'us': None, 'first': None}}

    def test_provisional_after_previous_release(self):
        works = [self.w('Q1', '2008-04-30'), self.w('Q2', '2011-08-17'), self.w('Q3', '2026-07-29')]
        story = {'reference': {'url': 'https://example.org'}, 'order': [{'id': 'Q2'}, {'id': 'Q1'}]}
        merge.assign_orders(works, story, '2026-10-14')
        by = {w['id']: w for w in works}
        self.assertEqual([by[q]['story']['v'] for q in ('Q2', 'Q1', 'Q3')], [1, 2, 3])
        self.assertTrue(by['Q3']['story']['provisional'])
        self.assertFalse(by['Q1']['story']['provisional'])
        self.assertEqual([by[q]['order_release']['v'] for q in ('Q1', 'Q2', 'Q3')], [1, 2, 3])


class ScopeRules(unittest.TestCase):
    SCOPE = {'excluded_types': {}, 'allowed_types': {'Q11424': 'film', 'Q1261214': 'special'},
             'excluded_kinds': {'special': 'épisodes spéciaux exclus'}, 'production_companies': ['Q367466'],
             'include': [], 'exclude': []}

    def ent(self, q, typ):
        return {'id': q, 'claims': {'P31': [claim(item(typ))], 'P272': [claim(item('Q367466'))]}}

    def test_special_kind_is_excluded(self):
        from pipeline.discover import in_scope
        ok, kind, why = in_scope(self.ent('Q1', 'Q1261214'), self.SCOPE)
        self.assertFalse(ok)
        self.assertEqual(kind, 'special')
        self.assertTrue(why.startswith('nature exclue'))
        rows = [{'category': 'special'}]  # rubrique « Téléfilms » d'un article de phase
        self.assertFalse(in_scope(self.ent('Q2', 'Q11424'), self.SCOPE, rows)[0])
        self.assertTrue(in_scope(self.ent('Q3', 'Q11424'), self.SCOPE)[0])

    def w(self, q, fr=None, us=None):
        mk = lambda d: {'v': d, 'precision': 'day' if len(d) == 10 else 'year'} if d else None
        return {'id': q, 'kind': 'series', 'title_fr': {'v': q}, 'release': {'fr': mk(fr), 'us': mk(us), 'first': None}}

    def test_released_before_official_order_but_absent_is_excluded(self):
        story = {'reference': {'published': '2026-03-27', 'url': 'https://example.org'},
                 'order': [{'id': 'Q1'}, {'id': None}]}
        rule = {'enabled': True, 'grace_days': 30}
        works = [self.w('Q1', '2025-01-01'),            # dans l'ordre : gardée
                 self.w('Q2', us='2025-01-29'),          # sortie avant, absente : écartée
                 self.w('Q3', '2026-03-10'),             # dans le délai de grâce : gardée (provisoire)
                 self.w('Q4', '2026-05-12'),             # sortie après le relevé : gardée
                 self.w('Q5', '2025')]                   # date au jour près inconnue : gardée
        kept, out = merge.official_order_exclusions(works, story, rule)
        self.assertEqual([w['id'] for w in kept], ['Q1', 'Q3', 'Q4', 'Q5'])
        self.assertEqual([x['id'] for x in out], ['Q2'])
        self.assertEqual(merge.official_order_exclusions(works, story, dict(rule, enabled=False))[1], [])


class FrenchTypography(unittest.TestCase):
    def test_nbsp(self):
        self.assertEqual(merge.nbsp_fr('Avengers : Endgame'), 'Avengers : Endgame')
        self.assertEqual(merge.nbsp_fr('« Bonjour »'), '« Bonjour »')
        self.assertNotIn(' ', merge.nbsp_fr('a : b'))

    def test_html_to_paragraphs_strips_refs_and_tables(self):
        html = ('<div><p>Tony Stark est un inventeur<sup class="reference"><a>[1]</a></sup> : il construit '
                'une armure.</p><table><tr><td>Ignoré</td></tr></table><p class="mw-empty-elt"></p>'
                '<p>Deuxième paragraphe.</p></div>')
        self.assertEqual(html_to_paragraphs(html),
                         ['Tony Stark est un inventeur : il construit une armure.', 'Deuxième paragraphe.'])


class FranceRelease(unittest.TestCase):
    def test_list_only_and_national_release(self):
        wt = '\n'.join([
            'Le film devait sortir en [[France]] : {{date|7|mai|2021}} selon une annonce.',
            '* Dates de sortie :',
            '** [[États-Unis]] : {{date|5|mai|2023}}',
            '** [[France]] : {{date|22|avril|2023}} (avant-première) ; {{date|3|mai|2023|au cinéma}} (sortie nationale)',
            'Suite.'])
        self.assertEqual(france_release(wt)[0], '2023-05-03')

    def test_no_list(self):
        self.assertEqual(france_release('En [[France]] : {{date|1|mai|2020}}'), (None, None))


class PhaseTables(unittest.TestCase):
    def test_film_row_with_flags(self):
        html = ('<div class="mw-heading"><h2 id="Films">Films</h2></div><table><tbody>'
                '<tr><th>Film</th><th>Dates</th></tr>'
                '<tr><td scope="row"><i><b><a href="/wiki/X" title="Thunderbolts*">Thunderbolts*</a></b></i></td>'
                '<td><span class="flagicon"><a class="mw-file-description" title="Drapeau des États-Unis"></a></span>'
                ' <time datetime="2025-05-02">2 mai 2025</time><br><span class="flagicon">'
                '<a class="mw-file-description" title="Drapeau de la France"></a></span> '
                '<time datetime="2025-04-30">30 avril 2025</time></td></tr></tbody></table>')
        rows = phase_tables.entries(html)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['title'], 'Thunderbolts*')
        self.assertEqual(rows[0]['dates']['fr'], ('2025-04-30', 'day'))
        self.assertEqual(rows[0]['dates']['us'], ('2025-05-02', 'day'))

    def test_series_rows(self):
        html = ('<h2 id="Séries_télévisées">Séries</h2><table><tbody>'
                '<tr><th>Série</th><th>Saison</th></tr>'
                '<tr><th><i><a title="Loki (série télévisée)">Loki</a></i></th><td></td><td>2</td><td>6</td>'
                '<td>6 octobre 2023</td><td>10 novembre 2023</td></tr></tbody></table>')
        rows = phase_tables.entries(html)
        self.assertEqual(rows[0]['season'], 2)
        self.assertEqual(rows[0]['episodes'], 6)
        self.assertEqual(rows[0]['dates']['first'], ('2023-10-06', 'day'))

    def test_parse_fr_date(self):
        self.assertEqual(phase_tables.parse_fr_date('1er août 2025'), ('2025-08-01', 'day'))
        self.assertEqual(phase_tables.parse_fr_date('mars 2027'), ('2027-03', 'month'))


class Colors(unittest.TestCase):
    def test_contrast_reference_values(self):
        # valeurs vérifiées lors de la recherche (WCAG 2.x)
        self.assertAlmostEqual(oklch.contrast('#ED1D24', '#0B0D17'), 4.43, places=2)
        self.assertAlmostEqual(oklch.contrast('#EDEAE4', '#0B0D17'), 16.13, places=1)

    def test_roundtrip(self):
        L, C, H = oklch.hex_to_oklch('#D9C49A')
        self.assertEqual(oklch.oklch_to_hex(L, C, H), '#D9C49A')

    def test_palette_guarantees(self):
        for sky, acc in (('#FFFFFF', '#FFFF00'), ('#FF0000', '#330000'), ('#000000', '#000000')):
            pal, ok, rep = palettes.finalize(sky, [sky, acc], acc)
            self.assertLessEqual(rep['sky_luminance'], palettes.SKY_MAX_Y)
            self.assertGreaterEqual(rep['fg_on_sky'], 7)
            self.assertGreaterEqual(rep['ink_on_band'], 3)


class TmdbKey(unittest.TestCase):
    def test_whole_key_file_pasted_in_secret(self):
        # contenu entier de tools/tmdb_key.txt collé dans le secret : commentaires, ligne vide, fin CRLF
        pasted = chr(10).join(['# Copiez ce fichier…', '# Collez votre jeton…', '', '  eyJexemplefictif123  ' + chr(13), ''])
        self.assertEqual(key_from_text(pasted), 'eyJexemplefictif123')

    def test_key_alone_and_empty(self):
        self.assertEqual(key_from_text('abc123'), 'abc123')
        self.assertIsNone(key_from_text('# seulement un commentaire' + chr(10)))
        self.assertIsNone(key_from_text(''))


class Preloads(unittest.TestCase):
    """Le préchargement d'une page générée vise des fichiers qui existent, quelle que soit sa profondeur."""

    def test_generated_pages_resolve(self):
        import re
        import build_site as bs
        saved = dict(bs.PRELOAD['hashes'])
        bs.PRELOAD['hashes'].update({'works.json': 'x', 'taxonomy.json': 'y'})
        try:
            for rel, page_dir, page_id in (('', bs.SITE, 'index'),
                                           ('../../', os.path.join(bs.SITE, 'oeuvres', 'iron-man'), 'oeuvre'),
                                           ('../', os.path.join(bs.SITE, 'pages'), 'page')):
                hrefs = re.findall(r'href="([^"?]+)', bs.preload_head(rel, page_id))
                self.assertTrue(hrefs, rel)
                for h in hrefs:
                    if h.endswith('.json'):  # données générées : peut-être pas encore construites ici
                        self.assertIn(h, (rel + 'data/works.json', rel + 'data/taxonomy.json'))
                    else:
                        self.assertTrue(os.path.isfile(os.path.normpath(os.path.join(page_dir, h))), (rel, h))
        finally:
            bs.PRELOAD['hashes'].clear()
            bs.PRELOAD['hashes'].update(saved)


if __name__ == '__main__':
    unittest.main()
