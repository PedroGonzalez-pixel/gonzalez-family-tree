// ========== TREE MODULE ==========
console.log("✅ tree.js loading...");

let treeData = null;
let currentUser = null;
let userRole = null;
let svg = null;
let g = null;
let simulation = null;
let zoom = null;

const TREE_ID = "gonzalez-tree";

// Au démarrage
document.addEventListener('DOMContentLoaded', function() {
    firebase.auth().onAuthStateChanged(async (user) => {
        if (!user) {
            window.location.href = 'index.html';
            return;
        }

        currentUser = user;
        
        // Vérifier le rôle
        try {
            const doc = await db.collection('authorizedUsers').doc(user.email).get();
            if (doc.exists) {
                userRole = doc.data().role || 'reader';
            }
        } catch (err) {
            console.warn("Could not check role:", err);
            userRole = 'reader';
        }

        console.log("User role:", userRole);
        loadTree();
    });
});

// Charger l'arbre
async function loadTree() {
    try {
        const snapshot = await db.collection('persons').get();
        treeData = {};
        
        snapshot.forEach(doc => {
            treeData[doc.id] = doc.data();
            treeData[doc.id].id = doc.id;
        });

        console.log(`✅ Loaded ${snapshot.size} persons`);
        renderTree();
    } catch (err) {
        console.error("Error loading tree:", err);
        document.getElementById('loadingMsg').textContent = 'Erreur chargement: ' + err.message;
    }
}

// Afficher l'arbre
function renderTree() {
    document.getElementById('loadingMsg').style.display = 'none';
    const container = document.getElementById('tree-container');
    container.style.display = 'block';
    container.innerHTML = '';

    if (!treeData || Object.keys(treeData).length === 0) {
        container.innerHTML = '<div style="padding:20px;">Aucune personne trouvée</div>';
        return;
    }

    // Configuration SVG
    const width = container.clientWidth;
    const height = container.clientHeight;

    svg = d3.select('#tree-container')
        .append('svg')
        .attr('width', width)
        .attr('height', height);

    g = svg.append('g');

    // Zoom
    zoom = d3.zoom()
        .on('zoom', (event) => {
            g.attr('transform', event.transform);
        });

    svg.call(zoom);

    // Préparer les nodes
    const nodes = Object.values(treeData).map(person => ({
        id: person.id,
        firstName: person.firstName || '',
        lastName: person.lastName || '',
        hasComments: false // sera rempli après
    }));

    // Vérifier commentaires
    db.collection('comments').get().then(snapshot => {
        const commentsByPerson = {};
        snapshot.forEach(doc => {
            const personId = doc.data().personId;
            if (!commentsByPerson[personId]) {
                commentsByPerson[personId] = [];
            }
            commentsByPerson[personId].push(doc.data());
        });

        nodes.forEach(node => {
            node.hasComments = commentsByPerson[node.id] && commentsByPerson[node.id].length > 0;
        });

        renderNodes(nodes, width, height);
    });
}

function renderNodes(nodes, width, height) {
    // Simulation
    simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink([]).id(d => d.id))
        .force('charge', d3.forceManyBody().strength(-300))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collide', d3.forceCollide(60));

    // Nodes
    const nodeGroup = g.selectAll('g.node')
        .data(nodes)
        .enter()
        .append('g')
        .attr('class', 'node')
        .call(d3.drag()
            .on('start', dragStarted)
            .on('drag', dragged)
            .on('end', dragEnded)
        );

    // Rectangles
    nodeGroup.append('rect')
        .attr('width', 140)
        .attr('height', 60)
        .attr('x', -70)
        .attr('y', -30)
        .attr('rx', 8)
        .attr('fill', '#0071e3')
        .attr('stroke', '#005BBD')
        .attr('stroke-width', 1.5)
        .style('cursor', 'pointer');

    // Texte nom
    nodeGroup.append('text')
        .attr('dy', -8)
        .attr('text-anchor', 'middle')
        .attr('fill', 'white')
        .attr('font-size', '13px')
        .attr('font-weight', '600')
        .text(d => `${d.firstName} ${d.lastName}`.trim());

    // Icône commentaires
    nodeGroup.append('text')
        .attr('dx', 50)
        .attr('dy', -20)
        .attr('text-anchor', 'middle')
        .attr('font-size', '16px')
        .text(d => d.hasComments ? '💬' : '')
        .style('pointer-events', 'none');

    // Double-clic pour person.html
    nodeGroup.on('dblclick', (event, d) => {
        console.log("Double-click on person:", d.id);
        window.location.href = `person.html?id=${d.id}`;
    });

    // Simulation update
    simulation.on('tick', () => {
        nodeGroup.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Réinitialiser la vue
    window.treeResetView = function() {
        svg.transition()
            .duration(750)
            .call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(1));
    };

    // Initialiser la vue
    window.treeResetView();
}

// Drag
function dragStarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
}

function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
}

function dragEnded(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
}

// Incrémenter version
function incrementVersion() {
    let version = localStorage.getItem('appVersion') || 'v1.0.0';
    let parts = version.substring(1).split('.');
    parts[2] = (parseInt(parts[2]) + 1).toString();
    version = 'v' + parts.join('.');
    localStorage.setItem('appVersion', version);
    console.log("Version updated to:", version);
}

console.log("✅ tree.js loaded");
