// Ajout d'une personne dans Firestore
const form = document.getElementById("form");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const person = {
    firstname: document.getElementById("firstname").value.trim(),
    lastname: document.getElementById("lastname").value.trim(),
    birth: document.getElementById("birth").value.trim(),
    death: document.getElementById("death").value.trim(),
    notes: document.getElementById("notes").value.trim(),
    parents: [],
    children: []
  };

  try {
    await db.collection("persons").add(person);
    alert("✅ Personne ajoutée !");
    form.reset();
  } catch (err) {
    alert("❌ Erreur : " + err.message);
  }
});
