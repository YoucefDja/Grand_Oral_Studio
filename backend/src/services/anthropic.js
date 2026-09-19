/**
 * Appel à l'API Anthropic. La clé (ANTHROPIC_API_KEY) ne vit que côté serveur.
 * La réponse attendue est un objet JSON strict ; toute réponse non parsable
 * déclenche une erreur explicite (jamais d'échec silencieux).
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
// Budget de sortie configurable (env ANTHROPIC_MAX_TOKENS), 8192 par défaut.
const MAX_TOKENS = parseInt(process.env.ANTHROPIC_MAX_TOKENS || '8192', 10) || 8192;
const TIMEOUT_MS = 120000;

/**
 * Erreur portant un statut HTTP, un code applicatif optionnel et un détail
 * technique (journalisé côté serveur, jamais renvoyé au client).
 */
function httpError(status, message, code, detailTechnique) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  if (detailTechnique) err.detailTechnique = detailTechnique;
  return err;
}

/** Retire les éventuelles balises ```json``` résiduelles avant parsing. */
function cleanRaw(raw) {
  let text = String(raw || '').trim();
  if (/^```/i.test(text)) {
    text = text.replace(/^```[a-zA-Z]*\s*/i, '').replace(/```\s*$/i, '');
  }
  return text;
}

function parseJsonStrict(raw) {
  const cleaned = cleanRaw(raw);
  try {
    const parsed = JSON.parse(cleaned);
    return parsed;
  } catch (_e) {
    // Tentative de secours : isoler le premier objet JSON complet { ... }
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch (_e2) {
        /* on retombe sur l'erreur explicite ci-dessous */
      }
    }
    const extrait = cleaned.slice(0, 200).replace(/\n/g, ' ');
    // Le contenu illisible n'est JAMAIS renvoyé au client (il part uniquement
    // dans les logs) et l'erreur reste contrôlée : 422, jamais un 502.
    throw httpError(
      422,
      'La réponse de l’IA n’est pas un JSON valide. Réessayez.',
      'INVALID_LLM_JSON',
      `extrait : "${extrait}..."` 
    );
  }
}

async function generateAnthropic(promptSystem, promptUser) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw httpError(500, 'ANTHROPIC_API_KEY n’est pas configurée côté backend.');
  }
  if (!promptSystem || !promptUser) {
    throw httpError(500, 'Prompt système ou utilisateur vide — génération impossible.');
  }

  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

  // Claude Sonnet 5 (et les modèles Claude 5 / Opus 4.7+) rejettent tout paramètre
  // d'échantillonnage non-défaut (temperature/top_p → 400). On n'envoie donc
  // temperature que sur les modèles qui l'acceptent (4.6 et antérieurs) ; pour
  // les autres, l'API applique sa valeur par défaut.
  const ACCEPTE_TEMPERATURE = !/claude-(?:sonnet|opus|fable|mythos)-5|claude-opus-4-(?:7|8)/.test(model);

  let response;
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        ...(ACCEPTE_TEMPERATURE ? { temperature: 0.3 } : {}),
        system: promptSystem,
        messages: [{ role: 'user', content: promptUser }],
        // Thinking explicitement désactivé : sur les modèles récents (Sonnet 5,
        // Opus 5…) l'omission du champ active la pensée adaptative — on force
        // `disabled` (Sonnet 5 accepte { type: "disabled" }).
        thinking: { type: 'disabled' },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw httpError(504, 'Délai dépassé lors de l’appel à l’API Anthropic. Réessayez.', 'AI_TIMEOUT', err.message);
    }
    throw httpError(
      503,
      'Le service de génération est temporairement indisponible. Réessayez dans quelques instants.',
      'AI_PROVIDER_UNAVAILABLE',
      `Erreur réseau vers l’API Anthropic : ${err.message}`
    );
  }

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.error?.message || JSON.stringify(body);
    } catch (_e) {
      detail = response.statusText;
    }
    const indisponible = response.status >= 500 || response.status === 429;
    const statut = indisponible ? 503 : response.status === 401 || response.status === 403 ? 503 : response.status;
    throw httpError(
      statut,
      indisponible || statut === 503
        ? 'Le service de génération est temporairement indisponible. Réessayez dans quelques instants.'
        : `L’API Anthropic a renvoyé une erreur (${response.status}).`,
      indisponible || statut === 503 ? 'AI_PROVIDER_UNAVAILABLE' : 'AI_PROVIDER_ERROR',
      `HTTP ${response.status} renvoyé par Anthropic : ${detail}`
    );
  }

  const data = await response.json();
  if (data.stop_reason === 'max_tokens') {
    throw httpError(
      500,
      'La génération a été interrompue. Réessayez.',
      'AI_OUTPUT_TRUNCATED',
      'Budget de sortie atteint (ANTHROPIC_MAX_TOKENS=' + MAX_TOKENS + ')'
    );
  }

  const text = (data.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  const parsed = parseJsonStrict(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw httpError(
      422,
      'La génération a produit un format inexploitable. Réessayez.',
      'INVALID_LLM_JSON',
      'la réponse de l’IA ne contient pas un objet JSON exploitable'
    );
  }
  return parsed;
}

module.exports = { generateAnthropic, parseJsonStrict };
