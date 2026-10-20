/**
 * Decides whether a discovered URL is a page or a subresource asset.
 *
 * A page is a document a person can navigate to. An asset is a file the page
 * loads or links to: stylesheets, scripts, images, media, fonts, archives and
 * documents. The decision uses the element or Performance initiator kind first,
 * because it states how the URL was used, and falls back to the file extension
 * for anchors, where only the URL is known.
 */
export class ResourceClassifier {
  static DOCUMENT_KINDS = new Set([
    "iframe",
    "frame",
    "document",
    "navigation",
    "link",
  ]);
  static ASSET_KINDS = new Set([
    "script",
    "img",
    "image",
    "css",
    "video",
    "audio",
    "source",
    "track",
    "embed",
    "object",
    "font",
    "beacon",
    "xmlhttprequest",
    "fetch",
  ]);
  static ASSET_EXTENSIONS = new Set([
    "css", "js", "mjs", "cjs", "map", "json", "xml", "rss", "atom", "wasm",
    "png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "ico", "bmp", "tiff",
    "woff", "woff2", "ttf", "otf", "eot",
    "mp4", "webm", "ogg", "ogv", "mp3", "wav", "flac", "m4a", "avi", "mov",
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt", "rtf",
    "zip", "gz", "tgz", "bz2", "rar", "7z", "tar", "apk", "dmg", "exe",
  ]);

  /** The `link` element carries both stylesheets and ordinary page relations. */
  static kindIsDocument(kind) {
    return ResourceClassifier.DOCUMENT_KINDS.has(kind) && kind !== "link";
  }

  static extension(url) {
    try {
      const name = new URL(url).pathname.split("/").pop() ?? "";
      const dot = name.lastIndexOf(".");
      return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
    } catch {
      return "";
    }
  }

  static isAssetUrl(url) {
    return ResourceClassifier.ASSET_EXTENSIONS.has(
      ResourceClassifier.extension(url),
    );
  }

  /** Returns "page" or "asset" for a URL discovered with an optional kind. */
  static classify(url, kind = "") {
    const normalized = String(kind).toLowerCase();
    if (ResourceClassifier.kindIsDocument(normalized)) return "page";
    if (ResourceClassifier.ASSET_KINDS.has(normalized)) return "asset";
    // A stylesheet and a canonical URL are both <link>; only the URL separates them.
    return ResourceClassifier.isAssetUrl(url) ? "asset" : "page";
  }
}
