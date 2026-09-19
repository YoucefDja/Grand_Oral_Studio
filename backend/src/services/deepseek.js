/**
 * Appel à l'API DeepSeek (format OpenAI-compatible) pour les étapes 1 à 5.
 *
 * Caractéristiques :
 *  - endpoint https://api.deepseek.com/v1/chat/completions ;
 *  - le prompt système est passé comme premier message { role: "system" } ;
 *  - modèle par défaut `deepseek-v4-flash`, surchargé par DEEPSEEK_MODEL ;
 *  - temperature: 1.0 et top_p: 1.0 (valeurs recommandées DeepSeek) ;
 *  - mode thinking explicitement DÉSACTIVÉ via `{"thinking": {"type": "disabled"}}`
 *    (sur les modèles V4 le thinking est activé PAR DÉFAUT : l'omettre ne suffit
 *    pas) — alias `deepseek-reasoner` jamais utilisé ;
 *  - retourne le TEXTE BRUT de la réponse : c'est l'appelant qui le parse en
 *    JSON (via parseJsonStrict, qui retire les éventuelles balises ```json```).
 *
 * Gestion d'erreur explicite (timeout, réseau, clé manquante, HTTP 402…) :
 * jamais d'échec silencieux.
 */

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
// Budget de sortie configurable (env DEEPSEEK_MAX_TOKENS), 8192 par défaut —
// les réponses JSON des étapes 1-5 (analyse, glossaire…) dépassent 4000 tokens.
const MAX_TOKENS = parseInt(process.env.DEEPSEEK_MAX_TOKENS || '8192', 10) || 8192;
const TIMEOUT_MS = 120000;

/**
 * Erreur HTTP portant un STATUT et un CODE APPLICATIF stable.
 * `code` est ce que le frontend mappe ; `detailTechnique` reste dans les logs.
 */
function httpError(status, message, code, detailTechnique) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  if (detailTechnique) err.detailTechnique = detailTechnique;
  return err;
}

/**
 * @param {string} promptSystem
 * @param {string} promptUser
 * @param {{temperature?: number, jsonObject?: boolean}} [options]
 *   `jsonObject: true` force le mode JSON de l'API (response_format), utilisé
 *   par la Passe A : le modèle ne peut plus encadrer sa réponse de prose.
 */
async function generateDeepseek(promptSystem, promptUser, options = {}) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw httpError(
      503,
      'Le service de génération est temporairement indisponible. Réessayez dans quelques instants.',
      'AI_PROVIDER_UNAVAILABLE',
      'DEEPSEEK_API_KEY absente de la configuration backend'
    );
  }
  if (!promptSystem || !promptUser) {
    throw httpError(500, 'Prompt système ou utilisateur vide — génération impossible.', 'AI_PROMPT_EMPTY');
  }

  const model = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';

  let response;
  try {
    response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: promptSystem },
          { role: 'user', content: promptUser },
        ],
        max_tokens: MAX_TOKENS,
        // Température basse en mode JSON strict (Passe A) : on veut un contrat
        // reproductible, pas une variation créative à chaque tentative.
        temperature: Number.isFinite(options.temperature) ? options.temperature : 1.0,
        top_p: 1.0,
        // Thinking explicitement désactivé : sur les modèles V4 le mode thinking
        // est ACTIVÉ PAR DÉFAUT, l'omettre ne suffit donc pas (jamais deepseek-reasoner).
        thinking: { type: 'disabled' },
        ...(options.jsonObject ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw httpError(
        504,
        'Délai dépassé lors de l’appel à l’API DeepSeek. Réessayez.',
        'AI_TIMEOUT'
      );
    }
    // Réseau injoignable / DNS / connexion coupée : indisponibilité fournisseur,
    // jamais un 502 qui serait renvoyé tel quel par le proxy.
    throw httpError(
      503,
      'Le service de génération est temporairement indisponible. Réessayez dans quelques instants.',
      'AI_PROVIDER_UNAVAILABLE',
      `erreur réseau vers l’API DeepSeek : ${err.message}`
    );
  }

  if (!response.ok) {
    // 429 / 5xx = fournisseur indisponible ou saturé → 503 (jamais 502 : le
    // proxy le renverrait tel quel au navigateur sans code applicatif).
    const statut = response.status >= 500 || response.status === 429 ? 503 : response.status;
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.error?.message || JSON.stringify(body);
    } catch (_e) {
      detail = response.statusText;
    }
    if (statut === 503) {
      throw httpError(
        503,
        'Le service de génération est temporairement indisponible. Réessayez dans quelques instants.',
        'AI_PROVIDER_UNAVAILABLE',
        `HTTP ${response.status} renvoyé par l’API DeepSeek : ${detail}`
      );
    }
    const code = response.status === 402 ? 'AI_QUOTA_EXCEEDED' : 'AI_PROVIDER_ERROR';
    throw httpError(response.status, `L’API DeepSeek a renvoyé une erreur (${response.status}).`, code, detail);
  }

  const data = await response.json();
  const choice = Array.isArray(data.choices) ? data.choices[0] : undefined;
  const content = choice?.message?.content;

  if (typeof content !== 'string' || !content.trim()) {
    throw httpError(
      503,
      'Le service de génération est temporairement indisponible. Réessayez dans quelques instants.',
      'AI_PROVIDER_UNAVAILABLE',
      'réponse DeepSeek vide ou sans contenu exploitable'
    );
  }
  if (choice.finish_reason === 'length') {
    // Troncature : ce n'est ni une panne fournisseur ni un JSON invalide côté
    // modèle, mais un budget de sortie insuffisant — erreur de configuration.
    throw httpError(
      500,
      'La génération a été interrompue (budget de sortie atteint). Réessayez.',
      'AI_OUTPUT_TRUNCATED',
      'DeepSeek finish_reason=length — augmentez DEEPSEEK_MAX_TOKENS (valeur actuelle : ' +
        MAX_TOKENS +
        ')'
    );
  }

  return content; // texte brut — le parse JSON est fait par l'appelant
}

module.exports = { generateDeepseek };
