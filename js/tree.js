// ============================================================
// ARBRE GÉNÉALOGIQUE — algorithme corrigé
//
// Règles :
// 1. Le niveau d'une personne = max(niveau père, niveau mère) + 1
// 2. Si une personne n'a pas de parents connus dans l'arbre,
//    elle prend le niveau de son conjoint (s'il en a un)
// 3. Les conjoints sont côte à côte au même niveau
// 4. Les enfants sont en dessous de leurs parents
// ============================================================

const NW   = 148;
const NH   = 86;
const HGAP = 40;
const CGAP = 18;
const VGAP = 100;

let P = {}; // toutes les personnes

firebase.auth().onAuthStateChanged(async function(user) {
  if (!user) return;
  await buildTree();
});

async function buildTree() {
  try {
    const snap = await db.collection("persons").get();
    if (snap.empty) {
      msg("Aucune personne enregistrée."); return;
    }
    snap.forEach(d => { P[d.id] = { id: d.id, ...d.data() }; });
    render();
  } catch (e) {
    msg("Erreur : " + e.message);
  }
}

function render() {
  // ── Relations utiles ──────────────────────────────────────
  const spouseOf   = {};  // id → spouseId
  const parentsOf  = {};  // id → [parentId, ...]
  const childrenOf = {};  // id → [childId, ...]

  Object.keys(P).forEach(id => {
    parentsOf[id]  = [];
    childrenOf[id] = [];
  });

  Object.values(P).forEach(p => {
    if (p.spouseId && P[p.spouseId]) spouseOf[p.id] = p.spouseId;
    if (p.fatherId && P[p.fatherId]) { parentsOf[p.id].push(p.fatherId); childrenOf[p.fatherId].push(p.id); }
    if (p.motherId && P[p.motherId]) { parentsOf[p.id].push(p.motherId); childrenOf[p.motherId].push(p.id); }
  });

  // Dédoublonner childrenOf
  Object.keys(childrenOf).forEach(id => {
    childrenOf[id] = [...new Set(childrenOf[id])];
  });

  // ── Calcul des niveaux ────────────────────────────────────
  // On itère jusqu'à convergence
  const level = {};

  // Init : personnes sans parents connus → niveau 0
  Object.keys(P).forEach(id => {
    if (parentsOf[id].length === 0) level[id] = 0;
  });

  // Propagation vers le bas (parents → enfants)
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 50) {
    changed = false;
    iterations++;
    Object.keys(P).forEach(id => {
      if (parentsOf[id].length > 0) {
        const parentLevels = parentsOf[id].map(pid => level[pid]).filter(l => l !== undefined);
        if (parentLevels.length > 0) {
          const newLevel = Math.max(...parentLevels) + 1;
          if (level[id] !== newLevel) { level[id] = newLevel; changed = true; }
        }
      }
    });
  }

  // Personnes sans niveau (pas de parents connus, pas encore assignées)
  // → hériter du niveau du conjoint si possible
  changed = true;
  iterations = 0;
  while (changed && iterations < 20) {
    changed = false;
    iterations++;
    Object.keys(P).forEach(id => {
      if (level[id] === undefined) {
        const sp = spouseOf[id];
        if (sp && level[sp] !== undefined) {
          level[id] = level[sp];
          changed = true;
        }
      }
    });
  }

  // Cas restants (personnes isolées)
  Object.keys(P).forEach(id => {
    if (level[id] === undefined) level[id] = 0;
  });

  // S'assurer que les conjoints ont le même niveau
  // (prend le max des deux)
  changed = true;
  iterations = 0;
  while (changed && iterations < 10) {
    changed = false;
    Object.keys(P).forEach(id => {
      const sp = spouseOf[id];
      if (sp !== undefined && level[sp] !== undefined && level[id] !== level[sp]) {
        const maxLv = Math.max(level[id], level[sp]);
        level[id] = maxLv;
        level[sp] = maxLv;
        changed = true;
      }
    });
  }

  // ── Grouper par niveau ────────────────────────────────────
  const byLevel = {};
  Object.keys(level).forEach(id => {
    const lv = level[id];
    if (!byLevel[lv]) byLevel[lv] = [];
    if (!byLevel[lv].includes(id)) byLevel[lv].push(id);
  });

  // ── Construire les slots (groupes couple ou solo) ─────────
  // Un slot couple = [idA, idB] côte à côte
  const couplesDone = new Set();
  const slotsByLevel = {};

  Object.keys(byLevel).sort((a,b) => a-b).forEach(lv => {
    const ids = byLevel[lv];
    const slots = [];
    const used  = new Set();

    ids.forEach(id => {
      if (used.has(id)) return;
      const sp = spouseOf[id];
      if (sp && ids.includes(sp) && !used.has(sp)) {
        slots.push([id, sp]);
        used.add(id); used.add(sp);
        couplesDone.add(id + "_" + sp);
        couplesDone.add(sp + "_" + id);
      } else {
        slots.push([id]);
        used.add(id);
      }
    });

    slotsByLevel[lv] = slots;
  });

  // ── Positionner les nœuds ─────────────────────────────────
  const pos = {};

  Object.keys(slotsByLevel).sort((a,b) => a-b).forEach(lv => {
    const slots = slotsByLevel[lv];
    const y = 30 + Number(lv) * (NH + VGAP);
    let x = 30;

    slots.forEach(slot => {
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

  // ── Canvas ────────────────────────────────────────────────
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

  // ── Lignes SVG ────────────────────────────────────────────
  let lines = "";
  const LS  = `stroke="#c0c0c8" stroke-width="1.5" fill="none"`;
  const LSD = `stroke="#aaaacc" stroke-width="1.5" stroke-dasharray="5,4" fill="none"`;

  // Couples déjà dessinés pour les lignes
  const drawnCouple = new Set();

  Object.keys(P).forEach(id => {
    const sp = spouseOf[id];
    const key = [id, sp].sort().join("_");
    if (sp && !drawnCouple.has(key)) {
      drawnCouple.add(key);
      const pa = pos[id], pb = pos[sp];
      if (pa && pb) {
        // Ligne pointillée horizontale entre conjoints
        const leftP  = pa.x < pb.x ? pa : pb;
        const rightP = pa.x < pb.x ? pb : pa;
        const y = leftP.y + NH / 2;
        lines += `<line x1="${leftP.x + NW}" y1="${y}" x2="${rightP.x}" y2="${y}" ${LSD}/>`;
      }
    }
  });

  // Liens parents → enfants
  // Pour chaque enfant, trouve ses parents et dessine les lignes
  const drawnChild = new Set();

  Object.keys(P).forEach(childId => {
    if (drawnChild.has(childId)) return;
    const child = P[childId];
    const cp    = pos[childId];
    if (!cp) return;

    const father = child.fatherId && P[child.fatherId] ? child.fatherId : null;
    const mother = child.motherId && P[child.motherId] ? child.motherId : null;

    if (!father && !mother) return;
    drawnChild.add(childId);

    const midY = cp.y - VGAP / 2;

    if (father && mother) {
      // Les deux parents connus → descend depuis le milieu du couple
      const fp = pos[father], mp = pos[mother];
      if (!fp || !mp) return;

      const leftP  = fp.x < mp.x ? fp : mp;
      const rightP = fp.x < mp.x ? mp : fp;
      const coupleY = leftP.y + NH / 2;
      const midX    = leftP.x + NW + CGAP / 2;

      // Trouve tous les enfants communs de ce couple
      const siblings = Object.keys(P).filter(sid => {
        const s = P[sid];
        return ((s.fatherId === father && s.motherId === mother) ||
                (s.fatherId === mother && s.motherId === father));
      });

      const sibKey = [father, mother].sort().join("_");
      if (drawnChild.has("couple_" + sibKey)) return;
      drawnChild.add("couple_" + sibKey);
      siblings.forEach(s => drawnChild.add(s));

      // Ligne verticale depuis milieu couple vers le bas
      lines += `<line x1="${midX}" y1="${coupleY}" x2="${midX}" y2="${midY}" ${LS}/>`;

      const sibPositions = siblings.map(sid => pos[sid]).filter(Boolean);
      if (sibPositions.length === 0) return;

      const xs = sibPositions.map(p => p.x + NW / 2);
      const minX = Math.min(...xs, midX);
      const maxX = Math.max(...xs, midX);

      // Barre horizontale
      lines += `<line x1="${minX}" y1="${midY}" x2="${maxX}" y2="${midY}" ${LS}/>`;

      // Descente vers chaque enfant
      xs.forEach(cx => {
        const sib = sibPositions[xs.indexOf(cx)];
        lines += `<line x1="${cx}" y1="${midY}" x2="${cx}" y2="${sib.y}" ${LS}/>`;
      });

    } else {
      // Un seul parent connu
      const parentId = father || mother;
      const pp = pos[parentId];
      if (!pp) return;

      const px   = pp.x + NW / 2;
      const cx   = cp.x + NW / 2;
      lines += `<line x1="${px}" y1="${pp.y + NH}" x2="${px}" y2="${midY}" ${LS}/>`;
      lines += `<line x1="${px}" y1="${midY}" x2="${cx}" y2="${midY}" ${LS}/>`;
      lines += `<line x1="${cx}" y1="${midY}" x2="${cx}" y2="${cp.y}" ${LS}/>`;
    }
  });

  svg.innerHTML = lines;

  // ── Nœuds HTML ────────────────────────────────────────────
  Object.keys(P).forEach(id => {
    const p  = P[id];
    const pt = pos[id];
    if (!pt) return;

    const node = document.createElement("a");
    node.href  = "person.html?id=" + id;
    node.className = "node" + (p.deathDate ? " deceased" : "");
    node.style.cssText = `left:${pt.x}px;top:${pt.y}px;width:${NW}px;min-height:${NH}px;`;

    // Photo
    const photoHTML = p.photoURL
      ? `<div class="node-photo" style="background-image:url('${p.photoURL}')"></div>`
      : "";

    // Info ligne : âge si vivant, années si décédé
    let info = "";
    if (p.birthDate) {
      if (!p.deathDate) {
        info = computeAge(p.birthDate) + " ans";
      } else {
        info = p.birthDate.split("-")[0] + " – " + p.deathDate.split("-")[0];
      }
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

function msg(text) {
  document.getElementById("loadingMsg").textContent = text;
}
