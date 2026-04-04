// ============================================================
// ARBRE GÉNÉALOGIQUE avec D3.js
// - Construit un arbre hiérarchique depuis les racines
// - Conjoints placés côte à côte avec un lien pointillé
// - Enfants reliés à leurs vrais parents
// - Zoom + pan natif D3
// ============================================================

const NW = 156;  // node width
const NH = 80;   // node height
const HPAD = 24; // padding horizontal entre nœuds
const VPAD = 90; // padding vertical entre générations

firebase.auth().onAuthStateChanged(async function(user) {
  if (!user) return;
  await buildTree();
});

async function buildTree() {
  try {
    const snap = await db.collection("persons").get();
    if (snap.empty) {
      document.getElementById("loadingMsg").textContent = "Aucune personne enregistrée.";
      return;
    }

    const persons = {};
    snap.forEach(d => { persons[d.id] = { id: d.id, ...d.data() }; });

    document.getElementById("loadingMsg").style.display = "none";
    drawTree(persons);

  } catch (e) {
    document.getElementById("loadingMsg").textContent = "Erreur : " + e.message;
  }
}

function drawTree(persons) {
  // ── 1. Construire la hiérarchie D3 ───────────────────────
  // Trouver les racines (pas de parents dans persons)
  const ids = Object.keys(persons);

  // Construire les nœuds avec parentId pour D3
  // Pour D3 hierarchy, chaque nœud a besoin d'un seul parent
  // On va construire un arbre depuis une racine virtuelle
  // et utiliser le premier parent connu comme parent D3

  const nodes = [];
  const spouseLinks = [];
  const spousePairs = new Set();

  // Calculer les vrais niveaux
  const level = {};

  // Racines = sans parents connus dans persons
  ids.forEach(id => {
    const p = persons[id];
    const hasFather = p.fatherId && persons[p.fatherId];
    const hasMother = p.motherId && persons[p.motherId];
    if (!hasFather && !hasMother) level[id] = 0;
  });

  // Propager
  for (let i = 0; i < 20; i++) {
    ids.forEach(id => {
      if (level[id] !== undefined) return;
      const p = persons[id];
      const fLv = p.fatherId && persons[p.fatherId] ? level[p.fatherId] : undefined;
      const mLv = p.motherId && persons[p.motherId] ? level[p.motherId] : undefined;
      if (fLv !== undefined && mLv !== undefined) level[id] = Math.max(fLv, mLv) + 1;
      else if (fLv !== undefined) level[id] = fLv + 1;
      else if (mLv !== undefined) level[id] = mLv + 1;
    });
  }

  // Conjoints sans parents → même niveau que conjoint
  for (let i = 0; i < 10; i++) {
    ids.forEach(id => {
      if (level[id] !== undefined) return;
      const p = persons[id];
      if (p.spouseId && persons[p.spouseId] && level[p.spouseId] !== undefined) {
        level[id] = level[p.spouseId];
      }
    });
  }

  // Forcer conjoints même niveau
  for (let i = 0; i < 10; i++) {
    ids.forEach(id => {
      const p = persons[id];
      if (!p.spouseId || !persons[p.spouseId]) return;
      const sp = p.spouseId;
      if (level[id] !== undefined && level[sp] !== undefined && level[id] !== level[sp]) {
        const m = Math.max(level[id], level[sp]);
        level[id] = m; level[sp] = m;
      }
    });
  }

  ids.forEach(id => { if (level[id] === undefined) level[id] = 0; });

  // ── 2. Grouper par niveau et calculer positions X ─────────
  const byLevel = {};
  ids.forEach(id => {
    const lv = level[id];
    if (!byLevel[lv]) byLevel[lv] = [];
    byLevel[lv].push(id);
  });

  // Identifier les couples pour les placer côte à côte
  const spouseOf = {};
  ids.forEach(id => {
    const p = persons[id];
    if (p.spouseId && persons[p.spouseId]) spouseOf[id] = p.spouseId;
  });

  const pos = {};

  Object.keys(byLevel).sort((a, b) => +a - +b).forEach(lv => {
    const lvIds = byLevel[lv];
    const used  = new Set();
    const orderedSlots = []; // chaque slot = [id] ou [id, spouseId]

    lvIds.forEach(id => {
      if (used.has(id)) return;
      const sp = spouseOf[id];
      if (sp && lvIds.includes(sp) && !used.has(sp)) {
        orderedSlots.push([id, sp]);
        used.add(id); used.add(sp);
        // Enregistrer le lien conjoint
        const key = [id, sp].sort().join("~");
        if (!spousePairs.has(key)) {
          spousePairs.add(key);
          spouseLinks.push({ source: id, target: sp });
        }
      } else {
        orderedSlots.push([id]);
        used.add(id);
      }
    });

    // Calculer la largeur totale du niveau
    let totalW = 0;
    orderedSlots.forEach(slot => {
      totalW += slot.length * NW + (slot.length - 1) * 8;
    });
    totalW += (orderedSlots.length - 1) * HPAD;

    let x = -totalW / 2;
    const y = +lv * (NH + VPAD);

    orderedSlots.forEach(slot => {
      if (slot.length === 2) {
        pos[slot[0]] = { x, y };
        pos[slot[1]] = { x: x + NW + 8, y };
        x += NW + 8 + NW + HPAD;
      } else {
        pos[slot[0]] = { x, y };
        x += NW + HPAD;
      }
    });
  });

  // ── 3. Calculer les liens parent → enfant ─────────────────
  // Regrouper les enfants par famille (fatherId|motherId exact)
  const families = {};
  ids.forEach(id => {
    const p = persons[id];
    const fid = p.fatherId && persons[p.fatherId] ? p.fatherId : null;
    const mid = p.motherId && persons[p.motherId] ? p.motherId : null;
    if (!fid && !mid) return;
    const key = (fid || "X") + "|" + (mid || "X");
    if (!families[key]) families[key] = { fatherId: fid, motherId: mid, children: [] };
    families[key].children.push(id);
  });

  // ── 4. SVG avec D3 zoom/pan ───────────────────────────────
  const wrapper = document.getElementById("tree-wrapper");
  const W = wrapper.clientWidth;
  const H = wrapper.clientHeight;

  const svg = d3.select("#tree-wrapper")
    .append("svg")
    .attr("id", "tree-svg")
    .attr("width", W)
    .attr("height", H);

  const g = svg.append("g")
    .attr("transform", `translate(${W / 2}, 40)`);

  // Zoom + pan
  const zoom = d3.zoom()
    .scaleExtent([0.3, 2])
    .on("zoom", (event) => { g.attr("transform", event.transform); });

  svg.call(zoom);
  svg.call(zoom.transform, d3.zoomIdentity.translate(W / 2, 40));

  // ── 5. Dessiner les liens conjoints ───────────────────────
  spouseLinks.forEach(link => {
    const pa = pos[link.source];
    const pb = pos[link.target];
    if (!pa || !pb) return;
    const left  = pa.x < pb.x ? pa : pb;
    const right = pa.x < pb.x ? pb : pa;
    g.append("line")
      .attr("class", "link-spouse")
      .attr("x1", left.x + NW)
      .attr("y1", left.y + NH / 2)
      .attr("x2", right.x)
      .attr("y2", right.y + NH / 2);
  });

  // ── 6. Dessiner les liens parent → enfant ─────────────────
  Object.values(families).forEach(fam => {
    const { fatherId, motherId, children } = fam;
    let originX, originY;

    if (fatherId && motherId) {
      const pf = pos[fatherId], pm = pos[motherId];
      if (!pf || !pm) return;
      const left = pf.x < pm.x ? pf : pm;
      originX = left.x + NW + 4; // milieu du gap entre conjoints
      originY = left.y + NH / 2;
    } else {
      const pid = fatherId || motherId;
      const pp  = pos[pid];
      if (!pp) return;
      originX = pp.x + NW / 2;
      originY = pp.y + NH;
    }

    const childPositions = children.map(cid => pos[cid]).filter(Boolean);
    if (childPositions.length === 0) return;

    const childY = childPositions[0].y;
    const midY   = originY + (childY - originY) * 0.5;

    // Ligne verticale depuis l'origine
    g.append("line").attr("class", "link")
      .attr("x1", originX).attr("y1", originY)
      .attr("x2", originX).attr("y2", midY);

    const xs   = childPositions.map(p => p.x + NW / 2);
    const minX = Math.min(...xs, originX);
    const maxX = Math.max(...xs, originX);

    // Barre horizontale
    g.append("line").attr("class", "link")
      .attr("x1", minX).attr("y1", midY)
      .attr("x2", maxX).attr("y2", midY);

    // Descente vers chaque enfant
    childPositions.forEach(cp => {
      const cx = cp.x + NW / 2;
      g.append("line").attr("class", "link")
        .attr("x1", cx).attr("y1", midY)
        .attr("x2", cx).attr("y2", cp.y);
    });
  });

  // ── 7. Dessiner les nœuds ─────────────────────────────────
  ids.forEach(id => {
    const p  = persons[id];
    const pt = pos[id];
    if (!pt) return;

    const grp = g.append("g")
      .attr("class", "node-group")
      .attr("transform", `translate(${pt.x}, ${pt.y})`)
      .on("click", () => { window.location.href = "person.html?id=" + id; });

    // Rectangle
    grp.append("rect")
      .attr("class", "node-rect" + (p.deathDate ? " deceased" : ""))
      .attr("width", NW)
      .attr("height", NH)
      .attr("rx", 12);

    // Ombre légère au survol via CSS géré dans .node-group:hover

    // Contenu texte
    const nameLines = splitName(p.firstName + " " + p.lastName, 18);
    let textY = nameLines.length > 1 ? 22 : 28;

    // Si photo
    if (p.photoURL) {
      // Clip circle pour la photo
      const clipId = "clip-" + id;
      grp.append("defs").append("clipPath").attr("id", clipId)
        .append("circle").attr("cx", NW / 2).attr("cy", 20).attr("r", 14);
      grp.append("image")
        .attr("href", p.photoURL)
        .attr("x", NW / 2 - 14).attr("y", 6)
        .attr("width", 28).attr("height", 28)
        .attr("clip-path", `url(#${clipId})`);
      textY = 44;
    }

    nameLines.forEach((line, i) => {
      grp.append("text")
        .attr("class", "node-name")
        .attr("x", NW / 2)
        .attr("y", textY + i * 16)
        .attr("text-anchor", "middle")
        .text(line);
    });

    let infoY = textY + nameLines.length * 16 + 2;

    if (p.nickname) {
      grp.append("text")
        .attr("class", "node-nick")
        .attr("x", NW / 2).attr("y", infoY)
        .attr("text-anchor", "middle")
        .text('"' + p.nickname + '"');
      infoY += 14;
    }

    if (p.birthDate) {
      const info = p.deathDate
        ? p.birthDate.split("-")[0] + " – " + p.deathDate.split("-")[0]
        : computeAge(p.birthDate) + " ans";
      grp.append("text")
        .attr("class", "node-dates")
        .attr("x", NW / 2).attr("y", infoY)
        .attr("text-anchor", "middle")
        .text(info);
    }
  });
}

function splitName(name, maxLen) {
  if (name.length <= maxLen) return [name];
  const parts = name.split(" ");
  const mid   = Math.ceil(parts.length / 2);
  return [parts.slice(0, mid).join(" "), parts.slice(mid).join(" ")];
}

function computeAge(birthDate) {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() ||
     (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return age;
}
