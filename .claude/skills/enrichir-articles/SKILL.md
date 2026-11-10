---
name: enrichir-articles
description: >
  Transforme les brèves FightNews (titre + court extrait récupérés par le robot RSS) en vrais articles en français :
  lit la page de l'article chez son média, croise avec d'autres sources, rédige une synthèse avec ses propres mots
  qui cite et met en avant le média d'origine, puis l'enregistre dans la colonne `body` de Supabase.
  À utiliser quand on demande d'« enrichir », « étoffer », « rédiger » ou « donner plus de matière » aux articles
  FightNews, pour un article précis (slug ou adresse) ou pour les N dernières brèves.
argument-hint: "[nombre d'articles, slug ou adresse source — par défaut les 5 dernières brèves]"
---

# Enrichir les articles FightNews

Le robot RSS (`pipeline/run.ts`, sans IA) n'enregistre qu'un titre, un extrait d'environ 200 caractères, la photo
et le lien du média. Ce skill écrit le corps de l'article (`articles.body`). La page `/article/[slug]` l'affiche
avec `components/ArticleBody.tsx`, précédé de « D'après <média> » et suivi du bouton « Lire l'article original ».

Il tourne dans une session Claude Code (à la demande, ou en routine planifiée) : jamais dans le robot GitHub,
qui n'a pas de crédit IA.

## Règles non négociables

1. **Pas de plagiat.** On écrit avec ses propres mots. Aucune phrase du média reprise telle quelle, même retouchée
   à la marge. Seule exception : une ou deux citations courtes (deux lignes maximum) d'une personne interviewée,
   entre guillemets « », attribuées (« a-t-il confié à La Sueur »).
2. **Mettre le média en avant.** Le média d'origine est nommé et lié dès le premier paragraphe
   (« comme le rapporte [La Sueur](https://…) »), et tous les médias utilisés sont listés à la fin. Le but est
   aussi de leur envoyer des lecteurs.
3. **Rien d'inventé.** Chaque fait, chiffre, date, palmarès ou citation vient d'une source lue pendant la session.
   Dans le doute, on l'enlève. Pas de pronostic présenté comme un fait.
4. **Respect des sites.** On ne lit que la page de l'article déjà cité, et seulement si son robots.txt le permet
   (le script le vérifie). Pas de contournement de paywall ni de blocage.
5. **Base de données.** Projet Supabase `jmkrmnpeapeemrbobypu`. On ne touche qu'à la colonne `body` de la table
   `articles`. Jamais aux tables `leads`, `lead_events`, `admins` (autre application) ni à `subscribers`.
   On n'écrase jamais un `body` déjà rempli, sauf si on le demande explicitement pour cet article.

## Étapes

### 1. Choisir les articles

Si l'argument est un slug ou une adresse, on prend cet article. Sinon, les N dernières brèves sans corps (5 par défaut),
avec l'outil Supabase `execute_sql` :

```sql
select id, slug, title, summary, sport, source_name, source_url, image_url, published_at
from articles
where status = 'published' and coalesce(body, '') = ''
  and sport <> 'lifestyle'
  and source_url not like 'https://www.youtube.com/%'
order by published_at desc
limit 5;
```

On saute les vidéos YouTube et la rubrique Lifestyle (produits de boutiques), sauf demande explicite.

### 2. Lire l'article d'origine

```bash
npm run enrich:source -- "<source_url>"
```

Le script (`pipeline/enrich-source.ts`) vérifie le robots.txt, puis affiche un JSON : `title`, `description`,
`published`, `paragraphs` (« ## » = intertitre, « > » = citation). Il garde parfois du bruit de la page
(vignettes « à lire aussi », fiche combattant, appel aux commentaires) : on l'ignore.
S'il renvoie `error` (robots.txt, 403, paywall), on continue avec l'extrait RSS et les autres sources.

### 3. Trouver plus de matière

Une brève fait souvent 150 mots : pour un vrai article il faut croiser.

- **Recherche web** (1 à 3 recherches) sur le fait principal : autres médias français, source officielle
  (UFC, PFL, ARES, fédérations, organisateur), fiche du combattant (palmarès, catégorie, prochain combat).
  Lire au moins une autre source quand elle existe, et noter son nom et son adresse.
- **Notre base** : autres articles FightNews sur les mêmes combattants ou le même événement, pour le contexte
  et des liens internes (`/article/<slug>`).

```sql
select slug, title, published_at from articles
where status = 'published' and title ilike '%Gane%' order by published_at desc limit 5;
```

S'il n'y a vraiment rien de plus que l'extrait (fait trop mince, aucune autre source), on n'écrit pas
un article creux : on saute cet article et on le signale dans le compte rendu.

### 4. Rédiger

- Français, ton de rédaction sportive, phrases nettes. 300 à 700 mots selon la matière disponible (jamais de remplissage pour atteindre un nombre de mots).
- Structure :
  1. **Chapô** (2-3 phrases) : le fait, qui, quoi, quand, et la source liée.
  2. Deux ou trois parties avec intertitres « ## » courts et concrets : le contexte (parcours, palmarès,
     historique entre les combattants, enjeu du titre), les déclarations, ce qui vient ensuite (date, lieu,
     carte de l'événement).
  3. Un paragraphe « Pour aller plus loin sur FightNews : » avec 2-3 liens internes `[titre](/article/<slug>)`
     quand notre base en a (étape 3).
  4. Dernier paragraphe : `Sources : [La Sueur](https://…), [UFC](https://…).`
- Pas de titre en tête (la page affiche déjà le titre), pas de photo, pas d'emoji, pas de gras.
- À éviter, ça sonne « écrit par une IA » : « Dans le monde impitoyable de… », « Il est important de noter »,
  « Restez connectés », questions rhétoriques en série, conclusions morales, superlatifs empilés,
  listes à puces partout.

Format exact de la colonne `body` (texte simple, rien d'autre n'est interprété) :

```
Paragraphe de chapô avec un lien [La Sueur](https://lasueur.com/...).

## Intertitre

Paragraphe…

> « Citation courte », a déclaré X à La Sueur.

Sources : [La Sueur](https://lasueur.com/...), [UFC](https://www.ufc.com/...).
```

Relire avant d'enregistrer : chaque phrase a-t-elle une source ? Aucune phrase n'est-elle trop proche du texte
d'origine ? Le média est-il lié en tête et en fin ?

### 5. Enregistrer

Avec `execute_sql`, en entourant le texte de `$fn$` (pas besoin d'échapper les apostrophes) et en gardant la
condition sur `body` vide pour ne rien écraser :

```sql
update articles set body = $fn$<texte>$fn$
where slug = '<slug>' and coalesce(body, '') = ''
returning slug, length(body);
```

Pour annuler : `update articles set body = '' where slug = '<slug>';` (la page redevient la brève).
Le site met la page à jour en 5 minutes au plus (`revalidate = 300`).

Sans l'outil Supabase dans la session, ne pas chercher de clé : écrire les requêtes dans un fichier et les donner
à Jacques pour l'éditeur SQL de Supabase.

### 6. Compte rendu

Une ligne par article : titre, nombre de mots, sources utilisées, et les articles sautés avec la raison
(robots.txt, matière trop mince, vidéo…).
