import { ExplorerController } from "./src/controllers/ExplorerController.js";
import { ExtensionCollectionSource } from "./src/services/ExtensionCollectionSource.js";

class ExplorerApplication {
  async start() {
    try {
      this.controller = new ExplorerController();
      if (
        location.protocol === "chrome-extension:" &&
        new URLSearchParams(location.hash.slice(1)).has("collection")
      ) {
        try {
          const data = await new ExtensionCollectionSource(
            globalThis.chrome,
          ).read(location.hash);
          this.controller.validator.validate(data);
          this.controller.load(data, "Extension collection");
          this.controller.view.notice(
            "Extension collection loaded. Export JSON to keep a copy after the browser session ends.",
          );
        } catch (error) {
          this.controller.clear();
          this.controller.view.notice(error.message, true);
        }
      }
    } catch (error) {
      const notice = document.getElementById("notice");
      notice.hidden = false;
      notice.classList.add("error");
      notice.setAttribute("role", "alert");
      notice.textContent =
        "The Explorer could not start. Serve the repository over local HTTP and check that all Explorer files are present.";
      console.error(error);
    }
  }
}

new ExplorerApplication().start();
