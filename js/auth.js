/ ✅ LISTE BLANCHE — ajoute ici les emails autorisés
const authorizedEmails = [
  "jean.pierre.gonzalez@gmail.com",
  "membre2@gmail.com",
  "membre3@gmail.com"
  // Ajoute autant d'emails que nécessaire
];
 
// Fournisseur Google
const provider = new firebase.auth.GoogleAuthProvider();
 
// Bouton de connexion Google
const loginBtn = document.getElementById("googleLogin");
if (loginBtn) {
  loginBtn.addEventListener("click", () => {
    firebase.auth().signInWithPopup(provider)
      .then(result => {
        const email = result.user.email;
 
        // Vérification de l'email
        if (!authorizedEmails.includes(email)) {
          // Email non autorisé → déconnexion immédiate
          firebase.auth().signOut();
          alert("⛔ Accès refusé.\nCe compte Google (" + email + ") n'est pas autorisé.\nContacte l'administrateur du site.");
          return;
        }
 
        // Email autorisé → redirection
        window.location.href = "dashboard.html";
      })
      .catch(err => alert("Erreur connexion Google : " + err.message));
  });
}
 
// Protection des pages internes
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
 
  // Double vérification sur les pages protégées
  if (user && protectedPages.includes(current)) {
    if (!authorizedEmails.includes(user.email)) {
      firebase.auth().signOut();
      window.location.href = "index.html";
    }
  }
});
 
