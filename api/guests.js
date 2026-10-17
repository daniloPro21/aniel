// Espace admin — clé ADMIN_KEY dans l'en-tête x-admin-key (ou ?key=...)
// GET    /api/guests                  -> liste JSON + totaux + plan de table (sans les images QR)
// GET    /api/guests?q=<nom|code>     -> recherche par nom, prénom, code, téléphone ou e-mail
// GET    /api/guests?code=AD-XXXXXX   -> une invitation complète (avec son QR code)
// GET    /api/guests?format=csv       -> export CSV (ouvrable dans Excel)
// POST   /api/guests { prenom, nom, personnes, telephone, table, presence } -> crée une invitation + QR code
// POST   /api/guests { action: 'checkin', code }            -> contrôle à l'entrée (scan)
// POST   /api/guests { action: 'shared', code }             -> marque l'invitation comme envoyée (WhatsApp)
// POST   /api/guests { action: 'import', rows: [{ nom, prenom, telephone, personnes, presence }] } -> import Excel
// POST   /api/guests { action: 'tableName', table, name }  -> renomme une table (nom vide = nom par défaut)
// PATCH  /api/guests?code=AD-XXXXXX { ...champs }           -> modifie une invitation (dont la table)
// DELETE /api/guests?code=AD-XXXXXX   -> supprime une invitation
const crypto = require('crypto');
const { getDb, newCode, qrDataUrl, ensureQr, publicGuest, clean, TABLES, SEATS, parsePersonnes, defaultTableName, tableNames } = require('./_db');

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const csvCell = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
const LIST_COLS = 'id,code,prenom,nom,email,telephone,presence,personnes,restrictions,message,source,table_num,shared_at,checked_in_at,created_at';
const PRESENCES = ['oui', 'attente', 'non'];

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const listItem = ({ id, qr, created_at, checked_in_at, shared_at, table_num, ...g }) =>
  ({ ...g, table: table_num || null, sharedAt: shared_at, checkedInAt: checked_in_at, createdAt: created_at });
const adminGuest = (g, names) => ({ ...publicGuest(g), tableName: g.table_num && names ? names[g.table_num] : null, telephone: g.telephone || '', source: g.source, sharedAt: g.shared_at, checkedInAt: g.checked_in_at });
const codeOf = (v) => (clean(v, 200).toUpperCase().match(/AD-[A-Z0-9]{6}/) || [])[0];

const httpError = (status, message) => Object.assign(new Error(message), { status });

// Numéro de table : vide => non placé ; sinon entier entre 1 et TABLES
function parseTable(v) {
  if (v === null || v === undefined || v === '' || v === 0 || v === '0') return null;
  const n = parseInt(v, 10);
  if (!Number.isInteger(n) || n < 1 || n > TABLES) throw httpError(400, `Table invalide (1 à ${TABLES}).`);
  return n;
}

// Vérifie qu'il reste assez de places à la table (les absents ne comptent pas)
async function checkSeats(db, table, personnes, presence, selfId) {
  if (!table || presence === 'non') return;
  const r = await db.from('guests').select('id,personnes,presence').eq('table_num', table);
  if (r.error) throw r.error;
  const used = (r.data || []).filter((g) => g.id !== selfId && g.presence !== 'non').reduce((n, g) => n + (g.personnes || 1), 0);
  if (used + personnes > SEATS) {
    throw httpError(409, `Table ${table} : ${used}/${SEATS} places déjà prises, impossible d’ajouter ${personnes} personne${personnes > 1 ? 's' : ''}.`);
  }
}

function summarize(all, names) {
  const coming = all.filter((g) => g.presence !== 'non');
  const seats = (list) => list.reduce((n, g) => n + (g.personnes || 1), 0);
  const tables = Array.from({ length: TABLES }, (_, i) => {
    const guests = coming.filter((g) => g.table === i + 1)
      .map(({ code, prenom, nom, personnes, presence }) => ({ code, prenom, nom, personnes, presence }));
    return { n: i + 1, name: names[i + 1], custom: names[i + 1] !== defaultTableName(i + 1), used: seats(guests), guests };
  });
  return {
    total: {
      invitations: all.length,
      personnes: seats(coming),
      confirmes: all.filter((g) => g.presence === 'oui').length,
      attente: all.filter((g) => g.presence === 'attente').length,
      absents: all.filter((g) => g.presence === 'non').length,
      places: seats(coming.filter((g) => g.table)),
      sansTable: seats(coming.filter((g) => !g.table)),
      envoyes: all.filter((g) => g.sharedAt).length,
      arrives: all.filter((g) => g.checkedInAt).length,
      capacite: TABLES * SEATS,
    },
    plan: { tables: TABLES, seats: SEATS, list: tables },
  };
}

// Import Excel : lignes déjà lues côté navigateur. Le QR code est généré à la première ouverture du billet (ensureQr).
const PRESENCE_WORDS = { oui: 'oui', confirme: 'oui', confirmee: 'oui', present: 'oui', presente: 'oui', non: 'non', absent: 'non', absente: 'non' };
const IMPORT_MAX = 500;
async function importRows(db, input) {
  if (!Array.isArray(input) || !input.length) throw httpError(400, 'Aucune ligne à importer.');
  if (input.length > IMPORT_MAX) throw httpError(400, `Maximum ${IMPORT_MAX} lignes par import.`);
  const existing = await db.from('guests').select('prenom,nom');
  if (existing.error) throw existing.error;
  const seen = new Set(existing.data.map((g) => fold(g.prenom + ' ' + g.nom).trim()));
  const rows = [], skipped = [];
  input.forEach((x, i) => {
    const line = (x && x.line) || i + 2;
    const prenom = clean(x && x.prenom, 60), nom = clean(x && x.nom, 60);
    if (!prenom || !nom) return skipped.push({ line, reason: 'Nom ou prénom manquant' });
    const p = parseInt(x.personnes, 10);
    if (p !== 1 && p !== 2) return skipped.push({ line, reason: 'Nombre de personnes : 1 ou 2' });
    const key = fold(prenom + ' ' + nom).trim();
    if (seen.has(key)) return skipped.push({ line, reason: `${prenom} ${nom} existe déjà` });
    seen.add(key);
    const st = fold(x.presence).replace(/[^a-z]/g, '');
    rows.push({ prenom, nom, telephone: clean(x.telephone, 30), personnes: p, presence: PRESENCE_WORDS[st] || 'attente', source: 'import' });
  });
  let created = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    for (let attempt = 0; ; attempt++) {
      const codes = new Set();
      while (codes.size < chunk.length) codes.add(newCode());
      const list = [...codes];
      const ins = await db.from('guests').insert(chunk.map((r, k) => ({ ...r, code: list[k] })));
      if (!ins.error) { created += chunk.length; break; }
      if (ins.error.code !== '23505' || attempt >= 3) throw ins.error; // collision de code : on retente le lot
    }
  }
  return { created, skipped };
}

function readBody(req) {
  let b = req.body || {};
  if (typeof b === 'string') b = JSON.parse(b || '{}');
  return b;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const key = req.headers['x-admin-key'] || req.query.key;
  if (!process.env.ADMIN_KEY || !safeEqual(key, process.env.ADMIN_KEY)) {
    return res.status(401).json({ error: 'Non autorisé.' });
  }
  try {
    const db = getDb();

    if (req.method === 'GET' && req.query.code) {
      const r = await db.from('guests').select('*').eq('code', clean(req.query.code, 20).toUpperCase()).maybeSingle();
      if (r.error) throw r.error;
      if (!r.data) return res.status(404).json({ code: 'NOT_FOUND', error: 'Invitation introuvable.' });
      return res.status(200).json({ guest: adminGuest(await ensureQr(db, req, r.data), await tableNames(db)) });
    }

    if (req.method === 'GET') {
      const { data, error } = await db.from('guests').select(LIST_COLS).order('created_at', { ascending: false });
      if (error) throw error;
      const all = data.map(listItem);
      // chaque mot doit apparaître dans le prénom, le nom, le code, le téléphone ou l'e-mail (sans tenir compte des accents)
      const terms = fold(clean(req.query.q, 80)).split(' ').filter(Boolean);
      const guests = all.filter((g) => terms.every((t) => [g.prenom, g.nom, g.code, g.telephone, g.email].some((v) => fold(v).includes(t))));

      if (req.query.format === 'csv') {
        const cols = ['code', 'prenom', 'nom', 'personnes', 'table', 'telephone', 'presence', 'sharedAt', 'checkedInAt', 'createdAt'];
        const lines = [cols.join(';')].concat(guests.map((g) => cols.map((c) => csvCell(g[c])).join(';')));
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="invites-annie-daniel.csv"');
        return res.status(200).send('﻿' + lines.join('\n'));
      }
      return res.status(200).json({ ...summarize(all, await tableNames(db)), guests });
    }

    if (req.method === 'POST') {
      const b = readBody(req);

      if (b.action === 'checkin') {
        const code = codeOf(b.code);
        if (!code) return res.status(400).json({ error: 'QR code non reconnu.' });
        const r = await db.from('guests').select('*').eq('code', code).maybeSingle();
        if (r.error) throw r.error;
        if (!r.data) return res.status(404).json({ code: 'NOT_FOUND', error: `Aucune invitation pour ${code}.` });
        const already = r.data.checked_in_at;
        let guest = r.data;
        if (!already) {
          const upd = await db.from('guests').update({ checked_in_at: new Date().toISOString() }).eq('id', guest.id).select().single();
          if (upd.error) throw upd.error;
          guest = upd.data;
        }
        const { qr, ...g } = adminGuest(guest, await tableNames(db));
        return res.status(200).json({ guest: g, alreadyCheckedIn: Boolean(already) });
      }

      if (b.action === 'shared') {
        const code = codeOf(b.code);
        if (!code) return res.status(400).json({ error: 'Code requis.' });
        const upd = await db.from('guests').update({ shared_at: new Date().toISOString() }).eq('code', code).select().single();
        if (upd.error) throw upd.error;
        return res.status(200).json({ sharedAt: upd.data.shared_at });
      }

      if (b.action === 'tableName') {
        const table = parseTable(b.table);
        if (!table) return res.status(400).json({ error: 'Table requise.' });
        const name = clean(b.name, 40);
        const r = !name || name === defaultTableName(table)
          ? await db.from('wedding_tables').delete().eq('num', table)
          : await db.from('wedding_tables').upsert({ num: table, name, updated_at: new Date().toISOString() });
        if (r.error) {
          if (r.error.code === '42P01' || r.error.code === 'PGRST205') return res.status(503).json({ error: 'Lancez d’abord le script SQL (table wedding_tables manquante).' });
          throw r.error;
        }
        return res.status(200).json({ table, name: name || defaultTableName(table) });
      }

      if (b.action === 'import') return res.status(200).json(await importRows(db, b.rows));

      const prenom = clean(b.prenom, 60);
      const nom = clean(b.nom, 60);
      if (!prenom || !nom) return res.status(400).json({ error: 'Nom et prénom requis.' });
      const row = {
        prenom, nom,
        telephone: clean(b.telephone, 30),
        personnes: parsePersonnes(b.personnes),
        presence: PRESENCES.includes(b.presence) ? b.presence : 'attente',
        table_num: parseTable(b.table),
        source: 'admin',
      };
      await checkSeats(db, row.table_num, row.personnes, row.presence, null);
      for (let i = 0; i < 4; i++) {
        const code = newCode();
        const ins = await db.from('guests').insert({ ...row, code, qr: await qrDataUrl(req, code) }).select().single();
        if (ins.error) {
          if (ins.error.code === '23505') continue; // collision de code : on retente
          throw ins.error;
        }
        return res.status(201).json({ guest: adminGuest(ins.data) });
      }
      return res.status(500).json({ error: 'Création impossible, réessayez.' });
    }

    if (req.method === 'PATCH') {
      const code = codeOf(req.query.code);
      if (!code) return res.status(400).json({ error: 'Code requis.' });
      const r = await db.from('guests').select('*').eq('code', code).maybeSingle();
      if (r.error) throw r.error;
      if (!r.data) return res.status(404).json({ code: 'NOT_FOUND', error: 'Invitation introuvable.' });
      const b = readBody(req);
      const cur = r.data;
      const row = { updated_at: new Date().toISOString() };
      if ('prenom' in b) row.prenom = clean(b.prenom, 60);
      if ('nom' in b) row.nom = clean(b.nom, 60);
      if ('telephone' in b) row.telephone = clean(b.telephone, 30);
      if ('personnes' in b) row.personnes = parsePersonnes(b.personnes);
      if ('presence' in b && PRESENCES.includes(b.presence)) row.presence = b.presence;
      if ('table' in b) row.table_num = parseTable(b.table);
      if (row.prenom === '' || row.nom === '') return res.status(400).json({ error: 'Nom et prénom requis.' });
      const next = { ...cur, ...row };
      await checkSeats(db, next.table_num, next.personnes || 1, next.presence, cur.id);
      const upd = await db.from('guests').update(row).eq('id', cur.id).select().single();
      if (upd.error) throw upd.error;
      return res.status(200).json({ guest: adminGuest(await ensureQr(db, req, upd.data)) });
    }

    if (req.method === 'DELETE') {
      const code = clean(req.query.code, 20).toUpperCase();
      if (!code) return res.status(400).json({ error: 'Code requis.' });
      const { error } = await db.from('guests').delete().eq('code', code);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  } catch (e) {
    if (e && e.code === 'NO_DB') return res.status(503).json({ code: 'NO_DB', error: 'Base de données non configurée.' });
    if (e && e.status) return res.status(e.status).json({ error: e.message });
    if (e instanceof SyntaxError) return res.status(400).json({ error: 'Requête invalide.' });
    console.error(e);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
};
