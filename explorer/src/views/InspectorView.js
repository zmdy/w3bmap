import { Dom } from "./WorkspaceView.js";
import { GraphView } from "./GraphView.js";

export class InspectorView {
  constructor(details, collection) {
    this.details = details;
    this.collection = collection;
  }

  empty() {
    const wrapper = Dom.element("div", "inspector-empty");
    wrapper.append(
      Dom.icon("network"),
      Dom.element("strong", "", "Every finding has a story."),
      Dom.element(
        "p",
        "",
        "Select an entity or relationship to inspect its source and evidence.",
      ),
    );
    this.details.replaceChildren(wrapper);
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

  selected(kind, record, model) {
    this.details.replaceChildren();
    const node = kind === "node";
    const type = node ? record.type : "domain";
    const header = Dom.element("div");
    header.style.setProperty("--type-color", GraphView.COLORS[type]);
    const avatar = Dom.element("div", "entity-avatar");
    avatar.append(
      Dom.icon(
        node
          ? record.type === "page"
            ? "file"
            : record.type === "certificate"
              ? "shield"
              : "network"
          : "network",
      ),
    );
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
  }

  overview(model) {
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
