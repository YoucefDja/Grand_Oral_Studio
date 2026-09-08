/**
 * Base de vocabulaire « habituel » d'un thème, pour un utilisateur.
 *
 * Quand un étudiant traite un NOUVEAU sujet appartenant à un thème déjà
 * travaillé, on réutilise le vocabulaire qu'il a déjà construit (mots-clés de
 * l'analyse + termes du glossaire de ses sessions précédentes sur CE thème).
 * Objectif : éviter de réinventer des termes à chaque sujet et garder une
 * continuité — en laissant la porte ouverte à de nouveaux termes réellement
 * liés au nouveau sujet (le tri pertinent est laissé au bon sens du modèle).
 */
const Session = require('../models/Session');

function normalize(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {object} params
 * @param {string|object} params.userId  propriétaire (owner) des sessions.
 * @param {string}        params.theme   libellé exact du thème (insensible à la casse).
 * @param {string|object} [params.excludeSessionId] session en cours (exclue).
 * @param {number}        [params.maxEntries=60] borne de sécurité du nombre de termes.
 * @returns {Promise<Array<{terme: string, definition: string}>>} vocabulaire trié.
 */
async function getThemeVocabulary({ userId, theme, excludeSessionId, maxEntries = 60 }) {
  const themeName = String(theme || '').trim();
  if (!userId || !themeName) return [];

  const escaped = themeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const filter = {
    owner: userId,
    theme: { $regex: new RegExp(`^${escaped}$`, 'i') },
  };
  if (excludeSessionId) filter._id = { $ne: excludeSessionId };

  // Sessions les plus récentes d'abord : la définition retenue pour un même
  // terme sera donc la plus fraîche.
  const sessions = await Session.find(filter)
    .select('data')
    .sort({ updatedAt: -1 })
    .lean();

  const map = new Map();
  const add = (label, definition) => {
    const key = normalize(label);
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, {
        terme: String(label).trim(),
        definition: String(definition || '').trim(),
      });
    }
  };

  for (const session of sessions) {
    const data = session.data || {};
    const glossaire = Array.isArray(data.glossaire && data.glossaire.termes)
      ? data.glossaire.termes
      : [];
    for (const t of glossaire) add(t && t.terme, t && t.definition);

    const motsCles = Array.isArray(data.analyse && data.analyse.mots_cles)
      ? data.analyse.mots_cles
      : [];
    for (const m of motsCles) add(m && m.mot, m && m.definition);

    if (map.size >= maxEntries * 2) break; // borne de sécurité mémoire.
  }

  const vocab = Array.from(map.values()).slice(0, maxEntries);
  vocab.sort((a, b) => a.terme.localeCompare(b.terme, 'fr', { sensitivity: 'base' }));
  return vocab;
}

module.exports = { getThemeVocabulary };
