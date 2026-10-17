// GET /api/rsvp?q=AD-XXXXXX -> retrouve un billet par son code (public : nom, table, QR code)
// Les inscriptions se font uniquement depuis /admin : il n'y a plus de POST public.
const { getDb, ensureQr, publicGuest, clean, tableNames } = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Les invitations sont envoyées directement par les mariés.' });
  }
  try {
    const code = (clean(req.query.q, 200).toUpperCase().match(/AD-[A-Z0-9]{6}/) || [])[0];
    if (!code) return res.status(400).json({ error: 'Indiquez le code de votre billet (AD-XXXXXX).' });
    const db = getDb();
    const r = await db.from('guests').select('*').eq('code', code).maybeSingle();
    if (r.error) throw r.error;
    if (!r.data) return res.status(404).json({ code: 'NOT_FOUND', error: 'Aucun billet trouvé pour ce code.' });
    const guest = publicGuest(await ensureQr(db, req, r.data));
    if (guest.table) guest.tableName = (await tableNames(db))[guest.table] || null;
    return res.status(200).json({ guest });
  } catch (e) {
    if (e && e.code === 'NO_DB') return res.status(503).json({ code: 'NO_DB', error: 'Base de données non configurée.' });
    console.error(e);
    return res.status(500).json({ error: 'Erreur serveur, veuillez réessayer dans un instant.' });
  }
};
