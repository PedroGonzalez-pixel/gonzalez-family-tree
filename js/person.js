const urlParams = new URLSearchParams(window.location.search);
const personId = urlParams.get("id");

if (!personId) window.location.href = "dashboard.html";

async function checkAdmin(email) {
  try {
    const doc = await db.collection("authorizedUsers").doc(email).get();
    if (!doc.exists) return false;
    return doc.data().role === "admin";
  } catch (e) { return false; }
}

firebase.auth().onAuthStateChanged(async function(user) {
  if (!user) return;
  const isAdmin = await checkAdmin(user.email);
  await loadPerson(personId, isAdmin);
});

async function loadPerson(id, isAdmin) {
  try {
    const doc = await db.collection("persons").doc(id).get();
    if (!doc.exists) {
      document.getElementById("mainContent").innerHTML = "<div class='loading'>Personne introuvable.</div>";
      return;
    }

    const p = doc.data();
    const t = window.i18n ? window.i18n[window.currentLang || "fr"] : {};
    const fullName = (p.firstName || "") + " " + (p.lastName || "");

    // Topbar
    document.getElementById("topbarName").textContent = fullName;

    // Dates
    let datesHTML = "";
    if (p.birthDate) {
      datesHTML += `<div class="date-badge">🕊 <span>${formatDate(p.birthDate)}</span></div>`;
    }
    if (p.deathDate) {
      datesHTML += `<div class="date-badge">✝ <span>${formatDate(p.deathDate)}</span></div>`;
    }

    // Bouton modifier
    const editBtn = isAdmin
      ? `<a href="edit.html?id=${id}" class="btn-edit" data-i18n="edit">✏️ Modifier</a>`
      : "";

    // Surnom
    const nicknameHTML = p.nickname
      ? `<p class="person-nickname">"${p.nickname}"</p>`
      : "";

    // Photo
    const photoStyle = p.photoURL
      ? `style="background-image:url('${p.photoURL}');background-size:cover;background-position:center;"`
      : "";
    const photoContent = p.photoURL ? "" : "👤";

    // HTML principal
    const html = `
      <div class="person-hero">
        <div class="avatar-large" ${photoStyle}>${photoContent}</div>
        <div class="person-identity">
          <h2>${fullName}</h2>
          ${nicknameHTML}
          <div class="person-dates">${datesHTML || `<span class="relation-empty">Dates inconnues</span>`}</div>
          ${editBtn}
        </div>
      </div>

      <div class="info-card" id="familyCard">
        <h3 data-i18n="sectionFamily">Famille</h3>
        <div class="relation-grid">
          <div class="relation-item">
            <span class="relation-label" data-i18n="father">Père</span>
            <span class="relation-empty" id="fatherSlot">—</span>
          </div>
          <div class="relation-item">
            <span class="relation-label" data-i18n="mother">Mère</span>
            <span class="relation-empty" id="motherSlot">—</span>
          </div>
          <div class="relation-item">
            <span class="relation-label" data-i18n="spouse">Conjoint(e)</span>
            <span class="relation-empty" id="spouseSlot">—</span>
          </div>
        </div>
      </div>

      <div class="info-card">
        <h3 data-i18n="sectionChildren">Enfants</h3>
        <div class="children-grid" id="childrenGrid">
          <span class="notes-empty" data-i18n="noChildren">Aucun enfant enregistré</span>
        </div>
      </div>

      <div class="info-card">
        <h3 data-i18n="sectionNotes">Notes & Biographie</h3>
        <p class="${p.notes ? 'notes-text' : 'notes-empty'}" id="notesText">
          ${p.notes || "Aucune note."}
        </p>
      </div>
    `;

    document.getElementById("mainContent").innerHTML = html;

    // Appliquer traductions sur le nouveau contenu
    if (window.applyTranslations) window.applyTranslations();

    // **AJOUTER SECTION COMMENTAIRES**
    const commentsHTML = `
      <div class="info-card">
        <h3>💬 Commentaires</h3>
        <div id="commentsList" style="margin-bottom: 24px;"></div>
        <div style="border-top: 1px solid #e0e0e5; padding-top: 20px;">
          <textarea id="commentText" placeholder="Écrivez votre commentaire..." style="width: 100%; padding: 12px; border: 1px solid #d5d5d7; border-radius: 8px; font-family: 'DM Sans', sans-serif; font-size: 14px; resize: vertical; min-height: 80px;"></textarea>
          <button onclick="submitComment('${id}')" style="margin-top: 12px; padding: 10px 20px; background: #0071e3; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600;">Envoyer</button>
        </div>
      </div>
    `;
    document.getElementById("mainContent").innerHTML += commentsHTML;

    // Charger les commentaires
    loadComments(id);

    // Charger les relations
    if (p.fatherId) await loadRelation("fatherSlot", p.fatherId);
    if (p.motherId) await loadRelation("motherSlot", p.motherId);
    if (p.spouseId) await loadRelation("spouseSlot", p.spouseId);
    await loadChildren(id);

  } catch (err) {
    console.error("Erreur :", err.message);
    document.getElementById("mainContent").innerHTML = "<div class='loading'>Erreur de chargement.</div>";
  }
}

async function loadRelation(slotId, relatedId) {
  try {
    const doc = await db.collection("persons").doc(relatedId).get();
    if (!doc.exists) return;
    const p = doc.data();
    const slot = document.getElementById(slotId);
    if (!slot) return;
    slot.outerHTML = `<a href="person.html?id=${relatedId}" class="relation-link">${p.firstName} ${p.lastName}</a>`;
  } catch (e) {}
}

async function loadChildren(parentId) {
  try {
    const [s1, s2] = await Promise.all([
      db.collection("persons").where("fatherId", "==", parentId).get(),
      db.collection("persons").where("motherId", "==", parentId).get()
    ]);

    const children = {};
    s1.forEach(doc => children[doc.id] = doc.data());
    s2.forEach(doc => children[doc.id] = doc.data());

    const grid = document.getElementById("childrenGrid");
    const ids = Object.keys(children);
    if (ids.length === 0) return;

    grid.innerHTML = "";
    ids.forEach(id => {
      const p = children[id];
      const pill = document.createElement("a");
      pill.href = "person.html?id=" + id;
      pill.className = "child-pill";
      pill.textContent = p.firstName + " " + p.lastName;
      grid.appendChild(pill);
    });
  } catch (e) {}
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return d + "/" + m + "/" + y;
}

// ========== COMMENTAIRES ==========

async function loadComments(personId) {
  try {
    const snapshot = await db.collection('comments')
      .where('personId', '==', personId)
      .orderBy('createdAt', 'desc')
      .get();

    const commentsList = document.getElementById('commentsList');
    const currentLang = localStorage.getItem('lang') || 'fr';

    if (snapshot.empty) {
      commentsList.innerHTML = '<p style="color: #6e6e73; font-style: italic;">Aucun commentaire</p>';
      return;
    }

    let html = '';
    snapshot.forEach(doc => {
      const comment = doc.data();
      const date = new Date(comment.createdAt.toDate());
      const dateStr = date.toLocaleString(currentLang === 'en' ? 'en-US' : currentLang === 'es' ? 'es-ES' : 'fr-FR');

      html += `
        <div style="background: #f9f9fb; border: 1px solid #e0e0e5; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
          <div style="font-weight: 600; font-size: 13px; color: #1d1d1f;">${comment.userName}</div>
          <div style="font-size: 11px; color: #6e6e73; margin-top: 2px;">${dateStr}</div>
          <div style="margin-top: 8px; font-size: 14px; color: #1d1d1f; line-height: 1.5;">${comment.text}</div>
        </div>
      `;
    });

    commentsList.innerHTML = html;
  } catch (err) {
    console.error("Error loading comments:", err);
  }
}

async function submitComment(personId) {
  const text = document.getElementById('commentText').value.trim();
  if (!text) {
    alert('Veuillez écrire un commentaire');
    return;
  }

  const user = firebase.auth().currentUser;
  if (!user) {
    alert('Vous devez être connecté');
    return;
  }

  try {
    await db.collection('comments').add({
      personId: personId,
      userId: user.uid,
      userName: user.email,
      text: text,
      createdAt: new Date()
    });

    // Incrémenter version
    let version = localStorage.getItem('appVersion') || 'v1.0.0';
    let parts = version.substring(1).split('.');
    parts[2] = (parseInt(parts[2]) + 1).toString();
    version = 'v' + parts.join('.');
    localStorage.setItem('appVersion', version);

    document.getElementById('commentText').value = '';
    await loadComments(personId);
  } catch (err) {
    alert('Erreur: ' + err.message);
  }
}
