// ARBRE GÉNÉALOGIQUE v2.6.0
const TREE_VERSION = "2.6.0";

function v(x){return x && typeof x==="string" && x.trim() ? x : null;}

function getInfo(p){
  if(!p.bd) return "";
  if(!p.dd){
    const t=new Date(), b=new Date(p.bd);
    let a=t.getFullYear()-b.getFullYear();
    if(t.getMonth()<b.getMonth()||(t.getMonth()===b.getMonth()&&t.getDate()<b.getDate())) a--;
    return a+" ans";
  }
  return p.bd.split("-")[0]+" – "+p.dd.split("-")[0];
}

const NW=140, NH=72;
const HGAP=18, CGAP=8, VGAP=90;
const LANE_HEIGHT = 28;

firebase.auth().onAuthStateChanged(async user=>{
  if(!user) return;
  const snap = await db.collection("persons").get();
  if(snap.empty) return;

  const P={};
  snap.forEach(d=>{
    const x=d.data();
    P[d.id]={
      id:d.id,
      n:(x.firstName||"")+" "+(x.lastName||""),
      nick:v(x.nickname),
      bd:v(x.birthDate),
      dd:v(x.deathDate),
      fid:v(x.fatherId),
      mid:v(x.motherId),
      sid:v(x.spouseId),
      photoURL:v(x.photoURL)
    };
  });
  document.getElementById("loadingMsg").style.display="none";
  document.getElementById("tree-container").style.display="block";
  drawTree(P);
});

function drawTree(P){
  const ids = Object.keys(P);

  // ── GÉNÉRATIONS ───────────────────────────────────────────
  const gen = {};
  ids.forEach(id=>{
    if(!P[id].fid && !P[id].mid) gen[id]=0;
  });

  let changed=true;
  while(changed){
    changed=false;
    ids.forEach(id=>{
      const p=P[id];
      const fg=p.fid&&P[p.fid]?gen[p.fid]:undefined;
      const mg=p.mid&&P[p.mid]?gen[p.mid]:undefined;

      if(fg!==undefined||mg!==undefined){
        const ng=Math.max(
          fg!==undefined?fg:-1,
          mg!==undefined?mg:-1
        )+1;
        if(gen[id]!==ng){gen[id]=ng;changed=true;}
      }

      if(p.sid&&P[p.sid]){
        if(gen[id]!==undefined && gen[p.sid]!==undefined && gen[id]!==gen[p.sid]){
          const m=Math.max(gen[id],gen[p.sid]);
          gen[id]=gen[p.sid]=m;changed=true;
        }
        if(gen[id]===undefined && gen[p.sid]!==undefined){gen[id]=gen[p.sid];changed=true;}
        if(gen[p.sid]===undefined && gen[id]!==undefined){gen[p.sid]=gen[id];changed=true;}
      }
    });
  }
  ids.forEach(id=>{ if(gen[id]===undefined) gen[id]=0; });

  // ── FAMILLES ──────────────────────────────────────────────
  const fams={};
  ids.forEach(id=>{
    const fid=P[id].fid&&P[P[id].fid]?P[id].fid:null;
    const mid=P[id].mid&&P[P[id].mid]?P[id].mid:null;
    if(!fid&&!mid) return;
    const k=(fid||"X")+"##"+(mid||"X");
    if(!fams[k]) fams[k]={fid,mid,ch:[],key:k};
    fams[k].ch.push(id);
  });

  // ── SLOTS PAR GÉNÉRATION (COUPLES INSÉPARABLES) ───────────
  const byGen={};
  ids.forEach(id=>{
    if(!byGen[gen[id]]) byGen[gen[id]]=[];
    byGen[gen[id]].push(id);
  });

  const spouseOf={};
  ids.forEach(id=>{
    if(P[id].sid && P[P[id].sid]) spouseOf[id]=P[id].sid;
  });

  const slotsByGen={};
  Object.keys(byGen).sort((a,b)=>a-b).forEach(g=>{
    const lvIds=[...byGen[g]];
    const used=new Set();
    const slots=[];

    const add=id=>{
      if(used.has(id)) return;
      const sp=spouseOf[id];
      if(sp && lvIds.includes(sp) && !used.has(sp)){
        slots.push([id,sp]);
        used.add(id);used.add(sp);
      }else{
        slots.push([id]);
        used.add(id);
      }
    };
    lvIds.forEach(add);
    slotsByGen[g]=slots;
  });

  // ── POSITIONS DES PERSONNES (COUPLES CÔTE À CÔTE) ─────────
  const pos={};
  Object.keys(slotsByGen).forEach(g=>{
    const slots=slotsByGen[g];
    let tw=0;
    slots.forEach(s=>{tw+=s.length===2?(NW*2+CGAP):NW;});
    tw+=(slots.length-1)*HGAP;

    let x=-tw/2, y=g*(NH+VGAP);
    slots.forEach(s=>{
      if(s.length===2){
        pos[s[0]]={x,y};
        pos[s[1]]={x+NW+CGAP,y};
        x+=NW*2+CGAP+HGAP;
      }else{
        pos[s[0]]={x,y};
        x+=NW+HGAP;
      }
    });
  });

  // ── LANES DE FRATRIES ─────────────────────────────────────
  const famLanesByGen={};
  Object.values(fams).forEach(f=>{
    const p=f.fid&&pos[f.fid]?pos[f.fid]:
            f.mid&&pos[f.mid]?pos[f.mid]:null;
    if(!p) return;
    const g=Math.round(p.y/(NH+VGAP));
    if(!famLanesByGen[g]) famLanesByGen[g]=[];
    famLanesByGen[g].push(f);
  });

  // ── SVG ───────────────────────────────────────────────────
  const wrapper=document.getElementById("tree-container");
  const W=wrapper.clientWidth||window.innerWidth;
  const H=wrapper.clientHeight||window.innerHeight-56;
  d3.select("#tree-container svg").remove();

  const svg=d3.select("#tree-container")
    .append("svg")
    .attr("width",W)
    .attr("height",H)
    .style("background","#f5f5f7");

  svg.append("text")
    .attr("x",10).attr("y",18)
    .attr("font-size",10)
    .attr("fill","#aaa")
    .text("v"+TREE_VERSION);

  const g=svg.append("g").attr("transform",`translate(${W/2},40)`);
  svg.call(d3.zoom().scaleExtent([0.1,3]).on("zoom",e=>g.attr("transform",e.transform)));

  // ── FONDS ALTERNÉS DES FRATRIES ───────────────────────────
  Object.entries(famLanesByGen).forEach(([genKey,famsInGen])=>{
    famsInGen.forEach((f,idx)=>{
      if(idx%2!==0) return;
      const p=f.fid&&pos[f.fid]?pos[f.fid]:
              f.mid&&pos[f.mid]?pos[f.mid]:null;
      const baseY=p.y+NH+VGAP*0.35;
      const y=baseY+idx*LANE_HEIGHT;
      g.append("rect")
        .attr("x",-4000)
        .attr("y",y-LANE_HEIGHT/2)
        .attr("width",8000)
        .attr("height",LANE_HEIGHT)
        .attr("fill","#eef0f4")
        .lower();
    });
  });

  // ── LIENS PARENTS → ENFANTS (ENFANTS SOUS LEURS PARENTS) ───
  Object.entries(fams).forEach(([key,f])=>{
    const pf=f.fid&&pos[f.fid]?pos[f.fid]:null;
    const pm=f.mid&&pos[f.mid]?pos[f.mid]:null;
    if(!pf&&!pm) return;

    const gidx=Math.round((pf||pm).y/(NH+VGAP));
    const famsInGen=famLanesByGen[gidx]||[];
    const laneIdx=famsInGen.findIndex(x=>x.key===key);

    const parentCenterX =
      pf && pm ? (pf.x+pm.x+NW)/2 :
      pf ? pf.x+NW/2 :
      pm.x+NW/2;

    const pY=(pf||pm).y+NH;
    const jY=pY+VGAP*0.35+laneIdx*LANE_HEIGHT;

    if(pf) g.append("path")
      .attr("d",`M${pf.x+NW/2},${pY} V${jY} H${parentCenterX}`)
      .attr("fill","none").attr("stroke","#c0c0c8");
    if(pm && pm!==pf) g.append("path")
      .attr("d",`M${pm.x+NW/2},${pY} V${jY} H${parentCenterX}`)
      .attr("fill","none").attr("stroke","#c0c0c8");

    const cps=f.ch.map(id=>pos[id]).filter(Boolean);
    if(!cps.length) return;
    const xs=cps.map(c=>c.x+NW/2);

    if(cps.length>1)
      g.append("line")
        .attr("x1",Math.min(...xs))
        .attr("x2",Math.max(...xs))
        .attr("y1",jY).attr("y2",jY)
        .attr("stroke","#c0c0c8");

    cps.forEach(cp=>{
      g.append("line")
        .attr("x1",cp.x+NW/2).attr("x2",cp.x+NW/2)
        .attr("y1",jY).attr("y2",cp.y)
        .attr("stroke","#c0c0c8");
    });
  });

  // ── NŒUDS ─────────────────────────────────────────────────
  ids.forEach(id=>{
    const p=P[id], pt=pos[id];
    if(!pt) return;
    const grp=g.append("g")
      .style("cursor","pointer")
      .on("click",()=>location.href="person.html?id="+id);

    grp.append("rect")
      .attr("x",pt.x).attr("y",pt.y)
      .attr("width",NW).attr("height",NH).attr("rx",10)
      .attr("fill",p.dd?"#f2f2f4":"white")
      .attr("stroke","#d1d1d6");

    grp.append("text")
      .attr("x",pt.x+NW/2).attr("y",pt.y+30)
      .attr("text-anchor","middle")
      .attr("font-size",12)
      .text(p.n);

    const inf=getInfo(p);
    if(inf) grp.append("text")
      .attr("x",pt.x+NW/2).attr("y",pt.y+48)
      .attr("text-anchor","middle")
      .attr("font-size",10)
      .attr("fill","#6e6e73")
      .text(inf);
  });
}
``
