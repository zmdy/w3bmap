export class SampleFactory {
  create() {
    const collectedAt = "2026-10-16T12:00:00Z";
    const definitions = [
      ["domain:example.com", "domain", "example.com"],
      ["domain:assets.example.com", "domain", "assets.example.com"],
      ["domain:ns.example.net", "domain", "ns.example.net"],
      ["ip:198.51.100.20", "ip", "198.51.100.20"],
      ["ip:198.51.100.21", "ip", "198.51.100.21"],
      ["page:https://example.com/", "page", "/"],
      ["page:https://example.com/about", "page", "/about"],
      ["page:https://example.com/blog", "page", "/blog"],
      ["page:https://example.com/contact", "page", "/contact"],
      ["technology:wordpress", "technology", "WordPress"],
      ["technology:php", "technology", "PHP"],
      ["technology:nginx", "technology", "nginx"],
      ["technology:jquery", "technology", "jQuery"],
      ["technology:bootstrap", "technology", "Bootstrap"],
      ["certificate:sample-origin", "certificate", "Origin TLS"],
      ["certificate:sample-assets", "certificate", "Assets TLS"],
      ["sitemap:https://example.com/sitemap.xml", "sitemap", "sitemap.xml"],
    ];
    const nodes = definitions.map(([id, type, label]) => ({
      id,
      type,
      label,
      source: "cli",
      collected_at: collectedAt,
      evidence:
        type === "technology"
          ? {
              sample: true,
              url: "https://example.com/",
              indicator: label === "WordPress" ? "/wp-content/" : label,
            }
          : {
              sample: true,
              note: "Synthetic demonstration data. No network request was made.",
            },
      confidence: type === "technology" ? 0.8 : 1,
    }));
    const root = "domain:example.com";
    const relations = [
      [root, "ip:198.51.100.20", "resolves_to"],
      ["domain:assets.example.com", "ip:198.51.100.21", "resolves_to"],
      [root, "domain:ns.example.net", "nameserver"],
      [root, "domain:assets.example.com", "loads_resources_from"],
      [root, "certificate:sample-origin", "presents"],
      ["domain:assets.example.com", "certificate:sample-assets", "presents"],
      [root, "sitemap:https://example.com/sitemap.xml", "declares"],
      ...nodes
        .filter((node) => node.type === "page")
        .map((node) => [root, node.id, "contains"]),
      ...nodes
        .filter((node) => node.type === "technology")
        .map((node) => [root, node.id, "uses"]),
      [
        "page:https://example.com/",
        "page:https://example.com/about",
        "links_to",
      ],
      [
        "page:https://example.com/",
        "page:https://example.com/blog",
        "links_to",
      ],
      [
        "page:https://example.com/about",
        "page:https://example.com/contact",
        "links_to",
      ],
      ["page:https://example.com/blog", "technology:wordpress", "uses"],
      ["page:https://example.com/", "technology:bootstrap", "uses"],
      ["domain:assets.example.com", "technology:nginx", "uses"],
    ];
    const edges = relations.map(([source, target, type]) => ({
      source,
      target,
      type,
      source_tool: "cli",
      collected_at: collectedAt,
      evidence: {
        sample: true,
        note: "Synthetic relationship for interface demonstration.",
      },
      confidence: type === "uses" ? 0.8 : 1,
      verification: type === "uses" ? "inferred" : "observed",
    }));
    return {
      schema_version: "1.0",
      tool: "w3bm@p",
      target: "example.com",
      source: "cli",
      collected_at: collectedAt,
      status: "partial",
      nodes,
      edges,
      results: {
        dns: {
          note: "Synthetic DNS results. Documentation addresses are used.",
        },
        headers: {
          url: "https://example.com/",
          status: 200,
          headers: { server: ["nginx"], "x-powered-by": ["PHP"] },
        },
        technologies: {
          note: "Synthetic technology indicators, not verified detections.",
        },
      },
      errors: [
        {
          module: "rdap",
          code: "sample_error",
          message: "Demonstration of a module error. No RDAP query was made.",
        },
      ],
    };
  }
}
