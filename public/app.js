const fmt = (n) => Math.round(n).toLocaleString('fr-FR') + ' FCFA';

let produits = [];
let categories = [];
let fournisseurs = [];
let clients = [];
let panier = []; // {produit_id, nom, prix_unitaire, quantite, stock_dispo}

/* ---------------- NAVIGATION ---------------- */
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'stock') chargerStock();
    if (btn.dataset.tab === 'achats') chargerAchats();
    if (btn.dataset.tab === 'factures') chargerFactures();
    if (btn.dataset.tab === 'rapports') chargerRapports();
  });
});

function majHorloge(){
  document.getElementById('clock').textContent = new Date().toLocaleString('fr-FR', {
    weekday:'short', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'
  });
}
majHorloge();
setInterval(majHorloge, 30000);

/* ---------------- CHARGEMENT INITIAL ---------------- */
async function chargerReferentiels(){
  [produits, categories, fournisseurs, clients] = await Promise.all([
    fetch('/api/produits').then(r=>r.json()),
    fetch('/api/categories').then(r=>r.json()),
    fetch('/api/fournisseurs').then(r=>r.json()),
    fetch('/api/clients').then(r=>r.json()),
  ]);
  remplirSelectsCommuns();
  afficherProduitsVente();
}

function remplirSelectsCommuns(){
  const clientSelect = document.getElementById('clientSelect');
  clientSelect.innerHTML = '<option value="">Client de passage</option>' +
    clients.map(c => `<option value="${c.id}">${c.nom}</option>`).join('');

  const options = ['npCategorie', 'achatFournisseur', 'npFournisseur'];
  document.getElementById('npCategorie').innerHTML =
    categories.map(c => `<option value="${c.id}">${c.nom}</option>`).join('') || '<option value="">Aucune</option>';
  const foOpts = '<option value="">—</option>' + fournisseurs.map(f => `<option value="${f.id}">${f.nom}</option>`).join('');
  document.getElementById('npFournisseur').innerHTML = foOpts;
  document.getElementById('achatFournisseur').innerHTML = foOpts;

  document.getElementById('achatProduit').innerHTML =
    produits.map(p => `<option value="${p.id}">${p.nom} (stock: ${p.stock})</option>`).join('');
}

/* ---------------- VENTE : liste produits ---------------- */
function afficherProduitsVente(filtre=''){
  const zone = document.getElementById('listeProduits');
  const f = filtre.trim().toLowerCase();
  const liste = produits.filter(p => p.nom.toLowerCase().includes(f));
  zone.innerHTML = liste.map(p => `
    <div class="produit-carte" data-id="${p.id}">
      <div class="nom">${p.nom}</div>
      <div class="prix">${fmt(p.prix_vente)}</div>
      <span class="stock-tag ${p.stock <= p.seuil_alerte ? 'faible' : ''}">${p.stock} en stock</span>
    </div>
  `).join('') || '<p class="muted">Aucun produit.</p>';

  zone.querySelectorAll('.produit-carte').forEach(el => {
    el.addEventListener('click', () => ajouterAuPanier(Number(el.dataset.id)));
  });
}

document.getElementById('rechercheProduit').addEventListener('input', (e) => {
  afficherProduitsVente(e.target.value);
});

/* ---------------- PANIER ---------------- */
function ajouterAuPanier(produitId){
  const p = produits.find(x => x.id === produitId);
  if (!p) return;
  const ligne = panier.find(l => l.produit_id === produitId);
  const qteActuelle = ligne ? ligne.quantite : 0;
  if (qteActuelle + 1 > p.stock){
    afficherMessageVente(`Stock insuffisant pour "${p.nom}" (disponible : ${p.stock})`, true);
    return;
  }
  if (ligne){
    ligne.quantite += 1;
  } else {
    panier.push({ produit_id: p.id, nom: p.nom, prix_unitaire: p.prix_vente, quantite: 1, stock_dispo: p.stock });
  }
  afficherPanier();
}

function changerQuantite(produitId, delta){
  const ligne = panier.find(l => l.produit_id === produitId);
  if (!ligne) return;
  const nouvelleQte = ligne.quantite + delta;
  if (nouvelleQte <= 0){
    panier = panier.filter(l => l.produit_id !== produitId);
  } else if (nouvelleQte > ligne.stock_dispo){
    afficherMessageVente(`Stock insuffisant (disponible : ${ligne.stock_dispo})`, true);
    return;
  } else {
    ligne.quantite = nouvelleQte;
  }
  afficherPanier();
}

function afficherPanier(){
  const zone = document.getElementById('panierLignes');
  if (panier.length === 0){
    zone.innerHTML = '<p class="muted vide-msg">Aucun article. Touchez un produit pour l\'ajouter.</p>';
  } else {
    zone.innerHTML = panier.map(l => `
      <div class="ligne-panier">
        <div class="info">
          <div class="nom">${l.nom}</div>
          <div class="muted">${fmt(l.prix_unitaire)} / unité</div>
        </div>
        <div class="qte-controls">
          <button data-id="${l.produit_id}" data-d="-1">−</button>
          <span>${l.quantite}</span>
          <button data-id="${l.produit_id}" data-d="1">+</button>
        </div>
        <div class="total-ligne">${fmt(l.prix_unitaire * l.quantite)}</div>
        <span class="retirer" data-retirer="${l.produit_id}">✕</span>
      </div>
    `).join('');

    zone.querySelectorAll('[data-d]').forEach(btn => {
      btn.addEventListener('click', () => changerQuantite(Number(btn.dataset.id), Number(btn.dataset.d)));
    });
    zone.querySelectorAll('[data-retirer]').forEach(btn => {
      btn.addEventListener('click', () => {
        panier = panier.filter(l => l.produit_id !== Number(btn.dataset.retirer));
        afficherPanier();
      });
    });
  }
  majTotaux();
}

function majTotaux(){
  const sousTotal = panier.reduce((s,l) => s + l.prix_unitaire * l.quantite, 0);
  const remise = Number(document.getElementById('remiseInput').value) || 0;
  const total = Math.max(0, sousTotal - remise);
  document.getElementById('sousTotal').textContent = fmt(sousTotal);
  document.getElementById('totalFinal').textContent = fmt(total);
  document.getElementById('montantPaye').placeholder = `= ${fmt(total)} si laissé vide`;
}
document.getElementById('remiseInput').addEventListener('input', majTotaux);

function afficherMessageVente(msg, erreur=false){
  const el = document.getElementById('venteMessage');
  el.textContent = msg;
  el.className = 'message ' + (erreur ? 'erreur' : 'succes');
}

/* ---------------- VALIDATION VENTE ---------------- */
document.getElementById('btnValiderVente').addEventListener('click', async () => {
  if (panier.length === 0){
    afficherMessageVente('Le panier est vide.', true);
    return;
  }
  const remise = Number(document.getElementById('remiseInput').value) || 0;
  const montantPayeInput = document.getElementById('montantPaye').value;
  const body = {
    client_id: document.getElementById('clientSelect').value || null,
    mode_paiement: document.getElementById('modePaiement').value,
    remise,
    montant_paye: montantPayeInput === '' ? null : Number(montantPayeInput),
    lignes: panier.map(l => ({ produit_id: l.produit_id, quantite: l.quantite, prix_unitaire: l.prix_unitaire }))
  };

  const res = await fetch('/api/ventes', {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok){
    afficherMessageVente(data.error || 'Erreur lors de la vente.', true);
    return;
  }

 const facture = await fetch(`/api/factures/${data.factureId}`).then(r=>r.json());
  afficherRecu(facture, true); 

  panier = [];
  document.getElementById('remiseInput').value = 0;
  document.getElementById('montantPaye').value = '';
  afficherPanier();
  afficherMessageVente('');
  await chargerReferentiels();
});

/* ---------------- RECU ---------------- */
function afficherRecu(f){
  document.getElementById('recuNumero').textContent = f.numero;
  document.getElementById('recuDate').textContent = new Date(f.date).toLocaleString('fr-FR');
  document.getElementById('recuClient').textContent = f.client_nom || 'Client de passage';
  document.getElementById('recuLignes').innerHTML = f.lignes.map(l => `
    <tr><td>${l.produit_nom}</td><td>${l.quantite}</td><td>${fmt(l.prix_unitaire)}</td><td>${fmt(l.total)}</td></tr>
  `).join('');
  const sousTotal = f.total + f.remise;
  document.getElementById('recuSousTotal').textContent = fmt(sousTotal);
  document.getElementById('recuRemise').textContent = fmt(f.remise);
  document.getElementById('recuTotal').textContent = fmt(f.total);
  document.getElementById('recuPaye').textContent = fmt(f.montant_paye);
  document.getElementById('recuMode').textContent = f.mode_paiement.replace('_',' ');
  document.getElementById('recuTampon').textContent =
    f.statut === 'payee' ? 'PAYÉ' : (f.statut === 'partielle' ? 'PARTIEL' : 'IMPAYÉ');
  document.getElementById('modaleFacture').style.display = 'flex';
}
document.getElementById('btnFermerRecu').addEventListener('click', () => {
  document.getElementById('modaleFacture').style.display = 'none';
});

/* ---------------- STOCK ---------------- */
async function chargerStock(){
  produits = await fetch('/api/produits').then(r=>r.json());
  const corps = document.querySelector('#tableStock tbody');
  corps.innerHTML = produits.map(p => `
    <tr>
      <td>${p.nom}</td>
      <td>${p.categorie_nom || '—'}</td>
      <td>${fmt(p.prix_achat)}</td>
      <td>${fmt(p.prix_vente)}</td>
      <td>${fmt(p.prix_vente - p.prix_achat)}</td>
      <td>${p.stock}</td>
    </tr>
  `).join('');

  const alertes = produits.filter(p => p.stock <= p.seuil_alerte);
  const zoneAlerte = document.getElementById('alerteStock');
  if (alertes.length){
    zoneAlerte.style.display = 'block';
    zoneAlerte.textContent = `⚠ Stock faible : ${alertes.map(a=>a.nom).join(', ')}`;
  } else {
    zoneAlerte.style.display = 'none';
  }
}

document.getElementById('btnOuvrirNouveauProduit').addEventListener('click', () => {
  document.getElementById('formNouveauProduit').style.display = 'block';
});
document.getElementById('btnAnnulerProduit').addEventListener('click', () => {
  document.getElementById('formNouveauProduit').style.display = 'none';
});
document.getElementById('btnCreerProduit').addEventListener('click', async () => {
  const body = {
    nom: document.getElementById('npNom').value.trim(),
    categorie_id: document.getElementById('npCategorie').value || null,
    fournisseur_id: document.getElementById('npFournisseur').value || null,
    prix_achat: Number(document.getElementById('npPrixAchat').value) || 0,
    prix_vente: Number(document.getElementById('npPrixVente').value) || 0,
    stock: Number(document.getElementById('npStock').value) || 0,
    seuil_alerte: Number(document.getElementById('npSeuil').value) || 5,
  };
  if (!body.nom){ alert('Le nom du produit est requis.'); return; }
  await fetch('/api/produits', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  document.getElementById('formNouveauProduit').style.display = 'none';
  document.getElementById('npNom').value = '';
  document.getElementById('npPrixAchat').value = '';
  document.getElementById('npPrixVente').value = '';
  document.getElementById('npStock').value = 0;
  await chargerReferentiels();
  await chargerStock();
});

/* ---------------- ACHATS ---------------- */
async function chargerAchats(){
  const liste = await fetch('/api/achats').then(r=>r.json());
  document.getElementById('tableAchats').innerHTML = liste.map(a => `
    <tr>
      <td>${new Date(a.date).toLocaleDateString('fr-FR')}</td>
      <td>${a.produit_nom}</td>
      <td>${a.quantite}</td>
      <td>${fmt(a.prix_achat_unitaire)}</td>
    </tr>
  `).join('');
}

document.getElementById('btnEnregistrerAchat').addEventListener('click', async () => {
  const body = {
    produit_id: Number(document.getElementById('achatProduit').value),
    fournisseur_id: document.getElementById('achatFournisseur').value || null,
    quantite: Number(document.getElementById('achatQuantite').value),
    prix_achat_unitaire: Number(document.getElementById('achatPrix').value),
  };
  const msg = document.getElementById('achatMessage');
  if (!body.produit_id || !body.quantite || !body.prix_achat_unitaire){
    msg.textContent = 'Merci de renseigner produit, quantité et prix d\'achat.';
    msg.className = 'message erreur';
    return;
  }
  await fetch('/api/achats', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  msg.textContent = 'Entrée de stock enregistrée.';
  msg.className = 'message succes';
  document.getElementById('achatQuantite').value = 1;
  document.getElementById('achatPrix').value = '';
  await chargerReferentiels();
  await chargerAchats();
});

/* ---------------- FACTURES ---------------- */
async function chargerFactures(){
  const liste = await fetch('/api/factures').then(r=>r.json());
  document.getElementById('tableFactures').innerHTML = liste.map(f => `
    <tr>
      <td>${f.numero}</td>
      <td>${new Date(f.date).toLocaleDateString('fr-FR')}</td>
      <td>${f.client_nom || 'Client de passage'}</td>
      <td>${fmt(f.total)}</td>
      <td>${f.statut}</td>
      <td><button class="btn-lien" data-voir="${f.id}">Voir</button></td>
    </tr>
  `).join('');

  document.querySelectorAll('[data-voir]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const facture = await fetch(`/api/factures/${btn.dataset.voir}`).then(r=>r.json());
      afficherRecu(facture);
    });
  });
}

/* ---------------- RAPPORTS ---------------- */
async function chargerRapports(){
  const jour = await fetch('/api/rapports/jour').then(r=>r.json());
  document.getElementById('rapRecette').textContent = fmt(jour.recette);
  document.getElementById('rapBenefice').textContent = fmt(jour.benefice);
  document.getElementById('rapNbFactures').textContent = jour.nb_factures;

  const top = await fetch('/api/rapports/top-produits').then(r=>r.json());
  document.getElementById('tableTop').innerHTML = top.map(t => `
    <tr><td>${t.nom}</td><td>${t.quantite_vendue}</td><td>${fmt(t.ca)}</td></tr>
  `).join('') || '<tr><td colspan="3" class="muted">Aucune vente pour le moment.</td></tr>';

  const faible = await fetch('/api/rapports/stock-faible').then(r=>r.json());
  document.getElementById('tableStockFaible').innerHTML = faible.map(p => `
    <tr><td>${p.nom}</td><td>${p.stock}</td><td>${p.seuil_alerte}</td></tr>
  `).join('') || '<tr><td colspan="3" class="muted">Aucune alerte de stock.</td></tr>';
}

chargerReferentiels();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  });
}
