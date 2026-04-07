// ============================================================
// ARBRE GÉNÉALOGIQUE — VERSION CORRIGÉE (générations stables)
// ============================================================

function v(x){ return x && typeof x==="string" && x.trim()?x:null; }

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
// Chargement Firestore
// ============================================================

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

// ============================================================
// Cœur : calcul + rendu
// ============================================================

function drawTree(P){
  const ids=Object.keys(P);

// ────────────────────────────────────────────────────────────
// 1. CALCUL DES GÉNÉRATIONS (CORRIGÉ)
// ────────────────────────────────────────────────────────────

  const gen={};

  // Racines : uniquement si personne n’est leur parent
  ids.forEach(id=>{
    gen[id]=undefined;
  });

  // Parents -> enfants
  for(let i=0;i<30;i++){
    ids.forEach(id=>{
      if(gen[id]!==undefined) return;
