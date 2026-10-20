/**
 * Builds the navigable folder tree shown in the Tree view.
 *
 * Folders are URL path prefixes and category buckets, not ownership claims: a
 * page keeps its complete URL on the leaf so a different host inside a shared
 * path stays visible. Nothing here is written back into the collection.
 */
export class SiteTreeBuilder {
  static CATEGORIES = [
    ["technology", "Technologies"],
    ["domain", "Subdomains"],
    ["ip", "IP addresses"],
    ["certificate", "Certificates"],
    ["sitemap", "Sitemaps"],
  ];

  static url(node) {
    const value = node.id.slice(node.id.indexOf(":") + 1);
    return /^https?:\/\//i.test(value) ? value : null;
  }

  static location(node) {
    const url = SiteTreeBuilder.url(node);
    if (!url) return null;
    try {
      const parsed = new URL(url);
      return {
        host: parsed.host,
        segments: parsed.pathname
          .split("/")
          .filter(Boolean)
          .slice(0, 12)
          .map((segment) => SiteTreeBuilder.readable(segment)),
      };
    } catch {
      return null;
    }
  }

  static readable(segment) {
    try {
      return decodeURIComponent(segment).slice(0, 80);
    } catch {
      return segment.slice(0, 80);
    }
  }

  folder(id, label, type, path) {
    return {
      id,
      kind: "folder",
      label,
      type,
      path,
      folders: new Map(),
      entities: [],
      hosts: new Set(),
      count: 0,
    };
  }

  /** Returns the ordered root folders for the supplied visible entities. */
  build(nodes, target = "") {
    const pages = nodes.filter((node) => node.type === "page");
    const root = this.folder(
      "tree:site",
      target || "Collection",
      "domain",
      target ? [target] : [],
    );
    for (const node of pages) {
      const location = SiteTreeBuilder.location(node);
      let folder = root;
      root.hosts.add(location?.host ?? "unknown host");
      for (const segment of location?.segments ?? []) {
        if (!folder.folders.has(segment)) {
          folder.folders.set(
            segment,
            this.folder(
              `${folder.id}/${segment}`,
              segment,
              "page",
              [...folder.path, segment],
            ),
          );
        }
        folder = folder.folders.get(segment);
        folder.hosts.add(location?.host ?? "unknown host");
      }
      folder.entities.push(node);
    }
    const roots = pages.length ? [{ ...this.finish(root), site: true }] : [];
    for (const [type, label] of SiteTreeBuilder.CATEGORIES) {
      const members = nodes.filter(
        (node) =>
          node.type === type && !(type === "domain" && node.label === target),
      );
      if (!members.length) continue;
      const category = this.folder(`tree:${type}`, label, type, [label]);
      category.entities = members;
      roots.push(this.finish(category));
    }
    return roots;
  }

  /** Sorts each level, counts descendants, and replaces working maps with arrays. */
  finish(folder) {
    const children = [...folder.folders.values()]
      .map((child) => this.finish(child))
      .sort((first, second) => first.label.localeCompare(second.label, "en"));
    const entities = folder.entities
      .map((node) => ({
        id: `entity:${node.id}`,
        kind: "entity",
        label: node.label,
        type: node.type,
        node,
        url: SiteTreeBuilder.url(node),
      }))
      .sort((first, second) =>
        (first.url ?? first.label).localeCompare(
          second.url ?? second.label,
          "en",
        ),
      );
    return {
      ...folder,
      folders: children,
      entities,
      hosts: [...folder.hosts].sort(),
      children: [...children, ...entities],
      count:
        entities.length +
        children.reduce((total, child) => total + child.count, 0),
    };
  }
}
