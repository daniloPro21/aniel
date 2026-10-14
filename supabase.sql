-- À exécuter dans Supabase > SQL Editor > New query > coller > Run
-- (le script peut être relancé sans risque : il crée la table ou la met à jour)
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

-- v2 : invitations créées depuis /admin (sans e-mail), QR code stocké, contrôle à l'entrée
alter table public.guests alter column email drop not null;
alter table public.guests add column if not exists qr            text;         -- image PNG du QR code (data URL)
alter table public.guests add column if not exists source        text not null default 'rsvp'; -- 'rsvp' | 'admin'
alter table public.guests add column if not exists checked_in_at timestamptz;  -- date du scan à l'entrée
alter table public.guests drop constraint if exists guests_presence_check;
alter table public.guests add constraint guests_presence_check check (presence in ('oui','non','attente'));

-- Sécurité : RLS activé et AUCUNE policy => la clé publique (anon) ne peut ni lire ni écrire.
-- Seules les fonctions /api (avec la clé service_role, gardée côté serveur) accèdent aux données.
alter table public.guests enable row level security;
