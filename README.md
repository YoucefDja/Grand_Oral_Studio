# Grand Oral Studio — « Tension »

Assistant de préparation au **Grand Oral CESI** : il guide l'étudiant ingénieur à
travers **6 étapes méthodologiques** — analyse du sujet, problématique, recherche
documentaire, **glossaire & résumés de sources**, plan détaillé, support de
présentation — jusqu'à l'export d'un **.pptx** sobre aux couleurs CESI.

La méthodologie, les schémas JSON de sortie et les thèmes sont **stockés en base
de données** et modifiables via un **panneau admin** (page `/admin`) : rien n'est
codé en dur dans le frontend ni le backend.

> Le contenu exact des sections de méthodologie est extrait de
> [`methodologie-grand-oral.md`](methodologie-grand-oral.md) (fichier métier
> fourni séparément) — copié **tel quel** dans la base par le script de seed,
> jamais reformulé.

---

## Architecture

L'application est découpée en **3 services Railway** :

| Service | Dossier | Techno | Rôle |
| --- | --- | --- | --- |
| `tension-backend` | `/backend` | Node.js + Express + MongoDB (Mongoose) | API, génération Anthropic, export .pptx, admin JWT |
| `tension-frontend` | `/frontend` | React (Vite) — build statique servi par un mini-serveur SPA | Interface étudiant + page `/admin` |
| MongoDB | plugin Railway | MongoDB managé | Base de données |

```
.
├── /backend                  # Service Railway "tension-backend"
│   ├── /scripts
│   │   └── seed-methodology.js   # Seed idempotent (méthodologie + schémas + thèmes)
│   ├── /src
│   │   ├── /middleware           # requireAdminAuth (JWT)
│   │   ├── /models               # MethodologySection, StepSchema, Theme, Session
│   │   ├── /routes               # themes, sessions, admin
│   │   ├── /services             # promptBuilder, anthropic, pptx
│   │   ├── db.js
│   │   └── index.js
│   ├── methodology-content.json  # Contenu des sections extrait du .md (seed)
│   ├── package.json
│   └── .env.example
├── /frontend                  # Service Railway "tension-frontend"
│   ├── /src                    # React (Vite) : pages, composants par étape
│   ├── index.html
│   ├── static-server.js        # sert dist/ avec fallback SPA (deep links /admin)
│   ├── package.json
│   └── .env.example
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
| `DEEPSEEK_API_KEY` | Clé API DeepSeek — **requise pour les étapes 1 à 5** |
| `DEEPSEEK_MODEL` | Modèle DeepSeek (défaut : `deepseek-v4-flash`, mode non-thinking) |
| `ANTHROPIC_MODEL` | Modèle Anthropic (défaut : `claude-sonnet-4-6`) |
| `JWT_SECRET` | Secret de signature des JWT admin |
| `ADMIN_PASSWORD` | Mot de passe admin unique du panneau `/admin` |
| `PORT` | Port d'écoute (Railway la fournit automatiquement ; défaut local : 4000) |
| `FRONTEND_URL` | Origine(s) CORS autorisée(s), séparées par des virgules |

### Frontend (`frontend/.env.example` → `frontend/.env`)

| Variable | Description |
| --- | --- |
| `VITE_API_URL` | URL publique du backend (ex. `https://tension-backend.up.railway.app`). Vide en dev = proxy Vite vers `http://localhost:4000`. |

---

## Démarrage en local

### 1. MongoDB

Avec Docker :

```bash
docker run -d --name tension-mongo -p 27017:27017 mongo:7
```

Ou toute instance MongoDB accessible ; la seule exigence est la variable `MONGO_URL`.

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env        # puis renseignez MONGO_URL, DEEPSEEK_API_KEY, ANTHROPIC_API_KEY, JWT_SECRET, ADMIN_PASSWORD
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

Rendez-vous sur `/admin`, saisissez `ADMIN_PASSWORD` : vous pouvez alors éditer
les sections de méthodologie (contenu markdown, ordre, étapes concernées), les
descriptions des JSON de sortie (`StepSchema`) et les thèmes.

---

## Déploiement sur Railway

> Railway détecte automatiquement Node.js (Nixpacks). Le frontend construit `dist/`
> (`npm run build`) puis le sert via `npm start` (mini-serveur avec fallback SPA).

1. Créez un projet Railway vide.
2. **Base de données** : « + New » → « Database » → « MongoDB ». Notez le nom du
   service (ex. `MongoDB`), il sera référencé dans `MONGO_URL`.
3. **Backend** : « + New » → « GitHub Repo » → sélectionnez le repo, **Root Directory =
   `/backend`**, nommez le service **`tension-backend`**.
   - Onglet **Variables** :
     - `MONGO_URL` → référence auto `${{MongoDB.MONGO_URL}}` (proposée par Railway)
     - `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` (défaut `deepseek-v4-flash`)
     - `ANTHROPIC_API_KEY` (ne pas supprimer — étape support)
     - `JWT_SECRET`, `ADMIN_PASSWORD`
     - `FRONTEND_URL` → l'URL publique du frontend (générée à l'étape 4)
   - Onglet **Settings → Networking → Generate Domain** : notez l'URL
     (ex. `https://tension-backend.up.railway.app`).
4. **Frontend** : « + New » → « GitHub Repo » → même repo, **Root Directory =
   `/frontend`**, nommez le service **`tension-frontend`**.
   - Variable `VITE_API_URL` = URL publique du backend (étape 3).
   - Générez aussi son domaine public (Settings → Networking).
5. **Seed** (une seule fois, après le premier déploiement backend réussi) :

   ```bash
   # via le CLI Railway connecté au projet
   railway run node scripts/seed-methodology.js
   ```

   ou en local en pointant `MONGO_URL` vers la base Railway. Le script est idempotent.

6. Ouvrez le domaine du frontend : le parcours étudiant est sur `/`, l'admin sur `/admin`.

---

## API (résumé)

```
GET    /api/themes
POST   /api/sessions
GET    /api/sessions
GET    /api/sessions/:id
PATCH  /api/sessions/:id
DELETE /api/sessions/:id
POST   /api/sessions/:id/generate/:step     # analyse | probleme | recherche | glossaire | plan | support
POST   /api/sessions/:id/export-pptx        # refuse (400) si glossaire absent ou support non généré

POST   /api/admin/login                     # { password } → { token }
GET|PUT|POST|DELETE /api/admin/methodology[/:id]
GET|PUT             /api/admin/step-schemas[/:id]
GET|POST|DELETE     /api/admin/themes[/:id]
```

Les routes `/api/admin/*` (hors login) sont protégées par un JWT émis par
`/api/admin/login` (validation du mot de passe contre `ADMIN_PASSWORD`).

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
- Le seed insère **12 sections de méthodologie** (contenu copié du .md tel quel,
  section `glossaire` rédigée à partir du principe `principe_glossaire_sources`),
  **6 StepSchema** (dont `glossaire` et le champ `ligne_directrice` obligatoire sur
  `probleme`) et **5 thèmes** CESI — tous modifiables ensuite dans `/admin`.
