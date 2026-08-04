// ARBRE GÉNÉALOGIQUE v4.3.0 — MARIAGES SÉPARÉS + CODE COULEUR
// - Badges M1, M2, M3... sur les conjoints
// - Code couleur par mariage
// - Enfants séparés horizontalement par mariage
// - Lignes distinctes par mariage

const TREE_VERSION = "4.3.0";

const MARRIAGE_COLORS = [
  "#FF6B6B", // M1 - Rouge
  "#4ECDC4", // M2 - Teal
  "#95E1D3", // M3 - Menthe
  "#FFE66D", // M4 - Jaune
  "#A8E6CF"  // M5 - Vert clair
];

function v(x){ return x&&typeof x==="string"&&x.trim()?x:null; }

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
const HALF_VGAP = VGAP / 2;

let _svg=null, _zoom=null, _W=0, _H=0;
let _g=null;
let _P={};
let _pos={};
let _marriages={}; // Marriages par personne
let _spouseOf={};

let draggedId=null;
let dragStartX=0, dragStartY=0;

window.treeResetView = function() {
  if (_svg && _zoom) {
    _svg.transition().duration(500)
      .call(_zoom.transform, d3.zoomIdentity.translate(_W/2, 40));
  }
};

function savePositions(){
  const positions={};
  Object.entries(_pos).forEach(([id, p])=>{
    positions[id]={x: p.x, y: p.y};
  });
  localStorage.setItem("treePositions4.0", JSON.stringify(positions));
}

function loadSavedPositions(){
  const stored=localStorage.getItem("treePositions4.0");
  return stored ? JSON.parse(stored) : null;
}

function exportPositions(){
  const positions={};
  Object.entries(_pos).forEach(([id, p])=>{
    positions[id]={x: p.x, y: p.y};
  });
  const data={
    version: "4.0",
    timestamp: new Date().toISOString(),
    positions: positions
  };
  const blob=new Blob([JSON.stringify(data, null, 2)], {type: "application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=`tree-layout-${new Date().getTime()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importPositions(){
  const input=document.createElement("input");
  input.type="file";
  input.accept=".json";
  input.addEventListener("change", (e)=>{
    const file=e.target.files[0];
    if(!file) return;
    const reader=new FileReader();
    reader.onload=(ev)=>{
      try{
        const data=JSON.parse(ev.target.result);
        if(data.positions){
          localStorage.setItem("treePositions4.0", JSON.stringify(data.positions));
          location.reload();
        }
      }catch(err){
        alert("Erreur : JSON invalide");
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

function resetPositions(){
  if(confirm("Réinitialiser toutes les positions ?")){
    localStorage.removeItem("treePositions4.0");
    location.reload();
  }
}

function addControls(){
  const container=document.getElementById("tree-container");
  if(container.querySelector("#tree-controls")) return;
  
  const controls=document.createElement("div");
  controls.id="tree-controls";
  controls.style.cssText=`
    position: absolute;
    bottom: 10px;
    left: 10px;
    z-index: 100;
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    background: rgba(255,255,255,0.95);
    padding: 8px;
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  `;
  
  const buttons=[
    {id: "resetBtn", labelFr: "🔄 Réinitialiser", labelEn: "🔄 Reset", onclick: resetPositions},
    {id: "saveBtn", labelFr: "💾 Exporter", labelEn: "💾 Save", onclick: exportPositions},
    {id: "loadBtn", labelFr: "📂 Importer", labelEn: "📂 Load", onclick: importPositions}
  ];
  
  buttons.forEach(btn=>{
    const button=document.createElement("button");
    button.id=btn.id;
    button.dataset.labelFr=btn.labelFr;
    button.dataset.labelEn=btn.labelEn;
    
    const currentLang=window.currentLang || "fr";
    button.textContent=currentLang==="fr" ? btn.labelFr : btn.labelEn;
    
    button.style.cssText=`
      padding: 6px 10px;
      background: white;
      border: 1px solid #ccc;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      font-family: 'DM Sans', sans-serif;
      white-space: nowrap;
    `;
    button.onmouseover=()=>button.style.background="#f5f5f5";
    button.onmouseout=()=>button.style.background="white";
    button.onclick=btn.onclick;
    controls.appendChild(button);
  });
  
  container.appendChild(controls);
  
  const origSetLang=window.setLang;
  window.setLang=function(lang){
    if(origSetLang) origSetLang(lang);
    updateControlsLanguage(lang);
  };
}

function updateControlsLanguage(lang){
  const controls=document.getElementById("tree-controls");
  if(!controls) return;
  
  const buttons=controls.querySelectorAll("button");
  buttons.forEach(btn=>{
    const key=lang==="fr" ? "labelFr" : "labelEn";
    btn.textContent=btn.dataset[key] || btn.textContent;
  });
}

firebase.auth().onAuthStateChanged(async user=>{
  if(!user) return;
  const snap=await db.collection("persons").get();
  if(snap.empty){
    document.getElementById("loadingMsg").textContent="Aucune personne.";
    return;
  }
  
  _P={};
  snap.forEach(d=>{
    const x=d.data();
    _P[d.id]={
      id:d.id,
      n:(x.firstName||"")+" "+(x.lastName||""),
      nick:v(x.nickname),
      bd:v(x.birthDate),
      dd:v(x.deathDate),
      fid:v(x.fatherId),
      mid:v(x.motherId),
      sid:v(x.spouseId),
      spouses: x.spouses || [],
      hasPhoto:!!(v(x.photoURL))
    };
  });
  
  document.getElementById("loadingMsg").style.display="none";
  document.getElementById("tree-container").style.display="block";
  
  addControls();
  drawTree(_P);
});

function drawTree(P){
  _P=P;
  const ids=Object.keys(P);

  // ── GÉNÉRATIONS ──────────────────────────
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

  // ── MARIAGES PAR PERSONNE ────────────────
  _marriages={};
  ids.forEach(id=>{
    const p=P[id];
    if(!p.spouses || p.spouses.length===0) return;
    
    _marriages[id]=[];
    p.spouses.forEach((spouse, idx)=>{
      if(!P[spouse.spouseId]) return;
      _marriages[id].push({
        number: idx+1,
        spouseId: spouse.spouseId,
        color: MARRIAGE_COLORS[idx % MARRIAGE_COLORS.length],
        children: []
      });
    });
  });
  
  // Assigner enfants aux mariages
  ids.forEach(cid=>{
    const child=P[cid];
    if(!child.fid && !child.mid) return;
    
    // Enfant de qui ?
    if(child.fid && _marriages[child.fid]){
      const marriages=_marriages[child.fid];
      marriages.forEach(m=>{
        if(m.spouseId===child.mid || (!child.mid && m.number===1)){
          m.children.push(cid);
        }
      });
    }
    if(child.mid && _marriages[child.mid]){
      const marriages=_marriages[child.mid];
      marriages.forEach(m=>{
        if(m.spouseId===child.fid || (!child.fid && m.number===1)){
          if(!m.children.includes(cid)) m.children.push(cid);
        }
      });
    }
  });

  // ── CONJOINTS ────────────────────────────
  _spouseOf={};
  ids.forEach(id=>{
    const p=P[id];
    if(p.spouses && p.spouses.length>0){
      let activeSpouse=p.spouses.find(s => !s.endReason);
      if(!activeSpouse) activeSpouse=p.spouses[p.spouses.length-1];
      if(activeSpouse && P[activeSpouse.spouseId]) _spouseOf[id]=activeSpouse.spouseId;
    }
    if(!_spouseOf[id] && p.sid && P[p.sid]) _spouseOf[id]=p.sid;
  });

  // ── PLACEMENT ────────────────────────────
  _pos={};
  const placed=new Set();

  function placeCouple(owner,cx,y){
    const partner=_spouseOf[owner];
    if(partner&&P[partner]){
      _pos[owner]={x:cx-NW-CGAP/2,y}; 
      _pos[partner]={x:cx+CGAP/2,y};
      placed.add(owner); 
      placed.add(partner);
    }else{ 
      _pos[owner]={x:cx-NW/2,y}; 
      placed.add(owner); 
    }
  }

  function placeSubtree(owner,cx,y){
    if(placed.has(owner)) return;
    const partner=_spouseOf[owner];
    if(partner&&placed.has(partner)) return;

    // ✅ FIX v4.3 : Placer par MARIAGE
    if(_marriages[owner] && _marriages[owner].length>0){
      let currentY=y+NH;
      _marriages[owner].forEach((marriage, mIdx)=>{
        const children=marriage.children;
        if(children.length===0) return;
        
        // Placer les enfants de ce mariage
        const childOwners=[];
        const seen=new Set();
        children.forEach(cid=>{
          const csp=_spouseOf[cid];
          const co=csp&&cid>csp?csp:cid;
          if(!seen.has(co)){seen.add(co); childOwners.push(co);}
        });
        
        let totalW=0;
        childOwners.forEach((co,i)=>{
          const w=calcWidth(co);
          totalW+=w+(i>0?HGAP:0);
        });
        let startX=cx-totalW/2;
        
        childOwners.forEach((co, idx)=>{
          const w=calcWidth(co);
          placeSubtree(co, startX+w/2, currentY);
          startX+=w+HGAP;
        });
        
        // Avancer Y pour prochain mariage
        currentY+=VGAP+NH;
      });
      
      placeCouple(owner, cx, y);
    } else {
      // Pas de mariages multiples, placement normal
      let children=[];
      ids.forEach(cid=>{
        if(placed.has(cid)) return;
        const cfid=P[cid].fid, cmid=P[cid].mid;
        if(partner){
          if(cfid===owner && cmid===partner) children.push(cid);
          else if(cfid===partner && cmid===owner) children.push(cid);
        }else{
          if((cfid===owner&&!cmid)||(cmid===owner&&!cfid)) children.push(cid);
        }
      });
      children=[...new Set(children)];
      
      if(children.length===0){ 
        placeCouple(owner,cx,y); 
        return; 
      }
      
      const childOwners=[];
      const seen=new Set();
      children.forEach(cid=>{
        const csp=_spouseOf[cid]; 
        const co=csp&&cid>csp?csp:cid;
        if(!seen.has(co)){seen.add(co);childOwners.push(co);}
      });
      
      let totalW=0;
      childOwners.forEach((co,i)=>{ totalW+=calcWidth(co)+(i>0?HGAP:0); });
      let startX=cx-totalW/2;
      
      let currentY=y+NH;
      childOwners.forEach((co, idx)=>{
        const w=calcWidth(co);
        const yOffset=(idx%2===0) ? VGAP : HALF_VGAP;
        placeSubtree(co, startX+w/2, currentY+yOffset);
        startX+=w+HGAP;
        if(idx%2===1) currentY+=HALF_VGAP;
      });
      
      const childCxs=children.map(cid=>_pos[cid]).filter(Boolean).map(p=>p.x+NW/2);
      const childCenter=childCxs.length>0?(Math.min(...childCxs)+Math.max(...childCxs))/2:cx;
      placeCouple(owner,childCenter,y);
    }
  }

  function calcWidth(owner){
    const partner=_spouseOf[owner];
    const myW=partner?NW*2+CGAP:NW;
    // Simplifié pour perf
    return myW;
  }

  const roots=ids.filter(id=>gen[id]===0&&!P[id].fid&&!P[id].mid);
  const rootOwners=[]; const rootSeen=new Set();
  roots.forEach(id=>{ const sp=_spouseOf[id]; const owner=sp&&id>sp?sp:id; if(!rootSeen.has(owner)){rootSeen.add(owner);rootOwners.push(owner);} });
  let rootX=-100;
  rootOwners.forEach(ro=>{ placeSubtree(ro,rootX,0); rootX+=300; });
  ids.forEach(id=>{ if(!placed.has(id)){_pos[id]={x:0,y:gen[id]*(NH+VGAP)};placed.add(id);} });

  const savedPos=loadSavedPositions();
  if(savedPos) Object.assign(_pos, savedPos);

  const wrapper=document.getElementById("tree-container");
  _W=wrapper.clientWidth||window.innerWidth;
  _H=wrapper.clientHeight||window.innerHeight-56;

  d3.select("#tree-container svg").remove();
  _svg=d3.select("#tree-container").append("svg")
    .attr("width",_W).attr("height",_H).style("background","#f5f5f7");

  _svg.append("text").attr("x",10).attr("y",18)
    .attr("font-size",10).attr("fill","#aaa")
    .attr("font-family","'DM Sans',sans-serif")
    .text("v"+TREE_VERSION);

  _g=_svg.append("g").attr("transform",`translate(${_W/2},40)`);

  _zoom=d3.zoom().scaleExtent([0.1,3]).on("zoom",e=>_g.attr("transform",e.transform));
  _svg.call(_zoom);
  _svg.call(_zoom.transform, d3.zoomIdentity.translate(_W/2,40));

  redrawAllLines();
  redrawAllNodes();
}

function redrawAllLines(){
  d3.selectAll(".link").remove();

  const ids=Object.keys(_P);
  
  // ✅ LIGNES CONJOINTS AVEC COULEUR PAR MARIAGE
  ids.forEach(id=>{
    if(!_marriages[id] || _marriages[id].length===0) return;
    
    _marriages[id].forEach(marriage=>{
      const spouseId=marriage.spouseId;
      const pa=_pos[id], pb=_pos[spouseId];
      if(!pa||!pb) return;
      
      const lx=Math.min(pa.x,pb.x)+NW, rx=Math.max(pa.x,pb.x), y=pa.y+NH/2;
      
      _g.append("line")
        .attr("class","link")
        .attr("x1",lx).attr("y1",y).attr("x2",rx).attr("y2",y)
        .attr("stroke", marriage.color)
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "5,4")
        .attr("fill","none");
      
      // Badge M1, M2, etc.
      const badgeX=(lx+rx)/2;
      _g.append("circle")
        .attr("cx", badgeX).attr("cy", y)
        .attr("r", 10)
        .attr("fill", marriage.color)
        .attr("opacity", 0.8);
      
      _g.append("text")
        .attr("x", badgeX).attr("y", y+4)
        .attr("text-anchor", "middle")
        .attr("font-size", 10)
        .attr("font-weight", "bold")
        .attr("fill", "white")
        .text("M"+marriage.number);
    });
  });

  // LIGNES PARENT-ENFANT
  ids.forEach(id=>{
    if(!_marriages[id] || _marriages[id].length===0) return;
    
    _marriages[id].forEach(marriage=>{
      const children=marriage.children;
      if(children.length===0) return;
      
      const ppos=_pos[id];
      if(!ppos) return;
      
      const pCx=ppos.x+NW/2;
      const pY=ppos.y+NH;
      const jY=pY+VGAP*0.35;
      
      const cps=children.map(cid=>_pos[cid]).filter(Boolean);
      if(!cps.length) return;
      
      const cxs=cps.map(cp=>cp.x+NW/2);
      const mnX=Math.min(...cxs), mxX=Math.max(...cxs);
      
      // Ligne verticale depuis parent
      _g.append("line")
        .attr("class","link")
        .attr("x1", pCx).attr("y1", pY)
        .attr("x2", pCx).attr("y2", jY)
        .attr("stroke", marriage.color)
        .attr("stroke-width", 2);
      
      // Ligne horizontale
      if(cps.length===1){
        _g.append("line")
          .attr("class","link")
          .attr("x1", pCx).attr("y1", jY)
          .attr("x2", cxs[0]).attr("y2", jY)
          .attr("stroke", marriage.color)
          .attr("stroke-width", 2);
      }else{
        _g.append("line")
          .attr("class","link")
          .attr("x1", mnX).attr("y1", jY)
          .attr("x2", mxX).attr("y2", jY)
          .attr("stroke", marriage.color)
          .attr("stroke-width", 2);
        
        if(pCx<mnX) _g.append("line")
          .attr("class","link")
          .attr("x1", pCx).attr("y1", jY)
          .attr("x2", mnX).attr("y2", jY)
          .attr("stroke", marriage.color)
          .attr("stroke-width", 2);
        else if(pCx>mxX) _g.append("line")
          .attr("class","link")
          .attr("x1", mxX).attr("y1", jY)
          .attr("x2", pCx).attr("y2", jY)
          .attr("stroke", marriage.color)
          .attr("stroke-width", 2);
      }
      
      // Lignes verticales vers enfants
      cps.forEach(cp=>{
        _g.append("line")
          .attr("class","link")
          .attr("x1", cp.x+NW/2).attr("y1", jY)
          .attr("x2", cp.x+NW/2).attr("y2", cp.y)
          .attr("stroke", marriage.color)
          .attr("stroke-width", 2);
      });
    });
  });
}

function redrawAllNodes(){
  d3.selectAll(".node").remove();
  
  const ids=Object.keys(_P);
  ids.forEach(id=>{
    const p=_P[id], pt=_pos[id]; 
    if(!pt) return;

    const grp=_g.append("g")
      .attr("class","node")
      .attr("data-id",id)
      .style("cursor","grab")
      .on("mousedown", onNodeMouseDown)
      .on("click",()=>location.href="person.html?id="+id)
      .on("mouseenter",function(){ d3.select(this).select("rect").attr("stroke","#0071e3").attr("stroke-width",2); })
      .on("mouseleave",function(){ if(!draggedId) d3.select(this).select("rect").attr("stroke",p.dd?"#c8c8cc":"#d1d1d6").attr("stroke-width",1.5); });

    grp.append("rect")
      .attr("x",pt.x).attr("y",pt.y).attr("width",NW).attr("height",NH).attr("rx",10)
      .attr("fill",p.dd?"#f2f2f4":"white").attr("stroke",p.dd?"#c8c8cc":"#d1d1d6").attr("stroke-width",1.5);

    const cx=pt.x+NW/2;

    if(p.hasPhoto){
      grp.append("rect")
        .attr("x",pt.x+NW-20).attr("y",pt.y+4)
        .attr("width",16).attr("height",12).attr("rx",3)
        .attr("fill","#e8f5e9").attr("stroke","#a5d6a7").attr("stroke-width",0.8);
      grp.append("text")
        .attr("x",pt.x+NW-12).attr("y",pt.y+13)
        .attr("text-anchor","middle").attr("font-size",8)
        .text("📷");
    }

    const words=p.n.trim().split(" ");
    const half=Math.ceil(words.length/2);
    const two=p.n.length>16&&words.length>1;
    const lines=two?[words.slice(0,half).join(" "),words.slice(half).join(" ")]:[p.n.trim()];
    const ty=pt.y+(two?18:26);

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

function onNodeMouseDown(event){
  draggedId=event.currentTarget.getAttribute("data-id");
  const svg=_svg.node();
  const rect=svg.getBoundingClientRect();
  
  dragStartX=event.clientX - rect.left;
  dragStartY=event.clientY - rect.top;
  
  event.stopPropagation();
}

document.addEventListener("mousemove", function(event){
  if(!draggedId || !_pos[draggedId]) return;
  
  const svg=_svg.node();
  if(!svg) return;
  
  const rect=svg.getBoundingClientRect();
  const currentX=event.clientX - rect.left;
  const currentY=event.clientY - rect.top;
  
  const deltaX=currentX-dragStartX;
  const deltaY=currentY-dragStartY;
  
  _pos[draggedId].x+=deltaX;
  _pos[draggedId].y+=deltaY;
  
  dragStartX=currentX;
  dragStartY=currentY;
  
  redrawAllLines();
  redrawAllNodes();
});

document.addEventListener("mouseup", function(){
  if(draggedId){
    savePositions();
    draggedId=null;
  }
});
