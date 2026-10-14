// Espace admin — clé ADMIN_KEY dans l'en-tête x-admin-key (ou ?key=...)
// GET    /api/guests                  -> liste JSON + totaux (sans les images QR)
// GET    /api/guests?q=<nom|code>     -> recherche par nom, prénom, code ou e-mail
// GET    /api/guests?code=AD-XXXXXX   -> une invitation complète (avec son QR code)
// GET    /api/guests?format=csv       -> export CSV (ouvrable dans Excel)
// POST   /api/guests { prenom, nom, personnes, telephone }  -> crée une invitation + QR code
// POST   /api/guests { action: 'checkin', code }            -> contrôle à l'entrée (scan)
// DELETE /api/guests?code=AD-XXXXXX   -> supprime une invitation
const crypto = require('crypto');
const { getDb, newCode, qrDataUrl, ensureQr, publicGuest, clean } = require('./_db');

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const csvCell = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
const LIST_COLS = 'code,prenom,nom,email,telephone,presence,personnes,restrictions,message,source,checked_in_at,created_at';

const listItem = ({ created_at, checked_in_at, ...g }) => ({ ...g, createdAt: created_at, checkedInAt: checked_in_at });
const adminGuest = (g) => ({ ...publicGuest(g), telephone: g.telephone || '', source: g.source, checkedInAt: g.checked_in_at });

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
      return res.status(200).json({ guest: adminGuest(await ensureQr(db, req, r.data)) });
    }

    if (req.method === 'GET') {
      let query = db.from('guests').select(LIST_COLS).order('created_at', { ascending: false });
      const terms = clean(req.query.q, 80).replace(/[%,()*]/g, '').toLowerCase().split(' ').filter(Boolean);
      // chaque mot doit apparaître dans le prénom, le nom, le code ou l'e-mail
      if (terms.length) query = query.or(`prenom.ilike.%${terms[0]}%,nom.ilike.%${terms[0]}%,code.ilike.%${terms[0]}%,email.ilike.%${terms[0]}%`);
      const { data, error } = await query;
      if (error) throw error;
      const guests = data
        .filter((g) => terms.every((t) => [g.prenom, g.nom, g.code, g.email].some((v) => String(v || '').toLowerCase().includes(t))))
        .map(listItem);

      const total = {
        reponses: guests.length,
        presents: guests.filter((g) => g.presence === 'oui').length,
        absents: guests.filter((g) => g.presence === 'non').length,
        attente: guests.filter((g) => g.presence === 'attente').length,
        personnes: guests.reduce((n, g) => n + (g.presence !== 'non' ? g.personnes || 1 : 0), 0),
        arrives: guests.filter((g) => g.checkedInAt).length,
      };

      if (req.query.format === 'csv') {
        const cols = ['code', 'prenom', 'nom', 'email', 'telephone', 'presence', 'personnes', 'restrictions', 'message', 'source', 'checkedInAt', 'createdAt'];
        const lines = [cols.join(';')].concat(guests.map((g) => cols.map((c) => csvCell(g[c])).join(';')));
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="invites-annie-daniel.csv"');
        return res.status(200).send('﻿' + lines.join('\n'));
      }
      return res.status(200).json({ total, guests });
    }

    if (req.method === 'POST') {
      let b = req.body || {};
      if (typeof b === 'string') b = JSON.parse(b);

      if (b.action === 'checkin') {
        const code = (clean(b.code, 200).toUpperCase().match(/AD-[A-Z0-9]{6}/) || [])[0];
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
        const { qr, ...g } = adminGuest(guest);
        return res.status(200).json({ guest: g, alreadyCheckedIn: Boolean(already) });
      }

      const prenom = clean(b.prenom, 60);
      const nom = clean(b.nom, 60);
      if (!prenom || !nom) return res.status(400).json({ error: 'Nom et prénom requis.' });
      const row = {
        prenom, nom,
        telephone: clean(b.telephone, 30),
        personnes: Math.min(10, Math.max(1, parseInt(b.personnes, 10) || 1)),
        presence: 'attente',
        source: 'admin',
      };
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

    if (req.method === 'DELETE') {
      const code = clean(req.query.code, 20).toUpperCase();
      if (!code) return res.status(400).json({ error: 'Code requis.' });
      const { error } = await db.from('guests').delete().eq('code', code);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  } catch (e) {
    if (e && e.code === 'NO_DB') return res.status(503).json({ code: 'NO_DB', error: 'Base de données non configurée.' });
    console.error(e);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
};
