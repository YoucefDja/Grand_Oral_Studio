# Grand Oral Studio

Assistant de préparation au **Grand Oral CESI** : il guide l'étudiant ingénieur à
travers **6 étapes méthodologiques** — analyse du sujet, problématique, recherche
documentaire, **glossaire & résumés de sources**, plan détaillé, support de
présentation — jusqu'à l'export d'un **.pptx** sobre aux couleurs CESI.

La méthodologie, les schémas JSON de sortie et les thèmes sont **stockés en base
de données** et modifiables via un **panneau admin** (page `/admin`) : rien n'est
codé en dur dans le frontend ni le backend.

L'application est **authentifiée par rôles** : un compte **admin** initial est
créé au premier démarrage (variables `ADMIN_EMAIL` / `ADMIN_PASSWORD`), puis
l'admin **invite par e-mail** (Resend) les utilisateurs, qui reçoivent un lien
pour configurer leur mot de passe. Chaque utilisateur ne voit que **ses propres
sessions**.

> Le contenu exact des sections de méthodologie est extrait de
> [`methodologie-grand-oral.md`](methodologie-grand-oral.md) (fichier métier
> fourni séparément) — copié **tel quel** dans la base par le script de seed,
> jamais reformulé.

---

## Architecture

L'application est découpée en **4 services Railway** :

| Service | Dossier | Techno | Rôle |
| --- | --- | --- | --- |
| `grand-oral-studio-backend` | `/backend` | Node.js + Express + MongoDB (Mongoose) | API, génération Anthropic, export .pptx, admin JWT |
| `grand-oral-studio-frontend` | `/frontend` | React (Vite) — build statique servi par un mini-serveur SPA | Interface étudiant + page `/admin` |
| `grand-oral-studio-news-mobile` | `/frontend-mobile` | React (Vite) — **PWA** installable | Version mobile de la veille News (connexion utilisateur) |
| MongoDB | plugin Railway | MongoDB managé | Base de données |

```
.
├── /backend                  # Service Railway "grand-oral-studio-backend"
│   ├── /scripts
│   │   └── seed-methodology.js   # Seed idempotent (méthodologie + schémas + thèmes)
│   ├── /src
│   │   ├── /middleware           # auth : requireAuth / requireAdmin (JWT)
│   │   ├── /models               # User, MethodologySection, StepSchema, Theme, Session, News*
│   │   ├── /routes               # themes, sessions, admin, adminNews, auth, news
│   │   ├── /services             # promptBuilder, anthropic, deepseek, pptx, password, resend, news*
│   │   ├── /data                 # defaultNewsSources (10 sources de départ)
│   │   ├── bootstrap.js          # création du compte admin initial + migration des sessions
│   │   ├── db.js
│   │   └── index.js
│   ├── methodology-content.json  # Contenu des sections extrait du .md (seed)
│   ├── package.json
│   └── .env.example
├── /frontend                  # Service Railway "grand-oral-studio-frontend"
│   ├── /src                    # React (Vite) : pages, composants par étape
│   ├── index.html
│   ├── static-server.js        # sert dist/ avec fallback SPA (deep links /admin)
│   ├── package.json
│   └── .env.example
├── /frontend-mobile           # Service Railway "grand-oral-studio-news-mobile"
│   └── …                       # PWA News (voir son README) — même backend
├── methodologie-grand-oral.md  # Document métier (source du seed)
├── prompt-ide-architecture.md  # Spec d'architecture
└── README.md
```

---

## Les 6 étapes du parcours

1. **Analyse du sujet** — reformulation, mots-clés contextualisés, tensions provisoires.
2. **Problématique** — 2 à 4 formulations issues de tensions réelles + **ligne directrice** (le « fil rouge »).
3. **Recherche documentaire** — axes, sources réelles, données chiffrées à chercher.
4. **Glossaire & résumés de sources** — à valider **avant** le plan.
5. **Plan détaillé** — sections minutées reliées à la problématique et au fil conducteur.
6. **Support de présentation** — slides + notes orateur + **export .pptx**.

Deux règles produit sont appliquées de bout en bout (backend et interface) :

- la **ligne directrice** formulée à l'étape 2 est réinjectée dans le prompt de toutes
  les étapes suivantes ;
- le **glossaire est obligatoire avant le plan et l'export .pptx** : les routes refusent
  explicitement (400) une génération `plan`/`support` ou un export sans glossaire validé.

### Routage des modèles d'IA

Le provider est sélectionné selon l'étape (la construction du prompt est
strictement identique, seul l'appel change) :

- **Étapes 1 à 5** (`analyse`, `probleme`, `recherche`, `glossaire`, `plan`) →
  **API DeepSeek**, modèle `deepseek-v4-flash` en mode non-thinking ;
- **Étape 6** (`support`) → **API Anthropic Claude** (inchangée, alimente l'export .pptx).

`ANTHROPIC_API_KEY` reste donc nécessaire, et `DEEPSEEK_API_KEY` est requise pour
les étapes 1 à 5. Un solde DeepSeek insuffisant renvoie une erreur explicite (402).

### Comptes & connexion

L'accès passe par une authentification **par rôles** (JWT sur
`Authorization: Bearer`) :

- **admin** — accès complet : invite et gère les utilisateurs (onglet
  « Utilisateurs » de `/admin`), édite méthodologie/schémas/thèmes, et dispose de
  ses propres sessions. Le premier compte admin est **créé automatiquement au
  démarrage** du backend depuis `ADMIN_EMAIL` et `ADMIN_PASSWORD`.
- **user** — étudiant invité par l'admin : l'admin saisit son **e-mail** dans
  `/admin` → un **e-mail Resend** est envoyé avec un lien
  `/accept-invite?token=…` (valable 48 h) → l'utilisateur **configure son mot de
  passe** puis se connecte sur `/login`. Il ne voit que **ses propres sessions**
  (créées après connexion).

Sécurité : mots de passe hachés en `scrypt`, liens d'invitation à usage unique
et expirants, sessions d'API privées par utilisateur. Les anciennes sessions
(créées avant l'authentification) sont automatiquement rattachées au compte
admin au démarrage.

---

## Veille News (IA & Big Data)

Un onglet **News** (barre de navigation, visible par tout utilisateur connecté)
affiche une veille automatique : articles récents + **glossaire du jour**
(acronymes et termes techniques expliqués).

- **Sources dynamiques** : table `NewsSource` (nom, URL, active). Les 10 sites de
  départ sont insérés au premier démarrage (fichier `data/defaultNewsSources.js`)
  et sont **modifiables / ajoutables / supprimables** depuis
  **Administration → News — sources**.
- **Collecte quotidienne** : un **cron** (`node-cron`, défaut 06h30 Europe/Paris,
  réglable via `NEWS_CRON_*`) parcourt les sources **actives**, parse leur flux
  RSS/Atom ou leur page HTML, récupère le titre/résumé/date de chaque nouvel
  article. Un bouton **« Lancer le scraping manuellement »** (même page admin)
  déclenche le processus à la demande sans attendre le cron.
- **Anti-doublon strict** : l'URL d'origine est **unique** en base
  (`NewsArticle.url`) ; tout article déjà présent est ignoré. Le scraping reste
  tolérant : une source injoignable ne bloque jamais le reste du lot.
- **IA (DeepSeek)** : quand `DEEPSEEK_API_KEY` est présente, chaque lot d'articles
  est classifié (résumé en français, catégorie IA/Big Data/Cloud, tags) en
  vérifiant qu'il provient bien d'une source autorisée, puis le **glossaire du
  jour** (`NewsGlossary`, un document par date) est généré. Sans clé DeepSeek,
  la collecte fonctionne quand même mais sans résumé IA ni glossaire.

Schémas associés : `NewsSource`, `NewsArticle`, `NewsGlossary`
(fichiers `backend/src/models/`).

### Application mobile (PWA) — `/frontend-mobile`

Une version mobile installable de la veille News vit dans
[`/frontend-mobile`](frontend-mobile/) (PWA React/Vite, dossier à déployer sur
Railway comme service dédié `grand-oral-studio-news-mobile`). Elle réutilise le
**même backend** : connexion avec les comptes utilisateur existants
(`POST /api/auth/login`) puis lecture de `GET /api/news`. Déployez-la avec
`VITE_API_URL` = URL du backend et **ajoutez son domaine à la variable
`FRONTEND_URL` du backend** (origines séparées par des virgules) pour le CORS.
Détails dans [frontend-mobile/README.md](frontend-mobile/README.md).

---

## Prérequis

- Node.js ≥ 18
- Une base MongoDB (locale, Docker, ou le plugin Railway)
- Une clé API **DeepSeek** (étapes 1 à 5) et une clé API **Anthropic** (étape 6 / support)

---

## Variables d'environnement

### Backend (`backend/.env.example` → `backend/.env`)

| Variable | Description |
| --- | --- |
| `MONGO_URL` | URI MongoDB (auto-fournie par Railway via le plugin ; renseignée en local) |
| `ANTHROPIC_API_KEY` | Clé API Anthropic — **étape 6 (support)** uniquement (jamais exposée au frontend) |
| `DEEPSEEK_API_KEY` | Clé API DeepSeek — **requise pour les étapes 1 à 5** + module News (filtrage thèmes + glossaire) |
| `DEEPSEEK_MODEL` | Modèle DeepSeek (défaut : `deepseek-v4-flash`, mode non-thinking) |
| `DEEPSEEK_MAX_TOKENS` | Budget de sortie par génération DeepSeek (défaut : `8192`) |
| `GOOGLE_SEARCH_API_KEY` | Clé API Google Custom Search — **requise pour la collecte News** |
| `GOOGLE_SEARCH_CX` | ID du moteur de recherche Programmable Google (cx) — **requis pour la collecte News** |
| `NEWS_GOOGLE_DATE_RESTRICT` | Fraîcheur des résultats Google (défaut : `d7` — ex. `d1`, `d3`) |
| `NEWS_CONTENT_MAX` | Longueur max du contenu stocké par article (lecture intégrée, défaut : `8000`) |
| `NEWS_AI_TEXT_LIMIT` | Caractères d'article envoyés à DeepSeek pour le jugement (défaut : `1600`) |
| `ANTHROPIC_MODEL` | Modèle Anthropic (défaut : `claude-sonnet-4-6`) |
| `ANTHROPIC_MAX_TOKENS` | Budget de sortie par génération Anthropic (défaut : `8192`) |
| `JWT_SECRET` | Secret de signature des JWT (auth utilisateur + admin) |
| `ADMIN_EMAIL` | E-mail du compte admin initial (défaut : `admin@grand-oral-studio.local`) |
| `ADMIN_PASSWORD` | Mot de passe du compte admin initial (créé au démarrage si absent) |
| `RESEND_API_KEY` | Clé API Resend — envoi des e-mails d'invitation |
| `RESEND_FROM` | Expéditeur vérifié Resend (défaut : `Grand Oral Studio <onboarding@resend.dev>`) |
| `PORT` | Port d'écoute (Railway la fournit automatiquement ; défaut local : 4000) |
| `FRONTEND_URL` | Origine(s) CORS autorisée(s) **et base des liens d'invitation** (domaine public du frontend) |
| `NEWS_CRON_ENABLED` | Active/désactive le cron quotidien News (défaut : `true`) |
| `NEWS_CRON_SCHEDULE` | Expression cron quotidienne (défaut : `30 6 * * *`, soit 06h30) |
| `NEWS_CRON_TZ` | Fuseau du cron (défaut : `Europe/Paris`) |
| `NEWS_MAX_PER_SOURCE` | Plafond d'articles nouveaux par source et par exécution (défaut : `10`) |
| `NEWS_MAX_PER_RUN` | Plafond total d'articles nouveaux par exécution (défaut : `50`) |

### Frontend (`frontend/.env.example` → `frontend/.env`)

| Variable | Description |
| --- | --- |
| `VITE_API_URL` | URL publique du backend (ex. `https://grand-oral-studio-backend.up.railway.app`). Vide en dev = proxy Vite vers `http://localhost:4000`. |

---

## Démarrage en local

### 1. MongoDB

Avec Docker :

```bash
docker run -d --name grand-oral-studio-mongo -p 27017:27017 mongo:7
```

Ou toute instance MongoDB accessible ; la seule exigence est la variable `MONGO_URL`.

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env        # puis renseignez MONGO_URL, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, DEEPSEEK_API_KEY, ANTHROPIC_API_KEY, RESEND_API_KEY
npm run seed                # insère méthodologie (copie du .md), schémas, thèmes — idempotent
npm run dev                 # http://localhost:4000  (health : /health)
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173  (appels /api proxysés vers :4000)
```

Le backend étant joignable via le proxy Vite, `VITE_API_URL` peut rester vide en dev.
Pour pointer vers un autre backend : renseignez `VITE_API_URL` dans `frontend/.env`.

### Administration

Au premier démarrage, le backend **crée le compte admin initial**
(`ADMIN_EMAIL` / `ADMIN_PASSWORD`). Connectez-vous sur `/login` avec ces
identifiants, puis ouvrez `/admin` pour inviter des utilisateurs (onglet
« Utilisateurs ») et éditer la méthodologie (contenu markdown, ordre, étapes
concernées), les descriptions des JSON de sortie (`StepSchema`) et les thèmes.

---

## Déploiement sur Railway

> Railway détecte automatiquement Node.js (Nixpacks). Le frontend construit `dist/`
> (`npm run build`) puis le sert via `npm start` (mini-serveur avec fallback SPA).

1. Créez un projet Railway vide.
2. **Base de données** : « + New » → « Database » → « MongoDB ». Notez le nom du
   service (ex. `MongoDB`), il sera référencé dans `MONGO_URL`.
3. **Backend** : « + New » → « GitHub Repo » → sélectionnez le repo, **Root Directory =
   `/backend`**, nommez le service **`grand-oral-studio-backend`**.
   - Onglet **Variables** :
     - `MONGO_URL` → référence auto `${{MongoDB.MONGO_URL}}` (proposée par Railway)
     - `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (compte admin initial, créé au démarrage)
     - `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` (défaut `deepseek-v4-flash`)
     - `ANTHROPIC_API_KEY` (ne pas supprimer — étape support)
     - `RESEND_API_KEY`, `RESEND_FROM` (expéditeur vérifié Resend)
     - `FRONTEND_URL` → l'URL publique du frontend (générée à l'étape 4) — sert aussi de base aux liens d'invitation
   - Onglet **Settings → Networking → Generate Domain** : notez l'URL
     (ex. `https://grand-oral-studio-backend.up.railway.app`).
4. **Frontend** : « + New » → « GitHub Repo » → même repo, **Root Directory =
   `/frontend`**, nommez le service **`grand-oral-studio-frontend`**.
   - Variable `VITE_API_URL` = URL publique du backend (étape 3).
   - Générez aussi son domaine public (Settings → Networking).
5. **Seed** (une seule fois, après le premier déploiement backend réussi) :

   ```bash
   # via le CLI Railway connecté au projet
   railway run node scripts/seed-methodology.js
   ```

   ou en local en pointant `MONGO_URL` vers la base Railway. Le script est idempotent.

6. Ouvrez le domaine du frontend : connectez-vous d'abord avec le compte admin
   initial (`ADMIN_EMAIL` / `ADMIN_PASSWORD`) sur `/login`, puis invitez vos
   utilisateurs depuis `/admin` (l'onglet « Utilisateurs » envoie les e-mails
   d'invitation Resend).

---

## Dépannage — production

Symptôme : « Impossible de joindre le serveur. Vérifiez votre connexion
(VITE_API_URL) ». Diagnostic pas à pas :

1. **`VITE_API_URL` est figée au build** : inlinée par Vite au moment du build,
   elle ne peut pas être modifiée à chaud. Ajoutez-la dans les variables du
   service `grand-oral-studio-frontend` (orthographe exacte en MAJUSCULES `VITE_API_URL`,
   valeur `https://…` **sans slash final**), **puis redéployez le service
   frontend** — sans redéploiement, le build continue d'utiliser l'ancienne valeur.
2. **Vérifiez que le backend répond** : ouvrez `https://grand-oral-studio-backend…/health`
   dans un navigateur — ou sa racine `/`, qui renvoie un JSON d'information
   (plus de « Cannot GET »).
3. **CORS** : définissez `FRONTEND_URL` côté backend = domaine **exact** du
   frontend (schéma `https`, sans chemin, sans slash final).
4. **Après chaque changement de variable, redéployez les services concernés.**

---

## API (résumé)

```
# Auth (publique)
POST   /api/auth/login                       # { email, password } → { token, user }
POST   /api/auth/accept-invite               # { token, password } → activation + connexion
GET    /api/auth/me                          # (auth) → utilisateur courant

# Thèmes (publique)
GET    /api/themes

# Sessions (auth requise — uniquement les sessions de l'utilisateur connecté)
POST   /api/sessions
GET    /api/sessions
GET    /api/sessions/:id
PATCH  /api/sessions/:id
DELETE /api/sessions/:id
POST   /api/sessions/:id/generate/:step      # analyse | probleme | recherche | glossaire | plan | support
GET    /api/sessions/:id/support-prompt      # .md complet à coller dans Claude (sans tokens API)
POST   /api/sessions/:id/import-support      # ré-importe le JSON de slides produit par Claude → .pptx
POST   /api/sessions/:id/export-pptx         # refuse (400) si glossaire absent ou support non généré

# Admin (rôle admin requis)
GET|POST|DELETE /api/admin/users[/:id]
POST            /api/admin/users/:id/resend-invite
GET|PUT|POST|DELETE /api/admin/methodology[/:id]
GET|PUT             /api/admin/step-schemas[/:id]
GET|POST|DELETE     /api/admin/themes[/:id]
GET|POST|PUT|DELETE /api/admin/news-sources[/:id]   # gestion des sources News
POST                /api/admin/news-sources/reset    # restaure les 10 sources par défaut
POST                /api/admin/news/run              # scraping manuel (collecte + glossaire)

# News (auth requise — tout utilisateur connecté)
GET    /api/news                       # articles récents + glossaire du jour
GET    /api/news/articles              # liste d'articles
GET    /api/news/glossaire             # historique des glossaires quotidiens
```

Toutes les routes `/api/sessions/*`, `/api/admin/*` et `/api/news*` exigent un
token JWT (`Authorization: Bearer …`) émis par `/api/auth/login` ou
`/api/auth/accept-invite` ; `/api/admin/*` est réservée au rôle `admin`,
`/api/news*` est ouverte à tout utilisateur connecté. Les
sessions renvoyées sont filtrées par propriétaire : un utilisateur ne voit que
les siennes.

---

## Notes techniques

- **Aucun secret en dur** : tout passe par les variables d'environnement.
- **CORS** limité aux origines de `FRONTEND_URL` (les origines Vite locales sont
  tolérées par défaut en dev si la variable est absente).
- **Appels d'IA** exclusivement côté backend (`/api/sessions/:id/generate/:step`) :
  DeepSeek (`deepseek-v4-flash`, non-thinking, `temperature: 1.0`, `top_p: 1.0`)
  pour les étapes 1 à 5, Anthropic Claude pour le support. Les réponses doivent
  être du JSON strict — les balises ```json``` résiduelles sont nettoyées, les
  réponses invalides renvoient une erreur explicite (jamais d'échec silencieux),
  avec gestion des timeouts et du solde DeepSeek insuffisant (402).
- **Génération .pptx** (`pptxgenjs`) : layout `LAYOUT_WIDE` défini avant l'ajout des
  slides, couleurs hex sans `#`, puces via l'option `bullet` (jamais de « • » littéral),
  objet d'options neuf à chaque `addText`.
- **Authentification** : mots de passe hachés en `scrypt` (aucune dépendance
  supplémentaire), JWT signé avec `JWT_SECRET`, invitations par e-mail (Resend) à
  lien unique expirant (48 h), sessions d'API privées par propriétaire (`owner`).
- Le seed insère **12 sections de méthodologie** (contenu copié du .md tel quel,
  section `glossaire` rédigée à partir du principe `principe_glossaire_sources`),
  **6 StepSchema** (dont `glossaire` et le champ `ligne_directrice` obligatoire sur
  `probleme`) et **5 thèmes** CESI — tous modifiables ensuite dans `/admin`.
