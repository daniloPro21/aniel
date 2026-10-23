// GET  /api/rsvp?q=AD-XXXXXX                    -> retrouve un billet par son code (public : nom, table, QR code)
// POST /api/rsvp { code, presence: 'oui'|'non' } -> l'invité confirme sa présence ou se désiste
// Les invitations sont créées uniquement depuis /admin : le code du billet sert de preuve.
const { getDb, ensureQr, publicGuest, clean, tableNames, SEATS } = require('./_db');

const codeOf = (v) => (clean(v, 200).toUpperCase().match(/AD-[A-Z0-9]{6}/) || [])[0];

// Réponse de l'invité. S'il revient après s'être désisté et que sa table est entre-temps
// complète, on le retire de la table : les mariés le replaceront depuis /admin.
async function respond(db, cur, presence) {
  const now = new Date().toISOString();
  const row = { presence, responded_at: now, updated_at: now };
  if (presence === 'oui' && cur.presence === 'non' && cur.table_num) {
    const r = await db.from('guests').select('id,personnes,presence').eq('table_num', cur.table_num);
    if (r.error) throw r.error;
    const used = (r.data || []).filter((g) => g.id !== cur.id && g.presence !== 'non').reduce((n, g) => n + (g.personnes || 1), 0);
    if (used + (cur.personnes || 1) > SEATS) row.table_num = null;
  }
  const upd = await db.from('guests').update(row).eq('id', cur.id).select().single();
  if (upd.error) throw upd.error;
  return upd.data;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }
  try {
    let b = req.body || {};
    if (typeof b === 'string') b = JSON.parse(b || '{}');
    const code = codeOf(req.method === 'POST' ? b.code : req.query.q);
    if (!code) return res.status(400).json({ error: 'Indiquez le code de votre billet (AD-XXXXXX).' });
    const db = getDb();
    const r = await db.from('guests').select('*').eq('code', code).maybeSingle();
    if (r.error) throw r.error;
    if (!r.data) return res.status(404).json({ code: 'NOT_FOUND', error: 'Aucun billet trouvé pour ce code.' });

    let row = r.data;
    if (req.method === 'POST') {
      if (b.presence !== 'oui' && b.presence !== 'non') return res.status(400).json({ error: 'Réponse invalide.' });
      if (row.checked_in_at) return res.status(409).json({ error: 'Votre billet a déjà été scanné à l’entrée.' });
      if (row.presence !== b.presence) row = await respond(db, row, b.presence);
    }
    const guest = publicGuest(await ensureQr(db, req, row));
    if (guest.table) guest.tableName = (await tableNames(db))[guest.table] || null;
    return res.status(200).json({ guest });
  } catch (e) {
    if (e && e.code === 'NO_DB') return res.status(503).json({ code: 'NO_DB', error: 'Base de données non configurée.' });
    if (e instanceof SyntaxError) return res.status(400).json({ error: 'Requête invalide.' });
    console.error(e);
    return res.status(500).json({ error: 'Erreur serveur, veuillez réessayer dans un instant.' });
  }
};
