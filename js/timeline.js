// Affichage chronologique des membres de la famille

db.collection("persons")
  .orderBy("birthDate")
  .onSnapshot(snapshot => {
    const container = document.getElementById("timeline");
    container.innerHTML = "";

    snapshot.forEach(doc => {
      const p = doc.data();
      const birth = p.birthDate || "?";

      container.innerHTML += `
        <div style="padding: 12px 0; border-bottom: 1px solid #ddd;">
          <strong>${birth}</strong> — ${p.firstname} ${p.lastname}
        </div>
      `;
    });
  });
``
