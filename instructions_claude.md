# RÔLE

# Tu es développeur senior full-stack. Tu vas ajouter UNE fonctionnalité à mon application web existante, sans toucher au reste.

# 

# CONTEXTE

# Mon application traite un sujet relatif à un thème en suivant une méthodologie précise, puis génère successivement : une analyse, une problématique, un glossaire, et enfin un fichier Markdown destiné à être copié-collé dans une conversation d'un Projet Claude (qui contient mes instructions + des diaporamas exemples pour le ton et le vocabulaire).

# 

# PROBLÈME À RÉSOUDRE

# Claude Design (l'outil de génération de diaporamas) fonctionne de manière totalement indépendante : il n'a accès NI à mes Projets Claude, NI à mes instructions, NI à mes diaporamas exemples, NI à mon style. Il ne connaît que ce qu'on lui colle dans le brief.

# Donc : le markdown que je colle habituellement dans mon Projet Claude ne suffit PAS pour Claude Design. Il faut un SECOND export, auto-suffisant, qui embarque TOUT mon contexte (instructions, style, ton, vocabulaire, structure des slides, exemples) pour que Claude Design produise un résultat fidèle même sans accès à mes projets.

# 

# CE QUE JE VEUX

# À la dernière étape de l'application (celle qui produit le markdown final), ajouter un BOUTON supplémentaire : « Exporter pour Claude Design ».

# Ce bouton génère un fichier .md distinct (téléchargeable et/ou copiable) contenant TOUT le contexte nécessaire, de façon autonome.

# 

# CONTRAINTES

# \- Ne modifie aucune fonctionnalité existante, ne touche pas aux exports actuels.

# \- Le bouton s'ajoute à côté de l'export existant, sans le remplacer.

# \- Le nouveau markdown doit être auto-suffisant : une personne (ou une IA) qui ne connaît RIEN à mon projet doit pouvoir produire le diaporama attendu à partir de ce seul fichier.

# \- Réutilise les instructions / règles / exemples déjà stockés dans l'app (ceux utilisés pour le Projet Claude). Ne les duplique pas en dur : lis-les depuis leur source actuelle.

# \- Si certaines de ces informations ne sont PAS stockées dans l'app et vivent uniquement dans mon Projet Claude, signale-le moi clairement et propose une structure de fichier pour les y intégrer.

# 

# STRUCTURE EXACTE DU MARKDOWN « CLAUDE DESIGN » À GÉNÉRER

# Le fichier doit contenir, dans cet ordre, des sections explicites et titrées :

# 

# 1\. RÔLE ET MISSION

# &#x20;  - Explique à Claude Design qu'il doit produire une présentation (diaporama) sur le sujet fourni, en respectant strictement tout ce qui suit.

# &#x20;  - Précise la durée cible (20 minutes) et le nombre de slides attendu (\~20-25), donc rythme d'environ 1 slide / 45-60 secondes.

# 

# 2\. SUJET ET THÈME

# &#x20;  - Le sujet traité.

# &#x20;  - Le thème parent.

# &#x20;  - Le public visé (jury de Grand Oral) et le contexte (oral académique).

# 

# 3\. TON, STYLE ET VOCABULAIRE (CRUCIAL)

# &#x20;  - Le registre attendu (académique, précis, sobre).

# &#x20;  - Le vocabulaire à privilégier (injecter ici les termes/types de formulations issus de mes instructions et de mes diaporamas exemples).

# &#x20;  - Le vocabulaire à éviter (formules creuses, familiarités, anglicismes inutiles, etc.).

# &#x20;  - La longueur cible des phrases.

# &#x20;  - Le niveau de détail par slide.

# 

# 4\. STRUCTURE IMPOSÉE DES SLIDES

# &#x20;  - Le squelette exact slide par slide : numéro, rôle (ex. slide de transition, slide de définition, slide d'argument), titre attendu, contenu attendu.

# &#x20;  - Les règles de progression (analyse → problématique → glossaire → synthèse, ou l'ordre réel de ma méthodologie).

# &#x20;  - Interdiction d'ajouter, fusionner ou supprimer des slides hors structure, sauf indication contraire.

# 

# 5\. CONTENU GÉNÉRÉ PAR L'APP

# &#x20;  - L'analyse complète.

# &#x20;  - La problématique.

# &#x20;  - Le glossaire.

# &#x20;  - (Ces éléments alimentent directement les slides, ils doivent être présents en clair.)

# 

# 6\. EXEMPLES DE RÉFÉRENCE (STYLE)

# &#x20;  - Un ou plusieurs exemples de slides issus de mes diaporamas habituels, pour que Claude Design copie le ton et la formulation.

# &#x20;  - Si ces exemples ne sont pas stockés dans l'app : me le signaler et prévoir un emplacement pour les coller.

# 

# 7\. CONSIGNES FINALES À CLAUDE DESIGN

# &#x20;  - « Respecte strictement le ton, le vocabulaire et la structure ci-dessus. »

# &#x20;  - « N'invente aucun contenu hors des éléments fournis. »

# &#x20;  - « Si une information manque, pose la question au lieu de la fabriquer. »

# &#x20;  - « Ne décore pas à outrance : sobriété académique. »

# 

# MÉTHODE

# 1\. Montre-moi d'abord où, dans le code, sont stockés : la méthodologie, les instructions de style, et les diaporamas exemples.

# 2\. Dis-moi lesquels de ces éléments sont absents de l'app (et vivent seulement dans mon Projet Claude).

# 3\. Propose-moi le plan d'implémentation du bouton + de la fonction de génération du markdown.

# 4\. Attends ma validation.

# 5\. Implémente, avec diff clair et explication.

# 

# COMMENCE PAR L'ÉTAPE 1 : localiser les sources d'instructions et de style dans le code.

