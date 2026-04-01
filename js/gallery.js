const fileInput = document.getElementById("file");
const uploadBtn = document.getElementById("upload");
const container = document.getElementById("photos");

// Upload photo
uploadBtn.addEventListener("click", async () => {
  const file = fileInput.files[0];
  if (!file) return alert("Veuillez sélectionner une image.");

  const ref = storage.ref("photos/" + Date.now() + "_" + file.name);

  try {
    // Upload
    await ref.put(file);
    const url = await ref.getDownloadURL();

    // Enregistrement en base
    await db.collection("media").add({
      url,
      type: "photo",
      timestamp: Date.now()
    });

    alert("✅ Photo uploadée !");
  } catch (err) {
    alert("❌ Erreur : " + err.message);
  }
});

// Affichage des photos
db.collection("media")
  .where("type", "==", "photo")
  .orderBy("timestamp", "desc")
  .onSnapshot(snapshot => {
    container.innerHTML = "";
    snapshot.forEach(doc => {
      const m = doc.data();
      container.innerHTML += `
        <img src="${m.url}" style="width:200px;border-radius:12px;margin:10px;">
      `;
    });
  });
