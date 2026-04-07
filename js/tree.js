// ============================================================
// ARBRE GÉNÉALOGIQUE — VERSION STABLE ET CORRIGÉE
// ============================================================

// ---------- Utilitaires ----------
function v(x){
  return x && typeof x === "string" && x.trim() ? x : null;
}

function info(p){
  if(!p.bd) return "";
  if(p.dd) return p.bd.split("-")[0] + " – " + p.dd.split("-")[0];
  const t=new Date(), b=new Date(p.bd);
  let a=t.getFullYear() - b.getFullYear();
  if(t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
  return a + " ans";
}

const NW=148, NH=76, HGAP=22, CGAP=10, VGAP=96;

// ============================================================
// Chargement Firestore
// ============================================================

firebase.auth().onAuthStateChanged(async user=>{
  if(!user) return;
  try{
    const snap = await db.collection("persons").get();
    if(snap.empty){
      document.getElementById("loadingMsg").textContent="Aucune personne.";
      return;
    }

    const P={};
    snap.forEach(d=>{
      const x=d.data();
      P[d.id]={
        id:d.id,
        name:(x.firstName||"")+" "+(x.lastName||""),
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

  }catch(e){
    document.getElementById("loadingMsg").textContent="Erreur : "+e.message;
    console.error(e);
  }
});

// ============================================================
// DRAW TREE
// ============================================================

function drawTree(P){

  const ids = Object.keys(P);

  // ------------------------------------------------------------
  // 1. CALCUL DES GÉNÉRATIONS (LOGIQUE CORRIGÉE)
  // ------------------------------------------------------------

  const gen={};
  ids.forEach(id=>gen[id]=undefined);

  // Parents → enfants
  for(let i=0;i<30;i++){
    ids.forEach(id=>{
      if(gen[id]!==undefined) return;
      const fg = P[id].fid && gen[P[id].fid]!==undefined ? gen[P[id].fid] : undefined;
      const mg = P[id].mid && gen[P[id].mid]!==undefined ? gen[P[id].mid] : undefined;
      if(fg!==undefined && mg!==undefined) gen[id]=Math.max(fg,mg)+1;
      else if(fg!==undefined) gen[id]=fg+1;
      else if(mg!==undefined) gen[id]=mg+1;
    });
  }

  // Conjoints
  for(let i=0;i<10;i++){
    ids.forEach(id=>{
      if(gen[id]!==undefined) return;
      const sp=P[id].sid;
      if(sp && gen[sp]!==undefined) gen[id]=gen[sp];
    });
  }

  // Harmonisation conjoints
  for(let i=0;i<10;i++){
    ids.forEach(id=>{
      const sp=P[id].sid;
      if(!sp) return;
      if(gen[id]!==undefined && gen[sp]!==undefined && gen[id]!==gen[sp]){
        const g=Math.max(gen[id],gen[sp]);
        gen[id]=gen[sp]=g;
      }
    });
  }

  // ✅ ENFANTS → PARENTS (FIX DÉFINITIF)
  const parentOf={};
  ids.forEach(id=>{
    const {fid,mid}=P[id];
    if(fid){ (parentOf[fid]??=[]).push(id); }
    if(mid){ (parentOf[mid]??=[]).push(id); }
  });

  for(let i=0;i<10;i++){
    ids.forEach(id=>{
      const kids=parentOf[id];
      if(!kids) return;
      const childGens=kids.map(k=>gen[k]).filter(g=>g!==undefined);
      if(!childGens.length) return;
      const wanted=Math.min(...childGens)-1;
      if(gen[id]===undefined || gen[id]>wanted) gen[id]=wanted;
    });
  }

  ids.forEach(id=>{ if(gen[id]===undefined) gen[id]=0; });

  // ------------------------------------------------------------
  // 2. FAMILLES
  // ------------------------------------------------------------

  const families={};
  ids.forEach(id=>{
    const fid=P[id].fid && P[P[id].fid] ? P[id].fid : null;
    const mid=P[id].mid && P[P[id].mid] ? P[id].mid : null;
    if(!fid && !mid) return;
    const key=(fid||"X")+"##"+(mid||"X");
    if(!families[key]) families[key]={fid,mid,children:[]};
    families[key].children.push(id);
  });

  // ------------------------------------------------------------
  // 3. GROUPES PAR GÉNÉRATION
  // ------------------------------------------------------------

  const byGen={};
  ids.forEach(id=>{
    (byGen[gen[id]]??=[]).push(id);
  });

  const spouseOf={};
  ids.forEach(id=>{
    if(P[id].sid && P[P[id].sid]) spouseOf[id]=P[id].sid;
  });

  const slotsByGen={}, spouseLinks=[], spDone=new Set();
  const gens=Object.keys(byGen).map(Number).sort((a,b)=>a-b);

  gens.forEach(level=>{
    const lvIds=[...byGen[level]];
    const used=new Set(), slots=[];

    lvIds.forEach(id=>{
      if(used.has(id)) return;
      const sp=spouseOf[id];
      if(sp && lvIds.includes(sp) && !used.has(sp)){
        slots.push([id,sp]);
        used.add(id); used.add(sp);
        const k=[id,sp].sort().join("~");
        if(!spDone.has(k)){ spDone.add(k); spouseLinks.push([id,sp]); }
      }else{
        slots.push([id]);
        used.add(id);
      }
    });

    slotsByGen[level]=slots;
  });

  // ------------------------------------------------------------
  // 4. POSITIONS
  // ------------------------------------------------------------

  const pos={};

  gens.forEach(level=>{
    const slots=slotsByGen[level];
    let totalW=0;
    slots.forEach(s=>{ totalW+= (s.length===2 ? NW*2+CGAP : NW); });
    totalW+=(slots.length-1)*HGAP;

    let x=-totalW/2;
    const y=level*(NH+VGAP);

    slots.forEach(s=>{
      if(s.length===2){
        pos[s[0]]={x,y};
        pos[s[1]]={x:x+NW+CGAP,y};
        x+=NW*2+CGAP+HGAP;
      }else{
        pos[s[0]]={x,y};
        x+=NW+HGAP;
      }
    });
  });

  // ------------------------------------------------------------
  // 5. SVG + ZOOM
  // ------------------------------------------------------------

  const wrapper=document.getElementById("tree-container");
  const W=wrapper.clientWidth || window.innerWidth;
  const H=wrapper.clientHeight || window.innerHeight-56;

  d3.select("#tree-container svg").remove();

  const svg=d3.select("#tree-container")
    .append("svg")
    .attr("width",W)
    .attr("height",H)
    .style("background","#f5f5f7");

  const svgG=svg.append("g").attr("transform",`translate(${W/2},40)`);

  svg.call(
    d3.zoom()
      .scaleExtent([0.1,3])
      .on("zoom",e=>svgG.attr("transform",e.transform))
  );

  // ------------------------------------------------------------
  // 6. LIENS CONJOINTS
  // ------------------------------------------------------------

  spouseLinks.forEach(([a,b])=>{
    const pa=pos[a], pb=pos[b];
    if(!pa||!pb) return;
    const y=pa.y+NH/2;
    svgG.append("line")
      .attr("x1",Math.min(pa.x,pb.x)+NW)
      .attr("x2",Math.max(pa.x,pb.x))
      .attr("y1",y).attr("y2",y)
      .attr("stroke","#aaaacc")
      .attr("stroke-dasharray","5,4")
      .attr("stroke-width",1.5);
  });

  // ------------------------------------------------------------
  // 7. LIENS PARENTS → ENFANTS
  // ------------------------------------------------------------

  Object.values(families).forEach(({fid,mid,children})=>{
    const pf=fid?pos[fid]:null, pm=mid?pos[mid]:null;
    if(!pf&&!pm) return;

    const cx=(pf?.x+NW/2 + (pm?.x+NW/2||pf?.x+NW/2))/ (pf&&pm?2:1);
    const py=(pf||pm).y+NH;
    const jy=py+VGAP*0.4;

    [pf,pm].forEach(p=>{
      if(!p) return;
      svgG.append("path")
        .attr("fill","none")
        .attr("stroke","#c0c0c8")
        .attr("stroke-width",1.5)
        .attr("d",`M${p.x+NW/2},${py} V${jy} H${cx}`);
    });

    const cps=children.map(c=>pos[c]).filter(Boolean);
    cps.forEach(cp=>{
      svgG.append("line")
        .attr("x1",cp.x+NW/2)
        .attr("x2",cp.x+NW/2)
        .attr("y1",jy)
        .attr("y2",cp.y)
        .attr("stroke","#c0c0c8")
        .attr("stroke-width",1.5);
    });
  });

  // ------------------------------------------------------------
  // 8. NŒUDS
  // ------------------------------------------------------------

  ids.forEach(id=>{
    const p=P[id], pt=pos[id];
    if(!pt) return;

    const grp=svgG.append("g")
      .style("cursor","pointer")
      .on("click",()=>window.location.href="person.html?id="+id);

    grp.append("rect")
      .attr("x",pt.x).attr("y",pt.y)
      .attr("width",NW).attr("height",NH)
      .attr("rx",10)
      .attr("fill",p.dd?"#f2f2f4":"white")
      .attr("stroke","#d0d0d6");

    grp.append("text")
      .attr("x",pt.x+NW/2)
      .attr("y",pt.y+38)
      .attr("text-anchor","middle")
      .attr("font-size",12)
      .text(p.name);
  });

} // ✅ FIN drawTree()
``
