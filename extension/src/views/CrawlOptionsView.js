import { CrawlSettings } from "../models/CrawlSettings.js";

export class CrawlOptionsView {
  constructor(root = document) { this.root = root; this.initialized = false; }
  get(id) { return this.root.getElementById(id); }
  lines(value) { return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean); }

  read() {
    return new CrawlSettings({ enabled: this.get("crawl-enabled").checked, depth: Number(this.get("crawl-depth").value),
      maxPages: Number(this.get("crawl-pages").value), maxHosts: Number(this.get("crawl-hosts").value),
      scope: this.get("crawl-scope").value, include: this.lines(this.get("crawl-include").value),
      exclude: this.lines(this.get("crawl-exclude").value), seeds: this.lines(this.get("crawl-seeds").value) }).validate().publicValues();
  }

  state(values) {
    if (this.initialized || !values) return;
    this.initialized = true;
    const settings = new CrawlSettings(values);
    this.get("crawl-enabled").checked = settings.enabled;
    for (const [id, value] of [["depth", settings.depth], ["pages", settings.maxPages], ["hosts", settings.maxHosts], ["scope", settings.scope],
      ["include", settings.include.join("\n")], ["exclude", settings.exclude.join("\n")], ["seeds", settings.seeds.join("\n")]]) this.get(`crawl-${id}`).value = String(value);
  }
}
