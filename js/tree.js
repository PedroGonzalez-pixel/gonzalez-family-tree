// ============================================================
// ARBRE GÉNÉALOGIQUE — VERSION FINALE STABLE
// ============================================================

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

// ------------------ Constantes layout ------------------

const NW = 148;
const NH = 76;
const HGAP = 22;
const CGAP = 10;
const VGAP = 96;

// ============================================================
// Chargement Firestore
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

  // ==========================================================
  // 1. CALCUL DES GÉNÉRATIONS (DFS — SEULE MÉTHODE CORRECTE)
  // ==========================================================

  const gen = {};
  const visiting = new Set();

  function computeGen(id){
    if(gen[id] !== undefined) return gen[id];
    if(visiting.has(id)){
      // sécurité en cas de cycle
      gen[id] = 0;
      return 0;
    }

    visiting.add(id);

    const p = P[id];
    let g = 0;

    if(p.fid && P[p.fid]){
      g = Math.max(g, computeGen(p.fid) + 1);
    }
    if(p.mid && P[p.mid]){
      g = Math.max(g, computeGen(p.mid) + 1);
    }

    gen[id] = g;
    visiting.delete(id);
    return g;
  }

  ids.forEach(id => computeGen(id));

  // ==========================================================
  // 2. FAMILLES
  // ==========================================================

  const families = {};
  ids.forEach(id=>{
    const fid = P[id].fid && P[P[id].fid] ? P[id].fid : null;
    const mid = P[id].mid && P[P[id].mid] ? P[id].mid : null;
    if(!fid && !mid) return;

    const key = (fid||"X") + "##" + (mid||"X");
    if(!families[key]) families[key] = { fid, mid, children: [] };
    families[key].children.push(id);
  });

  // ==========================================================
  // 3. PERSONNES PAR GÉNÉRATION
  // ==========================================================

  const byGen = {};
  ids.forEach(id=>{
    const g = gen[id];
    if(!byGen[g]) byGen[g] = [];
    byGen[g].push(id);
  });

  const spouseOf = {};
  ids.forEach(id=>{
    if(P[id].sid && P[P[id].sid]){
      spouseOf[id] = P[id].sid;
    }
  });

  const slotsByGen = {};
  const spouseLinks = [];
  const spDone = new Set();

  const gens = Object.keys(byGen).map(Number).sort((a,b)=>a-b);

  gens.forEach(level=>{
    const lv = [...byGen[level]];
    const used = new Set();
    const slots = [];

    lv.forEach(id=>{
      if(used.has(id)) return;

      const sp = spouseOf[id];
      if(sp && lv.includes(sp) && !used.has(sp)){
        slots.push([id, sp]);
        used.add(id);
        used.add(sp);
        const k = [id,sp].sort().join("~");
        if(!spDone.has(k)){
          spDone.add(k);
          spouseLinks.push([id,sp]);
        }
      }else{
        slots.push([id]);
        used.add(id);
      }
    });

    slotsByGen[level] = slots;
  });

  // ==========================================================
  // 4. POSITIONS
  // ==========================================================

  const pos = {};

  gens.forEach(level=>{
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

  // ==========================================================
  // 5. SVG + ZOOM
  // ==========================================================

  const wrap = document.getElementById("tree-container");
  const W = wrap.clientWidth || window.innerWidth;
  const H = wrap.clientHeight || window.innerHeight - 56;

  d3.select("#tree-container svg").remove();

  const svg = d3.select("#tree-container")
    .append("svg")
    .attr("width", W)
    .attr("height", H)
    .style("background", "#f5f5f7");

  const svgG = svg.append("g")
    .attr("transform", `translate(${W/2},40)`);

  svg.call(
    d3.zoom()
      .scaleExtent([0.1, 3])
      .on("zoom", e => svgG.attr("transform", e.transform))
  );

  // ==========================================================
  // 6. LIENS CONJOINTS
  // ==========================================================

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

  // ==========================================================
  // 7. LIENS PARENTS → ENFANTS
  // ==========================================================

  Object.values(families).forEach(({fid,mid,children})=>{
    const pf = fid ? pos[fid] : null;
    const pm = mid ? pos[mid] : null;
    if(!pf && !pm) return;

    const fx = pf ? pf.x + NW/2 : null;
    const mx = pm ? pm.x + NW/2 : null;
    const cx = fx!==null && mx!==null ? (fx+mx)/2 : (fx ?? mx);
    const py = (pf || pm).y + NH;
    const jy = py + VGAP*0.4;

    [pf,pm].forEach(p=>{
      if(!p) return;
      svgG.append("path")
        .attr("fill","none")
        .attr("stroke","#c0c0c8")
        .attr("stroke-width",1.5)
        .attr("d",`M${p.x+NW/2},${py} V${jy} H${cx}`);
    });

    children.forEach(cid=>{
      const cp = pos[cid];
      if(!cp) return;
      svgG.append("line")
        .attr("x1", cp.x + NW/2)
        .attr("x2", cp.x + NW/2)
        .attr("y1", jy)
        .attr("y2", cp.y)
        .attr("stroke", "#c0c0c8")
        .attr("stroke-width", 1.5);
    });
  });

  // ==========================================================
  // 8. NŒUDS
  // ==========================================================

  ids.forEach(id=>{
    const p = P[id];
    const pt = pos[id];
    if(!pt) return;

    const grp = svgG.append("g")
      .style("cursor","pointer")
      .on("click",()=>window.location.href="person.html?id="+id);

    grp.append("rect")
      .attr("x", pt.x)
      .attr("y", pt.y)
      .attr("width", NW)
      .attr("height", NH)
      .attr("rx", 10)
      .attr("fill", p.dd ? "#f2f2f4" : "white")
      .attr("stroke", "#d0d0d6");

    const cx = pt.x + NW/2;
    let ty = pt.y + 22;

    grp.append("text")
      .attr("x", cx)
      .attr("y", ty)
      .attr("text-anchor","middle")
      .attr("font-size",12)
      .attr("font-weight",500)
      .text(p.name.trim());

    const inf = info(p);
    if(inf){
      grp.append("text")
        .attr("x", cx)
        .attr("y", ty+16)
        .attr("text-anchor","middle")
        .attr("font-size",10)
        .attr("fill","#6e6e73")
        .text(inf);
    }
  });
}
``
