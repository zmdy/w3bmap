export class GraphBuilder {
  build(snapshot, technologies) {
    const page = new URL(snapshot.url);
    const nodes = new Map();
    const edges = new Map();
    const node = (id, type, label, evidence, confidence = 1) => {
      if (!nodes.has(id))
        nodes.set(id, {
          id,
          type,
          label,
          source: "extension",
          collected_at: snapshot.collected_at,
          evidence,
          confidence,
        });
    };
    const edge = (source, target, type, evidence, confidence = 1) => {
      const key = JSON.stringify([source, target, type]);
      if (!edges.has(key))
        edges.set(key, {
          source,
          target,
          type,
          source_tool: "extension",
          collected_at: snapshot.collected_at,
          evidence,
          confidence,
          verification: confidence === 1 ? "observed" : "inferred",
        });
    };
    const registerPage = (value, evidence) => {
      const url = new URL(value);
      node(`domain:${url.hostname}`, "domain", url.hostname, { url: value });
      node(
        `page:${value}`,
        "page",
        url.pathname === "/" ? url.hostname : `${url.hostname}${url.pathname}`,
        evidence,
      );
      edge(`domain:${url.hostname}`, `page:${value}`, "contains", evidence);
      return url;
    };
    registerPage(snapshot.url, { url: snapshot.url, title: snapshot.title });
    for (const link of snapshot.links) {
      registerPage(link.url, { discovered_on: snapshot.url, kind: "link" });
      edge(`page:${snapshot.url}`, `page:${link.url}`, "links_to", {
        discovered_on: snapshot.url,
      });
    }
    for (const resource of snapshot.resources) {
      const observedRequest = resource.observed_via?.includes("performance");
      const evidence = {
        discovered_on: snapshot.url,
        kind: resource.kind,
        observed_via: resource.observed_via ?? "dom",
      };
      const resourceUrl = registerPage(resource.url, evidence);
      edge(
        `page:${snapshot.url}`,
        `page:${resource.url}`,
        observedRequest ? "requests_resource" : "references_resource",
        evidence,
      );
      if (resourceUrl.hostname !== page.hostname) {
        edge(
          `domain:${page.hostname}`,
          `domain:${resourceUrl.hostname}`,
          observedRequest
            ? "requests_resources_from"
            : "references_resources_from",
          evidence,
        );
      }
    }
    for (const technology of technologies) {
      node(
        `technology:${technology.id}`,
        "technology",
        technology.name,
        technology.evidence,
        technology.confidence,
      );
      edge(
        `domain:${page.hostname}`,
        `technology:${technology.id}`,
        "uses",
        technology.evidence,
        technology.confidence,
      );
    }
    return {
      schema_version: "1.0",
      tool: "w3bm@p",
      target: page.hostname,
      source: "extension",
      collected_at: snapshot.collected_at,
      status: "complete",
      nodes: [...nodes.values()],
      edges: [...edges.values()],
      results: {
        browser: {
          page: snapshot.url,
          title: snapshot.title,
          links: snapshot.links,
          resources: snapshot.resources,
          technologies,
          limits: { links: 250, resources: 250 },
          note: "URL queries and fragments are omitted. Resources are represented as page entities with kind evidence.",
        },
      },
      errors: [],
    };
  }
}
