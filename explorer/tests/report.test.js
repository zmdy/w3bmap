import { test } from "node:test";
import assert from "node:assert/strict";
import { EntityReportService } from "../src/services/EntityReportService.js";
import { ReportFormatter } from "../src/services/ReportFormatter.js";
import { CollectionStatsService } from "../src/services/CollectionStatsService.js";
import { EntityClusterModel } from "../src/models/EntityClusterModel.js";
import { TreeModel } from "../src/models/TreeModel.js";

const now = new Date("2026-10-21T09:30:00Z");
const service = new EntityReportService();
const formatter = new ReportFormatter();

class ReportFixture {
  constructor() {
    this.nodes = [
      { id: "domain:example.com", type: "domain", label: "example.com", confidence: 1, evidence: {} },
      { id: "domain:cdn.example.com", type: "domain", label: "cdn.example.com", confidence: 1, evidence: {} },
      { id: "page:https://example.com/docs/guide", type: "page", label: "/docs/guide", confidence: 1, evidence: {} },
      { id: "asset:https://cdn.example.com/app.js", type: "asset", label: "/app.js", confidence: 1, evidence: {} },
      { id: "technology:react", type: "technology", label: "React", confidence: 0.9, evidence: { category: "JavaScript frameworks" } },
    ];
    this.edges = [
      { source: "domain:example.com", target: "page:https://example.com/docs/guide", type: "contains", verification: "observed", index: 0 },
      { source: "page:https://example.com/docs/guide", target: "technology:react", type: "uses", verification: "inferred", index: 1 },
    ];
    this.document = { nodes: this.nodes, edges: this.edges, errors: [], results: { dns: {} } };
  }

  context(extra = {}) {
    return {
      target: "example.com",
      total: this.nodes.length,
      filtered: false,
      overview: new CollectionStatsService().overview(this.document),
      now,
      ...extra,
    };
  }

  groups() {
    const clusters = new EntityClusterModel();
    clusters.load(this.nodes);
    return service.fromGroups(clusters.visible(this.nodes), this.context());
  }

  tree() {
    const tree = new TreeModel();
    tree.build(this.nodes, "example.com");
    return service.fromTree(tree.roots, this.context());
  }
}

const fixture = new ReportFixture();

test("every format opens with the same executive summary and says what it covers", () => {
  const report = fixture.groups();
  for (const [format] of ReportFormatter.FORMATS) {
    const output = formatter.render(report, format);
    assert.ok(output.includes("example.com"), `${format} names the collection`);
    assert.ok(output.includes("2026-10-21T09:30:00Z"), `${format} dates the report`);
    assert.ok(/5\b/.test(output), `${format} states the entity count`);
    assert.ok(output.includes("in the complete collection"), `${format} states the scope`);
    assert.ok(output.endsWith("\n"), `${format} ends with a newline`);
  }
  const filtered = formatter.render(
    service.fromGroups([], fixture.context({ filtered: true, total: 0 })),
    "text",
  );
  assert.ok(filtered.includes("visible under the current filters"));
  assert.ok(filtered.includes("No entities match the current filters."));
});

test("the figures summarize the collection, not only the listed entities", () => {
  const report = fixture.groups();
  const figures = Object.fromEntries(report.figures);
  assert.equal(figures.Entities, 5);
  assert.equal(figures.Relationships, 2);
  assert.equal(figures.Hosts, 2);
  assert.equal(figures.Domains, 2);
  assert.equal(figures.Technologies, 1);
  assert.equal(figures["Inferred relationships"], 1);
  assert.equal(figures["Module results"], 1);
  assert.ok(!("Sitemaps" in figures), "types with no findings are left out");
});

test("the plain and Markdown lists carry the same sections in their own syntax", () => {
  const report = fixture.groups();
  const text = formatter.render(report, "text");
  const markdown = formatter.render(report, "markdown");
  assert.ok(text.includes("Domains *.example.com (2)"));
  assert.ok(text.includes("- cdn.example.com"));
  assert.ok(markdown.startsWith("# Site report · example.com"));
  assert.ok(markdown.includes("## Domains · *.example.com (2)"));
  assert.ok(markdown.includes("- **Entities:** 5"));
  assert.ok(markdown.includes("- cdn.example.com"));
});

test("the Markdown table keeps one row per group and never breaks its columns", () => {
  const report = service.fromGroups(
    [
      { type: "domain", label: "a|b.example.com", members: [{ id: "domain:x", label: "pipe|host" }] },
    ],
    fixture.context(),
  );
  const table = formatter.render(report, "table");
  assert.ok(table.includes("| Figure | Count |"));
  assert.ok(table.includes("| Type | Group | Items | Findings |"));
  const row = table.split("\n").find((line) => line.includes("pipe"));
  // Only unescaped pipes delimit a Markdown cell.
  assert.equal(row.match(/(?<!\\)\|/g).length, 5, "an escaped pipe does not add a column");
  assert.ok(row.includes("a\\|b.example.com") && row.includes("pipe\\|host"));
});

test("Mermaid output is a bounded flowchart with labels that cannot break it", () => {
  const report = service.fromGroups(
    [
      { type: "page", label: 'quote"and[bracket]', members: [{ id: "page:x", label: "a\nb" }] },
    ],
    fixture.context(),
  );
  const diagram = formatter.render(report, "mermaid");
  assert.ok(diagram.startsWith("%% w3bm@p · example.com"));
  assert.ok(diagram.includes("flowchart LR"));
  assert.ok(!/[[][^\]"]*"[^\]]*"[^\]]*"/.test(diagram), "labels stay quoted once");
  assert.ok(diagram.includes("quote'and bracket"), "quotes and brackets are replaced");
  assert.ok(diagram.includes('["a b"]'), "newlines never split a node");

  const many = service.fromGroups(
    Array.from({ length: 40 }, (_, group) => ({
      type: "page",
      label: `group-${group}`,
      members: Array.from({ length: 10 }, (_, item) => ({ id: `page:${group}-${item}`, label: `p${group}-${item}` })),
    })),
    fixture.context({ total: 400 }),
  );
  const bounded = formatter.render(many, "mermaid");
  const nodes = bounded.split("\n").filter((line) => /^\s{2}\w+\[/.test(line));
  assert.ok(nodes.length <= ReportFormatter.MERMAID_NODES + 2, `drew ${nodes.length} nodes`);
  assert.ok(bounded.includes("more not drawn"));
});

test("a Tree view report keeps the folder hierarchy in every format", () => {
  const report = fixture.tree();
  assert.equal(report.shape, "tree");
  const text = formatter.render(report, "text");
  assert.ok(text.includes("example.com/ ("));
  assert.ok(text.includes("  docs/ (1)"));
  assert.ok(text.includes("    - https://example.com/docs/guide"));
  const markdown = formatter.render(report, "markdown");
  assert.ok(markdown.includes("## Folders"));
  assert.ok(markdown.includes("- **docs/** (1)"));
  const table = formatter.render(report, "table");
  assert.ok(table.includes("| Folder | Items | Depth |"));
  const docs = table.split("\n").find((line) => line.includes("docs/"));
  assert.match(docs, /^\| (— )*docs\/ \| 1 \| \d \|$/);
  assert.ok(formatter.render(report, "mermaid").includes("flowchart LR"));
});

test("long groups are trimmed with an explicit count and an unknown format is refused", () => {
  const members = Array.from({ length: 80 }, (_, index) => ({ id: `page:${index}`, label: `page-${index}` }));
  const report = service.fromGroups([{ type: "page", label: "big.example.com", members }], fixture.context({ total: 80 }));
  assert.equal(report.sections[0].items.length, EntityReportService.MAX_ITEMS);
  assert.equal(report.sections[0].hidden, 80 - EntityReportService.MAX_ITEMS);
  assert.ok(formatter.render(report, "text").includes("… 30 more"));
  assert.ok(formatter.render(report, "markdown").includes("_30 more not listed_"));
  assert.ok(formatter.render(report, "table").includes("… 30 more"));
  assert.throws(() => formatter.render(report, "csv"), /Unknown report format/);
  assert.deepEqual(
    ReportFormatter.FORMATS.map(([value]) => value),
    ["text", "markdown", "table", "mermaid"],
  );
  assert.equal(formatter.extension("mermaid"), "mmd");
  assert.equal(formatter.extension("text"), "txt");
  assert.equal(formatter.extension("table"), "md");
});
