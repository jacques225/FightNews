-- À coller dans Supabase > SQL Editor (on peut le relancer sans risque après une mise à jour)

create table if not exists articles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  summary text not null,
  body text not null,
  sport text not null,
  tags text[] not null default '{}',
  image_url text,
  source_name text not null,
  source_url text unique not null,     -- empêche de traiter deux fois le même lien
  published_at timestamptz not null default now(),
  status text not null default 'draft' check (status in ('draft', 'published', 'rejected')),
  created_at timestamptz not null default now()
);

-- Ajouts après la première version (sans effet si la colonne existe déjà)
alter table articles add column if not exists source_official boolean not null default false; -- source officielle : badge sur le site

create index if not exists articles_sport_date on articles (sport, published_at desc);
create index if not exists articles_status_date on articles (status, published_at desc);

-- Le site (clé publique) ne peut lire que les articles publiés.
alter table articles enable row level security;
drop policy if exists "lecture publique des articles publiés" on articles; -- permet de relancer ce fichier
create policy "lecture publique des articles publiés"
  on articles for select using (status = 'published');
-- Le pipeline utilise la clé service_role, qui contourne la RLS pour écrire.

-- Newsletter --------------------------------------------------------------

create table if not exists subscribers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null check (email = lower(email)),
  sports text[] not null default '{}',              -- rubriques choisies ; vide = toutes
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'unsubscribed')),
  token uuid unique not null default gen_random_uuid(), -- secret des liens de confirmation et de désabonnement
  created_at timestamptz not null default now(),
  confirmation_sent_at timestamptz,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz
);

create table if not exists newsletter_editions (
  edition text primary key,                          -- date du récap, ex. 2026-10-02
  sent_at timestamptz not null default now(),
  recipients int not null default 0
);

-- Aucun accès public : seuls le site (côté serveur) et le robot, avec la clé secrète, y touchent.
alter table subscribers enable row level security;
alter table newsletter_editions enable row level security;
