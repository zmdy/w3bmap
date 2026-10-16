import { GraphModel } from "../models/GraphModel.js";
import { SampleFactory } from "../models/SampleFactory.js";
import { DocumentValidator } from "../services/DocumentValidator.js";
import { FileService } from "../services/FileService.js";
import { GraphView } from "../views/GraphView.js";
import { WorkspaceView } from "../views/WorkspaceView.js";
import { InspectorView } from "../views/InspectorView.js";

export class ExplorerController {
  constructor() {
    this.model = new GraphModel();
    this.validator = new DocumentValidator();
    this.files = new FileService();
    this.view = new WorkspaceView();
    this.inspector = new InspectorView(
      this.view.get("details-panel"),
      this.view.get("collection-panel"),
    );
    this.graph = new GraphView(
      this.view.get("graph"),
      (kind, record) => this.select(kind, record),
      (zoom) => {
        this.view.get("zoom-label").textContent = `${zoom}%`;
      },
    );
    this.workspaceTab = "graph";
    this.selection = null;
    this.importVersion = 0;
    this.dragDepth = 0;
    this.bind();
    this.sample();
  }

  bind() {
    const on = (id, event, handler) =>
      this.view.get(id).addEventListener(event, handler);
    for (const id of ["import-button", "empty-import"])
      on(id, "click", () => this.view.get("file-input").click());
    on("file-input", "change", (event) => {
      const file = event.target.files[0];
      event.target.value = "";
      if (file) this.import(file);
    });
    for (const id of ["load-sample", "sample-button"])
      on(id, "click", () => this.sample());
    on("export-button", "click", () => this.export());
    on("clear-button", "click", () => this.clear());
    for (const id of ["reset-button", "no-results-reset"])
      on(id, "click", () => this.reset());
    on("search-input", "input", (event) => {
      this.model.filters.query = event.target.value;
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => this.refresh(), 130);
    });
    on("type-filters", "change", (event) => {
      const type = event.target.dataset.filterType;
      if (!type) return;
      if (event.target.checked) this.model.filters.types.add(type);
      else this.model.filters.types.delete(type);
      this.refresh();
    });
    on("inferred-filter", "change", (event) => {
      this.model.filters.showInferred = event.target.checked;
      this.refresh();
    });
    on("confidence-filter", "input", (event) => {
      this.model.filters.minConfidence = Number(event.target.value) / 100;
      this.view.get("confidence-value").textContent = `${event.target.value}%`;
      this.refresh();
    });
    on("source-filter", "change", (event) => {
      this.model.filters.source = event.target.value;
      this.refresh();
    });
    on("layout-select", "change", (event) =>
      this.graph.layout(event.target.value),
    );
    on("zoom-in", "click", () => this.graph.zoom(1.2));
    on("zoom-out", "click", () => this.graph.zoom(1 / 1.2));
    on("fit-button", "click", () => this.graph.fit());
    on("graph-tab", "click", () => this.setWorkspaceTab("graph"));
    on("entities-tab", "click", () => this.setWorkspaceTab("entities"));
    on("graph-nav", "click", () => this.setWorkspaceTab("graph"));
    on("details-tab", "click", () => this.view.tab("inspector", "details"));
    on("collection-tab", "click", () =>
      this.view.tab("inspector", "collection"),
    );
    for (const id of ["entity-list", "details-panel"])
      on(id, "click", (event) => this.inspectButton(event));
    on("help-button", "click", () => this.view.get("help-dialog").showModal());
    on("close-help", "click", () => this.view.get("help-dialog").close());
    this.bindTabKeyboard(["graph", "entities"], (name) =>
      this.setWorkspaceTab(name),
    );
    this.bindTabKeyboard(["details", "collection"], (name) =>
      this.view.tab("inspector", name),
    );
    this.bindDrop();
  }

  bindTabKeyboard(names, select) {
    for (const [index, name] of names.entries())
      this.view.get(`${name}-tab`).addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? names.length - 1
              : (index + (event.key === "ArrowRight" ? 1 : -1) + names.length) %
                names.length;
        select(names[next]);
        this.view.get(`${names[next]}-tab`).focus();
      });
  }

  bindDrop() {
    document.addEventListener("dragenter", (event) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      this.dragDepth++;
      this.view.get("drop-overlay").hidden = false;
    });
    document.addEventListener("dragover", (event) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    });
    document.addEventListener("dragleave", (event) => {
      event.preventDefault();
      this.dragDepth = Math.max(0, this.dragDepth - 1);
      if (this.dragDepth === 0) this.view.get("drop-overlay").hidden = true;
    });
    document.addEventListener("drop", (event) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      this.dragDepth = 0;
      this.view.get("drop-overlay").hidden = true;
      if (event.dataTransfer.files.length !== 1) {
        this.view.notice(
          "Import one collection at a time. The current collection has been kept.",
          true,
        );
        return;
      }
      this.import(event.dataTransfer.files[0]);
    });
  }

  async import(file) {
    const version = ++this.importVersion;
    this.view.busy(true);
    try {
      const text = await this.files.read(file);
      if (version !== this.importVersion) return;
      const document = this.validator.parse(text);
      this.load(document, file.name);
      this.view.notice(
        `${file.name} imported. ${document.errors.length ? `${document.errors.length} module error(s) are available in Collection.` : "All collection data is available."}`,
      );
    } catch (error) {
      if (version === this.importVersion)
        this.view.notice(
          `${error.message} The current collection has been kept.`,
          true,
        );
    } finally {
      if (version === this.importVersion) this.view.busy(false);
    }
  }

  load(document, name, isSample = false) {
    clearTimeout(this.searchTimer);
    this.model.load(document, name, isSample);
    this.selection = null;
    this.view.resetFilters();
    this.view.summary(this.model);
    this.graph.load(this.model.document);
    this.inspector.overview(this.model);
    this.refresh();
    this.graph.layout(this.view.get("layout-select").value);
    const root =
      this.model.document.nodes.find(
        (node) => node.id === `domain:${document.target}`,
      ) ?? this.model.document.nodes[0];
    if (root) this.select("node", root);
    else this.inspector.empty();
    this.view.tab("inspector", "details");
  }

  sample() {
    this.importVersion++;
    this.view.busy(false);
    const data = new SampleFactory().create();
    this.validator.validate(data);
    this.load(data, "Sample investigation · synthetic data", true);
    this.view.notice(
      "You are exploring a synthetic sample. Import a JSON collection to view your own discoveries.",
    );
  }

  clear() {
    this.importVersion++;
    clearTimeout(this.searchTimer);
    this.view.busy(false);
    this.model.clear();
    this.selection = null;
    this.view.resetFilters();
    this.view.summary(this.model);
    this.graph.load(null);
    this.inspector.empty();
    this.inspector.overview(this.model);
    this.view.notice("");
    this.refresh();
  }

  reset() {
    clearTimeout(this.searchTimer);
    this.model.filters.reset();
    this.view.resetFilters();
    this.refresh();
    this.graph.fit();
  }

  refresh() {
    const visible = this.model.visible();
    this.graph.filter(visible);
    this.view.visible(
      visible,
      Boolean(this.model.document),
      this.workspaceTab === "graph",
    );
    if (this.selection) {
      const { kind, record } = this.selection;
      const exists =
        kind === "node"
          ? visible.nodes.some((node) => node.id === record.id)
          : visible.edges.some((edge) => edge.index === record.index);
      if (exists) {
        this.inspector.selected(kind, record, this.model);
        this.view.selection(kind === "node" ? record.id : null);
      } else {
        this.selection = null;
        this.graph.clearSelection();
        this.inspector.empty();
      }
    }
  }

  setWorkspaceTab(name) {
    this.workspaceTab = name;
    this.view.tab("workspace", name);
    this.view.visible(
      this.model.visible(),
      Boolean(this.model.document),
      name === "graph",
    );
    this.view.selection(
      this.selection?.kind === "node" ? this.selection.record.id : null,
    );
    if (name === "graph") requestAnimationFrame(() => this.graph.resize());
  }

  inspectButton(event) {
    const button = event.target.closest(
      "button[data-node-id],button[data-edge-index]",
    );
    if (!button || !this.model.document) return;
    if (button.dataset.nodeId !== undefined) {
      const node = this.model.document.nodes.find(
        (item) => item.id === button.dataset.nodeId,
      );
      if (node) this.select("node", node);
    } else {
      const index = Number(button.dataset.edgeIndex);
      const edge = this.model.document.edges[index];
      if (edge) this.select("edge", { ...edge, index });
    }
  }

  select(kind, record) {
    this.selection = { kind, record };
    this.graph.select(kind, record);
    this.view.selection(kind === "node" ? record.id : null);
    this.inspector.selected(kind, record, this.model);
    this.view.tab("inspector", "details");
  }

  export() {
    try {
      const target =
        this.model.document?.target.replace(/[^a-z0-9.-]/gi, "_") ||
        "collection";
      this.files.download(this.model.exportJson(), `w3bmap-${target}.json`);
      this.view.notice(
        "The complete collection was exported. Filters do not change the exported data.",
      );
    } catch (error) {
      this.view.notice(error.message, true);
    }
  }
}
