# FightNews : squelette du site

Site d'actualité de tous les sports de combat, mis à jour automatiquement :
les flux RSS sont lus toutes les 30 minutes, une IA rédige une brève originale en français
pour chaque nouvelle info, la range dans la bonne section et cite le média d'origine.

```
Flux RSS ──► pipeline (GitHub Actions, toutes les 30 min)
               │  1. lit les flux        (pipeline/sources.json)
               │  2. ignore les liens déjà vus
               │  3. IA : résumé original + section + tags
               ▼
           Supabase (table "articles", en brouillon par défaut)
               │
               ▼
           Site Next.js sur Vercel (se rafraîchit toutes les 5 min)
```

## Contenu

```
app/
  page.tsx                  Accueil : article à la une + un bloc par sport
  [sport]/page.tsx          Une page par section (/mma, /boxe, /judo…)
  article/[slug]/page.tsx   Page article, avec le lien vers la source
  globals.css               Tout le design (thème sombre)
components/                 En-tête, carte d'article
lib/
  sports.ts                 Liste des sections : ajoute ou renomme un sport ici
  data.ts                   Lecture des articles (Supabase, ou démo si rien n'est configuré)
  demo.ts                   Articles fictifs pour voir le design sans rien brancher
pipeline/
  run.ts                    Le robot : RSS → IA → base de données
  sources.json              Les flux suivis : ajoute une ligne pour une nouvelle source
supabase/schema.sql         La table à créer dans Supabase
.github/workflows/pipeline.yml   La tâche planifiée
.env.example                Les clés à renseigner
```

## 1. Voir le site sur ton ordinateur (5 minutes, rien à configurer)

Il faut [Node.js 22](https://nodejs.org). Dans le dossier du projet :

```bash
npm install
npm run dev
```

Ouvre http://localhost:3000 : le site tourne avec des articles de démonstration.

## 2. Brancher les vraies données

1. **Base de données.** Crée un projet gratuit sur [supabase.com](https://supabase.com),
   ouvre *SQL Editor*, colle le contenu de `supabase/schema.sql` et lance-le.
2. **IA.** Crée une clé sur [console.anthropic.com](https://console.anthropic.com)
   et ajoute quelques euros de crédit.
3. **Clés.** Copie `.env.example` en `.env.local` et remplis-le
   (Supabase : *Project settings > API*).
4. **Premier test.**
   ```bash
   npm run pipeline:dry   # affiche les infos trouvées, n'écrit rien
   npm run pipeline       # rédige et enregistre les brouillons
   ```
5. **Valider.** Dans Supabase, *Table editor > articles* : passe `status` à `published`
   pour les brèves que tu acceptes. Elles apparaissent sur le site.
   Quand la qualité te convient, mets `PIPELINE_DEFAULT_STATUS=published` pour tout publier seul.

## 3. Mettre en ligne et automatiser

1. Crée un dépôt GitHub et envoie-y le projet.
2. Dans le dépôt : *Settings > Secrets and variables > Actions*, ajoute
   `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` et `ANTHROPIC_API_KEY`.
   Puis, dans l'onglet *Variables* du même écran, crée `PIPELINE_ENABLED` avec la valeur `true`.
   Le robot tourne alors toutes les 30 minutes (onglet *Actions*, bouton *Run workflow* pour le lancer à la main).
3. Sur [vercel.com](https://vercel.com), importe le dépôt et ajoute
   `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Le site est en ligne.

Bon à savoir : GitHub peut décaler les tâches planifiées de quelques minutes,
et les met en pause sur un dépôt public sans activité pendant 60 jours.

## Coût estimé

| Poste | Prix |
|---|---|
| Vercel, Supabase, GitHub Actions | 0 € au départ (offres gratuites) |
| IA (modèle léger, ~25 brèves max par passage) | quelques euros à ~20 € par mois selon le volume |
| Nom de domaine | ~10 € par an |

Estimation indicative : vérifie les tarifs du moment sur chaque service.

## Règles de contenu déjà intégrées

- L'IA a pour consigne de **reformuler**, de ne rien inventer, et de faire court si la source est maigre.
- Chaque article affiche **le média d'origine avec un lien** (pour Google Actualités, le vrai média est retrouvé automatiquement).
- **Aucune photo des sources n'est reprise** (droits d'auteur) : les cartes utilisent un dégradé aux couleurs du sport.
  Pour de vraies images : photos presse officielles des organisations, Wikimedia Commons, ou tes propres visuels.
- Publication en **brouillon par défaut**, pour relire avant de publier.
- Respecte les conditions d'utilisation de chaque source que tu ajoutes.

## Pistes pour la suite

- Une page d'administration pour valider les brouillons en un clic.
- Un calendrier des événements et des fiches combattants.
- La recherche, une newsletter, un plan du site pour Google (sitemap).
- Le regroupement des articles qui parlent du même événement.
