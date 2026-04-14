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

// Couleurs d'avatar par initiale
function avatarColor(initials) {
  const colors = [
    "#a8c5e8","#a8e0c5","#e8c5a8","#c5a8e8",
    "#e8a8c5","#c5e8a8","#e8e0a8","#a8d0e8"
  ];
  const code = (initials.charCodeAt(0) || 0) + (initials.charCodeAt(1) || 0);
  return colors[code % colors.length];
}

firebase.auth().onAuthStateChanged(async user => {
  if (!user) return;
  try {
    const snap = await db.collection("persons").get();
    if (snap.empty) {
      document.getElementById("loadingMsg").textContent = "Aucune personne.";
      return;
    }

    const persons = [];
    snap.forEach(d => {
      const x = d.data();
      const bd = v(x.birthDate);
      persons.push({
        id:        d.id,
        firstName: x.firstName || "",
        lastName:  x.lastName  || "",
        nickname:  v(x.nickname),
        fullName:  ((x.firstName || "") + " " + (x.lastName || "")).trim(),
        birthDate: bd,
        deathDate: v(x.deathDate),
        photoURL:  v(x.photoURL),
        birthYear: bd ? parseInt(bd.split("-")[0]) : null
      });
    });

    // Tri alphabétique
    persons.sort((a, b) => a.fullName.localeCompare(b.fullName, "fr"));

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

function renderGallery(persons) {
  const grid = document.getElementById("trombiGrid");
  const lang = window.currentLang || "fr";
  const t    = (window.i18n && window.i18n[lang]) || { age:"ans", noResults:"Aucun résultat." };

  // Compteur
  document.getElementById("countNum").textContent = persons.length;

  if (persons.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <p>${t.noResults}</p>
      </div>`;
    return;
  }

  let html = "";
  persons.forEach((p, idx) => {
    const isDeceased = !!p.deathDate;
    const initials   = getInitials(p.firstName, p.lastName);
    const color      = avatarColor(initials);

    // Photo ou avatar
    let photoHTML;
    if (p.photoURL) {
      photoHTML = `<div class="card-photo" style="background-image:url('${p.photoURL}')">
        ${isDeceased ? '<div class="deceased-badge">✝</div>' : ''}
      </div>`;
    } else {
      photoHTML = `<div class="card-photo no-photo" style="background: linear-gradient(135deg, ${color}88 0%, ${color} 100%);">
        <span class="avatar-initials">${initials}</span>
        ${isDeceased ? '<div class="deceased-badge">✝</div>' : ''}
      </div>`;
    }

    // Détail : âge ou années
    let detail = "";
    if (p.birthDate && !p.deathDate) {
      detail = computeAge(p.birthDate) + " " + t.age;
    } else if (p.birthDate && p.deathDate) {
      detail = p.birthDate.split("-")[0] + " – " + p.deathDate.split("-")[0];
    }

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
