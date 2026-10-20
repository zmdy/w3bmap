export class GraphFilters {
  static TYPES = [
    "domain",
    "ip",
    "page",
    "asset",
    "technology",
    "certificate",
    "sitemap",
  ];

  constructor() {
    this.reset();
  }

  reset() {
    this.query = "";
    this.types = new Set(GraphFilters.TYPES);
    this.minConfidence = 0;
    this.showInferred = true;
    this.source = "all";
  }
}

export class GraphModel {
  #document = null;

  constructor() {
    this.filters = new GraphFilters();
    this.name = "";
    this.isSample = false;
  }

  load(document, name, isSample = false) {
    this.#document = JSON.parse(JSON.stringify(document));
    this.name = name;
    this.isSample = isSample;
    this.filters.reset();
  }

  clear() {
    this.#document = null;
    this.name = "";
    this.isSample = false;
    this.filters.reset();
  }

  get document() {
    return this.#document;
  }

  get counts() {
    return Object.fromEntries(
      GraphFilters.TYPES.map((type) => [
        type,
        this.#document?.nodes.filter((node) => node.type === type).length ?? 0,
      ]),
    );
  }

  visible() {
    const query = this.filters.query.trim().toLowerCase();
    const nodes = (this.#document?.nodes ?? []).filter(
      (node) =>
        this.filters.types.has(node.type) &&
        node.confidence >= this.filters.minConfidence &&
        (this.filters.source === "all" ||
          node.source === this.filters.source) &&
        (!query ||
          `${node.label} ${node.id} ${node.type}`
            .toLowerCase()
            .includes(query)),
    );
    const ids = new Set(nodes.map((node) => node.id));
    const edges = (this.#document?.edges ?? [])
      .map((edge, index) => ({ ...edge, index }))
      .filter(
        (edge) =>
          ids.has(edge.source) &&
          ids.has(edge.target) &&
          edge.confidence >= this.filters.minConfidence &&
          (this.filters.showInferred || edge.verification !== "inferred") &&
          (this.filters.source === "all" ||
            edge.source_tool === this.filters.source),
      );
    return { nodes, edges };
  }

  exportJson() {
    if (!this.#document)
      throw new Error("Import a collection before exporting.");
    return JSON.stringify(this.#document, null, 2) + "\n";
  }
}
