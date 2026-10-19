export class CrawlSettings {
  constructor(values = {}) {
    this.enabled = values.enabled === true;
    this.depth = values.depth ?? 1;
    this.maxPages = values.maxPages ?? 10;
    this.maxHosts = values.maxHosts ?? 5;
    this.scope = values.scope ?? "host";
    this.include = values.include ?? [];
    this.exclude = values.exclude ?? [];
    this.seeds = values.seeds ?? [];
  }

  validate() {
    for (const [key, min, max] of [["depth", 0, 5], ["maxPages", 1, 50], ["maxHosts", 1, 10]])
      if (!Number.isInteger(this[key]) || this[key] < min || this[key] > max) throw new Error(`Invalid recursive analysis ${key}: use ${min}–${max}.`);
    if (!["host", "subdomains", "all"].includes(this.scope)) throw new Error("Choose a supported recursive analysis scope.");
    for (const key of ["include", "exclude"]) {
      if (!Array.isArray(this[key]) || this[key].length > 10 || this[key].some((value) => typeof value !== "string" || !value || value.length > 200 || /[\x00-\x20\x7f\\]/.test(value)))
        throw new Error("Use at most 10 URL patterns per filter, with at most 200 characters each. Only * is a wildcard.");
    }
    if (!Array.isArray(this.seeds) || this.seeds.length > 20) throw new Error("Use at most 20 starting URLs.");
    this.seeds = [...new Set(this.seeds.map((url) => this.url(url)))];
    if (new TextEncoder().encode(JSON.stringify(this.publicValues())).length > 10000) throw new Error("Recursive settings are too large. Use fewer URL patterns or starting URLs.");
    return this;
  }

  url(value) {
    let url;
    try { url = new URL(value); } catch { throw new Error("Provide full HTTP or HTTPS starting URLs."); }
    if (typeof value !== "string" || value.length > 2048 || /[\x00-\x20\x7f\\]/.test(value) || !["http:", "https:"].includes(url.protocol)
      || url.username || url.password || url.port || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/.test(url.hostname)) throw new Error("Starting URLs require DNS hostnames and standard HTTP/HTTPS ports, without credentials.");
    url.search = "";
    url.hash = "";
    return url.href;
  }

  publicValues() {
    return { enabled: this.enabled, depth: this.depth, maxPages: this.maxPages, maxHosts: this.maxHosts,
      scope: this.scope, include: this.include, exclude: this.exclude, seeds: this.seeds };
  }

  payload(url) {
    this.validate();
    return { url: this.url(url), depth: this.depth, max_pages: this.maxPages, max_hosts: this.maxHosts,
      scope: this.scope, include: this.include, exclude: this.exclude, seeds: this.seeds };
  }
}
