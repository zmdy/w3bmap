export class BackgroundController {
  constructor(api, settings, connector, collections, analysis) {
    Object.assign(this, { api, settings, connector, collections, analysis });
    api.tabs.onUpdated?.addListener((tabId, change) => {
      if (change.status === "loading" || change.url) {
        api.action?.setBadgeText({ tabId, text: "" }).catch(() => {});
      }
    });
  }

  async handle(message, sender) {
    const ownOrigin = this.api.runtime.getURL("");
    if (
      sender.id !== this.api.runtime.id ||
      !sender.url?.startsWith(ownOrigin)
    ) {
      throw new Error(
        "Only trusted extension pages may request this operation.",
      );
    }
    switch (message?.action) {
      case "detect":
        return this.analysis.detect();
      case "state": {
        const settings = await this.settings.load();
        return {
          running: this.analysis.running,
          progress: this.analysis.progress ?? null,
          connectorEnabled: settings.enabled,
          latest: this.collections.summary(await this.collections.latest()),
        };
      }
      case "analyze":
        return this.analysis.analyze();
      case "collection":
        return (await this.collections.latest())?.document ?? null;
      case "clear":
        if (this.analysis.running)
          throw new Error(
            "Wait for the running analysis before clearing its result.",
          );
        await this.collections.clear();
        return null;
      case "testConnector":
        return this.connector.capabilities(await this.settings.load());
      case "openExplorer": {
        const latest = await this.collections.latest();
        if (!latest)
          throw new Error("Analyze a page before opening its graph.");
        await this.api.tabs.create({
          url:
            this.api.runtime.getURL("explorer/index.html") +
            "#collection=" +
            encodeURIComponent(latest.id),
        });
        return null;
      }
      default:
        throw new Error("Unknown extension operation.");
    }
  }
}
