const NW = 156;
const NH = 80;
const HPAD = 24;
const VPAD = 90;

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
        id: d.id,
        firstName: data.firstName || "",
        lastName:  data.lastName  || "",
        nickname:  realId(data.nickname),
        birthDate: realId(data.birthDate),
        deathDate: realId(data.deathDate),
        fatherId:  realId(data.fatherId),
        motherId:  realId(data.motherId),
        spouseId:  realId(data.spouseId),
        photoURL:  realId(data.photoURL),
      };
    });
    document.getElementById("loadingMsg").style.display = "none";
    drawTree(persons);
  } catch (e) {
    document.getElementById("loadingMsg").textContent = "Erreur : " + e.message;
  }
}

function drawTree(persons) {
  const ids = Object.keys(persons);

  // ── 1. Niveaux ────────────────────────────────────────────
  const level = {};

  ids.forEach(id => {
    const p = persons[id];
    if (!p.fatherId && !p.motherId) level[id] = 0;
  });

  for (let i = 0; i < 30; i++) {
    ids.forEach(id => {
      if (level[id] !== undefined) return;
      const p   = persons[id];
      const fLv = p.fatherId && persons[p.fatherId] ? level[p.fatherId] : undefined;
      const mLv = p.motherId && persons[p.motherId] ? level[p.motherId] : undefined;
      if (fLv !== undefined && mLv !== undefined) level[id] = Math.max(fLv, mLv) + 1;
      else if (fLv !== undefined)                 level[id] = fLv + 1;
      else if (mLv !== undefined)                 level[id] = mLv + 1;
    });
  }

  // Conjoints sans parents → même niveau
  for (let i = 0; i < 10; i++) {
    ids.forEach(id => {
      if (level[id] !== undefined) return;
      const sp = persons[id].spouseId;
      if (sp && persons[sp] && level[sp] !== undefined) level[id] = level[sp];
    });
  }

  // Forcer conjoints même niveau
  for (let i = 0; i < 10; i++) {
    ids.forEach(id => {
      const sp = persons[id].spouseId;
      if (!sp || !persons[sp]) return;
      if (level[id] !== undefined && level[sp] !== undefined && level[id] !== level[sp]) {
        const m = Math.max(level[id], level[sp]);
        level[id] = m; level[sp] = m;
      }
    });
  }

  ids.forEach(id => { if (level[id] === undefined) level[id] = 0; });

  // ── 2. Grouper par niveau ─────────────────────────────────
  const byLevel = {};
  ids.forEach(id => {
    const lv = level[id];
    if (!byLevel[lv]) byLevel[lv] = [];
    if (!byLevel[lv].includes(id)) byLevel[lv].push(id);
  });

  // ── 3. Positions ──────────────────────────────────────────
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

    let totalW = 0;
    slots.forEach(s => { totalW += s.length * NW + (s.length - 1) * 8; });
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

  // ── 4. Familles ───────────────────────────────────────────
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
    .attr("width", W).attr("height", H);

  const g = svg.append("g");
  const zoom = d3.zoom().scaleExtent([0.2, 3])
    .on("zoom", e => g.attr("transform", e.transform));
  svg.call(zoom);
  svg.call(zoom.transform, d3.zoomIdentity.translate(W / 2, 40));

  // ── 6. Liens conjoints ────────────────────────────────────
  spouseLinks.forEach(({ a, b }) => {
    const pa = pos[a], pb = pos[b];
    if (!pa || !pb) return;
    const left  = pa.x < pb.x ? pa : pb;
    const right = pa.x < pb.x ? pb : pa;
    g.append("line").attr("class", "link-spouse")
      .attr("x1", left.x + NW).attr("y1", left.y + NH / 2)
      .attr("x2", right.x)    .attr("y2", right.y + NH / 2);
  });

  // ── 7. Liens parent → enfant ──────────────────────────────
  // originX = moyenne des centres des parents (pas forcément adjacents)
  Object.values(families).forEach(({ fatherId, motherId, children }) => {
    const pf = fatherId ? pos[fatherId] : null;
    const pm = motherId ? pos[motherId] : null;

    if (!pf && !pm) return;

    // Centre X de chaque parent connu
    const parentCenters = [];
    if (pf) parentCenters.push(pf.x + NW / 2);
    if (pm) parentCenters.push(pm.x + NW / 2);

    // Origine = moyenne des centres des parents
    const originX = parentCenters.reduce((a, b) => a + b, 0) / parentCenters.length;
    // Origine Y = bas du parent le plus bas
    const parentBottoms = [];
    if (pf) parentBottoms.push(pf.y + NH);
    if (pm) parentBottoms.push(pm.y + NH);
    const originY = Math.max(...parentBottoms);

    const childPos = children.map(cid => pos[cid]).filter(Boolean);
    if (!childPos.length) return;

    const midY = originY + VPAD / 2;

    // Si deux parents : ligne horizontale entre eux + descente du milieu
    if (pf && pm) {
      const leftX  = Math.min(pf.x + NW / 2, pm.x + NW / 2);
      const rightX = Math.max(pf.x + NW / 2, pm.x + NW / 2);

      // Ligne depuis chaque parent vers le bas jusqu'à midY
      g.append("line").attr("class", "link")
        .attr("x1", leftX).attr("y1", originY)
        .attr("x2", leftX).attr("y2", midY);
      g.append("line").attr("class", "link")
        .attr("x1", rightX).attr("y1", originY)
        .attr("x2", rightX).attr("y2", midY);

      // Ligne horizontale entre les deux parents à midY
      g.append("line").attr("class", "link")
        .attr("x1", leftX).attr("y1", midY)
        .attr("x2", rightX).attr("y2", midY);
    } else {
      // Parent unique : descente simple
      g.append("line").attr("class", "link")
        .attr("x1", originX).attr("y1", originY)
        .attr("x2", originX).attr("y2", midY);
    }

    // Barre horizontale entre les enfants
    const xs   = childPos.map(p => p.x + NW / 2);
    const minX = Math.min(...xs, originX);
    const maxX = Math.max(...xs, originX);

    g.append("line").attr("class", "link")
      .attr("x1", minX).attr("y1", midY)
      .attr("x2", maxX).attr("y2", midY);

    // Descente vers chaque enfant
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

    const lines = splitName(p.firstName + " " + p.lastName, 18);
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
