# Platine

Une platine vinyle épurée pour iPhone et iPad qui pilote Spotify.

- Disque qui tourne à 33⅓ tours/min, avec démarrage et arrêt progressifs
- Bras fonctionnel : il se pose sur le disque à la lecture, avance avec le morceau et revient sur son support à la pause. On peut le **déplacer au doigt** : le poser sur le disque lance la lecture à cet endroit, le ramener sur son support met en pause.
- Précédent / −15 s / lecture-pause / +15 s / suivant, barre de progression
- La pochette sert d'étiquette du vinyle, et l'arrière-plan prend sa couleur
- Thème clair / sombre automatique, iPhone en portrait, iPad en paysage
- Mode scratch (réglages) : attrape le disque au doigt pour scratcher, avec un son de scratch synthétisé
- Mode démo sans compte

## Fonctionnement

Platine est une web app (PWA) sans serveur. La musique est jouée par l'app Spotify
(sur l'iPhone, l'iPad ou une enceinte) et Platine la pilote via Spotify Connect.
Il faut un compte **Spotify Premium**.

## Installation

1. Héberger le dossier en HTTPS, par exemple avec GitHub Pages (Settings → Pages → branche, dossier racine).
2. Sur https://developer.spotify.com/dashboard, créer une app (cocher *Web API*) :
   - Redirect URI : l'adresse exacte de la page, affichée dans les réglages de Platine (ex. `https://<utilisateur>.github.io/<repo>/`).
   - User Management : ajouter son adresse e-mail Spotify.
3. Ouvrir Platine dans Safari → ⚙︎ → coller le *Client ID* → « Connecter Spotify ».
4. Partager → « Sur l'écran d'accueil » pour l'utiliser comme une app en plein écran.
