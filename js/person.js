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
