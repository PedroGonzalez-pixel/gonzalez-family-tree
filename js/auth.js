// LOGIN GOOGLE
const provider = new firebase.auth.GoogleAuthProvider();

const loginBtn = document.getElementById("googleLogin");
if (loginBtn) {
  loginBtn.addEventListener("click", () => {
    auth.signInWithPopup(provider)
      .then(() => window.location.href = "dashboard.html")
      .catch(err => alert(err.message));
  });
}

// PROTECTION DES PAGES
firebase.auth().onAuthStateChanged(user => {
  const protectedPages = ["dashboard.html","tree.html","person.html","edit.html","gallery.html","timeline.html"];

  const current = location.pathname.split("/").pop();

  if (!user && protectedPages.includes(current)) {
    window.location.href = "index.html";
  }
});
