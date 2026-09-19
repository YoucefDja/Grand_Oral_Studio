/**
 * Exemples de référence extraits des diaporamas réels de l'étudiant
 * (« Gestion de la sécurité mP.pptx » et « Grand_oral_3_Virtualisation_cloud_IOT_MP.pptx »,
 * 24 slides chacun).
 *
 * Rôle : ces extraits sont injectés dans l'export « Claude Design » et dans le
 * bloc de style partagé pour que le modèle copie le TON et la FORMULATION de
 * l'étudiant — jamais la mise en page. Ils sont figés dans le code (et non lus
 * depuis le disque) car les .pptx d'origine ne font pas partie du dépôt.
 *
 * Format de chaque exemple : titre de slide, puces telles qu'écrites, note
 * orateur telle qu'écrite. Aucune reformulation : c'est la matière brute qui
 * sert de calibrage stylistique.
 */

/** Ce que ces exemples doivent servir — rappelé au modèle dans l'export. */
const CONSIGNE_EXEMPLES = `Les extraits ci-dessous proviennent de diaporamas réellement présentés par l'étudiant. Ils servent de RÉFÉRENCE DE STYLE et d'ÉLOCUTION : ils montrent comment il écrit et comment il parle. Ce ne sont PAS des modèles à recopier : ne reprends ni leur mise en page, ni leurs couleurs, ni leur décoration. Calibre en revanche le ton, le registre, la longueur des phrases et le vocabulaire pour que le rendu sonne comme lui, et jamais comme une IA.
Point de vigilance : ces diaporamas d'origine ne comportaient PAS de phrase de transition en bas de slide. C'est un ajout récent, qui reste obligatoire — ne t'en dispense pas sous prétexte qu'ils n'en ont pas.`;

/**
 * CONSIGNES DE TON — « humain, pas IA ».
 *
 * Injectées dans les system prompts des deux passes (Passe A contrat, Passe B
 * découpe) ET dans l'export Claude Design. Ce n'est pas un nice-to-have : un
 * texte qui sonne IA est un défaut de génération au même titre qu'une
 * problématique copiée du sujet.
 */
const CONSIGNES_TON_HUMAIN = `TON — écris comme un humain qui présente à un CODIR, pas comme un rapport.

Slides :
- On dirait un pensé à voix haute collé au mur, pas un document.
- Puces en NOMS : truc + angle. Jamais une mini-dissertation, jamais une phrase complète.
- Ton direct, un peu sec, concret. On voit l'entreprise, pas le cours.
- Un cas = un nom d'entreprise qu'on connaît + ce qu'ils ont FAIT (ou raté). Jamais « l'entreprise X a mis en œuvre une démarche… ».
- Vocabulaire pro mais PARLÉ : on doit pouvoir le relire à l'oral sans ravaler sa salive.
- Si un mot technique est indispensable : une image simple à côté (ce que ça change pour le métier), jamais une définition de wiki.

Notes du présentateur :
- Comme si tu parlais à un pote du master en sortant de cours, mais propre.
- Phrases courtes, présent, un peu d'oral (« ça, le jury l'attend », « là je m'arrête sur le chiffre »).
- Tu COMMENTES ce qui est à l'écran, tu ne le relis pas.
- Une respiration, pas un script d'allocution.

INTERDIT (ça sonne IA, c'est un défaut de génération) :
- « il convient », « il est essentiel de », « dans un contexte en mutation », « afin de garantir », « ainsi », « par ailleurs », « en conclusion », « synergie », « au cœur de », « véritable levier », « à l'ère du », « aujourd'hui plus que jamais ».
- Le rythme de liste marketing : trois adjectifs collés, antithèses toutes faites, formules miroir.
- Le « académique propre » pour faire sérieux, et le lissage jusqu'à ce que ça sonne ChatGPT.
- Recopier la mise en page d'anciens supports.`;

/** Formules qui trahissent une rédaction IA (filet anti-formules, partagé). */
const FORMULES_IA = [
  'il convient',
  'il est essentiel',
  'dans un contexte en mutation',
  'afin de garantir',
  'par ailleurs',
  'en conclusion',
  'synergie',
  'au coeur de',
  'au cœur de',
  'veritable levier',
  'véritable levier',
  "a l'ere du",
  'à l’ère du',
  "à l'ere du",
  'aujourd’hui plus que jamais',
  "aujourd'hui plus que jamais",
];

/**
 * Exemples de slides « de contenu » : montrent la densité, la formulation
 * nominale et les tics d'écriture (Gain / Perte, TOHEE nommé en clair).
 */
const EXEMPLES_SLIDES = [
  {
    provenance: 'Management du SI — Enjeux',
    titre: 'Enjeux',
    puces: [
      'Technique — Coûts de mise en œuvre · Complexité des systèmes informatiques · Perte ou fuite de données',
      'Organisationnels — Procédures et sensibilisations omniprésentes · Interruption de l\'activité et perte de revenu',
      'Humain — Restriction des libertés individuelles et collectives',
      'Économiques — Perte de revenus due aux cyberattaques · Dégradation de l\'image de l\'entreprise · Sanctions et amendes',
      'Environnementaux — Coût élevé de remise en état · Temps long de remise en état',
    ],
    note: 'AC',
  },
  {
    provenance: 'Virtualisation, cloud et IoT — Enjeux',
    titre: 'Enjeux',
    puces: [
      'Technique — Gain : amélioration des performances. Perte : complexité de la transition.',
      'Organisationnel — Gain : agilité opérationnelle. Perte : résistance au changement.',
      'Humain — Gain : amélioration de l\'expérience utilisateur. Perte : stress et incertitude.',
      'Économique — Gain : réduction des coûts d\'exploitation. Perte : coûts de transition élevés.',
      'Environnemental — Gain : réduction de l\'empreinte carbone. Perte : risque de surconsommation énergétique.',
    ],
    note: 'Impliquer les parties prenantes à tous les niveaux pour surmonter la culture traditionnelle de l\'entreprise. Investir dans la formation et le développement des compétences pour pallier le manque de compétences techniques. Promouvoir une culture de collaboration pour briser les silos organisationnels.',
  },
  {
    provenance: 'Management du SI — Chiffres clés',
    titre: 'Chiffres clés',
    puces: ['4,45 millions $', '47 %', '112 %'],
    note:
      '4,45 millions $ — coût moyen d\'une fuite de données. 47 % — de sociétés victimes de ransomware choisissent de payer la rançon. 112 % — augmentation annuelle des attaques de ransomware impliquant l\'extorsion de données. Source : https://fr.statista.com/statistiques/668727/internet-attaques-cybersecurite-entreprises-francaises/',
  },
  {
    provenance: 'Management du SI — Cas d\'entreprises',
    titre: 'Exemples',
    puces: [
      'Thalès — touché deux fois par les cybercriminels de Lockbit 3.0, ayant refusé de payer la rançon.',
      'Cisco — attaqué par des groupes de hackers, compromettant l\'entreprise via des techniques sophistiquées.',
    ],
    note:
      'Thalès : touché deux fois par les cybercriminels de Lockbit 3.0, ayant refusé de payer la rançon. Cisco : attaqué par des groupes de hackers, compromettant l\'entreprise via des techniques sophistiquées.',
  },
  {
    provenance: 'Management du SI — Solutions (volet humain)',
    titre: 'Solutions',
    puces: [
      'Humain — Sensibilisation · Formation · Communication',
      'Humain — Mises à jour et correctifs réguliers · Gestion des identités et des accès · Plans de réponse aux incidents · Politiques de confidentialité',
        ],
    note:
      'Programmes de formation. Sensibilisation au phishing. Bonnes pratiques en sécurité. Communication interne. Sensibilisation des utilisateurs.',
  },
  {
    provenance: 'Virtualisation, cloud et IoT — Obstacles',
    titre: 'Existant',
    puces: [
      'Tradition de l\'entreprise',
      'Résistance au changement',
      'Incertitude ROI',
      'Manque de compétences',
      'Sécurité et confidentialité',
    ],
    note: 'Obstacles culturels et organisationnels.',
  },
];

/**
 * Exemples de notes orateur : montrent le style d'élocution réel (lignes
 * courtes, ton direct, commentaire du chiffre affiché, sources en URL).
 */
const EXEMPLES_NOTES = [
  'Gain financier : vol de données, rançonnage.',
  'Analyse des meilleures pratiques : efficacité, benchmarking. Identification des modèles : références, exemples. Adaptation aux besoins : personnalisation, flexibilité.',
  'Sensibilisation et éducation. Communication et collaboration. Formation et développement des compétences. Approche progressive et itérative. Culture d\'innovation et d\'adaptabilité.',
];

/** Titres de sections réellement utilisés par l'étudiant (à imiter). */
const TITRES_OBSERVES = [
  'Sommaire',
  'Contexte',
  'Enjeux',
  'Problématique',
  'Existant & Études',
  'Exemples',
  'Solutions',
  'Conclusion',
  'Question Ouverte',
];

module.exports = {
  CONSIGNE_EXEMPLES,
  CONSIGNES_TON_HUMAIN,
  FORMULES_IA,
  EXEMPLES_SLIDES,
  EXEMPLES_NOTES,
  TITRES_OBSERVES,
};
