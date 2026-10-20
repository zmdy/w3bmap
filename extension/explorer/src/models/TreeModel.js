import { SiteTreeBuilder } from "../services/SiteTreeBuilder.js";

/** Holds the folder tree and its expansion state outside the export contract. */
export class TreeModel {
  static CHILD_LIMIT = 25;

  constructor(builder = new SiteTreeBuilder()) {
    this.builder = builder;
    this.roots = [];
    this.expanded = new Set();
    this.revealed = new Set();
    this.index = new Map();
  }

  build(nodes, target) {
    const openBefore = this.expanded;
    this.roots = this.builder.build(nodes, target);
    this.index = new Map();
    for (const root of this.roots) this.register(root);
    // Keep folders the user opened, and open the site root on a first build.
    this.expanded = new Set(
      [...openBefore].filter((id) => this.index.has(id)),
    );
    this.revealed = new Set(
      [...this.revealed].filter((id) => this.index.has(id)),
    );
    if (!openBefore.size && this.roots.length) this.expanded.add(this.roots[0].id);
    return this.roots;
  }

  register(folder) {
    this.index.set(folder.id, folder);
    for (const child of folder.folders) this.register(child);
  }

  find(id) {
    return this.index.get(id) ?? null;
  }

  isOpen(id) {
    return this.expanded.has(id);
  }

  setOpen(id, open) {
    if (open) this.expanded.add(id);
    else this.expanded.delete(id);
  }

  toggle(id) {
    this.setOpen(id, !this.isOpen(id));
    return this.isOpen(id);
  }

  setAll(open) {
    this.expanded = new Set(open ? [...this.index.keys()] : []);
  }

  reveal(id) {
    this.revealed.add(id);
  }

  /** Opens every folder on the path to an entity so a selection stays visible. */
  revealNode(nodeId) {
    for (const folder of this.index.values()) {
      if (folder.entities.some((entity) => entity.node.id === nodeId)) {
        for (const ancestor of this.ancestors(folder.id)) this.expanded.add(ancestor);
        return folder.id;
      }
    }
    return null;
  }

  ancestors(id) {
    const path = [];
    for (const folder of this.index.values()) {
      if (id === folder.id || id.startsWith(`${folder.id}/`)) path.push(folder.id);
    }
    return path;
  }

  /** Bounds how many children render at once so large folders stay responsive. */
  children(folder) {
    const all = folder.children;
    if (this.revealed.has(folder.id) || all.length <= TreeModel.CHILD_LIMIT)
      return { items: all, hidden: 0 };
    return {
      items: all.slice(0, TreeModel.CHILD_LIMIT),
      hidden: all.length - TreeModel.CHILD_LIMIT,
    };
  }
}
