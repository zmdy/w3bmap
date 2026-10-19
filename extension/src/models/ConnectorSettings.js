import { CrawlSettings } from "./CrawlSettings.js";

export class ConnectorSettings {
  static MODULES = [
    "dns",
    "rdap",
    "headers",
    "ssl",
    "technologies",
    "robots",
    "sitemap",
    "links",
  ];

  constructor(values = {}) {
    this.endpoint = String(values.endpoint ?? "").trim();
    this.apiKey = String(values.apiKey ?? "");
    this.rememberKey = values.rememberKey === true;
    this.allowLocalHttp = values.allowLocalHttp === true;
    this.crawl = new CrawlSettings(values.crawl);
    this.modules = Array.isArray(values.modules)
      ? [...new Set(values.modules)]
      : [...ConnectorSettings.MODULES];
  }

  // An endpoint opts into PHP enrichment; the retired enabled flag is ignored.
  get enabled() { return this.endpoint.length > 0; }

  validate(requireConnection = false) {
    this.crawl.validate();
    if (
      this.modules.some(
        (module) => !ConnectorSettings.MODULES.includes(module),
      ) ||
      !this.modules.length
    ) {
      throw new Error("Select at least one supported connector module.");
    }
    if (!this.endpoint && !this.enabled && !requireConnection) return this;
    let url;
    try {
      url = new URL(this.endpoint);
    } catch {
      throw new Error("Enter the full URL of your PHP connector.");
    }
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      /[\x00-\x20\x7f\\]/.test(this.endpoint)
    ) {
      throw new Error(
        "Connector URLs must not include credentials, queries, fragments, or whitespace.",
      );
    }
    const loopback = ["localhost", "127.0.0.1"].includes(url.hostname);
    if (
      url.protocol !== "https:" &&
      !(url.protocol === "http:" && loopback && this.allowLocalHttp)
    ) {
      throw new Error(
        "Use HTTPS, or explicitly allow HTTP for localhost or 127.0.0.1 during development.",
      );
    }
    this.endpoint = url.href;
    if (
      (this.enabled || requireConnection) &&
      !/^[\x21-\x7e]{32,256}$/.test(this.apiKey)
    ) {
      throw new Error("Enter an API key with 32–256 visible ASCII characters.");
    }
    return this;
  }

  get permissionOrigin() {
    const url = new URL(this.endpoint);
    return `${url.protocol}//${url.hostname}/*`;
  }

  publicValues() {
    return {
      endpoint: this.endpoint,
      enabled: this.enabled,
      rememberKey: this.rememberKey,
      allowLocalHttp: this.allowLocalHttp,
      modules: this.modules,
      crawl: this.crawl.publicValues(),
    };
  }
}
