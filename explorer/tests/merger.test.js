import { test } from "node:test";
import assert from "node:assert/strict";
import { CollectionMerger } from "../src/services/CollectionMerger.js";
import { DocumentValidator } from "../src/services/DocumentValidator.js";

class MergerFixture {
  docA() {
    return {
      schema_version: "1.0",
      tool: "w3bm@p",
      target: "alpha.example",
      source: "extension",
      collected_at: "2026-10-20T10:00:00.000Z",
      status: "complete",
      nodes: [
        { id: "domain:alpha.example", type: "domain", label: "alpha.example", source: "extension", collected_at: "2026-10-20T10:00:00.000Z", evidence: { source: "test" }, confidence: 0.9 },
        { id: "page:https://alpha.example/", type: "page", label: "https://alpha.example/", source: "extension", collected_at: "2026-10-20T10:00:00.000Z", evidence: {}, confidence: 0.8 },
        { id: "technology:react", type: "technology", label: "React", source: "extension", collected_at: "2026-10-20T10:00:00.000Z", evidence: { version: "18.2.0" }, confidence: 0.85 },
      ],
      edges: [
        { source: "domain:alpha.example", target: "page:https://alpha.example/", type: "hosts", source_tool: "extension", collected_at: "2026-10-20T10:00:00.000Z", evidence: {}, confidence: 0.9, verification: "observed" },
        { source: "page:https://alpha.example/", target: "technology:react", type: "uses", source_tool: "extension", collected_at: "2026-10-20T10:00:00.000Z", evidence: {}, confidence: 0.85, verification: "inferred" },
      ],
      results: { browser: { title: "Alpha" }, dns: { ip: "1.1.1.1" } },
      errors: [],
    };
  }

  docB() {
    return {
      schema_version: "1.0",
      tool: "w3bm@p",
      target: "beta.example",
      source: "probe",
      collected_at: "2026-10-20T11:00:00.000Z",
      status: "complete",
      nodes: [
        { id: "domain:beta.example", type: "domain", label: "beta.example", source: "probe", collected_at: "2026-10-20T11:00:00.000Z", evidence: {}, confidence: 0.95 },
        { id: "page:https://beta.example/", type: "page", label: "https://beta.example/", source: "probe", collected_at: "2026-10-20T11:00:00.000Z", evidence: {}, confidence: 0.8 },
        // Shared node with docA, but higher confidence:
        { id: "technology:react", type: "technology", label: "React", source: "probe", collected_at: "2026-10-20T11:00:00.000Z", evidence: { version: "18.2.0", runtime: true }, confidence: 0.95 },
        { id: "ip:1.1.1.1", type: "ip", label: "1.1.1.1", source: "probe", collected_at: "2026-10-20T11:00:00.000Z", evidence: {}, confidence: 0.9 },
      ],
      edges: [
        { source: "domain:beta.example", target: "page:https://beta.example/", type: "hosts", source_tool: "probe", collected_at: "2026-10-20T11:00:00.000Z", evidence: {}, confidence: 0.95, verification: "observed" },
        { source: "page:https://beta.example/", target: "technology:react", type: "uses", source_tool: "probe", collected_at: "2026-10-20T11:00:00.000Z", evidence: {}, confidence: 0.95, verification: "observed" },
        { source: "domain:beta.example", target: "ip:1.1.1.1", type: "resolves_to", source_tool: "probe", collected_at: "2026-10-20T11:00:00.000Z", evidence: {}, confidence: 0.9, verification: "observed" },
      ],
      results: { rdap: { asn: 13335 } },
      errors: [{ module: "ssl", code: "handshake_timeout", message: "Timeout" }],
    };
  }
}

const fixture = new MergerFixture();
const validator = new DocumentValidator();
const merger = new CollectionMerger(validator);

test("CollectionMerger validates inputs and handles single document cloning", () => {
  assert.throws(() => merger.merge([]), /Provide at least one collection/);
  assert.throws(() => merger.merge([{ invalid: true }]), /invalid/i);

  const doc = fixture.docA();
  const result = merger.merge([doc]);
  assert.deepEqual(result, doc);
  assert.notEqual(result, doc); // Deep clone
  assert.equal(validator.validate(result), true);
});

test("CollectionMerger unites multiple reports into a single investigation graph without duplicate nodes", () => {
  const merged = merger.merge([fixture.docA(), fixture.docB()]);

  assert.equal(validator.validate(merged), true);
  assert.equal(merged.target, "Investigation: alpha.example, beta.example");
  assert.equal(merged.source, "extension"); // prioritizes extension
  assert.equal(merged.collected_at, "2026-10-20T11:00:00.000Z"); // latest
  assert.equal(merged.status, "complete");

  // 3 nodes from A, 4 from B, 1 shared (technology:react) = 6 unique nodes
  assert.equal(merged.nodes.length, 6);
  const react = merged.nodes.find((n) => n.id === "technology:react");
  assert.equal(react.confidence, 0.95); // max of 0.85 and 0.95
  assert.equal(react.evidence.runtime, true);

  // 2 edges from A, 3 from B = 5 edges
  assert.equal(merged.edges.length, 5);

  // Results are merged
  assert.ok(merged.results.browser && merged.results.dns && merged.results.rdap);

  // Errors are merged
  assert.equal(merged.errors.length, 1);
  assert.equal(merged.errors[0].module, "ssl");
});

test("CollectionMerger unites crawl reports and deduplicates crawled pages", () => {
  const doc1 = fixture.docA();
  doc1.results.crawl = {
    visited_hosts: 1,
    visited_pages: 1,
    hosts: { "alpha.example": { dns: { ip: "1.1.1.1" } } },
    pages: [{ url: "https://alpha.example/", depth: 0 }],
  };

  const doc2 = fixture.docB();
  doc2.results.crawl = {
    visited_hosts: 1,
    visited_pages: 2,
    hosts: { "beta.example": { dns: { ip: "2.2.2.2" } } },
    pages: [{ url: "https://beta.example/", depth: 0 }, { url: "https://beta.example/about", depth: 1 }],
  };

  const merged = merger.merge([doc1, doc2]);
  assert.equal(validator.validate(merged), true);
  assert.equal(merged.results.crawl.visited_hosts, 2);
  assert.equal(merged.results.crawl.visited_pages, 3);
  assert.equal(merged.results.crawl.pages.length, 3);
  assert.ok(merged.results.crawl.hosts["alpha.example"] && merged.results.crawl.hosts["beta.example"]);
});
