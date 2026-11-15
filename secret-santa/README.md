# 🎅 Secret Santa familial

Tire au sort qui offre un cadeau à qui, puis envoie un mail à chacun.
- Personne ne se tire soi-même.
- **Les couples mariés ne peuvent pas se tirer entre eux.**
- **Le résultat n'est jamais affiché** : l'organisateur peut participer comme tout le monde.

Il suffit d'avoir Python 3, rien d'autre à installer.

## 1. Configurer la famille
```bash
cp famille.exemple.json famille.json
```
Dans `famille.json`, remplissez :
- `participants` : le prénom et l'adresse mail de chacun (vous compris) ;
- `couples` : les paires de mariés, ex. `["Paul", "Sophie"]` ;
- `exclusions` (facultatif) : `["A", "B"]` veut dire que A ne peut pas tirer B ;
- `budget`, `message`, `sujet` : textes affichés dans le mail ;
- `smtp` : votre adresse Gmail, qui enverra les mails.

## 2. Mot de passe Gmail
Gmail demande un **mot de passe d'application** (et non votre mot de passe habituel) :
Compte Google → Sécurité → Validation en 2 étapes (à activer) → *Mots de passe des applications*.
Le script vous le demandera au lancement (ou mettez-le dans la variable `SECRET_SANTA_MDP`).

## 3. Lancer
```bash
python3 secret_santa.py --verifier      # vérifie qu'un tirage est possible
python3 secret_santa.py --essai         # envoie un mail de test à vous seul
python3 secret_santa.py --envoyer       # LE VRAI TIRAGE : envoie les mails à tout le monde
```
Si quelqu'un a perdu son mail :
```bash
python3 secret_santa.py --renvoyer "Paul"   # renvoie son mail sans rien afficher
```
Le tirage est gardé dans `.tirage_secret.dat` (encodé, pour ne pas le lire par accident).
Ce fichier et `famille.json` ne sont pas envoyés sur Git (`.gitignore`).
