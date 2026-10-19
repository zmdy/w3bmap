import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { GraphModel, GraphFilters } from "../src/models/GraphModel.js";
import { SampleFactory } from "../src/models/SampleFactory.js";
import { DocumentValidator } from "../src/services/DocumentValidator.js";

class GraphFixture {
  create() {
    return new SampleFactory().create();
  }

  load() {
    const model = new GraphModel();
    model.load(this.create(), "sample.json", true);
    return model;
  }
}

const fixture = new GraphFixture();
const validator = new DocumentValidator();

test("the sample and full export satisfy the shared schema", () => {
  const model = fixture.load();
  assert.equal(validator.validate(fixture.create()), true);
  assert.deepEqual(validator.parse(model.exportJson()), fixture.create());
});

test("invalid JSON and non-graph metadata are rejected", () => {
  assert.throws(() => validator.parse("{"), /not valid JSON/);
  for (const value of [null, [], {}, { tool: "w3bm@p", modules: ["dns"] }]) {
    assert.throws(() => validator.validate(value), /Invalid graph document/);
  }
});

test("the compiled validator matches the repository schema", async () => {
  const rootSchema = await readFile(
    new URL("../../shared/schema.json", import.meta.url),
    "utf8",
  );
  const builtSchema = await readFile(
    new URL("../vendor/schema.json", import.meta.url),
    "utf8",
  );
  assert.deepEqual(JSON.parse(rootSchema), JSON.parse(builtSchema));
});

test("unsupported versions, extra fields, invalid dates, and invalid confidence are rejected", () => {
  const mutations = [
    (data) => {
      data.schema_version = "2.0";
    },
    (data) => {
      data.extra = true;
    },
    (data) => {
      data.collected_at = "2026-02-30T12:00:00Z";
    },
    (data) => {
      data.nodes[0].confidence = 1.1;
    },
    (data) => {
      data.edges[0].confidence = -0.1;
    },
    (data) => {
      data.nodes[0].evidence = [];
    },
    (data) => {
      data.errors[0].message = 123;
    },
    (data) => {
      data.results.dns = [];
    },
    (data) => {
      data.nodes[0].source = "unknown";
    },
  ];
  for (const mutate of mutations) {
    const data = fixture.create();
    mutate(data);
    assert.throws(() => validator.validate(data), /Invalid graph document/);
  }
});

test("duplicate node IDs and dangling endpoints are rejected before rendering", () => {
  const duplicate = fixture.create();
  duplicate.nodes.push({ ...duplicate.nodes[0] });
  assert.throws(() => validator.validate(duplicate), /Duplicate entity ID/);
  const dangling = fixture.create();
  dangling.edges[0].target = "missing";
  assert.throws(
    () => validator.validate(dangling),
    /missing from this document/,
  );
});

test("import limits protect the graph workspace", () => {
  const oversized = fixture.create();
  oversized.nodes = new Array(DocumentValidator.MAX_NODES + 1).fill(
    oversized.nodes[0],
  );
  assert.throws(() => validator.validate(oversized), /5,000 entities/);
  assert.throws(
    () => validator.parse(" ".repeat(DocumentValidator.MAX_BYTES + 1)),
    /16 MiB/,
  );
});

test("type filtering never leaves dangling relationships", () => {
  const model = fixture.load();
  model.filters.types.delete("domain");
  const visible = model.visible();
  assert.equal(
    visible.nodes.some((node) => node.type === "domain"),
    false,
  );
  const ids = new Set(visible.nodes.map((node) => node.id));
  assert.equal(
    visible.edges.every((edge) => ids.has(edge.source) && ids.has(edge.target)),
    true,
  );
});

test("confidence and inferred filters apply to entities and relationships", () => {
  const model = fixture.load();
  model.filters.showInferred = false;
  assert.equal(
    model.visible().edges.some((edge) => edge.verification === "inferred"),
    false,
  );
  model.filters.minConfidence = 0.95;
  assert.equal(
    model.visible().nodes.some((node) => node.type === "technology"),
    false,
  );
  assert.equal(
    model.visible().edges.every((edge) => edge.confidence >= 0.95),
    true,
  );
});

test("search is literal and case-insensitive, including unusual characters", () => {
  const model = fixture.load();
  model.filters.query = " WORDPRESS ";
  assert.deepEqual(
    model.visible().nodes.map((node) => node.id),
    ["technology:wordpress"],
  );
  model.filters.query = "[.*";
  assert.equal(model.visible().nodes.length, 0);
});

test("source filtering, reset, and counts preserve the original document", () => {
  const model = fixture.load();
  const before = model.exportJson();
  model.filters.source = "probe";
  assert.equal(model.visible().nodes.length, 0);
  model.filters.types.clear();
  model.filters.query = "no match";
  model.filters.reset();
  assert.deepEqual([...model.filters.types], GraphFilters.TYPES);
  assert.equal(model.visible().nodes.length, fixture.create().nodes.length);
  assert.equal(model.counts.technology, 5);
  assert.equal(model.exportJson(), before);
});

test("load owns a copy; clear removes data and disables serialization", () => {
  const data = fixture.create();
  const model = new GraphModel();
  model.load(data, "original.json");
  data.target = "mutated";
  assert.equal(model.document.target, "example.com");
  model.clear();
  assert.equal(model.document, null);
  assert.deepEqual(model.visible(), { nodes: [], edges: [] });
  assert.throws(() => model.exportJson(), /Import a collection/);
});

test("hostile labels and IDs remain plain data without identifier collisions", () => {
  const data = fixture.create();
  data.nodes[0].label = "<img src=x onerror=alert(1)>";
  const previous = data.nodes[0].id;
  data.nodes[0].id = "e:0";
  data.edges.forEach((edge) => {
    if (edge.source === previous) edge.source = "e:0";
    if (edge.target === previous) edge.target = "e:0";
  });
  assert.equal(validator.validate(data), true);
  const model = new GraphModel();
  model.load(data, "hostile.json");
  assert.equal(model.document.nodes[0].label, "<img src=x onerror=alert(1)>");
});

test("a PHP-produced document is accepted without altering the shared contract", () => {
  const code =
    'require "../probe/w3bmap.php"; $graph = new W3bmap\\GraphDocument("example.com", "cli"); $graph->result("dns", ["records" => []]); echo (new W3bmap\\JsonView())->encode($graph->toArray());';
  const output = execFileSync(
    process.env.W3BMAP_PHP_BIN || "php",
    ["-r", code],
    { cwd: new URL("../", import.meta.url), encoding: "utf8" },
  );
  assert.equal(validator.parse(output).status, "complete");
});

test("recursive PHP collections preserve a valid graph and per-page traversal evidence", () => {
  const code = 'require "../tests/crawl.php"; [$graph] = (new W3bmap\\CrawlTests\\CrawlTests())->collect(["depth" => 2]); echo (new W3bmap\\JsonView())->encode($graph);';
  const data = validator.parse(execFileSync(process.env.W3BMAP_PHP_BIN || "php", ["-r", code], { cwd: new URL("../", import.meta.url), encoding: "utf8" }));
  assert.ok(data.results.crawl.pages.length > 1);
  assert.ok(data.edges.some((edge) => edge.source.startsWith("page:") && edge.type === "uses"));
  const model = new GraphModel();
  model.load(data, "recursive fixture");
  assert.equal(JSON.parse(model.exportJson()).results.crawl.visited_pages, data.results.crawl.visited_pages);
});
