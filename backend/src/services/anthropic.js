/**
 * Appel à l'API Anthropic. La clé (ANTHROPIC_API_KEY) ne vit que côté serveur.
 * La réponse attendue est un objet JSON strict ; toute réponse non parsable
 * déclenche une erreur explicite (jamais d'échec silencieux).
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
// Budget de sortie configurable (env ANTHROPIC_MAX_TOKENS), 8192 par défaut.
const MAX_TOKENS = parseInt(process.env.ANTHROPIC_MAX_TOKENS || '8192', 10) || 8192;
const TIMEOUT_MS = 120000;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
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
    throw httpError(
      502,
      `La réponse de l'IA n'est pas un JSON valide (extrait : "${extrait}..."). Réessayez.`
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
        temperature: 0.3,
        system: promptSystem,
        messages: [{ role: 'user', content: promptUser }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw httpError(504, 'Délai dépassé lors de l’appel à l’API Anthropic. Réessayez.');
    }
    throw httpError(502, `Erreur réseau vers l’API Anthropic : ${err.message}`);
  }

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.error?.message || JSON.stringify(body);
    } catch (_e) {
      detail = response.statusText;
    }
    throw httpError(
      response.status === 401 || response.status === 403 ? 502 : response.status,
      `L’API Anthropic a renvoyé une erreur (${response.status}) : ${detail}`
    );
  }

  const data = await response.json();
  if (data.stop_reason === 'max_tokens') {
    throw httpError(
      502,
      'La réponse de l’IA a été tronquée (budget de sortie atteint). ' +
        'Augmentez ANTHROPIC_MAX_TOKENS côté backend (valeur actuelle : ' +
        MAX_TOKENS + ') puis réessayez.'
    );
  }

  const text = (data.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  const parsed = parseJsonStrict(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw httpError(502, 'La réponse de l’IA ne contient pas un objet JSON utilisable.');
  }
  return parsed;
}

module.exports = { generateAnthropic, parseJsonStrict };
