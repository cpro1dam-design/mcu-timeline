# -*- coding: utf-8 -*-
"""Pages fixes : mentions légales, confidentialité, accessibilité, sources et crédits, méthode,
à propos, mises à jour. Les informations personnelles de l'éditeur viennent de site.config.json ;
tant qu'elles ne sont pas renseignées, un emplacement « [à compléter] » est affiché."""
import os

NOT_SET = '<span class="todo">[à compléter]</span>'
PREFS_KEY = 'frise-mcu:prefs:v1'


def build_pages(cfg, page, esc, date_fr, works, scope, taxonomy, status, story_ref, changelog,
                tmdb_used, out_dir, write):
    rel = '../'
    ed = cfg.get('editor') or {}
    host = cfg.get('host') or {}
    anon = bool(ed.get('anonymous'))  # éditeur non professionnel anonyme (LCEN, art. 1-1 II)
    name = esc(ed['name']) if ed.get('name') else NOT_SET
    email = ('<a href="mailto:{0}">{0}</a>'.format(esc(ed['email'])) if ed.get('email') else None)
    repo = cfg.get('repo_url')
    report = ('<a href="{}/issues/new?template=signaler-erreur.yml">formulaire de signalement</a> '
              '(aucune donnée personnelle demandée ; un compte GitHub est nécessaire)'.format(esc(repo)) if repo else
              'formulaire de signalement ' + NOT_SET)
    # sans adresse e-mail (formule anonyme), le formulaire de signalement sert de contact
    contact = email or ('le ' + report if anon else NOT_SET)
    editor_p = ('<p>Site personnel et non commercial, édité par un particulier à titre non professionnel. Comme le '
                'permet l’article 1-1 (II) de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l’économie '
                'numérique, l’éditeur préserve son anonymat : seules les coordonnées de son hébergeur sont indiquées '
                'ci-dessous. Contact : {}.</p>'.format(contact) if anon else
                '<p>Site personnel, non commercial, édité par {}. Contact : {}.</p>'.format(name, contact))
    published = bool(cfg.get('base_url'))

    def P(slug, title, body, desc=''):
        write(os.path.join(out_dir, slug + '.html'),
              page(cfg, '{} · {}'.format(title, cfg['site_name']), body, rel, 'page-' + slug, desc,
                   status, tmdb_used))

    # -- Mentions légales -------------------------------------------------------------
    P('mentions-legales', 'Mentions légales', '''<h1>Mentions légales</h1>
{local}
<h2>Éditeur</h2>
{editor_p}
<h2>Hébergeur</h2>
<p>{host_name}, {host_addr}. Contact : <a href="{host_contact}">{host_contact}</a>.</p>
<h2>Propriété intellectuelle</h2>
<p>Site de fan non officiel et non commercial. Il n’est ni affilié, ni approuvé, ni sponsorisé par Marvel Studios, Marvel Entertainment ou The Walt Disney Company. Les titres, noms de personnages et marques cités appartiennent à leurs propriétaires respectifs ; aucun logo officiel n’est utilisé.</p>
<p>Les textes repris de Wikipédia restent sous licence <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.fr">CC BY-SA 4.0</a> ; leur source et leur version sont indiquées sur chaque fiche. Les données de Wikidata sont sous licence CC0. Les affiches, lorsqu’elles sont affichées, proviennent de TMDB et appartiennent à leurs ayants droit.</p>
<h2 id="signaler">Signaler une erreur ou demander un retrait</h2>
<p>Toute erreur, ou toute demande de retrait d’un contenu par un ayant droit, peut être signalée via le {report}{by_mail}. Les demandes de retrait sont traitées sous 72 heures.</p>'''.format(
        local='' if published else '<p class="notice">Ce site n’est pas encore publié : il fonctionne en local. Les mentions ci-dessous seront complétées avant la mise en ligne.</p>',
        editor_p=editor_p, by_mail=(' ou par courriel à ' + email) if email else ('' if anon else ' ou par courriel à ' + NOT_SET),
        host_name=esc(host.get('name', '')), host_addr=esc(host.get('address', '')),
        host_contact=esc(host.get('contact', '')), report=report))

    # -- Confidentialité ---------------------------------------------------------------
    P('confidentialite', 'Confidentialité', '''<h1>Confidentialité</h1>
<p>Dernière mise à jour : {date}.</p>
<h2>Ce que ce site ne fait pas</h2>
<ul>
<li>Aucun cookie, aucune mesure d’audience, aucune publicité.</li>
<li>Aucune requête vers un service tiers depuis votre navigateur : polices, images et scripts sont tous servis par ce site. Une politique de sécurité du contenu (CSP) l’impose techniquement.</li>
<li>Aucun compte, aucun formulaire de collecte.</li>
</ul>
<h2>Vos réglages, stockés sur votre appareil</h2>
<p>Lorsque vous modifiez un réglage, il est enregistré dans le stockage local de votre navigateur (<code>localStorage</code>), sous la clé <code>{key}</code>. Il n’est jamais transmis. Ce stockage sert uniquement à personnaliser l’affichage à votre demande ; il est exempté de consentement (CNIL, délibération n° 2020-091, article 5).</p>
<table><caption>Contenu de la clé {key}</caption>
<thead><tr><th scope="col">Réglage</th><th scope="col">Finalité</th></tr></thead>
<tbody>
<tr><th scope="row">vuJusqua</th><td>Dernière œuvre vue, pour masquer ce qui suit (identifiant Wikidata).</td></tr>
<tr><th scope="row">toutAfficher</th><td>Afficher les spoilers sans clic.</td></tr>
<tr><th scope="row">reduireAnimations</th><td>Réduire les animations du site.</td></tr>
<tr><th scope="row">ordre</th><td>Ordre d’affichage choisi (sortie ou histoire).</td></tr>
<tr><th scope="row">disposition, cielEnPause, seriesVisibles</th><td>Préférences d’affichage des vues graphiques.</td></tr>
<tr><th scope="row">vus, aVoir, filtreVu</th><td>Œuvres que vous avez marquées vues ou à voir (« Vus et à voir »), et ce que la frise affiche.</td></tr>

</tbody></table>
<p>Vos marques « Vus et à voir » peuvent être sauvegardées dans un fichier ou dans un lien (« Sauvegarder ou transférer mes marques ») : le fichier est créé par votre navigateur et reste chez vous ; le lien porte les marques après le signe #, partie de l’adresse que le navigateur n’envoie jamais au serveur.</p>
<h2>Copie du site pour la consultation hors connexion</h2>
<p>Pour que le site reste consultable sans connexion, votre navigateur garde une copie de ses pages, styles, scripts et données (stockage <code>Cache Storage</code>, via un « service worker »). Cette copie ne contient que le contenu public du site, jamais d’information vous concernant, et pas les affiches TMDB. Elle est remplacée à chaque mise à jour du site.</p>
<p>Durée : jusqu’à ce que vous les effaciez. <button type="button" class="button" data-clear-prefs>Effacer mes réglages et la copie hors connexion</button> <span data-clear-status role="status"></span></p>
<h2>Journaux de l’hébergeur</h2>
<p>Comme tout hébergeur, {host} peut enregistrer l’adresse IP des visiteurs dans ses journaux techniques, à des fins de sécurité. GitHub, société américaine, est certifiée au titre du Data Privacy Framework UE–États-Unis. {local}</p>
<h2>Vos droits</h2>
<p>Ce site ne détient aucune donnée personnelle vous concernant. Pour toute question : {contact}. Vous pouvez aussi saisir la <a href="https://www.cnil.fr/fr/plaintes">CNIL</a>.</p>'''.format(
        date=esc(date_fr(status.get('checked_at'), 'day')), key=PREFS_KEY, host=esc(host.get('name', 'l’hébergeur')),
        local='' if published else 'Tant que le site reste en local, aucune donnée n’est transmise à un hébergeur.',
        contact=contact))

    # -- Accessibilité -------------------------------------------------------------------
    P('accessibilite', 'Accessibilité', '''<h1>Déclaration d’accessibilité</h1>
<p>{who} s’engage à rendre ce site accessible, conformément aux règles des WCAG 2.2 (niveau AA) et du RGAA 4.1.2. Cette déclaration est volontaire : ce site personnel n’est pas soumis à l’obligation légale.</p>
<h2>État de conformité</h2>
<p><strong>Non conforme</strong> : aucun audit n’a encore été réalisé. Un auto-audit RGAA complet est prévu sur la version finale.</p>
<h2>Contenus non accessibles connus</h2>
<ul>
<li>Les frises graphiques (vues enrichies) peuvent être difficiles à utiliser avec certaines technologies d’assistance. La liste des œuvres, sur la page d’accueil, en est l’équivalent complet et accessible.</li>
<li>Les affiches de films n’ont pas d’alternative détaillée : leur titre est toujours donné en texte.</li>
</ul>
<h2>Mesures prises</h2>
<ul>
<li>Navigation complète au clavier, focus visible, liens d’évitement.</li>
<li>Contrastes vérifiés automatiquement pour toutes les couleurs générées, y compris le fond teinté par les affiches.</li>
<li>Animations réductibles (réglage du site et préférence du système), ciel animé avec bouton de pause.</li>
<li>Spoilers masqués de façon réelle : le texte n’est pas présent dans la page avant d’être révélé.</li>
<li>Prise en charge du mode « contrastes élevés » de Windows.</li>
</ul>
<h2>Technologies utilisées</h2><p>HTML, CSS, JavaScript (amélioration progressive : le contenu reste lisible sans JavaScript).</p>
<h2>Retour d’information et contact</h2>
<p>Si vous n’arrivez pas à accéder à un contenu, {reach} pour obtenir une alternative.</p>
<h2>Voies de recours</h2>
<p>Si vous n’obtenez pas de réponse, vous pouvez contacter le <a href="https://formulaire.defenseurdesdroits.fr/">Défenseur des droits</a>.</p>
<p>Déclaration établie le {date}.</p>'''.format(
        who='L’éditeur de ce site' if anon else name,
        reach=('contactez {} ou utilisez le {}'.format(email, report) if email else 'utilisez le ' + report),
                                               date=esc(date_fr(status.get('checked_at'), 'day'))))

    # -- Sources, crédits et licences --------------------------------------------------
    rows = []
    for w in sorted(works, key=lambda w: (w.get('title_fr') or {}).get('v') or ''):
        fw = w.get('frwiki')
        if not fw:
            continue
        rows.append('<li>« <a href="{u}">{t}</a> », <a href="{p}">version du {d}</a></li>'.format(
            u=esc(fw['article_url']), t=esc(fw['title']), p=esc(fw['url']),
            d=esc(date_fr(fw['rev_timestamp'][:10], 'day'))))
    tm = ('<h2>TMDB</h2><p>Accroches, affiches et ordre des génériques proviennent de <a href="https://www.themoviedb.org/">The Movie Database (TMDB)</a>. '
          '« This product uses the TMDB API but is not endorsed or certified by TMDB. » Ces données sont rafraîchies chaque semaine et ne sont jamais conservées plus de six mois.</p>'
          if tmdb_used else
          '<h2>TMDB</h2><p>Les données de <a href="https://www.themoviedb.org/">TMDB</a> (accroches, affiches) ne sont pas encore activées sur cette version.</p>')
    P('sources', 'Sources, crédits et licences', '''<h1>Sources, crédits et licences</h1>
<p>Aucune information de ce site n’est rédigée à la main : chaque fait provient d’une source citée. La page <a href="methode.html">Méthode</a> détaille les règles.</p>
<h2>Wikipédia (textes)</h2>
<p>Les présentations et intrigues sont des extraits d’articles de Wikipédia en français, sous licence <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.fr">Creative Commons Attribution – Partage dans les mêmes conditions 4.0</a>. Modifications : références, notes, images et tableaux retirés ; seuls des extraits sont repris. Les auteurs sont listés dans l’historique de chaque article.</p>
<details><summary>Articles cités et versions ({n})</summary><ul>{rows}</ul></details>
<h2>Wikidata (données structurées)</h2>
<p>Dates, phases, réalisateurs, durées et distribution : <a href="https://www.wikidata.org/">Wikidata</a>, données placées dans le domaine public (CC0).</p>
{tm}
<h2>Ordre de l’histoire</h2>
<p><a href="{su}">{st}</a>, relevé du {sd}.</p>
<h2>Ce site</h2>
<p>Code source sous licence MIT. Textes originaux du site (interface, aide) sous licence CC BY-SA 4.0. Polices : Archivo et Newsreader (Éphémérides), Antonio, Inter et Instrument Serif (Fil noir), sous licence <a href="https://openfontlicense.org/">SIL Open Font License 1.1</a>, hébergées sur ce site (aucun appel à Google Fonts). Outil de test (non publié) : axe-core, licence MPL 2.0.</p>'''.format(
        n=len(rows), rows=''.join(rows), tm=tm, su=esc(story_ref.get('url')), st=esc(story_ref.get('title')),
        sd=esc(date_fr(story_ref.get('retrieved_at'), 'day'))))

    # -- Méthode -------------------------------------------------------------------------
    # œuvres que les sources rattachent au MCU mais que les règles de périmètre écartent (hors
    # exclusions de principe : documentaires, versions longues, courts métrages)
    shown = [x for x in status.get('excluded', []) if x.get('rule') == 'official_order' or x.get('kind')]
    excluded_html = ('<p>Écartées par ces règles :</p><ul>{}</ul>\n'.format(''.join(
        '<li>{} : {}</li>'.format(esc(x['label']), esc(x.get('short') or x['reason'])) for x in shown))
        if shown else '')
    levels = ''.join('<li><strong>{}</strong> : {}</li>'.format(esc(l['label_fr']), esc(l['rule_fr']))
                     for l in taxonomy['levels'])
    P('methode', 'Méthode', '''<h1>Méthode : d’où viennent les informations</h1>
<p>Le site se met à jour automatiquement à partir de sources publiques, selon des règles fixes. Aucun texte n’est généré ni rédigé à la main.</p>
<h2>Quelles œuvres ?</h2>
<p>{rule}</p>
<p>Une œuvre n’est publiée que si au moins deux sources indépendantes la rattachent au MCU : Wikidata (univers de fiction ou phase), les tableaux des articles « Phase » de Wikipédia, la société de production indiquée par Wikidata, ou TMDB. Sinon, elle reste en attente de vérification.</p>
{excluded}<h2>Priorités entre sources</h2>
<table><caption>Source utilisée pour chaque information</caption>
<thead><tr><th scope="col">Information</th><th scope="col">Source principale</th><th scope="col">Repli</th></tr></thead><tbody>
<tr><th scope="row">Titre français</th><td>TMDB (titre d’exploitation)</td><td>Titre de l’article Wikipédia, puis Wikidata</td></tr>
<tr><th scope="row">Dates de sortie</th><td>TMDB (France, États-Unis)</td><td>Wikidata, puis tableaux Wikipédia</td></tr>
<tr><th scope="row">Phase</th><td>Wikidata</td><td>Tableau de l’article « Phase » de Wikipédia</td></tr>
<tr><th scope="row">Accroche</th><td>TMDB</td><td>Introduction de l’article Wikipédia</td></tr>
<tr><th scope="row">Intrigue</th><td>Section « Synopsis » de Wikipédia (masquée)</td><td>—</td></tr>
<tr><th scope="row">Distribution</th><td>Wikidata (rôles)</td><td>—</td></tr>
<tr><th scope="row">Ordre de l’histoire</th><td>Liste de référence citée</td><td>Placement provisoire signalé</td></tr>
</tbody></table>
<p>En cas de désaccord entre sources, l’écart est signalé et la valeur déjà publiée est conservée jusqu’à vérification.</p>
<h2>Niveaux d’apparition</h2>
<ul>{levels}</ul>
<p>Sans source pour trancher, le niveau est indiqué « non renseigné ».</p>
<h2>Protection contre les erreurs</h2>
<ul>
<li>Seules les versions d’articles Wikipédia publiées depuis au moins 72 heures, et non annulées, sont reprises.</li>
<li>Avant chaque publication, un contrôle automatique vérifie la cohérence des données, les sources, les contrastes de couleurs et les écarts avec la version précédente ; en cas de problème, la version précédente reste en ligne.</li>
<li>Une œuvre absente de la liste de référence de l’ordre de l’histoire y est placée provisoirement après toutes les œuvres sorties avant elle, avec la mention « Place dans l’histoire à confirmer ».</li>
<li>Le statut « sorti » ou « à venir » est calculé dans votre navigateur à partir de la date du jour (heure de Paris).</li>
</ul>'''.format(rule=esc(scope.get('rule_fr')), levels=levels, excluded=excluded_html))

    # -- À propos --------------------------------------------------------------------------
    P('a-propos', 'À propos', '''<h1>À propos</h1>
<p>{site} donne une forme visuelle à l’univers cinématographique Marvel : les films et séries y sont reliés par un fil noir, sur une frise que l’on peut parcourir par phase, dans l’ordre de l’histoire ou par personnage.</p>
<p>Site de fan non officiel et non commercial. Il n’est ni affilié, ni approuvé par Marvel Studios, Marvel Entertainment ou The Walt Disney Company.</p>
<h2>Œuvres retenues</h2><p>{rule}</p>
<h2>Spoilers</h2><p>L’intrigue complète d’une œuvre reste toujours masquée : elle ne s’affiche que si vous la demandez, que l’œuvre soit vue ou non. Les caméos sont masqués par défaut ; ils s’affichent d’office pour les œuvres que vous avez vues (« Vus et à voir », « J’ai vu jusqu’à… ») ou avec « Tout afficher ».</p>'''.format(
        site=esc(cfg['site_name']), rule=esc(scope.get('rule_fr'))))

    # -- Mises à jour ----------------------------------------------------------------------
    counts = status.get('counts') or {}
    prov = status.get('provisional_story') or []
    by_id = {w['id']: w for w in works}
    prov_list = ''.join('<li>{}</li>'.format(esc((by_id.get(q, {}).get('title_fr') or {}).get('v', q))) for q in prov)
    quar = ''.join('<li>{} ({})</li>'.format(esc(q.get('label')), esc(q.get('reason'))) for q in status.get('quarantine', []))
    entries = ''.join('<li><time datetime="{d}">{df}</time> : {t}</li>'.format(
        d=esc(e['date']), df=esc(date_fr(e['date'], 'day')), t=esc(e['text'])) for e in changelog.get('entries', [])[:50])
    P('mises-a-jour', 'Mises à jour', '''<h1>Mises à jour des données</h1>
<p>Dernière vérification : {date}. {n} œuvres ({f} films, {s} séries).</p>
<h2>Placements provisoires dans l’ordre de l’histoire ({np})</h2><ul>{prov}</ul>
<h2>En attente de vérification ({nq})</h2><ul>{quar}</ul>
<h2>Journal</h2><ul>{entries}</ul>'''.format(
        date=esc(date_fr(status.get('checked_at'), 'day')), n=counts.get('works', 0), f=counts.get('film', 0),
        s=counts.get('series', 0), np=len(prov), prov=prov_list or '<li>Aucun</li>',
        nq=len(status.get('quarantine', [])), quar=quar or '<li>Aucune</li>',
        entries=entries or '<li>Premier relevé.</li>'))
