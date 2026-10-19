import { test } from "node:test";
import assert from "node:assert/strict";
import { ConnectorSettings } from "../src/models/ConnectorSettings.js";
import { ConnectorEnrichmentService } from "../src/services/ConnectorEnrichmentService.js";
import { CollectionRepository } from "../src/services/CollectionRepository.js";
import { GraphBuilder } from "../src/models/GraphBuilder.js";
import { DocumentValidator } from "../explorer/src/services/DocumentValidator.js";

class EnrichmentFixture {
  local() {
    return new GraphBuilder().build({ url: "https://example.com/", title: "Fixture",
      collected_at: "2026-10-19T12:00:00Z", resources: [], links: [], generators: [] }, []);
  }
  settings(modules = ["dns", "rdap"]) {
    return new ConnectorSettings({ endpoint: "https://connector.example/w3bmap.php", apiKey: "x".repeat(64), modules });
  }
  remote(local, results, errors = []) {
    return { ...structuredClone(local), source: "probe", nodes: [], edges: [], results, errors,
      status: errors.length ? "partial" : "complete" };
  }
  service(connector) {
    return new ConnectorEnrichmentService(connector, new DocumentValidator(), new CollectionRepository({}));
  }
}
const fixture = new EnrichmentFixture();

test("a saved endpoint enables Analyze enrichment without the retired checkbox", () => {
  const settings = new ConnectorSettings({ ...fixture.settings().publicValues(), apiKey: "x".repeat(64), enabled: false });
  assert.equal(settings.validate().enabled, true);
  assert.equal(new ConnectorSettings().enabled, false);
  assert.deepEqual(new ConnectorSettings().modules, ConnectorSettings.MODULES);
});

test("Analyze tests PHP capabilities before requesting the selected target and modules", async () => {
  const local = fixture.local(), events = [], progress = [];
  const settings = fixture.settings();
  const result = await fixture.service({
    capabilities: async () => { events.push("capabilities"); return { modules: ["dns", "rdap"] }; },
    analyze: async (selected, target) => {
      events.push("analyze");
      assert.equal(target, "example.com");
      assert.deepEqual(selected.modules, ["dns", "rdap"]);
      return fixture.remote(local, { dns: { records: [] }, rdap: { name: "EXAMPLE.COM" } });
    },
  }).enrich(local, settings, (state) => progress.push(state));
  assert.deepEqual(events, ["capabilities", "analyze"]);
  assert.equal(progress[0].connection, "checking");
  assert.equal(progress[1].connection, "connected");
  assert.equal(result.report.status, "complete");
  assert.ok(result.report.modules.every((entry) => entry.status === "complete"));
  assert.ok(result.document.results.dns && result.document.results.rdap && result.document.results.browser);
  assert.equal(new DocumentValidator().validate(result.document), true);
});

test("no endpoint leaves browser collection independent and makes no PHP calls", async () => {
  const local = fixture.local();
  const result = await fixture.service({}).enrich(local, new ConnectorSettings());
  assert.equal(result.document, local);
  assert.equal(result.document.status, "complete");
  assert.equal(result.report.status, "not_configured");
});

test("a failed PHP connection preserves browser findings, redacts the key and skips collection", async () => {
  const local = fixture.local(), settings = fixture.settings();
  let collections = 0;
  const result = await fixture.service({
    capabilities: async () => { throw new Error("Rejected " + settings.apiKey); },
    analyze: async () => { collections++; },
  }).enrich(local, settings);
  assert.equal(collections, 0);
  assert.equal(result.document.nodes.length, local.nodes.length);
  assert.equal(result.document.status, "partial");
  assert.equal(result.report.connection, "failed");
  assert.equal(result.report.status, "failed");
  assert.ok(!JSON.stringify(result).includes(settings.apiKey));
});

test("unsupported modules do not prevent available checks and module failures remain visible", async () => {
  const local = fixture.local();
  const result = await fixture.service({
    capabilities: async () => ({ modules: ["dns", "rdap"] }),
    analyze: async (settings) => {
      assert.deepEqual(settings.modules, ["dns", "rdap"]);
      return fixture.remote(local, { dns: { records: [] } }, [{ module: "rdap", code: "timeout", message: "Registry timed out." }]);
    },
  }).enrich(local, fixture.settings(["dns", "rdap", "ssl"]));
  assert.equal(result.report.status, "partial");
  assert.deepEqual(result.report.modules.map((entry) => entry.status), ["complete", "failed", "unavailable"]);
  assert.equal(result.document.errors.length, 2);
  assert.equal(result.report.modules[1].message, "Registry timed out.");
});

test("an omitted module result is not reported as a successful PHP check", async () => {
  const local = fixture.local();
  const result = await fixture.service({ capabilities: async () => ({ modules: ["dns"] }),
    analyze: async () => fixture.remote(local, {}) }).enrich(local, fixture.settings(["dns"]));
  assert.equal(result.report.status, "failed");
  assert.equal(result.report.modules[0].status, "no_result");
  assert.equal(result.document.errors[0].code, "missing_result");
});
