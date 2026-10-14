// POST /api/rsvp            -> enregistre ou met à jour une réponse (clé : code d'invitation s'il est fourni, sinon e-mail)
// GET  /api/rsvp?q=<valeur> -> retrouve une invitation par code (AD-XXXXXX) ou par e-mail exact
const { getDb, newCode, qrDataUrl, ensureQr, publicGuest, clean } = require('./_db');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'POST') {
      let b = req.body || {};
      if (typeof b === 'string') b = JSON.parse(b);

      if (b.website) return res.status(400).json({ error: 'Requête invalide.' }); // champ piège anti-spam

      const prenom = clean(b.prenom, 60);
      const nom = clean(b.nom, 60);
      const email = clean(b.email, 120).toLowerCase();
      const telephone = clean(b.telephone, 30);
      const presence = b.presence === 'non' ? 'non' : b.presence === 'oui' ? 'oui' : null;
      const personnes = Math.min(10, Math.max(1, parseInt(b.personnes, 10) || 1));
      const restrictions = clean(b.restrictions, 300);
      const message = clean(b.message, 500);
      const inviteCode = clean(b.code, 20).toUpperCase();

      if (!prenom || !nom) return res.status(400).json({ error: 'Nom et prénom requis.' });
      if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Adresse e-mail invalide.' });
      if (!presence) return res.status(400).json({ error: 'Merci d’indiquer votre présence.' });

      const db = getDb();
      const row = {
        nom, prenom, telephone, presence,
        personnes: presence === 'oui' ? personnes : 0,
        restrictions, message,
        updated_at: new Date().toISOString(),
      };

      let guest = null;
      for (let i = 0; i < 4 && !guest; i++) {
        // invitation créée depuis /admin : l'invité la confirme avec son code (sans créer de doublon)
        let found = { data: null };
        if (inviteCode) {
          found = await db.from('guests').select('*').eq('code', inviteCode).maybeSingle();
          if (found.error) throw found.error;
          if (found.data && found.data.email && found.data.email !== email) found = { data: null };
          if (found.data) row.email = email;
        }
        if (!found.data) {
          found = await db.from('guests').select('*').eq('email', email).maybeSingle();
          if (found.error) throw found.error;
        }

        if (found.data) {
          // même e-mail : on met à jour et on conserve le code existant
          const upd = await db.from('guests').update(row).eq('id', found.data.id).select().single();
          if (upd.error) throw upd.error;
          guest = upd.data;
        } else {
          const code = newCode();
          const qr = await qrDataUrl(req, code);
          const ins = await db.from('guests').insert({ ...row, email, code, qr, source: 'rsvp' }).select().single();
          if (ins.error) {
            if (ins.error.code === '23505') continue; // collision rare (code ou e-mail simultané) : on retente
            throw ins.error;
          }
          guest = ins.data;
        }
      }
      if (!guest) return res.status(500).json({ error: 'Enregistrement impossible, réessayez.' });
      guest = await ensureQr(db, req, guest);
      return res.status(200).json({ guest: publicGuest(guest) });
    }

    if (req.method === 'GET') {
      const q = clean(req.query.q, 120).toLowerCase();
      if (!q) return res.status(400).json({ error: 'Indiquez votre code ou votre e-mail.' });
      const db = getDb();

      let r = await db.from('guests').select('*').eq('code', q.toUpperCase()).maybeSingle();
      if (r.error) throw r.error;
      if (!r.data) {
        r = await db.from('guests').select('*').eq('email', q).maybeSingle();
        if (r.error) throw r.error;
      }
      if (!r.data) return res.status(404).json({ code: 'NOT_FOUND', error: 'Aucune invitation trouvée.' });
      return res.status(200).json({ guest: publicGuest(await ensureQr(db, req, r.data)) });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  } catch (e) {
    if (e && e.code === 'NO_DB') {
      return res.status(503).json({ code: 'NO_DB', error: 'Base de données non configurée.' });
    }
    console.error(e);
    return res.status(500).json({ error: 'Erreur serveur, veuillez réessayer dans un instant.' });
  }
};
