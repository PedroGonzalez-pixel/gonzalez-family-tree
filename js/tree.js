// ============================================================
// ARBRE GÉNÉALOGIQUE CUSTOM
// Parents en haut → couple côte à côte → enfants en bas
// ============================================================

const NODE_W = 140;
const NODE_H = 80;
const H_GAP = 50;   // espace horizontal entre nœuds
const V_GAP = 90;   // espace vertical entre générations
const COUPLE_GAP = 20; // espace entre conjoints

let persons = {};
let positioned = {};

firebase.auth().onAuthStateChanged(async function(user) {
  if (!user) return;
  await buildTree();
});

async function buildTree() {
  try {
    const snapshot = await db.collection("persons").get();

    if (snapshot.empty) {
      document.getElementById("loadingMsg").textContent =
        document.querySelector("[data-i18n='empty']") ? "Aucune personne enregistrée." : "Aucune personne enregistrée.";
      return;
    }

    // Collecte toutes les personnes
    snapshot.forEach(doc => {
      persons[doc.id] = { id: doc.id, ...doc.data() };
    });

    // Calcule les générations (niveau hiérarchique)
    const levels = computeLevels();

    // Groupe par niveau
    const byLevel = {};
    Object.keys(levels).forEach(id => {
      const lv = levels[id];
      if (!byLevel[lv]) byLevel[lv] = [];
      byLevel[lv].push(id);
    });

    // Construit les couples (pour les placer côte à côte)
    const couples = buildCouples();

    // Positionne les nœuds
    const positions = positionNodes(byLevel, couples);

    // Calcule la taille du canvas
    let maxX = 0, maxY = 0;
    Object.values(positions).forEach(pos => {
      if (pos.x + NODE_W > maxX) maxX = pos.x + NODE_W;
      if (pos.y + NODE_H > maxY) maxY = pos.y + NODE_H;
    });

    const canvas = document.getElementById("tree-canvas");
    canvas.style.width = (maxX + 60) + "px";
    canvas.style.height = (maxY + 60) + "px";

    const svg = document.getElementById("tree-svg");
    svg.setAttribute("width", maxX + 60);
    svg.setAttribute("height", maxY + 60);

    // Dessine les lignes
    drawLines(svg, positions, couples);

    // Dessine les nœuds
    drawNodes(canvas, positions);

    // Affiche
    document.getElementById("loadingMsg").style.display = "none";
    canvas.style.display = "block";

  } catch (err) {
    console.error("Erreur arbre :", err.message);
    document.getElementById("loadingMsg").textContent = "Erreur lors du chargement.";
  }
}

// Calcule le niveau de chaque personne (0 = racine, +1 par génération)
function computeLevels() {
  const levels = {};

  // Trouve les racines (pas de parents connus)
  const roots = Object.keys(persons).filter(id => {
    const p = persons[id];
    return !p.fatherId && !p.motherId;
  });

  // BFS depuis les racines
  const queue = roots.map(id => ({ id, level: 0 }));
  const visited = new Set();

  while (queue.length > 0) {
    const { id, level } = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    levels[id] = level;

    // Trouve les enfants
    Object.keys(persons).forEach(childId => {
      const child = persons[childId];
      if ((child.fatherId === id || child.motherId === id) && !visited.has(childId)) {
        queue.push({ id: childId, level: level + 1 });
      }
    });
  }

  // Ajoute les personnes non visitées
  Object.keys(persons).forEach(id => {
    if (!(id in levels)) levels[id] = 0;
  });

  return levels;
}

// Construit la liste des couples
function buildCouples() {
  const couples = [];
  const paired = new Set();

  Object.keys(persons).forEach(id => {
    const p = persons[id];
    if (p.spouseId && !paired.has(id) && !paired.has(p.spouseId) && persons[p.spouseId]) {
      couples.push({ p1: id, p2: p.spouseId });
      paired.add(id);
      paired.add(p.spouseId);
    }
  });

  return couples;
}

// Positionne les nœuds par niveau
function positionNodes(byLevel, couples) {
  const positions = {};
  const coupleMap = {};
  couples.forEach(c => { coupleMap[c.p1] = c.p2; coupleMap[c.p2] = c.p1; });

  const sortedLevels = Object.keys(byLevel).map(Number).sort((a, b) => a - b);

  sortedLevels.forEach(level => {
    const ids = byLevel[level];

    // Groupe les couples ensemble dans ce niveau
    const groups = [];
    const placed = new Set();

    ids.forEach(id => {
      if (placed.has(id)) return;
      const spouseId = coupleMap[id];
      if (spouseId && ids.includes(spouseId)) {
        groups.push([id, spouseId]);
        placed.add(id);
        placed.add(spouseId);
      } else {
        groups.push([id]);
        placed.add(id);
      }
    });

    // Calcule la largeur totale de ce niveau
    let totalWidth = 0;
    groups.forEach(group => {
      totalWidth += group.length * NODE_W + (group.length - 1) * COUPLE_GAP;
    });
    totalWidth += (groups.length - 1) * H_GAP;

    let x = 30;
    const y = 30 + level * (NODE_H + V_GAP);

    groups.forEach(group => {
      group.forEach((id, i) => {
        positions[id] = {
          x: x + i * (NODE_W + COUPLE_GAP),
          y: y
        };
      });
      const groupWidth = group.length * NODE_W + (group.length - 1) * COUPLE_GAP;
      x += groupWidth + H_GAP;
    });
  });

  return positions;
}

// Dessine les lignes SVG
function drawLines(svg, positions, couples) {
  let svgContent = "";

  const lineStyle = `stroke="#c0c0c8" stroke-width="1.5" fill="none"`;
  const coupleStyle = `stroke="#aaaaaa" stroke-width="1.5" stroke-dasharray="4,3" fill="none"`;

  // Lignes conjoint (horizontale pointillée entre les deux)
  couples.forEach(couple => {
    const p1 = positions[couple.p1];
    const p2 = positions[couple.p2];
    if (!p1 || !p2) return;

    const x1 = p1.x + NODE_W;
    const x2 = p2.x;
    const y = p1.y + NODE_H / 2;
    svgContent += `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" ${coupleStyle}/>`;

    // Point de jonction pour les enfants
    const midX = (x1 + x2) / 2;

    // Trouve les enfants de ce couple
    const children = Object.keys(persons).filter(id => {
      const p = persons[id];
      return (p.fatherId === couple.p1 || p.motherId === couple.p1) &&
             (p.fatherId === couple.p2 || p.motherId === couple.p2);
    });

    if (children.length > 0) {
      // Ligne verticale depuis milieu du couple vers le bas
      const parentBottom = p1.y + NODE_H;
      const midY = parentBottom + V_GAP / 2;

      svgContent += `<line x1="${midX}" y1="${y}" x2="${midX}" y2="${midY}" ${lineStyle}/>`;

      if (children.length === 1) {
        const child = positions[children[0]];
        if (child) {
          const childMidX = child.x + NODE_W / 2;
          svgContent += `<line x1="${midX}" y1="${midY}" x2="${childMidX}" y2="${midY}" ${lineStyle}/>`;
          svgContent += `<line x1="${childMidX}" y1="${midY}" x2="${childMidX}" y2="${child.y}" ${lineStyle}/>`;
        }
      } else {
        // Ligne horizontale reliant tous les enfants
        const childMidXs = children.map(id => positions[id] ? positions[id].x + NODE_W / 2 : null).filter(Boolean);
        if (childMidXs.length > 0) {
          const minX = Math.min(...childMidXs);
          const maxX = Math.max(...childMidXs);
          svgContent += `<line x1="${minX}" y1="${midY}" x2="${maxX}" y2="${midY}" ${lineStyle}/>`;
          childMidXs.forEach((cx, i) => {
            const child = positions[children[i]];
            if (child) {
              svgContent += `<line x1="${cx}" y1="${midY}" x2="${cx}" y2="${child.y}" ${lineStyle}/>`;
            }
          });
          // Ligne verticale depuis le couple jusqu'à la barre horizontale
          const connX = Math.max(minX, Math.min(maxX, midX));
          svgContent += `<line x1="${midX}" y1="${midY}" x2="${connX}" y2="${midY}" ${lineStyle}/>`;
        }
      }
    }
  });

  // Lignes parent unique (sans conjoint connu)
  Object.keys(persons).forEach(id => {
    const p = persons[id];
    const pos = positions[id];
    if (!pos) return;

    [p.fatherId, p.motherId].forEach(parentId => {
      if (!parentId || !positions[parentId]) return;
      const spouse = p.fatherId && p.motherId && persons[p.fatherId] && persons[p.motherId];
      if (spouse) return; // déjà géré par les couples

      const parentPos = positions[parentId];
      const parentMidX = parentPos.x + NODE_W / 2;
      const childMidX = pos.x + NODE_W / 2;
      const parentBottom = parentPos.y + NODE_H;
      const midY = parentBottom + V_GAP / 2;

      svgContent += `<line x1="${parentMidX}" y1="${parentBottom}" x2="${parentMidX}" y2="${midY}" ${lineStyle}/>`;
      svgContent += `<line x1="${parentMidX}" y1="${midY}" x2="${childMidX}" y2="${midY}" ${lineStyle}/>`;
      svgContent += `<line x1="${childMidX}" y1="${midY}" x2="${childMidX}" y2="${pos.y}" ${lineStyle}/>`;
    });
  });

  svg.innerHTML = svgContent;
}

// Dessine les nœuds HTML
function drawNodes(canvas, positions) {
  Object.keys(persons).forEach(id => {
    const p = persons[id];
    const pos = positions[id];
    if (!pos) return;

    const node = document.createElement("a");
    node.href = "person.html?id=" + id;
    node.className = "node" + (p.deathDate ? " deceased" : "");
    node.style.left = pos.x + "px";
    node.style.top = pos.y + "px";
    node.style.width = NODE_W + "px";
    node.style.minHeight = NODE_H + "px";

    let photoHTML = "";
    if (p.photoURL) {
      photoHTML = `<div class="node-photo" style="background-image:url('${p.photoURL}')"></div>`;
    }

    let dates = "";
    if (p.birthDate) dates += "° " + p.birthDate.split("-")[0];
    if (p.deathDate) dates += "  † " + p.deathDate.split("-")[0];

    const nickname = p.nickname ? `<div class="node-dates" style="font-style:italic;">"${p.nickname}"</div>` : "";

    node.innerHTML = `
      ${photoHTML}
      <div class="node-name">${p.firstName || ""} ${p.lastName || ""}</div>
      ${nickname}
      ${dates ? `<div class="node-dates">${dates}</div>` : ""}
    `;

    canvas.appendChild(node);
  });
}
