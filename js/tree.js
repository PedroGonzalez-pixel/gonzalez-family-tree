// ARBRE GÉNÉALOGIQUE v2.4.1
const TREE_VERSION="2.4.1";

function v(x){return x&&typeof x==="string"&&x.trim()?x:null;}
function getInfo(p){
  if(!p.bd)return"";
  if(!p.dd){
    const t=new Date(),b=new Date(p.bd);
    let a=t.getFullYear()-b.getFullYear();
    if(t.getMonth()<b.getMonth()||(t.getMonth()===b.getMonth()&&t.getDate()<b.getDate()))a--;
    return a+" ans";
  }
  return p.bd.split("-")[0]+" – "+p.dd.split("-")[0];
}

const NW=140,NH=72,HGAP=18,CGAP=8,VGAP=90;

// ✅ Décalage vertical déterministe par famille (anti‑confusion)
function familyYOffset(fid, mid){
  const k=(fid||"X")+"##"+(mid||"X");
  let h=0;
  for(let i=0;i<k.length;i++)h+=k.charCodeAt(i);
  return ((h%3)-1)*12; // -12 / 0 / +12 px
}

firebase.auth().onAuthStateChanged(async user=>{
  if(!user)return;
  try{
    const snap=await db.collection("persons").get();
    if(snap.empty){document.getElementById("loadingMsg").textContent="Aucune personne.";return;}
    const P={};
    snap.forEach(d=>{
      const x=d.data();
      P[d.id]={id:d.id,n:(x.firstName||"")+" "+(x.lastName||""),nick:v(x.nickname),
        bd:v(x.birthDate),dd:v(x.deathDate),fid:v(x.fatherId),mid:v(x.motherId),
        sid:v(x.spouseId),photoURL:v(x.photoURL)};
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

  // ── GÉNÉRATIONS ───────────────────────────────────────────
  const gen={};
  ids.forEach(id=>{if(!P[id].fid&&!P[id].mid)gen[id]=0;});
  let changed=true;
  while(changed){
    changed=false;
    ids.forEach(id=>{
      const p=P[id];
      const fg=p.fid&&P[p.fid]?gen[p.fid]:undefined;
      const mg=p.mid&&P[p.mid]?gen[p.mid]:undefined;
      if(p.fid||p.mid){
        let ng=fg!==undefined&&mg!==undefined?Math.max(fg,mg)+1:
               fg!==undefined?fg+1:
               mg!==undefined?mg+1:undefined;
        if(ng!==undefined&&gen[id]!==ng){gen[id]=ng;changed=true;}
      }
      if(p.sid&&P[p.sid]){
        if(!p.fid&&!p.mid&&gen[id]===undefined&&gen[p.sid]!==undefined){gen[id]=gen[p.sid];changed=true;}
        if(!P[p.sid].fid&&!P[p.sid].mid&&gen[p.sid]===undefined&&gen[id]!==undefined){gen[p.sid]=gen[id];changed=true;}
        if(gen[id]!==undefined&&gen[p.sid]!==undefined&&gen[id]!==gen[p.sid]){
          const m=Math.max(gen[id],gen[p.sid]);
          gen[id]=gen[p.sid]=m;
          changed=true;
        }
      }
    });
  }
  ids.forEach(id=>{if(gen[id]===undefined)gen[id]=0;});

  // ── FAMILLES ──────────────────────────────────────────────
  const fams={};
  ids.forEach(id=>{
    const fid=P[id].fid&&P[P[id].fid]?P[id].fid:null;
    const mid=P[id].mid&&P[P[id].mid]?P[id].mid:null;
    if(!fid&&!mid)return;
    const k=(fid||"X")+"##"+(mid||"X");
    if(!fams[k])fams[k]={fid,mid,ch:[]};
    fams[k].ch.push(id);
  });

  // ── POSITIONS ─────────────────────────────────────────────
  const byGen={};
  ids.forEach(id=>{
    if(!byGen[gen[id]])byGen[gen[id]]=[];
    byGen[gen[id]].push(id);
  });

  const pos={};
  Object.keys(byGen).sort((a,b)=>a-b).forEach(g=>{
    const list=byGen[g];
    let tw=list.length*NW+(list.length-1)*HGAP;
    let x=-tw/2, y=+g*(NH+VGAP);
    list.forEach(id=>{
      pos[id]={x,y};
      x+=NW+HGAP;
    });
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
    .attr("fill","#aaaaaa")
    .text("v"+TREE_VERSION);

  const g=svg.append("g")
    .attr("transform",`translate(${W/2},40)`);

  svg.call(d3.zoom()
    .scaleExtent([0.1,3])
    .on("zoom",e=>g.attr("transform",e.transform)));

  // ── LIENS PARENT → ENFANT (corrigés) ──────────────────────
  Object.values(fams).forEach(({fid,mid,ch})=>{
    const pf=fid?pos[fid]:null;
    const pm=mid?pos[mid]:null;
    if(!pf&&!pm)return;

    const fCx=pf?pf.x+NW/2:null;
    const mCx=pm?pm.x+NW/2:null;
    const jX=fCx!==null&&mCx!==null?(fCx+mCx)/2:(fCx||mCx);

    const pY=(pf||pm).y+NH;
    const jY=pY+VGAP*0.4+familyYOffset(fid,mid); // ✅ DÉCALAGE

    if(fCx!==null)
      g.append("path")
        .attr("fill","none")
        .attr("stroke","#c0c0c8")
        .attr("stroke-width",1.5)
        .attr("d",`M${fCx},${pY} V${jY} H${jX}`);

    if(mCx!==null&&mCx!==fCx)
      g.append("path")
        .attr("fill","none")
        .attr("stroke","#c0c0c8")
        .attr("stroke-width",1.5)
        .attr("d",`M${mCx},${pY} V${jY} H${jX}`);

    const cps=ch.map(cid=>pos[cid]).filter(Boolean);
    if(!cps.length)return;

    const cxs=cps.map(cp=>cp.x+NW/2);

    if(cps.length>1){
      g.append("line")
        .attr("x1",Math.min(...cxs))
        .attr("y1",jY)
        .attr("x2",Math.max(...cxs))
        .attr("y2",jY)
        .attr("stroke","#c0c0c8")
        .attr("stroke-width",1.5);
    }

    cps.forEach(cp=>{
      g.append("line")
        .attr("x1",cp.x+NW/2)
        .attr("y1",jY)
        .attr("x2",cp.x+NW/2)
        .attr("y2",cp.y)
        .attr("stroke","#c0c0c8")
        .attr("stroke-width",1.5);
    });
  });
}
``
