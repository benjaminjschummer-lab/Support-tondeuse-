#!/usr/bin/env python3
"""Secret Santa familial : tirage au sort + envoi des mails.

- Personne ne peut se tirer soi-même.
- Les couples (mariés) ne peuvent pas se tirer l'un l'autre.
- Le résultat n'est JAMAIS affiché : l'organisateur peut participer aussi.

Utilisation :
    python3 secret_santa.py --verifier          # vérifie que le tirage est possible
    python3 secret_santa.py --essai             # envoie UN mail de test à l'organisateur
    python3 secret_santa.py --envoyer           # tire au sort et envoie les mails à tous
    python3 secret_santa.py --renvoyer "Prénom" # renvoie le mail d'une personne (même tirage)
"""
import argparse
import base64
import getpass
import json
import os
import random
import smtplib
import ssl
import sys
from email.message import EmailMessage

ICI = os.path.dirname(os.path.abspath(__file__))
FICHIER_CONFIG = os.path.join(ICI, "famille.json")
FICHIER_TIRAGE = os.path.join(ICI, ".tirage_secret.dat")


def charger_config(chemin):
    with open(chemin, encoding="utf-8") as f:
        cfg = json.load(f)
    noms = [p["nom"] for p in cfg["participants"]]
    if len(set(noms)) != len(noms):
        sys.exit("Erreur : deux participants ont le même nom.")
    for couple in cfg.get("couples", []):
        for n in couple:
            if n not in noms:
                sys.exit(f"Erreur : '{n}' (dans les couples) n'est pas dans les participants.")
    return cfg


def interdits(cfg):
    """Renvoie {nom: ensemble des personnes qu'il ne peut pas tirer}."""
    ban = {p["nom"]: {p["nom"]} for p in cfg["participants"]}
    for a, b in cfg.get("couples", []):
        ban[a].add(b)
        ban[b].add(a)
    for a, b in cfg.get("exclusions", []):  # optionnel : a ne peut pas tirer b
        ban[a].add(b)
    return ban


def tirer(noms, ban, essais=10000):
    """Tirage aléatoire uniforme parmi les tirages valides (par rejet + retour arrière)."""
    for _ in range(essais):
        receveurs = noms[:]
        random.shuffle(receveurs)
        if all(r not in ban[d] for d, r in zip(noms, receveurs)):
            return dict(zip(noms, receveurs))
    # Repli : recherche exhaustive en ordre aléatoire (cas très contraints)
    ordre = noms[:]
    random.shuffle(ordre)
    res, pris = {}, set()

    def bt(i):
        if i == len(ordre):
            return True
        cands = [r for r in noms if r not in pris and r not in ban[ordre[i]]]
        random.shuffle(cands)
        for r in cands:
            res[ordre[i]] = r
            pris.add(r)
            if bt(i + 1):
                return True
            pris.discard(r)
        return False

    return dict(res) if bt(0) else None


def message(cfg, donneur, receveur, email):
    msg = EmailMessage()
    msg["Subject"] = cfg.get("sujet", "🎅 Ton Secret Santa est arrivé !")
    msg["From"] = cfg["smtp"]["expediteur"]
    msg["To"] = email
    budget = cfg.get("budget")
    texte = (
        f"Bonjour {donneur},\n\n"
        f"Le tirage au sort du Secret Santa a eu lieu !\n\n"
        f"🎁 Tu dois offrir un cadeau à : {receveur}\n\n"
        + (f"Budget conseillé : {budget}\n\n" if budget else "")
        + (cfg.get("message", "") + "\n\n" if cfg.get("message") else "")
        + "Chut... c'est un secret ! 🤫\n"
          "(Ce mail a été envoyé automatiquement, personne d'autre ne connaît le résultat.)\n"
    )
    msg.set_content(texte)
    msg.add_alternative(f"""\
<div style="font-family:Georgia,serif;max-width:520px;margin:auto;padding:24px;
     border:3px solid #b3202a;border-radius:14px;background:#fffaf3;color:#222">
  <h2 style="color:#b3202a;margin-top:0">🎅 Secret Santa</h2>
  <p>Bonjour <b>{donneur}</b>,</p>
  <p>Le tirage au sort a eu lieu&nbsp;! Tu dois offrir un cadeau à&nbsp;:</p>
  <p style="font-size:28px;text-align:center;color:#1f6b3a;margin:24px 0"><b>🎁 {receveur} 🎁</b></p>
  {f'<p>Budget conseillé&nbsp;: <b>{budget}</b></p>' if budget else ''}
  {f'<p>{cfg["message"]}</p>' if cfg.get("message") else ''}
  <p>Chut… c'est un secret&nbsp;! 🤫</p>
  <p style="font-size:12px;color:#777">Mail envoyé automatiquement : personne d'autre ne connaît le résultat.</p>
</div>""", subtype="html")
    return msg


def connexion(cfg):
    s = cfg["smtp"]
    mdp = os.environ.get("SECRET_SANTA_MDP") or getpass.getpass(
        f"Mot de passe d'application pour {s['utilisateur']} : ")
    serveur = smtplib.SMTP(s.get("hote", "smtp.gmail.com"), s.get("port", 587), timeout=30)
    serveur.starttls(context=ssl.create_default_context())
    serveur.login(s["utilisateur"], mdp)
    return serveur


def sauvegarder(tirage):
    # Encodé (pas en clair) pour que l'organisateur ne le voie pas par accident.
    data = base64.b64encode(json.dumps(tirage).encode()).decode()
    with open(FICHIER_TIRAGE, "w") as f:
        f.write(data)


def charger_tirage():
    with open(FICHIER_TIRAGE) as f:
        return json.loads(base64.b64decode(f.read()))


def main():
    ap = argparse.ArgumentParser(description="Secret Santa familial")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--verifier", action="store_true", help="vérifie qu'un tirage est possible")
    g.add_argument("--essai", action="store_true", help="envoie un mail de test à l'organisateur")
    g.add_argument("--envoyer", action="store_true", help="tire au sort et envoie à tout le monde")
    g.add_argument("--renvoyer", metavar="NOM", help="renvoie le mail de cette personne")
    ap.add_argument("--config", default=FICHIER_CONFIG)
    args = ap.parse_args()

    cfg = charger_config(args.config)
    emails = {p["nom"]: p["email"] for p in cfg["participants"]}
    noms = list(emails)
    ban = interdits(cfg)

    if args.verifier:
        t = tirer(noms, ban)
        if not t:
            sys.exit("❌ Impossible de faire un tirage avec ces contraintes.")
        assert all(t[d] not in ban[d] for d in noms) and sorted(t.values()) == sorted(noms)
        print(f"✅ Configuration OK : {len(noms)} participants, {len(cfg.get('couples', []))} couples.")
        print("   Un tirage valide existe (le résultat n'est pas affiché).")
        return

    if args.essai:
        org = cfg["smtp"]["expediteur"]
        with connexion(cfg) as srv:
            msg = message(cfg, "Organisateur", "Père Noël (ceci est un test)", org)
            msg["Subject"] = "[TEST] " + msg["Subject"]
            srv.send_message(msg)
        print(f"✅ Mail de test envoyé à {org}.")
        return

    if args.renvoyer:
        if not os.path.exists(FICHIER_TIRAGE):
            sys.exit("Aucun tirage enregistré.")
        t = charger_tirage()
        if args.renvoyer not in t:
            sys.exit(f"'{args.renvoyer}' inconnu. Noms possibles : {', '.join(t)}")
        with connexion(cfg) as srv:
            srv.send_message(message(cfg, args.renvoyer, t[args.renvoyer], emails[args.renvoyer]))
        print(f"✅ Mail renvoyé à {args.renvoyer}.")
        return

    # --envoyer
    if os.path.exists(FICHIER_TIRAGE):
        rep = input("⚠️  Un tirage existe déjà. En refaire un nouveau ? (oui/non) ")
        if rep.strip().lower() not in ("oui", "o", "yes", "y"):
            sys.exit("Annulé.")
    t = tirer(noms, ban)
    if not t:
        sys.exit("❌ Impossible de faire un tirage avec ces contraintes.")
    with connexion(cfg) as srv:
        for donneur in noms:
            srv.send_message(message(cfg, donneur, t[donneur], emails[donneur]))
            print(f"📧 Mail envoyé à {donneur} ({emails[donneur]})")
    sauvegarder(t)
    print("\n🎄 Terminé ! Chacun a reçu son mail. Le résultat n'a pas été affiché.")


if __name__ == "__main__":
    main()
