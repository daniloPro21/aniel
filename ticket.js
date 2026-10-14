/* Billet « Wedding Pass » : le visuel billet.jpg (872×1820) sert de fond,
   on y écrit le nom de l'invité dans le cadre « M./MME » et on pose le QR code
   dans le cadre blanc du talon vert, puis le billet est tourné à l'horizontale (1820×872).
   Utilisé par index.html et admin.html. */
(function () {
  const BG = '/billet.jpg';
  const W = 872, H = 1820, SCALE = 2;              // rendu ×2 pour un texte net
  const INK = '#1f2a26', GREEN = '#0a3024';
  const MONO = '"Courier New", Courier, monospace';

  const loadImg = (src) => new Promise((ok, ko) => {
    const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src;
  });

  // Texte tourné de 90° (lecture de haut en bas), comme sur le visuel.
  function vText(x, text, bx, by, font, color, align) {
    x.save();
    x.translate(bx, by); x.rotate(Math.PI / 2);
    x.font = font; x.fillStyle = color; x.textAlign = align || 'left'; x.textBaseline = 'alphabetic';
    x.fillText(text, 0, 0);
    x.restore();
  }

  async function renderTicket(guest, qrUrl) {
    const [bg, qr] = await Promise.all([loadImg(BG), loadImg(qrUrl)]);
    const c = document.createElement('canvas'); c.width = W * SCALE; c.height = H * SCALE;
    const x = c.getContext('2d');
    x.scale(SCALE, SCALE);
    x.drawImage(bg, 0, 0, W, H);

    // Efface « AVANT LE 30/09/2026 » sous « RSVP » (x 622→668, y 1340→1715) avec le vert du talon
    const [r, g, b] = x.getImageData(645 * SCALE, 1320 * SCALE, 1, 1).data;
    x.fillStyle = `rgb(${r},${g},${b})`;
    x.fillRect(622, 1340, 46, 375);

    // Nom dans le cadre « M./MME » (x 657→763, y 220→1085), à la suite de « M./MME »
    let name = `${guest.prenom} ${guest.nom}`.toUpperCase();
    if ((guest.personnes || 1) > 1) name += `  ×${guest.personnes}`;
    const maxLen = 1065 - 392;
    let fs = 32;
    do { x.font = `700 ${fs}px ${MONO}`; fs -= 1; } while (x.measureText(name).width > maxLen && fs > 14);
    vText(x, name, 699, 392, x.font, INK);

    // QR code dans le cadre blanc du talon (x 248→584, y 1355→1683) + code à droite
    const s = 270, qx = 256, qy = 1519 - s / 2;
    x.imageSmoothingEnabled = false;
    x.drawImage(qr, qx, qy, s, s);
    x.imageSmoothingEnabled = true;
    vText(x, guest.code, 546, 1519, `700 22px ${MONO}`, GREEN, 'center');

    // Billet final à l'horizontale : rotation de 90° (sens inverse des aiguilles d'une montre)
    const out = document.createElement('canvas'); out.width = c.height; out.height = c.width;
    const o = out.getContext('2d');
    o.translate(0, out.height); o.rotate(-Math.PI / 2);
    o.drawImage(c, 0, 0);
    return out.toDataURL('image/png');
  }

  window.renderTicket = renderTicket;
  window.downloadUrl = function (url, name) {
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  };
})();
