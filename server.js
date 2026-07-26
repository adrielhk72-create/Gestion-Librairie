const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const today = () => new Date().toISOString().slice(0, 10);

function genererNumeroFacture() {
  const jour = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const row = db.prepare(
    `SELECT COUNT(*) AS n FROM factures WHERE numero LIKE ?`
  ).get(`F-${jour}-%`);
  const seq = String(row.n + 1).padStart(3, '0');
  return `F-${jour}-${seq}`;
}

/* ---------- CATEGORIES ---------- */
app.get('/api/categories', (req, res) => {
  res.json(db.prepare('SELECT * FROM categories ORDER BY nom').all());
});
app.post('/api/categories', (req, res) => {
  const { nom } = req.body;
  if (!nom) return res.status(400).json({ error: 'Nom requis' });
  const info = db.prepare('INSERT INTO categories (nom) VALUES (?)').run(nom);
  res.json({ id: info.lastInsertRowid, nom });
});

/* ---------- FOURNISSEURS ---------- */
app.get('/api/fournisseurs', (req, res) => {
  res.json(db.prepare('SELECT * FROM fournisseurs ORDER BY nom').all());
});
app.post('/api/fournisseurs', (req, res) => {
  const { nom, contact, telephone } = req.body;
  if (!nom) return res.status(400).json({ error: 'Nom requis' });
  const info = db.prepare(
    'INSERT INTO fournisseurs (nom, contact, telephone) VALUES (?,?,?)'
  ).run(nom, contact || null, telephone || null);
  res.json({ id: info.lastInsertRowid });
});

/* ---------- CLIENTS ---------- */
app.get('/api/clients', (req, res) => {
  res.json(db.prepare('SELECT * FROM clients ORDER BY nom').all());
});
app.post('/api/clients', (req, res) => {
  const { nom, telephone, email } = req.body;
  if (!nom) return res.status(400).json({ error: 'Nom requis' });
  const info = db.prepare(
    'INSERT INTO clients (nom, telephone, email) VALUES (?,?,?)'
  ).run(nom, telephone || null, email || null);
  res.json({ id: info.lastInsertRowid });
});

/* ---------- PRODUITS ---------- */
app.get('/api/produits', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, c.nom AS categorie_nom, f.nom AS fournisseur_nom
    FROM produits p
    LEFT JOIN categories c ON c.id = p.categorie_id
    LEFT JOIN fournisseurs f ON f.id = p.fournisseur_id
    WHERE p.actif = 1
    ORDER BY p.nom
  `).all();
  res.json(rows);
});

app.post('/api/produits', (req, res) => {
  const { nom, categorie_id, fournisseur_id, prix_achat, prix_vente, stock, seuil_alerte } = req.body;
  if (!nom || prix_achat == null || prix_vente == null) {
    return res.status(400).json({ error: 'nom, prix_achat et prix_vente sont requis' });
  }
  const info = db.prepare(`
    INSERT INTO produits (nom, categorie_id, fournisseur_id, prix_achat, prix_vente, stock, seuil_alerte)
    VALUES (?,?,?,?,?,?,?)
  `).run(nom, categorie_id || null, fournisseur_id || null, prix_achat, prix_vente, stock || 0, seuil_alerte || 5);
  res.json({ id: info.lastInsertRowid });
});

app.put('/api/produits/:id', (req, res) => {
  const { nom, categorie_id, fournisseur_id, prix_achat, prix_vente, seuil_alerte } = req.body;
  db.prepare(`
    UPDATE produits SET nom=?, categorie_id=?, fournisseur_id=?, prix_achat=?, prix_vente=?, seuil_alerte=?
    WHERE id=?
  `).run(nom, categorie_id || null, fournisseur_id || null, prix_achat, prix_vente, seuil_alerte || 5, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/produits/:id', (req, res) => {
  db.prepare('UPDATE produits SET actif = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------- ACHATS (entree en stock) ---------- */
app.post('/api/achats', (req, res) => {
  const { produit_id, fournisseur_id, quantite, prix_achat_unitaire } = req.body;
  if (!produit_id || !quantite || prix_achat_unitaire == null) {
    return res.status(400).json({ error: 'produit_id, quantite, prix_achat_unitaire requis' });
  }
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO achats (produit_id, fournisseur_id, quantite, prix_achat_unitaire)
      VALUES (?,?,?,?)
    `).run(produit_id, fournisseur_id || null, quantite, prix_achat_unitaire);

    db.prepare(`
      UPDATE produits SET stock = stock + ?, prix_achat = ? WHERE id = ?
    `).run(quantite, prix_achat_unitaire, produit_id);
  });
  tx();
  res.json({ ok: true });
});

app.get('/api/achats', (req, res) => {
  res.json(db.prepare(`
    SELECT a.*, p.nom AS produit_nom
    FROM achats a JOIN produits p ON p.id = a.produit_id
    ORDER BY a.date DESC LIMIT 100
  `).all());
});

/* ---------- VENTES / FACTURATION ---------- */
// body: { client_id, mode_paiement, remise, montant_paye, lignes: [{produit_id, quantite, prix_unitaire}] }
app.post('/api/ventes', (req, res) => {
  const { client_id, mode_paiement, remise, montant_paye, lignes } = req.body;

  if (!Array.isArray(lignes) || lignes.length === 0) {
    return res.status(400).json({ error: 'Au moins une ligne de vente est requise' });
  }

  try {
    const result = db.transaction(() => {
      // Verification du stock disponible avant toute ecriture
      for (const l of lignes) {
        const produit = db.prepare('SELECT * FROM produits WHERE id = ?').get(l.produit_id);
        if (!produit) throw new Error(`Produit ${l.produit_id} introuvable`);
        if (produit.stock < l.quantite) {
          throw new Error(`Stock insuffisant pour "${produit.nom}" (disponible : ${produit.stock})`);
        }
      }

      const sousTotal = lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0);
      const total = Math.max(0, sousTotal - (remise || 0));
      const numero = genererNumeroFacture();
      const paye = montant_paye != null ? montant_paye : total;
      const statut = paye >= total ? 'payee' : (paye > 0 ? 'partielle' : 'impayee');

      const factureInfo = db.prepare(`
        INSERT INTO factures (numero, client_id, mode_paiement, total, montant_paye, statut, remise)
        VALUES (?,?,?,?,?,?,?)
      `).run(numero, client_id || null, mode_paiement || 'especes', total, paye, statut, remise || 0);

      const factureId = factureInfo.lastInsertRowid;

      const insertLigne = db.prepare(`
        INSERT INTO facture_lignes (facture_id, produit_id, quantite, prix_unitaire, prix_achat_unitaire, total)
        VALUES (?,?,?,?,?,?)
      `);
      const updateStock = db.prepare('UPDATE produits SET stock = stock - ? WHERE id = ?');

      for (const l of lignes) {
        const produit = db.prepare('SELECT prix_achat FROM produits WHERE id = ?').get(l.produit_id);
        insertLigne.run(factureId, l.produit_id, l.quantite, l.prix_unitaire, produit.prix_achat, l.quantite * l.prix_unitaire);
        updateStock.run(l.quantite, l.produit_id);
      }

      if (paye > 0) {
        db.prepare('INSERT INTO paiements (facture_id, montant, mode) VALUES (?,?,?)')
          .run(factureId, paye, mode_paiement || 'especes');
      }

      return { factureId, numero, total, statut };
    })();

    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/factures', (req, res) => {
  const rows = db.prepare(`
    SELECT f.*, c.nom AS client_nom
    FROM factures f LEFT JOIN clients c ON c.id = f.client_id
    ORDER BY f.date DESC LIMIT 200
  `).all();
  res.json(rows);
});

app.get('/api/factures/:id', (req, res) => {
  const facture = db.prepare(`
    SELECT f.*, c.nom AS client_nom, c.telephone AS client_telephone
    FROM factures f LEFT JOIN clients c ON c.id = f.client_id
    WHERE f.id = ?
  `).get(req.params.id);
  if (!facture) return res.status(404).json({ error: 'Facture introuvable' });
  const lignes = db.prepare(`
    SELECT fl.*, p.nom AS produit_nom
    FROM facture_lignes fl JOIN produits p ON p.id = fl.produit_id
    WHERE fl.facture_id = ?
  `).all(req.params.id);
  res.json({ ...facture, lignes });
});

// Ajout d'un paiement complementaire sur une facture partielle/impayee
app.post('/api/factures/:id/paiements', (req, res) => {
  const { montant, mode } = req.body;
  const facture = db.prepare('SELECT * FROM factures WHERE id = ?').get(req.params.id);
  if (!facture) return res.status(404).json({ error: 'Facture introuvable' });

  const tx = db.transaction(() => {
    db.prepare('INSERT INTO paiements (facture_id, montant, mode) VALUES (?,?,?)')
      .run(req.params.id, montant, mode || facture.mode_paiement);
    const nouveauPaye = facture.montant_paye + montant;
    const statut = nouveauPaye >= facture.total ? 'payee' : 'partielle';
    db.prepare('UPDATE factures SET montant_paye = ?, statut = ? WHERE id = ?')
      .run(nouveauPaye, statut, req.params.id);
  });
  tx();
  res.json({ ok: true });
});

/* ---------- RETOURS ---------- */
app.post('/api/retours', (req, res) => {
  const { facture_id, produit_id, quantite, motif } = req.body;
  if (!produit_id || !quantite) return res.status(400).json({ error: 'produit_id et quantite requis' });
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO retours (facture_id, produit_id, quantite, motif) VALUES (?,?,?,?)')
      .run(facture_id || null, produit_id, quantite, motif || null);
    db.prepare('UPDATE produits SET stock = stock + ? WHERE id = ?').run(quantite, produit_id);
  });
  tx();
  res.json({ ok: true });
});

/* ---------- RAPPORTS ---------- */
app.get('/api/rapports/jour', (req, res) => {
  const jour = req.query.date || today();
  const row = db.prepare(`
    SELECT COALESCE(SUM(total),0) AS recette, COUNT(*) AS nb_factures
    FROM factures WHERE date(date) = ?
  `).get(jour);

  const benefice = db.prepare(`
    SELECT COALESCE(SUM((fl.prix_unitaire - fl.prix_achat_unitaire) * fl.quantite),0) AS benefice
    FROM facture_lignes fl
    JOIN factures f ON f.id = fl.facture_id
    WHERE date(f.date) = ?
  `).get(jour);

  res.json({ date: jour, recette: row.recette, nb_factures: row.nb_factures, benefice: benefice.benefice });
});

app.get('/api/rapports/top-produits', (req, res) => {
  res.json(db.prepare(`
    SELECT p.nom, SUM(fl.quantite) AS quantite_vendue, SUM(fl.total) AS ca
    FROM facture_lignes fl JOIN produits p ON p.id = fl.produit_id
    GROUP BY p.id ORDER BY quantite_vendue DESC LIMIT 10
  `).all());
});

app.get('/api/rapports/stock-faible', (req, res) => {
  res.json(db.prepare(`
    SELECT * FROM produits WHERE actif = 1 AND stock <= seuil_alerte ORDER BY stock ASC
  `).all());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Librairie app demarree sur le port ${PORT}`));
