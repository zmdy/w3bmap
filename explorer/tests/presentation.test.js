import { test } from "node:test";
import assert from "node:assert/strict";
import cytoscape from "../vendor/cytoscape.js";
import { GraphView } from "../src/views/GraphView.js";
import { CategoryLayoutService } from "../src/services/CategoryLayoutService.js";
import { EntityClusterModel } from "../src/models/EntityClusterModel.js";

class PresentationFixture {
  constructor() {
    this.nodes = [
      { id: "domain:example.com", type: "domain", label: "example.com" },
      { id: "page:https://example.com/", type: "page", label: "/" },
      { id: "page:https://example.com/about", type: "page", label: "/about" },
      { id: "technology:react", type: "technology", label: "React" },
      { id: "technology:wordpress", type: "technology", label: "WordPress" },
      { id: "ip:1.1.1.1", type: "ip", label: "1.1.1.1" },
      { id: "certificate:example.com", type: "certificate", label: "TLS" },
      { id: "sitemap:example.com", type: "sitemap", label: "Sitemap" },
    ];
    this.edges = [
      { source: this.nodes[0].id, target: this.nodes[1].id, type: "contains", index: 0 },
      { source: this.nodes[1].id, target: this.nodes[3].id, type: "uses", index: 1 },
      { source: this.nodes[2].id, target: this.nodes[4].id, type: "uses", index: 2 },
    ];
  }

  view(expand = true) {
    const view = Object.create(GraphView.prototype);
    view.cy = cytoscape({ headless: true });
    view.clusters = new EntityClusterModel();
    view.clusters.load(this.nodes);
    view.clusters.setAll(expand);
    view.records = new Map();
    view.categoryLayout = new CategoryLayoutService();
    view.layoutName = "categories";
    view.load({ nodes: this.nodes, edges: this.edges, target: "example.com" });
    view.filter({ nodes: this.nodes, edges: this.edges });
    return view;
  }
}

test("category positions separate types, center the target, and remain deterministic", () => {
  const fixture = new PresentationFixture();
  const nodes = fixture.nodes.map((node) => ({ ...node, id: `n:${node.id}` }));
  const layout = new CategoryLayoutService();
  const positions = layout.positions(nodes, "n:domain:example.com");
  assert.deepEqual(positions.get("n:domain:example.com"), { x: 0, y: 0 });
  assert.deepEqual(layout.positions([...nodes].reverse(), "n:domain:example.com"), positions);
  for (const node of nodes) {
    const position = positions.get(node.id);
    assert.ok(Number.isFinite(position.x) && Number.isFinite(position.y));
    if (node.type === "technology") assert.ok(position.x < 0 && position.y < 0);
    if (node.type === "page") assert.ok(position.x > 0 && position.y < 0);
    if (node.type === "ip") assert.ok(position.x < 0 && position.y > 0);
  }
});

test("category layout handles collapsed and expanded groups without moving records into exports", () => {
  const fixture = new PresentationFixture();
  const before = JSON.stringify(fixture);
  for (const expanded of [false, true]) {
    const view = fixture.view(expanded);
    const leaves = view.cy.nodes().filter((node) => !node.isParent());
    for (const node of leaves) assert.ok(Number.isFinite(node.position("x")) && Number.isFinite(node.position("y")));
    assert.deepEqual(view.cy.getElementById("n:domain:example.com").position(), { x: 0, y: 0 });
    const points = leaves.map((node) => `${node.position("x")},${node.position("y")}`);
    assert.equal(new Set(points).size, points.length, "Visible leaves overlap");
    view.cy.destroy();
  }
  assert.equal(JSON.stringify(fixture), before);
  assert.equal(new CategoryLayoutService().positions([], "missing").size, 0);
});

test("node focus highlights direct relationships, preserves parent outlines, and mutes unrelated siblings", () => {
  const fixture = new PresentationFixture(), view = fixture.view();
  view.select("node", fixture.nodes[1]);
  for (const id of ["n:domain:example.com", "n:technology:react", "e:0", "e:1"])
    assert.ok(view.cy.getElementById(id).hasClass("related"), id);
  assert.ok(view.cy.getElementById("n:technology:wordpress").hasClass("muted"));
  assert.ok(view.cy.getElementById("n:page:https://example.com/about").hasClass("muted"));
  assert.ok(view.cy.getElementById("n:technology:react").parent().hasClass("related"));
  view.clearSelection();
  assert.equal(view.cy.$(".muted, .related, :selected").length, 0);
  view.cy.destroy();
});

test("edge and collapsed aggregate focus highlight endpoints without flooding the connected graph", () => {
  const fixture = new PresentationFixture(), view = fixture.view();
  view.select("edge", fixture.edges[1]);
  assert.ok(view.cy.getElementById("e:1").hasClass("related"));
  assert.ok(view.cy.getElementById("n:technology:react").hasClass("related"));
  assert.ok(view.cy.getElementById("n:domain:example.com").hasClass("muted"));
  view.cy.destroy();
  const collapsed = fixture.view(false);
  const edge = collapsed.cy.edges().filter((item) => item.data("aggregate")).first();
  collapsed.focusAggregate(edge.data());
  assert.ok(edge.hasClass("related"));
  assert.ok(edge.source().hasClass("related") && edge.target().hasClass("related"));
  const group = collapsed.cy.nodes().filter((node) => node.data("clusterId")).first();
  collapsed.focusGroup(group.data("clusterId"));
  assert.ok(group.hasClass("related"));
  collapsed.cy.destroy();
});

test("node size reflects visible degree within bounds and labels fade when zoomed out", () => {
  assert.equal(GraphView.size(0), 34);
  assert.ok(GraphView.size(1) > GraphView.size(0));
  assert.ok(GraphView.size(12) > GraphView.size(3));
  // The scale is bounded so a hub never swallows the canvas.
  assert.equal(GraphView.size(400), 66);
  assert.equal(GraphView.size(10000), 66);
  for (const degree of [0, 1, 5, 50, 500])
    assert.ok(Number.isInteger(GraphView.size(degree)));
  assert.ok(GraphView.LABEL_ZOOM > 0 && GraphView.LABEL_ZOOM < 1);
});

test("returning to the graph refits the viewport after the container was hidden", () => {
  const fixture = new PresentationFixture();
  const view = fixture.view();
  let fitted = 0;
  view.fit = () => {
    fitted++;
  };
  view.resize();
  assert.equal(fitted, 1, "a populated graph is refitted");
  view.cy.elements().remove();
  view.resize();
  assert.equal(fitted, 1, "an empty graph is left alone");
});
