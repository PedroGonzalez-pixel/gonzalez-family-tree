

// Fournisseur Google
const provider = new firebase.auth.GoogleAuthProvider();

// Bouton de connexion Google
const loginBtn = document.getElementById("googleLogin");

if (loginBtn) {
  loginBtn.addEventListener("click", () => {
    firebase.auth().signInWithPopup(provider)
      .then(() => {
        // Redirection après connexion réussie
        window.location.href = "dashboard.html";
      })
      .catch(err => alert("Erreur connexion Google : " + err.message));
  });
}


firebase.auth().onAuthStateChanged(user => {

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
  }
});
``
