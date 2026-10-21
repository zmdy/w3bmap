import { test } from "node:test";
import assert from "node:assert/strict";
import { EntityGroupingService } from "../src/services/EntityGroupingService.js";
import { EntityClusterModel } from "../src/models/EntityClusterModel.js";
import { GraphModel } from "../src/models/GraphModel.js";
import { SampleFactory } from "../src/models/SampleFactory.js";

class GroupingFixture {
  node(type, label, evidence = {}) { return { id: `${type}:${label}`, type, label, evidence }; }
  domains() {
    return ["api.simet.nic.br", "ipv4-api.simet.nic.br", "ipv6-api.simet.nic.br",
      "ipv4.sp-ix-p1.sp-ix.peers.simet.nic.br", "ipv4.sp-p1.sp.peers.simet.nic.br",
      "fonts.gstatic.com", "www\\.gstatic.com"].map((host) => this.node("domain", host));
  }
}
const fixture = new GroupingFixture();
const grouping = new EntityGroupingService();

test("shared suffix groups match the supplied NIC example and deduplicate records", () => {
  const nodes = fixture.domains();
  const groups = grouping.groups([...nodes, nodes[1]]);
  // gstatic.com is a Google namespace, so its hosts join that platform group.
  assert.deepEqual(groups.map((group) => [group.label, group.members.length]), [["*.simet.nic.br", 5], ["Google", 2]]);
  assert.equal(groups.flatMap((group) => group.members).length, nodes.length);
});

test("hosts inside a platform namespace group together across its many domains", () => {
  const hosts = ["ad.doubleclick.net", "stats.g.doubleclick.net", "ajax.googleapis.com",
    "fonts.gstatic.com", "unidas-livre-cms-files-prd.s3.sa-east-1.amazonaws.com",
    "novaunidasprdrac.blob.core.windows.net", "unidashmlrac.blob.core.windows.net",
    "www.facebook.com", "snap.licdn.com", "cdnjs.cloudflare.com", "www.unidas.com.br"];
  const groups = grouping.groups(hosts.map((host) => fixture.node("domain", host)));
  const byLabel = Object.fromEntries(groups.map((group) => [group.label, group.members.length]));
  assert.equal(byLabel.Google, 4);
  assert.equal(byLabel["Amazon Web Services"], 1);
  assert.equal(byLabel.Microsoft, 2);
  assert.equal(byLabel.Meta, 1);
  assert.equal(byLabel.LinkedIn, 1);
  assert.equal(byLabel.Cloudflare, 1);
  // A site that is not a known platform keeps its own suffix group.
  assert.equal(byLabel["www.unidas.com.br"], 1);
  assert.equal(groups.flatMap((group) => group.members).length, hosts.length);
});

test("platform grouping also covers pages and assets served from those hosts", () => {
  const nodes = [
    { id: "asset:https://ajax.googleapis.com/jquery.js", type: "asset", label: "/jquery.js", evidence: {} },
    { id: "asset:https://fonts.gstatic.com/font.woff2", type: "asset", label: "/font.woff2", evidence: {} },
    { id: "asset:https://cdn.example.com/app.js", type: "asset", label: "/app.js", evidence: {} },
  ];
  const groups = grouping.groups(nodes);
  assert.deepEqual(
    groups.map((group) => [group.label, group.members.length]).sort(),
    [["Google", 2], ["cdn.example.com", 1]],
  );
});

test("public and private suffix boundaries keep unrelated tenants and registrants separate", () => {
  const hosts = ["a.first.com.br", "b.second.com.br", "a.alice.github.io", "b.bob.github.io",
    "alice.github.io", "example.com", "www.example.com", "evil-example.com", "example.com.evil.net"];
  const groups = grouping.groups(hosts.map((host) => fixture.node("domain", host)));
  assert.equal(groups.length, 7);
  assert.deepEqual(groups.find((group) => group.label === "*.example.com").members.map((node) => node.label), ["example.com", "www.example.com"]);
  assert.equal(groups.find((group) => group.label === "*.alice.github.io").members.length, 2);
  assert.ok(!groups.some((group) => ["*.com.br", "*.github.io", "*.com"].includes(group.label)));
});

test("pages, technologies, IPv4, IPv6, certificates and sitemaps have independent groups", () => {
  const nodes = [fixture.node("page", "https://one.example/about"), fixture.node("page", "https://two.example/about"),
    fixture.node("technology", "React", { category: "JavaScript framework" }),
    fixture.node("technology", "Vue", { category: "JavaScript framework" }), fixture.node("technology", "nginx"),
    fixture.node("ip", "192.0.2.1"), fixture.node("ip", "192.0.2.254"), fixture.node("ip", "192.0.3.1"),
    fixture.node("ip", "2001:db8:abcd::1"), fixture.node("ip", "2001:0db8:abcd:1::2"), fixture.node("ip", "2001:db8:abce::1"),
    fixture.node("certificate", "First", { issuer: { O: "Issuer" } }), fixture.node("certificate", "Second", { issuer: { O: "Issuer" } }),
    fixture.node("sitemap", "https://one.example/sitemap.xml")];
  const groups = grouping.groups(nodes);
  for (const label of ["JavaScript framework", "192.0.2.0/24", "2001:db8:abcd::/48", "Issuer"])
    assert.equal(groups.find((group) => group.label === label).members.length, 2);
  assert.equal(groups.filter((group) => group.type === "page").length, 2);
  assert.equal(groups.flatMap((group) => group.members).length, nodes.length);
  assert.equal(grouping.ipPrefix("invalid"), "Other IP addresses");
  assert.equal(grouping.hostname("https://user:password@example.com/"), null);
});

test("collapse summarizes only visible directed relationships and expansion restores original indexes", () => {
  const nodes = fixture.domains();
  const edges = [
    { source: nodes[0].id, target: nodes[5].id, type: "references", verification: "observed", index: 0 },
    { source: nodes[1].id, target: nodes[6].id, type: "references", verification: "observed", index: 1 },
    { source: nodes[5].id, target: nodes[0].id, type: "references", verification: "inferred", index: 2 },
    { source: nodes[0].id, target: nodes[1].id, type: "references", verification: "observed", index: 3 },
  ];
  const before = JSON.stringify({ nodes, edges });
  const model = new EntityClusterModel();
  model.load(nodes);
  const collapsed = model.project({ nodes, edges });
  assert.equal(collapsed.nodes.length, 2);
  assert.deepEqual(collapsed.edges.map((edge) => edge.indexes), [[0, 1], [2]]);
  model.setAll(true);
  const expanded = model.project({ nodes, edges });
  assert.equal(expanded.nodes.filter((node) => node.record).length, nodes.length);
  assert.deepEqual(expanded.edges.map((edge) => edge.index), [0, 1, 2, 3]);
  assert.equal(JSON.stringify({ nodes, edges }), before);
});

test("filtering preserves group labels and state, excludes hidden nodes, and never produces dangling edges", () => {
  const nodes = fixture.domains(), model = new EntityClusterModel();
  model.load(nodes);
  model.expandNode(nodes[0].id);
  const group = model.groups.find((item) => item.members.some((node) => node.id === nodes[0].id));
  const visible = model.visible([nodes[0]]);
  assert.equal(visible[0].label, group.label);
  assert.ok(model.isOpen(visible[0].id));
  const projection = model.project({ nodes: [nodes[0]], edges: [{ source: nodes[0].id, target: nodes[5].id, index: 0, type: "references" }] });
  assert.equal(projection.edges.length, 0);
  assert.equal(projection.nodes.filter((node) => node.record).length, 1);
  model.load([]);
  assert.equal(model.groups.length, 0);
  assert.equal(model.expanded.size, 0);
});

test("expansion and clustering do not enter exported collections", () => {
  const graph = new GraphModel();
  graph.load(new SampleFactory().create(), "sample");
  const before = graph.exportJson(), clusters = new EntityClusterModel();
  clusters.load(graph.document.nodes);
  clusters.setAll(true);
  clusters.project(graph.visible());
  clusters.setAll(false);
  clusters.project(graph.visible());
  assert.equal(graph.exportJson(), before);
});

test("merging sites buckets pages and assets by site without touching the records", () => {
  const nodes = [
    { id: "asset:https://assets.example.com/a.js", type: "asset", label: "/a.js", evidence: {} },
    { id: "asset:https://cdn.example.com/b.js", type: "asset", label: "/b.js", evidence: {} },
    { id: "page:https://www.example.com/", type: "page", label: "/", evidence: {} },
    { id: "asset:https://ajax.googleapis.com/c.js", type: "asset", label: "/c.js", evidence: {} },
  ];
  const snapshot = JSON.stringify(nodes);
  const clusters = new EntityClusterModel();
  clusters.load(nodes);
  assert.deepEqual(
    clusters.groups.filter((group) => group.type === "asset").map((group) => group.label).sort(),
    ["Google", "assets.example.com", "cdn.example.com"],
  );
  clusters.setByHost(false);
  assert.deepEqual(
    clusters.groups.filter((group) => group.type === "asset").map((group) => group.label).sort(),
    ["Google", "example.com"],
  );
  assert.equal(clusters.groups.find((group) => group.label === "example.com").members.length, 2);
  clusters.setByHost(true);
  assert.equal(clusters.groups.filter((group) => group.type === "asset").length, 3);
  assert.equal(JSON.stringify(nodes), snapshot, "grouping never rewrites the collection");
});
