const NW   = 148;
const NH   = 86;
const HGAP = 40;
const CGAP = 18;
const VGAP = 110;

let P = {};

firebase.auth().onAuthStateChanged(async function(user) {
  if (!user) return;
  await buildTree();
});

async function buildTree() {
  try {
    const snap = await db.collection("persons").get();
    if (snap.empty) { msg("Aucune personne enregistrée."); return; }
    snap.forEach(d => { P[d.id] = { id: d.id, ...d.data() }; });
    render();
  } catch (e) { msg("Erreur : " + e.message); }
}

function render() {

  // ── 1. Relations ──────────────────────────────────────────
  const spouseOf = {};
  Object.values(P).forEach(p => {
    if (p.spouseId && P[p.spouseId]) spouseOf[p.id] = p.spouseId;
  });

  // ── 2. Calcul des niveaux ─────────────────────────────────
  const level = {};

  // Racines = sans parents connus
  Object.keys(P).forEach(id => {
    const p = P[id];
    const hasFather = p.fatherId && P[p.fatherId];
    const hasMother = p.motherId && P[p.motherId];
    if (!hasFather && !hasMother) level[id] = 0;
  });

  // Propager vers les enfants
  for (let iter = 0; iter < 30; iter++) {
    Object.values(P).forEach(p => {
      const fLv = p.fatherId && P[p.fatherId] ? level[p.fatherId] : undefined;
      const mLv = p.motherId && P[p.motherId] ? level[p.motherId] : undefined;
      const hasFather = p.fatherId && P[p.fatherId];
      const hasMother = p.motherId && P[p.motherId];

      if (!hasFather && !hasMother) return; // racine déjà traitée

      if (hasFather && hasMother) {
        if (fLv !== undefined && mLv !== undefined) {
          level[p.id] = Math.max(fLv, mLv) + 1;
        }
      } else if (hasFather && fLv !== undefined) {
        level[p.id] = fLv + 1;
      } else if (hasMother && mLv !== undefined) {
        level[p.id] = mLv + 1;
      }
    });
  }

  // Conjoints sans parents → même niveau que leur conjoint
  for (let iter = 0; iter < 10; iter++) {
    Object.keys(P).forEach(id => {
      if (level[id] === undefined) {
        const sp = spouseOf[id];
        if (sp && level[sp] !== undefined) level[id] = level[sp];
      }
    });
  }

  // Forcer conjoints au même niveau (max des deux)
  for (let iter = 0; iter < 10; iter++) {
    Object.keys(P).forEach(id => {
      const sp = spouseOf[id];
      if (sp && level[id] !== undefined && level[sp] !== undefined && level[id] !== level[sp]) {
        const maxLv = Math.max(level[id], level[sp]);
        level[id] = maxLv;
        level[sp] = maxLv;
      }
    });
  }

  // Fallback
  Object.keys(P).forEach(id => { if (level[id] === undefined) level[id] = 0; });

  // ── 3. Grouper par niveau ─────────────────────────────────
  const byLevel = {};
  Object.keys(level).forEach(id => {
    const lv = level[id];
    if (!byLevel[lv]) byLevel[lv] = [];
    if (!byLevel[lv].includes(id)) byLevel[lv].push(id);
  });

  // ── 4. Slots ──────────────────────────────────────────────
  const slotsByLevel = {};
  Object.keys(byLevel).sort((a, b) => a - b).forEach(lv => {
    const ids  = byLevel[lv];
    const used = new Set();
    const slots = [];
    ids.forEach(id => {
      if (used.has(id)) return;
      const sp = spouseOf[id];
      if (sp && ids.includes(sp) && !used.has(sp)) {
        slots.push([id, sp]);
        used.add(id); used.add(sp);
      } else {
        slots.push([id]);
        used.add(id);
      }
    });
    slotsByLevel[lv] = slots;
  });

  // ── 5. Positions ──────────────────────────────────────────
  const pos = {};
  Object.keys(slotsByLevel).sort((a, b) => a - b).forEach(lv => {
    let x = 30;
    const y = 30 + Number(lv) * (NH + VGAP);
    slotsByLevel[lv].forEach(slot => {
      if (slot.length === 2) {
        pos[slot[0]] = { x, y };
        pos[slot[1]] = { x: x + NW + CGAP, y };
        x += NW + CGAP + NW + HGAP;
      } else {
        pos[slot[0]] = { x, y };
        x += NW + HGAP;
      }
    });
  });

  // ── 6. Canvas ─────────────────────────────────────────────
  let maxX = 0, maxY = 0;
  Object.values(pos).forEach(p => {
    if (p.x + NW > maxX) maxX = p.x + NW;
    if (p.y + NH > maxY) maxY = p.y + NH;
  });
  const canvas = document.getElementById("tree-canvas");
  const svg    = document.getElementById("tree-svg");
  canvas.style.width  = (maxX + 60) + "px";
  canvas.style.height = (maxY + 60) + "px";
  svg.setAttribute("width",  maxX + 60);
  svg.setAttribute("height", maxY + 60);

  // ── 7. Lignes ─────────────────────────────────────────────
  let lines = "";
  const LS  = `stroke="#c0c0c8" stroke-width="1.5" fill="none"`;
  const LSD = `stroke="#aaaacc" stroke-width="1.5" stroke-dasharray="5,4" fill="none"`;

  // Lignes de couple (pointillé)
  const drawnCouple = new Set();
  Object.keys(P).forEach(id => {
    const sp  = spouseOf[id];
    if (!sp) return;
    const key = [id, sp].sort().join("~");
    if (drawnCouple.has(key)) return;
    drawnCouple.add(key);
    const pa = pos[id], pb = pos[sp];
    if (!pa || !pb) return;
    const left  = pa.x < pb.x ? pa : pb;
    const right = pa.x < pb.x ? pb : pa;
    const y = left.y + NH / 2;
    lines += `<line x1="${left.x + NW}" y1="${y}" x2="${right.x}" y2="${y}" ${LSD}/>`;
  });

  // ── Lignes parent → enfant ────────────────────────────────
  // Regroupe les enfants par leurs parents EXACTS (fatherId + motherId)
  // Clé = fatherId + "|" + motherId (NON trié — ordre important)
  const familyGroups = {};

  Object.values(P).forEach(p => {
    const fid = p.fatherId && P[p.fatherId] ? p.fatherId : null;
    const mid = p.motherId && P[p.motherId] ? p.motherId : null;
    if (!fid && !mid) return;

    // Clé NON triée : père d'abord, mère ensuite
    const key = (fid || "X") + "|" + (mid || "X");
    if (!familyGroups[key]) {
      familyGroups[key] = { fatherId: fid, motherId: mid, children: [] };
    }
    familyGroups[key].children.push(p.id);
  });

  Object.values(familyGroups).forEach(group => {
    const { fatherId, motherId, children } = group;

    // Point d'origine des lignes
    let originX, originY;

    if (fatherId && motherId) {
      const pf = pos[fatherId];
      const pm = pos[motherId];
      if (!pf || !pm) return;
      // Milieu du gap entre les deux parents
      const left  = pf.x < pm.x ? pf : pm;
      const right = pf.x < pm.x ? pm : pf;
      originX = left.x + NW + CGAP / 2;
      originY = left.y + NH / 2;
    } else {
      const pid = fatherId || motherId;
      const pp  = pos[pid];
      if (!pp) return;
      originX = pp.x + NW / 2;
      originY = pp.y + NH;
    }

    // Positions des enfants
    const childrenWithPos = children
      .map(cid => ({ id: cid, pos: pos[cid] }))
      .filter(c => c.pos);
    if (childrenWithPos.length === 0) return;

    // Y de la barre horizontale = Y des enfants - VGAP/2
    const childY  = childrenWithPos[0].pos.y;
    const midY    = childY - VGAP / 2;

    // Ligne verticale depuis l'origine
    lines += `<line x1="${originX}" y1="${originY}" x2="${originX}" y2="${midY}" ${LS}/>`;

    // Xs des enfants
    const xs   = childrenWithPos.map(c => c.pos.x + NW / 2);
    const minX = Math.min(...xs, originX);
    const maxX = Math.max(...xs, originX);

    // Barre horizontale
    lines += `<line x1="${minX}" y1="${midY}" x2="${maxX}" y2="${midY}" ${LS}/>`;

    // Descente vers chaque enfant
    childrenWithPos.forEach(c => {
      const cx = c.pos.x + NW / 2;
      lines += `<line x1="${cx}" y1="${midY}" x2="${cx}" y2="${c.pos.y}" ${LS}/>`;
    });
  });

  svg.innerHTML = lines;

  // ── 8. Nœuds HTML ─────────────────────────────────────────
  Object.keys(P).forEach(id => {
    const p  = P[id];
    const pt = pos[id];
    if (!pt) return;

    const node = document.createElement("a");
    node.href  = "person.html?id=" + id;
    node.className = "node" + (p.deathDate ? " deceased" : "");
    node.style.cssText = `left:${pt.x}px;top:${pt.y}px;width:${NW}px;min-height:${NH}px;`;

    const photoHTML = p.photoURL
      ? `<div class="node-photo" style="background-image:url('${p.photoURL}')"></div>`
      : "";

    let info = "";
    if (p.birthDate) {
      info = p.deathDate
        ? p.birthDate.split("-")[0] + " – " + p.deathDate.split("-")[0]
        : computeAge(p.birthDate) + " ans";
    }

    const nick = p.nickname ? `<div class="node-nick">"${p.nickname}"</div>` : "";

    node.innerHTML = `
      ${photoHTML}
      <div class="node-name">${p.firstName || ""} ${p.lastName || ""}</div>
      ${nick}
      ${info ? `<div class="node-dates">${info}</div>` : ""}
    `;
    canvas.appendChild(node);
  });

  document.getElementById("loadingMsg").style.display = "none";
  canvas.style.display = "block";
}

function computeAge(birthDate) {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() ||
     (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return age;
}

function msg(t) { document.getElementById("loadingMsg").textContent = t; }
