# Kanikapila – ukulélé, paroles et accords

## Version complète (paroles + accords) – à héberger sur GitHub Pages

1. Sur GitHub : **Settings → Pages → Build and deployment → Source : Deploy from a branch**,
   branche `claude/serene-ramanujan-t7ksa8` (ou `main` après fusion), dossier `/ (root)`, **Save**.
   (Sur un compte gratuit, GitHub Pages demande un dépôt public.)
2. Après 1 à 2 minutes, ouvre `https://<ton-utilisateur>.github.io/Support-tondeuse-/ukulele/`
   et ajoute la page à l'écran d'accueil de ton téléphone.
3. Dans **Réglages**, colle une **clé Gemini gratuite** (aistudio.google.com/apikey → Create API key, sans carte
   bancaire ; elle commence par `AIza`). Une clé Anthropic payante (`sk-ant-…`) marche aussi.
   La clé reste dans ton navigateur et n'est envoyée qu'au service d'IA correspondant.

Quand tu cherches une chanson :
- les **paroles synchronisées** viennent de [LRCLIB](https://lrclib.net) (base libre alimentée par ses utilisateurs,
  sans licence des ayants droit : usage personnel) ;
- l'IA place les accords sur les mots : **Gemini Flash** (gratuit, quota quotidien ; sur l'offre gratuite Google peut
  utiliser les demandes pour améliorer ses modèles), ou **Claude Opus 5.5** avec une clé Anthropic (3 à 6 centimes
  par chanson, repli automatique sur un autre modèle si la demande est refusée) ;
- la lecture suit le minutage des paroles ; touche une ligne pour y sauter, ajuste la vitesse en %.

## Version claude.ai

Même appli publiée comme artefact : la recherche y donne la grille d'accords (sans paroles pour les chansons protégées),
car une page claude.ai ne peut contacter aucun site extérieur.

## Fichiers

- `index.html` : l'appli (chansons, lecture, accordeur).
- `chords.js` : moteur d'accords ukulélé (GCEA) : formes usuelles + recherche automatique.
- `vendor/anthropic-sdk-1.6.0.js` : SDK officiel `@anthropic-ai/sdk` 1.6.0 empaqueté pour le navigateur.
- `bookmarklet.js`, `build-bookmarklet.sh` : ancien brouillon de favori d'import, non utilisé.
