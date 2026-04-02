/ Fournisseur Google
const provider = new firebase.auth.GoogleAuthProvider();
 
// Vérifie si l'email est autorisé dans Firestore
async function checkAuthorized(email) {
  try {
    console.log("🔍 Vérification Firestore pour :", email);
    const doc = await db.collection("authorizedUsers").doc(email).get();
    console.log("📄 Document trouvé :", doc.exists);
    return doc.exists;
  } catch (e) {
    console.error("❌ Erreur Firestore :", e.message);
    return false;
  }
}
 
// Bouton de connexion Google
const loginBtn = document.getElementById("googleLogin");
if (loginBtn) {
  loginBtn.addEventListener("click", async () => {
    try {
      console.log("🟡 Popup Google en cours...");
      const result = await firebase.auth().signInWithPopup(provider);
      const email = result.user.email;
      console.log("✅ Connecté avec :", email);
 
      const authorized = await checkAuthorized(email);
      console.log("🔐 Autorisé :", authorized);
 
      if (!authorized) {
        await firebase.auth().signOut();
        alert("⛔ Accès refusé.\n" + email + " n'est pas autorisé.\nContacte l'administrateur.");
        return;
      }
 
      console.log("➡️ Redirection vers dashboard.html...");
      window.location.href = "dashboard.html";
 
    } catch (err) {
      console.error("❌ Erreur login :", err.message);
      alert("Erreur connexion : " + err.message);
    }
  });
} else {
  console.warn("⚠️ Bouton googleLogin introuvable");
}
 
// Protection des pages internes
firebase.auth().onAuthStateChanged(async user => {
  const protectedPages = [
    "dashboard.html",
    "tree.html",
    "person.html",
    "edit.html",
    "gallery.html",
    "timeline.html"
  ];
  const current = location.pathname.split("/").pop();
 
  if (!user && protectedPages.includes(current)) {
    window.location.href = "index.html";
    return;
  }
 
  if (user && protectedPages.includes(current)) {
    const authorized = await checkAuthorized(user.email);
    if (!authorized) {
      await firebase.auth().signOut();
      window.location.href = "index.html";
    }
  }
});
 
