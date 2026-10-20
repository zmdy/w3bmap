/**
 * Copies text to the clipboard. The asynchronous Clipboard API is unavailable
 * in some embedded and restricted browser contexts, so a hidden selection and
 * the legacy copy command are used as a fallback before reporting failure.
 */
export class ClipboardService {
  constructor(target = globalThis.navigator, host = globalThis.document) {
    this.navigator = target;
    this.document = host;
  }

  async write(text) {
    try {
      await this.navigator.clipboard.writeText(text);
      return true;
    } catch {
      return this.fallback(text);
    }
  }

  fallback(text) {
    const area = this.document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.setAttribute("aria-hidden", "true");
    area.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0";
    this.document.body.append(area);
    try {
      area.select();
      return this.document.execCommand("copy");
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}
