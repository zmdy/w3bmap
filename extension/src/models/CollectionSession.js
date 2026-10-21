/**
 * An open investigation: while one is running, analyzing a page adds it to the
 * same collection instead of starting a new one. The session is bookkeeping for
 * the popup and the background worker; it never enters the exported document.
 */
export class CollectionSession {
  static MAX_NAME = 120;

  constructor(values = {}) {
    this.active = values.active === true;
    this.name = String(values.name ?? "").trim().slice(0, CollectionSession.MAX_NAME);
    this.startedAt = values.startedAt ?? null;
    this.pages = Number.isInteger(values.pages) && values.pages >= 0 ? values.pages : 0;
  }

  static start(name, now = new Date()) {
    const label = String(name ?? "").trim().replace(/\s+/g, " ");
    return new CollectionSession({
      active: true,
      name: label.slice(0, CollectionSession.MAX_NAME) || "Investigation",
      startedAt: now.toISOString(),
      pages: 0,
    });
  }

  static finished() {
    return new CollectionSession();
  }

  counted() {
    return new CollectionSession({ ...this.values(), pages: this.pages + 1 });
  }

  values() {
    return { active: this.active, name: this.name, startedAt: this.startedAt, pages: this.pages };
  }

  /** What the popup shows on its pill while the session is open. */
  get label() {
    if (!this.active) return "";
    return `${this.name} · ${this.pages} ${this.pages === 1 ? "page" : "pages"}`;
  }
}

/** Keeps the open investigation in session storage, beside the collection. */
export class CollectionSessionRepository {
  constructor(api) {
    this.api = api;
  }

  async load() {
    return new CollectionSession(
      (await this.api.storage.session.get("investigation")).investigation ?? {},
    );
  }

  async save(session) {
    if (!session.active) {
      await this.api.storage.session.remove("investigation");
      return session;
    }
    await this.api.storage.session.set({ investigation: session.values() });
    return session;
  }
}
