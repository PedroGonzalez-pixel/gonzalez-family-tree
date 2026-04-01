//****************************************************
//* AUTHENTIFICATION GOOGLE (Firebase v8)
//****************************************************/

// Fournisseur Google
const provider = new firebase.auth.GoogleAuthProvider();

// Bouton de connexion
const loginBtn = document.getElementById("googleLogin");

if (loginBtn) {
  loginBtn.addEventListener("click", () => {
    firebase.auth().signInWithPopup(provider)
      .then(() => {
        // Redirection vers dashboard
        window.location.href = "dashboard.html";
      })
      .catch(err => alert("Erreur connexion Google : " + err.message));
  });
}

//****************************************************
// * PROTECTION DES PAGES
// ****************************************************/
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
