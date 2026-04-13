const urlParams = new URLSearchParams(window.location.search);
const personId = urlParams.get("id");

// ── CLOUDINARY CONFIG ─────────────────────────────────────
const CLOUDINARY_CLOUD = "dekk2a3i0";
const CLOUDINARY_PRESET = "gonzalez_family";
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`;

let photoFile = null;
let isAdmin = false;
let allPersons = [];

async function checkAdmin(email) {
  try {
    const doc = await db.collection("authorizedUsers").doc(email).get();
    if (!doc.exists) return false;
    return doc.data().role === "admin";
  } catch (e) { return false; }
}

firebase.auth().onAuthStateChanged(async function(user) {
  if (!user) return;
  isAdmin = await checkAdmin(user.email);
  if (!isAdmin) {
    alert("⛔ Seul l'administrateur peut modifier les données.");
    window.location.href = "dashboard.html";
    return;
  }
  await loadAllPersons();
  if (personId) {
    document.getElementById("deleteBtn").style.display = "inline-block";
    await loadPerson(personId);
  }
});

// ── Charge toutes les personnes triées alphabétiquement ────
async function loadAllPersons() {
  try {
    const snapshot = await db.collection("persons").get();
    allPersons = [];
    snapshot.forEach(doc => {
      if (doc.id === personId) return;
      const p = doc.data();
      allPersons.push({
        id: doc.id,
        firstName: p.firstName || "",
        lastName: p.lastName || "",
        spouseId: p.spouseId || null,
        fullName: ((p.firstName || "") + " " + (p.lastName || "")).trim()
      });
    });
    allPersons.sort((a, b) => a.fullName.localeCompare(b.fullName, "fr"));

    const selects = ["fatherId", "motherId", "spouseId"];
    selects.forEach(selectId => {
      const select = document.getElementById(selectId);
      while (select.options.length > 1) select.remove(1);
      allPersons.forEach(p => {
        const option = document.createElement("option");
        option.value = p.id;
        option.textContent = p.fullName;
        select.appendChild(option);
      });
    });

    setupParentListeners();
  } catch (e) { console.error("loadAllPersons:", e.message); }
}

// ── Auto-remplissage conjoint quand on choisit père ou mère ─
function setupParentListeners() {
  ["fatherId", "motherId"].forEach(field => {
    document.getElementById(field).addEventListener("change", function() {
      autoFillSpouse();
    });
  });
}

function autoFillSpouse() {
  const fatherId = document.getElementById("fatherId").value;
  const motherId = document.getElementById("motherId").value;

  if (fatherId) {
    const father = allPersons.find(p => p.id === fatherId);
    if (father && father.spouseId && !motherId) {
      const spouseExists = allPersons.find(p => p.id === father.spouseId);
      if (spouseExists) { document.getElementById("motherId").value = father.spouseId; return; }
    }
  }
  if (motherId) {
    const mother = allPersons.find(p => p.id === motherId);
    if (mother && mother.spouseId && !fatherId) {
      const spouseExists = allPersons.find(p => p.id === mother.spouseId);
      if (spouseExists) { document.getElementById("fatherId").value = mother.spouseId; return; }
    }
  }
}

// ── Charge une personne existante ─────────────────────────
async function loadPerson(id) {
  try {
    const doc = await db.collection("persons").doc(id).get();
    if (!doc.exists) return;
    const p = doc.data();
    document.getElementById("firstName").value = p.firstName || "";
    document.getElementById("lastName").value  = p.lastName  || "";
    document.getElementById("nickname").value  = p.nickname  || "";
    document.getElementById("birthDate").value = p.birthDate || "";
    document.getElementById("deathDate").value = p.deathDate || "";
    document.getElementById("notes").value     = p.notes     || "";
    if (p.fatherId) document.getElementById("fatherId").value = p.fatherId;
    if (p.motherId) document.getElementById("motherId").value = p.motherId;
    if (p.spouseId) document.getElementById("spouseId").value = p.spouseId;
    if (p.photoURL) {
      const preview = document.getElementById("avatarPreview");
      preview.style.backgroundImage    = "url('" + p.photoURL + "')";
      preview.style.backgroundSize     = "cover";
      preview.style.backgroundPosition = "center";
      preview.textContent = "";
    }
  } catch (e) { console.error("loadPerson:", e.message); }
}

// ── Aperçu photo locale ───────────────────────────────────
document.getElementById("photoInput").addEventListener("change", function(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("Veuillez choisir une image (JPG, PNG...)");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    alert("L'image est trop lourde (max 5 Mo)");
    return;
  }

  photoFile = file;

  const reader = new FileReader();
  reader.onload = function(ev) {
    const preview = document.getElementById("avatarPreview");
    preview.style.backgroundImage    = "url('" + ev.target.result + "')";
    preview.style.backgroundSize     = "cover";
    preview.style.backgroundPosition = "center";
    preview.textContent = "";
  };
  reader.readAsDataURL(file);
});

// ── Upload photo vers Cloudinary ──────────────────────────
async function uploadPhoto(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_PRESET);
  formData.append("folder", "gonzalez_family");

  const response = await fetch(CLOUDINARY_URL, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error("Cloudinary : " + (err.error?.message || "Erreur upload"));
  }

  const data = await response.json();
  return data.secure_url;
}

// ── Soumission du formulaire ──────────────────────────────
document.getElementById("personForm").addEventListener("submit", async function(e) {
  e.preventDefault();
  if (!isAdmin) { alert("⛔ Accès refusé."); return; }

  const submitBtn = document.getElementById("submitBtn");
  submitBtn.disabled = true;
  submitBtn.textContent = "⏳";

  try {
    let photoURL = null;

    if (photoFile) {
      submitBtn.textContent = "📤 Upload...";
      photoURL = await uploadPhoto(photoFile);
    }

    const newSpouseId = document.getElementById("spouseId").value || null;

    const data = {
      firstName: document.getElementById("firstName").value.trim(),
      lastName:  document.getElementById("lastName").value.trim(),
      nickname:  document.getElementById("nickname").value.trim()  || null,
      birthDate: document.getElementById("birthDate").value        || null,
      deathDate: document.getElementById("deathDate").value        || null,
      fatherId:  document.getElementById("fatherId").value         || null,
      motherId:  document.getElementById("motherId").value         || null,
      spouseId:  newSpouseId,
      notes:     document.getElementById("notes").value.trim()     || null,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (photoURL) data.photoURL = photoURL;

    let currentPersonId = personId;

    if (personId) {
      const oldDoc = await db.collection("persons").doc(personId).get();
      const oldSpouseId = oldDoc.exists ? (oldDoc.data().spouseId || null) : null;
      await db.collection("persons").doc(personId).update(data);
      await syncSpouse(personId, oldSpouseId, newSpouseId);
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      const newDoc = await db.collection("persons").add(data);
      currentPersonId = newDoc.id;
      await syncSpouse(currentPersonId, null, newSpouseId);
    }

    window.location.href = "dashboard.html";

  } catch (err) {
    console.error("Erreur sauvegarde:", err);
    alert("Erreur : " + err.message);
    submitBtn.disabled = false;
    submitBtn.textContent = "Enregistrer";
  }
});

// ── Synchronisation du conjoint ───────────────────────────
async function syncSpouse(myId, oldSpouseId, newSpouseId) {
  try {
    if (oldSpouseId && oldSpouseId !== newSpouseId) {
      const oldDoc = await db.collection("persons").doc(oldSpouseId).get();
      if (oldDoc.exists && oldDoc.data().spouseId === myId) {
        await db.collection("persons").doc(oldSpouseId).update({
          spouseId: null,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    }
    if (newSpouseId && newSpouseId !== oldSpouseId) {
      await db.collection("persons").doc(newSpouseId).update({
        spouseId: myId,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  } catch (e) { console.error("syncSpouse:", e.message); }
}

// ── Suppression ───────────────────────────────────────────
document.getElementById("deleteBtn").addEventListener("click", async function() {
  if (!isAdmin) { alert("⛔ Accès refusé."); return; }
  if (!confirm("Supprimer cette personne ? Cette action est irréversible.")) return;
  try {
    const doc = await db.collection("persons").doc(personId).get();
    if (doc.exists) {
      const spouseId = doc.data().spouseId;
      if (spouseId) {
        const spouseDoc = await db.collection("persons").doc(spouseId).get();
        if (spouseDoc.exists && spouseDoc.data().spouseId === personId) {
          await db.collection("persons").doc(spouseId).update({ spouseId: null });
        }
      }
    }
    await db.collection("persons").doc(personId).delete();
    window.location.href = "dashboard.html";
  } catch (err) {
    alert("Erreur suppression : " + err.message);
  }
});
