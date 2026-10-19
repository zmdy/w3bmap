import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { AnalysisService } from "../src/services/AnalysisService.js";
import { ConnectorClient } from "../src/services/ConnectorClient.js";
import { ConnectorSettings } from "../src/models/ConnectorSettings.js";
import { CollectionRepository } from "../src/services/CollectionRepository.js";
import { DocumentValidator } from "../explorer/src/services/DocumentValidator.js";

/** Opt-in PHP integration; page capture and Chrome permissions are simulated. */
class AnalyzeIntegration {
  async run() {
    const endpoint = process.env.W3BMAP_INTEGRATION_ENDPOINT;
    const apiKey = process.env.W3BMAP_API_KEY;
    if (!endpoint || !apiKey) throw new Error("Set W3BMAP_INTEGRATION_ENDPOINT and W3BMAP_API_KEY for the opt-in PHP integration.");
    const settings = new ConnectorSettings({ endpoint, apiKey,
      allowLocalHttp: process.env.W3BMAP_ALLOW_LOCAL_HTTP === "1",
      crawl: { enabled: process.env.W3BMAP_INTEGRATION_CRAWL === "1", depth: 1, maxPages: 2, maxHosts: 2, scope: "all", seeds: ["https://www.iana.org/help/example-domains"] },
      modules: process.env.W3BMAP_INTEGRATION_MODULES?.split(",") ?? ConnectorSettings.MODULES });
    const snapshot = { url: "https://example.com/", title: "Integration fixture", collected_at: new Date().toISOString(),
      links: [], resources: [], generators: [], hints: [] };
    const storage = {};
    const api = { permissions: { contains: async () => true }, tabs: {
      query: async () => [{ id: 1, url: snapshot.url }], get: async () => ({ id: 1, url: snapshot.url }) },
      scripting: { executeScript: async ({ world }) => [{ frameId: 0, result: world === "ISOLATED"
        ? structuredClone(snapshot) : { url: snapshot.url, signals: {} } }] },
      storage: { session: { set: async (value) => Object.assign(storage, value),
        get: async () => storage } } };
    const catalog = JSON.parse(await readFile(new URL("../fingerprints.json", import.meta.url), "utf8"));
    const collections = new CollectionRepository(api);
    const validator = new DocumentValidator();
    const service = new AnalysisService(api, { load: async () => settings }, new ConnectorClient(api), collections, validator, catalog);
    const summary = await service.analyze();
    const document = (await collections.latest()).document;
    validator.validate(document);
    assert.equal(summary.connector.connection, "connected", "PHP capabilities check did not complete.");
    assert.ok(summary.connector.modules.some((entry) => entry.status === "complete"), "No PHP module completed.");
    assert.ok(document.results.browser, "Browser findings were lost.");
    assert.ok(!JSON.stringify(document).includes(apiKey), "Authentication data entered the export.");
    console.log(JSON.stringify({ status: summary.connector.status, connection: summary.connector.connection,
      modules: summary.connector.modules.map(({ module, status }) => ({ module, status })),
      crawl: summary.connector.crawl ?? null, entities: summary.nodes, relationships: summary.edges }));
  }
}

await new AnalyzeIntegration().run();
