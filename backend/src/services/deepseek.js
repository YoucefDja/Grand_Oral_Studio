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

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function generateDeepseek(promptSystem, promptUser) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw httpError(500, 'DEEPSEEK_API_KEY n’est pas configurée côté backend.');
  }
  if (!promptSystem || !promptUser) {
    throw httpError(500, 'Prompt système ou utilisateur vide — génération impossible.');
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
        temperature: 1.0,
        top_p: 1.0,
        // Thinking explicitement désactivé : sur les modèles V4 le mode thinking
        // est ACTIVÉ PAR DÉFAUT, l'omettre ne suffit donc pas (jamais deepseek-reasoner).
        thinking: { type: 'disabled' },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw httpError(504, 'Délai dépassé lors de l’appel à l’API DeepSeek. Réessayez.');
    }
    throw httpError(502, `Erreur réseau vers l’API DeepSeek : ${err.message}`);
  }

  if (!response.ok) {
    if (response.status === 402) {
      throw httpError(
        402,
        'Solde DeepSeek insuffisant — vérifiez votre compte platform.deepseek.com.'
      );
    }
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.error?.message || JSON.stringify(body);
    } catch (_e) {
      detail = response.statusText;
    }
    throw httpError(
      response.status === 401 || response.status === 403 ? 502 : response.status,
      `L’API DeepSeek a renvoyé une erreur (${response.status}) : ${detail}`
    );
  }

  const data = await response.json();
  const choice = Array.isArray(data.choices) ? data.choices[0] : undefined;
  const content = choice?.message?.content;

  if (typeof content !== 'string' || !content.trim()) {
    throw httpError(502, 'Réponse DeepSeek vide ou inattendue.');
  }
  if (choice.finish_reason === 'length') {
    throw httpError(
      502,
      'La réponse DeepSeek a été tronquée (budget de sortie atteint). ' +
        'Augmentez DEEPSEEK_MAX_TOKENS côté backend (valeur actuelle : ' +
        MAX_TOKENS + ') puis réessayez.'
    );
  }

  return content; // texte brut — le parse JSON est fait par l'appelant
}

module.exports = { generateDeepseek };
