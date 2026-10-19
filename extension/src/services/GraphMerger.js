import { ConnectorSettings } from "../models/ConnectorSettings.js";

export class GraphMerger {
  merge(local, remote) {
    if (remote.target !== local.target || remote.source !== "probe")
      throw new Error(
        "The connector returned data for a different target or source.",
      );
    const result = JSON.parse(JSON.stringify(local));
    result.nodes = this.entities(
      local.nodes,
      remote.nodes,
      (node) => node.id,
      "source",
    );
    result.edges = this.entities(
      local.edges,
      remote.edges,
      (edge) => JSON.stringify([edge.source, edge.target, edge.type]),
      "source_tool",
    );
    for (const [module, data] of Object.entries(remote.results)) {
      if (!ConnectorSettings.MODULES.includes(module))
        throw new Error("The connector returned an unsupported result module.");
      result.results[module] = data;
    }
    result.errors.push(...remote.errors);
    result.status =
      result.errors.length || remote.status !== "complete"
        ? "partial"
        : "complete";
    return result;
  }

  entities(local, remote, identity, sourceKey) {
    const entries = new Map(local.map((entity) => [identity(entity), entity]));
    for (const entity of remote) {
      const key = identity(entity);
      const previous = entries.get(key);
      if (!previous) {
        entries.set(key, entity);
        continue;
      }
      const strongest =
        entity.confidence > previous.confidence ? entity : previous;
      entries.set(key, {
        ...strongest,
        evidence: {
          ...strongest.evidence,
          observations: [
            {
              source: previous[sourceKey],
              collected_at: previous.collected_at,
              evidence: previous.evidence,
            },
            {
              source: entity[sourceKey],
              collected_at: entity.collected_at,
              evidence: entity.evidence,
            },
          ],
        },
      });
    }
    return [...entries.values()];
  }
}
