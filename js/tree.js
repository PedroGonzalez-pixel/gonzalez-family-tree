// ARBRE GÉNÉALOGIQUE v4.2.2 — ZOOM, RECENTER, MULTI-SÉLECTION
// - Fix langue espagnol
// - Boutons Zoom +/-
// - Recenter sur personne (ou fit-to-view)
// - Multi-sélection par rectangle

const TREE_VERSION = "4.2.2";

const MARRIAGE_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#95E1D3",
  "#FFE66D",
  "#A8E6CF"
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
let _fams={};
let _spouseOf={};
let _selectedIds=new Set(); // Nœuds sélectionnés

let draggedId=null;
let dragStartX=0, dragStartY=0;
let rectSelectMode=false;
let rectX0, rectY0;

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

function zoomIn(){
  if(!_svg || !_zoom) return;
  _svg.transition().duration(300)
    .call(_zoom.scaleBy, 1.5);
}

function zoomOut(){
  if(!_svg || !_zoom) return;
  _svg.transition().duration(300)
    .call(_zoom.scaleBy, 0.67);
}

function fitToView(){
  if(!_svg || !_zoom || Object.keys(_pos).length===0) return;
  
  const poses=Object.values(_pos);
  const xs=poses.map(p=>p.x);
  const ys=poses.map(p=>p.y);
  const minX=Math.min(...xs), maxX=Math.max(...xs)+NW;
  const minY=Math.min(...ys), maxY=Math.max(...ys)+NH;
  
  const w=maxX-minX+40, h=maxY-minY+40;
  const scale=Math.min(_W/w, _H/h, 1);
  const tx=_W/2 - (minX+w/2)*scale;
  const ty=40 - (minY+h/2)*scale + _H/2;
  
  _svg.transition().duration(500)
    .call(_zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
}

function recenterOnSelected(){
  if(_selectedIds.size===1){
    const id=Array.from(_selectedIds)[0];
    const pt=_pos[id];
    if(!pt) return;
    
    _svg.transition().duration(500)
      .call(_zoom.transform, d3.zoomIdentity.translate(_W/2-pt.x, _H/2-pt.y));
  }else{
    fitToView();
  }
}

function toggleNodeSelection(id){
  if(_selectedIds.has(id)){
    _selectedIds.delete(id);
  }else{
    _selectedIds.add(id);
  }
  redrawAllNodes();
}

function clearSelection(){
  _selectedIds.clear();
  redrawAllNodes();
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
    {id: "zoomInBtn", labelFr: "🔍+", labelEn: "🔍+", labelEs: "🔍+", onclick: zoomIn},
    {id: "zoomOutBtn", labelFr: "🔍-", labelEn: "🔍-", labelEs: "🔍-", onclick: zoomOut},
    {id: "recenterBtn", labelFr: "🎯 Centrer", labelEn: "🎯 Center", labelEs: "🎯 Centrar", onclick: recenterOnSelected},
    {id: "resetBtn", labelFr: "🔄 Réinitialiser", labelEn: "🔄 Reset", labelEs: "🔄 Reiniciar", onclick: resetPositions},
    {id: "saveBtn", labelFr: "💾 Exporter", labelEn: "💾 Save", labelEs: "💾 Guardar", onclick: exportPositions},
    {id: "loadBtn", labelFr: "📂 Importer", labelEn: "📂 Load", labelEs: "📂 Cargar", onclick: importPositions}
  ];
  
  buttons.forEach(btn=>{
    const button=document.createElement("button");
    button.id=btn.id;
    button.dataset.labelFr=btn.labelFr;
    button.dataset.labelEn=btn.labelEn;
    button.dataset.labelEs=btn.labelEs;
    
    const currentLang=window.currentLang || "fr";
    button.textContent=button.dataset["label"+currentLang.toUpperCase()] || btn.labelFr;
    
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
    const key="label"+lang.toUpperCase();
    if(btn.dataset[key]){
      btn.textContent=btn.dataset[key];
    }
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

  _fams={};
  ids.forEach(id=>{
    const fid=P[id].fid&&P[P[id].fid]?P[id].fid:null;
    const mid=P[id].mid&&P[P[id].mid]?P[id].mid:null;
    if(!fid&&!mid) return;
    const k=(fid||"X")+"##"+(mid||"X");
    if(!_fams[k]) _fams[k]={fid,mid,ch:[]};
    _fams[k].ch.push(id);
  });

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

  const subtreeW={};
  function calcWidth(owner){
    if(subtreeW[owner]!==undefined) return subtreeW[owner];
    const partner=_spouseOf[owner];
    let children=[];
    ids.forEach(cid=>{
      const cfid=P[cid].fid, cmid=P[cid].mid;
      if(partner){
        if(cfid===owner && cmid===partner) children.push(cid);
        else if(cfid===partner && cmid===owner) children.push(cid);
      }else{
        if((cfid===owner&&!cmid)||(cmid===owner&&!cfid)) children.push(cid);
      }
    });
    children=[...new Set(children)];
    const myW=partner?NW*2+CGAP:NW;
    if(children.length===0){ subtreeW[owner]=myW; if(partner) subtreeW[partner]=myW; return myW; }
    let childTotalW=0;
    const seen=new Set();
    children.forEach(cid=>{
      const csp=_spouseOf[cid]; const co=csp&&cid>csp?csp:cid;
      if(seen.has(co)) return; seen.add(co);
      childTotalW+=calcWidth(co)+(childTotalW>0?HGAP:0);
    });
    const w=Math.max(myW,childTotalW);
    subtreeW[owner]=w; if(partner) subtreeW[partner]=myW; return w;
  }
  ids.forEach(id=>{ const sp=_spouseOf[id]; const owner=sp&&id>sp?sp:id; calcWidth(owner); });

  _pos={};
  const placed=new Set();

  function placeCouple(owner,cx,y){
    const partner=_spouseOf[owner];
    if(partner&&P[partner]){
      _pos[owner]={x:cx-NW-CGAP/2,y}; _pos[partner]={x:cx+CGAP/2,y};
      placed.add(owner); placed.add(partner);
    }else{ _pos[owner]={x:cx-NW/2,y}; placed.add(owner); }
  }

  function placeSubtree(owner,cx,y){
    if(placed.has(owner)) return;
    const partner=_spouseOf[owner];
    if(partner&&placed.has(partner)) return;
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
    if(children.length===0){ placeCouple(owner,cx,y); return; }
    const childOwners=[];
    const seen=new Set();
    children.forEach(cid=>{
      const csp=_spouseOf[cid]; const co=csp&&cid>csp?csp:cid;
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

  const roots=ids.filter(id=>gen[id]===0&&!P[id].fid&&!P[id].mid);
  const rootOwners=[]; const rootSeen=new Set();
  roots.forEach(id=>{ const sp=_spouseOf[id]; const owner=sp&&id>sp?sp:id; if(!rootSeen.has(owner)){rootSeen.add(owner);rootOwners.push(owner);} });
  let totalRootW=0;
  rootOwners.forEach((ro,i)=>{ totalRootW+=calcWidth(ro)+(i>0?HGAP:0); });
  let rootX=-totalRootW/2;
  rootOwners.forEach(ro=>{ const w=calcWidth(ro); placeSubtree(ro,rootX+w/2,0); rootX+=w+HGAP; });
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
  
  // Drag rectangle pour multi-sélection
  _svg.on("mousedown", function(event){
    if(event.target !== this) return;
    rectSelectMode=true;
    rectX0=event.clientX;
    rectY0=event.clientY;
  });
  
  document.addEventListener("mousemove", function(event){
    if(!rectSelectMode) return;
    const x0=Math.min(rectX0, event.clientX);
    const y0=Math.min(rectY0, event.clientY);
    const x1=Math.max(rectX0, event.clientX);
    const y1=Math.max(rectY0, event.clientY);
    
    d3.selectAll(".rect-select").remove();
    _svg.append("rect")
      .attr("class", "rect-select")
      .attr("x", x0).attr("y", y0)
      .attr("width", x1-x0).attr("height", y1-y0)
      .attr("fill", "rgba(0,113,227,0.1)")
      .attr("stroke", "#0071e3")
      .attr("stroke-dasharray", "5,5")
      .attr("pointer-events", "none");
  });
  
  document.addEventListener("mouseup", function(event){
    if(!rectSelectMode) return;
    rectSelectMode=false;
    d3.selectAll(".rect-select").remove();
    
    const x0=Math.min(rectX0, event.clientX);
    const y0=Math.min(rectY0, event.clientY);
    const x1=Math.max(rectX0, event.clientX);
    const y1=Math.max(rectY0, event.clientY);
    
    // Trouver nœuds dans le rectangle
    Object.entries(_pos).forEach(([id, pt])=>{
      if(pt.x+_W/2>=x0 && pt.x+NW+_W/2<=x1 && pt.y+40>=y0 && pt.y+NH+40<=y1){
        _selectedIds.add(id);
      }
    });
    
    redrawAllNodes();
  });

  redrawAllLines();
  redrawAllNodes();
}

function getMarriageNumber(childId){
  if(!_P[childId]) return 0;
  const child=_P[childId];
  const fid=child.fid, mid=child.mid;
  
  if(!fid && !mid) return 0;
  
  const parentId = fid || mid;
  const parent = _P[parentId];
  if(!parent || !parent.spouses) return 0;
  
  const otherParentId = fid ? mid : fid;
  for(let i=0; i<parent.spouses.length; i++){
    const spouse = parent.spouses[i];
    if(spouse.spouseId === otherParentId || (!otherParentId && i===0)){
      return i;
    }
  }
  return 0;
}

function redrawAllLines(){
  d3.selectAll(".link-spouse").remove();
  d3.selectAll(".link-parent").remove();

  const ids=Object.keys(_P);
  
  const spDone=new Set();
  ids.forEach(id=>{
    const p=_P[id];
    const spousesToShow=[];
    
    if(p.spouses && p.spouses.length>0){
      p.spouses.forEach(s=>{
        if(s.spouseId && _P[s.spouseId]){
          spousesToShow.push({id: s.spouseId, active: !s.endReason, endReason: s.endReason});
        }
      });
    }else if(p.sid && _P[p.sid]){
      spousesToShow.push({id: p.sid, active: true, endReason: null});
    }
    
    spousesToShow.forEach((spouse, idx)=>{
      const k=[id, spouse.id].sort().join("~");
      if(spDone.has(k)) return;
      spDone.add(k);
      
      const pa=_pos[id], pb=_pos[spouse.id];
      if(!pa||!pb) return;
      
      const lx=Math.min(pa.x,pb.x)+NW, rx=Math.max(pa.x,pb.x), y=pa.y+NH/2;
      
      let strokeColor=MARRIAGE_COLORS[idx % MARRIAGE_COLORS.length];
      let strokeDash="5,4";
      if(!spouse.active){ strokeDash="2,2"; }
      
      _g.append("line")
        .attr("class","link-spouse")
        .attr("x1",lx).attr("y1",y).attr("x2",rx).attr("y2",y)
        .attr("stroke", strokeColor)
        .attr("stroke-width", spouse.active ? 1.5 : 1)
        .attr("stroke-dasharray", strokeDash)
        .attr("fill","none");
    });
  });

  Object.values(_fams).forEach(({fid,mid,ch})=>{
    const pf=fid?_pos[fid]:null, pm=mid?_pos[mid]:null;
    if(!pf&&!pm) return;
    const fCx=pf?pf.x+NW/2:null, mCx=pm?pm.x+NW/2:null;
    const jX=fCx!==null&&mCx!==null?(fCx+mCx)/2:(fCx||mCx);
    const pY=(pf||pm).y+NH, jY=pY+VGAP*0.35;
    
    if(fCx!==null)
      _g.append("path")
        .attr("class","link-parent")
        .attr("fill","none").attr("stroke","#c0c0c8").attr("stroke-width",1.5)
        .attr("d",`M${fCx},${pY} V${jY} H${jX}`);
    
    if(mCx!==null&&mCx!==fCx)
      _g.append("path")
        .attr("class","link-parent")
        .attr("fill","none").attr("stroke","#c0c0c8").attr("stroke-width",1.5)
        .attr("d",`M${mCx},${pY} V${jY} H${jX}`);
    
    const cps=ch.map(cid=>_pos[cid]).filter(Boolean);
    if(!cps.length) return;
    const cxs=cps.map(cp=>cp.x+NW/2);
    const mnX=Math.min(...cxs), mxX=Math.max(...cxs);
    
    if(cps.length===1){
      const childIdx=getMarriageNumber(ch[0]);
      const color=MARRIAGE_COLORS[childIdx % MARRIAGE_COLORS.length];
      _g.append("line")
        .attr("class","link-parent")
        .attr("fill","none").attr("stroke",color).attr("stroke-width",1.5)
        .attr("x1",jX).attr("y1",jY).attr("x2",cxs[0]).attr("y2",jY);
    }else{
      _g.append("line")
        .attr("class","link-parent")
        .attr("fill","none").attr("stroke","#c0c0c8").attr("stroke-width",1.5)
        .attr("x1",mnX).attr("y1",jY).attr("x2",mxX).attr("y2",jY);
      if(jX<mnX) _g.append("line")
        .attr("class","link-parent")
        .attr("fill","none").attr("stroke","#c0c0c8").attr("stroke-width",1.5)
        .attr("x1",jX).attr("y1",jY).attr("x2",mnX).attr("y2",jY);
      else if(jX>mxX) _g.append("line")
        .attr("class","link-parent")
        .attr("fill","none").attr("stroke","#c0c0c8").attr("stroke-width",1.5)
        .attr("x1",mxX).attr("y1",jY).attr("x2",jX).attr("y2",jY);
    }
    
    cps.forEach((cp, cIdx)=>{
      const childIdx=getMarriageNumber(ch[cIdx]);
      const color=MARRIAGE_COLORS[childIdx % MARRIAGE_COLORS.length];
      _g.append("line")
        .attr("class","link-parent")
        .attr("fill","none").attr("stroke",color).attr("stroke-width",1.5)
        .attr("x1",cp.x+NW/2).attr("y1",jY).attr("x2",cp.x+NW/2).attr("y2",cp.y);
    });
  });
}

function redrawAllNodes(){
  d3.selectAll(".node").remove();
  
  const ids=Object.keys(_P);
  ids.forEach(id=>{
    const p=_P[id], pt=_pos[id]; 
    if(!pt) return;

    const isSelected=_selectedIds.has(id);

    const grp=_g.append("g")
      .attr("class","node")
      .attr("data-id",id)
      .style("cursor","grab")
      .on("mousedown", (event)=>{
        if(!event.ctrlKey && !event.metaKey) clearSelection();
        toggleNodeSelection(id);
        onNodeMouseDown(event);
      })
      .on("click",()=>{location.href="person.html?id="+id})
      .on("mouseenter",function(){ d3.select(this).select("rect").attr("stroke","#0071e3").attr("stroke-width",2); })
      .on("mouseleave",function(){ 
        const borderColor=isSelected ? "#0071e3" : (p.dd?"#c8c8cc":"#d1d1d6");
        const width=isSelected ? 2 : 1.5;
        if(!draggedId) d3.select(this).select("rect").attr("stroke",borderColor).attr("stroke-width",width); 
      });

    grp.append("rect")
      .attr("x",pt.x).attr("y",pt.y).attr("width",NW).attr("height",NH).attr("rx",10)
      .attr("fill",p.dd?"#f2f2f4":"white")
      .attr("stroke",isSelected ? "#0071e3" : (p.dd?"#c8c8cc":"#d1d1d6"))
      .attr("stroke-width",isSelected ? 2 : 1.5);

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
