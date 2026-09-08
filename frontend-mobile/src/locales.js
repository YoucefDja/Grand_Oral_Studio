/**
 * Dictionnaires FR / EN de l'application mobile (PWA News).
 *
 * Règles :
 * - Clés « plates », préfixées par domaine : app.*, login.*, news.*, reader.*…
 * - FR = langue par défaut (repli si une clé manque en EN).
 * - Ajouter TOUJOURS la même clé dans les deux dictionnaires.
 */

export const FR = {
  'app.loading': 'Chargement…',
  'app.logout': 'Déconnexion',
  'app.tabs': 'Onglets',

  'settings.language': 'Langue',
  'settings.theme': 'Thème',
  'settings.toggleTheme': 'Basculer le thème (clair/sombre)',
  'settings.themeLight': 'Clair',
  'settings.themeDark': 'Sombre',
  'settings.themeSystem': 'Auto',

  // ---- Connexion ----
  'login.subtitle': 'News — veille IA & Big Data',
  'login.intro':
    'Connectez-vous avec le compte que votre administrateur vous a créé pour consulter les articles.',
  'login.email': 'E-mail',
  'login.emailPlaceholder': 'vous@exemple.fr',
  'login.password': 'Mot de passe',
  'login.submit': 'Se connecter',
  'login.connecting': 'Connexion…',
  'login.error': 'Connexion impossible.',
  'login.noAccount': 'Pas de compte ? Demandez une invitation à votre administrateur (interface web).',

  // ---- News (liste / barre haute) ----
  'news.news': 'News',
  'news.article': 'Article',
  'news.pageTitle': 'Veille IA & Big Data',
  'news.loading': 'Chargement des articles…',
  'news.loadError': 'Impossible de charger les articles.',
  'news.empty':
    'Aucun article pour le moment. Lancez une veille depuis une session sur le site (étape « Source en ligne », après la problématique) : les articles récupérés arriveront ici.',
  'news.veilleFor': 'Généré pour la session',
  'news.refresh': 'Actualiser',
  'news.refreshing': 'Actualisation…',
  'news.retry': 'Réessayer',
  'news.readInApp': 'Lire dans l’app →',

  // ---- Lecteur d'article ----
  'reader.back': 'Retour aux articles',
  'reader.loading': 'Chargement de l’article…',
  'reader.loadError': 'Impossible de charger l’article.',
  'reader.unavailable':
    'Le contenu complet de cet article n’a pas pu être récupéré. Vous pouvez consulter la source d’origine ci-dessous.',
  'reader.tagsLabel': 'Tags :',
  'reader.sourceLabel': 'Source d’origine :',
  'reader.siteOrigin': 'site d’origine',
  'reader.translatedFrom': 'Traduit automatiquement',

  // ---- Glossaire personnel (onglet Glossaire) ----
  'glossary.title': 'Glossaire',
  'glossary.pageTitle': 'Mon glossaire',
  'glossary.subtitle':
    'Termes & acronymes définis dans les glossaires de vos sessions (étape Glossaire sur le site), cumulés sans doublon : de quoi réviser à tout moment.',
  'glossary.loading': 'Chargement du glossaire…',
  'glossary.loadError': 'Impossible de charger le glossaire.',
  'glossary.empty':
    'Aucun terme pour le moment. Les termes apparaîtront ici après avoir généré un glossaire dans une session (sur le site web).',
  'glossary.noDefinition': 'Définition à compléter.',
};

export const EN = {
  'app.loading': 'Loading…',
  'app.logout': 'Log out',
  'app.tabs': 'Tabs',

  'settings.language': 'Language',
  'settings.theme': 'Theme',
  'settings.toggleTheme': 'Toggle theme (light/dark)',
  'settings.themeLight': 'Light',
  'settings.themeDark': 'Dark',
  'settings.themeSystem': 'Auto',

  // ---- Sign in ----
  'login.subtitle': 'News — AI & Big Data watch',
  'login.intro':
    'Sign in with the account your administrator created for you to browse the articles.',
  'login.email': 'Email',
  'login.emailPlaceholder': 'you@example.com',
  'login.password': 'Password',
  'login.submit': 'Sign in',
  'login.connecting': 'Signing in…',
  'login.error': 'Unable to sign in.',
  'login.noAccount': 'No account? Ask your administrator for an invitation (web app).',

  // ---- News (list / top bar) ----
  'news.news': 'News',
  'news.article': 'Article',
  'news.pageTitle': 'AI & Big Data watch',
  'news.loading': 'Loading articles…',
  'news.loadError': 'Unable to load articles.',
  'news.empty':
    'No articles for now. Run a veille from a session on the website (Source en ligne step, after the research question): the fetched articles will land here.',
  'news.veilleFor': 'Generated for session',
  'news.refresh': 'Refresh',
  'news.refreshing': 'Refreshing…',
  'news.retry': 'Try again',
  'news.readInApp': 'Read in the app →',

  // ---- Article reader ----
  'reader.back': 'Back to articles',
  'reader.loading': 'Loading article…',
  'reader.loadError': 'Unable to load the article.',
  'reader.unavailable':
    'The full content of this article could not be fetched. You can check the original source below.',
  'reader.tagsLabel': 'Tags:',
  'reader.sourceLabel': 'Original source:',
  'reader.siteOrigin': 'the original site',
  'reader.translatedFrom': 'Auto-translated',

  // ---- Personal glossary (Glossary tab) ----
  'glossary.title': 'Glossary',
  'glossary.pageTitle': 'My glossary',
  'glossary.subtitle':
    'Terms & acronyms defined in the glossaries of your sessions (Glossary step on the website), merged with no duplicates: handy for reviewing anytime.',
  'glossary.loading': 'Loading the glossary…',
  'glossary.loadError': 'Unable to load the glossary.',
  'glossary.empty':
    'No term yet. Terms will appear here after you generate a glossary in a session (on the website).',
  'glossary.noDefinition': 'Definition to be completed.',
};

export const LOCALES = { fr: FR, en: EN };
