import { RuntimeClient } from "../services/RuntimeClient.js";
import { DiscoveryPopupView } from "../views/DiscoveryPopupView.js";
import { FileService } from "../../explorer/src/services/FileService.js";

export class PopupController {
  constructor(api) {
    this.api = api;
    this.client = new RuntimeClient(api);
    this.view = new DiscoveryPopupView(api);
    this.analyzing = false;
  }

  async start() {
    this.bindNavigation();
    for (const panel of ["site", "related"]) {
      this.view.get(`expand-${panel}-groups`).addEventListener("click", () => this.view.setPanelGroups(panel, true));
      this.view.get(`collapse-${panel}-groups`).addEventListener("click", () => this.view.setPanelGroups(panel, false));
      this.view.get(`merge-${panel}-sites`).addEventListener("click", () => this.view.togglePanelSites(panel));
      this.view.get(`view-${panel}-tree`).addEventListener("click", () => this.view.setPanelMode(panel, "tree"));
      this.view.get(`view-${panel}-groups`).addEventListener("click", () => this.view.setPanelMode(panel, "groups"));
    }
    this.view
      .get("analyze-button")
      .addEventListener("click", () => this.analyze());
    this.view
      .get("settings-button")
      .addEventListener("click", () => this.api.runtime.openOptionsPage());
    this.view
      .get("open-graph")
      .addEventListener("click", () => this.operation("openExplorer"));
    this.view
      .get("clear-result")
      .addEventListener("click", () => this.operation("clear"));
    this.view.get("export-json").addEventListener("click", () => this.export());
    this.view.get("rescan-button").addEventListener("click", () => this.detect());
    this.view.get("technology-search").addEventListener("input", (event) => this.view.filterTechnologies(event.target.value));
    this.view.get("menu-append-page")?.addEventListener("click", () => this.appendCurrent());
    this.view.get("menu-new-collection")?.addEventListener("click", () => this.startCollection());
    for (const id of ["menu-finish-collection", "finish-collection"])
      this.view.get(id)?.addEventListener("click", () => this.finishCollection());
    this.view.get("menu-merge-reports")?.addEventListener("click", () => {
      this.view.menu(false);
      this.view.get("popup-merge-input")?.click();
    });
    this.view.get("popup-merge-input")?.addEventListener("change", (event) => {
      const files = Array.from(event.target.files);
      event.target.value = "";
      if (files.length) this.mergeReports(files);
    });
    const [tab] = await this.api.tabs.query({
      active: true,
      currentWindow: true,
    });
    this.view.current(tab);
    await this.refresh();
    await this.detect();
  }

  bindNavigation() {
    const tabs = ["page", "site", "related", "php", "recent"];
    for (const [index, name] of tabs.entries()) {
      const button = this.view.get(`tab-${name}`);
      button.addEventListener("click", () => this.view.selectTab(name));
      button.addEventListener("keydown", (event) => {
        const visibleTabs = tabs.filter((t) => !this.view.get(`tab-${t}`).hidden);
        const currentIndex = visibleTabs.indexOf(name);
        const next = event.key === "ArrowRight"
          ? (currentIndex + 1) % visibleTabs.length
          : event.key === "ArrowLeft"
            ? (currentIndex + visibleTabs.length - 1) % visibleTabs.length
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? visibleTabs.length - 1
                : null;
        if (next !== null && currentIndex !== -1) {
          event.preventDefault();
          this.view.selectTab(visibleTabs[next], true);
        }
      });
    }
    this.view.get("view-technologies").addEventListener("click", () => this.view.toggleTechnologies());
    for (const id of ["header-menu", "scan-options", "more-options"]) {
      this.view.get(id).addEventListener("click", () => this.view.menu(this.view.get("more-menu").hidden));
    }
    for (const id of ["footer-settings", "menu-settings"]) this.view.get(id).addEventListener("click", () => this.api.runtime.openOptionsPage());
    this.view.get("menu-rescan").addEventListener("click", () => { this.view.menu(false); this.view.selectTab("page"); this.detect(); });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") this.view.menu(false); });
    document.addEventListener("click", (event) => { if (!event.target.closest("#more-menu,#header-menu,#scan-options,#more-options")) this.view.menu(false); });
  }

  async detect() {
    this.view.detectionBusy(true);
    try {
      this.view.detection(await this.client.send("detect"));
    } catch (error) {
      this.view.detectionError(error.message);
    } finally {
      this.view.detectionBusy(false);
    }
  }

  async refresh() {
    const state = await this.client.send("state");
    this.view.state({ ...state, running: state.running || this.analyzing });
    await this.refreshProbes(state.latest?.id ?? null);
    clearTimeout(this.refreshTimer);
    if (state.running || this.analyzing)
      this.refreshTimer = setTimeout(
        () =>
          this.refresh().catch((error) =>
            this.view.notice(error.message, true),
          ),
        1000,
      );
    return state;
  }

  async refreshProbes(id) {
    if (this.probeCollectionId === id) return;
    this.probeCollectionId = id;
    this.view.probes.render(null);
    if (!id) return;
    this.view.get("probe-context").textContent = "Loading saved server probe results…";
    try {
      const document = await this.client.send("collection");
      if (this.probeCollectionId === id) this.view.probes.render(document);
    } catch (error) {
      if (this.probeCollectionId === id) {
        this.probeCollectionId = undefined;
        this.view.get("probe-context").textContent = `Could not load saved server probe results: ${error.message}`;
      }
    }
  }

  /** Opens an investigation so every later analysis joins the same collection. */
  async startCollection() {
    this.view.menu(false);
    const suggestion = this.view.pageHost() || "Investigation";
    const name = globalThis.prompt("Name this collection", suggestion);
    if (name === null) return;
    try {
      const session = await this.client.send("startCollection", { name });
      await this.refresh();
      this.view.notice(
        `Collecting into ${session.name}. Every analysis is added to it until you finish the collection.`,
      );
    } catch (error) {
      this.view.notice(error.message, true);
    }
  }

  async finishCollection() {
    this.view.menu(false);
    try {
      await this.client.send("finishCollection");
      await this.refresh();
      this.view.notice(
        "Collection finished. The saved investigation stays available until you clear it.",
      );
    } catch (error) {
      this.view.notice(error.message, true);
    }
  }

  async appendCurrent() {
    this.view.menu(false);
    await this.analyze(true);
  }

  async mergeReports(files) {
    this.view.menu(false);
    this.view.notice("Reading and merging collection files…");
    try {
      const documents = [];
      const fileService = new FileService();
      for (const file of files) {
        const text = await fileService.read(file);
        documents.push(JSON.parse(text));
      }
      await this.client.send("merge", { documents, includeExisting: true });
      await this.refresh();
      this.view.notice(`Merged ${files.length} report(s) into unified investigation.`);
      this.view.selectTab("recent");
    } catch (error) {
      this.view.notice(`Merge failed: ${error.message}`, true);
    }
  }

  async analyze(append = false) {
    if (this.analyzing) return;
    this.analyzing = true;
    this.view.busy(true);
    this.view.notice(
      append
        ? "Appending this page to the active investigation…"
        : "Collecting the active page. You may close this popup and reopen it to check the result.",
    );
    try {
      const operation = this.client.send("analyze", { crawl: this.view.readCrawl(), append });
      // Poll progress while the background service performs the PHP requests.
      this.refresh().catch(() => {});
      const result = await operation;
      this.view.notice(
        append
          ? "Page findings merged into active investigation. Open the combined graph or export JSON."
          : result.connector?.status === "complete"
          ? "Browser and server checks complete. Open the combined graph or export JSON."
          : result.connector?.status === "failed"
          ? "Server checks failed. Browser findings were saved; open the Server tab for details."
          : result.status === "partial"
          ? "Browser findings were collected. Some enrichment modules failed."
          : "Browser collection ready. Configure a connector to include server checks.",
      );
    } catch (error) {
      this.view.notice(error.message, true);
    } finally {
      this.analyzing = false;
      await this.refresh().catch((error) =>
        this.view.notice(error.message, true),
      );
    }
  }

  async operation(action) {
    this.view.menu(false);
    try {
      await this.client.send(action);
      await this.refresh();
      if (action === "clear") this.view.notice("Last collection cleared.");
    } catch (error) {
      this.view.notice(error.message, true);
    }
  }

  async export() {
    try {
      const data = await this.client.send("collection");
      if (!data) throw new Error("Analyze a page before exporting.");
      new FileService().download(
        JSON.stringify(data, null, 2) + "\n",
        `w3bmap-${data.target.replace(/[^a-z0-9.-]/gi, "_")}.json`,
      );
      this.view.notice("The complete collection was exported.");
    } catch (error) {
      this.view.notice(error.message, true);
    }
  }
}
