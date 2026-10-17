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

-- v3 : placement à table (40 tables de 8 places par défaut) + invitations sans e-mail
alter table public.guests add column if not exists table_num int;  -- numéro de table (null = pas encore placé)
alter table public.guests add column if not exists shared_at timestamptz;  -- date d'envoi de l'invitation (WhatsApp)
create index if not exists guests_table_num_idx on public.guests (table_num);

-- v4 : noms des tables (lieux de la Bible par défaut, modifiables depuis /admin)
create table if not exists public.wedding_tables (
  num        int primary key,
  name       text not null,
  updated_at timestamptz not null default now()
);
alter table public.wedding_tables enable row level security;

-- Sécurité : RLS activé et AUCUNE policy => la clé publique (anon) ne peut ni lire ni écrire.
-- Seules les fonctions /api (avec la clé service_role, gardée côté serveur) accèdent aux données.
alter table public.guests enable row level security;
