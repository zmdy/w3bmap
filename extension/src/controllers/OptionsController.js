import { ConnectorSettings } from "../models/ConnectorSettings.js";
import { SettingsRepository } from "../services/SettingsRepository.js";
import { RuntimeClient } from "../services/RuntimeClient.js";
import { OptionsView } from "../views/OptionsView.js";

export class OptionsController {
  constructor(api, view = new OptionsView()) {
    this.api = api;
    this.repository = new SettingsRepository(api);
    this.client = new RuntimeClient(api);
    this.view = view;
  }

  async start() {
    this.view.get("settings-form").addEventListener("submit", (event) => {
      event.preventDefault();
      this.save(false);
    });
    this.view
      .get("test-button")
      .addEventListener("click", () => this.save(true));
    this.view
      .get("forget-button")
      .addEventListener("click", () => this.forget());
    this.view.fill(await this.repository.load());
  }

  async save(test) {
    let permission;
    let settings;
    try {
      settings = this.view.read().validate(test);
      // Start the optional permission request before any await, preserving the user gesture.
      permission = settings.endpoint
        ? this.api.permissions.request({ origins: [settings.permissionOrigin] })
        : Promise.resolve(true);
      this.view.busy(true);
      if (!(await permission))
        throw new Error(
          "Host access was declined. The previous settings have been kept.",
        );
      const previous = await this.repository.load();
      await this.repository.save(settings);
      if (
        previous.endpoint &&
        (!settings.endpoint ||
          previous.permissionOrigin !== settings.permissionOrigin)
      ) {
        await this.api.permissions.remove({
          origins: [previous.permissionOrigin],
        });
      }
      this.view.get("capabilities").hidden = true;
      if (test) {
        const capabilities = await this.client.send("testConnector");
        this.view.capabilities(capabilities);
        this.view.notice(
          "Settings saved. Authenticated connection successful.",
        );
      } else
        this.view.notice(
          "Settings saved. Browser collection remains available without the connector.",
        );
    } catch (error) {
      this.view.notice(error.message, true);
    } finally {
      this.view.busy(false);
    }
  }

  async forget() {
    this.view.busy(true);
    try {
      const previous = await this.repository.load();
      await this.repository.forget();
      if (previous.endpoint)
        await this.api.permissions.remove({
          origins: [previous.permissionOrigin],
        });
      this.view.fill(new ConnectorSettings());
      this.view.get("capabilities").hidden = true;
      this.view.notice(
        "Connector settings and token removed. Browser-only collection is enabled.",
      );
    } catch (error) {
      this.view.notice(error.message, true);
    } finally {
      this.view.busy(false);
    }
  }
}
