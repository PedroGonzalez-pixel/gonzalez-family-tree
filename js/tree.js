// ARBRE GÉNÉALOGIQUE v3.0.0
// Placement hiérarchique : enfants centrés sous leurs parents
const TREE_VERSION = "3.0.0";

function v(x){ return x && typeof x === "string" && x.trim() ? x : null; }

function getInfo(p){
  if(!p.bd) return "";
  if(!p.dd){
    const t=new Date(), b=new Date(p.bd);
    let a=t.getFullYear()-b.getFullYear();
    if(t.getMonth()<b.getMonth()||(t.getMonth()===b.getMonth()&&t.getDate()<b.getDate()))a--;
    return a+" ans";
  }
  return p.bd.split("-")[0]+" – "+p.dd.split("-")[0];
}

const NW=140, NH=72, HGAP=20, CGAP=8, VGAP=100;

firebase.auth().onAuthStateChanged(async user=>{
  if(!user) return;
  const snap=await db.collection("persons").get();
  if(snap.empty){ document.getElementById("loadingMsg").textContent="Aucune personne."; return; }
  const P={};
  snap.forEach(d=>{
    const x=d.data();
    P[d.id]={id:d.id, n:(x.firstName||"")+" "+(x.lastName||""),
      nick:v(x.nickname), bd:v(x.birthDate), dd:v(x.deathDate),
      fid:v(x.fatherId), mid:v(x.motherId), sid:v(x.spouseId), photoURL:v(x.photoURL)};
  });
  document.getElementById("loadingMsg").style.display="none";
  document.getElementById("tree-container").style.display="block";
  drawTree(P);
});

function drawTree(P){
  const ids=Object.keys(P);

  // ── 1. GÉNÉRATIONS ────────────────────────────────────────
  const gen={};
  ids.forEach(id=>{ if(!P[id].fid&&!P[id].mid) gen[id]=0; });
  let changed=true;
  while(changed){
    changed=false;
    ids.forEach(id=>{
      const p=P[id];
      const fg=p.fid&&P[p.fid]?gen[p.fid]:undefined;
      const mg=p.mid&&P[p.mid]?gen[p.mid]:undefined;
      if(fg!==undefined||mg!==undefined){
        const ng=Math.max(fg!==undefined?fg:-1,mg!==undefined?mg:-1)+1;
        if(gen[id]!==ng){gen[id]=ng;changed=true;}
      }
      if(p.sid&&P[p.sid]){
        if(gen[id]!==undefined&&gen[p.sid]!==undefined&&gen[id]!==gen[p.sid]){
          const m=Math.max(gen[id],gen[p.sid]);gen[id]=gen[p.sid]=m;changed=true;
        }
        if(gen[id]===undefined&&gen[p.sid]!==undefined){gen[id]=gen[p.sid];changed=true;}
        if(gen[p.sid]===undefined&&gen[id]!==undefined){gen[p.sid]=gen[id];changed=true;}
      }
    });
  }
  ids.forEach(id=>{ if(gen[id]===undefined) gen[id]=0; });

  // ── 2. FAMILLES ───────────────────────────────────────────
  const fams={};
  ids.forEach(id=>{
    const fid=P[id].fid&&P[P[id].fid]?P[id].fid:null;
    const mid=P[id].mid&&P[P[id].mid]?P[id].mid:null;
    if(!fid&&!mid) return;
    const k=(fid||"X")+"##"+(mid||"X");
    if(!fams[k]) fams[k]={fid,mid,ch:[]};
    fams[k].ch.push(id);
  });

  // ── 3. CONJOINTS ──────────────────────────────────────────
  const spouseOf={};
  ids.forEach(id=>{ if(P[id].sid&&P[P[id].sid]) spouseOf[id]=P[id].sid; });

  // ── 4. CALCUL LARGEUR DES SOUS-ARBRES ─────────────────────
  // Pour chaque "propriétaire" de couple (le plus petit id du couple),
  // on calcule la largeur minimale nécessaire pour placer tous ses descendants
  const subtreeW={};

  function calcWidth(owner){
    if(subtreeW[owner]!==undefined) return subtreeW[owner];

    const partner=spouseOf[owner];

    // Enfants de ce couple
    let children=[];
    ids.forEach(cid=>{
      const cfid=P[cid].fid, cmid=P[cid].mid;
      if(partner){
        if((cfid===owner||cmid===owner)&&(cfid===partner||cmid===partner))
          children.push(cid);
      } else {
        if((cfid===owner&&!cmid)||(cmid===owner&&!cfid))
          children.push(cid);
      }
    });
    children=[...new Set(children)];

    // Largeur propre du couple
    const myW=partner?NW*2+CGAP:NW;

    if(children.length===0){
      subtreeW[owner]=myW;
      if(partner) subtreeW[partner]=myW;
      return myW;
    }

    // Largeur totale des enfants (en évitant les doublons de couples)
    let childTotalW=0;
    const seen=new Set();
    children.forEach(cid=>{
      const csp=spouseOf[cid];
      const co=csp&&cid>csp?csp:cid;
      if(seen.has(co)) return;
      seen.add(co);
      childTotalW+=calcWidth(co)+(childTotalW>0?HGAP:0);
    });

    const w=Math.max(myW, childTotalW);
    subtreeW[owner]=w;
    if(partner) subtreeW[partner]=w;
    return w;
  }

  ids.forEach(id=>{
    const sp=spouseOf[id];
    const owner=sp&&id>sp?sp:id;
    calcWidth(owner);
  });

  // ── 5. PLACEMENT DES NŒUDS ────────────────────────────────
  const pos={};
  const placed=new Set();

  function placeCouple(owner, cx, y){
    const partner=spouseOf[owner];
    if(partner&&P[partner]){
      pos[owner]={x:cx-NW-CGAP/2, y};
      pos[partner]={x:cx+CGAP/2, y};
      placed.add(owner); placed.add(partner);
    } else {
      pos[owner]={x:cx-NW/2, y};
      placed.add(owner);
    }
  }

  function placeSubtree(owner, cx, y){
    if(placed.has(owner)) return;
    const partner=spouseOf[owner];
    if(partner&&placed.has(partner)) return;

    // Enfants de ce couple
    let children=[];
    ids.forEach(cid=>{
      if(placed.has(cid)) return;
      const cfid=P[cid].fid, cmid=P[cid].mid;
      if(partner){
        if((cfid===owner||cmid===owner)&&(cfid===partner||cmid===partner))
          children.push(cid);
      } else {
        if((cfid===owner&&!cmid)||(cmid===owner&&!cfid))
          children.push(cid);
      }
    });
    children=[...new Set(children)];

    if(children.length===0){
      placeCouple(owner, cx, y);
      return;
    }

    // Trouver les propriétaires des enfants (sans doublons)
    const childOwners=[];
    const seen=new Set();
    children.forEach(cid=>{
      const csp=spouseOf[cid];
      const co=csp&&cid>csp?csp:cid;
      if(!seen.has(co)){seen.add(co);childOwners.push(co);}
    });

    // Largeur totale des enfants
    let totalW=0;
    childOwners.forEach((co,i)=>{ totalW+=calcWidth(co)+(i>0?HGAP:0); });

    // Placer les enfants
    let startX=cx-totalW/2;
    childOwners.forEach(co=>{
      const w=calcWidth(co);
      placeSubtree(co, startX+w/2, y+NH+VGAP);
      startX+=w+HGAP;
    });

    // Centrer les parents sur leurs enfants placés
    const childCxs=children.map(cid=>pos[cid]).filter(Boolean).map(p=>p.x+NW/2);
    const childCenter=childCxs.length>0
      ?(Math.min(...childCxs)+Math.max(...childCxs))/2
      :cx;
    placeCouple(owner, childCenter, y);
  }

  // Racines
  const roots=ids.filter(id=>gen[id]===0&&!P[id].fid&&!P[id].mid);
  const rootOwners=[];
  const rootSeen=new Set();
  roots.forEach(id=>{
    const sp=spouseOf[id];
    const owner=sp&&id>sp?sp:id;
    if(!rootSeen.has(owner)){rootSeen.add(owner);rootOwners.push(owner);}
  });

  let totalRootW=0;
  rootOwners.forEach((ro,i)=>{ totalRootW+=calcWidth(ro)+(i>0?HGAP:0); });

  let rootX=-totalRootW/2;
  rootOwners.forEach(ro=>{
    const w=calcWidth(ro);
    placeSubtree(ro, rootX+w/2, 0);
    rootX+=w+HGAP;
  });

  // Fallback pour non placés
  ids.forEach(id=>{
    if(!placed.has(id)){
      pos[id]={x:0, y:gen[id]*(NH+VGAP)};
      placed.add(id);
    }
  });

  // ── 6. SVG + ZOOM ─────────────────────────────────────────
  const wrapper=document.getElementById("tree-container");
  const W=wrapper.clientWidth||window.innerWidth;
  const H=wrapper.clientHeight||window.innerHeight-56;

  d3.select("#tree-container svg").remove();
  const svg=d3.select("#tree-container").append("svg")
    .attr("width",W).attr("height",H).style("background","#f5f5f7");

  svg.append("text").attr("x",10).attr("y",18)
    .attr("font-size",10).attr("fill","#aaa")
    .attr("font-family","'DM Sans',sans-serif")
    .text("v"+TREE_VERSION);

  const g=svg.append("g").attr("transform",`translate(${W/2},40)`);
  svg.call(d3.zoom().scaleExtent([0.1,3]).on("zoom",e=>g.attr("transform",e.transform)));

  // ── 7. LIENS CONJOINTS ────────────────────────────────────
  const spDone=new Set();
  ids.forEach(id=>{
    const sp=spouseOf[id]; if(!sp) return;
    const k=[id,sp].sort().join("~"); if(spDone.has(k)) return; spDone.add(k);
    const pa=pos[id], pb=pos[sp]; if(!pa||!pb) return;
    const lx=Math.min(pa.x,pb.x)+NW, rx=Math.max(pa.x,pb.x), y=pa.y+NH/2;
    g.append("line").attr("x1",lx).attr("y1",y).attr("x2",rx).attr("y2",y)
      .attr("stroke","#aaaacc").attr("stroke-width",1.5)
      .attr("stroke-dasharray","5,4").attr("fill","none");
  });

  // ── 8. LIENS PARENT → ENFANT ──────────────────────────────
  Object.values(fams).forEach(({fid,mid,ch})=>{
    const pf=fid?pos[fid]:null, pm=mid?pos[mid]:null;
    if(!pf&&!pm) return;
    const fCx=pf?pf.x+NW/2:null, mCx=pm?pm.x+NW/2:null;
    const jX=fCx!==null&&mCx!==null?(fCx+mCx)/2:(fCx||mCx);
    const pY=(pf||pm).y+NH, jY=pY+VGAP*0.35;

    if(fCx!==null)
      g.append("path").attr("fill","none").attr("stroke","#c0c0c8").attr("stroke-width",1.5)
        .attr("d",`M${fCx},${pY} V${jY} H${jX}`);
    if(mCx!==null&&mCx!==fCx)
      g.append("path").attr("fill","none").attr("stroke","#c0c0c8").attr("stroke-width",1.5)
        .attr("d",`M${mCx},${pY} V${jY} H${jX}`);

    const cps=ch.map(cid=>pos[cid]).filter(Boolean);
    if(!cps.length) return;
    const cxs=cps.map(cp=>cp.x+NW/2);
    const mnX=Math.min(...cxs), mxX=Math.max(...cxs);

    if(cps.length===1){
      g.append("line").attr("fill","none").attr("stroke","#c0c0c8").attr("stroke-width",1.5)
        .attr("x1",jX).attr("y1",jY).attr("x2",cxs[0]).attr("y2",jY);
    } else {
      g.append("line").attr("fill","none").attr("stroke","#c0c0c8").attr("stroke-width",1.5)
        .attr("x1",mnX).attr("y1",jY).attr("x2",mxX).attr("y2",jY);
      if(jX<mnX)
        g.append("line").attr("fill","none").attr("stroke","#c0c0c8").attr("stroke-width",1.5)
          .attr("x1",jX).attr("y1",jY).attr("x2",mnX).attr("y2",jY);
      else if(jX>mxX)
        g.append("line").attr("fill","none").attr("stroke","#c0c0c8").attr("stroke-width",1.5)
          .attr("x1",mxX).attr("y1",jY).attr("x2",jX).attr("y2",jY);
    }

    cps.forEach(cp=>{
      g.append("line").attr("fill","none").attr("stroke","#c0c0c8").attr("stroke-width",1.5)
        .attr("x1",cp.x+NW/2).attr("y1",jY).attr("x2",cp.x+NW/2).attr("y2",cp.y);
    });
  });

  // ── 9. NŒUDS ─────────────────────────────────────────────
  ids.forEach(id=>{
    const p=P[id], pt=pos[id]; if(!pt) return;

    const grp=g.append("g").style("cursor","pointer")
      .on("click",()=>location.href="person.html?id="+id)
      .on("mouseenter",function(){grp.select("rect").attr("stroke","#0071e3").attr("stroke-width",2);})
      .on("mouseleave",function(){grp.select("rect").attr("stroke",p.dd?"#c8c8cc":"#d1d1d6").attr("stroke-width",1.5);});

    grp.append("rect")
      .attr("x",pt.x).attr("y",pt.y).attr("width",NW).attr("height",NH).attr("rx",10)
      .attr("fill",p.dd?"#f2f2f4":"white").attr("stroke",p.dd?"#c8c8cc":"#d1d1d6").attr("stroke-width",1.5);

    const cx=pt.x+NW/2;
    let ty=pt.y+22;

    if(p.photoURL){
      const cid="cl"+id;
      grp.append("defs").append("clipPath").attr("id",cid)
        .append("circle").attr("cx",cx).attr("cy",pt.y+15).attr("r",12);
      grp.append("image").attr("href",p.photoURL)
        .attr("x",cx-12).attr("y",pt.y+3).attr("width",24).attr("height",24)
        .attr("clip-path",`url(#${cid})`);
      ty=pt.y+38;
    }

    const words=p.n.trim().split(" ");
    const half=Math.ceil(words.length/2);
    const two=p.n.length>16&&words.length>1;
    const lines=two?[words.slice(0,half).join(" "),words.slice(half).join(" ")]:[p.n.trim()];

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

    const inf=getInfo(p);
    if(inf){
      grp.append("text").attr("x",cx).attr("y",iy)
        .attr("text-anchor","middle").attr("font-family","'DM Sans',sans-serif")
        .attr("font-size",10).attr("fill","#6e6e73").text(inf);
    }
  });
}
