# ComptaPro — comptabilité complète avec assistant IA

Application web de comptabilité pour indépendants et petites entreprises françaises : facturation, dépenses, banque, TVA, bilan de fin d'année et assistant IA (Claude).

Aucune installation : ouvrez `index.html` dans un navigateur (ou publiez le dossier sur GitHub Pages). Installable comme application (PWA). Toutes les données restent sur l'appareil (stockage local) ; exportez des sauvegardes depuis **Paramètres**.

## Fonctionnalités

| Module | Contenu |
|---|---|
| Tableau de bord | CA, charges, résultat, trésorerie, TVA de la période, IS estimé, graphique mensuel, liste de tâches |
| Factures & devis | Numérotation automatique, avoirs, conversion devis → facture, multi-taux de TVA, remises, aperçu/PDF, envoi par e-mail, relances, mentions légales |
| Clients | Fiche client, CA et reste dû par client |
| Dépenses | Catégories PCG, TVA déductible, justificatifs (photo/PDF), remplissage automatique par l'IA, export CSV |
| Banque | Import de relevés CSV (toutes banques), rapprochement factures / dépenses / catégories, tri automatique par l'IA |
| Immobilisations | Amortissement linéaire prorata temporis, plan d'amortissement, dotations passées automatiquement |
| TVA | Franchise, réel simplifié (CA12) ou réel normal (CA3), débits ou encaissements, calcul des cases CA3, crédit reporté, écritures de liquidation et de paiement |
| Journal & grand livre | Partie double générée automatiquement, écritures manuelles (OD), balance, grand livre, **export FEC** |
| Bilan & résultat | Compte de résultat comparatif N / N-1, bilan actif / passif, soldes intermédiaires de gestion |
| Clôture annuelle | Check-list de clôture, IS (15 % / 25 %), tableau de reprise liasse 2033, revue de clôture par l'IA, échéances |
| Assistant IA | Questions-réponses sur vos chiffres, scan et tri de justificatifs, tri bancaire, analyse financière complète |

## Assistant IA

Dans **Paramètres → Assistant IA**, collez une clé API Anthropic (console.anthropic.com). La clé est stockée uniquement dans le navigateur et les requêtes partent directement de l'appareil vers l'API, accompagnées d'un résumé des données comptables. Modèle par défaut : Claude Opus 5.5.

## Structure

```
index.html            coquille de l'application
css/style.css         styles (clair / sombre, mobile)
js/store.js           données, persistance, plan comptable
js/compta.js          moteur comptable : écritures, TVA, amortissements, bilan, FEC
js/ui.js              composants (modales, CSV, graphiques)
js/views*.js          écrans
js/ai.js              intégration Claude
```

> Les calculs fiscaux sont fournis à titre d'aide ; faites valider vos comptes annuels et déclarations par un professionnel si nécessaire.
