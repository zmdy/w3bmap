import { Dom } from "./WorkspaceView.js";
import { GraphView } from "./GraphView.js";
import { CollectionStatsService } from "../services/CollectionStatsService.js";

export class InspectorView {
  static ICONS = {
    page: "file",
    asset: "code",
    certificate: "shield",
    technology: "code",
    ip: "server",
    sitemap: "sitemap",
    domain: "globe",
  };

  constructor(details, collection, icons, stats = new CollectionStatsService()) {
    this.details = details;
    this.collection = collection;
    this.icons = icons;
    this.stats = stats;
    this.model = null;
  }

  empty() {
    const wrapper = Dom.element("div", "inspector-empty");
    wrapper.append(
      Dom.icon("network"),
      Dom.element("strong", "", "Every finding has a story."),
      Dom.element(
        "p",
        "",
        "Select an entity, folder, or relationship to inspect its source and evidence.",
      ),
    );
    this.details.replaceChildren(wrapper);
    this.glance();
  }

  /** General figures for the loaded collection, shown with any selection. */
  glance() {
    const overview = this.stats.overview(
      this.model?.document,
      this.model?.visible(),
    );
    if (!overview) return;
    const section = this.section(this.details, "Collection at a glance");
    this.figures(section, [
      ["Entities", overview.entities],
      ["Relationships", overview.relationships],
      ...Object.entries(CollectionStatsService.TYPE_LABELS).map(
        ([type, label]) => [label, overview.types[type]],
      ),
      ["Hosts", overview.hosts],
      ["Links detected", overview.links],
      ["Resource references", overview.resources],
      ["Inferred relationships", overview.inferred],
      ["Module results", overview.modules],
      ["Module errors", overview.errors],
    ]);
    section.append(
      Dom.element(
        "p",
        "inspector-subtitle",
        overview.filtered
          ? "Counted from the entities and relationships visible under the current filters."
          : "Counted from the complete loaded collection.",
      ),
    );
  }

  figures(parent, entries) {
    const grid = Dom.element("div", "figure-grid");
    for (const [label, value] of entries) {
      const cell = Dom.element("div", "figure-cell");
      cell.append(
        Dom.element(
          "strong",
          "",
          typeof value === "number" ? value.toLocaleString("en-US") : String(value),
        ),
        Dom.element("span", "", label),
      );
      grid.append(cell);
    }
    parent.append(grid);
  }

  section(parent, title) {
    const section = Dom.element("section", "detail-section");
    section.append(Dom.element("h3", "", title));
    parent.append(section);
    return section;
  }

  row(parent, label, value) {
    const list = Dom.element("dl", "detail-row");
    list.append(
      Dom.element("dt", "", label),
      Dom.element("dd", "", String(value)),
    );
    parent.append(list);
  }

  evidence(parent, evidence) {
    const text = JSON.stringify(evidence, null, 2);
    const limit = 65536;
    parent.append(
      Dom.element(
        "pre",
        "evidence-block",
        text.length > limit
          ? text.slice(0, limit) +
              "\n… Preview truncated. Export JSON to read the complete value."
          : text,
      ),
    );
  }

  /** Builds the coloured header with a favicon, a technology logo, or an icon. */
  avatar(type, node = null) {
    const avatar = Dom.element("div", "entity-avatar");
    const source = node ? this.icons?.forNode(node) : null;
    if (source) {
      const image = document.createElement("img");
      image.width = 24;
      image.height = 24;
      image.alt = "";
      image.src = source;
      image.addEventListener(
        "error",
        () => {
          image.replaceWith(
            Dom.icon(InspectorView.ICONS[type] ?? "network"),
          );
        },
        { once: true },
      );
      avatar.append(image);
    } else avatar.append(Dom.icon(InspectorView.ICONS[type] ?? "network"));
    return avatar;
  }

  /** Details for a Tree view folder: a URL path prefix, not an ownership claim. */
  folder(folder, model) {
    this.model = model;
    this.details.replaceChildren();
    const header = Dom.element("div");
    header.style.setProperty("--type-color", GraphView.COLORS[folder.type]);
    const avatar = Dom.element("div", "entity-avatar");
    avatar.append(Dom.icon("folder"));
    header.append(
      avatar,
      Dom.element("div", "inspector-type", "Folder"),
      Dom.element("h3", "inspector-title", folder.label),
      Dom.element("div", "inspector-subtitle", folder.path.join(" › ")),
    );
    this.details.append(header);
    const figures = this.stats.forFolder(model.document, folder);
    const properties = this.section(this.details, "Folder");
    this.figures(properties, [
      ["Entities", figures.items],
      ["Subfolders", figures.folders],
      ["Hosts", figures.hosts],
      ["Linked technologies", figures.technologies.length],
    ]);
    this.row(properties, "Path", folder.path.join("/") || "/");
    this.row(
      properties,
      "Sources",
      figures.sources.join(", ") || "Not reported",
    );
    if (figures.first) this.row(properties, "First collected", Dom.date(figures.first));
    if (figures.last) this.row(properties, "Last collected", Dom.date(figures.last));
    properties.append(
      Dom.element(
        "p",
        "inspector-subtitle",
        "Folders group entities by URL path. A shared path does not prove that the hosts below it are related.",
      ),
    );
    if (figures.technologies.length) {
      const technologies = this.section(this.details, "Related technologies");
      for (const id of figures.technologies.slice(0, 30)) {
        const entity = model.document.nodes.find((item) => item.id === id);
        if (!entity) continue;
        const button = Dom.element("button", "relationship-link");
        button.dataset.nodeId = id;
        const label = Dom.element("span", "", entity.label);
        button.append(this.avatar(entity.type, entity), label);
        technologies.append(button);
      }
    }
    const contents = this.section(this.details, `Contents (${folder.children.length})`);
    for (const child of folder.children.slice(0, 30)) {
      if (child.kind === "folder") {
        const row = Dom.element("div", "relationship-link static");
        row.append(
          Dom.icon("folder"),
          Dom.element("span", "", `${child.label} (${child.count})`),
        );
        contents.append(row);
        continue;
      }
      const button = Dom.element("button", "relationship-link");
      button.dataset.nodeId = child.node.id;
      const label = Dom.element("span", "", child.url ?? child.label);
      label.append(Dom.element("small", "", child.type));
      button.append(Dom.dot(child.type), label);
      contents.append(button);
    }
    if (folder.children.length > 30)
      contents.append(
        Dom.element(
          "p",
          "inspector-subtitle",
          `Showing 30 of ${folder.children.length} items.`,
        ),
      );
    this.glance();
  }

  selected(kind, record, model) {
    this.model = model;
    this.details.replaceChildren();
    const node = kind === "node";
    const type = node ? record.type : "domain";
    const header = Dom.element("div");
    header.style.setProperty("--type-color", GraphView.COLORS[type]);
    const avatar = this.avatar(type, node ? record : null);
    header.append(
      avatar,
      Dom.element("div", "inspector-type", node ? record.type : "Relationship"),
      Dom.element(
        "h3",
        "inspector-title",
        node ? record.label : record.type.replaceAll("_", " "),
      ),
      Dom.element(
        "div",
        "inspector-subtitle",
        node ? record.id : `${record.source} → ${record.target}`,
      ),
    );
    this.details.append(header);
    const properties = this.section(this.details, "Discovery");
    this.row(properties, "Source", node ? record.source : record.source_tool);
    this.row(properties, "Collected", Dom.date(record.collected_at));
    this.row(
      properties,
      "Confidence",
      `${Math.round(record.confidence * 100)}%`,
    );
    const bar = Dom.element("div", "confidence-track");
    const fill = Dom.element("span");
    fill.style.width = `${record.confidence * 100}%`;
    bar.append(fill);
    properties.append(bar);
    if (!node) this.row(properties, "Verification", record.verification);
    if (node) {
      const figures = this.stats.forNode(model.document, record);
      this.figures(this.section(this.details, "Connections"), [
        ["Relationships", figures.relationships],
        ["Connected entities", figures.neighbours],
        ["Technologies", figures.types.technology],
        ["Pages", figures.types.page],
        ["Domains", figures.types.domain],
        ["Links", figures.links],
      ]);
    }
    this.evidence(this.section(this.details, "Evidence"), record.evidence);
    const relations = this.section(
      this.details,
      node ? "Visible relationships" : "Connected entities",
    );
    if (node) {
      const edges = model
        .visible()
        .edges.filter(
          (edge) => edge.source === record.id || edge.target === record.id,
        );
      for (const edge of edges.slice(0, 30)) {
        const otherId = edge.source === record.id ? edge.target : edge.source;
        const other = model.document.nodes.find(
          (entity) => entity.id === otherId,
        );
        const button = Dom.element("button", "relationship-link");
        button.dataset.edgeIndex = String(edge.index);
        const label = Dom.element("span", "", other.label);
        label.append(Dom.element("small", "", edge.type.replaceAll("_", " ")));
        button.append(Dom.dot(other.type), label);
        relations.append(button);
      }
      if (!edges.length)
        relations.append(
          Dom.element(
            "p",
            "inspector-subtitle",
            "No relationships under the current filters.",
          ),
        );
      if (edges.length > 30)
        relations.append(
          Dom.element(
            "p",
            "inspector-subtitle",
            `Showing 30 of ${edges.length} relationships.`,
          ),
        );
    } else {
      for (const id of [record.source, record.target]) {
        const entity = model.document.nodes.find((item) => item.id === id);
        const button = Dom.element("button", "relationship-link");
        button.dataset.nodeId = id;
        button.append(
          Dom.dot(entity.type),
          Dom.element("span", "", entity.label),
        );
        relations.append(button);
      }
    }
    this.glance();
  }

  overview(model) {
    this.model = model;
    this.collection.replaceChildren();
    const data = model.document;
    if (!data) {
      this.collection.append(
        Dom.element(
          "p",
          "inspector-empty",
          "Import a collection to inspect its module results.",
        ),
      );
      return;
    }
    this.collection.append(
      Dom.element(
        "div",
        "inspector-type",
        model.isSample ? "Synthetic sample" : "Collection",
      ),
      Dom.element("h3", "inspector-title", data.target),
    );
    this.row(this.collection, "Status", data.status);
    this.row(this.collection, "Source", data.source);
    this.row(this.collection, "Collected", Dom.date(data.collected_at));
    this.row(this.collection, "Entities", data.nodes.length);
    this.row(this.collection, "Relationships", data.edges.length);
    const errors = this.section(
      this.collection,
      `Module errors (${data.errors.length})`,
    );
    for (const error of data.errors) {
      const card = Dom.element("div", "module-error");
      card.append(
        Dom.element("strong", "", `${error.module} · ${error.code}`),
        Dom.element("span", "", error.message),
      );
      errors.append(card);
    }
    if (!data.errors.length)
      errors.append(
        Dom.element(
          "p",
          "inspector-subtitle",
          "No module errors were reported.",
        ),
      );
    const results = this.section(this.collection, "Module results");
    for (const [name, result] of Object.entries(data.results)) {
      const details = Dom.element("details", "module-details");
      details.append(Dom.element("summary", "", name));
      this.evidence(details, result);
      results.append(details);
    }
    if (!Object.keys(data.results).length)
      results.append(
        Dom.element("p", "inspector-subtitle", "No successful module results."),
      );
  }
}
