# ComptaPro Belgique

Application de comptabilité pour indépendants et sociétés établis en Belgique : facturation (Peppol), dépenses, banque (CODA), TVA (Intervat), comptes annuels (schéma BNB), clôture et assistant IA (Claude).

Aucune installation : ouvrez `index.html` dans un navigateur, ou utilisez la version en un seul fichier `dist/comptapro.html` (générée par `python3 build.py`).

## Règles belges intégrées

| Domaine | Ce que fait l'application |
|---|---|
| Identification | Numéro d'entreprise BCE et TVA contrôlés (modulo 97), IBAN contrôlé, lien direct vers la fiche BCE, remplissage automatique d'une fiche à partir du texte ou d'une capture de la BCE (IA) |
| Plan comptable | PCMN (classes 1 à 7), écritures en partie double générées automatiquement |
| Factures | Numérotation continue, notes de crédit, communication structurée +++xxx/xxxx/xxxxx+++, QR code de paiement EPC, mentions légales selon le régime (autoliquidation, intracom, export, franchise 56bis), régime proposé automatiquement selon le client, export Peppol BIS 3.0 (UBL) |
| Peppol | Contrôle avant envoi, export UBL (BIS 3.0) individuel ou groupé, suivi « à envoyer / envoyée », lien vers l'annuaire Peppol ; import des factures fournisseurs reçues (UBL) → dépenses automatiques avec TVA, autoliquidation, échéance, IBAN et communication ; rapprochement automatique du paiement |
| Dépenses | Taux 21/12/6/0 %, déductibilité de la TVA (restaurant 0 %, voiture 50 %…), autoliquidation (grilles 86/87/88), lecture des tickets par l'IA |
| Banque | Import CODA et CSV des banques belges, rapprochement automatique (communication structurée, montant + nom, règles apprises), tri IA du reste |
| TVA | Déclaration périodique mensuelle ou trimestrielle avec toutes les grilles (00-03, 44-49, 81-88, 54-64, 71/72), fichier XML pour Intervat, listing annuel des clients (XML), relevé intracommunautaire, régime de franchise |
| Immobilisations | Amortissement linéaire avec prorata temporis, TVA non déductible incorporée |
| Comptes annuels | Bilan et compte de résultats au schéma abrégé BNB (codes), indicateurs (marge, EBITDA, liquidité, solvabilité) |
| Clôture | Check-list, estimation ISOC (taux réduit PME) ou IPP + cotisations sociales, versements anticipés, obligations (AG, dépôt BNB, Biztax / Tax-on-web) |
| Échéancier | TVA, listing, versements anticipés, cotisations sociales, AG et dépôt BNB sur le tableau de bord |

Les paramètres fiscaux (taux, plafonds, barème IPP, cotisations sociales) sont indicatifs et modifiables dans **Paramètres** : vérifiez-les chaque année. Les fichiers XML (Intervat, listing, Peppol) suivent les formats publics ; contrôlez l'aperçu avant de les déposer. Pour l'envoi et la réception sur le réseau Peppol, un point d'accès certifié reste nécessaire : ComptaPro produit et lit les fichiers UBL échangés avec lui. L'onglet Banque explique comment obtenir les fichiers CODA auprès de chaque banque.

## Structure

```
index.html            application
css/style.css         styles (clair / sombre, mobile)
js/store.js           données, PCMN, identifiants belges, synchronisation
js/compta.js          moteur : écritures, TVA, Intervat, listing, Peppol, CODA, impôts, échéancier
js/ui.js              composants, QR EPC
js/views*.js          écrans
js/ai.js              intégration Claude
vendor/qrcode.js      générateur de QR (MIT)
build.py              assemble dist/comptapro.html
```
