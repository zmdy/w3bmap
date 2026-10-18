import { EntityGroupingService } from "../services/EntityGroupingService.js";

/** Keeps expansion state outside the collection and the export contract. */
export class EntityClusterModel {
  constructor() { this.load([]); }

  load(nodes) {
    this.groups = new EntityGroupingService().groups(nodes).map((group) => ({ ...group, clustered: group.members.length > 1 }));
    this.expanded = new Set();
    this.membership = new Map(this.groups.flatMap((group) => group.members.map((node) => [node.id, group.id])));
  }

  visible(nodes) {
    const ids = new Set(nodes.map((node) => node.id));
    return this.groups.map((group) => ({ ...group, members: group.members.filter((node) => ids.has(node.id)) }))
      .filter((group) => group.members.length);
  }

  isOpen(id) { return this.expanded.has(id); }
  setOpen(id, open) { if (open) this.expanded.add(id); else this.expanded.delete(id); }
  expandNode(id) { this.expanded.add(this.membership.get(id)); }
  setAll(open) { this.expanded = new Set(open ? this.groups.map((group) => group.id) : []); }

  project(visible) {
    const nodes = [], edges = [], representatives = new Map();
    for (const group of this.visible(visible.nodes)) {
      const clustered = group.clustered;
      const id = `cluster:${group.id}`;
      const open = this.isOpen(group.id);
      if (clustered) nodes.push({ id, label: `${group.label} (${group.members.length})`, type: group.type,
        clusterId: group.id, expanded: open, count: group.members.length });
      for (const node of group.members) {
        representatives.set(node.id, clustered && !open ? id : `n:${node.id}`);
        if (!clustered || open) nodes.push({ id: `n:${node.id}`, label: node.label, type: node.type,
          record: node, ...(clustered ? { parent: id } : {}) });
      }
    }
    const aggregated = new Map();
    for (const edge of visible.edges) {
      const source = representatives.get(edge.source), target = representatives.get(edge.target);
      if (!source || !target || source === target) continue;
      const original = source === `n:${edge.source}` && target === `n:${edge.target}`;
      if (original) edges.push({ id: `e:${edge.index}`, source, target, relationType: edge.type, record: edge, index: edge.index });
      else {
        const key = JSON.stringify([source, target, edge.type, edge.verification]);
        if (!aggregated.has(key)) aggregated.set(key, { id: `aggregate:${key}`, source, target,
          relationType: edge.type, verification: edge.verification, indexes: [], aggregate: true });
        aggregated.get(key).indexes.push(edge.index);
      }
    }
    edges.push(...aggregated.values());
    return { nodes, edges };
  }
}
