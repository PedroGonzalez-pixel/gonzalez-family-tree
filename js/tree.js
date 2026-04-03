// ============================================================
// ARBRE GÉNÉALOGIQUE
// - Racines en haut (pas de parents)
// - Conjoints côte à côte au même niveau
// - Enfants en dessous de leurs parents, reliés entre eux
// - Âge pour les vivants
// ============================================================

const NW = 148;   // node width
const NH = 82;    // node height
const HGAP = 48;  // gap horizontal entre nœuds distincts
const CGAP = 16;  // gap entre conjoints
const VGAP = 100; // gap vertical entre générations

let persons = {};

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
    snap.forEach(d => { persons[d.id] = { id: d.id, ...d.data() }; });
    render();
  } catch (e) {
    document.getElementById("loadingMsg").textContent = "Erreur : " + e.message;
  }
}

function render() {
  // ── 1. Construire les couples ──────────────────────────────
  const coupleOf = {};   // id → partnerId
  const coupleUnits = []; // [{a, b}] — chaque couple une seule fois
  const inCouple = new Set();

  Object.values(persons).forEach(p => {
    if (p.spouseId && persons[p.spouseId] && !inCouple.has(p.id) && !inCouple.has(p.spouseId)) {
      coupleUnits.push({ a: p.id, b: p.spouseId });
      inCouple.add(p.id);
      inCouple.add(p.spouseId);
      coupleOf[p.id] = p.spouseId;
      coupleOf[p.spouseId] = p.id;
    }
  });

  // ── 2. Trouver les enfants de chaque personne ──────────────
  // childrenOf[id] = [childId, ...]
  const childrenOf = {};
  Object.keys(persons).forEach(id => { childrenOf[id] = []; });
  Object.values(persons).forEach(p => {
    if (p.fatherId && persons[p.fatherId]) childrenOf[p.fatherId].push(p.id);
    if (p.motherId && persons[p.motherId]) childrenOf[p.motherId].push(p.id);
  });

  // ── 3. Calculer les niveaux par BFS ───────────────────────
  const level = {};
  // Racines = personnes sans père ni mère connus
  const roots = Object.keys(persons).filter(id => {
    const p = persons[id];
    return !p.fatherId && !p.motherId;
  });

  const queue = [];
  roots.forEach(id => { level[id] = 0; queue.push(id); });

  // Si le conjoint d'une racine n'a pas de parents → même niveau
  let head = 0;
  while (head < queue.length) {
    const id = queue[head++];
    const lv = level[id];

    // Conjoint → même niveau
    const sp = coupleOf[id];
    if (sp && !(sp in level)) {
      level[sp] = lv;
      queue.push(sp);
    }

    // Enfants → niveau + 1
    // Enfants = union des enfants du père et de la mère
    const p = persons[id];
    const myChildren = new Set(childrenOf[id]);
    // si conjoint connu, ajouter ses enfants aussi
    if (sp) childrenOf[sp].forEach(c => myChildren.add(c));

    myChildren.forEach(cid => {
      if (!(cid in level)) {
        level[cid] = lv + 1;
        queue.push(cid);
      }
    });
  }

  // Personnes non atteintes (îlots isolés)
  Object.keys(persons).forEach(id => {
    if (!(id in level)) {
      level[id] = 0;
      queue.push(id);
      // et leur conjoint
      const sp = coupleOf[id];
      if (sp && !(sp in level)) level[sp] = 0;
    }
  });

  // ── 4. Grouper par niveau ──────────────────────────────────
  const byLevel = {};
  Object.keys(level).forEach(id => {
    const lv = level[id];
    if (!byLevel[lv]) byLevel[lv] = [];
    byLevel[lv].push(id);
  });

  // ── 5. Construire les colonnes de chaque niveau ────────────
  // On crée des "slots" : un slot = [id] ou [id_a, id_b] pour un couple
  // Règle : un couple occupe 2 cases côte à côte
  const slots = {}; // level → array of slots
  Object.keys(byLevel).forEach(lv => {
    const ids = byLevel[lv];
    const used = new Set();
    const arr = [];
    ids.forEach(id => {
      if (used.has(id)) return;
      const sp = coupleOf[id];
      if (sp && ids.includes(sp) && !used.has(sp)) {
        arr.push([id, sp]);
        used.add(id); used.add(sp);
      } else if (!sp || !ids.includes(sp)) {
        arr.push([id]);
        used.add(id);
      }
    });
    slots[lv] = arr;
  });

  // ── 6. Calculer les positions X/Y ─────────────────────────
  const pos = {}; // id → {x, y}
  const sortedLevels = Object.keys(slots).map(Number).sort((a, b) => a - b);

  sortedLevels.forEach(lv => {
    const y = 30 + lv * (NH + VGAP);
    let x = 30;
    slots[lv].forEach(slot => {
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

  // ── 7. Canvas ─────────────────────────────────────────────
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

  // ── 8. Dessiner les lignes ─────────────────────────────────
  let lines = "";
  const S  = `stroke="#c0c0c8" stroke-width="1.5" fill="none"`;
  const SD = `stroke="#aaaacc" stroke-width="1.5" stroke-dasharray="5,4" fill="none"`;

  // Lignes de couple (pointillé horizontal)
  coupleUnits.forEach(({ a, b }) => {
    const pa = pos[a], pb = pos[b];
    if (!pa || !pb) return;
    const y = pa.y + NH / 2;
    lines += `<line x1="${pa.x + NW}" y1="${y}" x2="${pb.x}" y2="${y}" ${SD}/>`;
  });

  // Lignes parent → enfant
  // Pour chaque couple, on calcule le midpoint et on descend vers les enfants communs
  const drawnParentChild = new Set();

  coupleUnits.forEach(({ a, b }) => {
    const pa = pos[a], pb = pos[b];
    if (!pa || !pb) return;

    // Enfants communs = enfants de a ET de b
    const setA = new Set(childrenOf[a]);
    const setB = new Set(childrenOf[b]);
    const common = [...setA].filter(id => setB.has(id));
    common.forEach(id => drawnParentChild.add(id));

    if (common.length === 0) return;

    const midX = pa.x + NW + CGAP / 2; // milieu du gap entre conjoints
    const topY = pa.y + NH;
    const midY = topY + VGAP / 2;

    // Descente depuis le couple
    lines += `<line x1="${midX}" y1="${pa.y + NH / 2}" x2="${midX}" y2="${midY}" ${S}/>`;

    // Positions des enfants
    const cxs = common.map(id => pos[id] ? pos[id].x + NW / 2 : null).filter(Boolean);
    if (cxs.length === 0) return;

    const minCX = Math.min(...cxs);
    const maxCX = Math.max(...cxs);

    // Barre horizontale
    if (cxs.length > 1) {
      lines += `<line x1="${minCX}" y1="${midY}" x2="${maxCX}" y2="${midY}" ${S}/>`;
    }
    // Connexion milieu couple → barre
    const clampedMid = Math.max(minCX, Math.min(maxCX, midX));
    lines += `<line x1="${midX}" y1="${midY}" x2="${clampedMid}" y2="${midY}" ${S}/>`;

    // Descente vers chaque enfant
    cxs.forEach((cx, i) => {
      const child = pos[common[i]];
      if (child) lines += `<line x1="${cx}" y1="${midY}" x2="${cx}" y2="${child.y}" ${S}/>`;
    });
  });

  // Enfants d'un parent seul (sans conjoint connu dans l'arbre)
  Object.keys(persons).forEach(id => {
    childrenOf[id].forEach(cid => {
      if (drawnParentChild.has(cid)) return;
      const pp = pos[id], cp = pos[cid];
      if (!pp || !cp) return;
      drawnParentChild.add(cid);
      const px = pp.x + NW / 2;
      const midY = pp.y + NH + VGAP / 2;
      lines += `<line x1="${px}" y1="${pp.y + NH}" x2="${px}" y2="${midY}" ${S}/>`;
      lines += `<line x1="${px}" y1="${midY}" x2="${cp.x + NW / 2}" y2="${midY}" ${S}/>`;
      lines += `<line x1="${cp.x + NW / 2}" y1="${midY}" x2="${cp.x + NW / 2}" y2="${cp.y}" ${S}/>`;
    });
  });

  svg.innerHTML = lines;

  // ── 9. Dessiner les nœuds ─────────────────────────────────
  Object.keys(persons).forEach(id => {
    const p = persons[id];
    const pt = pos[id];
    if (!pt) return;

    const node = document.createElement("a");
    node.href = "person.html?id=" + id;
    node.className = "node" + (p.deathDate ? " deceased" : "");
    node.style.cssText = `left:${pt.x}px;top:${pt.y}px;width:${NW}px;min-height:${NH}px`;

    // Photo
    let photoHTML = "";
    if (p.photoURL) {
      photoHTML = `<div class="node-photo" style="background-image:url('${p.photoURL}')"></div>`;
    }

    // Dates ou âge
    let infoLine = "";
    if (p.birthDate) {
      if (!p.deathDate) {
        const age = computeAge(p.birthDate);
        infoLine = `${age} ans`;
      } else {
        const by = p.birthDate.split("-")[0];
        const dy = p.deathDate.split("-")[0];
        infoLine = `${by} – ${dy}`;
      }
    }

    const nickname = p.nickname ? `<div class="node-nick">"${p.nickname}"</div>` : "";

    node.innerHTML = `
      ${photoHTML}
      <div class="node-name">${p.firstName || ""} ${p.lastName || ""}</div>
      ${nickname}
      ${infoLine ? `<div class="node-dates">${infoLine}</div>` : ""}
    `;

    canvas.appendChild(node);
  });

  // Afficher
  document.getElementById("loadingMsg").style.display = "none";
  canvas.style.display = "block";
}

function computeAge(birthDate) {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}
