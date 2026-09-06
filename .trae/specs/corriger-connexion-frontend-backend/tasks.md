# Tasks

- [x] Task 1 : Ajouter la route racine `GET /` du backend (JSON d'information)
  - [x] 1.1 Dans `backend/src/index.js`, ajouter `GET /` renvoyant `200` avec
        `{ service: "tension-backend", health: "/health", api: "/api/..." }`.
  - [x] 1.2 Vérifier qu'aucune route existante (`/health`, `/api/*`) n'est
        impactée (la route racine reste après `express.json`, avant le 404 `/api`).
  - Validation : `node --check backend/src/index.js` puis démarrage local :
        `curl http://localhost:PORT/` → JSON 200 (plus de « Cannot GET »).

- [x] Task 2 : Logs CORS explicites (configuration + origines rejetées)
  - [x] 2.1 Au démarrage, si `FRONTEND_URL` est absente/non renseignée, loguer un
        avertissement clair (CORS restreint aux origines locales → frontend
        déployé bloqué ; définir `FRONTEND_URL` sur Railway).
  - [x] 2.2 Loguer (`console.warn`) l'origine rejetée dans le callback CORS, en
        conservant la réponse `403` JSON existante.
  - Validation : démarrage sans `FRONTEND_URL` → avertissement visible ;
        requête avec une origine non autorisée → `403` JSON + ligne de log.

- [x] Task 3 : Message d'erreur réseau actionnable côté frontend
  - [x] 3.1 Dans `frontend/src/api.js`, enrichir l'erreur de `fetch` en erreur :
        URL de base réellement utilisée (via `apiUrl`/`BASE`) + rappel que
        `VITE_API_URL` est figée au build (ajouter puis redéployer) et que
        l'URL doit être `https://…` sans slash final.
  - [x] 3.2 Vérifier que le message reste lisible dans les alertes existantes
        (HomePage, WorkspacePage, AdminPage).
  - Validation : `npm run build` frontend OK ; message testé avec backend arrêté.

- [x] Task 4 : Section « Dépannage — production » dans le README
  - [x] 4.1 Documenter le diagnostic pas à pas (casse `VITE_API_URL`,
        re-déploiement après ajout de variable, `https` sans slash final).
  - [x] 4.2 Documenter `FRONTEND_URL` côté backend = domaine exact du frontend,
        et le contrôle `GET /health`.
  - [x] 4.3 Préciser que la route racine du backend renvoie du JSON (utile pour
        vérifier que le backend répond).
  - Validation : relecture du README (cohérence avec `backend/.env.example`).

# Task Dependencies
- Aucune dépendance bloquante entre les tâches 1 à 4 (tâches indépendantes,
  exécutables en parallèle ; Task 4 documente le résultat des tâches 1-2-3).
