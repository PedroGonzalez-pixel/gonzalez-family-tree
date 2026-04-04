// ============================================================
// ARBRE GÉNÉALOGIQUE
// Logique simple et directe :
// - niveau d'un enfant = niveau de ses parents + 1
// - conjoint sans parents = même niveau que son conjoint
// - lignes tirées depuis les VRAIS parents de chaque enfant
// ============================================================

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
  const spouseOf   = {};
  const childrenOf = {}; // parentId → [childId]
  Object.keys(P).forEach(id => { childrenOf[id] = []; });

  Object.values(P).forEach(p => {
    if (p.spouseId && P[p.spouseId]) spouseOf[p.id] = p.spouseId;
    if (p.fatherId && P[p.fatherId]) childrenOf[p.fatherId].push(p.id);
    if (p.motherId && P[p.motherId]) childrenOf[p.motherId].push(p.id);
  });

  // ── 2. Calcul des niveaux ─────────────────────────────────
  const level = {};

  // Étape A : personnes sans parents connus → niveau 0
  Object.keys(P).forEach(id => {
    const p = P[id];
    if (!p.fatherId && !p.motherId) level[id] = 0;
  });

  // Étape B : propager vers les enfants (itérations jusqu'à stabilité)
  for (let iter = 0; iter < 30; iter++) {
    Object.values(P).forEach(p => {
      const parents = [p.fatherId, p.motherId].filter(pid => pid && P[pid]);
      if (parents.length === 0) return;
      const parentLevels = parents.map(pid => level[pid]).filter(l => l !== undefined);
      if (parentLevels.length === parents.length) {
        level[p.id] = Math.max(...parentLevels) + 1;
      }
    });
  }

  // Étape C : conjoints sans parents → même niveau que leur conjoint
  for (let iter = 0; iter < 10; iter++) {
    Object.keys(P).forEach(id => {
      if (level[id] === undefined) {
        const sp = spouseOf[id];
        if (sp && level[sp] !== undefined) level[id] = level[sp];
      }
    });
  }

  // Étape D : forcer conjoints au même niveau (prend le max)
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

  // ── 4. Slots (couple = 2 cases côte à côte) ───────────────
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
    const key = [id, sp].sort().join("~");
    if (!sp || drawnCouple.has(key)) return;
    drawnCouple.add(key);
    const pa = pos[id], pb = pos[sp];
    if (!pa || !pb) return;
    const left  = pa.x < pb.x ? pa : pb;
    const right = pa.x < pb.x ? pb : pa;
    const y = left.y + NH / 2;
    lines += `<line x1="${left.x + NW}" y1="${y}" x2="${right.x}" y2="${y}" ${LSD}/>`;
  });

  // ── Lignes parent → enfant ────────────────────────────────
  // Regroupe les enfants par couple (fatherId + motherId)
  // clé = "fatherId|motherId" (trié)
  const groupsByParents = {}; // clé → { fatherId, motherId, children[] }

  Object.values(P).forEach(p => {
    const fid = p.fatherId && P[p.fatherId] ? p.fatherId : null;
    const mid = p.motherId && P[p.motherId] ? p.motherId : null;
    if (!fid && !mid) return;

    // Clé = IDs des parents triés pour regrouper les frères/sœurs
    const key = [fid || "none", mid || "none"].sort().join("|");
    if (!groupsByParents[key]) {
      groupsByParents[key] = { fatherId: fid, motherId: mid, children: [] };
    }
    groupsByParents[key].children.push(p.id);
  });

  Object.values(groupsByParents).forEach(group => {
    const { fatherId, motherId, children } = group;

    // Point de départ des lignes = milieu entre les deux parents
    // ou centre du parent unique
    let originX, originY;

    if (fatherId && motherId) {
      const pf = pos[fatherId];
      const pm = pos[motherId];
      if (!pf || !pm) return;
      const left  = pf.x < pm.x ? pf : pm;
      const right = pf.x < pm.x ? pm : pf;
      // Milieu du gap entre les deux parents (entre leur nœud)
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
    const childPos = children.map(cid => pos[cid]).filter(Boolean);
    if (childPos.length === 0) return;

    const midY = childPos[0].y - VGAP / 2;

    // Ligne verticale depuis le point d'origine
    if (fatherId && motherId) {
      lines += `<line x1="${originX}" y1="${originY}" x2="${originX}" y2="${midY}" ${LS}/>`;
    } else {
      lines += `<line x1="${originX}" y1="${originY}" x2="${originX}" y2="${midY}" ${LS}/>`;
    }

    // Barre horizontale entre tous les enfants
    const xs   = childPos.map(p => p.x + NW / 2);
    const minX = Math.min(...xs, originX);
    const maxX = Math.max(...xs, originX);
    lines += `<line x1="${minX}" y1="${midY}" x2="${maxX}" y2="${midY}" ${LS}/>`;

    // Descente vers chaque enfant
    childPos.forEach(cp => {
      const cx = cp.x + NW / 2;
      lines += `<line x1="${cx}" y1="${midY}" x2="${cx}" y2="${cp.y}" ${LS}/>`;
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
