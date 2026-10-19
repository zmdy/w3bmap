import { test } from "node:test";
import assert from "node:assert/strict";
import { CrawlSettings } from "../src/models/CrawlSettings.js";
import { ConnectorSettings } from "../src/models/ConnectorSettings.js";
import { ConnectorClient } from "../src/services/ConnectorClient.js";
import { ConnectorEnrichmentService } from "../src/services/ConnectorEnrichmentService.js";
import { CollectionRepository } from "../src/services/CollectionRepository.js";
import { SettingsRepository } from "../src/services/SettingsRepository.js";
import { GraphBuilder } from "../src/models/GraphBuilder.js";
import { DocumentValidator } from "../explorer/src/services/DocumentValidator.js";

class RecursiveFixture {
  settings() { return new ConnectorSettings({ endpoint: "https://connector.example/w3bmap.php", apiKey: "x".repeat(64),
    modules: ["dns"], crawl: { enabled: true, depth: 2, scope: "host", maxPages: 4 } }); }
  local() { return new GraphBuilder().build({ url: "https://example.com/docs/", title: "Fixture", collected_at: "2026-10-19T12:00:00Z", links: [], resources: [], generators: [] }, []); }
  service(connector) { return new ConnectorEnrichmentService(connector, new DocumentValidator(), new CollectionRepository({})); }
}
const fixture = new RecursiveFixture();

test("recursive settings enforce bounded depth, page counts, hosts, scopes and URL lists", () => {
  assert.equal(new CrawlSettings().enabled, false);
  for (const values of [{ depth: 6 }, { depth: -1 }, { maxPages: 51 }, { maxHosts: 11 }, { scope: "unknown" }, { include: ["bad pattern"] },
    { seeds: ["file:///secret"] }, { seeds: ["https://user:pass@example.com/"] }, { seeds: ["https://example.com:8080/"] }])
    assert.throws(() => new CrawlSettings(values).validate());
  const values = new CrawlSettings({ seeds: ["https://example.com/a?token=omit#secret", "https://example.com/a"] }).validate();
  assert.deepEqual(values.seeds, ["https://example.com/a"]);
});

test("recursive requests use a bounded POST to the configured connector, not direct cross-site browser requests", async () => {
  const settings = fixture.settings();
  let captured;
  const client = new ConnectorClient({ permissions: { contains: async () => true } }, async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({ tool: "w3bm@p" }));
  });
  await client.crawl(settings, "https://example.com/docs/?private=omit#secret");
  assert.equal(new URL(captured.url).hostname, "connector.example");
  assert.equal(new URL(captured.url).searchParams.get("action"), "crawl");
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.redirect, "error");
  const body = JSON.parse(captured.options.body);
  assert.equal(body.url, "https://example.com/docs/");
  assert.equal(body.depth, 2);
  assert.equal(body.max_pages, 4);
  assert.ok(!captured.options.body.includes("private") && !captured.options.body.includes(settings.apiKey));
});

test("recursive Analyze dispatches the start page and preserves crawl results in the combined graph", async () => {
  const local = fixture.local();
  let visited;
  const result = await fixture.service({ capabilities: async () => ({ modules: ["dns"], crawl: { supported: true } }),
    analyze: async () => { throw new Error("Wrong collection action."); },
    crawl: async (settings, url) => {
      visited = url;
      return { ...structuredClone(local), source: "probe", nodes: [], edges: [],
        results: { dns: { records: [] }, crawl: { visited_pages: 3, visited_hosts: 1, stop_reason: "complete", remaining_urls: 0, pages: [] } } };
    } }).enrich(local, fixture.settings());
  assert.equal(visited, "https://example.com/docs/");
  assert.equal(result.report.crawl.visitedPages, 3);
  assert.equal(result.report.status, "complete");
  assert.ok(result.document.results.browser && result.document.results.crawl);
  assert.equal(new DocumentValidator().validate(result.document), true);
});

test("an older connector or missing endpoint reports recursive analysis failure without losing browser findings", async () => {
  const settings = fixture.settings();
  const older = await fixture.service({ capabilities: async () => ({ modules: ["dns"] }) }).enrich(fixture.local(), settings);
  assert.equal(older.report.status, "failed");
  assert.match(older.report.message, /Update the PHP connector/);
  const missing = await fixture.service({}).enrich(fixture.local(), new ConnectorSettings({ crawl: { enabled: true } }));
  assert.equal(missing.document.status, "partial");
  assert.equal(missing.document.errors[0].code, "connector_required");
  assert.ok(missing.document.nodes.length > 0);
});

test("saving recursive preferences does not copy the session API key into local settings", async () => {
  let written;
  const repository = new SettingsRepository({ storage: { local: { set: async (values) => { written = values; } } } });
  const settings = fixture.settings();
  repository.load = async () => settings;
  await repository.saveCrawl(new CrawlSettings({ enabled: true, depth: 3 }));
  assert.equal(written.connectorSettings.crawl.depth, 3);
  assert.equal(written.connectorSettings.endpoint, settings.endpoint);
  assert.ok(!JSON.stringify(written).includes(settings.apiKey));
});
