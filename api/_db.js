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



// ---------------------------------------------------------------------------
// Code d'invitation + QR code (généré côté serveur et stocké dans la colonne `qr`)
const crypto = require('crypto');
const QRCode = require('qrcode');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O/1/I
const newCode = () =>
  'AD-' + Array.from(crypto.randomBytes(6), (b) => ALPHABET[b % ALPHABET.length]).join('');

// Adresse du site encodée dans le QR : SITE_URL si défini, sinon l'adresse de la requête.
function siteUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

const qrDataUrl = (req, code) =>
  QRCode.toDataURL(`${siteUrl(req)}/?code=${encodeURIComponent(code)}`, {
    width: 600, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#0a3024', light: '#ffffff' },
  });

// Complète la ligne avec son QR code s'il n'a pas encore été enregistré (anciennes réponses).
async function ensureQr(db, req, guest) {
  if (!guest || guest.qr) return guest;
  const qr = await qrDataUrl(req, guest.code);
  const { error } = await db.from('guests').update({ qr }).eq('id', guest.id);
  if (error) throw error;
  return { ...guest, qr };
}

const publicGuest = (g) => ({
  code: g.code,
  nom: g.nom,
  prenom: g.prenom,
  email: g.email || '',
  presence: g.presence,
  personnes: g.personnes,
  restrictions: g.restrictions || '',
  qr: g.qr || '',
  createdAt: g.created_at,
});

const clean = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

module.exports = { getDb, newCode, qrDataUrl, ensureQr, publicGuest, clean };
