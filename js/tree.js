// ============================================================
// ARBRE GÉNÉALOGIQUE avec D3.js
// Fix clé : les champs null de Firestore sont traités correctement
// ============================================================

const NW = 156;
const NH = 80;
const HPAD = 24;
const VPAD = 90;

// Helper : retourne l'ID seulement si c'est une vraie string non vide
function realId(val) {
  return val && typeof val === "string" && val.trim() !== "" ? val : null;
}

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
    snap.forEach(d => {
      const data = d.data();
      persons[d.id] = {
        id:       d.id,
        firstName: data.firstName || "",
        lastName:  data.lastName  || "",
        nickname:  realId(data.nickname),
        birthDate: realId(data.birthDate),
        deathDate: realId(data.deathDate),
        fatherId:  realId(data.fatherId),
        motherId:  realId(data.motherId),
        spouseId:  realId(data.spouseId),
        photoURL:  realId(data.photoURL),
        notes:     realId(data.notes)
      };
    });

    document.getElementById("loadingMsg").style.display = "none";
    drawTree(persons);

  } catch (e) {
    document.getElementById("loadingMsg").textContent = "Erreur : " + e.message;
    console.error(e);
  }
}

function drawTree(persons) {
  const ids = Object.keys(persons);

  // ── 1. Calcul des niveaux ─────────────────────────────────
  const level = {};

  // Racines = fatherId ET motherId sont null/inexistants
  ids.forEach(id => {
    const p = persons[id];
    const hasFather = p.fatherId && persons[p.fatherId];
    const hasMother = p.motherId && persons[p.motherId];
    if (!hasFather && !hasMother) level[id] = 0;
  });

  // Propager vers les enfants
  for (let i = 0; i < 30; i++) {
    ids.forEach(id => {
      if (level[id] !== undefined) return;
      const p = persons[id];
      const hasFather = p.fatherId && persons[p.fatherId];
      const hasMother = p.motherId && persons[p.motherId];
      const fLv = hasFather ? level[p.fatherId] : undefined;
      const mLv = hasMother ? level[p.motherId] : undefined;

      if (hasFather && hasMother && fLv !== undefined && mLv !== undefined) {
        level[id] = Math.max(fLv, mLv) + 1;
      } else if (hasFather && !hasMother && fLv !== undefined) {
        level[id] = fLv + 1;
      } else if (hasMother && !hasFather && mLv !== undefined) {
        level[id] = mLv + 1;
      }
    });
  }

  // Conjoints sans parents → même niveau que conjoint
  for (let i = 0; i < 10; i++) {
    ids.forEach(id => {
      if (level[id] !== undefined) return;
      const sp = persons[id].spouseId;
      if (sp && persons[sp] && level[sp] !== undefined) {
        level[id] = level[sp];
      }
    });
  }

  // Forcer conjoints au même niveau
  for (let i = 0; i < 10; i++) {
    ids.forEach(id => {
      const sp = persons[id].spouseId;
      if (!sp || !persons[sp]) return;
      if (level[id] !== undefined && level[sp] !== undefined && level[id] !== level[sp]) {
        const m = Math.max(level[id], level[sp]);
        level[id] = m;
        level[sp] = m;
      }
    });
  }

  // Fallback
  ids.forEach(id => { if (level[id] === undefined) level[id] = 0; });

  // ── 2. Grouper par niveau ─────────────────────────────────
  const byLevel = {};
  ids.forEach(id => {
    const lv = level[id];
    if (!byLevel[lv]) byLevel[lv] = [];
    if (!byLevel[lv].includes(id)) byLevel[lv].push(id);
  });

  // ── 3. Couples et positions ───────────────────────────────
  const spouseOf = {};
  ids.forEach(id => {
    const sp = persons[id].spouseId;
    if (sp && persons[sp]) spouseOf[id] = sp;
  });

  const spouseLinks = [];
  const spousePairs = new Set();
  const pos = {};

  Object.keys(byLevel).sort((a, b) => +a - +b).forEach(lv => {
    const lvIds = byLevel[lv];
    const used  = new Set();
    const slots = [];

    lvIds.forEach(id => {
      if (used.has(id)) return;
      const sp = spouseOf[id];
      if (sp && lvIds.includes(sp) && !used.has(sp)) {
        slots.push([id, sp]);
        used.add(id); used.add(sp);
        const key = [id, sp].sort().join("~");
        if (!spousePairs.has(key)) {
          spousePairs.add(key);
          spouseLinks.push({ a: id, b: sp });
        }
      } else {
        slots.push([id]);
        used.add(id);
      }
    });

    // Largeur totale
    let totalW = 0;
    slots.forEach(slot => { totalW += slot.length * NW + (slot.length - 1) * 8; });
    totalW += (slots.length - 1) * HPAD;

    let x = -totalW / 2;
    const y = +lv * (NH + VPAD);

    slots.forEach(slot => {
      if (slot.length === 2) {
        pos[slot[0]] = { x, y };
        pos[slot[1]] = { x: x + NW + 8, y };
        x += NW * 2 + 8 + HPAD;
      } else {
        pos[slot[0]] = { x, y };
        x += NW + HPAD;
      }
    });
  });

  // ── 4. Familles (enfants par parents exacts) ──────────────
  const families = {};
  ids.forEach(id => {
    const p   = persons[id];
    const fid = p.fatherId && persons[p.fatherId] ? p.fatherId : null;
    const mid = p.motherId && persons[p.motherId] ? p.motherId : null;
    if (!fid && !mid) return;
    const key = (fid || "X") + "|" + (mid || "X");
    if (!families[key]) families[key] = { fatherId: fid, motherId: mid, children: [] };
    families[key].children.push(id);
  });

  // ── 5. SVG D3 ─────────────────────────────────────────────
  const wrapper = document.getElementById("tree-wrapper");
  const W = wrapper.clientWidth  || window.innerWidth;
  const H = wrapper.clientHeight || window.innerHeight - 56;

  const svg = d3.select("#tree-wrapper")
    .append("svg")
    .attr("id", "tree-svg")
    .attr("width",  W)
    .attr("height", H);

  const g = svg.append("g");

  const zoom = d3.zoom()
    .scaleExtent([0.2, 3])
    .on("zoom", event => g.attr("transform", event.transform));

  svg.call(zoom);
  svg.call(zoom.transform, d3.zoomIdentity.translate(W / 2, 40));

  // ── 6. Liens conjoints ────────────────────────────────────
  spouseLinks.forEach(({ a, b }) => {
    const pa = pos[a], pb = pos[b];
    if (!pa || !pb) return;
    const left  = pa.x < pb.x ? pa : pb;
    const right = pa.x < pb.x ? pb : pa;
    g.append("line")
      .attr("class", "link-spouse")
      .attr("x1", left.x + NW).attr("y1", left.y + NH / 2)
      .attr("x2", right.x)    .attr("y2", right.y + NH / 2);
  });

  // ── 7. Liens parent → enfant ──────────────────────────────
  Object.values(families).forEach(({ fatherId, motherId, children }) => {
    let originX, originY;

    if (fatherId && motherId) {
      const pf = pos[fatherId], pm = pos[motherId];
      if (!pf || !pm) return;
      const left = pf.x < pm.x ? pf : pm;
      originX = left.x + NW + 4;
      originY = left.y + NH / 2;
    } else {
      const pp = pos[fatherId || motherId];
      if (!pp) return;
      originX = pp.x + NW / 2;
      originY = pp.y + NH;
    }

    const childPos = children.map(cid => pos[cid]).filter(Boolean);
    if (!childPos.length) return;

    const midY = childPos[0].y - VPAD / 2;

    g.append("line").attr("class", "link")
      .attr("x1", originX).attr("y1", originY)
      .attr("x2", originX).attr("y2", midY);

    const xs   = childPos.map(p => p.x + NW / 2);
    const minX = Math.min(...xs, originX);
    const maxX = Math.max(...xs, originX);

    g.append("line").attr("class", "link")
      .attr("x1", minX).attr("y1", midY)
      .attr("x2", maxX).attr("y2", midY);

    childPos.forEach(cp => {
      g.append("line").attr("class", "link")
        .attr("x1", cp.x + NW / 2).attr("y1", midY)
        .attr("x2", cp.x + NW / 2).attr("y2", cp.y);
    });
  });

  // ── 8. Nœuds ─────────────────────────────────────────────
  ids.forEach(id => {
    const p  = persons[id];
    const pt = pos[id];
    if (!pt) return;

    const grp = g.append("g")
      .attr("class", "node-group")
      .attr("transform", `translate(${pt.x},${pt.y})`)
      .style("cursor", "pointer")
      .on("click", () => { window.location.href = "person.html?id=" + id; });

    grp.append("rect")
      .attr("class", "node-rect" + (p.deathDate ? " deceased" : ""))
      .attr("width", NW).attr("height", NH).attr("rx", 12);

    // Photo
    let textY = 24;
    if (p.photoURL) {
      const clipId = "clip-" + id;
      grp.append("defs").append("clipPath").attr("id", clipId)
        .append("circle").attr("cx", NW / 2).attr("cy", 18).attr("r", 13);
      grp.append("image")
        .attr("href", p.photoURL)
        .attr("x", NW / 2 - 13).attr("y", 5)
        .attr("width", 26).attr("height", 26)
        .attr("clip-path", `url(#${clipId})`);
      textY = 42;
    }

    const fullName = p.firstName + " " + p.lastName;
    const lines    = splitName(fullName, 18);

    lines.forEach((line, i) => {
      grp.append("text").attr("class", "node-name")
        .attr("x", NW / 2).attr("y", textY + i * 15)
        .attr("text-anchor", "middle").text(line);
    });

    let infoY = textY + lines.length * 15 + 3;

    if (p.nickname) {
      grp.append("text").attr("class", "node-nick")
        .attr("x", NW / 2).attr("y", infoY)
        .attr("text-anchor", "middle").text('"' + p.nickname + '"');
      infoY += 13;
    }

    if (p.birthDate) {
      const info = p.deathDate
        ? p.birthDate.split("-")[0] + " – " + p.deathDate.split("-")[0]
        : computeAge(p.birthDate) + " ans";
      grp.append("text").attr("class", "node-dates")
        .attr("x", NW / 2).attr("y", infoY)
        .attr("text-anchor", "middle").text(info);
    }
  });
}

function splitName(name, max) {
  if (name.length <= max) return [name];
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
