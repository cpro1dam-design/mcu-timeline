# Mettre le site en ligne (GitHub Pages)

Le site est publié par GitHub Pages, gratuitement, depuis un dépôt **public**. À chaque envoi sur la
branche `main`, et chaque lundi, la tâche [.github/workflows/site.yml](../.github/workflows/site.yml)
récupère les données, lance les contrôles et les tests, puis publie le site. Si un contrôle échoue,
rien n'est publié : la version précédente reste en ligne et un ticket est ouvert dans l'onglet Issues.

Les étapes marquées **(toi)** demandent ton compte : Claude ne crée pas de compte et ne saisit
aucun mot de passe ni aucune clé.

## 1. Avant le premier envoi

1. **(toi)** Créer un compte sur [github.com](https://github.com/) si ce n'est pas déjà fait.
2. **(toi)** Créer le dépôt : bouton **+** → **New repository** → le nom `mcu-timeline`,
   **Public**, et ne rien cocher d'autre (ni README, ni .gitignore, ni licence : le projet les a déjà).
3. **(toi)** Donner à Claude :
   - ton nom d'utilisateur GitHub et le nom du dépôt : l'adresse du site sera
     `https://cpro1dam-design.github.io/mcu-timeline/` ; elle va dans `site.config.json` (`base_url`, `repo_url`),
     indispensable pour la page 404 ;
   - la formule des **mentions légales** (obligatoires dès que le site est public). Choix du
     20 octobre 2026 : **anonyme** (éditeur non professionnel, LCEN art. 1-1 II) ; seules les coordonnées
     de GitHub sont publiées et le contact passe par le formulaire de signalement du dépôt. Pour
     s'identifier, la loi demande nom, adresse postale et téléphone (`editor` dans `site.config.json`) ;
   - l'adresse qui signe les commits (publique dans l'historique) : de préférence l'adresse anonyme
     de GitHub, visible dans **Settings → Emails** (`…@users.noreply.github.com`).
4. Claude complète `site.config.json`, régénère les pages légales, vérifie, puis crée le commit et
   l'étiquette `v1.0`.

## 2. Régler le dépôt sur GitHub (toi)

1. **Settings → Pages → Build and deployment → Source** : choisir **GitHub Actions**.
2. **Settings → Secrets and variables → Actions** :
   - onglet **Secrets** → **New repository secret** : nom `TMDB_TOKEN`, valeur : le jeton « API Read
     Access Token » de TMDB, c'est-à-dire la longue ligne qui commence par `eyJ` dans `tools/tmdb_key.txt`
     (si les lignes de commentaire `#` sont copiées avec, le script les ignore) ;
   - onglet **Variables** → **New repository variable** : nom `FRISE_CONTACT`, valeur : l'adresse du
     dépôt (`https://github.com/cpro1dam-design/mcu-timeline`). Wikimedia demande un moyen de contact dans les
     requêtes automatiques.

## 3. Envoyer le projet (toi, dans un terminal ouvert dans le dossier `mcu_website`)

L'adresse du dépôt est déjà enregistrée dans le projet (`git remote add origin …`, fait par Claude).

```bash
git push -u origin main
git push origin v1.0
```

Au premier envoi, une fenêtre de connexion GitHub s'ouvre : c'est toi qui te connectes.

## 4. Vérifier

1. Onglet **Actions** : la tâche « Données et publication » tourne (quelques minutes). Coche verte :
   le site est en ligne à `https://cpro1dam-design.github.io/mcu-timeline/`.
2. Ouvrir l'accueil, les deux frises, une fiche, et les **mentions légales** (plus de « [à compléter] »).
3. Si la tâche échoue : un ticket « Mise à jour des données bloquée » s'ouvre avec le lien vers le
   journal ; rien n'est publié tant que ce n'est pas corrigé.

## Ensuite : une nouvelle version

Chaque modification décidée devient une version : V1.1, V1.2… Claude met à jour
[CHANGELOG.md](../CHANGELOG.md), crée le commit et l'étiquette (`v1.1`…), puis tu envoies :

```bash
git push
git push origin v1.1
```

Le site se met à jour tout seul après chaque envoi. Les données TMDB (accroches, affiches) ne sont
jamais dans le dépôt : la tâche les récupère à chaque publication (conditions de TMDB : 6 mois de
conservation au plus).
