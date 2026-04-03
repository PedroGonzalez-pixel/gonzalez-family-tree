// Email administrateur — affiche le bouton Modifier uniquement pour lui
const ADMIN_EMAIL = "TON_EMAIL@gmail.com"; // ← Remplace par ton email

const urlParams = new URLSearchParams(window.location.search);
const personId = urlParams.get("id");

if (!personId) {
  window.location.href = "dashboard.html";
}

firebase.auth().onAuthStateChanged(async function(user) {
  if (!user) return;

  // Affiche le bouton modifier pour l'admin
  if (user.email === ADMIN_EMAIL) {
    const editLink = document.getElementById("editLink");
    editLink.href = "edit.html?id=" + personId;
    editLink.style.display = "inline-block";
  }

  await loadPerson(personId);
});

async function loadPerson(id) {
  try {
    const doc = await db.collection("persons").doc(id).get();
    if (!doc.exists) {
      alert("Personne introuvable.");
      window.location.href = "dashboard.html";
      return;
    }

    const p = doc.data();

    // Nom complet
    const fullName = (p.firstName || "") + " " + (p.lastName || "");
    document.getElementById("fullName").textContent = fullName;
    document.getElementById("personName").textContent = fullName;

    // Dates
    let dates = "";
    if (p.birthDate) dates += "Né(e) le " + formatDate(p.birthDate);
    if (p.deathDate) dates += " — Décédé(e) le " + formatDate(p.deathDate);
    document.getElementById("dates").textContent = dates || "Dates inconnues";

    // Photo
    if (p.photoURL) {
      const photo = document.getElementById("personPhoto");
      photo.style.backgroundImage = "url(" + p.photoURL + ")";
      photo.style.backgroundSize = "cover";
      photo.style.backgroundPosition = "center";
      photo.textContent = "";
    }

    // Notes
    document.getElementById("personNotes").textContent = p.notes || "Aucune note.";

    // Relations
    if (p.fatherId) await loadRelation("fatherLink", p.fatherId);
    if (p.motherId) await loadRelation("motherLink", p.motherId);
    if (p.spouseId) await loadRelation("spouseLink", p.spouseId);

    // Enfants
    await loadChildren(id);

  } catch (err) {
    console.error("Erreur chargement :", err.message);
  }
}

async function loadRelation(elementId, relatedId) {
  try {
    const doc = await db.collection("persons").doc(relatedId).get();
    if (!doc.exists) return;
    const p = doc.data();
    const link = document.getElementById(elementId);
    link.textContent = p.firstName + " " + p.lastName;
    link.href = "person.html?id=" + relatedId;
  } catch (e) {}
}

async function loadChildren(parentId) {
  try {
    const snapshot = await db.collection("persons")
      .where("fatherId", "==", parentId)
      .get();
    const snapshot2 = await db.collection("persons")
      .where("motherId", "==", parentId)
      .get();

    const children = {};
    snapshot.forEach(doc => children[doc.id] = doc.data());
    snapshot2.forEach(doc => children[doc.id] = doc.data());

    const container = document.getElementById("childrenList");
    const ids = Object.keys(children);

    if (ids.length === 0) {
      container.innerHTML = "<p class='muted'>Aucun enfant enregistré</p>";
      return;
    }

    container.innerHTML = "";
    ids.forEach(id => {
      const p = children[id];
      const card = document.createElement("a");
      card.href = "person.html?id=" + id;
      card.className = "relation-card";
      card.innerHTML = "<p class='relation-name'>" + p.firstName + " " + p.lastName + "</p>";
      container.appendChild(card);
    });

  } catch (e) {}
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return d + "/" + m + "/" + y;
}
