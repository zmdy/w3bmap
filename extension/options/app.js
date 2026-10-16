import { OptionsController } from "../src/controllers/OptionsController.js";
import { OptionsView } from "../src/views/OptionsView.js";

class OptionsApplication {
  async start() {
    if (!globalThis.chrome?.runtime?.id) {
      const view = new OptionsView();
      view.notice(
        "Load this extension in Chrome to configure its connector. This is a visual preview only.",
      );
      view.busy(true);
      return;
    }
    try {
      this.controller = new OptionsController(chrome);
      await this.controller.start();
    } catch (error) {
      document.getElementById("notice").textContent = error.message;
    }
  }
}

new OptionsApplication().start();
