// Client Supabase côté serveur (fonctions Vercel).
// Accepte les noms de variables standards ET ceux créés par l'intégration Supabase de Vercel.
const { createClient } = require('@supabase/supabase-js');

let client = null;

function getDb() {
  const env = process.env;
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_STORAGE_ANIELSUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.STORAGE_SUPABASE_SERVICE_ROLE_KEY ||
    env.STORAGE_SUPABASE_SECRET_KEY;
  if (!url || !key) {
    const e = new Error('Variables Supabase manquantes (URL / clé service_role)');
    e.code = 'NO_DB';
    throw e;
  }
  if (!client) {
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

module.exports = { getDb };
