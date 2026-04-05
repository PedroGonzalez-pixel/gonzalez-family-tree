// ============================================================
// ARBRE GÉNÉALOGIQUE avec Balkan FamilyTreeJS
// Format natif : { id, pids (partners), fid, mid, name, ... }
// La bibliothèque gère NATIVEMENT couples + enfants + générations
// ============================================================

function v(val) {
  return val && typeof val === "string" && val.trim() ? val : null;
}

function computeAge(birthDate) {
  const today = new Date(), birth = new Date(birthDate);
  let a = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) a--;
  return a;
}

firebase.auth().onAuthStateChanged(async function(user) {
  if (!user) return;
  try {
    const snap = await db.collection("persons").get();
    if (snap.empty) {
      document.getElementById("loadingMsg").textContent = "Aucune personne enregistrée.";
      return;
    }

    const raw = {};
    snap.forEach(d => {
      const x = d.data();
      raw[d.id] = {
        id:        d.id,
        firstName: x.firstName || "",
        lastName:  x.lastName  || "",
        nickname:  v(x.nickname),
        birthDate: v(x.birthDate),
        deathDate: v(x.deathDate),
        fatherId:  v(x.fatherId),
        motherId:  v(x.motherId),
        spouseId:  v(x.spouseId),
        photoURL:  v(x.photoURL)
      };
    });

    // ── Convertir au format FamilyTreeJS ──────────────────
    // Format attendu :
    // { id, pids: [partnerId], fid: fatherId, mid: motherId, name, ... }

    const nodes = Object.values(raw).map(p => {
      // Info ligne : âge ou années
      let info = "";
      if (p.birthDate) {
        info = p.deathDate
          ? p.birthDate.split("-")[0] + " – " + p.deathDate.split("-")[0]
          : computeAge(p.birthDate) + " ans";
      }

      const node = {
        id:   p.id,
        name: p.firstName + " " + p.lastName,
        info: info,
        nick: p.nickname || "",
        img:  p.photoURL || ""
      };

      // Père et mère
      if (p.fatherId && raw[p.fatherId]) node.fid = p.fatherId;
      if (p.motherId && raw[p.motherId]) node.mid = p.motherId;

      // Conjoint(e)
      if (p.spouseId && raw[p.spouseId]) node.pids = [p.spouseId];

      return node;
    });

    document.getElementById("loadingMsg").style.display = "none";
    document.getElementById("tree-container").style.display = "block";

    // ── Initialiser FamilyTreeJS ──────────────────────────
    const family = new FamilyTree(document.getElementById("tree-container"), {
      mode: "light",
      template: "john",
      enableSearch: false,
      nodeMouseClick: FamilyTree.action.none,
      mouseScrool: FamilyTree.action.zoom,

      // Style Apple
      nodeBinding: {
        field_0: "name",
        field_1: "info",
        field_2: "nick",
        img_0:   "img"
      },

      // Palette de couleurs Apple
      nodeTreeMenu: false,
      zoom: { speed: 20, smooth: 8 },

      nodes: nodes
    });

    // Clic sur un nœud → fiche personne
    family.on("click", function(sender, args) {
      if (args && args.node) {
        window.location.href = "person.html?id=" + args.node.id;
      }
      return false;
    });

  } catch(e) {
    console.error(e);
    document.getElementById("loadingMsg").textContent = "Erreur : " + e.message;
  }
});
