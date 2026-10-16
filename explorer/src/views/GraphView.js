import cytoscape from "../../vendor/cytoscape.js";

export class GraphView {
  static COLORS = {
    domain: "#168b92",
    ip: "#8b6dc5",
    page: "#5e8cc7",
    technology: "#c58d43",
    certificate: "#4d9a7a",
    sitemap: "#b66e97",
  };
  static FILLS = {
    domain: "#edf8f7",
    ip: "#f3effa",
    page: "#eff4fb",
    technology: "#fcf5e9",
    certificate: "#eef8f1",
    sitemap: "#faf0f5",
  };

  constructor(container, onSelect, onZoom) {
    this.records = new Map();
    this.icons = new Map();
    this.cy = cytoscape({
      container,
      elements: [],
      minZoom: 0.15,
      maxZoom: 3,
      style: [
        {
          selector: "node",
          style: {
            width: 40,
            height: 40,
            "background-color": (node) => GraphView.FILLS[node.data("type")],
            "border-color": (node) => GraphView.COLORS[node.data("type")],
            "border-width": 1.3,
            label: "data(label)",
            color: "#6b7c8d",
            "font-size": 11,
            "font-family": "Segoe UI, Arial, sans-serif",
            "text-valign": "bottom",
            "text-margin-y": 9,
            "text-wrap": "ellipsis",
            "text-max-width": 105,
            "text-outline-color": "#fbfcfd",
            "text-outline-width": 3,
            "background-image": (node) => this.icon(node.data("type")),
            "background-width": "47%",
            "background-height": "47%",
          },
        },
        {
          selector: "node.root",
          style: {
            width: 56,
            height: 56,
            "border-width": 2,
            "font-size": 13,
            "font-weight": 600,
            color: "#375e68",
          },
        },
        {
          selector: "edge",
          style: {
            width: 1.15,
            "line-color": "#cdd9e1",
            "target-arrow-color": "#cdd9e1",
            "target-arrow-shape": "triangle",
            "arrow-scale": 0.65,
            "curve-style": "bezier",
            "control-point-step-size": 35,
            opacity: 0.8,
          },
        },
        {
          selector: "edge.inferred",
          style: { "line-style": "dashed", "line-dash-pattern": [5, 4] },
        },
        {
          selector: "node:selected",
          style: {
            "border-width": 3,
            "overlay-color": "#6daeb5",
            "overlay-opacity": 0.13,
            "overlay-padding": 7,
          },
        },
        {
          selector: "edge:selected",
          style: {
            width: 2.4,
            "line-color": "#398e94",
            "target-arrow-color": "#398e94",
            opacity: 1,
            label: (edge) => edge.data("relationType").replaceAll("_", " "),
            "font-size": 9,
            color: "#39858d",
            "text-background-color": "#fff",
            "text-background-opacity": 1,
            "text-background-padding": 4,
            "text-rotation": "autorotate",
          },
        },
      ],
    });
    this.cy.on("tap", "node", (event) =>
      onSelect("node", this.records.get(event.target.id())),
    );
    this.cy.on("tap", "edge", (event) =>
      onSelect("edge", {
        ...this.records.get(event.target.id()),
        index: event.target.data("index"),
      }),
    );
    this.cy.on("zoom", () => onZoom(Math.round(this.cy.zoom() * 100)));
    this.resizeObserver = new ResizeObserver(() => this.cy.resize());
    this.resizeObserver.observe(container);
  }

  icon(type) {
    if (this.icons.has(type)) return this.icons.get(type);
    const paths = {
      domain:
        '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 7h14M5 17h14"/>',
      ip: '<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.1M7 17.5h.1M16 6.5h2M16 17.5h2"/>',
      page: '<path d="M14 2H5v20h14V7zM14 2v6h5M8 12h7M8 16h7"/>',
      technology: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>',
      certificate:
        '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6zM8 12l3 3 5-6"/>',
      sitemap:
        '<rect x="9" y="2" width="6" height="5" rx="1"/><path d="M12 7v6M5 17v-4h14v4"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/>',
    };
    const icon =
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${GraphView.COLORS[type]}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths[type]}</svg>`,
      );
    this.icons.set(type, icon);
    return icon;
  }

  load(document) {
    this.cy.elements().remove();
    this.records.clear();
    if (!document) return;
    for (const node of document.nodes) this.records.set(`n:${node.id}`, node);
    document.edges.forEach((edge, index) =>
      this.records.set(`e:${index}`, edge),
    );
    this.cy.add([
      ...document.nodes.map((node) => ({
        group: "nodes",
        data: {
          id: `n:${node.id}`,
          label:
            node.label.length > 120
              ? node.label.slice(0, 117) + "…"
              : node.label,
          type: node.type,
        },
        classes: node.id === `domain:${document.target}` ? "root" : "",
      })),
      ...document.edges.map((edge, index) => ({
        group: "edges",
        data: {
          id: `e:${index}`,
          source: `n:${edge.source}`,
          target: `n:${edge.target}`,
          relationType: edge.type,
          index,
        },
        classes: edge.verification === "inferred" ? "inferred" : "",
      })),
    ]);
  }

  filter(visible) {
    const ids = new Set([
      ...visible.nodes.map((node) => `n:${node.id}`),
      ...visible.edges.map((edge) => `e:${edge.index}`),
    ]);
    this.cy.batch(() =>
      this.cy
        .elements()
        .forEach((element) =>
          element.style("display", ids.has(element.id()) ? "element" : "none"),
        ),
    );
  }

  layout(name) {
    const elements = this.cy
      .elements()
      .filter((element) => element.style("display") !== "none");
    if (elements.nodes().empty()) return;
    elements
      .layout({
        name,
        animate: false,
        fit: true,
        padding: 55,
        randomize: false,
        nodeDimensionsIncludeLabels: true,
        nodeRepulsion: () => 6500,
        idealEdgeLength: () => 75,
        gravity: 0.3,
        numIter: 1500,
        componentSpacing: 100,
        concentric: (node) => node.degree(),
        levelWidth: () => 3,
      })
      .run();
  }

  fit() {
    const elements = this.cy
      .elements()
      .filter((element) => element.style("display") !== "none");
    if (elements.nonempty()) this.cy.fit(elements, 55);
  }

  zoom(factor) {
    this.cy.zoom({
      level: this.cy.zoom() * factor,
      renderedPosition: { x: this.cy.width() / 2, y: this.cy.height() / 2 },
    });
  }

  select(kind, record) {
    this.clearSelection();
    this.cy
      .getElementById(kind === "node" ? `n:${record.id}` : `e:${record.index}`)
      .select();
  }

  clearSelection() {
    this.cy.elements().unselect();
  }

  resize() {
    this.cy.resize();
  }
}
