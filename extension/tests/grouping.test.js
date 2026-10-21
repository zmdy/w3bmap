import { test } from "node:test";
import assert from "node:assert/strict";
import { CollectionRepository } from "../src/services/CollectionRepository.js";
import { EntityClusterModel } from "../explorer/src/models/EntityClusterModel.js";

test("popup summaries retain all entity types for grouping without exposing arbitrary evidence", () => {
  const types = ["domain", "page", "ip", "technology", "certificate", "sitemap"];
  const document = { nodes: types.map((type) => ({ id: `${type}:fixture`, type, label: type,
    evidence: { category: "CMS", issuer: { O: "Fixture issuer" }, url: "https://example.com/", privateDetail: "omit" } })),
    edges: [], errors: [], results: {} };
  const summary = new CollectionRepository({}).summary({ id: "fixture", document });
  const model = new EntityClusterModel();
  model.load(summary.entities);
  assert.deepEqual(model.groups.map((group) => group.type).sort(), [...types].sort());
  assert.ok(!JSON.stringify(summary.entities).includes("privateDetail"));
  assert.equal(summary.entities.find((node) => node.type === "technology").evidence.category, "CMS");
});

test("the packaged grouping model collapses the supplied external domain families independently", () => {
  const model = new EntityClusterModel();
  const nodes = ["api.simet.nic.br", "ipv4-api.simet.nic.br", "ipv6-api.simet.nic.br", "fonts.gstatic.com", "www.gstatic.com"]
    .map((host) => ({ id: `domain:${host}`, label: host, type: "domain" }));
  model.load(nodes);
  // gstatic.com sits in Google's namespace, so its hosts group under that platform.
  assert.deepEqual(model.groups.map((group) => group.label), ["*.simet.nic.br", "Google"]);
  model.setOpen(model.groups[0].id, true);
  const projection = model.project({ nodes, edges: [] });
  assert.equal(projection.nodes.filter((node) => node.record).length, 3);
  assert.equal(model.isOpen(model.groups[1].id), false);
});
