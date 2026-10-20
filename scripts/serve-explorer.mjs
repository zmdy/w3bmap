import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Minimal static file server for local Explorer verification. It serves the
 * repository over http://127.0.0.1 only and is not part of the application.
 */
export class ExplorerServer {
  static TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
  };

  constructor(root, port = 8081) {
    this.root = resolve(root);
    this.port = port;
  }

  resolveFile(url) {
    const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
    const file = resolve(join(this.root, pathname.endsWith("/") ? `${pathname}index.html` : pathname));
    return file === this.root || file.startsWith(this.root + sep) ? file : null;
  }

  async handle(request, response) {
    const file = this.resolveFile(request.url);
    if (!file) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    try {
      const body = await readFile(file);
      response.writeHead(200, {
        "content-type": ExplorerServer.TYPES[extname(file)] ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  }

  start() {
    createServer((request, response) => this.handle(request, response)).listen(
      this.port,
      "127.0.0.1",
      () => console.log(`Explorer: http://127.0.0.1:${this.port}/explorer/`),
    );
  }
}

new ExplorerServer(fileURLToPath(new URL("../", import.meta.url))).start();
