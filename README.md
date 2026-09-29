# FightNews

Actualité des sports de combat à partir de flux RSS francophones, mise à jour toutes les 30 minutes.
Le robot importe le titre, un extrait de 280 caractères maximum environ, la photo fournie dans le flux
et le lien vers le média. Aucun texte n'est généré ou traduit, aucune API d'IA n'est appelée.
Il n'y a aucune clé OpenAI/Anthropic à configurer ni crédit IA à acheter.

Les pages publiques et le récap ne listent que les médias francophones sélectionnés.
Les anciens articles des autres sources restent en base et accessibles par leur URL directe.
Les sources officielles portent le badge « Officiel ». La longueur de l'extrait dépend du flux :
l'article complet reste chez son média. Le site conserve Supabase pour les données et Vercel pour l'hébergement.
La newsletter est une fonction distincte, facultative, qui utilise toujours Resend.

```
Flux RSS français → GitHub Actions (xx:07 et xx:37 UTC)
                    → titres, courts extraits, photos et sources → Supabase
                                                              → FightNews (cache 5 min)
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
  run.ts                     Le robot : RSS français → courts extraits → base de données
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
2. **Clés.** Copie `.env.example` en `.env.local` et remplis-le
   (Supabase : *Project settings > API Keys*).
3. **Premier test.**
   ```bash
   npm run pipeline:dry   # affiche les infos trouvées, n'écrit rien
   npm run pipeline       # importe les titres et extraits en brouillon
   ```
4. **Valider.** Dans Supabase, *Table editor > articles* : passe `status` à `published`
   pour les brèves que tu acceptes. Elles apparaissent sur le site.
   En local, mets `PIPELINE_DEFAULT_STATUS=published` dans `.env.local` pour publier automatiquement.
   Sur GitHub, le robot publie les nouvelles infos par défaut ; voir la configuration ci-dessous.

## 3. Mettre en ligne et automatiser

1. Dans le dépôt GitHub : *Settings > Secrets and variables > Actions*, onglet *Secrets*, ajoute
   `NEXT_PUBLIC_SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`. Aucun secret IA n’est utilisé.
   Puis, dans l'onglet *Variables* du même écran, crée `PIPELINE_ENABLED` avec la valeur `true`.
   Le robot tourne alors toutes les 30 minutes, à **xx:07 et xx:37 UTC**
   (onglet *Actions*, bouton *Run workflow* pour le lancer à la main).
   **Les nouvelles infos sont publiées automatiquement.** Pour repasser en validation manuelle,
   crée la variable Actions `PIPELINE_DEFAULT_STATUS` = `draft` ; mets-la à `published` pour réactiver
   la publication automatique. Modifier `.env.local` ne change pas le robot GitHub.
   Les articles déjà en brouillon restent en brouillon : leur statut se change dans Supabase.
   Les imports sont exécutés un par un pour éviter les doublons entre un lancement manuel et un lancement planifié.
   S'il manque un secret, le passage s'arrête en rouge et son journal donne le nom du secret à ajouter.
   Une panne d’un flux est signalée dans les journaux ; les autres flux continuent d’être traités.
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

## Les sources

La sélection est dans `pipeline/sources.json`. Chaque source porte `"language": "fr"`.

| Rubrique | Sources |
|---|---|
| MMA | ActuMMA (actualités), FMMAF, Hexagone MMA, La Sueur, RMC Sport, L'Équipe |
| Boxe | FFBoxe, L'Équipe |
| Kickboxing et muay thaï | FFKMDA, actualités correspondantes des médias multisports |
| Judo | L'Esprit du Judo, L'Équipe, franceinfo |
| Grappling et JJB | Boost Your BJJ |
| Lutte | FFLDA |

La rubrique est celle du flux ; un nom de discipline explicite dans le titre peut la préciser.
La Sueur est filtrée par mots-clés de sports de combat pour éviter les sujets de basket ou de football.
Ce classement déterministe peut manquer un sujet ambigu : il ne remplace pas un éditeur.
La rubrique Lifestyle n'a pas de source dédiée ; elle reste disponible pour des contenus ajoutés manuellement.
Une source sélectionnée peut être inactive ou momentanément en panne : le contrôle des sources le signale.

Pour ajouter un média francophone :

```json
{ "name": "Média français", "url": "https://exemple.com/feed/", "sport": "mma", "language": "fr" }
```

Le nom est aussi utilisé pour sélectionner les articles sur le site : conserver le même nom lors d'un changement d'URL.
N'ajouter `"official": true` que pour une fédération ou une organisation.
Les flux anglophones ne sont plus importés : aucune traduction automatique n'est faite.

**Vérification** : `npm run sources:check`, ou tâche GitHub « Vérifier les sources ».
Elle contrôle le flux, robots.txt, les dates et les photos, puis indique les sources inactives ou en erreur.
Elle s'exécute également chaque lundi et lorsque la configuration des sources change.
Une erreur temporaire d'un média n'empêche pas le robot d'importer les autres sources.

## Coût et contenu

- Traitement RSS : aucun coût d'IA. Au plus 25 nouvelles entrées par passage.
- Hébergement, base, GitHub Actions et newsletter : quotas et éventuels frais des services existants.
- Titre et court extrait repris du flux, affichés comme un extrait avec attribution ; aucune copie intégrale.
- Photo fournie par le média, affichée depuis son serveur, avec crédit et visuel de remplacement si elle échoue.
- Déduplication par URL et titre normalisé ; les liens écartés ne sont pas retraités à chaque passage.
- Publication automatique sur GitHub ; `PIPELINE_DEFAULT_STATUS=draft` permet la validation manuelle.
- Respecter les conditions d'utilisation des sources ajoutées.

## Pistes pour la suite

- Une page d'administration pour valider les brouillons en un clic.
- Un calendrier des événements et des fiches combattants.
- La recherche et un plan du site pour Google (sitemap).
- Le regroupement des articles qui parlent du même événement.
