// ARBRE GÉNÉALOGIQUE v2.5.0
const TREE_VERSION = "2.5.0";

function v(x){return x && typeof x==="string" && x.trim()?x:null;}

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

const NW=140, NH=72, HGAP=18, CGAP=8, VGAP=90;
const LANE_HEIGHT = 30; // hauteur d’une fratrie (fond + décalage)

firebase.auth().onAuthStateChanged(async user=>{
  if(!user) return;
  try{
    const snap=await db.collection("persons").get();
    if(snap.empty){
      document.getElementById("loadingMsg").textContent="Aucune personne.";
      return;
    }
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
  }catch(e){
    document.getElementById("loadingMsg").textContent="Erreur : "+e.message;
    console.error(e);
  }
});

function drawTree(P){
  const ids=Object.keys(P);

  // ── GÉNÉRATIONS ───────────────────────────────────────────
  const gen={};
  ids.forEach(id=>{ if(!P[id].fid && !P[id].mid) gen[id]=0; });

  let changed=true;
  while(changed){
    changed=false;
    ids.forEach(id=>{
      const p=P[id];
      const fg=p.fid&&P[p.fid]?gen[p.fid]:undefined;
      const mg=p.mid&&P[p.mid]?gen[p.mid]:undefined;

      if(p.fid||p.mid){
        const ng =
          fg!==undefined&&mg!==undefined ? Math.max(fg,mg)+1 :
          fg!==undefined ? fg+1 :
          mg!==undefined ? mg+1 : undefined;
        if(ng!==undefined && gen[id]!==ng){
          gen[id]=ng; changed=true;
        }
      }

      if(p.sid && P[p.sid]){
        if(!p.fid&&!p.mid && gen[id]===undefined && gen[p.sid]!==undefined){
          gen[id]=gen[p.sid]; changed=true;
        }
        if(!P[p.sid].fid&&!P[p.sid].mid && gen[p.sid]===undefined && gen[id]!==undefined){
          gen[p.sid]=gen[id]; changed=true;
        }
        if(gen[id]!==undefined && gen[p.sid]!==undefined && gen[id]!==gen[p.sid]){
          const m=Math.max(gen[id],gen[p.sid]);
          gen[id]=gen[p.sid]=m;
          changed=true;
        }
      }
    });
  }
  ids.forEach(id=>{ if(gen[id]===undefined) gen[id]=0; });

  // ── FAMILLES ──────────────────────────────────────────────
  const fams={};
  ids.forEach(id=>{
    const fid=P[id].fid && P[P[id].fid]?P[id].fid:null;
    const mid=P[id].mid && P[P[id].mid]?P[id].mid:null;
    if(!fid && !mid) return;
    const k=(fid||"X")+"##"+(mid||"X");
    if(!fams[k]) fams[k]={fid,mid,ch:[],key:k};
    fams[k].ch.push(id);
  });

  // ── POSITIONS DES PERSONNES ───────────────────────────────
  const byGen={};
  ids.forEach(id=>{
    if(!byGen[gen[id]]) byGen[gen[id]]=[];
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

  // ── INDEX DES FRATRIES (LANES) PAR GÉNÉRATION ──────────────
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

  const gSvg=svg.append("g").attr("transform",`translate(${W/2},40)`);
  svg.call(d3.zoom().scaleExtent([0.1,3]).on("zoom",e=>gSvg.attr("transform",e.transform)));

  // ── FONDS ALTERNÉS DES FRATRIES ────────────────────────────
  Object.entries(famLanesByGen).forEach(([genKey,famsInGen])=>{
    famsInGen.forEach((f,idx)=>{
      if(idx%2!==0) return; // alterné
      const p=f.fid&&pos[f.fid]?pos[f.fid]:
              f.mid&&pos[f.mid]?pos[f.mid]:null;
      if(!p) return;

      const baseY=p.y+NH+VGAP*0.3;
      const laneY=baseY+idx*LANE_HEIGHT;

      gSvg.append("rect")
        .attr("x",-4000)
        .attr("y",laneY-LANE_HEIGHT/2)
        .attr("width",8000)
        .attr("height",LANE_HEIGHT)
        .attr("fill","#eef0f4")
        .attr("opacity",0.6)
        .lower();
    });
  });

  // ── LIENS PARENTS → ENFANTS ───────────────────────────────
  Object.entries(fams).forEach(([key,{fid,mid,ch}])=>{
    const pf=fid&&pos[fid]?pos[fid]:null;
    const pm=mid&&pos[mid]?pos[mid]:null;
    if(!pf && !pm) return;

    const pBaseY=(pf||pm).y+NH;
    const gen=Math.round((pf||pm).y/(NH+VGAP));
    const famsInGen=famLanesByGen[gen]||[];
    const laneIdx=famsInGen.findIndex(f=>f.key===key);
    const jY=pBaseY+VGAP*0.3+laneIdx*LANE_HEIGHT;

    const fCx=pf?pf.x+NW/2:null;
    const mCx=pm?pm.x+NW/2:null;
    const jX=fCx!==null&&mCx!==null?(fCx+mCx)/2:(fCx||mCx);

    if(fCx!==null)
      gSvg.append("path")
        .attr("d",`M${fCx},${pBaseY} V${jY} H${jX}`)
        .attr("fill","none")
        .attr("stroke","#c0c0c8")
        .attr("stroke-width",1.5);

    if(mCx!==null && mCx!==fCx)
      gSvg.append("path")
        .attr("d",`M${mCx},${pBaseY} V${jY} H${jX}`)
        .attr("fill","none")
        .attr("stroke","#c0c0c8")
        .attr("stroke-width",1.5);

    const cps=ch.map(cid=>pos[cid]).filter(Boolean);
    if(!cps.length) return;

    const cxs=cps.map(cp=>cp.x+NW/2);
    if(cps.length>1){
      gSvg.append("line")
        .attr("x1",Math.min(...cxs))
        .attr("y1",jY)
        .attr("x2",Math.max(...cxs))
        .attr("y2",jY)
        .attr("stroke","#c0c0c8")
        .attr("stroke-width",1.5);
    }

    cps.forEach(cp=>{
      gSvg.append("line")
        .attr("x1",cp.x+NW/2)
        .attr("y1",jY)
        .attr("x2",cp.x+NW/2)
        .attr("y2",cp.y)
        .attr("stroke","#c0c0c8")
        .attr("stroke-width",1.5);
    });
  });

  // ── NŒUDS PERSONNES ───────────────────────────────────────
  ids.forEach(id=>{
    const p=P[id], pt=pos[id];
    if(!pt) return;

    const grp=gSvg.append("g")
      .style("cursor","pointer")
      .on("click",()=>window.location.href="person.html?id="+id)
      .on("mouseenter",()=>grp.select("rect").attr("stroke","#0071e3").attr("stroke-width",2))
      .on("mouseleave",()=>grp.select("rect").attr("stroke",p.dd?"#c8c8cc":"#e0e0e5").attr("stroke-width",1.5));

    grp.append("rect")
      .attr("x",pt.x).attr("y",pt.y)
      .attr("width",NW).attr("height",NH).attr("rx",10)
      .attr("fill",p.dd?"#f2f2f4":"white")
      .attr("stroke",p.dd?"#c8c8cc":"#e0e0e5")
      .attr("stroke-width",1.5);

    const cx=pt.x+NW/2;
    let ty=pt.y+22;

    if(p.photoURL){
      const cid="cl"+id;
      grp.append("defs").append("clipPath").attr("id",cid)
        .append("circle").attr("cx",cx).attr("cy",pt.y+15).attr("r",12);
      grp.append("image")
        .attr("href",p.photoURL)
        .attr("x",cx-12).attr("y",pt.y+3)
        .attr("width",24).attr("height",24)
        .attr("clip-path",`url(#${cid})`);
      ty=pt.y+38;
    }

    const words=p.n.trim().split(" ");
    const two=p.n.length>16&&words.length>1;
    const half=Math.ceil(words.length/2);
    const lines=two?[words.slice(0,half).join(" "),words.slice(half).join(" ")]:[p.n];

    lines.forEach((ln,i)=>{
      grp.append("text")
        .attr("x",cx).attr("y",ty+i*14)
        .attr("text-anchor","middle")
        .attr("font-size",12)
        .attr("font-weight",500)
        .text(ln);
    });

    let iy=ty+lines.length*14+2;

    if(p.nick){
      grp.append("text")
        .attr("x",cx).attr("y",iy)
        .attr("text-anchor","middle")
        .attr("font-size",10)
        .attr("font-style","italic")
        .attr("fill","#6e6e73")
        .text(`"${p.nick}"`);
      iy+=12;
    }

    const inf=getInfo(p);
    if(inf){
      grp.append("text")
        .attr("x",cx).attr("y",iy)
        .attr("text-anchor","middle")
        .attr("font-size",10)
        .attr("fill","#6e6e73")
        .text(inf);
    }
  });
}
``
