// ============================================================
// TREE.JS — Arbre généalogique (version finale stable)
// ============================================================

const TREE_VERSION = "1.0.3";

// ------------------ Helpers ------------------

function v(x){
  return x && typeof x === "string" && x.trim() ? x : null;
}

function info(p){
  if(!p.bd) return "";
  if(p.dd) return p.bd.split("-")[0] + " – " + p.dd.split("-")[0];

  const now = new Date();
  const b = new Date(p.bd);
  let age = now.getFullYear() - b.getFullYear();
  if(
    now.getMonth() < b.getMonth() ||
    (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())
  ) age--;
  return age + " ans";
}

// ------------------ Layout constants ------------------

const NW = 148;
const NH = 76;
const HGAP = 22;
const CGAP = 10;
const VGAP = 96;

// ============================================================
// Firestore load
// ============================================================

firebase.auth().onAuthStateChanged(async user=>{
  if(!user) return;

  try{
    const snap = await db.collection("persons").get();
    if(snap.empty){
      document.getElementById("loadingMsg").textContent = "Aucune personne.";
      return;
    }

    const P = {};
    snap.forEach(d=>{
      const x = d.data();
      P[d.id] = {
        id: d.id,
        name: (x.firstName||"") + " " + (x.lastName||""),
        nick: v(x.nickname),
        bd: v(x.birthDate),
        dd: v(x.deathDate),
        fid: v(x.fatherId),
        mid: v(x.motherId),
        sid: v(x.spouseId),
        photoURL: v(x.photoURL)
      };
    });

    document.getElementById("loadingMsg").style.display = "none";
    document.getElementById("tree-container").style.display = "block";

    drawTree(P);

  }catch(e){
    console.error(e);
    document.getElementById("loadingMsg").textContent = "Erreur : " + e.message;
  }
});

// ============================================================
// DRAW TREE
// ============================================================

function drawTree(P){

  const ids = Object.keys(P);

  // ──────────────────────────────────────────────────────────
  // 1. GÉNÉRATIONS — calcul strict par les parents (DFS)
  // ──────────────────────────────────────────────────────────

  const gen = {};
  const visiting = new Set();

  function computeGen(id){
    if(gen[id] !== undefined) return gen[id];
    if(visiting.has(id)){
      gen[id] = 0; // sécurité cycle
      return 0;
    }

    visiting.add(id);
    const p = P[id];
    let g = 0;

    if(p.fid && P[p.fid]) g = Math.max(g, computeGen(p.fid) + 1);
    if(p.mid && P[p.mid]) g = Math.max(g, computeGen(p.mid) + 1);

    gen[id] = g;
    visiting.delete(id);
    return g;
  }

  ids.forEach(id => computeGen(id));

  // ✅ PATCH : conjoints sans parents héritent du niveau du conjoint
  ids.forEach(id=>{
    const p = P[id];
    if(!p.sid || !P[p.sid]) return;

    const sp = P[p.sid];
    const hasParents = p.fid || p.mid;
    const spHasParents = sp.fid || sp.mid;

    if(!hasParents) gen[id] = gen[p.sid];
    if(!spHasParents) gen[p.sid] = gen[id];
  });

  // ──────────────────────────────────────────────────────────
  // 2. FAMILLES (père + mère biologiques)
  // ──────────────────────────────────────────────────────────

  const families = {};
  ids.forEach(id=>{
    const fid = P[id].fid && P[P[id].fid] ? P[id].fid : null;
    const mid = P[id].mid && P[P[id].mid] ? P[id].mid : null;
    if(!fid && !mid) return;

    const key = (fid||"X") + "##" + (mid||"X");
    if(!families[key]) families[key] = { fid, mid, children: [] };
    families[key].children.push(id);
  });

  // ──────────────────────────────────────────────────────────
  // 3. GROUPES PAR GÉNÉRATION
  // ──────────────────────────────────────────────────────────

  const byGen = {};
  ids.forEach(id=>{
    (byGen[gen[id]] ??= []).push(id);
  });

  const spouseOf = {};
  ids.forEach(id=>{
    if(P[id].sid && P[P[id].sid]) spouseOf[id] = P[id].sid;
  });

  const slotsByGen = {};
  const spouseLinks = [];
  const usedSpouses = new Set();
  const generations = Object.keys(byGen).map(Number).sort((a,b)=>a-b);

  generations.forEach(level=>{
    const levelIds = [...byGen[level]];
    const used = new Set();
    const slots = [];

    levelIds.forEach(id=>{
      if(used.has(id)) return;
      const sp = spouseOf[id];

      if(sp && levelIds.includes(sp) && !used.has(sp)){
        slots.push([id, sp]);
        used.add(id); used.add(sp);

        const k = [id,sp].sort().join("~");
        if(!usedSpouses.has(k)){
          usedSpouses.add(k);
          spouseLinks.push([id,sp]);
        }
      }else{
        slots.push([id]);
        used.add(id);
      }
    });

    slotsByGen[level] = slots;
  });

  // ──────────────────────────────────────────────────────────
  // 4. POSITIONS
  // ──────────────────────────────────────────────────────────

  const pos = {};

  generations.forEach(level=>{
    const slots = slotsByGen[level];
    let totalW = 0;

    slots.forEach(s=>{
      totalW += (s.length === 2 ? NW*2 + CGAP : NW);
    });
    totalW += (slots.length - 1) * HGAP;

    let x = -totalW / 2;
    const y = level * (NH + VGAP);

    slots.forEach(s=>{
      if(s.length === 2){
        pos[s[0]] = { x, y };
        pos[s[1]] = { x: x + NW + CGAP, y };
        x += NW*2 + CGAP + HGAP;
      }else{
        pos[s[0]] = { x, y };
        x += NW + HGAP;
      }
    });
  });

  // ──────────────────────────────────────────────────────────
  // Helper : centre visuel du parent (carte OU couple)
  // ──────────────────────────────────────────────────────────

  function parentVisualCenterX(pid){
    const p = pos[pid];
    if(!p) return null;

    const sp = spouseOf[pid];
    if(sp && pos[sp]){
      return (p.x + pos[sp].x + NW) / 2;
    }
    return p.x + NW/2;
  }

  // ──────────────────────────────────────────────────────────
  // 5. SVG + VERSION
  // ──────────────────────────────────────────────────────────

  const container = document.getElementById("tree-container");
  const W = container.clientWidth || window.innerWidth;
  const H = container.clientHeight || window.innerHeight - 56;

  d3.select("#tree-container svg").remove();

  const svg = d3.select("#tree-container")
    .append("svg")
    .attr("width", W)
    .attr("height", H)
    .style("background", "#f5f5f7");

  svg.append("text")
    .attr("x", 10)
    .attr("y", 16)
    .attr("font-size", 10)
    .attr("fill", "#9a9aa1")
    .text(`Tree.js v${TREE_VERSION}`);

  const svgG = svg.append("g")
    .attr("transform", `translate(${W/2},40)`);

  svg.call(
    d3.zoom()
      .scaleExtent([0.1,3])
      .on("zoom", e => svgG.attr("transform", e.transform))
  );

  // ──────────────────────────────────────────────────────────
  // 6. LIENS CONJOINTS
  // ──────────────────────────────────────────────────────────

  spouseLinks.forEach(([a,b])=>{
    const pa = pos[a], pb = pos[b];
    if(!pa || !pb) return;

    const y = pa.y + NH/2;
    svgG.append("line")
      .attr("x1", Math.min(pa.x,pb.x) + NW)
      .attr("x2", Math.max(pa.x,pb.x))
      .attr("y1", y)
      .attr("y2", y)
      .attr("stroke", "#aaaacc")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "5,4");
  });

  // ──────────────────────────────────────────────────────────
  // 7. LIENS PARENTS → ENFANTS (enfants centrés sous le couple)
  // ──────────────────────────────────────────────────────────

  Object.values(families).forEach(({fid,mid,children})=>{
    const fx = fid ? parentVisualCenterX(fid) : null;
    const mx = mid ? parentVisualCenterX(mid) : null;
    const jX = fx!==null && mx!==null ? (fx+mx)/2 : (fx ?? mx);
    if(jX === null) return;

    const parentY = (fid && pos[fid] ? pos[fid].y : pos[mid].y) + NH;
    const joinY = parentY + VGAP*0.4;

    // descentes depuis parents
    [fid,mid].forEach(pid=>{
      if(!pid) return;
      const cx = parentVisualCenterX(pid);
      if(cx === null) return;
      svgG.append("path")
        .attr("fill","none")
        .attr("stroke","#c0c0c8")
        .attr("stroke-width",1.5)
        .attr("d", `M${cx},${parentY} V${joinY} H${jX}`);
    });

    const childXs = children
      .map(cid => pos[cid] ? pos[cid].x + NW/2 : null)
      .filter(x => x !== null);

    const mnX = Math.min(...childXs, jX);
    const mxX = Math.max(...childXs, jX);

    svgG.append("line")
      .attr("x1", mnX)
      .attr("x2", mxX)
      .attr("y1", joinY)
      .attr("y2", joinY)
      .attr("stroke","#c0c0c8")
      .attr("stroke-width",1.5);

    children.forEach(cid=>{
      const c = pos[cid];
      if(!c) return;
      svgG.append("line")
        .attr("x1", c.x + NW/2)
        .attr("x2", c.x + NW/2)
        .attr("y1", joinY)
        .attr("y2", c.y)
        .attr("stroke","#c0c0c8")
        .attr("stroke-width",1.5);
    });
  });

  // ──────────────────────────────────────────────────────────
  // 8. NŒUDS
  // ──────────────────────────────────────────────────────────

  ids.forEach(id=>{
    const p = P[id];
    const pt = pos[id];
    if(!pt) return;

    const g = svgG.append("g")
      .style("cursor","pointer")
      .on("click",()=>window.location.href="person.html?id="+id);

    g.append("rect")
      .attr("x", pt.x)
      .attr("y", pt.y)
      .attr("width", NW)
      .attr("height", NH)
      .attr("rx", 10)
      .attr("fill", p.dd ? "#f2f2f4" : "white")
      .attr("stroke", "#d0d0d6");

    const cx = pt.x + NW/2;
    let ty = pt.y + 22;

    g.append("text")
      .attr("x", cx)
      .attr("y", ty)
      .attr("text-anchor","middle")
      .attr("font-size", 12)
      .attr("font-weight", 500)
      .text(p.name.trim());

    const inf = info(p);
    if(inf){
      g.append("text")
        .attr("x", cx)
        .attr("y", ty + 16)
        .attr("text-anchor","middle")
        .attr("font-size", 10)
        .attr("fill","#6e6e73")
        .text(inf);
    }
  });
}
