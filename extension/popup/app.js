import { PopupController } from "../src/controllers/PopupController.js";

class PopupApplication {
  async start() {
    if (!globalThis.chrome?.runtime?.id) {
      document.getElementById("notice").textContent =
        "Load the extension in Chrome to analyze pages. This HTTP preview does not have extension permissions.";
      document.querySelectorAll("button").forEach((button) => {
        button.disabled = true;
      });
      return;
    }
    try {
      this.controller = new PopupController(chrome);
      await this.controller.start();
    } catch (error) {
      document.getElementById("notice").textContent = error.message;
    }
  }
}

new PopupApplication().start();
