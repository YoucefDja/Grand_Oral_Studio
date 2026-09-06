/**
 * Module News — moteur de collecte d'articles.
 *
 * Flux :
 *  1. lit les sources actives en base (NewsSource) ;
 *  2. pour chaque source, récupère sa page/flux, extrait les liens d'articles ;
 *  3. anti-doublon strict : URL d'origine unique en base (NewsArticle.url) ;
 *     un article déjà présent est ignoré, jamais inséré deux fois ;
 *  4. récupère le contenu de chaque nouvel article (titre, résumé, date) ;
 *  5. DeepSeek structure/classifie les articles (résumé + thème) si la clé
 *     existe — et confirme qu'ils proviennent des sources autorisées ;
 *  6. génère le glossaire du jour (NewsGlossary) via DeepSeek.
 *
 * Tolérant aux pannes : une source en erreur ne bloque jamais le lot entier.
 */

const cheerio = require('cheerio');
const NewsSource = require('../models/NewsSource');
const NewsArticle = require('../models/NewsArticle');
const NewsGlossary = require('../models/NewsGlossary');
const { generateDeepseek } = require('./deepseek');
const { parseJsonStrict } = require('./anthropic');

const UA =
  'Mozilla/5.0 (compatible; GrandOralStudioNews/1.0; +https://grand-oral-studio.local)';

const MAX_PER_SOURCE = parseInt(process.env.NEWS_MAX_PER_SOURCE || '10', 10) || 10;
const MAX_TOTAL_PER_RUN = parseInt(process.env.NEWS_MAX_PER_RUN || '50', 10) || 50;
const TIMEOUT_MS = 20000;
const FETCH_LIMIT = parseInt(process.env.NEWS_FETCH_LIMIT || '200', 10) || 200;

// Segments d'URL qui ne sont jamais des articles (navigation, listes, tags…).
const NAV_SEGMENTS = new Set([
  'tag', 'tags', 'category', 'categories', 'author', 'authors', 'about',
  'contact', 'privacy', 'terms', 'login', 'register', 'search', 'page',
  'wp-json', 'feed', 'rss', 'archive', 'archives', 'newsletter', 'advertise',
  'careers', 'press', 'legal', 'cookie', 'sitemap', 'category', 'video',
  'gallery', 'events', 'community',
]);

const EXTENSION_SKIP = /\.(png|jpe?g|gif|webp|svg|pdf|zip|mp4|mp3|css|js|json|xml)$/i;

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

function decodeBody(buffer, contentType) {
  const charset = (String(contentType || '').match(/charset=([\w-]+)/i) || [])[1];
  try {
    return new TextDecoder(charset || 'utf-8').decode(buffer);
  } catch (_e) {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': UA,
      accept: 'text/html,application/xhtml+xml,application/xml,application/rss+xml,*/*;q=0.8',
      'accept-language': 'fr,en;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw httpError(res.status, `HTTP ${res.status} pour ${url}`);
  const buffer = await res.arrayBuffer();
  const contentType = res.headers.get('content-type') || '';
  return { text: decodeBody(buffer, contentType), contentType };
}

function toAbsoluteUrl(href, base) {
  try {
    return new URL(href, base).href;
  } catch (_e) {
    return null;
  }
}

/** Découpe un URL : { origin, hostname, pathname, url } */
function urlParts(raw) {
  try {
    const u = new URL(raw);
    return {
      origin: u.origin,
      hostname: u.hostname,
      pathname: u.pathname,
      protocol: u.protocol,
      url: u.href,
    };
  } catch (_e) {
    return null;
  }
}

function stripQuery(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    // On retire uniquement les paramètres de tracking (utm, réseaux sociaux…).
    // Le reste de la query est conservé : certaines URLs d'articles en dépendent.
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

/** Un lien ressemble-t-il à un article ? (heuristique de filtrage du bruit). */
function looksLikeArticle(href, base) {
  const abs = toAbsoluteUrl(href, base);
  if (!abs) return false;
  const parts = urlParts(abs);
  if (!parts) return false;
  if (parts.protocol !== 'https:' && parts.protocol !== 'http:') return false;
  if (parts.pathname === '/' || parts.pathname === '') return false;
  if (EXTENSION_SKIP.test(parts.pathname)) return false;
  const segs = parts.pathname.split('/').filter(Boolean);
  if (segs.length === 0) return false;
  if (segs.some((s) => NAV_SEGMENTS.has(s.toLowerCase()))) return false;
  // Un simple mot-clé court est souvent une page d'archive, pas un article.
  if (segs.length === 1 && segs[0].length < 8) return false;
  return true;
}

/** Parse un flux RSS 2.0 ou Atom (text/XML) en items. */
function parseFeedXml(xml) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const out = [];
  $('item, entry').each((_i, el) => {
    const g = $(el);
    const title = cleanText(g.find('title').first().text());
    const linkEl = g.find('link').first();
    const link =
      linkEl.attr('href') || cleanText(linkEl.text()) || cleanText(g.find('guid').first().text());
    const desc =
      cleanText(g.find('description').first().text()) ||
      cleanText(g.find('summary').first().text()) ||
      cleanText(g.find('content').first().text());
    const pub =
      cleanText(g.find('pubDate, published, updated').first().text()) ||
      g.find('pubDate, published').attr('datetime') ||
      '';
    if (title && link) out.push({ title, link, description: desc, pubDate: pub });
  });
  return out;
}

/** Découvre le premier flux RSS/Atom annoncé dans une page HTML. */
function findFeedUrlFromHtml($, base) {
  let feed = '';
  $('link[rel="alternate"]').each((_i, el) => {
    const type = $(el).attr('type') || '';
    if (feed) return;
    if (type.includes('rss') || type.includes('atom') || type.includes('xml')) {
      const href = $(el).attr('href');
      if (href) feed = toAbsoluteUrl(href, base) || '';
    }
  });
  return feed;
}

/** Extrait les liens d'articles depuis une page de liste HTML. */
function extractArticleLinks($, base, { sameHost = true } = {}) {
  let baseHost = '';
  try {
    baseHost = new URL(base).hostname.toLowerCase();
  } catch (_e) {
    /* base invalide → aucun filtre d'hôte */
  }
  const seen = new Set();
  const links = [];
  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href') || '';
    const url = stripQuery(toAbsoluteUrl(href, base) || '');
    if (!url || seen.has(url)) return;
    if (!looksLikeArticle(href, base)) return;
    if (sameHost && baseHost) {
      let host = '';
      try {
        host = new URL(url).hostname.toLowerCase();
      } catch (_e) {
        /* ignoré */
      }
      if (host && host !== baseHost && !host.endsWith('.' + baseHost)) return;
    }
    seen.add(url);
    links.push(url);
  });
  return links;
}

/** Récupère une page d'article et en tire { title, description, publishedAt }. */
async function scrapeArticlePage(url) {
  const { text } = await fetchText(url);
  const $ = cheerio.load(text);
  const ogTitle = cleanText($('meta[property="og:title"]').attr('content'));
  const htmlTitle = cleanText($('title').first().text());
  const h1 = cleanText($('h1').first().text());
  const title = ogTitle || h1 || htmlTitle || '';

  const ogDesc = cleanText($('meta[property="og:description"]').attr('content'));
  const metaDesc = cleanText($('meta[name="description"]').attr('content'));
  let firstP = '';
  $('article p, main p, .post-content p').each((_i, el) => {
    if (firstP) return;
    const t = cleanText($(el).text());
    if (t.length > 60) firstP = t.slice(0, 600);
  });
  const description = ogDesc || metaDesc || firstP || '';

  const pubRaw =
    $('meta[property="article:published_time"]').attr('content') ||
    $('meta[name="article:published_time"]').attr('content') ||
    $('time[datetime]').first().attr('datetime') ||
    cleanText($('time').first().text()) ||
    '';
  let publishedAt = null;
  if (pubRaw) {
    const d = new Date(pubRaw);
    if (!Number.isNaN(d.getTime())) publishedAt = d;
  }
  return { title, description, publishedAt, url };
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

async function deepseekAvailable() {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

/**
 * Appel DeepSeek unique sur un lot d'articles pour produire des résumés +
 * classification, et ne retenir que ce qui provient des sources autorisées.
 * Retourne une Map url → { resume, category, tags } (vide en cas d'échec).
 */
async function classifyArticles(articles) {
  const result = new Map();
  if (!articles.length) return result;
  try {
    const system =
      "Tu es un assistant de veille IA / Big Data. À partir d'une liste JSON d'articles " +
      '(chacun avec url, source et titre), produis UNIQUEMENT un objet JSON de la forme : ' +
      '{"articles":[{"url":"…","source_autorisee":true|false,"resume":"résumé en 1-2 phrases en français","category":"IA|Big Data|Cloud|Autre","tags":["tag1","tag2"]}]}. ' +
      "Ne garde aucun commentaire, aucune balise. Si un article ne provient pas d'une source " +
      'autorisée, mets source_autorisee à false et resume vide.';
    const user = JSON.stringify(
      articles.map((a) => ({ url: a.url, source: a.sourceName, title: a.title }))
    );
    const raw = await generateDeepseek(system, user);
    const parsed = parseJsonStrict(raw);
    const list = Array.isArray(parsed?.articles) ? parsed.articles : [];
    for (const item of list) {
      if (!item || typeof item.url !== 'string') continue;
      const url = item.url;
      if (item.source_autorisee === false) {
        result.set(url, { resume: '', category: 'Rejeté', tags: [], reject: true });
      } else {
        result.set(url, {
          resume: String(item.resume || '').trim(),
          category: String(item.category || '').trim(),
          tags: Array.isArray(item.tags) ? item.tags.map((t) => String(t)).slice(0, 5) : [],
        });
      }
    }
  } catch (err) {
    console.warn('[news] Classification DeepSeek ignorée :', err.message);
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
    sample.map((a) => ({ titre: a.title, resume: a.resume || a.description || '' }))
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

/** Scrape UNE source active et retourne les articles nouvellement insérés. */
async function scrapeSource(source) {
  const logs = [];
  const found = [];
  try {
    // 1) On récupère la page / le flux déclaré de la source.
    let text;
    let contentType;
    try {
      ({ text, contentType } = await fetchText(source.url));
    } catch (err) {
      throw new Error(`Récupération de la source impossible : ${err.message}`);
    }

    // Un document EST traité comme un flux XML uniquement si le type de
    // contenu l'indique, ou si le corps commence explicitement par une
    // déclaration XML / une balise racine <rss> ou <feed>. Une page HTML
    // commence par "<!DOCTYPE" ou "<html>" : elle ne doit PAS être lue en XML.
    const trimmedStart = text.replace(/^\uFEFF/, '').trimStart();
    const looksXml =
      /xml|rss|atom/i.test(contentType) ||
      /^<\?xml/i.test(trimmedStart) ||
      /^<(rss|feed)[\s>]/i.test(trimmedStart);
    const base = source.url;
    let items = [];

    if (looksXml) {
      // La source EST un flux RSS/Atom.
      items = parseFeedXml(text).map((it) => ({ ...it, href: stripQuery(it.link) }));
    } else {
      const $ = cheerio.load(text);
      const feedUrl = findFeedUrlFromHtml($, base);
      if (feedUrl) {
        try {
          const feedRes = await fetchText(feedUrl);
          items = parseFeedXml(feedRes.text).map((it) => ({ ...it, href: stripQuery(it.link) }));
        } catch (_err) {
          logs.push('Flux RSS annoncé injoignable, repli sur le HTML.');
        }
      }
      if (items.length === 0) {
        // 2) Pas de flux exploitable : on parse les liens d'articles de la page.
        const hrefs = extractArticleLinks($, base).slice(0, FETCH_LIMIT);
        for (const href of hrefs) {
          items.push({ title: '', description: '', pubDate: '', href });
        }
      }
    }

    // 3) Filtrage : URL valide + pas déjà connue de cette exécution.
    const candidates = [];
    for (const item of items) {
      const url = stripQuery(toAbsoluteUrl(item.href || item.link, base) || '');
      if (!url) continue;
      if (found.includes(url)) continue;
      found.push(url);
      candidates.push({
        url,
        feedTitle: cleanText(item.title),
        feedDescription: cleanText(item.description),
        pubRaw: item.pubDate,
      });
    }

    // 4) Anti-doublon stricte contre la base.
    const existing = new Set(
      (
        await NewsArticle.find({ url: { $in: candidates.map((c) => c.url) } })
          .select('url')
          .lean()
      ).map((d) => d.url)
    );
    const doublons = candidates.filter((c) => existing.has(c.url)).length;
    const nouveaux = candidates.filter((c) => !existing.has(c.url)).slice(0, MAX_PER_SOURCE);

    // 5) Récupération du contenu de chaque nouvel article (tolérante).
    const scraped = [];
    for (const c of nouveaux) {
      try {
        const page = await scrapeArticlePage(c.url);
        if (!page.title) continue;
        scraped.push({
          url: c.url,
          title: cleanText(page.title),
          resume: cleanText(page.description || c.feedDescription).slice(0, 900),
          publishedAt: page.publishedAt || (c.pubRaw ? new Date(c.pubRaw) : null) || new Date(),
        });
      } catch (_err) {
        logs.push(`Contenu ignoré (${c.url})`);
      }
    }

    // 6) Classification DeepSeek (résumé + catégorie) si la clé existe.
    let classif = new Map();
    if (await deepseekAvailable()) {
      classif = await classifyArticles(scraped);
    }

    // 7) Insertion en base des seuls articles non rejetés par la source autorisée.
    const inseres = [];
    for (const a of scraped) {
      const cls = classif.get(a.url) || {};
      if (cls.reject) continue;
      // Upsert conditionnel : si une URL identique a été insérée entre-temps
      // (exécution concurrente), $setOnInsert ne modifie rien et on compte 0.
      const resInsert = await NewsArticle.updateOne(
        { url: a.url },
        {
          $setOnInsert: {
            sourceName: source.name,
            sourceUrl: source.url,
            url: a.url,
            titleHash: cleanHash(a.title),
            title: a.title,
            resume: (cls.resume && cls.resume.length > 20 ? cls.resume : a.resume) || a.resume,
            publishedAt: a.publishedAt,
            category: cls.category || '',
            tags: cls.tags || [],
          },
        },
        { upsert: true }
      );
      if (resInsert.upsertedCount > 0) {
        inseres.push({ url: a.url, title: a.title });
      }
    }

    source.lastScrapedAt = new Date();
    source.lastError = '';
    await source.save();
    return {
      source: source.name,
      found: found.length,
      doublons,
      nouveaux: inseres,
      logs,
    };
  } catch (err) {
    source.lastError = String(err.message || err).slice(0, 400);
    await source.save().catch(() => {});
    return { source: source.name, error: source.lastError, logs };
  }
}

/**
 * Exécute le balayage complet (cron quotidien OU déclenchement manuel).
 * Retourne un rapport agrégé.
 */
async function runNewsScan() {
  // Documents Mongoose (non lean) : scrapeSource met à jour lastScrapedAt/lastError.
  const sources = await NewsSource.find({ active: true }).sort({ createdAt: 1 });
  const report = {
    date: todayKey(),
    sourcesTraitees: sources.length,
    sources: [],
    totalTrouves: 0,
    totalNouveaux: 0,
    doublonsIgnores: 0,
    glossaire: null,
    notes: [],
  };

  let stockNouveaux = [];
  let totalDoublons = 0;
  for (const src of sources) {
    const res = await scrapeSource(src);
    report.sources.push({
      name: res.source,
      found: res.found ?? 0,
      doublons: res.doublons ?? 0,
      nouveaux: res.nouveaux ? res.nouveaux.length : 0,
      error: res.error || null,
      logs: res.logs || [],
    });
    report.totalTrouves += res.found ?? 0;
    totalDoublons += res.doublons ?? 0;
    report.totalNouveaux += res.nouveaux ? res.nouveaux.length : 0;
    if (res.nouveaux) stockNouveaux = stockNouveaux.concat(res.nouveaux);
    if (stockNouveaux.length >= MAX_TOTAL_PER_RUN) break;
  }

  report.doublonsIgnores = totalDoublons;

  // Glossaire du jour : uniquement s'il y a de NOUVEAUX articles à analyser.
  // Régénérer le glossaire à partir des mêmes articles déjà vus (jour sans
  // nouveauté) produirait un contenu quasi identique daté autrement — inutile.
  if (report.totalNouveaux > 0) {
    if (await deepseekAvailable()) {
      report.glossaire = await generateDailyGlossary(stockNouveaux, report.totalNouveaux);
    } else {
      report.notes.push('DEEPSEEK_API_KEY absente : pas de résumé/classement/glossaire généré par IA.');
    }
  } else {
    report.notes.push(
      'Aucun nouvel article : le glossaire du jour n’a pas été régénéré (pas de nouveau contenu à analyser).'
    );
  }

  return report;
}

module.exports = { runNewsScan, todayKey, parseFeedXml, looksLikeArticle };
