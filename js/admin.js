// ADMIN.JS - Gestion administration arbre généalogique

const TREE_ID = 'gonzalez-tree';
let _currentUser = null;
let _currentFilter = 'ALL';

// Basculer entre les onglets
function switchTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  
  document.getElementById(tabName).classList.add('active');
  event.target.classList.add('active');
  
  // Recharger les données
  if(tabName === 'access') loadAccessList();
  if(tabName === 'comments') loadComments();
  if(tabName === 'tree-info') loadTreeInfo();
}

// Auth
firebase.auth().onAuthStateChanged(async user => {
  if(!user) {
    window.location.href = 'index.html';
    return;
  }
  
  _currentUser = user;
  document.getElementById('userEmail').textContent = user.email;
  
  // Vérifier que c'est l'admin
  const treeSnap = await db.collection('trees').doc(TREE_ID).get();
  if(!treeSnap.exists || treeSnap.data().ownerId !== user.uid) {
    document.getElementById('mainContent').style.display = 'none';
    document.getElementById('loadingMsg').innerHTML = '<h2>Accès refusé</h2><p>Vous devez être propriétaire de cet arbre.</p>';
    return;
  }
  
  document.getElementById('loadingMsg').style.display = 'none';
  document.getElementById('mainContent').style.display = 'block';
  
  loadAccessList();
  loadTreeInfo();
});

function logout() {
  firebase.auth().signOut().then(() => {
    window.location.href = 'index.html';
  });
}

// ==================== ACCÈS ====================

async function loadAccessList() {
  const list = document.getElementById('accessList');
  list.innerHTML = '<div class="loading" style="margin: 20px auto;"></div>';
  
  const accessSnap = await db.collection('access')
    .where('treeId', '==', TREE_ID)
    .orderBy('grantedAt', 'desc')
    .get();
  
  if(accessSnap.empty) {
    list.innerHTML = '<div class="empty-state"><p>Aucun lecteur ajouté pour l\'instant.</p><p style="font-size: 12px;">Ajoutez des personnes ci-dessus pour qu\'elles puissent consulter l\'arbre.</p></div>';
    return;
  }
  
  let html = '<table><thead><tr><th>Utilisateur</th><th>Rôle</th><th>Accès depuis</th><th>Actions</th></tr></thead><tbody>';
  
  for(const doc of accessSnap.docs) {
    const access = doc.data();
    let userName = access.userId;
    
    try {
      const userSnap = await db.collection('users').doc(access.userId).get();
      if(userSnap.exists) userName = userSnap.data().email || access.userId;
    } catch(e) {
      // User doc peut ne pas exister
    }
    
    const date = access.grantedAt ? access.grantedAt.toDate().toLocaleDateString() : 'N/A';
    
    html += `
      <tr>
        <td>${userName}</td>
        <td><span class="badge ${access.role.toLowerCase()}">${access.role}</span></td>
        <td>${date}</td>
        <td>
          <div class="actions">
            <button class="danger" onclick="removeAccess('${doc.id}', '${userName}')">Retirer</button>
          </div>
        </td>
      </tr>
    `;
  }
  
  html += '</tbody></table>';
  list.innerHTML = html;
}

async function addAccess() {
  const email = document.getElementById('newUserEmail').value.trim();
  const msgDiv = document.getElementById('addAccessMsg');
  msgDiv.innerHTML = '';
  
  if(!email) {
    msgDiv.innerHTML = '<div class="alert error">❌ Entrez un email valide</div>';
    return;
  }
  
  try {
    // Trouver l'utilisateur par email
    const userRecord = await firebase.auth().getUser(email).catch(() => null);
    
    if(!userRecord) {
      // L'utilisateur n'existe pas encore, on peut quand même ajouter l'accès
      // Firebase Auth le créera quand il se connectera la première fois
      msgDiv.innerHTML = '<div class="alert error">❌ Cet email n\'existe pas dans Firebase. La personne doit d\'abord se connecter une fois.</div>';
      return;
    }
    
    // Vérifier si accès existe déjà
    const existingSnap = await db.collection('access')
      .where('treeId', '==', TREE_ID)
      .where('userId', '==', userRecord.uid)
      .limit(1)
      .get();
    
    if(!existingSnap.empty) {
      msgDiv.innerHTML = '<div class="alert error">❌ Cet utilisateur a déjà accès</div>';
      return;
    }
    
    // Ajouter l'accès
    await db.collection('access').add({
      treeId: TREE_ID,
      userId: userRecord.uid,
      role: 'READER',
      grantedAt: new Date(),
      grantedBy: _currentUser.uid
    });
    
    msgDiv.innerHTML = '<div class="alert success">✅ Accès accordé avec succès !</div>';
    document.getElementById('newUserEmail').value = '';
    
    setTimeout(() => loadAccessList(), 500);
    setTimeout(() => msgDiv.innerHTML = '', 3000);
    
  } catch(error) {
    msgDiv.innerHTML = '<div class="alert error">❌ Erreur: ' + error.message + '</div>';
  }
}

async function removeAccess(accessId, userName) {
  if(!confirm(`Êtes-vous sûr de vouloir retirer l'accès à ${userName} ?`)) return;
  
  try {
    await db.collection('access').doc(accessId).delete();
    loadAccessList();
  } catch(error) {
    alert('Erreur: ' + error.message);
  }
}

// ==================== COMMENTAIRES ====================

async function loadComments() {
  const list = document.getElementById('commentsList');
  list.innerHTML = '<div class="loading" style="margin: 20px auto;"></div>';
  
  let query = db.collection('comments')
    .where('treeId', '==', TREE_ID);
  
  if(_currentFilter !== 'ALL') {
    query = query.where('status', '==', _currentFilter);
  }
  
  const commentsSnap = await query
    .orderBy('createdAt', 'desc')
    .get();
  
  if(commentsSnap.empty) {
    list.innerHTML = '<div class="empty-state"><p>Aucun commentaire.</p></div>';
    return;
  }
  
  let html = '<table><thead><tr><th>Personne</th><th>De</th><th>Commentaire</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
  
  for(const doc of commentsSnap.docs) {
    const c = doc.data();
    const person = (await db.collection('persons').doc(c.personId).get()).data() || {};
    const personName = (person.firstName || '') + ' ' + (person.lastName || '');
    const date = c.createdAt ? c.createdAt.toDate().toLocaleDateString() : 'N/A';
    
    const commentText = c.text.substring(0, 50) + (c.text.length > 50 ? '...' : '');
    
    html += `
      <tr>
        <td>${personName}</td>
        <td>${c.userName}</td>
        <td style="cursor: pointer; text-decoration: underline;" onclick="showCommentDetail('${doc.id}')">${commentText}</td>
        <td>${date}</td>
        <td><span class="badge ${c.status.toLowerCase()}">${c.status}</span></td>
        <td>
          <div class="actions">
            ${c.status === 'PENDING' ? `<button class="secondary" onclick="markAsResolved('${doc.id}')">Résolu</button>` : `<button class="secondary" onclick="markAsPending('${doc.id}')">En attente</button>`}
            <button class="danger" onclick="deleteComment('${doc.id}')">Supprimer</button>
          </div>
        </td>
      </tr>
    `;
  }
  
  html += '</tbody></table>';
  list.innerHTML = html;
}

function filterComments(filter) {
  _currentFilter = filter;
  loadComments();
}

async function showCommentDetail(commentId) {
  const commentSnap = await db.collection('comments').doc(commentId).get();
  const c = commentSnap.data();
  const person = (await db.collection('persons').doc(c.personId).get()).data() || {};
  const personName = (person.firstName || '') + ' ' + (person.lastName || '');
  
  const dialog = document.createElement('dialog');
  dialog.innerHTML = `
    <h3>Détail du commentaire</h3>
    <p><strong>Personne :</strong> ${personName}</p>
    <p><strong>De :</strong> ${c.userName}</p>
    <p><strong>Date :</strong> ${c.createdAt.toDate().toLocaleDateString()}</p>
    <p><strong>Statut :</strong> ${c.status}</p>
    <hr style="margin: 16px 0; border: none; border-top: 1px solid #d1d1d6;">
    <p><strong>Message :</strong></p>
    <p style="background: #f5f5f7; padding: 12px; border-radius: 4px; color: #1d1d1f; font-size: 13px;">${c.text}</p>
    <hr style="margin: 16px 0; border: none; border-top: 1px solid #d1d1d6;">
    <div style="display: flex; gap: 8px;">
      <button onclick="this.closest('dialog').close()">Fermer</button>
    </div>
  `;
  document.body.appendChild(dialog);
  dialog.showModal();
}

async function markAsResolved(commentId) {
  await db.collection('comments').doc(commentId).update({
    status: 'RESOLVED'
  });
  loadComments();
}

async function markAsPending(commentId) {
  await db.collection('comments').doc(commentId).update({
    status: 'PENDING'
  });
  loadComments();
}

async function deleteComment(commentId) {
  if(!confirm('Êtes-vous sûr de vouloir supprimer ce commentaire ?')) return;
  
  await db.collection('comments').doc(commentId).delete();
  loadComments();
}

// ==================== INFOS ARBRE ====================

async function loadTreeInfo() {
  const treeSnap = await db.collection('trees').doc(TREE_ID).get();
  if(!treeSnap.exists) return;
  
  const tree = treeSnap.data();
  document.getElementById('treeName').textContent = tree.name || 'Arbre Généalogique';
  document.getElementById('treeCreatedAt').textContent = tree.createdAt 
    ? tree.createdAt.toDate().toLocaleDateString() 
    : 'N/A';
  
  const url = window.location.origin + '/tree.html';
  document.getElementById('shareLink').value = url;
}

function copyShareLink() {
  const input = document.getElementById('shareLink');
  input.select();
  document.execCommand('copy');
  
  const btn = event.target;
  const originalText = btn.textContent;
  btn.textContent = '✅ Copié !';
  setTimeout(() => btn.textContent = originalText, 2000);
}
