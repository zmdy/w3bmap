import { ConnectorSettings } from "./ConnectorSettings.js";

/** Projects saved PHP module results without mixing in browser detections. */
export class ProbeResultsModel {
  load(document) {
    this.target = document?.results?.browser?.page ?? document?.target ?? "";
    this.collectedAt = document?.collected_at ?? "";
    this.errors = (document?.errors ?? []).filter((error) => error.module !== "browser");
    const results = document?.results ?? {};
    const crawl = results.crawl;
    const pages = Array.isArray(crawl?.pages) ? crawl.pages : [];
    this.modules = ConnectorSettings.MODULES.map((module) => {
      const sources = [];
      for (const [host, values] of Object.entries(crawl?.hosts ?? {})) {
        if (Object.hasOwn(values ?? {}, module)) sources.push({ label: host, data: values[module] });
      }
      for (const page of pages) {
        // Host-scoped modules are already listed once per host above.
        if (!["dns", "rdap", "robots", "sitemap"].includes(module) && Object.hasOwn(page.results ?? {}, module))
          sources.push({ label: page.url, data: page.results[module] });
      }
      if (!sources.length && Object.hasOwn(results, module)) sources.push({ label: document.target, data: results[module] });
      const report = document?.results?.browser?.connector?.modules?.find((entry) => entry.module === module);
      return { module, sources, status: report?.status ?? (sources.length ? "complete" : "no_result"), message: report?.message };
    }).filter((entry) => entry.sources.length || entry.status !== "no_result");
    if (crawl) this.modules.push({ module: "crawl", status: document.status, sources: [{ label: "Traversal summary", data: {
      options: crawl.options, visited_pages: crawl.visited_pages, visited_hosts: crawl.visited_hosts,
      remaining_urls: crawl.remaining_urls, stop_reason: crawl.stop_reason,
      pages: pages.map(({ url, depth, status, http_status, error, errors }) => ({ url, depth, status, http_status, error, errors })),
    } }] });
    return this;
  }
}
