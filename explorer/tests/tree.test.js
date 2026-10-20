import { test } from "node:test";
import assert from "node:assert/strict";
import { SiteTreeBuilder } from "../src/services/SiteTreeBuilder.js";
import { CollectionStatsService } from "../src/services/CollectionStatsService.js";
import { TreeModel } from "../src/models/TreeModel.js";
import { GraphModel } from "../src/models/GraphModel.js";
import { SampleFactory } from "../src/models/SampleFactory.js";

class TreeFixture {
  constructor() {
    this.nodes = [
      { id: "domain:example.com", type: "domain", label: "example.com", source: "cli", collected_at: "2026-10-16T12:00:00Z", confidence: 1 },
      { id: "domain:api.example.com", type: "domain", label: "api.example.com", source: "cli", collected_at: "2026-10-16T12:00:00Z", confidence: 1 },
      { id: "page:https://example.com/", type: "page", label: "/", source: "cli", collected_at: "2026-10-16T12:00:00Z", confidence: 1 },
      { id: "page:https://example.com/support/contact", type: "page", label: "/support/contact", source: "cli", collected_at: "2026-10-17T12:00:00Z", confidence: 1 },
      { id: "page:https://api.example.com/support/contact", type: "page", label: "/support/contact", source: "probe", collected_at: "2026-10-18T12:00:00Z", confidence: 1 },
      { id: "page:https://example.com/support", type: "page", label: "/support", source: "cli", collected_at: "2026-10-16T12:00:00Z", confidence: 1 },
      { id: "technology:react", type: "technology", label: "React", source: "extension", collected_at: "2026-10-16T12:00:00Z", confidence: 0.9 },
      { id: "ip:198.51.100.20", type: "ip", label: "198.51.100.20", source: "cli", collected_at: "2026-10-16T12:00:00Z", confidence: 1 },
    ];
    this.edges = [
      { source: "page:https://example.com/", target: "page:https://example.com/support", type: "links_to", verification: "observed", index: 0 },
      { source: "page:https://example.com/support/contact", target: "technology:react", type: "uses", verification: "inferred", index: 1 },
      { source: "domain:example.com", target: "ip:198.51.100.20", type: "resolves_to", verification: "observed", index: 2 },
    ];
  }

  roots() {
    return new SiteTreeBuilder().build(this.nodes, "example.com");
  }
}

test("the site tree nests pages by URL path and keeps every host visible on the leaves", () => {
  const [site] = new TreeFixture().roots();
  assert.equal(site.label, "example.com");
  assert.equal(site.count, 4);
  const support = site.folders.find((folder) => folder.label === "support");
  assert.ok(support, "the shared path segment becomes a folder");
  assert.equal(support.count, 3);
  assert.deepEqual(
    support.entities.map((entity) => entity.url),
    ["https://example.com/support"],
  );
  const contact = support.folders.find((folder) => folder.label === "contact");
  assert.deepEqual(contact.entities.map((entity) => entity.url), [
    "https://api.example.com/support/contact",
    "https://example.com/support/contact",
  ]);
  assert.deepEqual(contact.hosts, ["api.example.com", "example.com"]);
  assert.deepEqual(site.entities.map((entity) => entity.url), [
    "https://example.com/",
  ]);
});

test("entities without a URL path are grouped into their own category folders", () => {
  const roots = new TreeFixture().roots();
  const labels = roots.map((folder) => folder.label);
  assert.deepEqual(labels, [
    "example.com",
    "Technologies",
    "Subdomains",
    "IP addresses",
  ]);
  // The collection target is already the tree root and is not repeated.
  assert.deepEqual(
    roots.find((folder) => folder.label === "Subdomains").entities.map((entity) => entity.label),
    ["api.example.com"],
  );
  assert.equal(roots.find((folder) => folder.label === "Technologies").count, 1);
});

test("the tree is deterministic and never writes back into the collection", () => {
  const fixture = new TreeFixture();
  const snapshot = JSON.stringify(fixture.nodes);
  const first = JSON.stringify(fixture.roots().map((folder) => folder.id));
  fixture.nodes.reverse();
  assert.equal(JSON.stringify(fixture.roots().map((folder) => folder.id)), first);
  fixture.nodes.reverse();
  assert.equal(JSON.stringify(fixture.nodes), snapshot);
});

test("hostile labels and unparsable page identifiers do not break the tree", () => {
  const roots = new SiteTreeBuilder().build(
    [
      { id: "page:not-a-url", type: "page", label: "../../etc/passwd" },
      { id: "page:https://example.com/%E2%9C%93/ok", type: "page", label: "/ok" },
    ],
    "example.com",
  );
  const [site] = roots;
  assert.equal(site.count, 2);
  assert.ok(site.entities.some((entity) => entity.url === null));
  assert.ok(site.folders.some((folder) => folder.label === "✓"));
});

test("folder expansion is kept outside the export and bounds very large folders", () => {
  const nodes = Array.from({ length: 40 }, (_, index) => ({
    id: `page:https://example.com/docs/page-${String(index).padStart(2, "0")}`,
    type: "page",
    label: `/docs/page-${index}`,
  }));
  const model = new TreeModel();
  model.build(nodes, "example.com");
  const docs = model.find("tree:site/docs");
  assert.equal(docs.count, 40);
  assert.equal(model.children(docs).items.length, TreeModel.CHILD_LIMIT);
  assert.equal(model.children(docs).hidden, 40 - TreeModel.CHILD_LIMIT);
  model.reveal(docs.id);
  assert.equal(model.children(docs).items.length, 40);
  assert.equal(model.isOpen("tree:site"), true, "the site root opens by default");
  assert.equal(model.isOpen(docs.id), false);
  model.setAll(true);
  assert.equal(model.isOpen(docs.id), true);
  assert.ok(!JSON.stringify(nodes).includes("expanded"));
});

test("selecting an entity opens every folder on its path", () => {
  const fixture = new TreeFixture();
  const model = new TreeModel();
  model.build(fixture.nodes, "example.com");
  assert.equal(model.isOpen("tree:site/support/contact"), false);
  const folder = model.revealNode("page:https://api.example.com/support/contact");
  assert.equal(folder, "tree:site/support/contact");
  for (const id of ["tree:site", "tree:site/support", "tree:site/support/contact"])
    assert.equal(model.isOpen(id), true, `${id} should be open`);
  assert.equal(model.revealNode("page:https://example.com/missing"), null);
});

test("collection figures count entities, relationships, links, and hosts", () => {
  const fixture = new TreeFixture();
  const stats = new CollectionStatsService();
  const overview = stats.overview({
    nodes: fixture.nodes,
    edges: fixture.edges,
    errors: [],
    results: { dns: {}, headers: {} },
  });
  assert.equal(overview.entities, 8);
  assert.equal(overview.relationships, 3);
  assert.equal(overview.types.page, 4);
  assert.equal(overview.types.technology, 1);
  assert.equal(overview.links, 1);
  assert.equal(overview.inferred, 1);
  assert.equal(overview.hosts, 2);
  assert.equal(overview.modules, 2);
  assert.equal(overview.filtered, false);
  assert.equal(stats.overview(null), null);
});

test("filtered figures report the visible subset instead of the stored collection", () => {
  const model = new GraphModel();
  model.load(new SampleFactory().create(), "sample");
  const stats = new CollectionStatsService();
  model.filters.types.delete("technology");
  const overview = stats.overview(model.document, model.visible());
  assert.equal(overview.types.technology, 0);
  assert.equal(overview.filtered, true);
  assert.ok(overview.entities < model.document.nodes.length);
  assert.equal(
    stats.overview(model.document).types.technology,
    model.document.nodes.filter((node) => node.type === "technology").length,
  );
});

test("entity and folder figures summarize their own neighbourhood", () => {
  const fixture = new TreeFixture();
  const document = { nodes: fixture.nodes, edges: fixture.edges, errors: [], results: {} };
  const stats = new CollectionStatsService();
  const entity = stats.forNode(document, fixture.nodes[0]);
  assert.equal(entity.relationships, 1);
  assert.equal(entity.types.ip, 1);
  const [site] = new SiteTreeBuilder().build(fixture.nodes, "example.com");
  const support = site.folders.find((folder) => folder.label === "support");
  const folder = stats.forFolder(document, support);
  assert.equal(folder.items, 3);
  assert.equal(folder.folders, 1);
  assert.equal(folder.hosts, 2);
  assert.deepEqual(support.hosts, ["api.example.com", "example.com"]);
  assert.deepEqual(folder.technologies, ["technology:react"]);
  assert.deepEqual(folder.sources, ["cli", "probe"]);
  assert.equal(folder.first, "2026-10-16T12:00:00Z");
  assert.equal(folder.last, "2026-10-18T12:00:00Z");
});

test("assets share the page tree by path and remain a separate entity type", () => {
  const nodes = [
    { id: "page:https://example.com/docs/guide", type: "page", label: "/docs/guide" },
    { id: "asset:https://example.com/docs/guide.pdf", type: "asset", label: "/docs/guide.pdf" },
    { id: "asset:https://cdn.example.com/js/app.js", type: "asset", label: "/js/app.js" },
    { id: "technology:react", type: "technology", label: "React" },
  ];
  const [site] = new SiteTreeBuilder().build(nodes, "example.com");
  const docs = site.folders.find((folder) => folder.label === "docs");
  // A final segment with an extension names a file and stays in its parent folder.
  assert.deepEqual(
    docs.children.map((child) => `${child.kind}:${child.label}`),
    ["folder:guide", "entity:/docs/guide.pdf"],
  );
  assert.equal(site.count, 3, "assets are counted in the site tree");
  const stats = new CollectionStatsService();
  const overview = stats.overview({ nodes, edges: [], errors: [], results: {} });
  assert.equal(overview.types.asset, 2);
  assert.equal(overview.types.page, 1);
  assert.equal(overview.hosts, 2);
  assert.ok("Assets" in Object.values(CollectionStatsService.TYPE_LABELS).reduce(
    (all, label) => ({ ...all, [label]: true }), {}));
});
