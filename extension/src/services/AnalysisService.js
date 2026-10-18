import { PageCollector } from "./PageCollector.js";
import { FingerprintService } from "./FingerprintService.js";
import { GraphBuilder } from "../models/GraphBuilder.js";
import { GraphMerger } from "./GraphMerger.js";

export class AnalysisService {
  constructor(api, settings, connector, collections, validator, catalog) {
    Object.assign(this, {
      api,
      settings,
      connector,
      collections,
      validator,
      catalog,
    });
    this.running = false;
    this.fingerprints = new FingerprintService(catalog);
    this.plan = PageCollector.plan(catalog);
  }

  async capture() {
    const [tab] = await this.api.tabs.query({ active: true, currentWindow: true });
    if (!Number.isInteger(tab?.id) || tab.id < 0 || !/^https?:\/\//.test(tab.url ?? "")) {
      throw new Error("Choose a normal HTTP or HTTPS page. Browser pages and the Chrome Web Store cannot be analyzed.");
    }
    let injections;
    try {
      injections = await this.api.scripting.executeScript({ target: { tabId: tab.id }, world: "ISOLATED",
        func: PageCollector.collectPage, args: [this.plan] });
    } catch {
      throw new Error("This page cannot be inspected. Reload it and reopen the extension; restricted browser pages are not supported.");
    }
    const snapshot = injections.find((injection) => injection.frameId === 0)?.result;
    if (!snapshot?.url) throw new Error("No page snapshot was returned. Reload the page and try again.");
    snapshot.runtimeAvailable = false;
    try {
      const runtime = await this.api.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN",
        func: PageCollector.collectRuntime, args: [this.plan.js] });
      const result = runtime.find((injection) => injection.frameId === 0)?.result;
      if (result?.url === snapshot.url && result.signals) {
        snapshot.js = result.signals;
        snapshot.hints = [...new Set([...(snapshot.hints ?? []), ...(Array.isArray(result.hints) ? result.hints.filter((hint) => ["react", "vue"].includes(hint)) : [])])];
        snapshot.runtimeAvailable = true;
      }
    } catch { /* Isolated DOM detection remains available if the page blocks runtime inspection. */ }
    if (this.api.tabs.get) {
      const current = await this.api.tabs.get(tab.id);
      if (current.url !== tab.url) throw new Error("The page changed during detection. Open the popup again to inspect the new page.");
    }
    return { tab, snapshot };
  }

  async detect() {
    const { tab, snapshot } = await this.capture();
    const technologies = this.fingerprints.detect(snapshot);
    const domains = [...new Set([snapshot.url, ...(snapshot.links ?? []).map((item) => item.url), ...(snapshot.resources ?? []).map((item) => item.url)]
      .map((value) => new URL(value).hostname))].sort();
    // Quick inspection never invokes PHP or replaces the last saved collection.
    if (this.api.action?.setBadgeText) {
      await this.api.action.setBadgeText({ tabId: tab.id, text: technologies.length ? String(technologies.length) : "" });
      await this.api.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#287f83" });
    }
    return { page: snapshot.url, technologies, runtimeAvailable: snapshot.runtimeAvailable,
      collected_at: snapshot.collected_at, catalogSize: this.catalog.technologies.length,
      metrics: { pages: new Set([snapshot.url, ...(snapshot.links ?? []).map((item) => item.url)]).size, domains: domains.length, ips: null },
      relatedDomains: domains.filter((host) => host !== new URL(snapshot.url).hostname) };
  }

  async analyze() {
    if (this.running)
      throw new Error(
        "A page analysis is already running. Reopen the popup to see its result.",
      );
    this.running = true;
    try {
      const { snapshot } = await this.capture();
      const technologies = this.fingerprints.detect(snapshot);
      let document = new GraphBuilder().build(snapshot, technologies);
      this.validator.validate(document);
      const settings = await this.settings.load();
      if (settings.enabled) {
        try {
          const remote = await this.connector.analyze(
            settings,
            document.target,
          );
          this.validator.validate(remote);
          const enriched = new GraphMerger().merge(document, remote);
          this.validator.validate(enriched);
          this.collections.checkSize(enriched);
          document = enriched;
        } catch (error) {
          document.errors.push({
            module: "connector",
            code: "enrichment_error",
            message: error.message,
          });
          document.status = "partial";
        }
      }
      const record = await this.collections.save(document);
      return this.collections.summary(record);
    } finally {
      this.running = false;
    }
  }
}
