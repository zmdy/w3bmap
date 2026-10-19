import { ConnectorSettings } from "../models/ConnectorSettings.js";
import { GraphMerger } from "./GraphMerger.js";

export class ConnectorEnrichmentService {
  constructor(connector, validator, collections) {
    Object.assign(this, { connector, validator, collections });
  }

  async enrich(local, settings, onProgress = () => {}) {
    const report = { status: "not_configured", connection: "not_tested", modules: [] };
    if (!settings.enabled) return { document: local, report };
    report.status = "running";
    report.connection = "checking";
    report.modules = settings.modules.map((module) => ({ module, status: "pending" }));
    onProgress(structuredClone(report));
    try {
      const capabilities = await this.connector.capabilities(settings);
      report.connection = "connected";
      const available = settings.modules.filter((module) => capabilities.modules.includes(module));
      const missing = settings.modules.filter((module) => !capabilities.modules.includes(module));
      for (const entry of report.modules) entry.status = available.includes(entry.module) ? "running" : "unavailable";
      onProgress(structuredClone(report));
      let enriched = structuredClone(local);
      if (available.length) {
        const selected = new ConnectorSettings({ ...settings.publicValues(), apiKey: settings.apiKey, modules: available });
        const remote = await this.connector.analyze(selected, local.target);
        this.validator.validate(remote);
        enriched = new GraphMerger().merge(local, remote);
        this.validator.validate(enriched);
        for (const entry of report.modules) {
          if (entry.status === "unavailable") continue;
          const errors = remote.errors.filter((error) => error.module === entry.module || error.module === "connector");
          entry.status = errors.length ? "failed" : Object.hasOwn(remote.results, entry.module) ? "complete" : "no_result";
          if (errors.length) entry.message = this.safeMessage(errors.map((error) => error.message).join(" "), settings);
        }
      }
      for (const module of missing) enriched.errors.push({ module, code: "module_unavailable", message: `The PHP connector does not provide the ${module} module.` });
      for (const entry of report.modules.filter((entry) => entry.status === "no_result"))
        enriched.errors.push({ module: entry.module, code: "missing_result", message: `The PHP connector returned no ${entry.module} result.` });
      const complete = report.modules.filter((entry) => entry.status === "complete").length;
      report.status = complete === report.modules.length && enriched.status === "complete" && !enriched.errors.length
        ? "complete" : complete ? "partial" : "failed";
      if (report.status !== "complete") enriched.status = "partial";
      enriched.results.browser.connector = report;
      this.collections.checkSize(enriched);
      onProgress(structuredClone(report));
      return { document: enriched, report };
    } catch (error) {
      const message = this.safeMessage(error.message, settings);
      report.status = "failed";
      if (report.connection === "checking") report.connection = "failed";
      report.message = message;
      for (const entry of report.modules) {
        if (["pending", "running"].includes(entry.status)) entry.status = "failed";
      }
      local.errors.push({ module: "connector", code: "enrichment_error", message });
      local.status = "partial";
      onProgress(structuredClone(report));
      return { document: local, report };
    }
  }

  safeMessage(message, settings) {
    const text = String(message || "PHP enrichment failed.");
    return (settings.apiKey ? text.replaceAll(settings.apiKey, "[redacted]") : text).slice(0, 1000);
  }
}
