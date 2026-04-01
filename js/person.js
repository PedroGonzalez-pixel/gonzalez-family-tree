// Récupérer l'ID de la personne dans l'URL
const url = new URL(window.location.href);
const id = url.searchParams.get("id");

// Charger les données depuis Firestore
db.collection("persons").doc(id).get().then(doc => {
  if (!doc.exists) {
    document.getElementById("name").innerText = "Personne inconnue";
    return;
  }

  const p = doc.data();

  // Afficher le nom en titre
  document.getElementById("name").innerText =
    (p.firstname || "") + " " + (p.lastname || "");

  // Afficher les autres informations
  document.getElementById("details").innerHTML = `
    <p><strong>Naissance :</strong> ${p.birth || "?"}</p>
    <p><strong>Décès :</strong> ${p.death || "?"}</p>
    <p><strong>Notes :</strong><br>${p.notes || "(aucune note)"}</p>
  `;
});
