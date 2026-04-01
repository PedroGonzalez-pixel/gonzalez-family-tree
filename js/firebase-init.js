// Configuration Firebase de ton projet
const firebaseConfig = {
  apiKey: "AIzaSyAKRVr5f82dRqBAGTbfePCxIidUtaRKhHo",
  authDomain: "gonzalezfamilytree-657b9.firebaseapp.com",
  projectId: "gonzalezfamilytree-657b9",
  storageBucket: "gonzalezfamilytree-657b9.firebasestorage.app",
  messagingSenderId: "400439887654",
  appId: "1:400439887654:web:b45c1ea099aca1a14b23e7"
};

// Initialisation Firebase (version 8)
firebase.initializeApp(firebaseConfig);

// Services
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
