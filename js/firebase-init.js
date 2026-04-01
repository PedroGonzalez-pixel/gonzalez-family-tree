/****************************************************
 * Initialisation Firebase (compatibilité version 8)
 ****************************************************/

// Configuration de ton projet Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAKRVr5f82dRqBAGTbfePCxIidUtaRKhHo",
  authDomain: "gonzalezfamilytree-657b9.firebaseapp.com",
  projectId: "gonzalezfamilytree-657b9",
  storageBucket: "gonzalezfamilytree-657b9.firebasestorage.app",
  messagingSenderId: "400439887654",
  appId: "1:400439887654:web:b45c1ea099aca1a14b23e7"
};

// Initialisation Firebase (VERSION 8 — nécessaire pour ton projet)
firebase.initializeApp(firebaseConfig);

// Services Firebase utilisés dans ton site
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
