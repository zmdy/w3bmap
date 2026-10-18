import { technologyIcons } from "../../assets/technology-icons/icons.js";

export class PopupAssets {
  constructor(api) { this.api = api; }

  favicon(page) {
    try {
      const url = new URL(page);
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return this.fallback();
      url.search = "";
      url.hash = "";
      const icon = new URL(this.api.runtime.getURL("_favicon/"));
      icon.searchParams.set("pageUrl", url.href);
      icon.searchParams.set("size", "64");
      return icon.href;
    } catch { return this.fallback(); }
  }

  fallback() { return new URL("../../assets/site-fallback.svg", import.meta.url).href; }

  technology(id) {
    const file = Object.hasOwn(technologyIcons, id) ? technologyIcons[id] : "generic.svg";
    return new URL(`../../assets/technology-icons/${file}`, import.meta.url).href;
  }
}
