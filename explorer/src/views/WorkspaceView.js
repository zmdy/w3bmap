import { GroupedListView } from "./GroupedListView.js";
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
    asset: "Assets",
    technology: "Technologies",
    certificate: "Certificates",
    sitemap: "Sitemaps",
  };

  constructor(clusters, onToggle, icons = null) {
    this.icons = icons;
    this.groupedList = new GroupedListView(document.getElementById("entity-list"), clusters, (node) => this.entityRow(node), onToggle);
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

  /** Lists the added search terms with the number of entities each one matches. */
  terms(model) {
    const container = this.get("filter-terms");
    const { terms } = model.filters;
    container.replaceChildren();
    container.hidden = !terms.length;
    if (!terms.length) return;
    container.append(
      Dom.element("span", "filter-caption", "Showing entities matching any of"),
    );
    for (const [index, term] of terms.entries()) {
      const matches = model.matching(term);
      const chip = Dom.element("span", "filter-chip");
      chip.title = `${matches.toLocaleString("en-US")} of ${model.document?.nodes.length.toLocaleString("en-US") ?? 0} entities contain "${term}" in their label, identifier, or type.`;
      const remove = Dom.element("button", "filter-remove");
      remove.dataset.termIndex = String(index);
      remove.setAttribute("aria-label", `Remove the filter ${term}`);
      remove.append(Dom.icon("close"));
      chip.append(
        Dom.element("strong", "", term),
        Dom.element("span", "filter-count", String(matches)),
        remove,
      );
      container.append(chip);
    }
    const clear = Dom.element("button", "text-button");
    clear.id = "clear-terms";
    clear.textContent = "Clear filters";
    container.append(clear);
  }

  /** Reflects the model's selected types and the all/none toggle label. */
  setTypeFilters(types) {
    this.typeCheckboxes.forEach((input, type) => {
      input.checked = types.has(type);
    });
    this.get("toggle-types").textContent =
      types.size === this.typeCheckboxes.size ? "Clear all" : "Select all";
  }

  resetFilters() {
    this.get("search-input").value = "";
    this.get("add-term").disabled = true;
    this.get("confidence-filter").value = "0";
    this.get("confidence-value").textContent = "0%";
    this.get("inferred-filter").checked = true;
    this.get("source-filter").value = "all";
    this.setTypeFilters(new Set(this.typeCheckboxes.keys()));
  }

  summary(model) {
    const data = model.document;
    this.get("target-label").textContent = data?.target ?? "No collection";
    this.investigationIcon(data?.target ?? null);
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

  /** Names the colours on the canvas and how many entities each one covers. */
  legend(visible, show) {
    const container = this.get("graph-legend");
    const counts = new Map();
    for (const node of visible.nodes)
      counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
    container.hidden = !show || !counts.size;
    if (container.hidden) return;
    container.replaceChildren(
      ...[...counts]
        .sort((first, second) => second[1] - first[1])
        .map(([type, count]) => {
          const item = Dom.element("span", "legend-item");
          item.append(
            Dom.dot(type),
            Dom.element("span", "", WorkspaceView.TYPE_LABELS[type] ?? type),
            Dom.element("span", "legend-count", count.toLocaleString("en-US")),
          );
          return item;
        }),
    );
  }

  visible(visible, hasDocument, isGraph) {
    this.get("visible-count").textContent =
      `${visible.nodes.length.toLocaleString("en-US")} entities · ${visible.edges.length.toLocaleString("en-US")} relationships`;
    this.get("no-results").hidden = !hasDocument || visible.nodes.length > 0;
    this.get("graph-controls").hidden =
      !hasDocument || !isGraph || !visible.nodes.length;
    this.get("canvas-caption").hidden =
      !hasDocument || !isGraph || !visible.nodes.length;
    this.legend(visible, Boolean(hasDocument) && isGraph && visible.nodes.length > 0);
    this.groupedList.render(visible.nodes);
  }

  entityRow(node) {
    const button = Dom.element("button", "entity-row");
    button.dataset.nodeId = node.id;
    const label = Dom.element("span", "entity-label");
    label.append(
      Dom.element("strong", "", node.label),
      Dom.element("small", "", node.type),
    );
    button.append(
      this.entityMark(node),
      label,
      Dom.element(
        "span",
        "entity-confidence",
        `${Math.round(node.confidence * 100)}%`,
      ),
    );
    return button;
  }

  /** Shows the investigated site's favicon, falling back to the workspace mark. */
  investigationIcon(target) {
    const container = this.get("collection-icon");
    const mark = () => container.replaceChildren(Dom.icon("network"));
    if (!target || !this.icons) {
      mark();
      return;
    }
    const image = document.createElement("img");
    image.width = 20;
    image.height = 20;
    image.alt = "";
    image.addEventListener("error", mark, { once: true });
    image.src = this.icons.favicon(target);
    container.replaceChildren(image);
  }

  /** A favicon or technology logo when one exists, otherwise the type dot. */
  entityMark(node) {
    const source = this.icons?.forNode(node);
    if (!source) return Dom.dot(node.type);
    const image = document.createElement("img");
    image.className = "entity-image";
    image.width = 18;
    image.height = 18;
    image.alt = "";
    image.loading = "lazy";
    image.src = source;
    image.addEventListener(
      "error",
      () => {
        image.replaceWith(Dom.dot(node.type));
      },
      { once: true },
    );
    return image;
  }

  tab(group, active) {
    const tabs =
      group === "workspace"
        ? ["graph", "tree", "entities"]
        : ["details", "collection"];
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
