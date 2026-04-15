// gallery.js — Trombinoscope Famille Gonzalez

function v(x) { return x && typeof x === "string" && x.trim() ? x : null; }

function computeAge(bd) {
  const t = new Date(), b = new Date(bd);
  let a = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
  return a;
}

function getInitials(firstName, lastName) {
  const f = (firstName || "").trim()[0] || "";
  const l = (lastName  || "").trim()[0] || "";
  return (f + l).toUpperCase();
}

function avatarColor(initials) {
  const colors = ["#a8c5e8","#a8e0c5","#e8c5a8","#c5a8e8","#e8a8c5","#c5e8a8","#e8e0a8","#a8d0e8"];
  const code = (initials.charCodeAt(0)||0) + (initials.charCodeAt(1)||0);
  return colors[code % colors.length];
}

firebase.auth().onAuthStateChanged(async user => {
  if (!user) return;
  try {
    const snap = await db.collection("persons").get();
    if (snap.empty) { document.getElementById("loadingMsg").textContent = "Aucune personne."; return; }

    const persons = [];
    snap.forEach(d => {
      const x = d.data();
      const bd = v(x.birthDate);
      persons.push({
        id:        d.id,
        firstName: x.firstName || "",
        lastName:  x.lastName  || "",
        nickname:  v(x.nickname),
        fullName:  ((x.firstName||"")+" "+(x.lastName||"")).trim(),
        birthDate: bd,
        deathDate: v(x.deathDate),
        photoURL:  v(x.photoURL),
        fatherId:  v(x.fatherId),
        motherId:  v(x.motherId),
        birthYear: bd ? parseInt(bd.split("-")[0]) : null
      });
    });

    persons.sort((a, b) => a.fullName.localeCompare(b.fullName, "fr"));

    // Remplir les selects "fils/fille de" et "frère/sœur de"
    populatePersonSelects(persons);

    document.getElementById("loadingMsg").style.display = "none";
    document.getElementById("trombiGrid").style.display = "grid";
    document.getElementById("countBadge").style.display = "inline-flex";

    window._galleryData = persons;
    renderGallery(persons);

  } catch (e) {
    document.getElementById("loadingMsg").textContent = "Erreur : " + e.message;
    console.error(e);
  }
});

function populatePersonSelects(persons) {
  ["filterChildOf","filterSiblingOf"].forEach(selectId => {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    while (sel.options.length > 1) sel.remove(1);
    persons.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.fullName;
      sel.appendChild(opt);
    });
  });
}

function renderGallery(persons) {
  const grid = document.getElementById("trombiGrid");
  const lang = window.currentLang || "fr";
  const t    = (window.i18n && window.i18n[lang]) || { age:"ans", noResults:"Aucun résultat." };

  document.getElementById("countNum").textContent = persons.length;

  if (persons.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><p>${t.noResults}</p></div>`;
    return;
  }

  let html = "";
  persons.forEach((p, idx) => {
    const isDeceased = !!p.deathDate;
    const initials   = getInitials(p.firstName, p.lastName);
    const color      = avatarColor(initials);

    let photoHTML;
    if (p.photoURL) {
      photoHTML = `<div class="card-photo" style="background-image:url('${p.photoURL}')">
        ${isDeceased ? '<div class="deceased-badge">✝</div>' : ''}
      </div>`;
    } else {
      photoHTML = `<div class="card-photo no-photo" style="background:linear-gradient(135deg,${color}88 0%,${color} 100%);">
        <span class="avatar-initials">${initials}</span>
        ${isDeceased ? '<div class="deceased-badge">✝</div>' : ''}
      </div>`;
    }

    let detail = "";
    if (p.birthDate && !p.deathDate) detail = computeAge(p.birthDate)+" "+t.age;
    else if (p.birthDate && p.deathDate) detail = p.birthDate.split("-")[0]+" – "+p.deathDate.split("-")[0];

    html += `
      <a href="person.html?id=${p.id}" class="person-card" style="animation-delay:${Math.min(idx,20)*25}ms">
        ${photoHTML}
        <div class="card-info">
          <div class="card-name${isDeceased?' deceased':''}">${p.fullName}</div>
          ${detail ? `<div class="card-detail">${detail}</div>` : ""}
        </div>
      </a>`;
  });

  grid.innerHTML = html;
}

// Applique tous les filtres
window.applyFilters = function() {
  if (!window._galleryData) return;
  const persons = window._galleryData;

  const fn      = document.getElementById("filterFirstName").value.toLowerCase().trim();
  const ln      = document.getElementById("filterLastName").value.toLowerCase().trim();
  const bFrom   = document.getElementById("filterBirthFrom").value.trim();
  const bTo     = document.getElementById("filterBirthTo").value.trim();
  const st      = document.getElementById("filterStatus").value;
  const photo   = document.getElementById("filterPhoto").value;
  const childOf = document.getElementById("filterChildOf").value;
  const sibOf   = document.getElementById("filterSiblingOf").value;

  // Pour "frère/sœur de" : trouver les parents de la personne sélectionnée
  let sibParents = null;
  if (sibOf) {
    const ref = persons.find(p => p.id === sibOf);
    if (ref) sibParents = { fid: ref.fatherId, mid: ref.motherId };
  }

  const filtered = persons.filter(p => {
    // Prénom
    if (fn && !p.firstName.toLowerCase().includes(fn)) return false;
    // Nom
    if (ln && !p.lastName.toLowerCase().includes(ln)) return false;

    // Date naissance — EXCLURE ceux sans date si filtre actif
    if (bFrom || bTo) {
      if (!p.birthYear) return false; // ← exclure sans date
      if (bFrom && p.birthYear < parseInt(bFrom)) return false;
      if (bTo   && p.birthYear > parseInt(bTo))   return false;
    }

    // Statut vivant/décédé
    if (st === "living"   &&  p.deathDate) return false;
    if (st === "deceased" && !p.deathDate) return false;

    // Filtre photo
    if (photo === "withPhoto"    && !p.photoURL) return false;
    if (photo === "withoutPhoto" &&  p.photoURL) return false;

    // Fils/fille de
    if (childOf && p.fatherId !== childOf && p.motherId !== childOf) return false;

    // Frère/sœur de : mêmes parents ET pas la personne elle-même
    if (sibOf) {
      if (p.id === sibOf) return false;
      if (!sibParents) return false;
      // Au moins un parent en commun
      const shareFather = sibParents.fid && p.fatherId === sibParents.fid;
      const shareMother = sibParents.mid && p.motherId === sibParents.mid;
      if (!shareFather && !shareMother) return false;
    }

    return true;
  });

  renderGallery(filtered);
};

window.resetFilters = function() {
  ["filterFirstName","filterLastName","filterBirthFrom","filterBirthTo"].forEach(id => {
    document.getElementById(id).value = "";
  });
  ["filterStatus","filterPhoto","filterChildOf","filterSiblingOf"].forEach(id => {
    document.getElementById(id).value = "";
  });
  if (window._galleryData) renderGallery(window._galleryData);
};

window.exportCSV = function() {
  if (!window._galleryData) return;
  const headers = ["Prénom","Nom","Surnom","Naissance","Décès","Photo"];
  const rows = window._galleryData.map(p => [
    p.firstName, p.lastName, p.nickname||"",
    p.birthDate||"", p.deathDate||"", p.photoURL||""
  ]);
  const csv = [headers,...rows]
    .map(row => row.map(c => `"${String(c).replace(/"/g,'""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF"+csv], {type:"text/csv;charset=utf-8;"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href=url; a.download="famille_gonzalez.csv"; a.click();
  URL.revokeObjectURL(url);
};
