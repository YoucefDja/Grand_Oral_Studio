/**
 * Récupération d'articles pour l'étape « Source en ligne » (veille ciblée).
 *
 * Ce module ne fait AUCUN balayage automatique : il expose uniquement la
 * découverte Serper (résultats Google Search) + la récupération mécanique du
 * contenu plein, consommés par le service `veille.js` lors de la collecte
 * manuelle (bouton dans la session, après Analyse + Problématique).
 *
 * Serper est OBLIGATOIRE : sans SERPER_API_KEY, la collecte est refusée.
 */

const cheerio = require('cheerio');
const NewsArticle = require('../models/NewsArticle');

const SERPER_SEARCH_URL = 'https://google.serper.dev/search';
const SERPER_GL = process.env.NEWS_GL || 'fr';
const SERPER_HL = process.env.NEWS_HL || 'fr';
const TIMEOUT_MS = 25000;
const NEWS_CONTENT_MAX = parseInt(process.env.NEWS_CONTENT_MAX || '8000', 10) || 8000;

// Termes de repli si aucun mot-clé exploitable n'est déduit.
const GENERIC_TERMS = ['IA', 'intelligence artificielle', 'big data', 'innovation', 'technologie'];

function cleanText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function stripQuery(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_cid|mc_eid|ref|source|via)$/i.test(key)) {
        u.searchParams.delete(key);
      }
    }
    return u.href;
  } catch {
    return url;
  }
}

function serperConfigured() {
  return Boolean(process.env.SERPER_API_KEY);
}

/** Interroge l'API Serper.dev (/search) ; retourne la liste organic. */
async function serperSearch(query, num) {
  let response;
  try {
    response = await fetch(SERPER_SEARCH_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.SERPER_API_KEY,
      },
      body: JSON.stringify({ q: query, num, gl: SERPER_GL, hl: SERPER_HL }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new Error('Délai dépassé sur l’API Serper (google.serper.dev).');
    }
    throw new Error(`Erreur réseau vers Serper : ${err.message}`);
  }

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.error?.message || body?.message || JSON.stringify(body);
    } catch {
      detail = response.statusText;
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error('Serper a refusé la clé API (401/403). Vérifiez SERPER_API_KEY côté backend.');
    }
    if (response.status === 429) {
      throw new Error('Serper : trop de requêtes ou crédits épuisés (429). Réessayez plus tard.');
    }
    throw new Error(`Serper a renvoyé une erreur (${response.status}) : ${detail}`);
  }

  const data = await response.json();
  return Array.isArray(data.organic) ? data.organic : [];
}

/**
 * Requête pour une source : site:<hôte> + mots-clés (thème/sujet/problématique).
 * Les mots-clés multi-mots sont entre guillemets pour rester un tout.
 */
function buildVeilleQuery(hostname, keywords) {
  const terms = new Set();
  for (const k of keywords) {
    const word = String(k || '').trim();
    if (!word) continue;
    terms.add(/\s/.test(word) ? `"${word}"` : word);
  }
  if (terms.size === 0) {
    for (const g of GENERIC_TERMS) terms.add(/\s/.test(g) ? `"${g}"` : g);
  }
  const joined = [...terms].slice(0, 10).join(' OR ');
  return `site:${hostname} (${joined})`;
}

/** Extrait les paragraphes principaux d'une page article (sans le bruit). */
function extractBodyParagraphs($) {
  const container = $(
    'article, [itemprop="articleBody"], .post-content, .entry-content, main, body'
  ).first();
  const paragraphs = [];
  const seen = new Set();
  container.find('p').each((_i, el) => {
    const t = cleanText($(el).text());
    if (t.length < 40 || seen.has(t)) return;
    seen.add(t);
    paragraphs.push(t);
  });
  if (paragraphs.length) return paragraphs;

  $('p').each((_i, el) => {
    const t = cleanText($(el).text());
    if (t.length < 60 || seen.has(t)) return;
    seen.add(t);
    paragraphs.push(t);
  });
  return paragraphs;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (compatible; GrandOralStudioNews/1.0; +https://grand-oral-studio.local)',
      accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      'accept-language': 'fr,en;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`);
  const buffer = await res.arrayBuffer();
  const contentType = res.headers.get('content-type') || '';
  const charset = (String(contentType).match(/charset=([\w-]+)/i) || [])[1];
  try {
    return new TextDecoder(charset || 'utf-8').decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

/** Récupère la page d'un article : { title, content, publishedAt }. */
async function scrapeArticlePage(url) {
  const text = await fetchText(url);
  const $ = cheerio.load(text);

  const ogTitle = cleanText($('meta[property="og:title"]').attr('content'));
  const h1 = cleanText($('h1').first().text());
  const htmlTitle = cleanText($('title').first().text());
  const title = ogTitle || h1 || htmlTitle || '';

  const paragraphs = extractBodyParagraphs($);
  const content = paragraphs.join('\n\n').slice(0, NEWS_CONTENT_MAX);

  const pubRaw =
    $('meta[property="article:published_time"]').attr('content') ||
    $('meta[name="article:published_time"]').attr('content') ||
    $('meta[property="og:published_time"]').attr('content') ||
    $('time[datetime]').first().attr('datetime') ||
    '';
  let publishedAt = null;
  if (pubRaw) {
    const d = new Date(pubRaw);
    if (!Number.isNaN(d.getTime())) publishedAt = d;
  }
  return { title, content, publishedAt };
}

/**
 * Collecte mécanique des candidats sur toutes les sources actives.
 * Retourne { items, sourceResults } ; une source en erreur ne bloque jamais le lot.
 *
 * @param {{sources: Array<{name:string,url:string}>, keywords: string[],
 *          perSource?: number, maxCandidates?: number}} params
 */
async function collectVeilleCandidates({ sources, keywords, perSource = 6, maxCandidates = 24 }) {
  const items = [];
  const sourceResults = [];

  for (const source of sources) {
    const base = { name: source.name, found: 0, doublons: 0, error: null };
    try {
      const hostname = hostOf(source.url);
      if (!hostname) {
        base.error = `Hôte invalide pour ${source.url}`;
        sourceResults.push(base);
        continue;
      }

      const num = Math.min(Math.max(perSource, 3), 10);
      const results = await serperSearch(buildVeilleQuery(hostname, keywords), num);

      const seen = new Set();
      const candidates = [];
      for (const r of results) {
        const url = stripQuery(String(r.link || ''));
        if (!url || seen.has(url)) continue;
        seen.add(url);
        if (hostOf(url) !== hostname) continue; // hôte autorisé uniquement
        candidates.push({
          url,
          sourceName: source.name,
          sourceUrl: source.url,
          title: cleanText(r.title),
          snippet: cleanText(r.snippet),
        });
      }
      base.found = candidates.length;
      if (!candidates.length) {
        sourceResults.push(base);
        continue;
      }

      // Anti-doublon : les URL déjà en base sont ignorées (jamais re-téléchargées).
      const existing = new Set(
        (
          await NewsArticle.find({ url: { $in: candidates.map((c) => c.url) } })
            .select('url')
            .lean()
        ).map((d) => d.url)
      );
      base.doublons = candidates.filter((c) => existing.has(c.url)).length;
      const fresh = candidates.filter((c) => !existing.has(c.url));

      for (const c of fresh) {
        if (items.length >= maxCandidates) break;
        try {
          const page = await scrapeArticlePage(c.url);
          if (!page.title && !page.content) continue;
          items.push({
            url: c.url,
            sourceName: c.sourceName,
            sourceUrl: c.sourceUrl,
            title: cleanText(page.title || c.title),
            snippet: c.snippet,
            content: page.content,
            publishedAt: page.publishedAt || null,
          });
        } catch (err) {
          base.error = base.error || `Contenus partiels (${err.message})`;
        }
      }
    } catch (err) {
      base.error = String(err.message || err).slice(0, 300);
    }
    sourceResults.push(base);
  }

  return { items, sourceResults };
}

module.exports = {
  collectVeilleCandidates,
  serperSearch,
  serperConfigured,
  hostOf,
  stripQuery,
  cleanText,
  scrapeArticlePage,
};
