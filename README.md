# FightNews

Site d'actualité de tous les sports de combat, mis à jour automatiquement :
les flux RSS sont lus toutes les 30 minutes, une IA rédige une brève originale en français
pour chaque nouvelle info, la range dans la bonne rubrique (dont une rubrique **Lifestyle**
pour les collections, l'équipement et la culture fight) et cite le média d'origine.
Les sources officielles (fédérations, organisations) sont signalées par un badge **Officiel**.
Rien n'est effacé : toutes les anciennes actus restent consultables, rubrique par rubrique, page après page.
Chaque vendredi, les abonnés reçoivent **le récap de la semaine** par e-mail.

```
Flux RSS ──► robot (GitHub Actions, toutes les 30 min)
               │  1. lit les flux        (pipeline/sources.json)
               │  2. ignore les liens déjà vus
               │  3. IA : résumé original + rubrique + tags, écarte les doublons
               ▼
           Supabase (table "articles", en brouillon par défaut)
               │                                   │
               ▼                                   ▼
           Site Next.js sur Vercel           Récap du vendredi (GitHub Actions + Resend)
           (se rafraîchit toutes les 5 min)  envoyé aux abonnés confirmés
```

## Contenu

```
app/
  page.tsx                   Accueil : la une, la newsletter, un bloc par sport, le bloc Lifestyle
  [sport]/page.tsx           Une page par rubrique (/mma, /boxe, /lifestyle…)
  [sport]/page/[n]/          Ses archives, page après page (/mma/page/2…)
  actus/                     Toute l'actu, toutes rubriques confondues, avec ses archives
  article/[slug]/page.tsx    Page article, avec la source et les actus précédentes de la rubrique
  newsletter/                Page d'inscription et page de désabonnement
  api/newsletter/            Inscription, confirmation et désabonnement
  confidentialite/page.tsx   Mentions légales et confidentialité (à compléter)
  globals.css                Tout le design (thème sombre)
components/                  En-tête, carte d'article, formulaire newsletter
lib/
  sports.ts                  Liste des rubriques : ajoute ou renomme une rubrique ici
  data.ts                    Lecture des articles (Supabase, ou démo si rien n'est configuré)
  demo.ts                    Articles fictifs pour voir le design sans rien brancher
  email.ts                   Envoi des e-mails et modèles (confirmation, récap)
pipeline/
  run.ts                     Le robot : RSS → IA → base de données
  sources.json               Les flux suivis (voir « Les sources » plus bas)
  check-sources.ts           Vérifie que chaque flux répond
  newsletter.ts              Le récap hebdo
supabase/schema.sql          Les tables à créer dans Supabase
.github/workflows/           Les tâches planifiées (robot, récap) et les vérifications
.env.example                 Les clés à renseigner
```

## 1. Voir le site sur ton ordinateur (5 minutes, rien à configurer)

Il faut [Node.js 22.12 ou plus récent](https://nodejs.org). Dans le dossier du projet :

```bash
npm install
npm run dev
```

Ouvre http://localhost:3000 : le site tourne avec des articles de démonstration.
Le formulaire de newsletter marche aussi en démo : l'e-mail de confirmation s'affiche dans le terminal.

Pour voir le récap tel qu'il partira :

```bash
npm run newsletter:preview   # écrit newsletter-apercu.html, à ouvrir dans ton navigateur
```

## 2. Brancher les vraies données

1. **Base de données.** Crée un projet gratuit sur [supabase.com](https://supabase.com),
   ouvre *SQL Editor*, colle le contenu de `supabase/schema.sql` et lance-le.
   Ce fichier peut être relancé sans risque après chaque mise à jour du projet.
2. **IA.** Crée une clé sur [console.anthropic.com](https://console.anthropic.com)
   et ajoute quelques euros de crédit.
3. **Clés.** Copie `.env.example` en `.env.local` et remplis-le
   (Supabase : *Project settings > API Keys*).
4. **Premier test.**
   ```bash
   npm run pipeline:dry   # affiche les infos trouvées, n'écrit rien
   npm run pipeline       # rédige et enregistre les brouillons
   ```
5. **Valider.** Dans Supabase, *Table editor > articles* : passe `status` à `published`
   pour les brèves que tu acceptes. Elles apparaissent sur le site.
   Quand la qualité te convient, mets `PIPELINE_DEFAULT_STATUS=published` pour tout publier seul.

## 3. Mettre en ligne et automatiser

1. Dans le dépôt GitHub : *Settings > Secrets and variables > Actions*, onglet *Secrets*, ajoute
   `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` et `ANTHROPIC_API_KEY`.
   Puis, dans l'onglet *Variables* du même écran, crée `PIPELINE_ENABLED` avec la valeur `true`.
   Le robot tourne alors toutes les 30 minutes (onglet *Actions*, bouton *Run workflow* pour le lancer à la main).
2. Sur [vercel.com](https://vercel.com), importe le dépôt et ajoute les variables
   `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Le site est en ligne.

Bon à savoir : GitHub peut décaler les tâches planifiées de quelques minutes,
et les met en pause sur un dépôt public sans activité pendant 60 jours.

## 4. Ouvrir la newsletter

Il faut un nom de domaine (par exemple `fightnews.fr`) : les messageries refusent les newsletters
envoyées depuis une adresse Gmail ou Outlook.

1. Crée un compte sur [resend.com](https://resend.com), ajoute ton domaine et copie
   les enregistrements DNS qu'il indique chez ton registraire. Crée ensuite une clé d'API.
2. **Sur Vercel**, ajoute :
   `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
   `NEWSLETTER_FROM` (par exemple `FightNews <newsletter@fightnews.fr>`) et `SITE_URL` (par exemple `https://fightnews.fr`).
   La clé secrète Supabase ne sert qu'au serveur : ne la mets jamais dans une variable qui commence par `NEXT_PUBLIC_`.
3. **Sur GitHub**, ajoute le secret `RESEND_API_KEY`, puis les variables `NEWSLETTER_FROM`, `SITE_URL`
   et `NEWSLETTER_ENABLED` = `true`. Le récap part chaque vendredi matin.
4. **Avant d'ouvrir**, complète la page `app/confidentialite/page.tsx` (tout ce qui est entre crochets) :
   ton identité et un contact sont obligatoires dès que tu collectes des e-mails.

Comment ça marche :
- **Double confirmation** : l'inscription n'est active qu'après un clic dans l'e-mail reçu.
  Personne ne peut inscrire l'adresse de quelqu'un d'autre.
- **Rubriques au choix** : sur la page `/newsletter`, l'abonné coche les sports qui l'intéressent.
- **Désabonnement en un clic** : un lien dans chaque e-mail, et le bouton « Se désabonner » de Gmail ou Apple Mail.
- **Ménage automatique** : les inscriptions jamais confirmées et les désabonnements sont effacés au bout de 30 jours.
- Les abonnés sont dans la table `subscribers` de Supabase ; les récaps envoyés dans `newsletter_editions`.

## Coût estimé

| Poste | Prix |
|---|---|
| Vercel, Supabase, GitHub Actions | 0 € au départ (offres gratuites) |
| IA (modèle léger, 25 infos max par passage) | environ 10 à 30 € par mois selon le nombre de sources |
| Resend (e-mails) | gratuit pour démarrer (quelques milliers d'e-mails par mois), payant au-delà |
| Nom de domaine | ~10 € par an |

Estimation indicative : vérifie les tarifs du moment sur chaque service.

## Règles de contenu déjà intégrées

- L'IA a pour consigne de **reformuler**, de ne rien inventer, et de faire court si la source est maigre.
- En **Lifestyle**, elle reste informative, sans ton publicitaire, et ne donne un prix ou une date de sortie
  que s'ils figurent dans la source.
- Chaque article affiche **le média d'origine avec un lien** (pour Google Actualités, le vrai média est retrouvé automatiquement).
- **Aucune photo des sources n'est reprise** (droits d'auteur) : les cartes utilisent un dégradé aux couleurs de la rubrique.
  Pour de vraies images : photos presse officielles des organisations et des marques (souvent fournies dans leurs kits presse),
  Wikimedia Commons, ou tes propres visuels. Le champ `image_url` d'un article sert à en ajouter une.
- Publication en **brouillon par défaut**, pour relire avant de publier.
- Respecte les conditions d'utilisation de chaque source que tu ajoutes.

## Pistes pour la suite

- Une page d'administration pour valider les brouillons en un clic.
- Un calendrier des événements et des fiches combattants.
- La recherche et un plan du site pour Google (sitemap).
- Le regroupement des articles qui parlent du même événement.
