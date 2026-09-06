# Prompt à coller dans l'IDE — plateforme "Grand Oral Studio" (Grand Oral CESI)

## Contexte du repo

Le repo GitHub est actuellement **vierge** : il ne contient qu'un `README.md`.
Tu dois **initialiser l'intégralité du projet depuis zéro** — aucune structure,
aucun fichier de config, aucune dépendance n'existe encore. Ne suppose aucun
code préexistant. Crée toute l'arborescence, tous les fichiers de config
(`package.json`, `.gitignore`, `Dockerfile` ou config Nixpacks, `.env.example`),
et un README final complet expliquant comment lancer le projet en local et le
déployer sur Railway.

## Objectif produit

Construis **Grand Oral Studio**, un assistant de préparation au Grand Oral pour les
étudiants du CESI École d'Ingénieurs. L'application guide l'étudiant à travers
6 étapes séquentielles :

1. Analyse du sujet
2. Problématique
3. Recherche documentaire
4. **Glossaire & résumé des sources** (nouvelle étape intermédiaire — voir
   plus bas, obligatoire avant le plan)
5. Plan détaillé
6. Support de présentation (génération finale du .pptx)

Chaque étape applique une méthodologie pédagogique stricte, stockée en base de
données et modifiable via un panneau admin — jamais codée en dur dans le
frontend ou le backend.

**Deux exigences transversales, non négociables, qui doivent être respectées à
CHAQUE étape et pas seulement citées une fois :**

- **Ligne directrice** : la présentation ne doit jamais être un enchaînement de
  parties indépendantes. Un fil conducteur, dérivé de la problématique, doit
  être formulé explicitement dès l'étape "problématique", puis rappelé et
  renforcé à chaque étape suivante (recherche, glossaire, plan, support). Le
  backend doit systématiquement réinjecter la ligne directrice déjà établie
  dans le prompt des étapes suivantes, pour que chaque génération s'y
  rattache au lieu de produire du contenu isolé.
- **Glossaire obligatoire avant le pptx** : l'étudiant doit voir, avant toute
  génération de slides, un résumé de chaque source retenue (2-3 phrases : ce
  qu'elle dit, pourquoi elle est pertinente, quelle donnée concrète elle
  apporte) et un glossaire de tous les acronymes/termes techniques qui seront
  utilisés dans la présentation, avec définition en langage clair. L'étudiant
  doit pouvoir relire, corriger et régénérer ce glossaire avant de passer à
  l'étape suivante. Le glossaire validé doit ensuite être réinjecté dans le
  prompt de génération du support, avec la consigne stricte qu'aucun acronyme
  hors glossaire ne doit apparaître sur les slides.

## Structure du repo à créer

```
/frontend                    → app React (Vite), service Railway "grand-oral-studio-frontend"
  /src
  package.json
  vite.config.js
  .env.example
/backend                     → API Node.js/Express, service Railway "grand-oral-studio-backend"
  /src
    /models
    /routes
    /middleware
    /services
  /scripts
    seed-methodology.js
  package.json
  .env.example
README.md
.gitignore
```

Chaque dossier (`/frontend`, `/backend`) a son propre `package.json` et sa
propre config de déploiement, car ce sont deux services Railway distincts
pointant chacun sur leur sous-dossier (Root Directory différent par service).

## Backend — Node.js + Express + MongoDB (Mongoose)

### Connexion base

Utilise la variable d'environnement `MONGO_URL` (fournie automatiquement par
Railway quand le plugin MongoDB est lié au service backend). Ne jamais
hardcoder d'URL de connexion. Prévoir une gestion d'erreur claire si la
connexion échoue au démarrage (log explicite, exit propre).

### Modèles Mongoose

**`MethodologySection`** :
```js
{
  sectionId: String,   // slug unique, ex: "principe_directeur_problematique"
  title: String,       // titre lisible pour l'admin
  content: String,     // texte markdown de la section
  order: Number,       // ordre d'assemblage dans le prompt
  appliesToSteps: [String], // ex: ["analyse", "probleme"] ou ["all"]
  updatedAt: Date
}
```

**`StepSchema`** :
```js
{
  stepKey: String,     // "analyse" | "probleme" | "recherche" | "glossaire" | "plan" | "support"
  jsonSchemaDescription: String,
  updatedAt: Date
}
```

**`Theme`** : `{ label: String, order: Number }`

**`Session`** :
```js
{
  titre: String,
  theme: String,
  contexte: String,
  currentStep: Number,   // 0 à 6
  ligneDirectrice: String,  // formulée à l'étape "probleme", réutilisée ensuite
  data: {
    analyse: Object,
    probleme: Object,
    recherche: Object,
    glossaire: Object,   // { sources: [{titre, resume}], termes: [{terme, definition}] }
    plan: Object,
    support: Object
  },
  createdAt: Date,
  updatedAt: Date
}
```

Pas de modèle Utilisateur — l'app est mono-utilisateur côté étudiant (pas
d'auth pour créer/consulter des sessions). Seul le panneau admin est protégé.

### Routes API

```
GET    /api/themes
POST   /api/sessions
GET    /api/sessions
GET    /api/sessions/:id
PATCH  /api/sessions/:id
DELETE /api/sessions/:id

POST   /api/sessions/:id/generate/:step
  // step = analyse | probleme | recherche | glossaire | plan | support
  // 1. Charge les MethodologySection dont appliesToSteps contient "all" ou
  //    le step demandé, triées par `order`, et les concatène en prompt système
  // 2. Si session.ligneDirectrice existe, l'injecte explicitement dans le
  //    prompt système ("Ligne directrice déjà établie pour cette
  //    présentation : ...") pour tous les steps à partir de "recherche"
  // 3. Si step === "support", injecte aussi obligatoirement le contenu de
  //    session.data.glossaire dans le prompt système, avec la consigne stricte
  //    de n'utiliser aucun acronyme absent de ce glossaire
  // 4. Charge le StepSchema du step, l'ajoute au prompt système
  // 5. Construit le prompt utilisateur à partir de session.data existant
  // 6. Appelle l'API Anthropic (voir section dédiée)
  // 7. Parse la réponse JSON, la sauvegarde dans session.data[step]
  // 8. Si step === "probleme", extrait et sauvegarde aussi
  //    session.ligneDirectrice depuis la réponse (le schéma JSON de l'étape
  //    "probleme" doit inclure un champ ligne_directrice — voir StepSchema)
  // 9. Avance session.currentStep, renvoie la session à jour

POST   /api/sessions/:id/export-pptx
  // bloque avec une erreur 400 explicite si session.data.glossaire est vide
  // ou absent — le pptx ne doit jamais être généré sans glossaire validé
  // sinon: génère le .pptx avec pptxgenjs (voir section dédiée)

# Admin (protégé par JWT)
POST   /api/admin/login
GET    /api/admin/methodology
PUT    /api/admin/methodology/:id
POST   /api/admin/methodology
DELETE /api/admin/methodology/:id
GET    /api/admin/step-schemas
PUT    /api/admin/step-schemas/:id
GET    /api/admin/themes
POST   /api/admin/themes
DELETE /api/admin/themes/:id
```

Middleware `requireAdminAuth` : vérifie un JWT signé avec `JWT_SECRET` (env
var), émis par `/api/admin/login` si le mot de passe fourni correspond à
`ADMIN_PASSWORD` (env var). Un seul mot de passe admin partagé, pas de
gestion multi-utilisateurs.

### Appel à l'API Anthropic

Service dédié `backend/src/services/anthropic.js`. Utilise la clé
`ANTHROPIC_API_KEY` (jamais exposée au frontend). Modèle `claude-sonnet-4-6`.
`max_tokens: 4000`. La réponse doit être un JSON strict — retirer d'éventuelles
balises ```json``` résiduelles avant de parser. Si le parsing échoue, renvoyer
une erreur 502 explicite plutôt que de sauvegarder du contenu invalide.
Gérer les timeouts et erreurs réseau proprement (jamais d'échec silencieux).

### Génération pptx

`backend/src/services/pptx.js`, utilise `pptxgenjs`. Construit un pptx sobre
bleu/blanc (palette CESI), une slide de titre (incluant la ligne directrice),
une slide par item de `session.data.support.slides`, notes orateur via
`slide.addNotes(...)`, une slide de conclusion qui rappelle la ligne
directrice. Pièges pptxgenjs à éviter : définir `pres.layout` avant d'ajouter
des slides ; couleurs hex sans `#` et sans canal alpha ; `bullet: true` au lieu
d'un `•` littéral ; un objet d'options frais par `addText` (jamais réutilisé
d'un appel à l'autre, la lib le mute en place). Renvoie le fichier en
`Content-Disposition: attachment`.

### Seed de la méthodologie

`backend/scripts/seed-methodology.js`, exécutable via `node
scripts/seed-methodology.js`. Insère en base une `MethodologySection` par
section du fichier `methodologie-grand-oral.md` fourni séparément (copie le
contenu de chaque `## SECTION` tel quel, sans reformuler), avec ces
`sectionId` / `order` / `appliesToSteps` :

- `role_et_objectif` — order 1, `["all"]`
- `principe_directeur_problematique` — order 2, `["all"]`
- `garde_fous_anti_derive` — order 3, `["all"]`
- `principe_ligne_directrice` — order 4, `["probleme", "recherche", "glossaire", "plan", "support"]`
- `principe_glossaire_sources` — order 5, `["recherche", "glossaire", "support"]`
- `etape_1_analyse_sujet` — order 10, `["analyse"]`
- `etape_2_problematique` — order 10, `["probleme"]`
- `etape_3_recherche_documentaire` — order 10, `["recherche"]`
- `etape_4_glossaire` — order 10, `["glossaire"]` (nouvelle section à rédiger
  au moment du seed si elle n'existe pas déjà dans le fichier de méthodo,
  reprenant le contenu de `principe_glossaire_sources` appliqué concrètement :
  produire la liste des résumés de sources et le glossaire de termes)
- `etape_5_plan_detaille` — order 10, `["plan"]` (anciennement etape_4)
- `etape_6_support_visuel` — order 10, `["support"]` (anciennement etape_5)
- `garde_fou_sujets_academiques` — order 20, `["all"]`

Seed aussi les `StepSchema` (un par step, y compris `glossaire`, avec un
schéma du type `{ sources: [{titre, resume}], termes: [{terme, definition}]
}`), et le `StepSchema` de `probleme` doit explicitement inclure un champ
`ligne_directrice: string` dans son schéma JSON attendu — c'est la phrase qui
sera propagée à toutes les étapes suivantes.

Seed les 5 thèmes fournis par l'étudiant (à lister au moment de
l'implémentation — placeholder à remplacer).

## Frontend — React (Vite)

Construis l'app depuis zéro (le repo est vierge). Architecture par composants,
un composant par étape (`StepAnalyse`, `StepProbleme`, `StepRecherche`,
`StepGlossaire`, `StepPlan`, `StepSupport`), un tracker d'étapes en haut de
page (6 étapes désormais, pas 5), une liste de sessions avec création/suppression.

Tous les appels passent par le backend via `fetch` sur `VITE_API_URL` (jamais
d'appel direct à l'API Anthropic depuis le navigateur).

`StepGlossaire` doit afficher clairement : la liste des sources avec leur
résumé, la liste des termes/acronymes avec leur définition, un bouton
"Régénérer", et un bouton "Valider et passer au plan" qui n'avance que si le
glossaire n'est pas vide.

`StepSupport` doit afficher, avant le bouton de génération du .pptx, un rappel
visible de la ligne directrice et un lien pour revoir le glossaire validé.

Page `/admin` (protégée par formulaire de mot de passe → `/api/admin/login`,
JWT stocké en mémoire ou sessionStorage, attaché en `Authorization: Bearer
...`) avec CRUD sur `MethodologySection`, `StepSchema`, `Theme`.

## Variables d'environnement

Backend (`.env.example`) :
```
MONGO_URL=
ANTHROPIC_API_KEY=
JWT_SECRET=
ADMIN_PASSWORD=
PORT=
FRONTEND_URL=
```

Frontend (`.env.example`) :
```
VITE_API_URL=
```

## Déploiement Railway — à documenter dans le README final

1. Créer un projet Railway.
2. "+ New" → "Database" → "Add MongoDB".
3. "+ New" → "GitHub Repo" → sélectionner le repo, Root Directory = `/backend`,
   nommer le service `grand-oral-studio-backend`. Variables : lier `MONGO_URL` au plugin
   MongoDB (référence `${{MongoDB.MONGO_URL}}`), ajouter les autres variables.
   Générer un domaine public (Settings → Networking → Generate Domain).
4. "+ New" → "GitHub Repo" → même repo, Root Directory = `/frontend`, nommer
   `grand-oral-studio-frontend`. Variable `VITE_API_URL` = domaine public du backend
   généré à l'étape précédente. Générer aussi son propre domaine public.
5. Après le premier déploiement backend réussi, exécuter le seed une fois
   (`railway run node scripts/seed-methodology.js` depuis le CLI Railway).

## Consignes générales de code

- Aucun secret en dur, tout en variables d'environnement.
- CORS backend limité à `FRONTEND_URL`.
- Toutes les routes `/api/admin/*` protégées par le middleware JWT.
- Gestion d'erreurs explicite partout (API Anthropic, parsing JSON, MongoDB) —
  jamais d'échec silencieux, toujours un message clair renvoyé au frontend.
- Le frontend affiche un état de chargement pendant chaque génération et un
  message d'erreur clair en cas d'échec.
- Le endpoint d'export pptx doit littéralement refuser de générer si le
  glossaire est absent — c'est une règle produit, pas une simple suggestion.
