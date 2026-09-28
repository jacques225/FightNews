-- À coller dans Supabase > SQL Editor

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

create index if not exists articles_sport_date on articles (sport, published_at desc);
create index if not exists articles_status_date on articles (status, published_at desc);

-- Le site (clé publique) ne peut lire que les articles publiés.
alter table articles enable row level security;
create policy "lecture publique des articles publiés"
  on articles for select using (status = 'published');
-- Le pipeline utilise la clé service_role, qui contourne la RLS pour écrire.
