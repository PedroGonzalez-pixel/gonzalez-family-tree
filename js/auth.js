//****************************************************
 * AUTHENTIFICATION GOOGLE (Firebase v8)
 ****************************************************/

// Fournisseur Google
const provider = new firebase.auth.GoogleAuthProvider();

// Bouton de connexion
const loginBtn = document.getElementById("googleLogin");

if (loginBtn) {
  loginBtn.addEventListener("click", () => {
    auth.signInWithPopup(provider)
      .then(() => {
        // Redirection vers le dashboard une fois connecté
        window.location.href = "dashboard.html";
      })
      .catch(err => alert("Erreur connexion Google : " + err.message));
  });
}

/****************************************************
 * PROTECTION DES PAGES : accès réservé aux connectés
 ****************************************************/
firebase.auth().onAuthStateChanged(user => {

  // Liste des pages protégées
  const protectedPages = [
    "dashboard.html",
    "tree.html",
    "person.html",
    "edit.html",
    "gallery.html",
    "timeline.html"
  ];

  // Page actuelle
  const current = location.pathname.split("/").pop();

  // Si l'utilisateur n'est pas connecté → retour au login
  if (!user && protectedPages.includes(current)) {
    window.location.href = "index.html";
  }
});
``
