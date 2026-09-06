# Checklist

- [x] Le backend répond `200` JSON sur `GET /` (plus de « Cannot GET / » en
      ouvrant le domaine du backend).
- [x] Un avertissement de démarrage est logué quand `FRONTEND_URL` est absente.
- [x] Une origine non autorisée reçoit un `403` JSON et son origine est loguée
      côté serveur.
- [x] Le message d'erreur réseau du frontend inclut l'URL de base utilisée et
      le rappel « variable figée au build → ajouter puis redéployer ».
- [x] Le build frontend (`npm run build`) passe sans erreur après modification.
- [x] Aucune régression : `/health`, seed et routes `/api/*` inchangés (vérifié
      par `node --check` sur le backend et démarrage local).
- [x] Le README contient la section « Dépannage — production » (casse de
      `VITE_API_URL`, re-déploiement, `https` sans slash, `FRONTEND_URL` côté
      backend = domaine exact du frontend, contrôle `GET /health`).
