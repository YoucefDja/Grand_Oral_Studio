/**
 * Traduction des articles News À LA LECTURE (cache par langue).
 *
 * Principe :
 *  - un article n'est traduit que si un utilisateur l'ouvre réellement dans
 *    une langue différente de sa langue d'origine ;
 *  - la traduction est produite par DeepSeek (seul fournisseur News, comme le
 *    reste du module) puis stockée dans NewsArticle.translations (cache) ;
 *  - la langue d'origine (originalLang) est détectée lors de la 1re lecture et
 *    mémorisée pour éviter les appels IA inutiles.
 */

const NewsArticle = require('../models/NewsArticle');
const { generateDeepseek } = require('./deepseek');
const { parseJsonStrict } = require('./anthropic'); // parsing JSON uniquement

const LANGS = ['fr', 'en'];
const LANG_NAMES = { fr: 'français', en: 'anglais' };
const MAX_TRANSLATED_CONTENT = 12000; // borne de sécurité en base

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeLang(value) {
  const v = String(value || '').toLowerCase().trim();
  return v === 'en' ? 'en' : 'fr'; // valeur par défaut sûre
}

/**
 * Appelle DeepSeek pour détecter la langue d'origine et, si besoin, traduire
 * titre + résumé + contenu vers la langue cible.
 * @returns {{detected:string, translated:boolean, title:string, resume:string, content:string}}
 */
async function translateWithDeepseek(article, targetLang) {
  const system =
    'Tu es un traducteur professionnel français ↔ anglais, spécialisé en technologies ' +
    '(IA, Big Data, Cloud, transformation digitale). On te fournit un article { titre, resume, contenu }.\n' +
    '1. Détecte sa langue d’origine (français ou anglais).\n' +
    '2. Si la langue d’origine EST DÉJÀ la langue cible : renvoie les textes tels quels.\n' +
    '3. Sinon : traduis titre, resume et contenu dans la langue cible en conservant le sens, ' +
    'les chiffres, les sigles et les noms propres.\n' +
    'Réponds UNIQUEMENT par un objet JSON : ' +
    '{"langue_detectee":"fr"|"en","titre":"…","resume":"…","contenu":"…"}. ' +
    'Aucun commentaire, aucune balise. Le champ "contenu" est UNE SEULE chaîne, ' +
    'paragraphes séparés par \\n\\n.';

  const user = JSON.stringify({
    langue_cible: targetLang,
    titre: article.title || '',
    resume: article.resume || '',
    contenu: (article.content || '').slice(0, MAX_TRANSLATED_CONTENT),
  });

  const raw = await generateDeepseek(system, user);
  const parsed = parseJsonStrict(raw) || {};

  const detected = normalizeLang(parsed.langue_detectee);
  const outTitle = clean(parsed.titre) || article.title;
  const outResume = clean(parsed.resume) || article.resume || '';
  const outContent = String(parsed.contenu || '').trim() || article.content || '';

  // Une vraie traduction n'a d'intérêt que si la langue diffère ET que le
  // contenu renvoyé est exploitable.
  const translated = detected !== targetLang && outContent.length > 0;

  return {
    detected,
    translated,
    title: translated ? outTitle : article.title,
    resume: translated ? outResume : article.resume || '',
    content: translated ? outContent.slice(0, MAX_TRANSLATED_CONTENT) : article.content || '',
  };
}

/**
 * Charge un article et renvoie sa représentation prête à afficher pour la
 * langue demandée (traduction à la demande + cache).
 *
 * @param {string} id Identifiant Mongo de l'article.
 * @param {string|null} lang 'fr' | 'en' | null (null = version brute, sans IA).
 * @returns {Promise<object>} article (plain) avec title/resume/content adaptés,
 *   plus les métadonnées translated / originalLang.
 */
async function getArticleForLang(id, lang) {
  const article = await NewsArticle.findById(id);
  if (!article) throw httpError(404, 'Article introuvable.');

  // Appel sans langue (anciens clients / liste) : on renvoie la version brute.
  if (!lang || !LANGS.includes(lang)) return toResponse(article);

  // Cache : une traduction pour cette langue existe déjà.
  const cached = (article.translations || []).find((t) => t.lang === lang);

  // Langue d'origine connue et déjà = langue demandée → rien à traduire.
  if (!cached && article.originalLang && article.originalLang === lang) {
    return toResponse(article, false, article.originalLang);
  }

  if (cached) {
    return {
      ...toResponse(article, true, article.originalLang),
      title: cached.title || article.title,
      resume: cached.resume || article.resume || '',
      content: cached.content || article.content || '',
      translated: true,
    };
  }

  // Traduction à la volée via DeepSeek.
  const result = await translateWithDeepseek(article, lang);

  let changed = false;
  if (!article.originalLang && result.detected) {
    article.originalLang = result.detected;
    changed = true;
  }

  if (result.translated) {
    const existing = article.translations.find((t) => t.lang === lang);
    const entry = {
      lang,
      title: result.title,
      resume: result.resume,
      content: result.content,
      updatedAt: new Date(),
    };
    if (existing) {
      Object.assign(existing, entry);
    } else {
      article.translations.push(entry);
    }
    changed = true;
  }

  if (changed) {
    try {
      await article.save();
    } catch (err) {
      console.warn('[news] Traduction non persistée (lecture quand même renvoyée) :', err.message);
    }
  }

  return toResponse(article, result.translated, article.originalLang, result);
}

/** Représentation sérialisée d'un article (sans le tableau de traductions). */
function toResponse(article, translated = false, originalLang = article.originalLang, overrides = null) {
  const doc = article.toObject ? article.toObject() : article;
  delete doc.translations;
  return {
    ...doc,
    translated,
    originalLang: originalLang || null,
    ...(overrides
      ? { title: overrides.title, resume: overrides.resume, content: overrides.content }
      : {}),
  };
}

module.exports = { getArticleForLang, LANGS };
