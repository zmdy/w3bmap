import { GraphFilters } from "../models/GraphModel.js";
import { GraphView } from "./GraphView.js";

export class Dom {
  static element(tag, className = "", text = "") {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    return element;
  }

  static icon(name) {
    const icon = this.element("span", "ui-icon");
    icon.dataset.icon = name;
    icon.setAttribute("aria-hidden", "true");
    return icon;
  }

  static dot(type) {
    const dot = this.element("span", "type-dot");
    dot.style.setProperty("--type-color", GraphView.COLORS[type]);
    return dot;
  }

  static date(value) {
    return new Date(value).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  }
}

export class WorkspaceView {
  static TYPE_LABELS = {
    domain: "Domains",
    ip: "IP addresses",
    page: "Pages",
    technology: "Technologies",
    certificate: "Certificates",
    sitemap: "Sitemaps",
  };

  constructor() {
    this.typeCheckboxes = new Map();
    const filters = this.get("type-filters");
    for (const type of GraphFilters.TYPES) {
      const label = Dom.element("label", "type-row");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = type;
      input.checked = true;
      input.dataset.filterType = type;
      const count = Dom.element("span", "type-count", "0");
      count.id = `count-${type}`;
      label.append(
        input,
        Dom.dot(type),
        Dom.element("span", "", WorkspaceView.TYPE_LABELS[type]),
        count,
      );
      filters.append(label);
      this.typeCheckboxes.set(type, input);
    }
  }

  get(id) {
    return document.getElementById(id);
  }

  notice(message, error = false) {
    const notice = this.get("notice");
    notice.textContent = message;
    notice.classList.toggle("error", error);
    notice.hidden = !message;
    notice.setAttribute("role", error ? "alert" : "status");
  }

  resetFilters() {
    this.get("search-input").value = "";
    this.get("confidence-filter").value = "0";
    this.get("confidence-value").textContent = "0%";
    this.get("inferred-filter").checked = true;
    this.get("source-filter").value = "all";
    this.typeCheckboxes.forEach((input) => {
      input.checked = true;
    });
  }

  summary(model) {
    const data = model.document;
    this.get("target-label").textContent = data?.target ?? "No collection";
    this.get("filename-label").textContent =
      model.name || "Import a JSON export to begin";
    const tags = this.get("collection-tags");
    tags.replaceChildren();
    if (data) {
      if (model.isSample)
        tags.append(Dom.element("span", "tag sample", "Sample data"));
      tags.append(
        Dom.element("span", `tag ${data.status}`, data.status),
        Dom.element("span", "tag", data.source),
      );
    }
    for (const [type, count] of Object.entries(model.counts))
      this.get(`count-${type}`).textContent = count.toLocaleString("en-US");
    this.get("total-node-count").textContent =
      data?.nodes.length.toLocaleString("en-US") ?? "0";
    this.get("export-button").disabled = !data;
    this.get("clear-button").disabled = !data;
    this.get("empty-state").hidden = Boolean(data);
    this.get("error-count").textContent = String(data?.errors.length ?? 0);
    this.get("error-count").hidden = !data?.errors.length;
  }

  visible(visible, hasDocument, isGraph) {
    this.get("visible-count").textContent =
      `${visible.nodes.length.toLocaleString("en-US")} entities · ${visible.edges.length.toLocaleString("en-US")} relationships`;
    this.get("no-results").hidden = !hasDocument || visible.nodes.length > 0;
    this.get("graph-controls").hidden =
      !hasDocument || !isGraph || !visible.nodes.length;
    this.get("canvas-caption").hidden =
      !hasDocument || !isGraph || !visible.nodes.length;
    const list = this.get("entity-list");
    list.replaceChildren();
    const fragment = document.createDocumentFragment();
    for (const node of visible.nodes) {
      const button = Dom.element("button", "entity-row");
      button.dataset.nodeId = node.id;
      const label = Dom.element("span", "entity-label");
      label.append(
        Dom.element("strong", "", node.label),
        Dom.element("small", "", node.type),
      );
      button.append(
        Dom.dot(node.type),
        label,
        Dom.element(
          "span",
          "entity-confidence",
          `${Math.round(node.confidence * 100)}%`,
        ),
      );
      fragment.append(button);
    }
    list.append(fragment);
  }

  tab(group, active) {
    const tabs =
      group === "workspace" ? ["graph", "entities"] : ["details", "collection"];
    for (const name of tabs) {
      const selected = name === active;
      const button = this.get(`${name}-tab`);
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      button.classList.toggle("selected", selected);
      this.get(`${name}-panel`).hidden = !selected;
    }
  }

  selection(id) {
    this.get("entity-list")
      .querySelectorAll("button")
      .forEach((button) => {
        const selected = button.dataset.nodeId === id;
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
  }

  busy(busy) {
    this.get("import-button").disabled = busy;
    this.get("file-input").disabled = busy;
    this.get("workspace").setAttribute("aria-busy", String(busy));
  }
}
