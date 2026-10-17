# CSS du site

`tw.css` (à la racine) est généré à partir des classes Tailwind de `index.html`, `admin.html` et `ticket.js`.

Après avoir ajouté ou modifié des classes dans ces fichiers :

```
npm run css
```

puis incrémentez `?v=` dans `<link rel="stylesheet" href="/tw.css?v=…">` (index.html et admin.html) :
le fichier est mis en cache un an par les navigateurs (voir vercel.json). Idem pour `ticket.js?v=…`.
