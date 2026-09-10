/**
 * Récupération des logos d'entreprises citées dans les slides « exemple ».
 *
 * Les logos ne sont pas stockés dans le dépôt : ils sont téléchargés à la
 * demande depuis un service de logos de marques, à partir du nom de domaine
 * fourni par l'IA (champ `domaine` des items de type exemple_entreprise).
 *
 * Principes :
 *  - source configurable via LOGO_PROVIDER (`google` par défaut, sans clé ;
 *    `logo.dev` si LOGO_DEV_TOKEN est renseigné) ;
 *  - cache disque dans backend/.cache/logos pour ne pas re-télécharger ;
 *  - toute erreur est silencieuse : un logo manquant ne doit jamais faire
 *    échouer l'export du .pptx (le rendu retombe sur une pastille d'initiales).
 */
const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', '..', '.cache', 'logos');
const TAILLE_MAX = 512 * 1024; // 512 Ko : au-delà, on considère la réponse anormale
const TYPES_OK = new Set(['image/png', 'image/jpeg', 'image/webp']);

/** Domaine nettoyé (sans protocole ni chemin), ou chaîne vide. */
function normaliserDomaine(valeur) {
  return String(valeur || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/[^a-z0-9.-]/g, '');
}

/** Sérialise un domaine en nom de fichier sûr. */
function nomDeFichier(domaine) {
  return `${domaine.replace(/[^a-z0-9.-]/g, '_')}.img`;
}

/** URL du service de logos selon le fournisseur configuré. */
function urlLogo(domaine) {
  const token = String(process.env.LOGO_DEV_TOKEN || '').trim();
  const provider = String(process.env.LOGO_PROVIDER || (token ? 'logodev' : 'google')).toLowerCase();

  if (provider === 'logodev' && token) {
    return `https://img.logo.dev/${encodeURIComponent(domaine)}?token=${encodeURIComponent(
      token
    )}&size=256&format=png`;
  }
  // Service public sans clé : renvoie le favicon haute résolution du domaine.
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domaine)}&sz=256`;
}

/** Lit le logo depuis le cache disque (null si absent). */
function lireCache(domaine) {
  try {
    const fichier = path.join(CACHE_DIR, nomDeFichier(domaine));
    if (!fs.existsSync(fichier)) return null;
    const buffer = fs.readFileSync(fichier);
    if (!buffer.length) return null;
    return { buffer, mime: buffer.readUInt32BE(0) === 0x89504e47 ? 'image/png' : 'image/jpeg' };
  } catch {
    return null;
  }
}

function ecrireCache(domaine, buffer) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(path.join(CACHE_DIR, nomDeFichier(domaine)), buffer);
  } catch {
    // Cache non inscriptible (système de fichiers en lecture seule) : sans effet
    // sur l'export, le logo sera simplement re-téléchargé la prochaine fois.
  }
}

/**
 * Télécharge le logo d'un domaine (avec cache disque).
 * @returns {Promise<{buffer: Buffer, mime: string}|null>}
 */
async function recupererLogo(domaine) {
  const propre = normaliserDomaine(domaine);
  if (!propre) return null;

  const enCache = lireCache(propre);
  if (enCache) return enCache;

  try {
    const controleur = new AbortController();
    const minuteur = setTimeout(() => controleur.abort(), 6000);
    const res = await fetch(urlLogo(propre), {
      signal: controleur.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'GrandOralStudio/1.0' },
    });
    clearTimeout(minuteur);
    if (!res.ok) return null;

    const mime = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!TYPES_OK.has(mime)) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length || buffer.length > TAILLE_MAX) return null;

    ecrireCache(propre, buffer);
    return { buffer, mime };
  } catch {
    return null;
  }
}

/**
 * Prépare les logos de tous les exemples d'entreprises du support, en base64
 * (format attendu par pptxgenjs). Renvoie une Map index de slide → logo.
 * Les échecs sont ignorés : la slide se rabat sur une pastille d'initiales.
 */
async function recupererLogosSupport(slides) {
  const cibles = [];
  (Array.isArray(slides) ? slides : []).forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const domaine = normaliserDomaine(item.domaine);
    if (domaine) cibles.push({ index, domaine });
  });

  const resultats = await Promise.all(
    cibles.map(async ({ index, domaine }) => ({
      index,
      logo: await recupererLogo(domaine),
    }))
  );

  const map = new Map();
  resultats.forEach(({ index, logo }) => {
    if (logo) {
      map.set(index, {
        data: `data:${logo.mime};base64,${logo.buffer.toString('base64')}`,
        mime: logo.mime,
      });
    }
  });
  return map;
}

module.exports = { recupererLogo, recupererLogosSupport, normaliserDomaine };
