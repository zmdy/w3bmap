import { EntityClusterModel } from "../models/EntityClusterModel.js";
import { GraphFilters, GraphModel } from "../models/GraphModel.js";
import { SampleFactory } from "../models/SampleFactory.js";
import { TreeModel } from "../models/TreeModel.js";
import { DocumentValidator } from "../services/DocumentValidator.js";
import { CollectionMerger } from "../services/CollectionMerger.js";
import { FileService } from "../services/FileService.js";
import { IconService } from "../services/IconService.js";
import { EntityReportService } from "../services/EntityReportService.js";
import { ClipboardService } from "../services/ClipboardService.js";
import { GraphView } from "../views/GraphView.js";
import { WorkspaceView } from "../views/WorkspaceView.js";
import { InspectorView } from "../views/InspectorView.js";
import { TreeView } from "../views/TreeView.js";

export class ExplorerController {
  constructor() {
    this.model = new GraphModel();
    this.validator = new DocumentValidator();
    this.merger = new CollectionMerger(this.validator);
    this.files = new FileService();
    this.icons = new IconService();
    this.report = new EntityReportService();
    this.clipboard = new ClipboardService();
    this.clusters = new EntityClusterModel();
    this.tree = new TreeModel();
    this.view = new WorkspaceView(
      this.clusters,
      () => this.updateClusters(false),
      this.icons,
    );
    this.inspector = new InspectorView(
      this.view.get("details-panel"),
      this.view.get("collection-panel"),
      this.icons,
    );
    this.treeView = new TreeView(
      this.view.get("tree-panel"),
      this.tree,
      this.icons,
      (kind, id) => this.selectTree(kind, id),
      (id) => this.toggleFolder(id),
    );
    this.graph = new GraphView(
      this.view.get("graph"),
      (kind, record) => this.select(kind, record),
      (zoom) => {
        this.view.get("zoom-label").textContent = `${zoom}%`;
      },
      this.clusters,
    );
    this.workspaceTab = "graph";
    this.selection = null;
    this.folder = null;
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
      const files = Array.from(event.target.files);
      event.target.value = "";
      if (files.length === 1) this.import(files[0]);
      else if (files.length > 1) this.importMultiple(files);
    });
    on("merge-button", "click", () => this.view.get("merge-input").click());
    on("merge-input", "change", (event) => {
      const files = Array.from(event.target.files);
      event.target.value = "";
      if (files.length > 0) this.mergeFiles(files);
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
      this.view.setTypeFilters(this.model.filters.types);
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
    on("tree-tab", "click", () => this.setWorkspaceTab("tree"));
    on("entities-tab", "click", () => this.setWorkspaceTab("entities"));
    on("graph-nav", "click", () => this.setWorkspaceTab("graph"));
    on("tree-nav", "click", () => this.setWorkspaceTab("tree"));
    on("copy-entities", "click", () => this.copyEntities());
    on("toggle-types", "click", () => this.toggleAllTypes());
    on("split-hosts", "click", () => this.toggleHostSplit());
    on("expand-tree", "click", () => this.setAllFolders(true));
    on("collapse-tree", "click", () => this.setAllFolders(false));
    on("details-tab", "click", () => this.view.tab("inspector", "details"));
    on("collection-tab", "click", () =>
      this.view.tab("inspector", "collection"),
    );
    for (const id of ["entity-list", "details-panel"])
      on(id, "click", (event) => this.inspectButton(event));
    on("help-button", "click", () => this.view.get("help-dialog").showModal());
    on("close-help", "click", () => this.view.get("help-dialog").close());
    this.bindTabKeyboard(["graph", "tree", "entities"], (name) =>
      this.setWorkspaceTab(name),
    );
    this.bindTabKeyboard(["details", "collection"], (name) =>
      this.view.tab("inspector", name),
    );
    on("expand-clusters", "click", () => this.setAllClusters(true));
    on("collapse-clusters", "click", () => this.setAllClusters(false));
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
      const files = Array.from(event.dataTransfer.files).filter((file) => file.name.endsWith(".json") || file.type === "application/json");
      if (files.length === 0) {
        this.view.notice(
          "Please drop JSON collection files. The current collection has been kept.",
          true,
        );
        return;
      }
      if (files.length === 1) {
        this.import(files[0]);
      } else {
        this.importMultiple(files);
      }
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

  async importMultiple(files) {
    if (!files || files.length === 0) return;
    if (files.length === 1) return this.import(files[0]);

    const version = ++this.importVersion;
    this.view.busy(true);
    try {
      const documents = [];
      for (const file of files) {
        const text = await this.files.read(file);
        if (version !== this.importVersion) return;
        documents.push(this.validator.parse(text));
      }
      const merged = this.merger.merge(documents);
      this.load(merged, `Investigation (${files.length} reports)`);
      this.view.notice(
        `${files.length} reports merged into a single investigation (${merged.nodes.length} entities, ${merged.edges.length} relationships).`,
      );
    } catch (error) {
      if (version === this.importVersion) {
        this.view.notice(
          `${error.message} The current collection has been kept.`,
          true,
        );
      }
    } finally {
      if (version === this.importVersion) this.view.busy(false);
    }
  }

  async mergeFiles(files) {
    if (!files || files.length === 0) return;
    if (!this.model.document || this.model.isSample) {
      return this.importMultiple(files);
    }
    const version = ++this.importVersion;
    this.view.busy(true);
    try {
      const documents = [this.model.document];
      for (const file of files) {
        const text = await this.files.read(file);
        if (version !== this.importVersion) return;
        documents.push(this.validator.parse(text));
      }
      const merged = this.merger.merge(documents);
      this.load(merged, merged.target);
      this.view.notice(
        `Merged ${files.length} report(s) into current investigation. Total: ${merged.nodes.length} entities, ${merged.edges.length} relationships.`,
      );
    } catch (error) {
      if (version === this.importVersion) {
        this.view.notice(
          `${error.message} The current collection has been kept.`,
          true,
        );
      }
    } finally {
      if (version === this.importVersion) this.view.busy(false);
    }
  }

  load(document, name, isSample = false) {
    clearTimeout(this.searchTimer);
    this.model.load(document, name, isSample);
    this.selection = null;
    this.folder = null;
    this.tree.expanded = new Set();
    this.view.resetFilters();
    this.view.summary(this.model);
    this.clusters.load(this.model.document.nodes);
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
    this.folder = null;
    this.tree.expanded = new Set();
    this.view.resetFilters();
    this.view.summary(this.model);
    this.clusters.load([]);
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
    this.renderTree(visible);
    if (this.selection) {
      const { kind, record } = this.selection;
      const exists =
        kind === "node"
          ? visible.nodes.some((node) => node.id === record.id)
          : visible.edges.some((edge) => edge.index === record.index);
      if (exists) {
        this.graph.select(kind, record);
        this.inspector.selected(kind, record, this.model);
        this.view.selection(kind === "node" ? record.id : null);
        this.treeView.selection(kind === "node" ? record.id : null);
      } else {
        this.selection = null;
        this.graph.clearSelection();
        this.inspector.empty();
      }
    } else if (this.folder) {
      const folder = this.tree.find(this.folder.id);
      if (folder) this.inspector.folder(folder, this.model);
      else {
        this.folder = null;
        this.inspector.empty();
      }
    } else {
      // Keeps the general figures in step with the filters without a selection.
      this.inspector.empty();
    }
  }

  renderTree(visible) {
    this.tree.build(visible.nodes, this.model.document?.target ?? "");
    this.treeView.render();
    this.view.get("tree-actions").hidden =
      this.workspaceTab !== "tree" || !this.model.document;
    const split = this.view.get("split-hosts");
    split.hidden = !this.tree.multiSite;
    split.setAttribute("aria-pressed", String(this.tree.byHost));
    split.textContent = this.tree.byHost ? "Merge sites" : "Split by site";
    this.view.get("entities-actions").hidden =
      this.workspaceTab !== "entities" || !this.model.document;
    this.treeView.selection(
      this.folder?.id ??
        (this.selection?.kind === "node" ? this.selection.record.id : null),
    );
  }

  /** Copies the visible entity list, grouped exactly as the Entities tab shows it. */
  async copyEntities() {
    const visible = this.model.visible();
    const text = this.report.text(this.clusters.visible(visible.nodes), {
      target: this.model.document?.target ?? "",
      total: visible.nodes.length,
      filtered: visible.nodes.length !== (this.model.document?.nodes.length ?? 0),
    });
    if (await this.clipboard.write(text))
      this.view.notice(
        `${visible.nodes.length.toLocaleString("en-US")} visible entities copied as a grouped list.`,
      );
    else
      this.view.notice(
        "The clipboard is not available in this browser context. Use Export JSON to save the complete collection.",
        true,
      );
  }

  toggleAllTypes() {
    const select = this.model.filters.types.size < GraphFilters.TYPES.length;
    this.model.filters.types = new Set(select ? GraphFilters.TYPES : []);
    this.view.setTypeFilters(this.model.filters.types);
    this.refresh();
  }

  /** Switches between one folder per site and a single merged path tree. */
  toggleHostSplit() {
    this.tree.setByHost(!this.tree.byHost);
    this.folder = null;
    this.renderTree(this.model.visible());
    this.inspector.empty();
  }

  toggleFolder(id) {
    this.tree.toggle(id);
    this.treeView.render();
    this.treeView.selection(
      this.folder?.id ??
        (this.selection?.kind === "node" ? this.selection.record.id : null),
    );
  }

  setAllFolders(open) {
    this.tree.setAll(open);
    this.treeView.render();
  }

  selectTree(kind, id) {
    if (kind === "folder") {
      const folder = this.tree.find(id);
      if (!folder) return;
      this.selection = null;
      this.folder = folder;
      this.graph.clearSelection();
      this.view.selection(null);
      this.treeView.selection(id);
      this.inspector.folder(folder, this.model);
      this.view.tab("inspector", "details");
      return;
    }
    const node = this.model.document?.nodes.find((item) => item.id === id);
    if (node) this.select("node", node);
  }

  setWorkspaceTab(name) {
    this.workspaceTab = name;
    this.view.tab("workspace", name);
    this.view.visible(
      this.model.visible(),
      Boolean(this.model.document),
      name === "graph",
    );
    this.view.get("tree-actions").hidden =
      name !== "tree" || !this.model.document;
    this.view.get("entities-actions").hidden =
      name !== "entities" || !this.model.document;
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

  setAllClusters(open) {
    this.clusters.setAll(open);
    this.updateClusters();
  }

  updateClusters(refreshList = true) {
    if (refreshList) this.refresh();
    else this.graph.filter(this.model.visible());
    if (this.selection) {
      this.graph.select(this.selection.kind, this.selection.record);
      this.view.selection(this.selection.kind === "node" ? this.selection.record.id : null);
    }
  }

  select(kind, record) {
    if (kind === "clear") {
      this.selection = null;
      this.graph.clearSelection();
      this.view.selection(null);
      this.inspector.empty();
      return;
    }
    if (kind === "cluster") {
      this.clusters.setOpen(record, !this.clusters.isOpen(record));
      this.updateClusters();
      this.selection = null;
      this.view.selection(null);
      this.inspector.empty();
      this.graph.focusGroup(record);
      return;
    }
    if (kind === "aggregate") {
      this.selection = null;
      this.view.selection(null);
      this.inspector.empty();
      this.graph.focusAggregate(record);
      this.view.notice(`${record.indexes.length} visible relationships summarized. Expand the connected groups to inspect each original relationship.`);
      return;
    }
    if (!record) return;
    this.folder = null;
    const expandedBefore = this.clusters.expanded.size;
    if (kind === "node") this.clusters.expandNode(record.id);
    else { this.clusters.expandNode(record.source); this.clusters.expandNode(record.target); }
    if (expandedBefore !== this.clusters.expanded.size) {
      this.graph.filter(this.model.visible());
      this.view.visible(this.model.visible(), Boolean(this.model.document), this.workspaceTab === "graph");
    }
    this.selection = { kind, record };
    this.graph.select(kind, record);
    this.view.selection(kind === "node" ? record.id : null);
    if (kind === "node" && this.tree.revealNode(record.id)) this.treeView.render();
    this.treeView.selection(kind === "node" ? record.id : null);
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
