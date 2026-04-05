// ============================================================
// ARBRE GÉNÉALOGIQUE — version finale
// Données validées — algorithme simplifié et correct
// ============================================================

function v(val) {
  return val && typeof val === "string" && val.trim() ? val : null;
}

function computeAge(d) {
  const t = new Date(), b = new Date(d);
  let a = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
  return a;
}

const NW = 154, NH = 82, HGAP = 32, CGAP = 12, VGAP = 100;

firebase.auth().onAuthStateChanged(async function(user) {
  if (!user) return;
  try {
    const snap = await db.collection("persons").get();
    if (snap.empty) { document.getElementById("loadingMsg").textContent = "Aucune personne."; return; }

    const P = {};
    snap.forEach(d => {
      const x = d.data();
      P[d.id] = {
        id: d.id,
        firstName: x.firstName || "", lastName: x.lastName || "",
        nickname:  v(x.nickname),  birthDate: v(x.birthDate),
        deathDate: v(x.deathDate), fatherId:  v(x.fatherId),
        motherId:  v(x.motherId),  spouseId:  v(x.spouseId),
        photoURL:  v(x.photoURL)
      };
    });

    document.getElementById("loadingMsg").style.display = "none";
    document.getElementById("tree-container").style.display = "block";
    drawTree(P);
  } catch(e) {
    document.getElementById("loadingMsg").textContent = "Erreur : " + e.message;
    console.error(e);
  }
});

function drawTree(P) {
  const ids = Object.keys(P);

  // ── 1. Générations ────────────────────────────────────────
  const gen = {};

  // Racines = pas de parents valides
  ids.forEach(id => {
    if (!P[id].fatherId && !P[id].motherId) gen[id] = 0;
  });

  // Propager vers les enfants
  for (let i = 0; i < 30; i++) {
    ids.forEach(id => {
      if (gen[id] !== undefined) return;
      const p  = P[id];
      const fg = p.fatherId && P[p.fatherId] && gen[p.fatherId] !== undefined ? gen[p.fatherId] : null;
      const mg = p.motherId && P[p.motherId] && gen[p.motherId] !== undefined ? gen[p.motherId] : null;
      if      (fg !== null && mg !== null) gen[id] = Math.max(fg, mg) + 1;
      else if (fg !== null)                gen[id] = fg + 1;
      else if (mg !== null)                gen[id] = mg + 1;
    });
  }

  // Conjoints sans parents → même génération que conjoint
  for (let i = 0; i < 10; i++) {
    ids.forEach(id => {
      if (gen[id] !== undefined) return;
      const sp = P[id].spouseId;
      if (sp && P[sp] && gen[sp] !== undefined) gen[id] = gen[sp];
    });
  }

  // Aligner conjoints au même niveau
  for (let i = 0; i < 10; i++) {
    ids.forEach(id => {
      const sp = P[id].spouseId;
      if (!sp || !P[sp]) return;
      if (gen[id] !== undefined && gen[sp] !== undefined && gen[id] !== gen[sp]) {
        const m = Math.max(gen[id], gen[sp]);
        gen[id] = gen[sp] = m;
      }
    });
  }

  ids.forEach(id => { if (gen[id] === undefined) gen[id] = 0; });

  // ── 2. Grouper par génération ─────────────────────────────
  const byGen = {};
  ids.forEach(id => {
    const g = gen[id];
    if (!byGen[g]) byGen[g] = [];
    if (!byGen[g].includes(id)) byGen[g].push(id);
  });

  // ── 3. Couples ────────────────────────────────────────────
  const spouseOf = {};
  ids.forEach(id => {
    const sp = P[id].spouseId;
    if (sp && P[sp]) spouseOf[id] = sp;
  });

  // ── 4. Familles : regrouper enfants par parents exacts ────
  const families = {};
  ids.forEach(id => {
    const p   = P[id];
    const fid = p.fatherId && P[p.fatherId] ? p.fatherId : null;
    const mid = p.motherId && P[p.motherId] ? p.motherId : null;
    if (!fid && !mid) return;
    const key = (fid || "X") + "##" + (mid || "X");
    if (!families[key]) families[key] = { fid, mid, children: [] };
    families[key].children.push(id);
  });

  // ── 5. Positions ──────────────────────────────────────────
  const pos = {}; // id → {x, y}
  const spousePairs = new Set();
  const spouseLinks = [];

  Object.keys(byGen).sort((a, b) => +a - +b).forEach(g => {
    const lvIds = byGen[g];
    const used  = new Set();
    const slots = []; // chaque slot = [id] ou [id, spouseId]

    lvIds.forEach(id => {
      if (used.has(id)) return;
      const sp = spouseOf[id];
      if (sp && lvIds.includes(sp) && !used.has(sp)) {
        slots.push([id, sp]);
        used.add(id); used.add(sp);
        const key = [id, sp].sort().join("~");
        if (!spousePairs.has(key)) {
          spousePairs.add(key);
          spouseLinks.push([id, sp]);
        }
      } else {
        slots.push([id]);
        used.add(id);
      }
    });

    // Largeur totale du niveau
    let totalW = 0;
    slots.forEach(s => { totalW += s.length === 2 ? NW * 2 + CGAP : NW; });
    totalW += (slots.length - 1) * HGAP;

    let x = -totalW / 2;
    const y = +g * (NH + VGAP);

    slots.forEach(slot => {
      if (slot.length === 2) {
        pos[slot[0]] = { x, y };
        pos[slot[1]] = { x: x + NW + CGAP, y };
        x += NW * 2 + CGAP + HGAP;
      } else {
        pos[slot[0]] = { x, y };
        x += NW + HGAP;
      }
    });
  });

  // ── 6. SVG ────────────────────────────────────────────────
  const wrapper = document.getElementById("tree-container");
  const W = wrapper.clientWidth  || window.innerWidth;
  const H = wrapper.clientHeight || window.innerHeight - 56;

  // Supprimer SVG existant si rechargement
  d3.select("#tree-container svg").remove();

  const svg = d3.select("#tree-container").append("svg")
    .attr("width", W).attr("height", H)
    .style("background", "#f5f5f7");

  const g = svg.append("g").attr("transform", `translate(${W/2}, 40)`);

  svg.call(d3.zoom().scaleExtent([0.15, 3])
    .on("zoom", e => g.attr("transform", e.transform)));

  const LS  = { stroke: "#c0c0c8", "stroke-width": 1.5, fill: "none" };
  const LSD = { stroke: "#aaaacc", "stroke-width": 1.5, fill: "none", "stroke-dasharray": "5,4" };

  function line(attrs) {
    const el = g.append("line");
    Object.keys(attrs).forEach(k => el.attr(k, attrs[k]));
    return el;
  }

  // ── 7. Liens conjoints (pointillé) ───────────────────────
  spouseLinks.forEach(([a, b]) => {
    const pa = pos[a], pb = pos[b];
    if (!pa || !pb) return;
    const left  = pa.x < pb.x ? pa : pb;
    const right = pa.x < pb.x ? pb : pa;
    line({ ...LSD, x1: left.x + NW, y1: left.y + NH/2, x2: right.x, y2: right.y + NH/2 });
  });

  // ── 8. Liens parent → enfant ──────────────────────────────
  Object.values(families).forEach(({ fid, mid, children }) => {
    const pf = fid ? pos[fid] : null;
    const pm = mid ? pos[mid] : null;
    if (!pf && !pm) return;

    // Centre X de chaque parent
    const fCx = pf ? pf.x + NW / 2 : null;
    const mCx = pm ? pm.x + NW / 2 : null;

    // Jonction = milieu entre les deux parents
    const jX = (fCx !== null && mCx !== null) ? (fCx + mCx) / 2 : (fCx || mCx);
    const pY  = (pf || pm).y + NH;
    const jY  = pY + VGAP * 0.45;

    // Ligne depuis père vers jonction
    if (fCx !== null) {
      g.append("path").attr("fill","none").attr("stroke","#c0c0c8").attr("stroke-width",1.5)
        .attr("d", `M${fCx},${pY} V${jY} H${jX}`);
    }
    // Ligne depuis mère vers jonction
    if (mCx !== null && mCx !== fCx) {
      g.append("path").attr("fill","none").attr("stroke","#c0c0c8").attr("stroke-width",1.5)
        .attr("d", `M${mCx},${pY} V${jY} H${jX}`);
    }

    // Positions des enfants
    const cps = children.map(cid => pos[cid]).filter(Boolean);
    if (!cps.length) return;

    const cxs  = cps.map(cp => cp.x + NW / 2);
    const minX = Math.min(...cxs);
    const maxX = Math.max(...cxs);

    // Barre horizontale entre enfants
    if (cxs.length > 1 || Math.abs(jX - cxs[0]) > 1) {
      const barMinX = Math.min(jX, minX);
      const barMaxX = Math.max(jX, maxX);
      line({ ...LS, x1: barMinX, y1: jY, x2: barMaxX, y2: jY });
    }

    // Descente vers chaque enfant
    cps.forEach(cp => {
      line({ ...LS, x1: cp.x + NW/2, y1: jY, x2: cp.x + NW/2, y2: cp.y });
    });
  });

  // ── 9. Nœuds ─────────────────────────────────────────────
  ids.forEach(id => {
    const p  = P[id];
    const pt = pos[id];
    if (!pt) return;

    const grp = g.append("g")
      .style("cursor", "pointer")
      .on("click", () => window.location.href = "person.html?id=" + id);

    // Rectangle
    grp.append("rect")
      .attr("x", pt.x).attr("y", pt.y)
      .attr("width", NW).attr("height", NH).attr("rx", 12)
      .attr("fill", p.deathDate ? "#f2f2f4" : "white")
      .attr("stroke", p.deathDate ? "#c8c8cc" : "#e0e0e5")
      .attr("stroke-width", 1.5);

    // Hover
    grp.on("mouseenter", function() {
      grp.select("rect").attr("stroke", "#0071e3").attr("stroke-width", 2);
    }).on("mouseleave", function() {
      grp.select("rect")
        .attr("stroke", p.deathDate ? "#c8c8cc" : "#e0e0e5")
        .attr("stroke-width", 1.5);
    });

    const cx = pt.x + NW / 2;
    let ty = pt.y + 24;

    // Photo
    if (p.photoURL) {
      const clipId = "cl" + id;
      grp.append("defs").append("clipPath").attr("id", clipId)
        .append("circle").attr("cx", cx).attr("cy", pt.y + 17).attr("r", 13);
      grp.append("image")
        .attr("href", p.photoURL)
        .attr("x", cx - 13).attr("y", pt.y + 4)
        .attr("width", 26).attr("height", 26)
        .attr("clip-path", `url(#${clipId})`);
      ty = pt.y + 40;
    }

    // Nom (sur 1 ou 2 lignes)
    const full  = (p.firstName + " " + p.lastName).trim();
    const words = full.split(" ");
    const lines = full.length > 16 && words.length > 1
      ? [words.slice(0, Math.ceil(words.length/2)).join(" "), words.slice(Math.ceil(words.length/2)).join(" ")]
      : [full];

    lines.forEach((ln, i) => {
      grp.append("text")
        .attr("x", cx).attr("y", ty + i * 15)
        .attr("text-anchor", "middle")
        .attr("font-family", "'DM Sans', sans-serif")
        .attr("font-size", 13).attr("font-weight", 500)
        .attr("fill", "#1d1d1f").text(ln);
    });

    let iy = ty + lines.length * 15 + 3;

    // Surnom
    if (p.nickname) {
      grp.append("text")
        .attr("x", cx).attr("y", iy)
        .attr("text-anchor", "middle")
        .attr("font-family", "'DM Sans', sans-serif")
        .attr("font-size", 11).attr("font-style", "italic")
        .attr("fill", "#6e6e73").text('"' + p.nickname + '"');
      iy += 13;
    }

    // Âge ou années
    if (p.birthDate) {
      const info = p.deathDate
        ? p.birthDate.split("-")[0] + " – " + p.deathDate.split("-")[0]
        : computeAge(p.birthDate) + " ans";
      grp.append("text")
        .attr("x", cx).attr("y", iy)
        .attr("text-anchor", "middle")
        .attr("font-family", "'DM Sans', sans-serif")
        .attr("font-size", 11).attr("fill", "#6e6e73").text(info);
    }
  });
}
