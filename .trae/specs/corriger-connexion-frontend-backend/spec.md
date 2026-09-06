# Corriger la connectivité frontend ↔ backend en production Spec

## Why
En production (Railway), l'interface affiche « Impossible de joindre le serveur.
Vérifiez votre connexion (VITE_API_URL) » alors que `VITE_API_URL` a été ajoutée
au service frontend, et le domaine du backend affiche « Cannot GET / » en blanc.
Les causes les plus probables : `VITE_API_URL` figée au **build** (non re-déployée
après ajout), variable mal orthographiée (`vite_api_url` vs `VITE_API_URL`), ou
**CORS bloqué** car `FRONTEND_URL` n'est pas définie / incohérente côté backend.
Les messages actuels sont trop génériques pour diagnostiquer ces causes.

## What Changes
- Backend : ajouter une route racine `GET /` qui renvoie un JSON d'information
  (nom du service, `health`, préfixe `/api`) — plus de « Cannot GET / » en blanc
  quand on ouvre le domaine du backend.
- Backend : loguer explicitement au démarrage quand `FRONTEND_URL` est absente
  (le CORS est alors restreint aux origines locales → blocage probable du
  frontend déployé) et loguer chaque origine rejetée par CORS.
- Frontend : enrichir le message d'erreur réseau pour afficher l'URL de base
  réellement utilisée (`VITE_API_URL` ou même origine) et rappeler que la
  variable est figée au build (ajouter puis **redeploy**).
- README : nouvelle section « Dépannage — production » (diagnostic pas à pas :
  orthographe de `VITE_API_URL`, HTTPS sans slash final, re-déploiement après
  ajout de variable, `FRONTEND_URL` côté backend = domaine exact du frontend,
  vérification de `/health`).
- Aucun changement de modèle, de logique métier ni de la génération des prompts.

## Impact
- Affected specs : aucune spec antérieure.
- Affected code :
  - `backend/src/index.js` (route `GET /`, logs CORS)
  - `frontend/src/api.js` (message d'erreur réseau enrichi)
  - `README.md` (dépannage production + rappels Railway)

## ADDED Requirements

### Requirement: Diagnostic API visible sur le domaine backend
Le backend SHALL répondre `200` avec un objet JSON sur sa route racine `GET /`.

#### Scenario: Ouverture du domaine du backend
- **WHEN** l'utilisateur ouvre `https://tension-backend…` dans un navigateur
- **THEN** il reçoit un JSON lisible (nom, `GET /health`, préfixe `/api`) au lieu
  de « Cannot GET / ».

### Requirement: Alerte de configuration CORS
Le backend SHALL avertir au démarrage si `FRONTEND_URL` n'est pas définie et
SHALL loguer chaque origine rejetée par le middleware CORS.

#### Scenario: `FRONTEND_URL` absente sur Railway
- **WHEN** le backend démarre sans `FRONTEND_URL`
- **THEN** un avertissement clair est émis dans les logs expliquant le risque de
  blocage CORS du frontend déployé et la variable à définir.

#### Scenario: Origine non autorisée
- **WHEN** une requête arrive avec une origine hors liste autorisée
- **THEN** la requête reçoit un `403` JSON et l'origine rejetée est loguée côté
  serveur pour faciliter le diagnostic.

### Requirement: Message d'erreur réseau actionnable côté frontend
Le client API SHALL inclure, dans l'erreur « impossible de joindre le serveur »,
l'URL de base utilisée et un rappel que `VITE_API_URL` est intégrée au build
(ajouter la variable puis redéployer).

#### Scenario: Échec de jointure du backend
- **WHEN** `fetch` échoue (réseau, CORS, backend injoignable)
- **THEN** le message affiché précise l'URL tentée et les actions correctives
  (vérifier l'orthographe `VITE_API_URL`, la faire précéder de `https://`, sans
  slash final, puis redéployer ; côté backend définir `FRONTEND_URL`).

### Requirement: Documentation de diagnostic production
Le README SHALL documenter la procédure de diagnostic et les valeurs Railway
exactes à configurer.

#### Scenario: Suivi de la documentation
- **WHEN** l'utilisateur suit la section « Dépannage — production »
- **THEN** il vérifie l'orthographe/la casse de `VITE_API_URL`, redéploie après
  ajout, contrôle `/health`, puis vérifie que `FRONTEND_URL` (backend) égale le
  domaine exact du frontend (schéma `https`, sans chemin).
