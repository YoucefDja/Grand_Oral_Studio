/**
 * Contenu des pages légales (FR + EN). Modèles pour un projet étudiant / démo :
 * à faire valider par un professionnel avant une mise en production publique.
 *
 * Chaque page : { title, notice?, sections: [{ h, lines: [string…] }] }
 * Les lignes peuvent contenir des jetons {editor}, {email}, {hostName}, etc.
 * (remplacés par legalVars() au rendu).
 */

export const LEGAL_CONTENT = {
  mentions: {
    fr: {
      title: 'Mentions légales',
      sections: [
        {
          h: 'Identité de l’éditeur',
          lines: [
            'Le site {site} est édité par {editor}, personne physique (projet étudiant et démonstratif).',
            'E-mail de contact : {email}.',
            'Localisation : {location}.',
          ],
        },
        {
          h: 'Publication',
          lines: [
            'Directeur de la publication : {editor}.',
            'Le site est proposé à titre éducatif et personnel, en lien avec la préparation au Grand Oral CESI.',
          ],
        },
        {
          h: 'Hébergement',
          lines: [
            'Le site est hébergé par {hostName} ({hostLink}).',
            'Adresse de l’hébergeur : {hostAddressFull}.',
          ],
        },
        {
          h: 'Propriété intellectuelle',
          lines: [
            'La structure, l’interface et les contenus propres au site appartiennent à l’éditeur, sauf mention contraire.',
            'Les articles de veille affichés dans l’onglet News restent la propriété de leurs auteurs et éditeurs d’origine ; le site n’en propose que des extraits et des liens vers les sources.',
            'La méthodologie affichée est issue de documents fournis à l’éditeur et utilisée dans le cadre strict de ce projet.',
          ],
        },
        {
          h: 'Contenus générés par IA',
          lines: [
            'Le site utilise des modèles d’intelligence artificielle (DeepSeek, Claude) pour générer des contenus d’aide à la préparation.',
            'Ces contenus sont fournis « tels quels », à titre indicatif : ils doivent être vérifiés et restent sous la responsabilité de l’utilisateur qui les emploie.',
          ],
        },
        {
          h: 'Responsabilité',
          lines: [
            'L’éditeur s’efforce d’assurer la disponibilité et l’exactitude des informations, sans garantie de continuité ni d’exhaustivité.',
            'En cas de question, contactez {email}.',
          ],
        },
      ],
    },
    en: {
      title: 'Legal notice',
      sections: [
        {
          h: 'Publisher identity',
          lines: [
            'The {site} website is published by {editor}, an individual (student / demonstration project).',
            'Contact email: {email}.',
            'Location: {location}.',
          ],
        },
        {
          h: 'Publication',
          lines: [
            'Publishing director: {editor}.',
            'This site is provided for educational and personal purposes, related to preparation for the CESI Grand Oral.',
          ],
        },
        {
          h: 'Hosting',
          lines: [
            'The site is hosted by {hostName} ({hostLink}).',
            'Host address: {hostAddressFull}.',
          ],
        },
        {
          h: 'Intellectual property',
          lines: [
            'The structure, interface and site-specific content belong to the publisher, unless otherwise stated.',
            'News articles shown in the News tab remain the property of their original authors and publishers; the site only displays excerpts and links to the sources.',
            'The displayed methodology comes from documents provided to the publisher and is used strictly within this project.',
          ],
        },
        {
          h: 'AI-generated content',
          lines: [
            'The site uses artificial intelligence models (DeepSeek, Claude) to generate prep assistance content.',
            'These contents are provided “as is”, for guidance only: they must be verified and remain the responsibility of the user who uses them.',
          ],
        },
        {
          h: 'Liability',
          lines: [
            'The publisher makes reasonable efforts to keep the service available and information accurate, without any guarantee of continuity or completeness.',
            'For any question, contact {email}.',
          ],
        },
      ],
    },
  },

  privacy: {
    fr: {
      title: 'Politique de confidentialité',
      notice:
        'Projet étudiant / démonstratif : ce document est un modèle destiné à être validé (RGPD).',
      sections: [
        {
          h: 'Responsable du traitement',
          lines: [
            'Le traitement des données est réalisé par {editor}, en tant qu’éditeur du site {site} ({email}).',
          ],
        },
        {
          h: 'Données collectées',
          lines: [
            'Données de compte : adresse e-mail (compte créé sur invitation de l’administrateur), rôle.',
            'Contenu produit dans l’application : sujets, problématiques, étapes de préparation, veille d’articles.',
            'Préférences d’affichage : langue et thème (clair/sombre).',
            'Données techniques minimales nécessaires au fonctionnement (journal d’accès, sécurité).',
          ],
        },
        {
          h: 'Finalités et bases légales',
          lines: [
            'Fourniture du service et gestion des comptes (exécution du contrat d’utilisation).',
            'Amélioration du service et sécurité (intérêt légitime).',
            'Envoi d’e-mails transactionnels liés aux invitations et au compte (pas de prospection sans consentement).',
          ],
        },
        {
          h: 'Destinataires et sous-traitants',
          lines: [
            'Railway (hébergement et base de données MongoDB).',
            'Resend (envoi des e-mails d’invitation).',
            'DeepSeek et Anthropic : contenus d’aide générés par IA à partir des éléments saisis dans une session.',
            'Serper.dev : recherche d’articles sources lors d’une veille « Source en ligne ».',
            'Aucune donnée n’est vendue ni utilisée à des fins publicitaires.',
          ],
        },
        {
          h: 'Durées de conservation',
          lines: [
            'Les données de compte et les sessions sont conservées tant que le compte est actif.',
            'Vous pouvez demander la suppression de vos données à tout moment ({email}).',
          ],
        },
        {
          h: 'Cookies et traceurs',
          lines: [
            'Le site n’utilise pas de traceurs publicitaires ni d’analytics tiers.',
            'Le stockage local (localStorage) sert uniquement au maintien de la connexion et aux préférences d’affichage.',
          ],
        },
        {
          h: 'Vos droits (RGPD)',
          lines: [
            'Vous disposez d’un droit d’accès, de rectification, d’effacement, de limitation, de portabilité et d’opposition sur vos données.',
            'Pour les exercer : {email}. Vous pouvez également saisir la CNIL (cnil.fr).',
          ],
        },
        {
          h: 'Note projet / démo',
          lines: [
            'Ce site est un projet étudiant. Les textes sont fournis à titre de modèle et doivent être validés avant toute ouverture publique réelle.',
          ],
        },
      ],
    },
    en: {
      title: 'Privacy policy',
      notice:
        'Student / demonstration project: this document is a template to be validated (GDPR).',
      sections: [
        {
          h: 'Data controller',
          lines: [
            'Data processing is carried out by {editor}, as publisher of the {site} website ({email}).',
          ],
        },
        {
          h: 'Collected data',
          lines: [
            'Account data: email address (account created upon administrator invitation), role.',
            'Content created in the app: subjects, research questions, prep steps, article watch.',
            'Display preferences: language and theme (light/dark).',
            'Minimal technical data required for operation (access logs, security).',
          ],
        },
        {
          h: 'Purposes and legal bases',
          lines: [
            'Service delivery and account management (performance of the terms of use).',
            'Service improvement and security (legitimate interest).',
            'Transactional emails related to invitations and the account (no marketing without consent).',
          ],
        },
        {
          h: 'Recipients and sub-processors',
          lines: [
            'Railway (hosting and MongoDB database).',
            'Resend (sending invitation emails).',
            'DeepSeek and Anthropic: AI-generated prep content based on data entered in a session.',
            'Serper.dev: searching source articles during a “Source en ligne” watch.',
            'No data is sold or used for advertising purposes.',
          ],
        },
        {
          h: 'Retention periods',
          lines: [
            'Account data and sessions are kept as long as the account is active.',
            'You may request deletion of your data at any time ({email}).',
          ],
        },
        {
          h: 'Cookies and trackers',
          lines: [
            'The site uses no advertising trackers nor third-party analytics.',
            'Local storage is only used to keep you signed in and store display preferences.',
          ],
        },
        {
          h: 'Your rights (GDPR)',
          lines: [
            'You have rights of access, rectification, erasure, restriction, portability and objection over your data.',
            'To exercise them: {email}. You may also contact the CNIL (cnil.fr).',
          ],
        },
        {
          h: 'Project / demo note',
          lines: [
            'This site is a student project. These texts are provided as a template and must be validated before any real public launch.',
          ],
        },
      ],
    },
  },

  cgu: {
    fr: {
      title: 'Conditions générales d’utilisation (CGU)',
      notice:
        'Projet étudiant / démonstratif : document modèle à faire valider avant toute mise en production publique.',
      sections: [
        {
          h: 'Objet',
          lines: [
            'Les présentes CGU encadrent l’utilisation du site {site} édité par {editor}.',
            'L’utilisation du site suppose l’acceptation pleine et entière des présentes conditions.',
          ],
        },
        {
          h: 'Accès et comptes',
          lines: [
            'L’accès nécessite un compte créé sur invitation de l’administrateur (lien envoyé par e-mail).',
            'Les identifiants sont personnels et confidentiels. Une seule session par compte est prévue.',
          ],
        },
        {
          h: 'Utilisation acceptable',
          lines: [
            'L’utilisateur s’engage à utiliser le site de manière licite, pour la préparation de son Grand Oral, et à ne pas en détourner le fonctionnement.',
          ],
        },
        {
          h: 'Contenus générés par IA et sources',
          lines: [
            'Le site génère des contenus d’aide par IA (analyse, problématique, plan, support…) et rassemble des articles de veille avec leurs sources.',
            'Ces contenus sont indicatifs : ils ne remplacent pas une recherche personnelle et doivent être vérifiés avant usage.',
            'Les articles restent la propriété de leurs éditeurs ; seuls des extraits et liens sont proposés.',
          ],
        },
        {
          h: 'Propriété intellectuelle',
          lines: [
            'Sauf mention contraire, les éléments propres au site (interface, structure, textes de l’éditeur) sont protégés et ne peuvent être réutilisés sans accord.',
          ],
        },
        {
          h: 'Responsabilité',
          lines: [
            'Le service est fourni « en l’état ». L’éditeur ne garantit pas une disponibilité continue ni l’absence d’erreurs.',
            'L’utilisateur est responsable de l’usage qu’il fait des contenus produits.',
          ],
        },
        {
          h: 'Suspension et suppression',
          lines: [
            'L’éditeur peut suspendre ou supprimer un compte en cas de manquement aux présentes conditions.',
          ],
        },
        {
          h: 'Données personnelles',
          lines: [
            'Le traitement des données est décrit dans la politique de confidentialité (rubrique « Confidentialité »).',
          ],
        },
        {
          h: 'Droit applicable et litiges',
          lines: [
            'Les présentes CGU sont soumises au droit français. À défaut de résolution amiable, les tribunaux français seront compétents.',
          ],
        },
        {
          h: 'Contact',
          lines: ['Pour toute question : {email}.'],
        },
      ],
    },
    en: {
      title: 'Terms of use',
      notice:
        'Student / demonstration project: template document to be validated before any real public launch.',
      sections: [
        {
          h: 'Purpose',
          lines: [
            'These terms govern the use of the {site} website published by {editor}.',
            'Using the site implies full acceptance of these terms.',
          ],
        },
        {
          h: 'Access and accounts',
          lines: [
            'Access requires an account created upon the administrator’s invitation (link sent by email).',
            'Credentials are personal and confidential. One session per account is expected.',
          ],
        },
        {
          h: 'Acceptable use',
          lines: [
            'Users agree to use the site lawfully, to prepare their Grand Oral, and not to misuse it.',
          ],
        },
        {
          h: 'AI-generated content and sources',
          lines: [
            'The site generates AI assistance content (analysis, research question, plan, support…) and gathers watch articles with their sources.',
            'These contents are for guidance only: they do not replace personal research and must be verified before use.',
            'Articles remain the property of their publishers; only excerpts and links are provided.',
          ],
        },
        {
          h: 'Intellectual property',
          lines: [
            'Unless otherwise stated, site-specific elements (interface, structure, publisher texts) are protected and may not be reused without permission.',
          ],
        },
        {
          h: 'Liability',
          lines: [
            'The service is provided “as is”. The publisher does not guarantee continuous availability or error-free operation.',
            'Users are responsible for their own use of the generated content.',
          ],
        },
        {
          h: 'Suspension and deletion',
          lines: [
            'The publisher may suspend or delete an account in case of breach of these terms.',
          ],
        },
        {
          h: 'Personal data',
          lines: [
            'Data processing is described in the privacy policy (“Privacy” section).',
          ],
        },
        {
          h: 'Applicable law and disputes',
          lines: [
            'These terms are governed by French law. Failing an amicable settlement, French courts will have jurisdiction.',
          ],
        },
        {
          h: 'Contact',
          lines: ['For any question: {email}.'],
        },
      ],
    },
  },
};
