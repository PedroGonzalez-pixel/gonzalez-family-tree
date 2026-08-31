// ========== TREE MODULE ==========
// Arbre généalogique avec D3.js et clic droit

console.log("✅ tree.js loading...");

let treeData = null;
let _selectedIds = new Set();
let _pos = {};
let _userRole = null;
let TREE_ID = "gonzalez-tree";

// Charger les données au démarrage
document.addEventListener('DOMContentLoaded', function() {
    console.log("📁 tree.html loaded");
    
    // Vérifier les permissions
    checkPermissions();
    
    // Charger l'arbre
    loadTree();
});

// Vérifier si utilisateur est admin
function checkPermissions() {
    const user = firebase.auth().currentUser;
    if (!user) {
        window.location.href = 'index.html';
        return;
    }
    
    db.collection('trees').doc(TREE_ID).get().then((doc) => {
        if (doc.data().ownerId === user.uid) {
            _userRole = 'ADMIN';
            console.log("✅ User is ADMIN");
        } else {
            _userRole = 'READER';
            console.log("⏳ User is READER");
        }
    }).catch(err => {
        console.warn("Could not check role:", err);
        _userRole = 'READER';
    });
}

// Charger les données de l'arbre
function loadTree() {
    console.log("📊 Loading tree data...");
    
    db.collection('persons').get().then((snapshot) => {
        treeData = {};
        snapshot.forEach(doc => {
            treeData[doc.id] = doc.data();
            treeData[doc.id].id = doc.id;
        });
        
        console.log(`✅ Loaded ${snapshot.size} persons`);
        renderTree();
    }).catch(err => {
        console.error("Error loading tree:", err);
    });
}

// Afficher l'arbre
function renderTree() {
    if (!treeData) return;
    
    const container = document.getElementById('tree-container');
    if (!container) {
        console.warn("No #tree-container found");
        return;
    }
    
    // Créer SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '800');
    svg.style.border = '1px solid #e5e5e7';
    svg.style.background = '#fafafa';
    
    container.innerHTML = '';
    container.appendChild(svg);
    
    // Dessiner les personnes
    let x = 50;
    let y = 50;
    
    Object.values(treeData).forEach((person) => {
        // Créer un groupe pour la personne
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'person-node');
        g.setAttribute('data-id', person.id);
        
        // Rectangle
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', '150');
        rect.setAttribute('height', '80');
        rect.setAttribute('fill', '#0071e3');
        rect.setAttribute('stroke', '#005BBD');
        rect.setAttribute('rx', '8');
        rect.setAttribute('ry', '8');
        rect.style.cursor = 'pointer';
        
        // Texte
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x + 75);
        text.setAttribute('y', y + 40);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('fill', 'white');
        text.setAttribute('font-size', '14px');
        text.setAttribute('font-weight', '600');
        text.textContent = `${person.firstName || ''} ${person.lastName || ''}`.trim();
        
        g.appendChild(rect);
        g.appendChild(text);
        
        // Event listeners
        rect.addEventListener('click', () => {
            console.log("Person clicked:", person.id);
            showPersonInfo(person);
        });
        
        rect.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            console.log("Right click on person:", person.id);
            showContextMenu(e, person);
        });
        
        svg.appendChild(g);
        
        x += 200;
        if (x > 800) {
            x = 50;
            y += 150;
        }
    });
    
    console.log("✅ Tree rendered");
}

// Afficher info personne
function showPersonInfo(person) {
    const modal = document.getElementById('person-modal') || createPersonModal();
    const content = modal.querySelector('.modal-content');
    
    content.innerHTML = `
        <h2>${person.firstName} ${person.lastName}</h2>
        <p><strong>Naissance :</strong> ${person.birthDate || 'N/A'}</p>
        <p><strong>Décès :</strong> ${person.deathDate || 'N/A'}</p>
        <p><strong>Notes :</strong> ${person.notes || 'N/A'}</p>
        <button onclick="closeModal()" style="margin-top:20px; padding:10px; background:#0071e3; color:white; border:none; border-radius:6px; cursor:pointer;">Fermer</button>
    `;
    
    modal.style.display = 'flex';
}

// Menu contextuel
function showContextMenu(event, person) {
    let menu = document.getElementById('context-menu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'context-menu';
        menu.style.cssText = `
            position: fixed;
            background: white;
            border: 1px solid #d5d5d7;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            min-width: 200px;
        `;
        document.body.appendChild(menu);
    }
    
    let html = '';
    
    if (_userRole === 'ADMIN') {
        html += `<div style="padding:8px 12px; cursor:pointer; hover-color:#f5f5f7;" onclick="editPerson('${person.id}')">✏️ Éditer</div>`;
    }
    
    html += `<div style="padding:8px 12px; cursor:pointer;" onclick="addComment('${person.id}')">💬 Commenter</div>`;
    html += `<div style="padding:8px 12px; cursor:pointer;" onclick="viewComments('${person.id}')">👁️ Voir commentaires</div>`;
    
    menu.innerHTML = html;
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';
    menu.style.display = 'block';
    
    document.addEventListener('click', () => {
        menu.style.display = 'none';
    }, { once: true });
}

// Éditer personne
function editPerson(personId) {
    console.log("Edit person:", personId);
    alert('Édition non disponible pour le moment. Utilisez edit.html');
}

// Ajouter commentaire
function addComment(personId) {
    console.log("Add comment for person:", personId);
    
    const text = prompt("Votre commentaire:");
    if (!text) return;
    
    const user = firebase.auth().currentUser;
    
    db.collection('comments').add({
        treeId: TREE_ID,
        personId: personId,
        userId: user.uid,
        userName: user.email,
        text: text,
        createdAt: new Date(),
        status: 'PENDING'
    }).then(() => {
        console.log("✅ Comment added");
        alert('Commentaire envoyé !');
    }).catch(err => {
        console.error("Error adding comment:", err);
        alert('Erreur: ' + err.message);
    });
}

// Voir commentaires
function viewComments(personId) {
    console.log("View comments for person:", personId);
    
    db.collection('comments')
        .where('personId', '==', personId)
        .orderBy('createdAt', 'desc')
        .get()
        .then((snapshot) => {
            if (snapshot.empty) {
                alert('Aucun commentaire');
                return;
            }
            
            let msg = 'Commentaires:\n\n';
            snapshot.forEach(doc => {
                const data = doc.data();
                msg += `${data.userName}: ${data.text}\n`;
            });
            
            alert(msg);
        });
}

// Utilitaires
function createPersonModal() {
    const modal = document.createElement('div');
    modal.id = 'person-modal';
    modal.style.cssText = `
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.3);
        align-items: center;
        justify-content: center;
        z-index: 999;
    `;
    
    const content = document.createElement('div');
    content.className = 'modal-content';
    content.style.cssText = `
        background: white;
        padding: 24px;
        border-radius: 12px;
        max-width: 500px;
        width: 90%;
    `;
    
    modal.appendChild(content);
    document.body.appendChild(modal);
    return modal;
}

function closeModal() {
    const modal = document.getElementById('person-modal');
    if (modal) modal.style.display = 'none';
}

console.log("✅ tree.js loaded");
