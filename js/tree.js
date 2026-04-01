// Charger toutes les personnes depuis Firestore
db.collection("persons").onSnapshot(snapshot => {
  const nodes = [];
  const edges = [];

  snapshot.forEach(doc => {
    const p = doc.data();

    // Chaque personne devient un node dans le graphe
    nodes.push({
      id: doc.id,
      label: p.firstname + " " + p.lastname,
      shape: "box",
      margin: 10,
      font: { size: 16 }
    });

    // Relations parents → enfants
    if (p.parents && Array.isArray(p.parents)) {
      p.parents.forEach(parentId => {
        edges.push({
          from: parentId,   // parent
          to: doc.id        // enfant
        });
      });
    }
  });

  const container = document.getElementById("tree");

  const data = {
    nodes: new vis.DataSet(nodes),
    edges: new vis.DataSet(edges)
  };

  const options = {
    layout: {
      hierarchical: {
        enabled: true,
        direction: "UD",   // UD = Up → Down
        sortMethod: "directed"
      }
    },
    nodes: {
      borderWidth: 1,
      color: {
        background: "#ffffff",
        border: "#cccccc",
        highlight: { background: "#e8f0fe", border: "#4285f4" }
      }
    },
    edges: {
      arrows: { to: { enabled: false } },
      smooth: false
    },
    physics: false
  };

  new vis.Network(container, data, options);
});
