// gallery.js — Trombinoscope Famille Gonzalez

function v(x) { return x && typeof x === "string" && x.trim() ? x : null; }

function computeAge(bd) {
  const t = new Date(), b = new Date(bd);
  let a = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
  return a;
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
      const photoURL = v(x.photoURL);
      if (!photoURL) return; // Ignorer sans photo

      persons.push({
        id: d.id,
        firstName: x.firstName || "",
        lastName: x.lastName || "",
        fullName: ((x.firstName || "") + " " + (x.lastName || "")).trim(),
        birthDate: v(x.birthDate),
        deathDate: v(x.deathDate),
        photoURL
      });
    });

    // Tri alphabétique
    persons.sort((a, b) => a.fullName.localeCompare(b.fullName, "fr"));

    document.getElementById("loadingMsg").style.display = "none";
    document.getElementById("trombiGrid").style.display = "grid";

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
  const t = window.i18n ? window.i18n[lang] : {
    born: "Né(e) en", died: "† ", noPhoto: "Aucune photo.", age: "ans"
  };

  // Compteur
  const countBadge = document.getElementById("countBadge");
  const countNum   = document.getElementById("countNum");
  countBadge.style.display = "inline-flex";
  countNum.textContent = persons.length;

  if (persons.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📷</div>
        <p>${t.noPhoto}</p>
      </div>`;
    return;
  }

  let html = "";
  persons.forEach((p, idx) => {
    const isDeceased = !!p.deathDate;

    // Info ligne sous le nom
    let detail = "";
    if (p.birthDate && !p.deathDate) {
      detail = computeAge(p.birthDate) + " " + t.age;
    } else if (p.birthDate && p.deathDate) {
      const by = p.birthDate.split("-")[0];
      const dy = p.deathDate.split("-")[0];
      detail = by + " – " + dy;
    } else if (p.birthDate) {
      detail = t.born + " " + p.birthDate.split("-")[0];
    }

    const deceasedBadge = isDeceased
      ? `<div class="deceased-badge">✝</div>` : "";

    const nameClass = isDeceased ? "card-name deceased" : "card-name";

    html += `
      <a href="person.html?id=${p.id}" class="person-card" style="animation-delay:${idx * 30}ms">
        <div class="card-photo" style="background-image:url('${p.photoURL}')">
          ${deceasedBadge}
        </div>
        <div class="card-info">
          <div class="${nameClass}">${p.fullName}</div>
          ${detail ? `<div class="card-detail">${detail}</div>` : ""}
        </div>
      </a>`;
  });

  grid.innerHTML = html;
}
