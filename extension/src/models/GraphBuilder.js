import { ResourceClassifier } from "../services/ResourceClassifier.js";

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
    // Pages are documents; stylesheets, scripts, media and downloads are assets.
    const register = (value, evidence, kind = "") => {
      const url = new URL(value);
      const type = ResourceClassifier.classify(value, kind);
      const id = `${type}:${value}`;
      node(`domain:${url.hostname}`, "domain", url.hostname, { url: value });
      node(
        id,
        type,
        url.pathname === "/" ? url.hostname : `${url.hostname}${url.pathname}`,
        { ...evidence, resource_type: type },
      );
      edge(`domain:${url.hostname}`, id, "contains", evidence);
      return { url, id, type };
    };
    const current = register(
      snapshot.url,
      { url: snapshot.url, title: snapshot.title },
      "document",
    ).id;
    for (const link of snapshot.links) {
      const target = register(link.url, {
        discovered_on: snapshot.url,
        kind: "link",
      });
      edge(
        current,
        target.id,
        target.type === "asset" ? "references_resource" : "links_to",
        { discovered_on: snapshot.url },
      );
    }
    for (const resource of snapshot.resources) {
      const observedRequest = resource.observed_via?.includes("performance");
      const evidence = {
        discovered_on: snapshot.url,
        kind: resource.kind,
        observed_via: resource.observed_via ?? "dom",
      };
      const target = register(resource.url, evidence, resource.kind);
      edge(
        current,
        target.id,
        observedRequest ? "requests_resource" : "references_resource",
        evidence,
      );
      if (target.url.hostname !== page.hostname) {
        edge(
          `domain:${page.hostname}`,
          `domain:${target.url.hostname}`,
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
        { ...technology.evidence, website: technology.website, category: technology.category, version: technology.version },
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
      schema_version: "1.1",
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
          technology_detection: {
            runtime_available: snapshot.runtimeAvailable ?? false,
            note: "Technology and version indicators are inferred. Missing versions are unknown; implied dependencies carry no version.",
          },
          limits: { links: 250, resources: 250 },
          note: "URL queries and fragments are omitted. Subresources are asset entities; documents are page entities.",
        },
      },
      errors: [],
    };
  }
}
