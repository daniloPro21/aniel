// CSS Tailwind précompilé (remplace cdn.tailwindcss.com, trop lourd pour les mobiles)
// Après une modification des classes dans index.html / admin.html :  npm run css
module.exports = {
  content: ['./index.html', './admin.html', './ticket.js'],
  theme: {
    extend: {
      colors: {
        nuit: { DEFAULT: '#03110C', 900: '#03110C', 800: '#051A13', 700: '#07231A', 600: '#0A2D21' },
        emeraude: { 50: '#F2F7F4', 100: '#DDEEE6', 300: '#7FC2A8', 400: '#3FA382', 500: '#1A8A68', 600: '#138063', 700: '#0F6650', 800: '#0C4033', 900: '#0A3024', 950: '#06251B' },
        or: { 100: '#FAF0D6', 200: '#F3DFA8', 300: '#E8CB8F', 400: '#D4AE6A', 500: '#C0954D', 600: '#A27A36' },
        brule: { 400: '#F08A50', 500: '#E2672B', 600: '#C9561F' },
        ivoire: '#F5EFE3',
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        script: ['"Great Vibes"', 'cursive'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
};
