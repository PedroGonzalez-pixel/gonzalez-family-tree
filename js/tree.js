// ============================================================
// TREE.JS — Arbre généalogique (version finale corrigée)
// ============================================================

const TREE_VERSION = "1.0.5";

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

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
        bd: v(x.birthDate),
        dd: v(x.deathDate),
        fid: v(x.fatherId),
        mid: v(x.motherId),
        sid: v(x.spouseId)
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

  // ----------------------------------------------------------
  // 1. Générations (DFS parents -> enfants)
  // ----------------------------------------------------------

  const gen = {};
  const visiting = {};

  function computeGen(id){
    if(gen[id] !== undefined) return gen[id];
    if(visiting[id]) return 0;

    visiting[id] = true;
    let g = 0;

    const p = P[id];
    if(p.fid && P[p.fid]) g = Math.max(g, computeGen(p.fid) + 1);
    if(p.mid && P[p.mid]) g = Math.max(g, computeGen(p.mid) + 1);

    visiting[id] = false;
    gen[id] = g;
    return g;
  }

  ids.forEach(id => computeGen(id));

  // Conjoint sans parents -> hérite du niveau
  ids.forEach(id=>{
    const p = P[id];
    if(!p.sid || !P[p.sid]) return;

    if(!p.fid && !p.mid) gen[id] = gen[p.sid];
    if(!P[p.sid].fid && !P[p.sid].mid) gen[p.sid] = gen[id];
  });

  // ----------------------------------------------------------
  // 2. Familles (CORRIGÉ : enfants sous le couple si parent unique)
  // ----------------------------------------------------------

  const families = {};

  ids.forEach(id=>{
    let fid = P[id].fid && P[P[id].fid] ? P[id].fid : null;
    let mid = P[id].mid && P[P[id].mid] ? P[id].mid : null;

    if(fid && !mid){
      const sp = P[fid].sid;
      if(sp && P[sp]) mid = sp;
    }
    if(mid && !fid){
      const sp = P[mid].sid;
      if(sp && P[sp]) fid = sp;
    }

    if(!fid && !mid) return;

    const key = fid + "##" + mid;
    if(!families[key]) families[key] = { fid, mid, children: [] };
    families[key].children.push(id);
  });

  // ----------------------------------------------------------
  // 3. Slots par génération
  // ----------------------------------------------------------

  const byGen = {};
  ids.forEach(id=>{
    if(!byGen[gen[id]]) byGen[gen[id]] = [];
    byGen[gen[id]].push(id);
  });

  const spouseOf = {};
  ids.forEach(id=>{
    if(P[id].sid && P[P[id].sid]) spouseOf[id] = P[id].sid;
  });

  const slotsByGen = {};
  const spouseLinks = {};
  Object.keys(byGen).sort((a,b)=>a-b).forEach(level=>{
    const used = {};
    const slots = [];
    byGen[level].forEach(id=>{
      if(used[id]) return;
      const sp = spouseOf[id];
      if(sp && byGen[level].indexOf(sp) !== -1 && !used[sp]){
        slots.push([id,sp]);
        used[id] = used[sp] = true;
        spouseLinks[id+"~"+sp] = true;
      }else{
        slots.push([id]);
        used[id] = true;
      }
    });
    slotsByGen[level] = slots;
  });

  // ----------------------------------------------------------
  // 4. Positions
  // ----------------------------------------------------------

  const pos = {};
  Object.keys(slotsByGen).forEach(level=>{
    let totalW = 0;
    slotsByGen[level].forEach(s=>{
      totalW += s.length === 2 ? NW*2 + CGAP : NW;
    });
    totalW += (slotsByGen[level].length - 1) * HGAP;

    let x = -totalW / 2;
    const y = level * (NH + VGAP);

    slotsByGen[level].forEach(s=>{
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

  // ----------------------------------------------------------
  // 5. SVG + zoom (corrigé)
  // ----------------------------------------------------------

  d3.select("#tree-container svg").remove();

  const W = window.innerWidth;
  const H = window.innerHeight;

  const svg = d3.select("#tree-container")
    .append("svg")
    .attr("width", W)
    .attr("height", H)
    .style("background", "#f5f5f7");

  svg.append("text")
    .attr("x", 10)
    .attr("y", 16)
    .attr("font-size", 10)
    .attr("fill", "#999")
    .text("Tree.js v" + TREE_VERSION);

  const g = svg.append("g");

  const zoom = d3.zoom().scaleExtent([0.1, 3])
    .on("zoom", e => g.attr("transform", e.transform));

  svg.call(zoom)
    .call(zoom.transform, d3.zoomIdentity.translate(W/2, 40));

  // ----------------------------------------------------------
  // 6. Liens parents -> enfants (sous le couple)
  // ----------------------------------------------------------

  Object.values(families).forEach(({fid,mid,children})=>{
    const fx = pos[fid].x + NW/2;
    const mx = pos[mid].x + NW/2;
    const cx = (fx + mx) / 2;

    const py = pos[fid].y + NH;
    const jy = py + VGAP * 0.4;

    [fx,mx].forEach(x=>{
      g.append("path")
        .attr("d", "M"+x+","+py+" V"+jy+" H"+cx)
        .attr("fill","none")
        .attr("stroke","#c0c0c8");
    });

    children.forEach(cid=>{
      g.append("line")
        .attr("x1", pos[cid].x + NW/2)
        .attr("x2", pos[cid].x + NW/2)
        .attr("y1", jy)
        .attr("y2", pos[cid].y)
        .attr("stroke", "#c0c0c8");
    });
  });

  // ----------------------------------------------------------
  // 7. Nœuds
  // ----------------------------------------------------------

  ids.forEach(id=>{
    const p = P[id];
    const pt = pos[id];
    if(!pt) return;

    const n = g.append("g");

    n.append("rect")
      .attr("x",pt.x).attr("y",pt.y)
      .attr("width",NW).attr("height",NH)
      .attr("rx",10)
      .attr("fill","white")
      .attr("stroke","#ddd");

    n.append("text")
      .attr("x",pt.x+NW/2)
      .attr("y",pt.y+28)
      .attr("text-anchor","middle")
      .attr("font-size",12)
      .text(p.name);

    const inf = info(p);
    if(inf){
      n.append("text")
        .attr("x",pt.x+NW/2)
        .attr("y",pt.y+44)
        .attr("text-anchor","middle")
        .attr("font-size",10)
        .attr("fill","#666")
        .text(inf);
    }
  });
}
``
