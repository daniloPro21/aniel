// CSS Tailwind précompilé (remplace cdn.tailwindcss.com, trop lourd pour les mobiles)
// Après une modification des classes dans index.html / admin.html :  npm run css
// Les couleurs passent par des variables CSS (styles/input.css) : le mode clair du site
// (classe « light » sur <html>) les redéfinit sans toucher aux classes.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const scale = (name, steps) => Object.fromEntries(steps.map((s) => [s, v(`${name}-${s}`)]));

module.exports = {
  content: ['./index.html', './admin.html', './ticket.js'],
  theme: {
    extend: {
      colors: {
        nuit: { DEFAULT: v('nuit'), ...scale('nuit', [900, 800, 700, 600]) },
        emeraude: scale('emeraude', [50, 100, 300, 400, 500, 600, 700, 800, 900, 950]),
        or: scale('or', [100, 200, 300, 400, 500, 600]),
        brule: scale('brule', [400, 500, 600]),
        ivoire: v('ivoire'),
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        script: ['"Great Vibes"', 'cursive'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
};
