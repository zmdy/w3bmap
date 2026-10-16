import { RuntimeClient } from "../services/RuntimeClient.js";
import { PopupView } from "../views/PopupView.js";
import { FileService } from "../../explorer/src/services/FileService.js";

export class PopupController {
  constructor(api) {
    this.api = api;
    this.client = new RuntimeClient(api);
    this.view = new PopupView();
  }

  async start() {
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
    const [tab] = await this.api.tabs.query({
      active: true,
      currentWindow: true,
    });
    this.view.current(tab);
    await this.refresh();
    await this.detect();
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
    this.view.state(state);
    clearTimeout(this.refreshTimer);
    if (state.running)
      this.refreshTimer = setTimeout(
        () =>
          this.refresh().catch((error) =>
            this.view.notice(error.message, true),
          ),
        1000,
      );
    return state;
  }

  async analyze() {
    this.view.busy(true);
    this.view.notice(
      "Collecting the active page. You may close this popup and reopen it to check the result.",
    );
    try {
      const result = await this.client.send("analyze");
      this.view.notice(
        result.status === "partial"
          ? "Browser findings were collected. Some enrichment modules failed."
          : "Collection ready. Open its graph or export JSON.",
      );
    } catch (error) {
      this.view.notice(error.message, true);
    } finally {
      await this.refresh().catch((error) =>
        this.view.notice(error.message, true),
      );
    }
  }

  async operation(action) {
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
