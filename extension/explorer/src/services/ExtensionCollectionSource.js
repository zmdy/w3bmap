export class ExtensionCollectionSource {
  constructor(api) {
    this.api = api;
  }

  async read(hash) {
    const id = new URLSearchParams(hash.replace(/^#/, "")).get("collection");
    if (!id) return null;
    if (!this.api?.runtime?.id || !this.api.storage?.session)
      throw new Error("Extension collection storage is unavailable.");
    const stored = (await this.api.storage.session.get("collection"))
      .collection;
    if (!stored || stored.id !== id) {
      throw new Error(
        "This collection is no longer available. Open the latest result from the extension popup.",
      );
    }
    return stored.document;
  }
}
