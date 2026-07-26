# Gestion de librairie — Stock, Ventes & Facturation

Application complète : stock en temps réel, facturation, achats, clients/fournisseurs, paiements partiels, retours et rapports (recettes, bénéfices, produits les plus vendus, stock faible).

## Stack

- Node.js + Express (API)
- SQLite via `better-sqlite3` (base de données locale, un seul fichier `librairie.db`)
- Frontend en HTML/CSS/JS vanilla, servi directement par Express (aucun build à faire)

## Structure

```
server.js        → API (produits, achats, ventes, factures, paiements, retours, rapports)
db.js             → schéma de la base de données + connexion
public/index.html → interface (onglets Vente / Stock / Achats / Factures / Rapports)
public/style.css
public/app.js
```

## Déploiement sur Railway (depuis GitHub, sans terminal)

1. Crée un nouveau dépôt GitHub et mets-y tout le contenu de ce dossier (via l'interface web GitHub : "Add file" → "Upload files").
2. Sur Railway : **New Project → Deploy from GitHub repo**, choisis ce dépôt.
3. Railway détecte `package.json` et lance automatiquement `npm install` puis `npm start`.
4. Dans l'onglet **Variables**, rien n'est requis pour démarrer (le port est fourni automatiquement par Railway).
5. **Important — persistance des données** : par défaut, le système de fichiers de Railway est éphémère (le fichier `librairie.db` peut être effacé à chaque redéploiement). Pour éviter de perdre le stock et les factures :
   - Va dans l'onglet **Volumes** du service Railway.
   - Crée un volume et monte-le sur `/app` (ou le dossier où vit `librairie.db`).
   - Cela garantit que la base de données survit aux redéploiements.
6. Une fois déployé, Railway te donne une URL publique (`xxx.up.railway.app`) — c'est ton logiciel de caisse accessible depuis ton téléphone.

## Utilisation

- **Vente** : touche un produit pour l'ajouter au panier, ajuste les quantités, choisis le mode de paiement, encaisse → un reçu stylisé s'affiche avec le numéro de facture.
- **Stock** : liste des produits avec prix d'achat/vente, marge et stock ; ajoute un nouveau produit via "+ Nouveau produit". Une alerte s'affiche si le stock passe sous le seuil défini.
- **Achats** : enregistre une entrée de marchandise (fournisseur, quantité, prix d'achat) → le stock du produit est incrémenté automatiquement et son prix d'achat est mis à jour.
- **Factures** : historique de toutes les factures, avec possibilité de revoir le reçu.
- **Rapports** : recette et bénéfice du jour, produits les plus vendus, produits en stock faible.

## Notes sur la logique métier

- Chaque vente : vérifie le stock disponible → crée la facture + ses lignes → décrémente le stock → enregistre le paiement (total ou partiel) → alimente automatiquement les rapports de recette et de bénéfice.
- Le bénéfice est calculé ligne par ligne : `(prix_vente − prix_achat_au_moment_de_la_vente) × quantité`, donc il reste exact même si le prix d'achat change plus tard.
- Un retour de produit réintègre automatiquement la quantité au stock.
- Les paiements partiels sont supportés : une facture peut être `payee`, `partielle` ou `impayee`, et on peut ajouter un paiement complémentaire plus tard via `POST /api/factures/:id/paiements`.

## Prochaines étapes possibles

- Authentification (login vendeur/gérant)
- Export PDF du reçu
- Gestion multi-boutique
- Intégration directe Orange Money / MTN MoMo pour l'encaissement
