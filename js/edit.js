const urlParams = new URLSearchParams(window.location.search);
const personId = urlParams.get("id");

let photoFile = null;
let isAdmin = false;
let allPersons = []; // Cache de toutes les personnes

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

    // Construire la liste et trier par nom complet
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

    // Tri alphabétique par nom complet
    allPersons.sort((a, b) => a.fullName.localeCompare(b.fullName, "fr"));

    // Remplir les selects
    const selects = ["fatherId", "motherId", "spouseId"];
    selects.forEach(selectId => {
      const select = document.getElementById(selectId);
      // Garder l'option vide
      while (select.options.length > 1) select.remove(1);
      allPersons.forEach(p => {
        const option = document.createElement("option");
        option.value = p.id;
        option.textContent = p.fullName;
        select.appendChild(option);
      });
    });

    // Écouter les changements de père/mère pour auto-remplir le conjoint
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
  const fatherSelect = document.getElementById("fatherId");
  const motherSelect = document.getElementById("motherId");
  const spouseSelect = document.getElementById("spouseId");

  const fatherId = fatherSelect.value;
  const motherId = motherSelect.value;

  // Si père sélectionné → chercher son conjoint
  if (fatherId) {
    const father = allPersons.find(p => p.id === fatherId);
    if (father && father.spouseId) {
      // Vérifier que le conjoint est dans la liste
      const spouseExists = allPersons.find(p => p.id === father.spouseId);
      if (spouseExists && !motherId) {
        motherSelect.value = father.spouseId;
        return;
      }
    }
  }

  // Si mère sélectionnée → chercher son conjoint
  if (motherId) {
    const mother = allPersons.find(p => p.id === motherId);
    if (mother && mother.spouseId) {
      const spouseExists = allPersons.find(p => p.id === mother.spouseId);
      if (spouseExists && !fatherId) {
        fatherSelect.value = mother.spouseId;
        return;
      }
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
  photoFile = file;

  // Vérification type et taille
  if (!file.type.startsWith("image/")) {
    alert("Veuillez choisir une image (JPG, PNG...)");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    alert("L'image est trop lourde (max 5 Mo)");
    return;
  }

  const reader = new FileReader();
  reader.onload = function(ev) {
    const preview = document.getElementById("avatarPreview");
    preview.style.backgroundImage    = "url('" + ev.target.result + "')";
    preview.style.backgroundSize     = "cover";
    preview.style.backgroundPosition = "center";
    preview.textContent = "";
  };
  reader.onerror = function() {
    alert("Impossible de lire l'image.");
    photoFile = null;
  };
  reader.readAsDataURL(file);
});

// ── Soumission du formulaire ──────────────────────────────
document.getElementById("personForm").addEventListener("submit", async function(e) {
  e.preventDefault();
  if (!isAdmin) { alert("⛔ Accès refusé."); return; }

  const submitBtn = document.getElementById("submitBtn");
  submitBtn.disabled = true;
  submitBtn.textContent = "⏳";

  try {
    let photoURL = null;

    // Upload photo
    if (photoFile) {
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
      // Récupérer l'ancien spouseId avant modification
      const oldDoc = await db.collection("persons").doc(personId).get();
      const oldSpouseId = oldDoc.exists ? (oldDoc.data().spouseId || null) : null;

      await db.collection("persons").doc(personId).update(data);

      // Sync conjoint : mettre à jour la fiche du conjoint
      await syncSpouse(personId, oldSpouseId, newSpouseId);

    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      const newDoc = await db.collection("persons").add(data);
      currentPersonId = newDoc.id;

      // Sync conjoint pour la nouvelle personne
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

// ── Upload photo vers Firebase Storage ───────────────────
async function uploadPhoto(file) {
  return new Promise((resolve, reject) => {
    const ext = file.name.split(".").pop().toLowerCase();
    const fileName = "photos/" + Date.now() + "_" + Math.random().toString(36).substr(2, 6) + "." + ext;
    const ref = storage.ref(fileName);
    const uploadTask = ref.put(file);

    uploadTask.on(
      "state_changed",
      null,
      (error) => {
        console.error("Upload error:", error);
        reject(new Error("Erreur upload : " + error.message));
      },
      async () => {
        try {
          const url = await uploadTask.snapshot.ref.getDownloadURL();
          resolve(url);
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}

// ── Synchronisation du conjoint ───────────────────────────
// Met à jour la fiche du conjoint pour refléter le lien réciproque
async function syncSpouse(myId, oldSpouseId, newSpouseId) {
  try {
    // Si l'ancien conjoint existait → enlever le lien de son côté
    if (oldSpouseId && oldSpouseId !== newSpouseId) {
      const oldSpouseDoc = await db.collection("persons").doc(oldSpouseId).get();
      if (oldSpouseDoc.exists && oldSpouseDoc.data().spouseId === myId) {
        await db.collection("persons").doc(oldSpouseId).update({
          spouseId: null,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    }

    // Si nouveau conjoint → mettre à jour son spouseId
    if (newSpouseId && newSpouseId !== oldSpouseId) {
      await db.collection("persons").doc(newSpouseId).update({
        spouseId: myId,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  } catch (e) {
    console.error("syncSpouse error:", e.message);
  }
}

// ── Suppression ───────────────────────────────────────────
document.getElementById("deleteBtn").addEventListener("click", async function() {
  if (!isAdmin) { alert("⛔ Accès refusé."); return; }
  if (!confirm("Supprimer cette personne ? Cette action est irréversible.")) return;
  try {
    // Nettoyer le lien conjoint avant suppression
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
