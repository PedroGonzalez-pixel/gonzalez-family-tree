// Test simple : affiche les personnes en tableau pour valider les données
// avant de dessiner l'arbre

function v(val) {
  return val && typeof val === "string" && val.trim() ? val : null;
}

firebase.auth().onAuthStateChanged(async function(user) {
  if (!user) return;
  try {
    const snap = await db.collection("persons").get();
    if (snap.empty) {
      document.getElementById("loadingMsg").textContent = "Aucune personne.";
      return;
    }

    const P = {};
    snap.forEach(d => {
      const x = d.data();
      P[d.id] = {
        id: d.id,
        name: (x.firstName||"") + " " + (x.lastName||""),
        fatherId: v(x.fatherId),
        motherId: v(x.motherId),
        spouseId: v(x.spouseId),
        birthDate: v(x.birthDate),
        deathDate: v(x.deathDate)
      };
    });

    // Résoudre les noms
    function name(id) { return id && P[id] ? P[id].name : "—"; }

    // Calculer génération
    const gen = {};
    const ids = Object.keys(P);

    ids.forEach(id => {
      if (!P[id].fatherId && !P[id].motherId) gen[id] = 0;
    });
    for (let i = 0; i < 20; i++) {
      ids.forEach(id => {
        if (gen[id] !== undefined) return;
        const fg = P[id].fatherId && P[P[id].fatherId] ? gen[P[id].fatherId] : undefined;
        const mg = P[id].motherId && P[P[id].motherId] ? gen[P[id].motherId] : undefined;
        if (fg !== undefined && mg !== undefined) gen[id] = Math.max(fg,mg)+1;
        else if (fg !== undefined) gen[id] = fg+1;
        else if (mg !== undefined) gen[id] = mg+1;
      });
    }
    // Conjoints sans parents
    for (let i = 0; i < 10; i++) {
      ids.forEach(id => {
        if (gen[id] !== undefined) return;
        const sp = P[id].spouseId;
        if (sp && P[sp] && gen[sp] !== undefined) gen[id] = gen[sp];
      });
    }
    ids.forEach(id => { if (gen[id] === undefined) gen[id] = 0; });

    // Afficher tableau de validation
    const wrapper = document.getElementById("tree-container");
    wrapper.style.display = "block";
    document.getElementById("loadingMsg").style.display = "none";

    let html = `<div style="padding:32px;font-family:'DM Sans',sans-serif;">
      <h2 style="font-family:'Playfair Display',serif;font-size:22px;margin-bottom:24px;">Validation des données</h2>
      <table style="border-collapse:collapse;width:100%;font-size:13px;">
        <thead>
          <tr style="background:#f0f0f5;">
            <th style="padding:10px 16px;text-align:left;border-bottom:1px solid #e0e0e5;">Génération</th>
            <th style="padding:10px 16px;text-align:left;border-bottom:1px solid #e0e0e5;">Nom</th>
            <th style="padding:10px 16px;text-align:left;border-bottom:1px solid #e0e0e5;">Père</th>
            <th style="padding:10px 16px;text-align:left;border-bottom:1px solid #e0e0e5;">Mère</th>
            <th style="padding:10px 16px;text-align:left;border-bottom:1px solid #e0e0e5;">Conjoint(e)</th>
          </tr>
        </thead>
        <tbody>`;

    ids.sort((a,b) => gen[a] - gen[b]).forEach(id => {
      const p = P[id];
      html += `<tr style="border-bottom:1px solid #f0f0f5;">
        <td style="padding:10px 16px;color:#6e6e73;font-weight:500;">Gen ${gen[id]}</td>
        <td style="padding:10px 16px;font-weight:500;">${p.name}</td>
        <td style="padding:10px 16px;color:#6e6e73;">${name(p.fatherId)}</td>
        <td style="padding:10px 16px;color:#6e6e73;">${name(p.motherId)}</td>
        <td style="padding:10px 16px;color:#6e6e73;">${name(p.spouseId)}</td>
      </tr>`;
    });

    html += `</tbody></table>
      <p style="margin-top:24px;color:#6e6e73;font-size:13px;">
        ✅ Si les générations et relations ci-dessus sont correctes, l'arbre peut être construit.
      </p>
    </div>`;

    wrapper.innerHTML = html;

  } catch(e) {
    document.getElementById("loadingMsg").textContent = "Erreur : " + e.message;
    console.error(e);
  }
});
