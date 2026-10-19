import { mkdir, writeFile } from "node:fs/promises";

/** Browser-only regression fixture: Node fetch does not enforce the browser receiver. */
class BrowserTransportPreviewBuilder {
  async run() {
    const directory = new URL("../../data/", import.meta.url);
    await mkdir(directory, { recursive: true });
    const client = `
import { ConnectorClient } from '../extension/src/services/ConnectorClient.js';
import { ConnectorSettings } from '../extension/src/models/ConnectorSettings.js';
class TransportFixture {
  async run() {
    const settings = new ConnectorSettings({ endpoint: new URL('../probe/w3bmap.php', import.meta.url).href,
      apiKey: 'a'.repeat(64), allowLocalHttp: true });
    const client = new ConnectorClient({ permissions: { contains: async () => true } });
    try { await client.capabilities(settings); return 'FAIL: fixture key unexpectedly authenticated'; }
    catch (error) { return /HTTP 401/.test(error.message)
      ? 'PASS: native fetch reached PHP (HTTP 401 with a dummy key)'
      : 'FAIL: ' + error.message; }
  }
}
`;
    await writeFile(new URL("browser-transport-worker.js", directory), client + `
postMessage(await new TransportFixture().run());`);
    await writeFile(new URL("browser-transport-preview.js", directory), client + `
class BrowserTransportPreview {
  async run() {
    const results = document.getElementById('results');
    results.textContent = 'Window: ' + await new TransportFixture().run();
    const worker = new Worker('./browser-transport-worker.js', { type: 'module' });
    worker.addEventListener('message', event => { results.textContent += '\\nWorker: ' + event.data; worker.terminate(); });
    worker.addEventListener('error', () => { results.textContent += '\\nWorker: FAIL'; worker.terminate(); });
  }
}
await new BrowserTransportPreview().run();`);
    await writeFile(new URL("browser-transport-preview.html", directory), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Browser connector transport regression</title>
<script type="module" src="browser-transport-preview.js"></script>
<style>body{font:16px/1.6 system-ui;padding:32px;color:#173845}pre{padding:20px;background:#eef8f5;border-radius:8px;white-space:pre-wrap}</style>
</head><body><h1>Browser connector transport regression</h1><p>Actual ConnectorClient and native browser fetch. Same-origin PHP endpoint; dummy API key only.</p>
<pre id="results">Running...</pre><p>This verifies transport in Window and Worker contexts. Installed Chrome host permissions still require a separate check.</p></body></html>`);
    console.log("Browser regression fixture: http://127.0.0.1/w3bm%40p/data/browser-transport-preview.html");
  }
}

await new BrowserTransportPreviewBuilder().run();
