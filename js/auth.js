// Fournisseur Google
const provider = new firebase.auth.GoogleAuthProvider();

// Vérifie si l'email est autorisé dans Firestore
async function checkAuthorized(email) {
  try {
    const doc = await db.collection("authorizedUsers").doc(email).get();
    return doc.exists;
  } catch (e) {
    return false;
  }
}

// Bouton de connexion Google
const loginBtn = document.getElementById("googleLogin");
if (loginBtn) {
  loginBtn.addEventListener("click", async () => {
    try {
      const result = await firebase.auth().signInWithPopup(provider);
      const email = result.user.email;

      const authorized = await checkAuthorized(email);

      if (!authorized) {
        await firebase.auth().signOut();
        alert("⛔ Accès refusé.\n" + email + " n'est pas autorisé.\nContacte l'administrateur.");
        return;
      }

      window.location.href = "dashboard.html";

    } catch (err) {
      alert("Erreur connexion : " + err.message);
    }
  });
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

  // Double vérification sur les pages protégées
  if (user && protectedPages.includes(current)) {
    const authorized = await checkAuthorized(user.email);
    if (!authorized) {
      await firebase.auth().signOut();
      window.location.href = "index.html";
    }
  }
});
