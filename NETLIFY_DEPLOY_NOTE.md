# Netlify deploy note

This ZIP removes the generated `package-lock.json` that pointed to a private/internal package registry. Netlify cannot access that registry, so dependency installation can hang or fail during `npm install`.

Deploy settings:

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`

If Netlify still reuses an old cache, use **Clear cache and deploy site** in Netlify.
