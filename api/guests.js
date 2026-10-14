// GET /api/guests?key=<ADMIN_KEY>                -> liste JSON + totaux
// GET /api/guests?key=<ADMIN_KEY>&format=csv     -> export CSV (ouvrable dans Excel)
// Vous pouvez aussi envoyer la clé dans l'en-tête  x-admin-key.
const crypto = require('crypto');
const { getDb } = require('./_db');

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const csvCell = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const key = req.headers['x-admin-key'] || req.query.key;
  if (!process.env.ADMIN_KEY || !safeEqual(key, process.env.ADMIN_KEY)) {
    return res.status(401).json({ error: 'Non autorisé.' });
  }
  try {
    const db = getDb();
    const { data, error } = await db
      .from('guests')
      .select('code,prenom,nom,email,telephone,presence,personnes,restrictions,message,created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const guests = data.map(({ created_at, ...g }) => ({ ...g, createdAt: created_at }));

    const total = {
      reponses: guests.length,
      presents: guests.filter((g) => g.presence === 'oui').length,
      absents: guests.filter((g) => g.presence === 'non').length,
      personnes: guests.reduce((n, g) => n + (g.presence === 'oui' ? g.personnes || 1 : 0), 0),
    };

    if (req.query.format === 'csv') {
      const cols = ['code', 'prenom', 'nom', 'email', 'telephone', 'presence', 'personnes', 'restrictions', 'message', 'createdAt'];
      const lines = [cols.join(';')].concat(guests.map((g) => cols.map((c) => csvCell(g[c])).join(';')));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="invites-annie-daniel.csv"');
      return res.status(200).send('\uFEFF' + lines.join('\n'));
    }
    return res.status(200).json({ total, guests });
  } catch (e) {
    if (e && e.code === 'NO_DB') return res.status(503).json({ code: 'NO_DB', error: 'Base de données non configurée.' });
    console.error(e);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
};
