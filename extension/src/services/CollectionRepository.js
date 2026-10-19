export class CollectionRepository {
  static MAX_BYTES = 4 * 1024 * 1024;
  constructor(api) {
    this.api = api;
  }

  checkSize(document) {
    if (
      new TextEncoder().encode(JSON.stringify(document)).byteLength >
      CollectionRepository.MAX_BYTES
    ) {
      throw new Error(
        "This collection exceeds the 4 MiB extension storage limit.",
      );
    }
  }

  async save(document) {
    this.checkSize(document);
    const record = { id: crypto.randomUUID(), document };
    await this.api.storage.session.set({ collection: record });
    return record;
  }

  async latest() {
    return (
      (await this.api.storage.session.get("collection")).collection ?? null
    );
  }
  async clear() {
    await this.api.storage.session.remove("collection");
  }

  summary(record) {
    if (!record) return null;
    const data = record.document;
    return {
      id: record.id,
      target: data.target,
      collected_at: data.collected_at,
      status: data.status,
      nodes: data.nodes.length,
      edges: data.edges.length,
      errors: data.errors.length,
      connector: data.results.browser?.connector ?? null,
      entities: this.entities(data),
      metrics: {
        pages: data.nodes.filter((node) => node.type === "page" && (!node.evidence.kind || node.evidence.kind === "link")).length,
        domains: data.nodes.filter((node) => node.type === "domain").length,
        ips: data.nodes.filter((node) => node.type === "ip").length,
      },
      technologies: data.nodes
        .filter((node) => node.type === "technology")
        .map((node) => node.label),
      page: data.results.browser?.page ?? data.target,
      title: data.results.browser?.title ?? data.target,
    };
  }

  entities(document) {
    return document.nodes.map((node) => ({ id: node.id, label: node.label, type: node.type,
      evidence: { category: node.evidence?.category, issuer: node.evidence?.issuer, url: node.evidence?.url } }));
  }
}
