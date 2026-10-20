import { DocumentValidator } from "./DocumentValidator.js";

/** Merges multiple w3bm@p collection documents into a unified investigation graph. */
export class CollectionMerger {
  constructor(validator = new DocumentValidator()) {
    this.validator = validator;
  }

  merge(documents) {
    if (!Array.isArray(documents) || documents.length === 0) {
      throw new Error("Provide at least one collection to merge.");
    }

    for (let i = 0; i < documents.length; i++) {
      try {
        this.validator.validate(documents[i]);
      } catch (error) {
        throw new Error(`Collection ${i + 1} is invalid: ${error.message}`);
      }
    }

    if (documents.length === 1) {
      return JSON.parse(JSON.stringify(documents[0]));
    }

    const targets = [...new Set(documents.map((doc) => doc.target).filter(Boolean))];
    const target = targets.length === 1
      ? targets[0]
      : `Investigation: ${targets.slice(0, 3).join(", ")}${targets.length > 3 ? ` (+${targets.length - 3} more)` : ""}`;

    // Source prioritizes extension, then probe, then cli
    const sources = documents.map((doc) => doc.source);
    const source = sources.includes("extension") ? "extension" : sources.includes("probe") ? "probe" : "cli";

    // Latest collection timestamp
    const timestamps = documents.map((doc) => doc.collected_at).filter(Boolean);
    timestamps.sort();
    const collected_at = timestamps.at(-1) ?? new Date().toISOString();

    // Overall status: failed if all failed, complete if all complete, else partial
    const statuses = documents.map((doc) => doc.status);
    const status = statuses.every((s) => s === "complete")
      ? "complete"
      : statuses.every((s) => s === "failed")
        ? "failed"
        : "partial";

    // Deduplicate and merge nodes by ID
    const nodeMap = new Map();
    for (const doc of documents) {
      for (const node of doc.nodes ?? []) {
        if (!nodeMap.has(node.id)) {
          nodeMap.set(node.id, {
            id: node.id,
            type: node.type,
            label: node.label,
            source: node.source,
            collected_at: node.collected_at,
            evidence: { ...node.evidence },
            confidence: node.confidence,
          });
        } else {
          const existing = nodeMap.get(node.id);
          existing.confidence = Math.max(existing.confidence, node.confidence);
          existing.evidence = { ...existing.evidence, ...node.evidence };
          if (node.collected_at && (!existing.collected_at || node.collected_at > existing.collected_at)) {
            existing.collected_at = node.collected_at;
          }
          if (node.label && (!existing.label || (existing.label.length < node.label.length && !node.label.includes("://")))) {
            existing.label = node.label;
          }
        }
      }
    }

    // Deduplicate and merge edges by source + type + target
    const edgeMap = new Map();
    for (const doc of documents) {
      for (const edge of doc.edges ?? []) {
        // Drop dangling relationships if endpoints are missing
        if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) continue;

        const key = `${edge.source}:::${edge.type}:::${edge.target}`;
        if (!edgeMap.has(key)) {
          edgeMap.set(key, {
            source: edge.source,
            target: edge.target,
            type: edge.type,
            source_tool: edge.source_tool,
            collected_at: edge.collected_at,
            evidence: { ...edge.evidence },
            confidence: edge.confidence,
            verification: edge.verification,
          });
        } else {
          const existing = edgeMap.get(key);
          existing.confidence = Math.max(existing.confidence, edge.confidence);
          if (edge.verification === "observed" || existing.verification === "observed") {
            existing.verification = "observed";
          }
          existing.evidence = { ...existing.evidence, ...edge.evidence };
          if (edge.collected_at && (!existing.collected_at || edge.collected_at > existing.collected_at)) {
            existing.collected_at = edge.collected_at;
          }
        }
      }
    }

    // Merge module results and crawl reports
    const results = {};
    for (const doc of documents) {
      if (!doc.results) continue;
      for (const [module, data] of Object.entries(doc.results)) {
        if (module === "crawl" && typeof data === "object" && data !== null) {
          if (!results.crawl) {
            results.crawl = {
              visited_hosts: data.visited_hosts ?? 0,
              visited_pages: data.visited_pages ?? 0,
              stop_reason: data.stop_reason ?? "complete",
              remaining_urls: data.remaining_urls ?? 0,
              hosts: { ...(data.hosts ?? {}) },
              pages: [...(data.pages ?? [])],
            };
          } else {
            results.crawl.visited_hosts += data.visited_hosts ?? 0;
            results.crawl.visited_pages += data.visited_pages ?? 0;
            results.crawl.hosts = { ...results.crawl.hosts, ...(data.hosts ?? {}) };
            const existingUrls = new Set(results.crawl.pages.map((p) => p.url));
            for (const page of data.pages ?? []) {
              if (!existingUrls.has(page.url)) {
                results.crawl.pages.push(page);
                existingUrls.add(page.url);
              }
            }
          }
        } else if (typeof data === "object" && data !== null && !Array.isArray(data)) {
          results[module] = { ...(results[module] ?? {}), ...data };
        } else {
          results[module] = data;
        }
      }
    }

    // Deduplicate errors
    const errorMap = new Map();
    for (const doc of documents) {
      for (const error of doc.errors ?? []) {
        const key = `${error.module}:::${error.code}:::${error.message}`;
        if (!errorMap.has(key)) errorMap.set(key, error);
      }
    }

    const merged = {
      schema_version: "1.0",
      tool: "w3bm@p",
      target,
      source,
      collected_at,
      status,
      nodes: [...nodeMap.values()],
      edges: [...edgeMap.values()],
      results,
      errors: [...errorMap.values()],
    };

    this.validator.validate(merged);
    return merged;
  }
}
