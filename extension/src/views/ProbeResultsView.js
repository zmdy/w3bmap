import { ProbeResultsModel } from "../models/ProbeResultsModel.js";
import { ConnectorReportView } from "./ConnectorReportView.js";

/** Renders untrusted connector output as text, with bounded, lazy previews. */
export class ProbeResultsView {
  constructor(container, context) { Object.assign(this, { container, context }); }

  render(savedDocument) {
    this.container.replaceChildren();
    const model = new ProbeResultsModel().load(savedDocument);
    this.context.textContent = savedDocument
      ? `Latest saved collection: ${model.target} · ${new Date(model.collectedAt).toLocaleString()}. Data remains available when you change browser tabs.`
      : "No saved PHP results. Configure a PHP connector and analyze a page to collect server findings.";
    if (!savedDocument) return;
    if (!model.modules.length) this.text(this.container, "p", "This collection has no PHP module data. Configure a connector and analyze again.");
    for (const entry of model.modules) {
      const section = this.disclosure(this.container,
        `${ConnectorReportView.MODULES[entry.module] ?? "Recursive analysis"} · ${ConnectorReportView.STATUS[entry.status] ?? entry.status} · ${entry.sources.length} source${entry.sources.length === 1 ? "" : "s"}`);
      section.className = "probe-module";
      section.dataset.module = entry.module;
      if (entry.message) this.text(section, "p", entry.message);
      for (const source of entry.sources) {
        const details = this.disclosure(section, source.label);
        let loaded = false;
        details.addEventListener("toggle", () => {
          if (!details.open || loaded) return;
          loaded = true;
          const body = document.createElement("div");
          body.className = "probe-data";
          const budget = { nodes: 180, characters: 12000, truncated: false };
          this.data(body, source.data, budget);
          if (budget.truncated) this.text(body, "p", "Preview limited. Export JSON for the complete saved data.");
          details.append(body);
        });
        if (entry.sources.length === 1) details.open = true;
      }
    }
    if (model.errors.length) {
      const errors = this.disclosure(this.container, `Collection errors (${model.errors.length})`);
      errors.className = "probe-module probe-errors";
      for (const error of model.errors.slice(0, 50)) this.text(errors, "p", `${error.module} · ${error.code}: ${error.message}`);
      if (model.errors.length > 50) this.text(errors, "p", "More errors are available in the JSON export.");
    }
  }

  disclosure(parent, label) {
    const details = document.createElement("details");
    this.text(details, "summary", label);
    parent.append(details);
    return details;
  }

  text(parent, tag, value) {
    const element = document.createElement(tag);
    element.textContent = String(value);
    parent.append(element);
    return element;
  }

  data(parent, value, budget, depth = 0) {
    if (--budget.nodes < 0 || budget.characters <= 0) { budget.truncated = true; return; }
    if (value === null || typeof value !== "object") {
      const text = value === undefined ? "Not provided" : String(value);
      const limit = Math.min(2000, budget.characters);
      this.text(parent, "span", text.slice(0, limit));
      budget.characters -= Math.min(text.length, limit);
      if (text.length > limit) budget.truncated = true;
      return;
    }
    if (depth >= 5) { budget.truncated = true; this.text(parent, "span", "Nested data available in JSON export."); return; }
    const entries = Object.entries(value);
    if (!entries.length) { this.text(parent, "span", "No entries"); return; }
    const list = document.createElement("dl");
    for (const [key, child] of entries.slice(0, 30)) {
      if (budget.nodes <= 0 || budget.characters <= 0) { budget.truncated = true; break; }
      const label = Array.isArray(value) ? `Item ${Number(key) + 1}` : key.replaceAll("_", " ");
      this.text(list, "dt", label.slice(0, 160));
      const detail = document.createElement("dd");
      this.data(detail, child, budget, depth + 1);
      list.append(detail);
    }
    if (entries.length > 30) budget.truncated = true;
    parent.append(list);
  }
}
