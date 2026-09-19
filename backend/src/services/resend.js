/**
 * Envoi d'e-mails transactionnels via Resend (API HTTP, pas de SDK dédié).
 * Clé : RESEND_API_KEY, expéditeur : RESEND_FROM (ou défaut).
 * Jamais d'échec silencieux : toute erreur Resend remonte explicitement.
 */

const RESEND_API_URL = 'https://api.resend.com/emails';
const TIMEOUT_MS = 20000;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/** URL publique du frontend utilisée pour construire les liens d'invitation. */
function frontendBaseUrl() {
  const raw = process.env.FRONTEND_URL || 'http://localhost:5173';
  return raw.replace(/\/+$/, '');
}

async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw httpError(500, 'RESEND_API_KEY n’est pas configurée côté backend (service Resend).');
  }
  const from = process.env.RESEND_FROM || 'Grand Oral Studio <onboarding@resend.dev>';
  if (!to) throw httpError(400, 'Destinataire email manquant.');

  let response;
  try {
    response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from, to, subject, html, text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw httpError(504, 'Délai dépassé lors de l’envoi de l’e-mail Resend. Réessayez.');
    }
    // Jamais de 502 : une panne réseau du fournisseur est une indisponibilité.
    throw httpError(503, 'Le service d’envoi d’e-mails est temporairement indisponible. Réessayez dans quelques instants.');
  }

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.message || JSON.stringify(body);
    } catch (_e) {
      detail = response.statusText;
    }
    const indisponible = response.status >= 500 || response.status === 429 || response.status === 401 || response.status === 403;
    throw httpError(
      indisponible ? 503 : response.status,
      indisponible
        ? 'Le service d’envoi d’e-mails est temporairement indisponible. Réessayez dans quelques instants.'
        : `Resend a renvoyé une erreur (${response.status}).`
    );
  }
  return response.json();
}

/**
 * Envoie l'invitation à configurer son mot de passe.
 * @param {object} opts { email, token, resendName? }
 */
async function sendInviteEmail({ email, token }) {
  const base = frontendBaseUrl();
  const link = `${base}/accept-invite?token=${encodeURIComponent(token)}`;
  const subject = 'Grand Oral Studio — configurez votre mot de passe';
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto">
      <h2 style="color:#1f4e79">Bienvenue sur Grand Oral Studio</h2>
      <p>Vous avez été invité(e) à utiliser l’assistant de préparation au Grand Oral CESI.</p>
      <p>Cliquez sur le bouton ci-dessous pour choisir votre mot de passe :</p>
      <p style="margin:24px 0">
        <a href="${link}" style="background:#1f4e79;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">
          Configurer mon mot de passe
        </a>
      </p>
      <p>Ce lien est valable 48 heures. Si vous n’êtes pas à l’origine de cette invitation, ignorez cet e-mail.</p>
      <p style="color:#5a6b7c;font-size:12px">Lien direct : ${link}</p>
    </div>`;
  const text = [
    'Bienvenue sur Grand Oral Studio (assistant Grand Oral CESI).',
    'Vous avez été invité(e) à configurer votre mot de passe.',
    '',
    `Lien (valable 48 h) : ${link}`,
    '',
    'Si vous n’êtes pas à l’origine de cette invitation, ignorez cet e-mail.',
  ].join('\n');

  return sendEmail({ to: email, subject, html, text });
}

module.exports = { sendInviteEmail, sendEmail, frontendBaseUrl };
