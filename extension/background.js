import { SettingsRepository } from "./src/services/SettingsRepository.js";
import { ConnectorClient } from "./src/services/ConnectorClient.js";
import { CollectionRepository } from "./src/services/CollectionRepository.js";
import { AnalysisService } from "./src/services/AnalysisService.js";
import { BackgroundController } from "./src/controllers/BackgroundController.js";
import { DocumentValidator } from "./explorer/src/services/DocumentValidator.js";

class BackgroundApplication {
  constructor(api) {
    this.api = api;
    this.ready = this.initialize();
    api.runtime.onMessage.addListener((message, sender, reply) => {
      this.ready
        .then((controller) => controller.handle(message, sender))
        .then((data) => reply({ ok: true, data }))
        .catch((error) => reply({ ok: false, error: error.message }));
      return true;
    });
  }

  async initialize() {
    const settings = new SettingsRepository(this.api);
    await settings.secure();
    const connector = new ConnectorClient(this.api);
    const collections = new CollectionRepository(this.api);
    const response = await fetch(this.api.runtime.getURL("fingerprints.json"));
    if (!response.ok)
      throw new Error(
        "The packaged technology catalog is missing. Rebuild the extension.",
      );
    const catalog = await response.json();
    const analysis = new AnalysisService(
      this.api,
      settings,
      connector,
      collections,
      new DocumentValidator(),
      catalog,
    );
    return new BackgroundController(
      this.api,
      settings,
      connector,
      collections,
      analysis,
    );
  }
}

new BackgroundApplication(chrome);
