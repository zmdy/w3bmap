import { EntityGroupingService } from "./EntityGroupingService.js";

/**
 * Builds the navigable folder tree shown in the Tree view.
 *
 * Folders are URL path prefixes and category buckets, not ownership claims: a
 * page keeps its complete URL on the leaf so a different host inside a shared
 * path stays visible. Nothing here is written back into the collection.
 */
export class SiteTreeBuilder {
  static PATH_TYPES = new Set(["page", "asset"]);
  constructor(grouping = new EntityGroupingService()) {
    this.grouping = grouping;
  }

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

  /** A final segment with an extension names a file, not another folder. */
  static isFileName(segment) {
    return /^[^.].*\.[a-z0-9]{1,8}$/i.test(segment);
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
  /**
   * `byHost` places each site of a merged investigation in its own folder. It
   * applies only when the collection actually covers more than one host, so a
   * single-site collection never gains a folder level that explains nothing.
   */
  build(nodes, target = "", byHost = true) {
    const pages = nodes.filter((node) =>
      SiteTreeBuilder.PATH_TYPES.has(node.type),
    );
    const root = this.folder(
      "tree:site",
      target || "Collection",
      "domain",
      target ? [target] : [],
    );
    const hosts = new Set(
      pages.map((node) => SiteTreeBuilder.location(node)?.host ?? "unknown host"),
    );
    const splitHosts = byHost && hosts.size > 1;
    for (const node of pages) {
      const location = SiteTreeBuilder.location(node);
      const host = location?.host ?? "unknown host";
      let folder = root;
      root.hosts.add(host);
      if (splitHosts) {
        if (!folder.folders.has(host)) {
          const site = this.folder(
            `${folder.id}/${host}`,
            host,
            "domain",
            [...folder.path, host],
          );
          site.site = true;
          folder.folders.set(host, site);
        }
        folder = folder.folders.get(host);
        folder.hosts.add(host);
      }
      const segments = location?.segments ?? [];
      if (segments.length && SiteTreeBuilder.isFileName(segments.at(-1)))
        segments.pop();
      for (const segment of segments) {
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
        folder.hosts.add(host);
      }
      folder.entities.push(node);
    }
    const roots = pages.length
      ? [{ ...this.finish(root), site: true, splitHosts, hosts: [...hosts].sort() }]
      : [];
    for (const [type, label] of SiteTreeBuilder.CATEGORIES) {
      const members = nodes.filter(
        (node) =>
          node.type === type && !(type === "domain" && node.label === target),
      );
      if (!members.length) continue;
      const category = this.folder(`tree:${type}`, label, type, [label]);
      this.fill(category, members);
      roots.push(this.finish(category));
    }
    return roots;
  }

  /**
   * Places a category's entities under the same similarity groups the graph
   * uses, so related subdomains, technology categories, address prefixes and
   * certificate issuers share a folder. A group of one needs no folder.
   */
  fill(category, members) {
    for (const group of this.grouping.groups(members)) {
      if (group.members.length < 2) {
        category.entities.push(...group.members);
        continue;
      }
      const folder = this.folder(
        `${category.id}/${group.id}`,
        group.label,
        group.type,
        [...category.path, group.label],
      );
      folder.entities = group.members;
      for (const node of group.members) {
        const host = SiteTreeBuilder.location(node)?.host;
        if (host) folder.hosts.add(host);
      }
      category.folders.set(group.id, folder);
    }
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
