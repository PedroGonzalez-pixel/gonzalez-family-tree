// Email administrateur — seul cet email peut ajouter/modifier
const ADMIN_EMAIL = "TON_EMAIL@gmail.com"; // ← Remplace par ton email

const urlParams = new URLSearchParams(window.location.search);
const personId = urlParams.get("id"); // null = nouveau, sinon = modification

let photoFile = null;
let allPersons = [];

// Chargement initial
firebase.auth().onAuthStateChanged(async function(user) {
  if (!user) return;

  // Charge toutes les personnes pour les selects
  await loadAllPersons();

  // Si modification, charge les données existantes
  if (personId) {
    document.getElementById("pageTitle").textContent = "Modifier une personne";
    document.getElementById("deleteBtn").style.display = "inline-block";
    await loadPerson(personId);
  }
});

// Charge toutes les personnes dans les selects
async function loadAllPersons() {
  const snapshot = await db.collection("persons").orderBy("lastName").get();
  allPersons = [];
  snapshot.forEach(doc => {
    allPersons.push({ id: doc.id, ...doc.data() });
  });

  const selects = ["fatherId", "motherId", "spouseId"];
  selects.forEach(selectId => {
    const select = document.getElementById(selectId);
    allPersons.forEach(p => {
      if (p.id === personId) return; // Exclure soi-même
      const option = document.createElement("option");
      option.value = p.id;
      option.textContent = p.firstName + " " + p.lastName;
      select.appendChild(option);
    });
  });
}

// Charge une personne existante dans le formulaire
async function loadPerson(id) {
  const doc = await db.collection("persons").doc(id).get();
  if (!doc.exists) return;
  const p = doc.data();

  document.getElementById("firstName").value = p.firstName || "";
  document.getElementById("lastName").value = p.lastName || "";
  document.getElementById("birthDate").value = p.birthDate || "";
  document.getElementById("deathDate").value = p.deathDate || "";
  document.getElementById("notes").value = p.notes || "";

  if (p.fatherId) document.getElementById("fatherId").value = p.fatherId;
  if (p.motherId) document.getElementById("motherId").value = p.motherId;
  if (p.spouseId) document.getElementById("spouseId").value = p.spouseId;

  if (p.photoURL) {
    const preview = document.getElementById("avatarPreview");
    preview.style.backgroundImage = "url(" + p.photoURL + ")";
    preview.textContent = "";
  }
}

// Aperçu photo
document.getElementById("photoInput").addEventListener("change", function(e) {
  photoFile = e.target.files[0];
  if (!photoFile) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    const preview = document.getElementById("avatarPreview");
    preview.style.backgroundImage = "url(" + ev.target.result + ")";
    preview.textContent = "";
  };
  reader.readAsDataURL(photoFile);
});

// Soumission du formulaire
document.getElementById("personForm").addEventListener("submit", async function(e) {
  e.preventDefault();

  const user = firebase.auth().currentUser;
  if (!user || user.email !== ADMIN_EMAIL) {
    alert("⛔ Seul l'administrateur peut modifier les données.");
    return;
  }

  const submitBtn = document.getElementById("submitBtn");
  submitBtn.textContent = "Enregistrement...";
  submitBtn.disabled = true;

  try {
    let photoURL = null;

    // Upload photo si sélectionnée
    if (photoFile) {
      const fileName = Date.now() + "_" + photoFile.name;
      const ref = storage.ref("photos/" + fileName);
      await ref.put(photoFile);
      photoURL = await ref.getDownloadURL();
    }

    const data = {
      firstName: document.getElementById("firstName").value.trim(),
      lastName: document.getElementById("lastName").value.trim(),
      birthDate: document.getElementById("birthDate").value || null,
      deathDate: document.getElementById("deathDate").value || null,
      fatherId: document.getElementById("fatherId").value || null,
      motherId: document.getElementById("motherId").value || null,
      spouseId: document.getElementById("spouseId").value || null,
      notes: document.getElementById("notes").value.trim() || null,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (photoURL) data.photoURL = photoURL;

    if (personId) {
      // Modification
      await db.collection("persons").doc(personId).update(data);
    } else {
      // Création
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection("persons").add(data);
    }

    window.location.href = "dashboard.html";

  } catch (err) {
    alert("Erreur : " + err.message);
    submitBtn.textContent = "Enregistrer";
    submitBtn.disabled = false;
  }
});

// Suppression
document.getElementById("deleteBtn").addEventListener("click", async function() {
  const user = firebase.auth().currentUser;
  if (!user || user.email !== ADMIN_EMAIL) {
    alert("⛔ Seul l'administrateur peut supprimer.");
    return;
  }

  if (!confirm("Supprimer cette personne ? Cette action est irréversible.")) return;

  try {
    await db.collection("persons").doc(personId).delete();
    window.location.href = "dashboard.html";
  } catch (err) {
    alert("Erreur suppression : " + err.message);
  }
});
