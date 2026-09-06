# Grand Oral Studio — News mobile (PWA)

Application web mobile **installable** (PWA) pour consulter la **veille IA &
Big Data** de Grand Oral Studio depuis un téléphone. Seule la partie **News**
est couverte : connexion en tant qu'**utilisateur** (mêmes comptes que le site
web) puis lecture des articles et du glossaire du jour.

Le **backend Express partagé** (`/backend`) est réutilisé tel quel : endpoints
`POST /api/auth/login`, `GET /api/auth/me` et `GET /api/news`.

## Démarrage en local

```bash
npm install
npm run icons      # (ré)génère les icônes PWA dans public/icons
npm run dev        # http://localhost:5174 — /api proxysé vers http://localhost:4000
```

Si le backend local écoute ailleurs : `VITE_DEV_PROXY=http://localhost:4000 npm run dev`.

## Build + serveur statique (production)

```bash
npm run build
npm start          # sert dist/ avec fallback SPA (port 5174 par défaut)
```

## Déploiement sur Railway

1. « + New » → « GitHub Repo » → même repo, **Root Directory = `/frontend-mobile`**,
   nommez le service **`grand-oral-studio-news-mobile`**.
2. Onglet **Variables** : `VITE_API_URL` = URL publique du backend
   (ex. `https://grand-oral-studio-backend.up.railway.app`). **Puis redéployez**
   (la variable est figée au build).
3. Générez le domaine public du service (Settings → Networking).
4. **CORS côté backend** : ajoutez ce domaine frontend-mobile à la variable
   `FRONTEND_URL` du service backend (origines séparées par des virgules) puis
   redéployez le backend.

L'utilisateur se connecte avec l'e-mail/mot de passe **déjà créés** par
l'administrateur sur le site web — aucun nouveau compte nécessaire. La PWA
s'installe sur l'écran d'accueil du téléphone via « Ajouter à l'écran
d'accueil » (Chrome) / « Partager → Ajouter à l'écran d'accueil » (iOS Safari).

## Structure

```
frontend-mobile/
├── public/
│   ├── manifest.webmanifest   # manifest PWA (nom, icônes, standalone)
│   ├── sw.js                  # service worker (cache de l'app shell)
│   └── icons/                 # icônes générées par scripts/generate-icons.js
├── scripts/generate-icons.js  # génère les PNG d'icônes (sans dépendance)
├── src/
│   ├── api.js                 # client API (token JWT, mêmes conventions que le site)
│   ├── auth.jsx               # contexte d'auth (login/logout/mé)
│   ├── App.jsx                # garde de connexion → Login ou News
│   ├── components/LoginView.jsx
│   ├── components/NewsView.jsx
│   ├── main.jsx               # enregistre le service worker (prod)
│   └── index.css              # design mobile-first (palette CESI)
├── static-server.js           # sert dist/ avec fallback SPA (Railway)
├── vite.config.js
└── package.json
```
