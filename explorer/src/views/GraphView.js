import cytoscape from "../../vendor/cytoscape.js";
import { CategoryLayoutService } from "../services/CategoryLayoutService.js";

export class GraphView {
  static COLORS = {
    domain: "#168b92",
    ip: "#8b6dc5",
    page: "#5e8cc7",
    asset: "#7a8aa0",
    technology: "#c58d43",
    certificate: "#4d9a7a",
    sitemap: "#b66e97",
  };
  static FILLS = {
    domain: "#edf8f7",
    ip: "#f3effa",
    page: "#eff4fb",
    asset: "#f1f3f6",
    technology: "#fcf5e9",
    certificate: "#eef8f1",
    sitemap: "#faf0f5",
  };

  constructor(container, onSelect, onZoom, clusters) {
    this.clusters = clusters;
    this.layoutName = "categories";
    this.categoryLayout = new CategoryLayoutService();
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
          selector: "node.cluster",
          style: { "border-style": "dashed", "border-width": 2, width: 64, height: 64,
            "font-weight": 600, "text-max-width": 170 },
        },
        {
          selector: "node:parent",
          style: { "background-image": "none", "background-opacity": 0.25,
            "text-valign": "top", "text-margin-y": -9, padding: 28 },
        },
        {
          selector: "edge.aggregate",
          style: { width: 2, label: (edge) => `${edge.data("relationType").replaceAll("_", " ")} (${edge.data("indexes").length})`,
            "font-size": 9, "text-background-color": "#fff", "text-background-opacity": 0.9 },
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
          selector: "edge.related",
          style: { width: 2.5, "line-color": "#218d99", "target-arrow-color": "#218d99", opacity: 1 },
        },
        {
          selector: "node.related",
          style: { "border-width": 2.6, "text-opacity": 1 },
        },
        {
          selector: ".muted",
          style: { opacity: 0.16, "text-opacity": 0.3 },
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
    this.cy.on("tap", "node", (event) => {
      const data = event.target.data();
      if (data.clusterId) onSelect("cluster", data.clusterId);
      else onSelect("node", this.records.get(event.target.id()));
    });
    this.cy.on("tap", "edge", (event) => {
      const data = event.target.data();
      if (data.aggregate) onSelect("aggregate", data);
      else onSelect("edge", { ...this.records.get(event.target.id()), index: data.index });
    });
    this.cy.on("zoom", () => onZoom(Math.round(this.cy.zoom() * 100)));
    this.cy.on("tap", (event) => { if (event.target === this.cy) onSelect("clear", null); });
    this.resizeObserver = new ResizeObserver(() => this.cy.resize());
    this.resizeObserver.observe(container);
  }

  icon(type) {
    if (this.icons.has(type)) return this.icons.get(type);
    const safeType = Object.hasOwn(GraphView.COLORS, type) ? type : "domain";
    const icon = new URL(`../../assets/icons/graph-${safeType}.svg`, import.meta.url).href;
    this.icons.set(type, icon);
    return icon;
  }

  load(document) {
    this.cy.elements().remove();
    this.records.clear();
    this.document = document;
    if (!document) return;
    for (const node of document.nodes) this.records.set(`n:${node.id}`, node);
    document.edges.forEach((edge, index) => this.records.set(`e:${index}`, edge));
  }

  filter(visible) {
    const projection = this.clusters.project(visible);
    this.cy.batch(() => {
      this.cy.elements().remove();
      this.cy.add([
        ...projection.nodes.map((node) => ({ group: "nodes", data: node,
          classes: node.clusterId ? "cluster" : node.record?.id === `domain:${this.document?.target}` ? "root" : "" })),
        ...projection.edges.map((edge) => ({ group: "edges", data: edge,
          classes: `${edge.aggregate ? "aggregate" : ""} ${(edge.record?.verification ?? edge.verification) === "inferred" ? "inferred" : ""}` })),
      ]);
    });
    this.layout(this.layoutName);
  }

  layout(name) {
    this.layoutName = name;
    const elements = this.cy
      .elements()
      .filter((element) => element.style("display") !== "none");
    if (elements.nodes().empty()) return;
    if (name === "categories") {
      const positions = this.categoryLayout.positions(elements.nodes().map((node) => node.data()), `n:domain:${this.document?.target}`);
      elements.layout({ name: "preset", positions: (node) => positions.get(node.id()),
        animate: false, fit: true, padding: 65 }).run();
      return;
    }
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
    const selected = this.cy.getElementById(kind === "node" ? `n:${record.id}` : `e:${record.index}`);
    selected.select();
    this.highlight(selected);
  }

  focusGroup(id) {
    this.clearSelection();
    const group = this.cy.getElementById(`cluster:${id}`);
    this.highlight(group.union(group.descendants()));
  }

  focusAggregate(record) {
    this.clearSelection();
    this.highlight(this.cy.getElementById(record.id));
  }

  highlight(selected) {
    if (selected.empty()) return;
    let related = selected.closedNeighborhood().union(selected.edges().connectedNodes());
    // Parent outlines remain legible; unrelated siblings remain muted.
    related = related.union(related.nodes().ancestors());
    this.cy.elements().difference(related).addClass("muted");
    related.addClass("related");
  }

  clearSelection() {
    this.cy.elements().unselect();
    this.cy.elements().removeClass("muted related");
  }

  resize() {
    this.cy.resize();
  }
}
