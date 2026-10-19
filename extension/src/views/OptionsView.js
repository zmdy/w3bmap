import { ConnectorSettings } from "../models/ConnectorSettings.js";

export class OptionsView {
  constructor() {
    for (const module of ConnectorSettings.MODULES) {
      const label = document.createElement("label");
      label.className = "module-option";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "modules";
      input.value = module;
      label.append(input, document.createTextNode(module));
      this.get("module-list").append(label);
    }
  }

  get(id) {
    return document.getElementById(id);
  }
  read() {
    return new ConnectorSettings({
      endpoint: this.get("endpoint").value,
      apiKey: this.get("api-key").value,
      rememberKey: this.get("remember-key").checked,
      allowLocalHttp: this.get("local-http").checked,
      crawl: this.crawl,
      modules: [
        ...document.querySelectorAll('input[name="modules"]:checked'),
      ].map((input) => input.value),
    });
  }

  fill(settings) {
    this.crawl = settings.crawl.publicValues();
    this.get("endpoint").value = settings.endpoint;
    this.get("api-key").value = settings.apiKey;
    this.get("remember-key").checked = settings.rememberKey;
    this.get("local-http").checked = settings.allowLocalHttp;
    document.querySelectorAll('input[name="modules"]').forEach((input) => {
      input.checked = settings.modules.includes(input.value);
    });
  }

  notice(text, error = false) {
    this.get("notice").textContent = text;
    this.get("notice").classList.toggle("error", error);
    this.get("notice").setAttribute("role", error ? "alert" : "status");
  }

  busy(value) {
    for (const id of ["save-button", "test-button", "forget-button"])
      this.get(id).disabled = value;
    this.get("settings-form").setAttribute("aria-busy", String(value));
  }

  capabilities(data) {
    this.get("capabilities").hidden = false;
    this.get("capability-list").textContent = data.modules.join(" · ");
    const unavailable = this.read().modules.filter(
      (module) => !data.modules.includes(module),
    );
    this.get("capability-note").textContent = unavailable.length
      ? `Selected modules unavailable on this server: ${unavailable.join(", ")}. They will be reported as module errors.`
      : "All selected modules are available on this server.";
  }
}
