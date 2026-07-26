const Database = require('better-sqlite3');
const path = require('path');

// Le fichier librairie.db est cree a cote de ce script.
// Sur Railway, monte un volume sur ce dossier pour que les donnees survivent aux redeploiements.
const db = new Database(path.join(__dirname, 'librairie.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS fournisseurs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  contact TEXT,
  telephone TEXT
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  telephone TEXT,
  email TEXT
);

CREATE TABLE IF NOT EXISTS produits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  categorie_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  fournisseur_id INTEGER REFERENCES fournisseurs(id) ON DELETE SET NULL,
  prix_achat REAL NOT NULL DEFAULT 0,
  prix_vente REAL NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  seuil_alerte INTEGER NOT NULL DEFAULT 5,
  actif INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS achats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  produit_id INTEGER NOT NULL REFERENCES produits(id),
  fournisseur_id INTEGER REFERENCES fournisseurs(id),
  quantite INTEGER NOT NULL,
  prix_achat_unitaire REAL NOT NULL,
  date TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS factures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  date TEXT NOT NULL DEFAULT (datetime('now')),
  client_id INTEGER REFERENCES clients(id),
  mode_paiement TEXT NOT NULL DEFAULT 'especes',
  total REAL NOT NULL DEFAULT 0,
  montant_paye REAL NOT NULL DEFAULT 0,
  statut TEXT NOT NULL DEFAULT 'payee',
  remise REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS facture_lignes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  facture_id INTEGER NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  produit_id INTEGER NOT NULL REFERENCES produits(id),
  quantite INTEGER NOT NULL,
  prix_unitaire REAL NOT NULL,
  prix_achat_unitaire REAL NOT NULL,
  total REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS paiements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  facture_id INTEGER NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  montant REAL NOT NULL,
  mode TEXT NOT NULL,
  date TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS retours (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  facture_id INTEGER REFERENCES factures(id),
  produit_id INTEGER NOT NULL REFERENCES produits(id),
  quantite INTEGER NOT NULL,
  motif TEXT,
  date TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Seed minimal (une categorie par defaut) si la base est vide
const nbCategories = db.prepare('SELECT COUNT(*) AS n FROM categories').get().n;
if (nbCategories === 0) {
  db.prepare('INSERT INTO categories (nom) VALUES (?)').run('Fournitures scolaires');
}

module.exports = db;
