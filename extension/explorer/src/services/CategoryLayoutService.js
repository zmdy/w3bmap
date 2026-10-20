/** Computes deterministic category regions without modifying collection records. */
export class CategoryLayoutService {
  static SLOTS = { technology: [-1, -1], page: [1, -1], domain: [1, 0], asset: [1, 1],
    certificate: [-1, 0], ip: [-1, 1], sitemap: [0, 1] };

  positions(nodes, rootId) {
    const children = new Map(), groups = new Map(), positions = new Map();
    for (const node of nodes) {
      if (node.parent) {
        if (!children.has(node.parent)) children.set(node.parent, []);
        children.get(node.parent).push(node);
      }
    }
    for (const node of nodes.filter((item) => !item.parent)) {
      const members = children.get(node.id) ?? [node];
      const columns = Math.ceil(Math.sqrt(members.length));
      const compound = children.has(node.id);
      const item = { node, members, columns, width: columns * 135 + (compound ? 50 : 0),
        height: Math.ceil(members.length / columns) * 100 + (compound ? 65 : 0) };
      const type = members.some((member) => member.id === rootId) ? "root" : node.type;
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type).push(item);
    }
    const regions = [...groups].map(([type, items]) => {
      items.sort((a, b) => a.node.id.localeCompare(b.node.id));
      const columns = Math.ceil(Math.sqrt(items.length));
      const cellWidth = Math.max(...items.map((item) => item.width));
      const cellHeight = Math.max(...items.map((item) => item.height));
      return { type, items, columns, cellWidth, cellHeight, width: columns * cellWidth,
        height: Math.ceil(items.length / columns) * cellHeight };
    });
    const widths = new Map(), heights = new Map();
    for (const region of regions) {
      const [column, row] = CategoryLayoutService.SLOTS[region.type] ?? [0, 0];
      widths.set(column, Math.max(widths.get(column) ?? 0, region.width));
      heights.set(row, Math.max(heights.get(row) ?? 0, region.height));
    }
    const offset = (sizes, slot) => slot === 0 ? 0
      : slot * ((sizes.get(0) ?? 135) / 2 + (sizes.get(slot) ?? 135) / 2 + 65);
    for (const region of regions) {
      const [column, row] = CategoryLayoutService.SLOTS[region.type] ?? [0, 0];
      const center = { x: offset(widths, column), y: offset(heights, row) };
      region.items.forEach((item, index) => {
        const x = center.x - region.width / 2 + (index % region.columns + 0.5) * region.cellWidth;
        const y = center.y - region.height / 2 + (Math.floor(index / region.columns) + 0.5) * region.cellHeight;
        item.members.forEach((member, memberIndex) => positions.set(member.id, {
          x: x + (memberIndex % item.columns - (item.columns - 1) / 2) * 135,
          y: y + (Math.floor(memberIndex / item.columns) - (Math.ceil(item.members.length / item.columns) - 1) / 2) * 100,
        }));
      });
    }
    const root = positions.get(rootId);
    if (root) for (const [id, position] of positions) positions.set(id, { x: position.x - root.x, y: position.y - root.y });
    return positions;
  }
}
