export class GraphFilters {
  static MAX_TERMS = 25;

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
    this.terms = [];
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

  /** Renames the investigation. The name belongs to the document and is exported. */
  rename(name) {
    const value = String(name).trim().replace(/\s+/g, " ").slice(0, 120);
    if (!this.#document) throw new Error("Import a collection before renaming it.");
    if (!value) throw new Error("An investigation needs a name.");
    this.#document.target = value;
    return value;
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

  /** Added terms and the live query are independent filters; any match keeps a node. */
  needles() {
    const live = this.filters.query.trim().toLowerCase();
    return [...this.filters.terms, ...(live ? [live] : [])];
  }

  visible() {
    const needles = this.needles();
    const nodes = (this.#document?.nodes ?? []).filter(
      (node) =>
        this.filters.types.has(node.type) &&
        node.confidence >= this.filters.minConfidence &&
        (this.filters.source === "all" ||
          node.source === this.filters.source) &&
        (!needles.length ||
          needles.some((needle) =>
            `${node.label} ${node.id} ${node.type}`
              .toLowerCase()
              .includes(needle),
          )),
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

  /** How many entities of the whole collection a single term matches. */
  matching(term) {
    const needle = String(term).toLowerCase();
    return (this.#document?.nodes ?? []).filter((node) =>
      `${node.label} ${node.id} ${node.type}`.toLowerCase().includes(needle),
    ).length;
  }

  exportJson() {
    if (!this.#document)
      throw new Error("Import a collection before exporting.");
    return JSON.stringify(this.#document, null, 2) + "\n";
  }
}
