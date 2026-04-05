// ============================================================
// ARBRE GÉNÉALOGIQUE — approche correcte
//
// Stratégie :
// 1. Créer des "nœuds familles" virtuels pour chaque couple
// 2. Utiliser d3.tree() sur cette structure
// 3. Les conjoints se partagent un nœud famille commun
// ============================================================

const NW = 150;
const NH = 78;

function v(val) {
  return val && typeof val === "string" && val.trim() ? val : null;
}

function age(d) {
  const t = new Date(), b = new Date(d);
  let a = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
  return a;
}

firebase.auth().onAuthStateChanged(async user => {
  if (!user) return;
  try {
    const snap = await db.collection("persons").get();
    if (snap.empty) { document.getElementById("loadingMsg").textContent = "Aucune personne."; return; }
    const raw = {};
    snap.forEach(d => {
      const x = d.data();
      raw[d.id] = { id: d.id, firstName: x.firstName||"", lastName: x.lastName||"",
        nickname: v(x.nickname), birthDate: v(x.birthDate), deathDate: v(x.deathDate),
        fatherId: v(x.fatherId), motherId: v(x.motherId), spouseId: v(x.spouseId), photoURL: v(x.photoURL) };
    });
    document.getElementById("loadingMsg").style.display = "none";
    draw(raw);
  } catch(e) {
    document.getElementById("loadingMsg").textContent = "Erreur : " + e.message;
  }
});

function draw(P) {
  const ids = Object.keys(P);

  // ── Étape 1 : calculer les niveaux (générations) ──────────
  const gen = {};

  // Racines = pas de parents valides dans P
  ids.forEach(id => {
    const p = P[id];
    if (!(p.fatherId && P[p.fatherId]) && !(p.motherId && P[p.motherId])) gen[id] = 0;
  });

  // Descendre
  for (let i = 0; i < 20; i++) {
    ids.forEach(id => {
      if (gen[id] !== undefined) return;
      const p = P[id];
      const fg = p.fatherId && P[p.fatherId] ? gen[p.fatherId] : null;
      const mg = p.motherId && P[p.motherId] ? gen[p.motherId] : null;
      if (fg !== null && fg !== undefined && mg !== null && mg !== undefined) gen[id] = Math.max(fg, mg) + 1;
      else if (fg !== null && fg !== undefined) gen[id] = fg + 1;
      else if (mg !== null && mg !== undefined) gen[id] = mg + 1;
    });
  }

  // Conjoints sans parents → même génération
  for (let i = 0; i < 10; i++) {
    ids.forEach(id => {
      if (gen[id] !== undefined) return;
      const sp = P[id].spouseId;
      if (sp && P[sp] && gen[sp] !== undefined) gen[id] = gen[sp];
    });
  }

  // Aligner conjoints
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

  // ── Étape 2 : grouper par génération et créer les slots ───
  const byGen = {};
  ids.forEach(id => {
    const g = gen[id];
    if (!byGen[g]) byGen[g] = [];
    if (!byGen[g].includes(id)) byGen[g].push(id);
  });

  // Couples (paire d'IDs)
  const spousePairs = new Set();
  const spouseOf = {};
  ids.forEach(id => {
    const sp = P[id].spouseId;
    if (sp && P[sp]) {
      spouseOf[id] = sp;
      const key = [id,sp].sort().join("|");
      spousePairs.add(key);
    }
  });

  // Slots ordonnés par génération
  // Un slot = { ids: [id] ou [id, spouseId], x, y }
  const slots = {}; // genLevel → array of slot
  const slotOf = {}; // personId → slot

  const HGAP = 30;
  const VGAP = 100;
  const CGAP = 10; // gap entre conjoints

  Object.keys(byGen).sort((a,b)=>+a-+b).forEach(g => {
    const lvIds = byGen[g];
    const used = new Set();
    const lvSlots = [];

    lvIds.forEach(id => {
      if (used.has(id)) return;
      const sp = spouseOf[id];
      if (sp && lvIds.includes(sp) && !used.has(sp)) {
        const s = { ids: [id, sp], g: +g };
        lvSlots.push(s);
        slotOf[id] = s; slotOf[sp] = s;
        used.add(id); used.add(sp);
      } else {
        const s = { ids: [id], g: +g };
        lvSlots.push(s);
        slotOf[id] = s;
        used.add(id);
      }
    });

    slots[g] = lvSlots;
  });

  // Calculer largeurs des slots
  slots_width = {};
  Object.keys(slots).forEach(g => {
    slots[g].forEach(s => {
      s.w = s.ids.length === 2 ? NW * 2 + CGAP : NW;
    });
  });

  // Positionner les slots : centrer chaque génération
  // D'abord calculer largeur totale de chaque gen
  const pos = {}; // personId → {x, y, cx} cx = centre du slot

  Object.keys(slots).sort((a,b)=>+a-+b).forEach(g => {
    const lvSlots = slots[g];
    let totalW = lvSlots.reduce((acc, s) => acc + s.w, 0) + (lvSlots.length - 1) * HGAP;
    let x = -totalW / 2;
    const y = +g * (NH + VGAP);

    lvSlots.forEach(s => {
      s.x = x;
      s.y = y;
      s.cx = x + s.w / 2; // centre du slot

      if (s.ids.length === 2) {
        pos[s.ids[0]] = { x, y, cx: x + NW / 2 };
        pos[s.ids[1]] = { x: x + NW + CGAP, y, cx: x + NW + CGAP + NW / 2 };
      } else {
        pos[s.ids[0]] = { x, y, cx: x + NW / 2 };
      }

      x += s.w + HGAP;
    });
  });

  // ── Étape 3 : familles ────────────────────────────────────
  // Regrouper les enfants par (fatherId, motherId) exact
  const families = {};
  ids.forEach(id => {
    const p = P[id];
    const fid = p.fatherId && P[p.fatherId] ? p.fatherId : null;
    const mid = p.motherId && P[p.motherId] ? p.motherId : null;
    if (!fid && !mid) return;
    // Clé basée sur les IDs réels, pas triés
    const key = (fid||"_") + "##" + (mid||"_");
    if (!families[key]) families[key] = { fid, mid, children: [] };
    families[key].children.push(id);
  });

  // ── Étape 4 : SVG ─────────────────────────────────────────
  const wrapper = document.getElementById("tree-wrapper");
  const W = wrapper.clientWidth  || 1200;
  const H = wrapper.clientHeight || 700;

  d3.select("#tree-wrapper").select("svg").remove();

  const svg = d3.select("#tree-wrapper").append("svg")
    .attr("width", W).attr("height", H);

  const g = svg.append("g");

  svg.call(d3.zoom().scaleExtent([0.15, 3])
    .on("zoom", e => g.attr("transform", e.transform)));
  svg.call(d3.zoom().transform, d3.zoomIdentity.translate(W/2, 40).scale(1));

  // Reset transform après init
  g.attr("transform", `translate(${W/2},40)`);

  // ── Liens conjoints ───────────────────────────────────────
  const drawnSpouse = new Set();
  ids.forEach(id => {
    const sp = spouseOf[id];
    if (!sp) return;
    const key = [id,sp].sort().join("|");
    if (drawnSpouse.has(key)) return;
    drawnSpouse.add(key);
    const pa = pos[id], pb = pos[sp];
    if (!pa || !pb) return;
    const lx = Math.min(pa.x, pb.x) + NW;
    const rx = Math.max(pa.x, pb.x);
    const y  = pa.y + NH / 2;
    g.append("line").attr("class","link-spouse")
      .attr("x1",lx).attr("y1",y).attr("x2",rx).attr("y2",y);
  });

  // ── Liens parent → enfant ─────────────────────────────────
  Object.values(families).forEach(({ fid, mid, children }) => {
    const pf = fid ? pos[fid] : null;
    const pm = mid ? pos[mid] : null;
    if (!pf && !pm) return;

    // Point de jonction = milieu entre les deux parents (centres)
    const fCx = pf ? pf.cx : null;
    const mCx = pm ? pm.cx : null;

    let junctionX;
    if (fCx !== null && mCx !== null) {
      junctionX = (fCx + mCx) / 2;
    } else {
      junctionX = fCx !== null ? fCx : mCx;
    }

    const parentY = pf ? pf.y : pm.y;
    const junctionY = parentY + NH + VGAP * 0.4;

    // Ligne depuis chaque parent vers la jonction
    if (pf) {
      g.append("path").attr("class","link-parent")
        .attr("d", `M${pf.cx},${pf.y+NH} L${pf.cx},${junctionY} L${junctionX},${junctionY}`);
    }
    if (pm) {
      g.append("path").attr("class","link-parent")
        .attr("d", `M${pm.cx},${pm.y+NH} L${pm.cx},${junctionY} L${junctionX},${junctionY}`);
    }

    // Depuis la jonction vers chaque enfant
    const childPositions = children.map(cid => pos[cid]).filter(Boolean);
    if (!childPositions.length) return;

    const cxs = childPositions.map(cp => cp.cx);
    const minCx = Math.min(...cxs);
    const maxCx = Math.max(...cxs);

    // Barre horizontale au niveau de la jonction
    g.append("line").attr("class","link-parent")
      .attr("x1", Math.min(junctionX, minCx)).attr("y1", junctionY)
      .attr("x2", Math.max(junctionX, maxCx)).attr("y2", junctionY);

    childPositions.forEach(cp => {
      g.append("line").attr("class","link-parent")
        .attr("x1", cp.cx).attr("y1", junctionY)
        .attr("x2", cp.cx).attr("y2", cp.y);
    });
  });

  // ── Nœuds ─────────────────────────────────────────────────
  ids.forEach(id => {
    const p  = P[id];
    const pt = pos[id];
    if (!pt) return;

    const grp = g.append("g")
      .style("cursor","pointer")
      .on("click", () => window.location.href = "person.html?id=" + id);

    grp.append("rect")
      .attr("class","node-box" + (p.deathDate ? " deceased" : ""))
      .attr("x", pt.x).attr("y", pt.y)
      .attr("width", NW).attr("height", NH).attr("rx", 12)
      .on("mouseenter", function() { d3.select(this).attr("stroke","#0071e3"); })
      .on("mouseleave", function() { d3.select(this).attr("stroke", p.deathDate ? "#c8c8cc" : "#e0e0e5"); });

    const cx = pt.x + NW / 2;
    let ty = pt.y + 22;

    if (p.photoURL) {
      const clipId = "c" + id;
      grp.append("defs").append("clipPath").attr("id", clipId)
        .append("circle").attr("cx", cx).attr("cy", pt.y + 16).attr("r", 12);
      grp.append("image")
        .attr("href", p.photoURL)
        .attr("x", cx - 12).attr("y", pt.y + 4)
        .attr("width", 24).attr("height", 24)
        .attr("clip-path", `url(#${clipId})`);
      ty = pt.y + 38;
    }

    const fullName = (p.firstName + " " + p.lastName).trim();
    const lines = fullName.length > 18
      ? [fullName.split(" ").slice(0, Math.ceil(fullName.split(" ").length/2)).join(" "),
         fullName.split(" ").slice(Math.ceil(fullName.split(" ").length/2)).join(" ")]
      : [fullName];

    lines.forEach((ln, i) => {
      grp.append("text").attr("class","node-name-text")
        .attr("x", cx).attr("y", ty + i * 15)
        .attr("text-anchor","middle").text(ln);
    });

    let iy = ty + lines.length * 15 + 2;

    if (p.nickname) {
      grp.append("text").attr("class","node-nick-text")
        .attr("x", cx).attr("y", iy).attr("text-anchor","middle")
        .text('"' + p.nickname + '"');
      iy += 13;
    }

    if (p.birthDate) {
      const info = p.deathDate
        ? p.birthDate.split("-")[0] + " – " + p.deathDate.split("-")[0]
        : age(p.birthDate) + " ans";
      grp.append("text").attr("class","node-info-text")
        .attr("x", cx).attr("y", iy).attr("text-anchor","middle").text(info);
    }
  });
}
