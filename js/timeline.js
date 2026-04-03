// Affichage chronologique des membres de la famille

db.collection("persons")
  .orderBy("birth")
  .onSnapshot(snapshot => {
    const container = document.getElementById("timeline");
    container.innerHTML = "";

    snapshot.forEach(doc => {
      const p = doc.data();
      const birth = p.birth || "?";

      container.innerHTML += `
        <div style="padding: 12px 0; border-bottom: 1px solid #ddd;">
          <strong>${birth}</strong> — ${p.firstname} ${p.lastname}
        </div>
      `;
    });
  });
``
