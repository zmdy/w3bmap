import { technologyIcons } from "../../assets/technology-icons/icons.js";

/**
 * Resolves the images shown next to entities. Technology logos and the fallback
 * mark are packaged Iconify assets. Site favicons are page content and are only
 * available through Chrome's favicon cache, so the standalone HTTP Explorer
 * keeps the local fallback instead of contacting a third-party service.
 */
export class IconService {
  constructor(runtime = globalThis.chrome?.runtime) {
    this.runtime =
      typeof runtime?.getURL === "function" &&
      location.protocol === "chrome-extension:"
        ? runtime
        : null;
  }

  get hasFavicons() {
    return Boolean(this.runtime);
  }

  fallback() {
    return new URL("../../assets/site-fallback.svg", import.meta.url).href;
  }

  technology(id) {
    const file = Object.hasOwn(technologyIcons, id)
      ? technologyIcons[id]
      : "generic.svg";
    return new URL(`../../assets/technology-icons/${file}`, import.meta.url)
      .href;
  }

  /** Accepts a hostname or an absolute page URL and returns a cached favicon. */
  favicon(value) {
    if (!this.runtime) return this.fallback();
    try {
      const page = /^https?:\/\//i.test(value)
        ? new URL(value)
        : new URL(`https://${value}/`);
      if (page.username || page.password) return this.fallback();
      page.search = "";
      page.hash = "";
      const icon = new URL(this.runtime.getURL("_favicon/"));
      icon.searchParams.set("pageUrl", page.href);
      icon.searchParams.set("size", "32");
      return icon.href;
    } catch {
      return this.fallback();
    }
  }

  /** Picks the image that represents an entity, or null when a type dot is enough. */
  forNode(node) {
    if (!node) return null;
    if (node.type === "technology")
      return this.technology(node.id.replace(/^technology:/, ""));
    if (node.type === "domain") return this.favicon(node.label);
    if (node.type === "page" || node.type === "sitemap") {
      const url = node.id.slice(node.id.indexOf(":") + 1);
      return /^https?:\/\//i.test(url) ? this.favicon(url) : this.fallback();
    }
    return null;
  }
}
