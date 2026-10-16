export class RuntimeClient {
  constructor(api) {
    this.api = api;
  }

  async send(action) {
    const response = await this.api.runtime.sendMessage({ action });
    if (!response?.ok)
      throw new Error(
        response?.error ??
          "The extension background service is unavailable. Reload the extension.",
      );
    return response.data;
  }
}
