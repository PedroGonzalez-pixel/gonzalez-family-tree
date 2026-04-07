// ============================================================
// TREE.JS — Arbre généalogique (FINAL)
// ============================================================

const TREE_VERSION = "1.0.4";

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function v(x){
  return x && typeof x === "string" && x.trim() ? x : null;
}

function info(p){
  if(!p.bd) return "";
  if(p.dd) return p.bd.split("-")[0]+" – "+p.dd.split("-")[0];
  const t=new Date(),b=new Date(p.bd);
  let a=t.getFullYear()-b.getFullYear();
  if(t.getMonth()<b.getMonth()||(t.getMonth()===b.getMonth()&&t.getDate()<b.getDate())) a--;
  return a+" ans";
}

const NW=148, NH=76, HGAP=22, CGAP=10, VGAP=96;

// ============================================================
// Firestore load
// ============================================================

firebase.auth().onAuthStateChanged(async user=>{
  if(!user) return;
  const snap = await db.collection("persons").get();
  const P = {};
  snap.forEach(d=>{
    const x=d.data();
    P[d.id]={
      id:d.id,
      name:(x.firstName||"")+" "+(x.lastName||""),
      bd:v(x.birthDate), dd:v(x.deathDate),
      fid:v(x.fatherId), mid:v(x.motherId),
      sid:v(x.spouseId)
    };
  });
  drawTree(P);
});

// ============================================================
// DRAW TREE
// ============================================================

function drawTree(P){

  const ids=Object.keys(P);

  // ----------------------------------------------------------
  // 1. Générations (DFS parents → enfants)
  // ----------------------------------------------------------

  const gen={}, visiting=new Set();

  function gOf(id){
    if(gen[id]!==undefined) return gen[id];
    if(visiting.has(id)) return gen[id]=0;
    visiting.add(id);
    const p=P[id];
    let g=0;
    if(p.fid&&P[p.fid]) g=Math.max(g,gOf(p.fid)+1);
    if(p.mid&&P[p.mid]) g=Math.max(g,gOf(p.mid)+1);
    visiting.delete(id);
    return gen[id]=g;
  }

  ids.forEach(id=>gOf(id));

  // Conjoint sans parents → hérite du niveau
  ids.forEach(id=>{
    const p=P[id];
    if(!p.sid||!P[p.sid]) return;
    if(!p.fid&&!p.mid) gen[id]=gen[p.sid];
    if(!P[p.sid].fid&&!P[p.sid].mid) gen[p.sid]=gen[id];
  });

  // ----------------------------------------------------------
  // 2. FAMILLES — ✅ CORRECTION CLÉ
  // ----------------------------------------------------------
  // Si un enfant a UN seul parent connu,
  // et que ce parent a un conjoint,
  // on dessine VISUELLEMENT l’enfant sous le couple.

  const families={};

  ids.forEach(id=>{
    let fid=P[id].fid&&P[P[id].fid]?P[id].fid:null;
    let mid=P[id].mid&&P[P[id].mid]?P[id].mid:null;

    // ✅ PATCH STRUCTUREL
    if(fid&&!mid){
      const sp=P[fid].sid;
      if(sp&&P[sp]) mid=sp;
    }
    if(mid&&!fid){
      const sp=P[mid].sid;
      if(sp&&P[sp]) fid=sp;
    }

    if(!fid&&!mid) return;
    const key=fid+"##"+mid;
    if(!families[key]) families[key]={ fid, mid, children:[] };
    families[key].children.push(id);
  });

  // ----------------------------------------------------------
  // 3. Slots par génération
  // ----------------------------------------------------------

  const byGen={};
  ids.forEach(id=>(byGen[gen[id]]??=[]).push(id));
  const spouseOf={};
  ids.forEach(id=>{ if(P[id].sid) spouseOf[id]=P[id].sid; });

  const slotsByGen={}, spouseLinks=[], done=new Set();
  Object.keys(byGen).map(Number).sort((a,b)=>a-b).forEach(g=>{
    const used=new Set(), slots=[];
    byGen[g].forEach(id=>{
      if(used.has(id)) return;
      const sp=spouseOf[id];
      if(sp&&byGen[g].includes(sp)&&!used.has(sp)){
        slots.push([id,sp]);
        used.add(id); used.add(sp);
        const k=[id,sp].sort().join("~");
        if(!done.has(k)){ done.add(k); spouseLinks.push([id,sp]); }
      }else{
        slots.push([id]); used.add(id);
      }
    });
    slotsByGen[g]=slots;
  });

  // ----------------------------------------------------------
  // 4. Positions
  // ----------------------------------------------------------

  const pos={};
  Object.keys(slotsByGen).map(Number).forEach(g=>{
    let W=0;
    slotsByGen[g].forEach(s=>W+=s.length===2?NW*2+CGAP:NW);
    W+=(slotsByGen[g].length-1)*HGAP;
    let x=-W/2,y=g*(NH+VGAP);
    slotsByGen[g].forEach(s=>{
      if(s.length===2){
        pos[s[0]]={x,y};
        pos[s[1]]={x:x+NW+CGAP,y};
        x+=NW*2+CGAP+HGAP;
      }else{
        pos[s[0]]={x,y}; x+=NW+HGAP;
      }
    });
  });

  // ----------------------------------------------------------
  // 5. SVG
  // ----------------------------------------------------------

  d3.select("#tree-container svg").remove();
  const svg=d3.select("#tree-container").append("svg")
    .attr("width",window.innerWidth)
    .attr("height",window.innerHeight)
    .style("background","#f5f5f7");

  svg.append("text")
    .attr("x",10).attr("y",16)
    .attr("font-size",10).attr("fill","#999")
    .text(`Tree.js v${TREE_VERSION}`);

  const g=svg.append("g").attr("transform","translate(600,40)");
  svg.call(d3.zoom().on("zoom",e=>g.attr("transform",e.transform)));

  // ----------------------------------------------------------
  // 6. Liens conjoints
  // ----------------------------------------------------------

  spouseLinks.forEach(([a,b])=>{
    g.append("line")
      .attr("x1",Math.min(pos[a].x,pos[b].x)+NW)
      .attr("x2",Math.max(pos[a].x,pos[b].x))
      .attr("y1",pos[a].y+NH/2)
      .attr("y2",pos[a].y+NH/2)
      .attr("stroke","#aaa").attr("stroke-dasharray","5,4");
  });

  // ----------------------------------------------------------
  // 7. Liens parents → enfants (✅ SOUS LE COUPLE)
  // ----------------------------------------------------------

  Object.values(families).forEach(({fid,mid,children})=>{
    const fx=pos[fid].x+NW/2, mx=pos[mid].x+NW/2;
    const cx=(fx+mx)/2;
    const py=pos[fid].y+NH;
    const jy=py+VGAP*0.4;

    [fx,mx].forEach(x=>{
      g.append("path")
        .attr("d",`M${x},${py} V${jy} H${cx}`)
        .attr("fill","none").attr("stroke","#c0c0c8");
    });

    children.forEach(cid=>{
      g.append("line")
        .attr("x1",pos[cid].x+NW/2)
        .attr("x2",pos[cid].x+NW/2)
        .attr("y1",jy)
        .attr("y2",pos[cid].y)
        .attr("stroke","#c0c0c8");
    });
  });

  // ----------------------------------------------------------
  // 8. Nœuds
  // ----------------------------------------------------------

  ids.forEach(id=>{
    const p=P[id],pt=pos[id];
    const n=g.append("g");
    n.append("rect")
      .attr("x",pt.x).attr("y",pt.y)
      .attr("width",NW).attr("height",NH)
      .attr("rx",10).attr("fill","white")
      .attr("stroke","#ddd");
    n.append("text")
      .attr("x",pt.x+NW/2).attr("y",pt.y+28)
      .attr("text-anchor","middle").attr("font-size",12)
      .text(p.name);
  });
}
