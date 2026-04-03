const urlParams = new URLSearchParams(window.location.search);
const personId = urlParams.get("id");

let photoFile = null;
let isAdmin = false;

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

async function loadAllPersons() {
  try {
    const snapshot = await db.collection("persons").orderBy("lastName").get();
    const selects = ["fatherId", "motherId", "spouseId"];
    snapshot.forEach(doc => {
      if (doc.id === personId) return;
      const p = doc.data();
      selects.forEach(selectId => {
        const option = document.createElement("option");
        option.value = doc.id;
        option.textContent = (p.firstName || "") + " " + (p.lastName || "");
        document.getElementById(selectId).appendChild(option);
      });
    });
  } catch (e) { console.error("loadAllPersons:", e.message); }
}

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
      preview.style.backgroundImage = "url('" + p.photoURL + "')";
      preview.style.backgroundSize  = "cover";
      preview.style.backgroundPosition = "center";
      preview.textContent = "";
    }
  } catch (e) { console.error("loadPerson:", e.message); }
}

// Aperçu photo locale
document.getElementById("photoInput").addEventListener("change", function(e) {
  photoFile = e.target.files[0];
  if (!photoFile) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    const preview = document.getElementById("avatarPreview");
    preview.style.backgroundImage    = "url('" + ev.target.result + "')";
    preview.style.backgroundSize     = "cover";
    preview.style.backgroundPosition = "center";
    preview.textContent = "";
  };
  reader.readAsDataURL(photoFile);
});

// Soumission
document.getElementById("personForm").addEventListener("submit", async function(e) {
  e.preventDefault();
  if (!isAdmin) { alert("⛔ Accès refusé."); return; }

  const submitBtn = document.getElementById("submitBtn");
  submitBtn.disabled = true;
  submitBtn.textContent = "⏳";

  try {
    let photoURL = null;

    // Upload photo si fichier sélectionné
    if (photoFile) {
      const ext      = photoFile.name.split(".").pop();
      const fileName = "photos/" + Date.now() + "." + ext;
      const ref      = storage.ref(fileName);

      // Upload avec gestion de progression
      const uploadTask = ref.put(photoFile);
      await new Promise((resolve, reject) => {
        uploadTask.on("state_changed",
          null,
          reject,
          async () => {
            photoURL = await uploadTask.snapshot.ref.getDownloadURL();
            resolve();
          }
        );
      });
    }

    const data = {
      firstName: document.getElementById("firstName").value.trim(),
      lastName:  document.getElementById("lastName").value.trim(),
      nickname:  document.getElementById("nickname").value.trim()  || null,
      birthDate: document.getElementById("birthDate").value        || null,
      deathDate: document.getElementById("deathDate").value        || null,
      fatherId:  document.getElementById("fatherId").value         || null,
      motherId:  document.getElementById("motherId").value         || null,
      spouseId:  document.getElementById("spouseId").value         || null,
      notes:     document.getElementById("notes").value.trim()     || null,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (photoURL) data.photoURL = photoURL;

    if (personId) {
      await db.collection("persons").doc(personId).update(data);
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection("persons").add(data);
    }

    window.location.href = "dashboard.html";

  } catch (err) {
    console.error("Erreur sauvegarde:", err);
    alert("Erreur : " + err.message);
    submitBtn.disabled = false;
    submitBtn.textContent = "Enregistrer";
  }
});

// Suppression
document.getElementById("deleteBtn").addEventListener("click", async function() {
  if (!isAdmin) { alert("⛔ Accès refusé."); return; }
  if (!confirm("Supprimer cette personne ? Cette action est irréversible.")) return;
  try {
    await db.collection("persons").doc(personId).delete();
    window.location.href = "dashboard.html";
  } catch (err) {
    alert("Erreur suppression : " + err.message);
  }
});
