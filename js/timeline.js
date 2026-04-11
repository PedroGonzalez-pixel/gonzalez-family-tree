// timeline.js — Frise Chronologique Famille Gonzalez

function v(x) { return x && typeof x === "string" && x.trim() ? x : null; }

function computeAge(birthDate) {
  const t = new Date(), b = new Date(birthDate);
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
      const p = {
        id: d.id,
        firstName: x.firstName || "",
        lastName: x.lastName || "",
        birthDate: v(x.birthDate),
        deathDate: v(x.deathDate),
      };
      // Ignorer les personnes sans aucune date
      if (p.birthDate || p.deathDate) persons.push(p);
    });

    document.getElementById("loadingMsg").style.display = "none";
    document.getElementById("timeline-container").style.display = "block";

    window._timelineData = persons;
    renderTimeline(persons);

  } catch (e) {
    document.getElementById("loadingMsg").textContent = "Erreur : " + e.message;
    console.error(e);
  }
});

function renderTimeline(persons) {
  const container = document.getElementById("timeline-container");
  const lang = window.currentLang || "fr";
  const t = window.i18n ? window.i18n[lang] : {
    born: "Naissance", died: "Décès", age: "ans", noData: "Aucune donnée."
  };

  if (!persons || persons.length === 0) {
    container.innerHTML = `<div class="empty-state">${t.noData}</div>`;
    return;
  }

  // Construire la liste des événements
  const events = [];

  persons.forEach(p => {
    const fullName = p.firstName + " " + p.lastName;
    const isDeceased = !!p.deathDate;

    // Événement naissance
    if (p.birthDate) {
      const year = parseInt(p.birthDate.split("-")[0]);
      let detail = "";
      if (!isDeceased) {
        detail = computeAge(p.birthDate) + " " + t.age;
      }
      events.push({
        year,
        type: "birth",
        name: fullName,
        detail,
        isDeceased,
        sortKey: p.birthDate
      });
    }

    // Événement décès
    if (p.deathDate) {
      const year = parseInt(p.deathDate.split("-")[0]);
      // Calcul de l'âge au décès
      let ageAtDeath = "";
      if (p.birthDate) {
        const birth = new Date(p.birthDate);
        const death = new Date(p.deathDate);
        let a = death.getFullYear() - birth.getFullYear();
        if (death.getMonth() < birth.getMonth() ||
          (death.getMonth() === birth.getMonth() && death.getDate() < birth.getDate())) a--;
        ageAtDeath = a + " " + t.age;
      }
      events.push({
        year,
        type: "death",
        name: fullName,
        detail: ageAtDeath,
        isDeceased: true,
        sortKey: p.deathDate
      });
    }
  });

  // Trier par date
  events.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  if (events.length === 0) {
    container.innerHTML = `<div class="empty-state">${t.noData}</div>`;
    return;
  }

  // Grouper par année
  const byYear = {};
  events.forEach(e => {
    if (!byYear[e.year]) byYear[e.year] = [];
    byYear[e.year].push(e);
  });

  // Générer le HTML
  let html = '<div class="timeline">';
  let delay = 0;

  Object.keys(byYear).sort((a, b) => +a - +b).forEach(year => {
    html += `
      <div class="year-marker">
        <div class="year-label">
          <div class="year-dot"></div>
          ${year}
        </div>
      </div>`;

    byYear[year].forEach(ev => {
      const icon = ev.type === "birth" ? "🌱" : "✝";
      const iconClass = ev.type === "birth" ? "birth" : "death";
      const nameClass = ev.isDeceased ? "deceased" : "";
      const badgeClass = ev.type === "birth" ? "birth" : "death";
      const badgeText = ev.type === "birth" ? t.born : t.died;
      const crossIcon = ev.isDeceased && ev.type === "birth"
        ? '<span class="cross-icon">✝</span>' : "";

      html += `
        <div class="event-card" style="animation-delay:${delay}ms">
          <div class="event-icon ${iconClass}">${icon}</div>
          <div class="event-content">
            <div class="event-name ${nameClass}">${ev.name}${crossIcon}</div>
            <div class="event-detail">
              <span class="event-type-badge ${badgeClass}">${badgeText}</span>
              ${ev.detail ? `<span>${ev.detail}</span>` : ""}
            </div>
          </div>
        </div>`;
      delay += 40;
    });
  });

  html += '</div>';
  container.innerHTML = html;
}
