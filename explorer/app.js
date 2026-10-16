import { ExplorerController } from "./src/controllers/ExplorerController.js";

class ExplorerApplication {
  start() {
    try {
      this.controller = new ExplorerController();
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
