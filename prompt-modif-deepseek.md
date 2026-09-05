# Prompt de modification à coller dans l'IDE — routage DeepSeek / Claude

## Contexte

Le projet "Tension" existe déjà (backend Express + MongoDB, frontend React,
déployés sur Railway). Modifie le backend pour que les modèles d'IA utilisés
diffèrent selon l'étape :

- **Étapes 1 à 5** (`analyse`, `probleme`, `recherche`, `glossaire`, `plan`) :
  utilisent désormais l'**API DeepSeek**, modèle `deepseek-v4-flash`, en mode
  **non-thinking** (ne pas envoyer de paramètre `thinking`, ou l'envoyer
  explicitement à `{"type": "disabled"}` si l'API l'exige — ne jamais utiliser
  l'alias `deepseek-reasoner` ni activer le raisonnement).
- **Étape 6** (`support`) : continue d'utiliser l'**API Anthropic**, modèle
  Claude, exactement comme avant — Claude génère le JSON des slides (titres,
  puces, notes orateur), puis le backend construit le fichier `.pptx` avec
  `pptxgenjs` comme déjà implémenté. Aucun changement sur cette étape.

## Ce qu'il faut modifier

### 1. Nouveau service `backend/src/services/deepseek.js`

Crée ce fichier sur le modèle de `backend/src/services/anthropic.js` existant,
mais pour l'API DeepSeek :

- Endpoint : `https://api.deepseek.com/v1/chat/completions` (format
  OpenAI-compatible : `POST`, body `{ model, messages, max_tokens,
  temperature }` — pas de champ `system` séparé comme chez Anthropic, le
  prompt système doit être passé comme premier message avec `role: "system"`
  dans le tableau `messages`).
- Clé API : `process.env.DEEPSEEK_API_KEY`, envoyée en header
  `Authorization: Bearer ${DEEPSEEK_API_KEY}`.
- Modèle : `process.env.DEEPSEEK_MODEL` avec `deepseek-v4-flash` comme valeur
  par défaut si la variable n'est pas définie.
- Respecte les recommandations DeepSeek : `temperature: 1.0`, `top_p: 1.0`
  (valeurs recommandées par DeepSeek pour ce modèle).
- Ne jamais activer le mode thinking. Ne jamais utiliser `deepseek-reasoner`.
- Même contrat de sortie que le service Anthropic existant : la fonction doit
  retourner le texte brut de la réponse, à charge de l'appelant de le parser
  en JSON (retirer les éventuelles balises ```json``` résiduelles avant
  parsing, comme c'est déjà fait pour Anthropic).
- Gestion d'erreur identique au service Anthropic : timeout, erreur réseau,
  clé manquante ou invalide → toujours une erreur explicite remontée à
  l'appelant, jamais un échec silencieux. Si l'API DeepSeek renvoie un code
  402 (solde insuffisant), remonte un message clair du type "Solde DeepSeek
  insuffisant — vérifier le compte platform.deepseek.com".

### 2. Modifier le routeur d'appel dans `backend/src/routes/sessions.js`
(ou le service qui gère `POST /api/sessions/:id/generate/:step`)

Ajoute une logique de sélection du provider selon le `step` :

```js
const DEEPSEEK_STEPS = ['analyse', 'probleme', 'recherche', 'glossaire', 'plan'];
const CLAUDE_STEPS = ['support'];

function getProviderForStep(step) {
  if (DEEPSEEK_STEPS.includes(step)) return 'deepseek';
  if (CLAUDE_STEPS.includes(step)) return 'claude';
  throw new Error(`Étape inconnue : ${step}`);
}
```

Dans le handler de génération, utilise cette fonction pour appeler soit
`deepseekService.generate(...)`, soit `anthropicService.generate(...)`, en
gardant strictement la même logique d'assemblage du prompt système
(méthodologie + ligne directrice + glossaire si pertinent + schéma JSON de
l'étape) — seul le provider d'appel change, pas la construction du prompt.

### 3. Variables d'environnement à ajouter

Dans `backend/.env.example`, ajoute :

```
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash
```

Documente dans le README que `ANTHROPIC_API_KEY` reste nécessaire (utilisée
uniquement pour l'étape 6/support), et que `DEEPSEEK_API_KEY` est désormais
requise pour les étapes 1 à 5.

### 4. Dépendances

Si le projet utilise déjà un client HTTP générique (`fetch` natif, `axios`),
réutilise-le pour DeepSeek plutôt que d'ajouter une nouvelle dépendance.
DeepSeek n'a pas besoin de SDK dédié : un simple appel HTTP POST au format
OpenAI-compatible suffit.

## Ce qu'il ne faut PAS changer

- La logique d'assemblage du prompt système (méthodologie, ligne directrice,
  glossaire, schéma JSON par étape) reste strictement identique, quel que soit
  le provider.
- L'étape 6 (support) et la génération du `.pptx` via `pptxgenjs` restent
  inchangées, toujours sur Claude.
- Les modèles Mongoose (`Session`, `MethodologySection`, `StepSchema`,
  `Theme`) ne changent pas.
- Le blocage de l'export pptx si `session.data.glossaire` est vide reste en
  vigueur.

## Variable Railway à ajouter après ce changement

Sur le service `tension-backend` dans Railway, Settings → Variables :

```
DEEPSEEK_API_KEY=<ta clé depuis platform.deepseek.com>
DEEPSEEK_MODEL=deepseek-v4-flash
```

`ANTHROPIC_API_KEY` reste également nécessaire, ne pas la supprimer.
