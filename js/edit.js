// edit.js — Gestion des conjoints multiples (remariages, veufs)

const CLOUDINARY_CLOUD  = "dekk2a3i0";
const CLOUDINARY_PRESET = "gonzalez_family";
const CLOUDINARY_URL    = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`;

const urlParams = new URLSearchParams(window.location.search);
const personId  = urlParams.get("id");

let photoFile   = null;
let isAdmin     = false;
let allPersons  = [];
let spouseRows  = []; // [{spouseId, marriageDate, divorceDate, endReason}]

// ── Admin check ───────────────────────────────────────────
async function checkAdmin(email) {
  try {
    const doc = await db.collection("authorizedUsers").doc(email).get();
    return doc.exists && doc.data().role === "admin";
  } catch(e) { return false; }
}

firebase.auth().onAuthStateChanged(async user => {
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

// ── Charge toutes les personnes (selects + conjoints) ─────
async function loadAllPersons() {
  const snap = await db.collection("persons").get();
  allPersons = [];
  snap.forEach(d => {
    if (d.id === personId) return;
    const x = d.data();
    allPersons.push({ id: d.id, fullName: ((x.firstName||"")+" "+(x.lastName||"")).trim() });
  });
  allPersons.sort((a, b) => a.fullName.localeCompare(b.fullName, "fr"));

  // Remplir père/mère
  ["fatherId","motherId"].forEach(selectId => {
    const sel = document.getElementById(selectId);
    while (sel.options.length > 1) sel.remove(1);
    allPersons.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id; opt.textContent = p.fullName;
      sel.appendChild(opt);
    });
  });

  // Auto-remplissage conjoint
  ["fatherId","motherId"].forEach(field => {
    document.getElementById(field).addEventListener("change", autoFillSpouse);
  });

  // Bouton ajouter conjoint
  document.getElementById("btnAddSpouse").addEventListener("click", () => {
    spouseRows.push({ spouseId:"", marriageDate:"", divorceDate:"", endReason:"" });
    renderSpouseRows();
  });

  // Exposer pour les traductions
  window.refreshSpouseRows = renderSpouseRows;
}

// ── Charge une personne existante ─────────────────────────
async function loadPerson(id) {
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

  // Conjoints : priorité à spouses[], fallback spouseId
  if (p.spouses && p.spouses.length > 0) {
    spouseRows = p.spouses.map(s => ({
      spouseId:     s.spouseId     || "",
      marriageDate: s.marriageDate || "",
      divorceDate:  s.divorceDate  || "",
      endReason:    s.endReason    || ""
    }));
  } else if (p.spouseId) {
    spouseRows = [{ spouseId: p.spouseId, marriageDate:"", divorceDate:"", endReason:"" }];
  }
  renderSpouseRows();

  if (p.photoURL) {
    const prev = document.getElementById("avatarPreview");
    prev.style.backgroundImage = `url('${p.photoURL}')`;
    prev.style.backgroundSize = "cover";
    prev.style.backgroundPosition = "center";
    prev.textContent = "";
  }
}

// ── Rendu des lignes conjoint ──────────────────────────────
function renderSpouseRows() {
  const t   = window.i18n ? window.i18n[window.currentLang||"fr"] : {};
  const list = document.getElementById("spouseList");
  list.innerHTML = "";

  spouseRows.forEach((row, idx) => {
    const div = document.createElement("div");
    div.className = "spouse-row";
    div.innerHTML = `
      <div class="spouse-row-header">
        <span class="spouse-row-title">${t.spouseLabel||"Conjoint(e)"} ${idx+1}</span>
        <button type="button" class="btn-remove-spouse" data-idx="${idx}">×</button>
      </div>
      <div class="form-group">
        <label>${t.spouseLabel||"Conjoint(e)"}</label>
        <select class="sp-id" data-idx="${idx}">
          <option value="">${t.selectPerson||"— Sélectionner —"}</option>
          ${allPersons.map(p => `<option value="${p.id}" ${row.spouseId===p.id?"selected":""}>${p.fullName}</option>`).join("")}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>${t.marriageDate||"Date de mariage"}</label>
          <input type="date" class="sp-marriage" data-idx="${idx}" value="${row.marriageDate||""}">
        </div>
        <div class="form-group">
          <label>${t.divorceDate||"Date de fin"}</label>
          <input type="date" class="sp-divorce" data-idx="${idx}" value="${row.divorceDate||""}">
        </div>
      </div>
      <div class="form-group">
        <label>${t.endReason||"Motif de fin"}</label>
        <select class="sp-reason" data-idx="${idx}">
          <option value=""  ${!row.endReason?"selected":""}>${t.endReasonNone||"Toujours ensemble"}</option>
          <option value="death"   ${row.endReason==="death"?"selected":""}>${t.endReasonDeath||"Veuf/Veuve"}</option>
          <option value="divorce" ${row.endReason==="divorce"?"selected":""}>${t.endReasonDivorce||"Divorce/Séparation"}</option>
        </select>
      </div>`;
    list.appendChild(div);

    // Events
    div.querySelector(".btn-remove-spouse").addEventListener("click", e => {
      spouseRows.splice(parseInt(e.target.dataset.idx), 1);
      renderSpouseRows();
    });
    div.querySelector(".sp-id").addEventListener("change", e => {
      spouseRows[parseInt(e.target.dataset.idx)].spouseId = e.target.value;
    });
    div.querySelector(".sp-marriage").addEventListener("change", e => {
      spouseRows[parseInt(e.target.dataset.idx)].marriageDate = e.target.value;
    });
    div.querySelector(".sp-divorce").addEventListener("change", e => {
      spouseRows[parseInt(e.target.dataset.idx)].divorceDate = e.target.value;
    });
    div.querySelector(".sp-reason").addEventListener("change", e => {
      spouseRows[parseInt(e.target.dataset.idx)].endReason = e.target.value;
    });
  });
}

// ── Auto-remplissage conjoint depuis père/mère ────────────
function autoFillSpouse() {
  const fatherId = document.getElementById("fatherId").value;
  const motherId = document.getElementById("motherId").value;
  if (fatherId) {
    const father = allPersons.find(p => p.id === fatherId);
    // Si le père a un conjoint connu, pré-remplir mère
    // (géré via spouses[] — simplifié ici)
  }
}

// ── Aperçu photo ──────────────────────────────────────────
document.getElementById("photoInput").addEventListener("change", function(e) {
  const file = e.target.files[0];
  if (!file || !file.type.startsWith("image/")) return;
  if (file.size > 5*1024*1024) { alert("Max 5 Mo"); return; }
  photoFile = file;
  const reader = new FileReader();
  reader.onload = ev => {
    const prev = document.getElementById("avatarPreview");
    prev.style.backgroundImage = `url('${ev.target.result}')`;
    prev.style.backgroundSize = "cover";
    prev.style.backgroundPosition = "center";
    prev.textContent = "";
  };
  reader.readAsDataURL(file);
});

// ── Upload Cloudinary ─────────────────────────────────────
async function uploadPhoto(file) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", CLOUDINARY_PRESET);
  fd.append("folder", "gonzalez_family");
  const res = await fetch(CLOUDINARY_URL, { method:"POST", body:fd });
  if (!res.ok) throw new Error("Erreur upload photo");
  const data = await res.json();
  return data.secure_url;
}

// ── Sync conjoints (mise à jour réciproque) ───────────────
async function syncSpouses(myId, oldSpouses, newSpouses) {
  const oldIds = (oldSpouses||[]).map(s=>s.spouseId).filter(Boolean);
  const newIds = newSpouses.map(s=>s.spouseId).filter(Boolean);

  // Anciens conjoints retirés → nettoyer leur fiche
  for (const sid of oldIds) {
    if (!newIds.includes(sid)) {
      try {
        const sdoc = await db.collection("persons").doc(sid).get();
        if (sdoc.exists) {
          const sd = sdoc.data();
          const updatedSpouses = (sd.spouses||[]).filter(s => s.spouseId !== myId);
          await db.collection("persons").doc(sid).update({
            spouses: updatedSpouses,
            spouseId: updatedSpouses.length>0 ? updatedSpouses[0].spouseId : null
          });
        }
      } catch(e) { console.error("syncSpouses remove:", e); }
    }
  }

  // Nouveaux conjoints → ajouter le lien réciproque
  for (const sp of newSpouses) {
    if (!sp.spouseId) continue;
    try {
      const sdoc = await db.collection("persons").doc(sp.spouseId).get();
      if (!sdoc.exists) continue;
      const sd = sdoc.data();
      const existingSpouses = sd.spouses || (sd.spouseId ? [{ spouseId: sd.spouseId }] : []);
      const alreadyLinked = existingSpouses.some(s => s.spouseId === myId);
      if (!alreadyLinked) {
        existingSpouses.push({
          spouseId:     myId,
          marriageDate: sp.marriageDate || null,
          divorceDate:  sp.divorceDate  || null,
          endReason:    sp.endReason    || null
        });
        await db.collection("persons").doc(sp.spouseId).update({
          spouses:  existingSpouses,
          spouseId: existingSpouses[0].spouseId
        });
      }
    } catch(e) { console.error("syncSpouses add:", e); }
  }
}

// ── Soumission ────────────────────────────────────────────
document.getElementById("personForm").addEventListener("submit", async function(e) {
  e.preventDefault();
  if (!isAdmin) { alert("⛔ Accès refusé."); return; }

  const btn = document.getElementById("submitBtn");
  btn.disabled = true; btn.textContent = "⏳";

  try {
    let photoURL = null;
    if (photoFile) { btn.textContent = "📤"; photoURL = await uploadPhoto(photoFile); }

    // Nettoyer les lignes conjoint vides
    const cleanSpouses = spouseRows
      .filter(s => s.spouseId)
      .map(s => ({
        spouseId:     s.spouseId,
        marriageDate: s.marriageDate || null,
        divorceDate:  s.divorceDate  || null,
        endReason:    s.endReason    || null
      }));

    const data = {
      firstName: document.getElementById("firstName").value.trim(),
      lastName:  document.getElementById("lastName").value.trim(),
      nickname:  document.getElementById("nickname").value.trim() || null,
      birthDate: document.getElementById("birthDate").value || null,
      deathDate: document.getElementById("deathDate").value || null,
      fatherId:  document.getElementById("fatherId").value  || null,
      motherId:  document.getElementById("motherId").value  || null,
      spouses:   cleanSpouses,
      // Garder spouseId = premier conjoint actif (compatibilité arbre)
      spouseId:  cleanSpouses.length > 0 ? cleanSpouses.find(s=>!s.endReason)?.spouseId || cleanSpouses[0].spouseId : null,
      notes:     document.getElementById("notes").value.trim() || null,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (photoURL) data.photoURL = photoURL;

    let currentId = personId;
    if (personId) {
      const oldDoc = await db.collection("persons").doc(personId).get();
      const oldSpouses = oldDoc.exists ? (oldDoc.data().spouses || []) : [];
      await db.collection("persons").doc(personId).update(data);
      await syncSpouses(personId, oldSpouses, cleanSpouses);
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      const ref = await db.collection("persons").add(data);
      currentId = ref.id;
      await syncSpouses(currentId, [], cleanSpouses);
    }

    window.location.href = "dashboard.html";
  } catch(err) {
    console.error(err);
    alert("Erreur : " + err.message);
    btn.disabled = false; btn.textContent = "Enregistrer";
  }
});

// ── Suppression ───────────────────────────────────────────
document.getElementById("deleteBtn").addEventListener("click", async () => {
  if (!isAdmin) { alert("⛔ Accès refusé."); return; }
  if (!confirm("Supprimer cette personne ? Action irréversible.")) return;
  try {
    const doc = await db.collection("persons").doc(personId).get();
    if (doc.exists) {
      const spouses = doc.data().spouses || [];
      await syncSpouses(personId, spouses, []);
    }
    await db.collection("persons").doc(personId).delete();
    window.location.href = "dashboard.html";
  } catch(err) { alert("Erreur : " + err.message); }
});
