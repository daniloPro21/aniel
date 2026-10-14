-- À exécuter une seule fois : Supabase > SQL Editor > New query > coller > Run
create table if not exists public.guests (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  email        text not null unique,
  prenom       text not null,
  nom          text not null,
  telephone    text default '',
  presence     text not null check (presence in ('oui','non')),
  personnes    int  not null default 1,
  restrictions text default '',
  message      text default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Sécurité : RLS activé et AUCUNE policy => la clé publique (anon) ne peut ni lire ni écrire.
-- Seules les fonctions /api (avec la clé service_role, gardée côté serveur) accèdent aux données.
alter table public.guests enable row level security;
