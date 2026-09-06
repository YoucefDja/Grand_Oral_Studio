/**
 * Module News — collecte d'articles via Serper.dev (Google Search API) + DeepSeek.
 *
 * Flux :
 *  1. lit les sources actives en base (NewsSource) + les thèmes admin (Theme) ;
 *  2. pour chaque source, interroge l'API Serper.dev (POST /search) avec un
 *     opérateur site:<hôte> et des mots-clés issus des thèmes admin ;
 *  3. anti-doublon strict : URL d'origine unique en base (NewsArticle.url) —
 *     un article déjà présent est ignoré, jamais inséré deux fois ;
 *  4. récupère mécaniquement le contenu plein de chaque article (lecture
 *     intégrée dans l'app web/mobile) ;
 *  5. DeepSeek — SEUL fournisseur IA utilisé ici — juge la pertinence STRICTE
 *     par rapport aux thèmes admin, vérifie la provenance (source autorisée),
 *     et produit résumé / catégorie / tags / thèmes retenus. Un article qui ne
 *     correspond à AUCUN thème admin est ignoré (jamais stocké) ;
 *  6. génère le glossaire du jour (NewsGlossary) via DeepSeek si des articles
 *     ont réellement été ajoutés.
 *
 * Tolérant aux pannes : une source en erreur ne bloque jamais le lot entier.
 * Serper est OBLIGATOIRE : sans SERPER_API_KEY configurée, la collecte est
 * refusée (rapport explicite).
 */

const cheerio = require('cheerio');
const NewsSource = require('../models/NewsSource');
const NewsArticle = require('../models/NewsArticle');
const NewsGlossary = require('../models/NewsGlossary');
const Theme = require('../models/Theme');
const { generateDeepseek } = require('./deepseek');
const { parseJsonStrict } = require('./anthropic'); // simple utilitaire de parsing JSON, aucun appel API

// Découverte : Serper.dev (Google Search JSON) — POST + clé X-API-KEY.
const SERPER_SEARCH_URL = 'https://google.serper.dev/search';
// Pays / langue des résultats Google (les sources françaises restent prioritaires).
const SERPER_GL = process.env.NEWS_GL || 'fr';
const SERPER_HL = process.env.NEWS_HL || 'fr';

const MAX_PER_SOURCE = parseInt(process.env.NEWS_MAX_PER_SOURCE || '10', 10) || 10;
const MAX_TOTAL_PER_RUN = parseInt(process.env.NEWS_MAX_PER_RUN || '50', 10) || 50;
const TIMEOUT_MS = 25000;
const NEWS_CONTENT_MAX = parseInt(process.env.NEWS_CONTENT_MAX || '8000', 10) || 8000;
// Nombre max de caractères d'article envoyés à DeepSeek pour le jugement.
const AI_TEXT_LIMIT = parseInt(process.env.NEWS_AI_TEXT_LIMIT || '1600', 10) || 1600;
// Taille des lots d'articles envoyés à DeepSeek (évite de dépasser les budgets).
const AI_BATCH = 15;
// Âge maximum (jours) d'un article conservé, lorsque sa date de publication est
// connue (défaut : 7 — horizon "récent" du module). Sans date exploitable, pas de filtre.
const MAX_AGE_DAYS = parseInt(process.env.NEWS_MAX_AGE_DAYS || '7', 10) || 7;
const MAX_AGE_MS = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

/** Vrai si la date de publication dépasse l'âge maximum autorisé. */
function isTooOld(publishedAt) {
  if (!publishedAt) return false;
  return Date.now() - publishedAt.getTime() > MAX_AGE_MS;
}

// Termes "génériques" IA / Big Data utilisés si aucun thème n'est configuré.
const GENERIC_TERMS = [
  'IA',
  '"intelligence artificielle"',
  '"big data"',
  '"machine learning"',
  '"deep learning"',
  '"science des données"',
  '"data science"',
];

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function cleanText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]*>/g, '');
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (_e) {
    return '';
  }
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function cleanHash(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 96);
}

/** Marqueur de date du jour (fuseau Europe/Paris) pour le glossaire. */
function todayKey() {
  const parts = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
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
  } catch (_e) {
    return url;
  }
}

/* ------------------------------------------------------------------ *
 * 1) Découverte : Serper.dev (Google Search JSON)
 * ------------------------------------------------------------------ */

function serperConfigured() {
  return Boolean(process.env.SERPER_API_KEY);
}

/**
 * Construit la requête Serper pour une source : site:<hôte> + mots-clés issus
 * des thèmes admin (complétés de termes génériques IA / Big Data).
 */
function buildQuery(hostname, themeLabels) {
  const terms = new Set();
  for (const t of themeLabels) {
    const label = String(t || '').trim();
    if (!label) continue;
    // Les thèmes multi-mots sont mis entre guillemets pour rester un tout.
    terms.add(/\s/.test(label) ? `"${label}"` : label);
  }
  for (const g of GENERIC_TERMS) terms.add(g);
  const keywords = [...terms].slice(0, 12).join(' OR ');
  return `site:${hostname} (${keywords})`;
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
    } catch (_e) {
      detail = response.statusText;
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        'Serper a refusé la clé API (401/403). Vérifiez SERPER_API_KEY côté backend.'
      );
    }
    if (response.status === 429) {
      throw new Error(
        'Serper : trop de requêtes ou crédits épuisés (429). Réessayez plus tard.'
      );
    }
    throw new Error(`Serper a renvoyé une erreur (${response.status}) : ${detail}`);
  }

  const data = await response.json();
  return Array.isArray(data.organic) ? data.organic : [];
}

/* ------------------------------------------------------------------ *
 * 2) Récupération du contenu plein d'un article (mécanique)
 * ------------------------------------------------------------------ */

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
  if (!res.ok) throw httpError(res.status, `HTTP ${res.status} pour ${url}`);
  const buffer = await res.arrayBuffer();
  const contentType = res.headers.get('content-type') || '';
  const charset = (String(contentType).match(/charset=([\w-]+)/i) || [])[1];
  try {
    return new TextDecoder(charset || 'utf-8').decode(buffer);
  } catch (_e) {
    return new TextDecoder('utf-8').decode(buffer);
  }
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

  // Repli : tous les <p> d'une taille raisonnable.
  $('p').each((_i, el) => {
    const t = cleanText($(el).text());
    if (t.length < 60 || seen.has(t)) return;
    seen.add(t);
    paragraphs.push(t);
  });
  return paragraphs;
}

/** Récupère la page d'un article : { title, publishedAt, content }. */
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

/* ------------------------------------------------------------------ *
 * 3) Jugement IA strict (SEUL DeepSeek) : pertinence thèmes + provenance
 * ------------------------------------------------------------------ */

/**
 * Envoie un lot d'articles à DeepSeek. Pour chaque URL, il doit indiquer si
 * l'article correspond à AU MOINS UN des thèmes admin fournis (pertinence
 * stricte) et renvoyer résumé/catégorie/tags/les thèmes retenus. Retourne une
 * Map url → { pertinent, themes[], resume, category, tags }.
 */
async function judgeArticlesBatch(batch, themeLabels, authorizedHosts) {
  const system =
    "Tu es un assistant de veille pour un étudiant ingénieur préparant son Grand Oral sur des " +
    'thèmes précis. On te donne une liste JSON d’articles, chacun avec { url, source, titre, extrait }.\n' +
    'Règles STRICTES :\n' +
    '1. pertinent = true UNIQUEMENT si le contenu porte réellement sur au moins un des thèmes listés ci-dessous.\n' +
    "2. themes = liste des thèmes (textes exacts fournis) réellement couverts ; vide si aucun.\n" +
    '3. Ne jamais inventer de thème : seuls les libellés exacts fournis sont acceptés.\n' +
    "4. Vérifie la provenance : si l'hôte de l'URL n'est pas dans la liste des hôtes autorisés, mets pertinent=false.\n" +
    'Réponds UNIQUEMENT par un objet JSON : {"avis":[{"url":"…","pertinent":true|false,"themes":["…"],"resume":"résumé en 1-2 phrases en français","category":"IA|Big Data|Cloud|Autre","tags":["tag1","tag2"]}]}. ' +
    'Aucun commentaire, aucune balise. Retourne un avis pour CHAQUE article fourni.';
  const user = JSON.stringify({
    themes_disponibles: themeLabels,
    hotes_autorises: authorizedHosts,
    articles: batch.map((a) => ({
      url: a.url,
      source: a.sourceName,
      titre: a.title,
      extrait: (a.content || a.snippet || '').slice(0, AI_TEXT_LIMIT),
    })),
  });

  const raw = await generateDeepseek(system, user);
  const parsed = parseJsonStrict(raw);
  const avis = Array.isArray(parsed?.avis) ? parsed.avis : [];
  const result = new Map();
  for (const item of avis) {
    if (!item || typeof item.url !== 'string') continue;
    const themes = Array.isArray(item.themes)
      ? item.themes.map((t) => String(t).trim()).filter((t) => themeLabels.includes(t))
      : [];
    result.set(item.url, {
      pertinent: item.pertinent === true && themes.length > 0,
      themes,
      resume: String(item.resume || '').trim(),
      category: String(item.category || '').trim(),
      tags: Array.isArray(item.tags) ? item.tags.map((t) => String(t)).slice(0, 5) : [],
    });
  }
  return result;
}

/** Génère le glossaire du jour via DeepSeek (acronymes + termes techniques). */
async function generateDailyGlossary(articles, totalNouveaux) {
  const date = todayKey();
  const sample = articles.slice(0, 30);
  if (!sample.length) return null;
  const system =
    "Tu es un expert IA et Big Data. À partir des titres/résumés d'articles de veille, génère une " +
    "liste d'acronymes et de termes techniques pertinents (5 à 10). Réponds UNIQUEMENT par un objet " +
    'JSON : {"items":[{"terme":"Nom complet du terme","acronyme":"Sigle si existant (sinon \'\')","explication":"explication claire en français, 1 à 2 phrases"}]}. ' +
    'Priorise les notions réellement utiles pour un étudiant ingénieur.';
  const user = JSON.stringify(
    sample.map((a) => ({ titre: a.title, resume: a.resume || a.snippet || '' }))
  );
  let items = [];
  try {
    const raw = await generateDeepseek(system, user);
    const parsed = parseJsonStrict(raw);
    items = Array.isArray(parsed?.items)
      ? parsed.items
          .filter((t) => t && t.terme)
          .map((t) => ({
            terme: cleanText(t.terme).slice(0, 160),
            acronyme: cleanText(t.acronyme).slice(0, 40),
            explication: cleanText(t.explication).slice(0, 600),
          }))
      : [];
  } catch (err) {
    console.warn('[news] Glossaire DeepSeek ignoré :', err.message);
  }
  if (!items.length) return null;

  const doc = await NewsGlossary.findOneAndUpdate(
    { date },
    { $set: { items, sourceCount: totalNouveaux } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return doc;
}

/* ------------------------------------------------------------------ *
 * 4) Collecte pour UNE source
 * ------------------------------------------------------------------ */

/** Interroge Serper pour une source et renvoie les candidats (pas encore vus). */
async function serperCandidatesForSource(source, themeLabels) {
  const hostname = hostOf(source.url);
  if (!hostname) throw new Error(`Hôte invalide pour ${source.url}`);

  const query = buildQuery(hostname, themeLabels);
  const num = Math.min(Math.max(MAX_PER_SOURCE, 5), 10); // par requête Serper
  const items = await serperSearch(query, num);

  const candidates = [];
  const seen = new Set();
  for (const item of items) {
    const url = stripQuery(String(item.link || ''));
    if (!url || seen.has(url)) continue;
    seen.add(url);
    // On ne conserve que les liens appartenant bien à l'hôte autorisé.
    if (hostOf(url) !== hostname) continue;
    candidates.push({
      url,
      sourceName: source.name,
      sourceUrl: source.url,
      title: cleanText(item.title),
      snippet: cleanText(item.snippet),
    });
  }
  return candidates;
}

/** Récupère le contenu plein des nouveaux candidats (tolérant aux échecs). */
async function scrapeNewArticleContents(candidates) {
  const out = [];
  const logs = [];
  for (const c of candidates) {
    try {
      const page = await scrapeArticlePage(c.url);
      if (!page.title && !page.content) {
        logs.push(`Page sans contenu exploitable (${c.url})`);
        continue;
      }
      if (isTooOld(page.publishedAt)) {
        logs.push(`Article trop ancien (> ${MAX_AGE_DAYS} j), ignoré (${c.url})`);
        continue;
      }
      out.push({
        ...c,
        title: cleanText(page.title || c.title),
        content: page.content,
        publishedAt: page.publishedAt || null,
      });
    } catch (err) {
      logs.push(`Contenu ignoré (${err.message})`);
    }
  }
  return { articles: out, logs };
}

/** Collecte + filtre UNE source. Retourne { found, doublons, nouveaux, ... }. */
async function scrapeSource(source, themeLabels) {
  const logs = [];
  try {
    // 1) Découverte Serper (hôte autorisé uniquement).
    const candidates = await serperCandidatesForSource(source, themeLabels);
    if (!candidates.length) {
      logs.push('Serper n’a retourné aucun résultat pour cette source.');
      return { source: source.name, found: 0, doublons: 0, nouveaux: [], logs };
    }

    // 2) Anti-doublon stricte contre la base (URL unique).
    const existing = new Set(
      (
        await NewsArticle.find({ url: { $in: candidates.map((c) => c.url) } })
          .select('url')
          .lean()
      ).map((d) => d.url)
    );
    const doublons = candidates.filter((c) => existing.has(c.url)).length;
    const nouveauxCandidats = candidates
      .filter((c) => !existing.has(c.url))
      .slice(0, MAX_PER_SOURCE);

    if (!nouveauxCandidats.length) {
      return {
        source: source.name,
        found: candidates.length,
        doublons,
        nouveaux: [],
        logs: [...logs, 'Tout était déjà en base.'],
      };
    }

    // 3) Récupération du contenu plein (pour la lecture intégrée).
    const { articles, logs: scrapLogs } = await scrapeNewArticleContents(nouveauxCandidats);
    logs.push(...scrapLogs);
    if (!articles.length) {
      return {
        source: source.name,
        found: candidates.length,
        doublons,
        nouveaux: [],
        logs: [...logs, 'Aucun contenu récupérable.'],
      };
    }

    source.lastScrapedAt = new Date();
    source.lastError = '';
    await source.save();
    return { source: source.name, found: candidates.length, doublons, nouveaux: articles, logs };
  } catch (err) {
    source.lastError = String(err.message || err).slice(0, 400);
    await source.save().catch(() => {});
    return { source: source.name, error: source.lastError, logs };
  }
}

/* ------------------------------------------------------------------ *
 * 5) Exécution globale (cron quotidien OU déclenchement manuel)
 * ------------------------------------------------------------------ */

/**
 * Exécute le balayage complet. Retourne un rapport agrégé.
 * - Serper est OBLIGATOIRE (clé API) : sinon refus explicite.
 * - DeepSeek est requis pour le filtrage strict par thème admin.
 */
async function runNewsScan() {
  const baseReport = {
    date: todayKey(),
    sourcesTraitees: 0,
    sources: [],
    totalTrouves: 0,
    totalNouveaux: 0,
    horsThemes: 0,
    doublonsIgnores: 0,
    glossaire: null,
    notes: [],
  };

  if (!serperConfigured()) {
    return {
      ...baseReport,
      error:
        'Serper n’est pas configuré (SERPER_API_KEY). ' +
        'La collecte News est désactivée tant que cette variable n’est pas renseignée côté backend.',
      notes: [
        'Module News en attente de configuration Serper (clé API google.serper.dev).',
      ],
    };
  }

  // Thèmes admin : la pertinence d'un article est jugée strictement sur ces labels.
  const themes = await Theme.find().sort({ order: 1, label: 1 }).lean();
  const themeLabels = themes.map((t) => String(t.label || '').trim()).filter(Boolean);
  if (!themeLabels.length) {
    return {
      ...baseReport,
      error:
        'Aucun thème configuré dans le panneau admin. ' +
        'Le filtre « articles liés aux thèmes » exige au moins un thème (page Administration → Thèmes).',
      notes: ['Ajoutez des thèmes admin avant de lancer la collecte.'],
    };
  }

  const sources = await NewsSource.find({ active: true }).sort({ createdAt: 1 });

  // Collecte mécanique (contenu plein) jusqu'au plafond global.
  const report = {
    ...baseReport,
    sourcesTraitees: sources.length,
  };

  const pool = [];
  let budget = MAX_TOTAL_PER_RUN;
  for (const src of sources) {
    const res = await scrapeSource(src, themeLabels);
    report.sources.push({
      name: res.source,
      found: res.found ?? 0,
      doublons: res.doublons ?? 0,
      nouveaux: res.nouveaux ? res.nouveaux.length : 0,
      error: res.error || null,
      logs: res.logs || [],
    });
    report.totalTrouves += res.found ?? 0;
    report.doublonsIgnores += res.doublons ?? 0;
    if (res.nouveaux) {
      for (const a of res.nouveaux) {
        if (budget <= 0) break;
        pool.push(a);
        budget -= 1;
      }
    }
    if (budget <= 0) break;
  }

  if (!pool.length) {
    report.notes.push('Aucun nouvel article (tout était déjà en base ou aucune source retournée).');
    return report;
  }

  // Jugement DeepSeek par lots — SEUL fournisseur IA utilisé ici.
  const authorizedHosts = [...new Set(sources.map((s) => hostOf(s.url)))].filter(Boolean);
  const kept = [];
  for (const batch of chunk(pool, AI_BATCH)) {
    try {
      const avis = await judgeArticlesBatch(batch, themeLabels, authorizedHosts);
      for (const a of batch) {
        const v = avis.get(a.url);
        if (!v || !v.pertinent) {
          report.horsThemes += 1;
          continue;
        }
        kept.push({
          url: a.url,
          sourceName: a.sourceName,
          sourceUrl: a.sourceUrl,
          title: a.title,
          resume: v.resume || a.snippet || '',
          content: a.content || '',
          themes: v.themes.slice(0, 5),
          category: v.category || 'Autre',
          tags: v.tags || [],
          publishedAt: a.publishedAt || new Date(),
        });
      }
    } catch (err) {
      report.notes.push(`Lot DeepSeek ignoré (${err.message}) — ${batch.length} article(s) non traités.`);
    }
  }

  // Insertion des seuls articles pertinents (upsert anti-course).
  let inseres = 0;
  for (const a of kept) {
    const resInsert = await NewsArticle.updateOne(
      { url: a.url },
      {
        $setOnInsert: {
          sourceName: a.sourceName,
          sourceUrl: a.sourceUrl,
          url: a.url,
          titleHash: cleanHash(a.title),
          title: a.title,
          resume: a.resume,
          content: a.content,
          themes: a.themes,
          category: a.category,
          tags: a.tags,
          publishedAt: a.publishedAt,
        },
      },
      { upsert: true }
    );
    if (resInsert.upsertedCount > 0) inseres += 1;
  }
  report.totalNouveaux = inseres;

  // Glossaire du jour : uniquement s'il y a de réels nouveaux articles.
  if (inseres > 0) {
    try {
      report.glossaire = await generateDailyGlossary(kept, inseres);
    } catch (err) {
      report.notes.push(`Glossaire DeepSeek ignoré (${err.message}).`);
    }
  } else {
    report.notes.push('Aucun article pertinent ajouté — le glossaire du jour n’a pas été régénéré.');
  }

  return report;
}

module.exports = { runNewsScan, todayKey, serperConfigured, serperSearch };
