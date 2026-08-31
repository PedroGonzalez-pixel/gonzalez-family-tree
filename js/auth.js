// ========== AUTHENTICATION MODULE ==========
// Gère la connexion Google avec Firebase Auth

console.log("📁 auth.js loading...");

/**
 * Fonction principale : Se connecter avec Google
 * Utilise Firebase Auth avec Google Sign-In
 */
function signInWithGoogle() {
    console.log("🔵 signInWithGoogle() called");
    
    return new Promise((resolve, reject) => {
        // Vérifier que Firebase est chargé
        if (typeof firebase === 'undefined') {
            const error = "Firebase not loaded";
            console.error("❌", error);
            reject(new Error(error));
            return;
        }

        // Vérifier que la config est chargée
        if (typeof db === 'undefined') {
            const error = "Firebase config not initialized (db is undefined)";
            console.error("❌", error);
            reject(new Error(error));
            return;
        }

        console.log("✅ Firebase and config ready");

        // Provider Google
        const provider = new firebase.auth.GoogleAuthProvider();
        
        // Ajouter les scopes Google
        provider.addScope('profile');
        provider.addScope('email');

        // Lancer la connexion
        firebase.auth().signInWithPopup(provider)
            .then((result) => {
                const user = result.user;
                console.log("✅ Sign in successful:", user.email);
                console.log("📧 User UID:", user.uid);

                // Vérifier si l'utilisateur est autorisé
                checkUserAuthorization(user)
                    .then((authorized) => {
                        if (authorized) {
                            console.log("✅ User authorized");
                            // Rediriger vers dashboard
                            window.location.href = 'dashboard.html';
                            resolve(user);
                        } else {
                            console.warn("⚠️ User not authorized");
                            // Déconnecter l'utilisateur
                            firebase.auth().signOut().then(() => {
                                console.log("User signed out (not authorized)");
                                reject(new Error("Vous n'êtes pas autorisé à accéder à cette application"));
                            });
                        }
                    })
                    .catch((error) => {
                        console.error("❌ Authorization check failed:", error);
                        reject(error);
                    });
            })
            .catch((error) => {
                console.error("❌ Sign in error:", error.code, error.message);
                
                // Messages d'erreur lisibles
                let userMessage = error.message;
                
                if (error.code === 'auth/popup-blocked') {
                    userMessage = "La pop-up a été bloquée. Veuillez autoriser les pop-ups.";
                } else if (error.code === 'auth/popup-closed-by-user') {
                    userMessage = "Connexion annulée par l'utilisateur.";
                } else if (error.code === 'auth/network-request-failed') {
                    userMessage = "Erreur réseau. Vérifiez votre connexion Internet.";
                }
                
                console.error("User message:", userMessage);
                reject(new Error(userMessage));
            });
    });
}

/**
 * Vérifier si l'utilisateur est autorisé
 * Regarde si son email est dans la collection "authorizedUsers" de Firestore
 */
function checkUserAuthorization(user) {
    console.log("🔍 Checking authorization for:", user.email);
    
    return new Promise((resolve, reject) => {
        // Vérifier qu'on a la base de données
        if (typeof db === 'undefined') {
            console.warn("⚠️ Firestore db not available, allowing access");
            resolve(true); // Laisser passer si Firestore n'est pas dispo
            return;
        }

        // Chercher l'utilisateur dans authorizedUsers
        db.collection('authorizedUsers').doc(user.email).get()
            .then((doc) => {
                if (doc.exists) {
                    console.log("✅ User found in authorizedUsers");
                    resolve(true);
                } else {
                    console.warn("⚠️ User NOT found in authorizedUsers");
                    resolve(false);
                }
            })
            .catch((error) => {
                console.error("❌ Error checking authorization:", error);
                // En cas d'erreur Firestore, on fait confiance à Firebase Auth
                console.log("Allowing access despite Firestore error");
                resolve(true);
            });
    });
}

/**
 * Vérifier l'état de connexion au chargement de la page
 * Si connecté : vérifier l'autorisation et rediriger si nécessaire
 * Si pas connecté : rester sur la page de login
 */
firebase.auth().onAuthStateChanged(function(user) {
    if (user) {
        console.log("✅ User logged in:", user.email);
        console.log("📧 User UID:", user.uid);
        
        // Vérifier l'autorisation
        checkUserAuthorization(user)
            .then((authorized) => {
                if (authorized) {
                    console.log("✅ User authorized, staying logged in");
                } else {
                    console.warn("⚠️ User not authorized, signing out");
                    firebase.auth().signOut().then(() => {
                        console.log("User signed out (not authorized)");
                    });
                }
            })
            .catch((error) => {
                console.error("❌ Authorization check error:", error);
            });
    } else {
        console.log("⏳ No user logged in");
    }
});

/**
 * Fonction de déconnexion
 */
function signOut() {
    console.log("🚪 Signing out...");
    
    return firebase.auth().signOut()
        .then(() => {
            console.log("✅ User signed out");
            window.location.href = 'index.html';
        })
        .catch((error) => {
            console.error("❌ Sign out error:", error);
        });
}

/**
 * Obtenir l'utilisateur actuel
 */
function getCurrentUser() {
    return firebase.auth().currentUser;
}

/**
 * Vérifier si l'utilisateur est connecté
 */
function isUserLoggedIn() {
    return firebase.auth().currentUser !== null;
}

console.log("✅ auth.js loaded successfully");
