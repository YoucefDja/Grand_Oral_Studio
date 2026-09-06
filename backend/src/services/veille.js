/**
 * Étape « Source en ligne » — veille ciblée d'une session de Grand Oral.
 *
 * Déclenchée MANUELLEMENT (bouton dans la session, après l'Analyse du sujet et
 * le choix de la Problématique). Aucun cron, aucun balayage automatique global.
 *
 * Déroulé :
 *  1. DeepSeek déduit des mots-clés à partir du sujet, du thème, de la
 *     problématique retenue et de la ligne directrice ;
 *  2. collecte mécanique de candidats sur les sources actives configurées dans
 *     l'admin (Serper : site:<hôte> + mots-clés), récupération du contenu ;
 *  3. DeepSeek sélectionne AU PLUS 4 articles les plus pertinents pour TOUT ce
 *     contexte (thème + sujet + problématique) ;
 *  4. les articles retenus sont archivés dans l'onglet News (visibles par tous
 *     les utilisateurs connectés), avec leur contexte de génération.
 *
 * Seul DeepSeek est utilisé comme fournisseur IA sur ce parcours.
 */

const NewsSource = require('../models/NewsSource');
const NewsArticle = require('../models/NewsArticle');
const { generateDeepseek } = require('./deepseek');
const { parseJsonStrict } = require('./anthropic'); // parsing JSON uniquement
const { collectVeilleCandidates, serperConfigured } = require('./newsScanner');

const MAX_SELECTION = 4;
const MAX_CANDIDATES = 24;
const MAX_PER_SOURCE = 6;
const AI_TEXT_LIMIT = parseInt(process.env.NEWS_AI_TEXT_LIMIT || '1600', 10) || 1600;

const STOPWORDS = new Set([
  'dans','pour','avec','une','dans','les','des','cette','cet','quel','quelle','comment',
  'quels','quelles','entre','vers','ainsi','leur','leurs','plus','moins','être','faire',
]);

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Problématique retenue (recommandation) ou repli sur la 1re formulation. */
function problematiqueRetenue(probleme) {
  if (!probleme || typeof probleme !== 'object') return '';
  const formulations = Array.isArray(probleme.formulations) ? probleme.formulations : [];
  const recommandee = String(probleme.recommandation || '').trim();
  const retenue =
    formulations.find(
      (f) => f && typeof f === 'object' && String(f.formulation || '').trim() === recommandee
    ) || formulations[0];
  return retenue && typeof retenue.formulation === 'string' ? retenue.formulation.trim() : '';
}

function ligneDirectrice(session) {
  const fromSession = String(session.ligneDirectrice || '').trim();
  if (fromSession) return fromSession;
  return String(session.data?.probleme?.ligne_directrice || '').trim();
}

/** Mots-clés de repli (analyse lexicale simple) si DeepSeek échoue. */
function fallbackKeywords({ sujet, theme, problematique }) {
  const out = [];
  const add = (v) => {
    const s = cleanText(v);
    if (s && !out.includes(s) && out.length < 10) out.push(s);
  };
  add(theme);
  for (const phrase of [sujet, problematique]) {
    for (const w of String(phrase || '').toLowerCase().split(/[\s,;:—–()«»"'\.]+/)) {
      const t = w.trim();
      if (t.length >= 4 && !STOPWORDS.has(t) && !out.includes(t) && out.length < 10) out.push(t);
    }
  }
  if (!out.length) out.push('IA', 'innovation');
  return out;
}

/** 1) Déduit les mots-clés de recherche (DeepSeek) pour le contexte de la veille. */
async function buildSearchKeywords(ctx) {
  const system =
    "Tu prépares une veille en ligne (recherche d'articles) pour un étudiant ingénieur " +
    'préparant son Grand Oral. À partir du sujet, du thème, de la problématique retenue et de la ' +
    'ligne directrice fournis, propose des mots-clés de recherche courts et précis qui permettront ' +
    "de trouver des articles de presse/veille techniques UTILES pour traiter cette problématique.\n" +
    'Réponds UNIQUEMENT par un objet JSON : {"mots_cles":["…","…"]} avec 8 à 14 mots-clés en français ' +
    '(expressions courtes possibles, ex. "IA générative", "cybersécurité santé"). Aucun commentaire.';

  const user = JSON.stringify({
    sujet: ctx.sujet,
    theme: ctx.theme,
    problematique: ctx.problematique,
    ligne_directrice: ctx.ligneDirectrice,
    contexte_etudiant: ctx.contexte,
  });

  try {
    const raw = await generateDeepseek(system, user);
    const parsed = parseJsonStrict(raw);
    const words = Array.isArray(parsed?.mots_cles)
      ? parsed.mots_cles.map((w) => cleanText(w)).filter(Boolean).slice(0, 14)
      : [];
    if (words.length >= 3) return words;
  } catch (err) {
    console.warn('[veille] Mots-clés DeepSeek ignorés :', err.message);
  }
  return fallbackKeywords(ctx);
}

/**
 * 3) Sélection par DeepSeek des AU PLUS 4 meilleurs articles couvrant le
 * thème + le sujet + la problématique. Repli : si le lot est déjà ≤ 4 et que
 * l'IA échoue, on conserve tout le lot (déjà filtré par source + mots-clés).
 */
async function selectBestArticles(items, ctx, keywords) {
  if (!items.length) return [];

  const system =
    'Tu es un assistant de veille pour un étudiant ingénieur préparant un Grand Oral ' +
    'scientifique et technologique. On te donne une liste d’articles (numérotés) trouvés sur des ' +
    'sites fiables, avec titre, source et un extrait.\n' +
    'Sélectionne AU PLUS 4 articles — moins s’ils ne sont pas assez solides — qui correspondent le ' +
    'mieux à TOUT le contexte fourni (thème, sujet, problématique, ligne directrice). Chaque article ' +
    'retenu doit réellement apporter des faits, chiffres ou exemples utiles pour défendre cette ' +
    'problématique devant un jury.\n' +
    'Réponds UNIQUEMENT par un objet JSON : {"selection":[{"index":1,"url":"…","resume":"résumé en 2-3 phrases en français de l’article","pourquoi":"en quoi il nourrit la problématique","tags":["tag1","tag2"]}]}. ' +
    'Aucun commentaire, aucune balise. Si aucun article n’est assez pertinent, renvoie {"selection":[]}.';

  const user = JSON.stringify({
    theme: ctx.theme,
    sujet: ctx.sujet,
    problematique: ctx.problematique,
    ligne_directrice: ctx.ligneDirectrice,
    articles: items.map((a, i) => ({
      index: i + 1,
      url: a.url,
      source: a.sourceName,
      titre: a.title,
      extrait: (a.content || a.snippet || '').slice(0, AI_TEXT_LIMIT),
    })),
  });

  try {
    const raw = await generateDeepseek(system, user);
    const parsed = parseJsonStrict(raw);
    const selection = Array.isArray(parsed?.selection) ? parsed.selection : [];
    const byUrl = new Map();
    const out = [];
    for (const sel of selection) {
      if (!sel || typeof sel !== 'object') continue;
      const url = String(sel.url || '').trim();
      const article = items.find((a) => a.url === url);
      if (!article || byUrl.has(url)) continue;
      byUrl.set(url, true);
      out.push({
        ...article,
        resume: cleanText(sel.resume) || article.snippet || '',
        pourquoi: cleanText(sel.pourquoi),
        tags: Array.isArray(sel.tags) ? sel.tags.map((t) => String(t)).slice(0, 5) : [],
      });
      if (out.length >= MAX_SELECTION) break;
    }
    return out;
  } catch (err) {
    console.warn('[veille] Sélection DeepSeek ignorée :', err.message);
  }

  // Repli : lot petit, on le garde en entier (résumé = snippet ou 1er paragraphe).
  return items.slice(0, MAX_SELECTION).map((a) => ({
    ...a,
    resume: a.snippet || (a.content || '').split('\n\n')[0] || '',
    pourquoi: '',
    tags: keywords.slice(0, 4),
  }));
}

/**
 * Persiste un article retenu dans l'onglet News (visibilité commune), en
 * attachant son contexte de génération. Renvoie la référence allégée.
 */
async function archiveArticle(article, ctx, keywords) {
  const contextEntry = {
    sessionId: ctx.sessionId,
    sessionTitle: String(ctx.sujet || '').slice(0, 300),
    sessionTheme: String(ctx.theme || '').slice(0, 300),
    problematique: String(ctx.problematique || '').slice(0, 1200),
    keywords: keywords.slice(0, 14),
    createdAt: new Date(),
  };

  let doc = await NewsArticle.findOne({ url: article.url });

  if (!doc) {
    doc = await NewsArticle.create({
      sourceName: article.sourceName,
      sourceUrl: article.sourceUrl,
      url: article.url,
      titleHash: String(article.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 96),
      title: String(article.title || '').slice(0, 500),
      resume: String(article.resume || '').slice(0, 1200),
      content: String(article.content || ''),
      themes: ctx.theme ? [String(ctx.theme)] : [],
      category: '',
      tags: article.tags || [],
      publishedAt: article.publishedAt || new Date(),
      contexts: [contextEntry],
    });
    return serializeRef(doc);
  }

  // URL déjà en base (autre veille) : on ajoute uniquement le contexte si absent.
  const already = (doc.contexts || []).some(
    (c) => c.sessionId && String(c.sessionId) === String(ctx.sessionId)
  );
  if (!already) {
    doc.contexts.push(contextEntry);
    if (!doc.themes.includes(contextEntry.sessionTheme)) {
      doc.themes.push(contextEntry.sessionTheme);
    }
    if (!doc.resume && article.resume) doc.resume = String(article.resume).slice(0, 1200);
    await doc.save().catch((err) => console.warn('[veille] Contexte non attaché :', err.message));
  }
  return serializeRef(doc);
}

function serializeRef(doc) {
  return {
    _id: doc._id,
    url: doc.url,
    title: doc.title,
    resume: doc.resume || '',
    sourceName: doc.sourceName,
    sourceUrl: doc.sourceUrl,
    themes: doc.themes || [],
    publishedAt: doc.publishedAt || null,
  };
}

/**
 * Point d'entrée : lance la veille ciblée d'une session.
 * @param {object} session document Mongoose de la session (doit avoir data).
 * @returns {Promise<object>} payload à stocker dans session.data.source.
 */
async function runVeille(session) {
  if (!serperConfigured()) {
    throw httpError(
      500,
      'Serper n’est pas configuré (SERPER_API_KEY). La récupération d’articles est désactivée tant que cette variable n’est pas renseignée côté backend.'
    );
  }

  const problematique = problematiqueRetenue(session.data?.probleme);
  if (!problematique) {
    throw httpError(
      400,
      'Aucune problématique retenue : choisissez d’abord votre formulation à l’étape Problématique.'
    );
  }

  const ctx = {
    sessionId: session._id,
    sujet: String(session.titre || '').trim(),
    theme: String(session.theme || '').trim(),
    problematique,
    ligneDirectrice: ligneDirectrice(session),
    contexte: String(session.contexte || '').trim(),
  };

  const sources = await NewsSource.find({ active: true }).sort({ createdAt: 1 }).lean();
  if (!sources.length) {
    throw httpError(
      400,
      'Aucune source active : ajoutez des sites sources dans Administration → News avant de lancer la veille.'
    );
  }

  // 1) Mots-clés ciblés sur thème + sujet + problématique.
  const keywords = await buildSearchKeywords(ctx);

  // 2) Collecte mécanique des candidats sur les sources actives.
  const { items, sourceResults } = await collectVeilleCandidates({
    sources,
    keywords,
    perSource: MAX_PER_SOURCE,
    maxCandidates: MAX_CANDIDATES,
  });
  const sourcesEnErreur = sourceResults.filter((r) => r.error).length;

  if (!items.length) {
    const detail = sourcesEnErreur
      ? ` (${sourcesEnErreur} source(s) en erreur, voir détails : ${sourceResults
          .filter((r) => r.error)
          .map((r) => `${r.name} — ${r.error}`)
          .join(' ; ').slice(0, 600)})`
      : '.';
    throw httpError(502, `Aucun nouvel article trouvé pour cette veille${detail}`);
  }

  // 3) Sélection DeepSeek des 4 meilleurs articles.
  const selected = await selectBestArticles(items, ctx, keywords);
  if (!selected.length) {
    throw httpError(
      502,
      `Aucun des ${items.length} articles trouvés ne correspond assez au thème, au sujet et à la problématique. Réessayez avec une formulation différente ou élargissez les sources.`
    );
  }

  // 4) Archivage dans l'onglet News (visible par tous) + référencement en session.
  const articles = [];
  for (const article of selected) {
    articles.push(await archiveArticle(article, ctx, keywords));
  }

  return {
    sujet: ctx.sujet,
    theme: ctx.theme,
    problematique,
    mots_cles: keywords,
    generatedAt: new Date().toISOString(),
    articles,
    stats: {
      candidats: items.length,
      selectionnes: articles.length,
      sourcesEnErreur,
    },
  };
}

module.exports = { runVeille, problematiqueRetenue };
