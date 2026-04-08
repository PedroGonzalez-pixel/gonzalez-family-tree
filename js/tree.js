// ============================================================
// ARBRE GÉNÉALOGIQUE — code validé visuellement
// ============================================================

function v(x){ return x&&typeof x==="string"&&x.trim()?x:null; }

function info(p){
  if(!p.bd) return "";
  if(p.dd) return p.bd.split("-")[0]+" – "+p.dd.split("-")[0];
  const t=new Date(),b=new Date(p.bd);
  let a=t.getFullYear()-b.getFullYear();
  if(t.getMonth()<b.getMonth()||(t.getMonth()===b.getMonth()&&t.getDate()<b.getDate()))a--;
  return a+" ans";
}

const NW=148, NH=76, HGAP=22, CGAP=10, VGAP=96;

firebase.auth().onAuthStateChanged(async user=>{
  if(!user) return;
  try{
    const snap=await db.collection("persons").get();
    if(snap.empty){ document.getElementById("loadingMsg").textContent="Aucune personne."; return; }
    const P={};
    snap.forEach(d=>{
      const x=d.data();
      P[d.id]={
        id:d.id,
        name:(x.firstName||"")+" "+(x.lastName||""),
        nick:v(x.nickname),
        bd:v(x.birthDate), dd:v(x.deathDate),
        fid:v(x.fatherId), mid:v(x.motherId), sid:v(x.spouseId),
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

function drawTree(P){
  const ids=Object.keys(P);

  // ── 1. Générations ────────────────────────────────────────
  const gen={};
  ids.forEach(id=>{ if(!P[id].fid&&!P[id].mid) gen[id]=0; });
  for(let i=0;i<30;i++){
    ids.forEach(id=>{
      if(gen[id]!==undefined) return;
      const fg=P[id].fid&&P[P[id].fid]?gen[P[id].fid]:undefined;
      const mg=P[id].mid&&P[P[id].mid]?gen[P[id].mid]:undefined;
      if(fg!==undefined&&mg!==undefined) gen[id]=Math.max(fg,mg)+1;
      else if(fg!==undefined) gen[id]=fg+1;
      else if(mg!==undefined) gen[id]=mg+1;
    });
  }
  for(let i=0;i<10;i++){
    ids.forEach(id=>{
      if(gen[id]!==undefined) return;
      const sp=P[id].sid;
      if(sp&&P[sp]&&gen[sp]!==undefined) gen[id]=gen[sp];
    });
  }
  for(let i=0;i<5;i++){
    ids.forEach(id=>{
      const sp=P[id].sid;
      if(!sp||!P[sp]) return;
      if(gen[id]!==undefined&&gen[sp]!==undefined&&gen[id]!==gen[sp])
        gen[id]=gen[sp]=Math.max(gen[id],gen[sp]);
    });
  }
  ids.forEach(id=>{ if(gen[id]===undefined) gen[id]=0; });

  // ── 2. Familles ───────────────────────────────────────────
  const families={};
  ids.forEach(id=>{
    const fid=P[id].fid&&P[P[id].fid]?P[id].fid:null;
    const mid=P[id].mid&&P[P[id].mid]?P[id].mid:null;
    if(!fid&&!mid) return;
    const key=(fid||"X")+"##"+(mid||"X");
    if(!families[key]) families[key]={fid,mid,children:[]};
    families[key].children.push(id);
  });

  // ── 3. Slots par génération ───────────────────────────────
  const byGen={};
  ids.forEach(id=>{
    const g=gen[id];
    if(!byGen[g]) byGen[g]=[];
    if(!byGen[g].includes(id)) byGen[g].push(id);
  });

  const spouseOf={};
  ids.forEach(id=>{ if(P[id].sid&&P[P[id].sid]) spouseOf[id]=P[id].sid; });

  const slotsByGen={};
  const spouseLinks=[];
  const spDone=new Set();
  const sortedGens=Object.keys(byGen).map(Number).sort((a,b)=>a-b);

  sortedGens.forEach(g=>{
    const lvIds=[...byGen[g]];
    const used=new Set();
    const slots=[];

    const withP=lvIds.filter(id=>P[id].fid||P[id].mid);
    const noP=lvIds.filter(id=>!P[id].fid&&!P[id].mid);

    withP.sort((a,b)=>{
      const kA=(P[a].fid||P[a].mid||"");
      const kB=(P[b].fid||P[b].mid||"");
      return kA.localeCompare(kB);
    });

    const addWithSpouse=(id)=>{
      if(used.has(id)) return;
      const sp=spouseOf[id];
      const spInLevel=sp&&lvIds.includes(sp)&&!used.has(sp);
      if(spInLevel){
        slots.push([id,sp]);
        used.add(id); used.add(sp);
        const key=[id,sp].sort().join("~");
        if(!spDone.has(key)){ spDone.add(key); spouseLinks.push([id,sp]); }
      } else {
        // Conjoint est dans noP ? On le fusionne directement
        if(sp&&noP.includes(sp)&&!used.has(sp)){
          slots.push([id,sp]);
          used.add(id); used.add(sp);
          const key=[id,sp].sort().join("~");
          if(!spDone.has(key)){ spDone.add(key); spouseLinks.push([id,sp]); }
        } else {
          slots.push([id]);
          used.add(id);
        }
      }
    };

    withP.forEach(addWithSpouse);

    noP.forEach(id=>{
      if(used.has(id)) return;
      const sp=spouseOf[id];
      if(sp&&lvIds.includes(sp)&&!used.has(sp)){
        slots.push([id,sp]);
        used.add(id); used.add(sp);
        const key=[id,sp].sort().join("~");
        if(!spDone.has(key)){ spDone.add(key); spouseLinks.push([id,sp]); }
      } else {
        slots.push([id]);
        used.add(id);
      }
    });

    slotsByGen[g]=slots;
  });

  // ── 4. Positions ──────────────────────────────────────────
  const pos={};
  sortedGens.forEach(g=>{
    const slots=slotsByGen[g];
    let totalW=0;
    slots.forEach(s=>{ totalW+=s.length===2?NW*2+CGAP:NW; });
    totalW+=(slots.length-1)*HGAP;
    let x=-totalW/2;
    const y=g*(NH+VGAP);
    slots.forEach(slot=>{
      if(slot.length===2){
        pos[slot[0]]={x,y}; pos[slot[1]]={x:x+NW+CGAP,y};
        x+=NW*2+CGAP+HGAP;
      } else {
        pos[slot[0]]={x,y}; x+=NW+HGAP;
      }
    });
  });

  // ── 5. SVG avec D3 zoom/pan ───────────────────────────────
  const wrapper=document.getElementById("tree-container");
  const W=wrapper.clientWidth||window.innerWidth;
  const H=wrapper.clientHeight||window.innerHeight-56;

  d3.select("#tree-container svg").remove();
  const svg=d3.select("#tree-container").append("svg")
    .attr("width",W).attr("height",H).style("background","#f5f5f7");
  const g=svg.append("g").attr("transform",`translate(${W/2},40)`);
  svg.call(d3.zoom().scaleExtent([0.1,3]).on("zoom",e=>g.attr("transform",e.transform)));

  // ── 6. Liens conjoints ────────────────────────────────────
  spouseLinks.forEach(([a,b])=>{
    const pa=pos[a],pb=pos[b]; if(!pa||!pb) return;
    const lx=Math.min(pa.x,pb.x)+NW, rx=Math.max(pa.x,pb.x), y=pa.y+NH/2;
    g.append("line").attr("x1",lx).attr("y1",y).attr("x2",rx).attr("y2",y)
      .attr("stroke","#aaaacc").attr("stroke-width",1.5)
      .attr("stroke-dasharray","5,4").attr("fill","none");
  });

  // ── 7. Liens parent → enfant ──────────────────────────────
  Object.values(families).forEach(({fid,mid,children})=>{
    const pf=fid?pos[fid]:null, pm=mid?pos[mid]:null;
    if(!pf&&!pm) return;
    const fCx=pf?pf.x+NW/2:null, mCx=pm?pm.x+NW/2:null;
    const jX=fCx!==null&&mCx!==null?(fCx+mCx)/2:(fCx||mCx);
    const pY=(pf||pm).y+NH, jY=pY+VGAP*0.4;

    if(fCx!==null)
      g.append("path").attr("fill","none").attr("stroke","#c0c0c8").attr("stroke-width",1.5)
        .attr("d",`M${fCx},${pY} V${jY} H${jX}`);
    if(mCx!==null&&mCx!==fCx)
      g.append("path").attr("fill","none").attr("stroke","#c0c0c8").attr("stroke-width",1.5)
        .attr("d",`M${mCx},${pY} V${jY} H${jX}`);

    const cps=children.map(cid=>pos[cid]).filter(Boolean);
    if(!cps.length) return;
    const cxs=cps.map(cp=>cp.x+NW/2);
    const mnX=Math.min(...cxs,jX), mxX=Math.max(...cxs,jX);
    g.append("line").attr("fill","none").attr("stroke","#c0c0c8").attr("stroke-width",1.5)
      .attr("x1",mnX).attr("y1",jY).attr("x2",mxX).attr("y2",jY);
    cps.forEach(cp=>{
      g.append("line").attr("fill","none").attr("stroke","#c0c0c8").attr("stroke-width",1.5)
        .attr("x1",cp.x+NW/2).attr("y1",jY).attr("x2",cp.x+NW/2).attr("y2",cp.y);
    });
  });

  // ── 8. Nœuds ─────────────────────────────────────────────
  ids.forEach(id=>{
    const p=P[id], pt=pos[id]; if(!pt) return;

    const grp=g.append("g").style("cursor","pointer")
      .on("click",()=>window.location.href="person.html?id="+id)
      .on("mouseenter",function(){ grp.select("rect").attr("stroke","#0071e3").attr("stroke-width",2); })
      .on("mouseleave",function(){ grp.select("rect").attr("stroke",p.dd?"#c8c8cc":"#e0e0e5").attr("stroke-width",1.5); });

    grp.append("rect")
      .attr("x",pt.x).attr("y",pt.y).attr("width",NW).attr("height",NH).attr("rx",10)
      .attr("fill",p.dd?"#f2f2f4":"white")
      .attr("stroke",p.dd?"#c8c8cc":"#e0e0e5").attr("stroke-width",1.5);

    const cx=pt.x+NW/2;
    let ty=pt.y+22;

    // Photo
    if(p.photoURL){
      const cid="cl"+id;
      grp.append("defs").append("clipPath").attr("id",cid)
        .append("circle").attr("cx",cx).attr("cy",pt.y+15).attr("r",12);
      grp.append("image").attr("href",p.photoURL)
        .attr("x",cx-12).attr("y",pt.y+3).attr("width",24).attr("height",24)
        .attr("clip-path",`url(#${cid})`);
      ty=pt.y+38;
    }

    // Nom sur 1 ou 2 lignes
    const words=p.name.trim().split(" ");
    const half=Math.ceil(words.length/2);
    const two=p.name.length>16&&words.length>1;
    const lines=two?[words.slice(0,half).join(" "),words.slice(half).join(" ")]:[p.name.trim()];

    lines.forEach((ln,i)=>{
      grp.append("text").attr("x",cx).attr("y",ty+i*14)
        .attr("text-anchor","middle").attr("font-family","'DM Sans',sans-serif")
        .attr("font-size",12).attr("font-weight",500).attr("fill","#1d1d1f").text(ln);
    });

    let iy=ty+lines.length*14+2;

    if(p.nick){
      grp.append("text").attr("x",cx).attr("y",iy)
        .attr("text-anchor","middle").attr("font-family","'DM Sans',sans-serif")
        .attr("font-size",10).attr("font-style","italic").attr("fill","#6e6e73")
        .text('"'+p.nick+'"');
      iy+=12;
    }

    const inf=info(p);
    if(inf){
      grp.append("text").attr("x",cx).attr("y",iy)
        .attr("text-anchor","middle").attr("font-family","'DM Sans',sans-serif")
        .attr("font-size",10).attr("fill","#6e6e73").text(inf);
    }
  });
}
