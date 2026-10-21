import { CollectionSession } from "../models/CollectionSession.js";

export class BackgroundController {
  constructor(api, settings, connector, collections, analysis, sessions = null) {
    Object.assign(this, { api, settings, connector, collections, analysis, sessions });
    api.tabs.onUpdated?.addListener((tabId, change) => {
      if (change.status === "loading" || change.url) {
        api.action?.setBadgeText({ tabId, text: "" }).catch(() => {});
      }
    });
  }

  async session() {
    return (await this.sessions?.load()) ?? new CollectionSession();
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
        const session = await this.session();
        return {
          running: this.analysis.running,
          progress: this.analysis.progress ?? null,
          connectorEnabled: settings.enabled,
          crawl: settings.crawl.publicValues(),
          latest: this.collections.summary(await this.collections.latest()),
          session: session.values(),
        };
      }
      case "startCollection": {
        if (this.analysis.running)
          throw new Error("Wait for the running analysis before starting a collection.");
        await this.collections.clear();
        const session = CollectionSession.start(message.name);
        await this.sessions?.save(session);
        return session.values();
      }
      case "finishCollection": {
        await this.sessions?.save(CollectionSession.finished());
        return CollectionSession.finished().values();
      }
      case "analyze": {
        // An open investigation keeps growing; a one-off analysis replaces it.
        const session = await this.session();
        const result = await this.analysis.analyze(
          message.crawl,
          message.append === true || session.active,
        );
        if (session.active) await this.sessions?.save(session.counted());
        return result;
      }
      case "collection":
        return (await this.collections.latest())?.document ?? null;
      case "merge": {
        const documents = Array.isArray(message.documents) ? [...message.documents] : [];
        if (message.includeExisting) {
          const current = await this.collections.latest();
          if (current?.document) documents.unshift(current.document);
        }
        const record = await this.collections.merge(documents);
        return this.collections.summary(record);
      }
      case "appendCollection": {
        const record = await this.collections.append(message.document);
        return this.collections.summary(record);
      }
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
