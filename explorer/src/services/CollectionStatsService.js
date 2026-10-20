/**
 * Counts what a collection actually contains so the Inspector can show general
 * figures next to any selection. Every number is derived from the loaded
 * document; nothing is estimated.
 */
export class CollectionStatsService {
  static LINK_TYPES = new Set(["links_to"]);
  static RESOURCE_TYPES = new Set([
    "references_resource",
    "requests_resource",
  ]);
  static TYPE_LABELS = {
    domain: "Domains",
    ip: "IP addresses",
    page: "Pages",
    technology: "Technologies",
    certificate: "Certificates",
    sitemap: "Sitemaps",
  };

  overview(document, visible = null) {
    if (!document) return null;
    const nodes = visible?.nodes ?? document.nodes;
    const edges = visible?.edges ?? document.edges;
    const types = Object.fromEntries(
      Object.keys(CollectionStatsService.TYPE_LABELS).map((type) => [
        type,
        nodes.filter((node) => node.type === type).length,
      ]),
    );
    const hosts = new Set();
    for (const node of nodes) {
      if (node.type === "domain") hosts.add(node.label);
      if (node.type !== "page") continue;
      try {
        hosts.add(new URL(node.id.slice(node.id.indexOf(":") + 1)).host);
      } catch {
        /* Pages without a parsable URL do not contribute a host. */
      }
    }
    return {
      entities: nodes.length,
      relationships: edges.length,
      types,
      hosts: hosts.size,
      links: edges.filter((edge) =>
        CollectionStatsService.LINK_TYPES.has(edge.type),
      ).length,
      resources: edges.filter((edge) =>
        CollectionStatsService.RESOURCE_TYPES.has(edge.type),
      ).length,
      inferred: edges.filter((edge) => edge.verification === "inferred").length,
      filtered: Boolean(visible) && nodes.length !== document.nodes.length,
      errors: document.errors?.length ?? 0,
      modules: Object.keys(document.results ?? {}).length,
    };
  }

  /** Figures for one entity: its relationships, neighbours, and technologies. */
  forNode(document, node) {
    const edges = (document?.edges ?? []).filter(
      (edge) => edge.source === node.id || edge.target === node.id,
    );
    const neighbours = new Set(
      edges.map((edge) => (edge.source === node.id ? edge.target : edge.source)),
    );
    const counted = Object.fromEntries(
      Object.keys(CollectionStatsService.TYPE_LABELS).map((type) => [type, 0]),
    );
    for (const id of neighbours) {
      const entity = document.nodes.find((item) => item.id === id);
      if (entity) counted[entity.type]++;
    }
    return {
      relationships: edges.length,
      neighbours: neighbours.size,
      types: counted,
      links: edges.filter((edge) =>
        CollectionStatsService.LINK_TYPES.has(edge.type),
      ).length,
    };
  }

  /** Figures for a Tree view folder, computed from the entities it contains. */
  forFolder(document, folder) {
    const entities = this.collect(folder);
    const technologies = new Set();
    const ids = new Set(entities.map((entity) => entity.id));
    for (const edge of document?.edges ?? []) {
      for (const [from, to] of [
        [edge.source, edge.target],
        [edge.target, edge.source],
      ]) {
        if (ids.has(from) && to.startsWith("technology:"))
          technologies.add(to);
      }
    }
    const collected = entities
      .map((entity) => entity.collected_at)
      .filter(Boolean)
      .sort();
    return {
      items: entities.length,
      folders: folder.folders.length,
      hosts: folder.hosts.length,
      technologies: [...technologies],
      sources: [...new Set(entities.map((entity) => entity.source))].sort(),
      first: collected[0] ?? null,
      last: collected.at(-1) ?? null,
    };
  }

  collect(folder, found = []) {
    for (const entity of folder.entities) found.push(entity.node);
    for (const child of folder.folders) this.collect(child, found);
    return found;
  }
}
