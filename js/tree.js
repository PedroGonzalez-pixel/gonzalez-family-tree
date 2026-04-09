// ARBRE GÉNÉALOGIQUE v2.4.0
const TREE_VERSION="2.4.0";

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
  }catch(e){document.getElementById("loadingMsg").textContent="Erreur : "+e.message;console.error(e);}
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
        let ng=fg!==undefined&&mg!==undefined?Math.max(fg,mg)+1:fg!==undefined?fg+1:mg!==undefined?mg+1:undefined;
        if(ng!==undefined&&gen[id]!==ng){gen[id]=ng;changed=true;}
      }
      if(p.sid&&P[p.sid]){
        if(!p.fid&&!p.mid&&gen[id]===undefined&&gen[p.sid]!==undefined){gen[id]=gen[p.sid];changed=true;}
        if(!P[p.sid].fid&&!P[p.sid].mid&&gen[p.sid]===undefined&&gen[id]!==undefined){gen[p.sid]=gen[id];changed=true;}
        if(gen[id]!==undefined&&gen[p.sid]!==undefined&&gen[id]!==gen[p.sid]){
          const m=Math.max(gen[id],gen[p.sid]);gen[id]=gen[p.sid]=m;changed=true;
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

  // ── SLOTS ─────────────────────────────────────────────────
  const byGen={};
  ids.forEach(id=>{if(!byGen[gen[id]])byGen[gen[id]]=[];if(!byGen[gen[id]].includes(id))byGen[gen[id]].push(id);});

  const spouseOf={};
  ids.forEach(id=>{if(P[id].sid&&P[P[id].sid])spouseOf[id]=P[id].sid;});

  const slotsByGen={};
  const spLinks=[];
  const spDone=new Set();

  Object.keys(byGen).sort((a,b)=>a-b).forEach(g=>{
    const lvIds=[...byGen[g]];
    const used=new Set();
    const slots=[];
    const withP=lvIds.filter(id=>P[id].fid||P[id].mid);
    const noP=lvIds.filter(id=>!P[id].fid&&!P[id].mid);
    withP.sort((a,b)=>(P[a].fid||P[a].mid||"").localeCompare(P[b].fid||P[b].mid||""));

    const add=(id)=>{
      if(used.has(id))return;
      const sp=spouseOf[id];
      if(sp&&(lvIds.includes(sp)||noP.includes(sp))&&!used.has(sp)){
        slots.push([id,sp]);used.add(id);used.add(sp);
        const k=[id,sp].sort().join("~");
        if(!spDone.has(k)){spDone.add(k);spLinks.push([id,sp]);}
      }else{slots.push([id]);used.add(id);}
    };
    withP.forEach(add);
    noP.forEach(id=>{
      if(used.has(id))return;
      const sp=spouseOf[id];
      if(sp&&lvIds.includes(sp)&&!used.has(sp)){
        slots.push([id,sp]);used.add(id);used.add(sp);
        const k=[id,sp].sort().join("~");
        if(!spDone.has(k)){spDone.add(k);spLinks.push([id,sp]);}
      }else{slots.push([id]);used.add(id);}
    });
    slotsByGen[g]=slots;
  });

  // ── POSITIONS ─────────────────────────────────────────────
  const pos={};
  Object.keys(slotsByGen).sort((a,b)=>a-b).forEach(g=>{
    const slots=slotsByGen[g];
    let tw=0;
    slots.forEach(s=>{tw+=s.length===2?NW*2+CGAP:NW;});
    tw+=(slots.length-1)*HGAP;
    let x=-tw/2;
    const y=+g*(NH+VGAP);
    slots.forEach(s=>{
      if(s.length===2){pos[s[0]]={x,y};pos[s[1]]={x:x+NW+CGAP,y};x+=NW*2+CGAP+HGAP;}
      else{pos[s[0]]={x,y};x+=NW+HGAP;}
    });
  });

  // ── SVG ───────────────────────────────────────────────────
  const wrapper=document.getElementById("tree-container");
  const W=wrapper.clientWidth||window.innerWidth;
  const H=wrapper.clientHeight||window.innerHeight-56;
  d3.select("#tree-container svg").remove();
  const svg=d3.select("#tree-container").append("svg").attr("width",W).attr("height",H).style("background","#f5f5f7");

  svg.append("text").attr("x",10).attr("y",18).attr("font-size",10).attr("fill","#aaaaaa")
    .attr("font-family","'DM Sans',sans-serif").text("v"+TREE_VERSION);

  const g=svg.append("g").attr("transform",`translate(${W/2},40)`);
  svg.call(d3.zoom().scaleExtent([0.1,3]).on("zoom",e=>g.attr("transform",e.transform)));

  // ── LIENS CONJOINTS ───────────────────────────────────────
  spLinks.forEach(([a,b])=>{
    const pa=pos[a],pb=pos[b];if(!pa||!pb)return;
    const lx=Math.min(pa.x,pb.x)+NW,rx=Math.max(pa.x,pb.x),y=pa.y+NH/2;
    g.append("line").attr("x1",lx).attr("y1",y).attr("x2",rx).attr("y2",y)
      .attr("stroke","#aaaacc").attr("stroke-width",1.5).attr("stroke-dasharray","5,4").attr("fill","none");
  });

  // ── LIENS PARENT→ENFANT ───────────────────────────────────
  Object.values(fams).forEach(({fid,mid,ch})=>{
    const pf=fid?pos[fid]:null,pm=mid?pos[mid]:null;
    if(!pf&&!pm)return;
    const fCx=pf?pf.x+NW/2:null,mCx=pm?pm.x+NW/2:null;
    const jX=fCx!==null&&mCx!==null?(fCx+mCx)/2:(fCx||mCx);
    const pY=(pf||pm).y+NH,jY=pY+VGAP*0.4;

    if(fCx!==null)
      g.append("path").attr("fill","none").attr("stroke","#c0c0c8").attr("stroke-width",1.5)
        .attr("d",`M${fCx},${pY} V${jY} H${jX}`);
    if(mCx!==null&&mCx!==fCx)
      g.append("path").attr("fill","none").attr("stroke","#c0c0c8").attr("stroke-width",1.5)
        .attr("d",`M${mCx},${pY} V${jY} H${jX}`);

    const cps=ch.map(cid=>pos[cid]).filter(Boolean);
    if(!cps.length)return;
    const cxs=cps.map(cp=>cp.x+NW/2);

    if(cps.length===1){
      // Un seul enfant : ligne directe
      g.append("line").attr("fill","none").attr("stroke","#c0c0c8").attr("stroke-width",1.5)
        .attr("x1",jX).attr("y1",jY).attr("x2",cxs[0]).attr("y2",jY);
    }else{
      // Plusieurs enfants : barre UNIQUEMENT entre min et max des enfants de CETTE famille
      g.append("line").attr("fill","none").attr("stroke","#c0c0c8").attr("stroke-width",1.5)
        .attr("x1",Math.min(...cxs)).attr("y1",jY).attr("x2",Math.max(...cxs)).attr("y2",jY);
      // Relier jX à la barre
      const clamp=Math.max(Math.min(...cxs),Math.min(Math.max(...cxs),jX));
      if(Math.abs(jX-clamp)>1)
        g.append("line").attr("fill","none").attr("stroke","#c0c0c8").attr("stroke-width",1.5)
          .attr("x1",jX).attr("y1",jY).attr("x2",clamp).attr("y2",jY);
    }

    cps.forEach(cp=>{
      g.append("line").attr("fill","none").attr("stroke","#c0c0c8").attr("stroke-width",1.5)
        .attr("x1",cp.x+NW/2).attr("y1",jY).attr("x2",cp.x+NW/2).attr("y2",cp.y);
    });
  });

  // ── NOEUDS ────────────────────────────────────────────────
  ids.forEach(id=>{
    const p=P[id],pt=pos[id];if(!pt)return;
    const grp=g.append("g").style("cursor","pointer")
      .on("click",()=>window.location.href="person.html?id="+id)
      .on("mouseenter",function(){grp.select("rect").attr("stroke","#0071e3").attr("stroke-width",2);})
      .on("mouseleave",function(){grp.select("rect").attr("stroke",p.dd?"#c8c8cc":"#e0e0e5").attr("stroke-width",1.5);});

    grp.append("rect").attr("x",pt.x).attr("y",pt.y).attr("width",NW).attr("height",NH).attr("rx",10)
      .attr("fill",p.dd?"#f2f2f4":"white").attr("stroke",p.dd?"#c8c8cc":"#e0e0e5").attr("stroke-width",1.5);

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
      grp.append("text").attr("x",cx).attr("y",ty+i*14).attr("text-anchor","middle")
        .attr("font-family","'DM Sans',sans-serif").attr("font-size",12).attr("font-weight",500)
        .attr("fill","#1d1d1f").text(ln);
    });

    let iy=ty+lines.length*14+2;

    if(p.nick){
      grp.append("text").attr("x",cx).attr("y",iy).attr("text-anchor","middle")
        .attr("font-family","'DM Sans',sans-serif").attr("font-size",10)
        .attr("font-style","italic").attr("fill","#6e6e73").text('"'+p.nick+'"');
      iy+=12;
    }

    const inf=getInfo(p);
    if(inf){
      grp.append("text").attr("x",cx).attr("y",iy).attr("text-anchor","middle")
        .attr("font-family","'DM Sans',sans-serif").attr("font-size",10)
        .attr("fill","#6e6e73").text(inf);
    }
  });
}
