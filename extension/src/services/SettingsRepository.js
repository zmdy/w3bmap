import { ConnectorSettings } from "../models/ConnectorSettings.js";

export class SettingsRepository {
  constructor(api) {
    this.api = api;
  }

  async secure() {
    await this.api.storage.local.setAccessLevel({
      accessLevel: "TRUSTED_CONTEXTS",
    });
    await this.api.storage.session.setAccessLevel({
      accessLevel: "TRUSTED_CONTEXTS",
    });
  }

  async load() {
    await this.secure();
    const local = await this.api.storage.local.get([
      "connectorSettings",
      "connectorKey",
    ]);
    const session = await this.api.storage.session.get("connectorKey");
    return new ConnectorSettings({
      ...local.connectorSettings,
      apiKey: session.connectorKey ?? local.connectorKey ?? "",
    });
  }

  async save(settings) {
    settings.validate();
    await this.secure();
    if (settings.rememberKey) {
      await this.api.storage.local.set({ connectorKey: settings.apiKey });
      await this.api.storage.session.remove("connectorKey");
    } else {
      await this.api.storage.session.set({ connectorKey: settings.apiKey });
      await this.api.storage.local.remove("connectorKey");
    }
    await this.api.storage.local.set({
      connectorSettings: settings.publicValues(),
    });
  }

  async forget() {
    await this.secure();
    await this.api.storage.local.remove(["connectorSettings", "connectorKey"]);
    await this.api.storage.session.remove("connectorKey");
  }

  async saveCrawl(crawl) {
    crawl.validate();
    const settings = await this.load();
    settings.crawl = crawl;
    await this.api.storage.local.set({ connectorSettings: settings.publicValues() });
  }
}
