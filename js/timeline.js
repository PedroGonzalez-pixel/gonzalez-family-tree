// Affichage chronologique des membres de la famille

db.collection("persons")
  .orderBy("birth")
  .onSnapshot(snapshot => {
    const div = document.getElementById("timeline");
    div.innerHTML = "";

    snapshot.forEach(doc => {
      const p = doc.data();

      div.innerHTML += `
        <div style="padding:10px 0;border-bottom:1px solid #ddd;">
          <strong>${p.birth || "?"}</strong> — ${p.firstname} ${p.lastname}
        </div>
      `;
    });
  });
``
