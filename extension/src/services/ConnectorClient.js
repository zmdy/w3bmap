import { ConnectorSettings } from "../models/ConnectorSettings.js";

export class ConnectorClient {
  constructor(api, fetcher = fetch) {
    this.api = api;
    this.fetcher = fetcher;
  }

  async request(settings, action, payload = null) {
    settings.validate(true);
    if (
      !(await this.api.permissions.contains({
        origins: [settings.permissionOrigin],
      }))
    ) {
      throw new Error(
        "Connector host access is missing. Open Settings and save the endpoint to grant access.",
      );
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const url = new URL(settings.endpoint);
      url.searchParams.set("action", action);
      const response = await this.fetcher(url.href, {
        method: payload ? "POST" : "GET",
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json" } : {}),
        },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      });
      if (!response.ok)
        throw new Error(
          `The connector returned HTTP ${response.status}. Check its token, allowlist, and HTTPS configuration.`,
        );
      if (!response.body)
        throw new Error("The connector returned an empty response.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let bytes = 0;
      let text = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 4 * 1024 * 1024)
            throw new Error(
              "The connector response exceeded the 4 MiB extension limit.",
            );
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        await reader.cancel().catch(() => {});
      }
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("The connector did not return valid JSON.");
      }
      if (
        JSON.stringify(data).includes(
          JSON.stringify(settings.apiKey).slice(1, -1),
        )
      ) {
        throw new Error(
          "The connector response included authentication data and was rejected.",
        );
      }
      if (!data || data.tool !== "w3bm@p")
        throw new Error("This endpoint is not a compatible w3bm@p connector.");
      return data;
    } catch (error) {
      if (error.name === "AbortError")
        throw new Error("The connector request timed out after 25 seconds.");
      if (error instanceof TypeError)
        throw new Error(
          "The connector could not be reached. Verify HTTPS, host permission, and the final endpoint URL. Redirects are not followed.",
        );
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async capabilities(settings) {
    const data = await this.request(settings, "capabilities");
    if (
      data.api_version !== "1.0" ||
      data.schema_version !== "1.0" ||
      !Array.isArray(data.modules) ||
      data.modules.some((module) => !ConnectorSettings.MODULES.includes(module))
    ) {
      throw new Error(
        "The connector has an incompatible API or capability response.",
      );
    }
    return data;
  }

  async analyze(settings, domain) {
    if (
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/.test(
        domain,
      )
    ) {
      throw new Error(
        "Remote enrichment requires a DNS hostname. Browser findings are still available for this page.",
      );
    }
    return this.request(settings, "analyze", {
      domain,
      modules: settings.modules,
    });
  }
}
