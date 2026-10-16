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
  }

  async analyze() {
    if (this.running)
      throw new Error(
        "A page analysis is already running. Reopen the popup to see its result.",
      );
    this.running = true;
    try {
      const [tab] = await this.api.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (
        !Number.isInteger(tab?.id) ||
        tab.id < 0 ||
        !tab.url ||
        !/^https?:\/\//.test(tab.url)
      ) {
        throw new Error(
          "Choose a normal HTTP or HTTPS page, then open the extension again. Browser pages and the Chrome Web Store cannot be analyzed.",
        );
      }
      let injections;
      try {
        injections = await this.api.scripting.executeScript({
          target: { tabId: tab.id },
          world: "ISOLATED",
          func: PageCollector.collectPage,
        });
      } catch {
        throw new Error(
          "This page cannot be inspected. Reload it and reopen the extension; restricted browser pages are not supported.",
        );
      }
      const snapshot = injections.find(
        (injection) => injection.frameId === 0,
      )?.result;
      if (!snapshot?.url)
        throw new Error(
          "No page snapshot was returned. Reload the page and try again.",
        );
      const technologies = new FingerprintService(this.catalog).detect(
        snapshot,
      );
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
