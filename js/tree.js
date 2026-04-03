firebase.auth().onAuthStateChanged(async function(user) {
  if (!user) return;
  await buildTree();
});

async function buildTree() {
  try {
    const snapshot = await db.collection("persons").get();

    if (snapshot.empty) {
      document.getElementById("loadingMsg").textContent = "Aucune personne enregistrée.";
      return;
    }

    const nodes = [];
    const edges = [];
    const persons = {};

    // Collecte toutes les personnes
    snapshot.forEach(doc => {
      const p = doc.data();
      persons[doc.id] = { id: doc.id, ...p };
    });

    // Crée les nœuds
    Object.values(persons).forEach(p => {
      let label = (p.firstName || "") + " " + (p.lastName || "");

      // Ajout des dates
      let dates = "";
      if (p.birthDate) dates += "° " + formatYear(p.birthDate);
      if (p.deathDate) dates += "  † " + formatYear(p.deathDate);
      if (dates) label += "\n" + dates;

      nodes.push({
        id: p.id,
        label: label,
        shape: "box",
        font: { size: 13, face: "Arial", multi: false },
        color: {
          background: p.deathDate ? "#e8e8e8" : "#ffffff",
          border: p.deathDate ? "#aaaaaa" : "#2c5f8a",
          highlight: { background: "#ddeeff", border: "#1a3f6f" }
        },
        borderWidth: 2,
        shadow: false,
        margin: 10
      });
    });

    // Crée les liens (relations parent → enfant)
    Object.values(persons).forEach(p => {
      if (p.fatherId && persons[p.fatherId]) {
        edges.push({
          from: p.fatherId,
          to: p.id,
          arrows: "to",
          color: { color: "#4a90d9" },
          smooth: { type: "cubicBezier" }
        });
      }
      if (p.motherId && persons[p.motherId]) {
        edges.push({
          from: p.motherId,
          to: p.id,
          arrows: "to",
          color: { color: "#d9609a" },
          smooth: { type: "cubicBezier" }
        });
      }
      // Lien conjoint (pointillé horizontal)
      if (p.spouseId && persons[p.spouseId] && p.id < p.spouseId) {
        edges.push({
          from: p.id,
          to: p.spouseId,
          arrows: "",
          dashes: true,
          color: { color: "#999999" },
          smooth: { type: "horizontal" }
        });
      }
    });

    // Supprime le message de chargement
    document.getElementById("loadingMsg").style.display = "none";

    // Options vis.js
    const options = {
      layout: {
        hierarchical: {
          direction: "UD",
          sortMethod: "directed",
          levelSeparation: 120,
          nodeSpacing: 160,
          treeSpacing: 200
        }
      },
      physics: { enabled: false },
      interaction: {
        dragNodes: false,
        hover: true,
        tooltipDelay: 200,
        zoomView: true,
        dragView: true
      },
      nodes: {
        widthConstraint: { minimum: 120, maximum: 180 }
      }
    };

    const container = document.getElementById("tree-container");
    const data = {
      nodes: new vis.DataSet(nodes),
      edges: new vis.DataSet(edges)
    };

    const network = new vis.Network(container, data, options);

    // Clic sur un nœud → fiche personne
    network.on("click", function(params) {
      if (params.nodes.length > 0) {
        const personId = params.nodes[0];
        window.location.href = "person.html?id=" + personId;
      }
    });

    // Curseur pointer au survol
    network.on("hoverNode", function() {
      container.style.cursor = "pointer";
    });
    network.on("blurNode", function() {
      container.style.cursor = "default";
    });

  } catch (err) {
    console.error("Erreur arbre :", err.message);
    document.getElementById("loadingMsg").textContent = "Erreur lors du chargement.";
  }
}

function formatYear(dateStr) {
  if (!dateStr) return "";
  return dateStr.split("-")[0];
}
