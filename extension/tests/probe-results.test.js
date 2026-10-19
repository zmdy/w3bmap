import { test } from "node:test";
import assert from "node:assert/strict";
import { ProbeResultsModel } from "../src/models/ProbeResultsModel.js";
import { PopupController } from "../src/controllers/PopupController.js";
import { ProbeResultsView } from "../src/views/ProbeResultsView.js";

class ProbeFixture {
  document() {
    return { target: "example.com", collected_at: "2026-10-19T12:00:00Z", status: "partial",
      errors: [{ module: "sitemap", code: "invalid_xml", message: "Sitemap DTDs and entities are not supported." }],
      results: { browser: { page: "https://example.com/about", privateValue: "browser-only",
        connector: { modules: [{ module: "dns", status: "complete" }, { module: "sitemap", status: "failed", message: "Invalid XML" }] } },
      dns: { records: [{ type: "A", ip: "1.1.1.1" }] },
      rdap: { ldhName: "example.com", nameservers: [{ ldhName: "ns.example.com" }] },
      headers: { headers: { server: ["nginx"] } },
      technologies: { matches: [{ id: "wordpress", name: "WordPress" }] } } };
  }
}

class TextElement {
  constructor() { this.children = []; this.textContent = ""; }
  append(...children) { this.children.push(...children); }
  set innerHTML(value) { throw new Error("Connector output must never be parsed as HTML."); }
  text() { return this.textContent + this.children.map((child) => child.text()).join(" "); }
}

test("untrusted module values render as literal text and large previews are bounded", () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => new TextElement() };
  try {
    const view = new ProbeResultsView(null, null), root = new TextElement();
    const html = '<img src=x onerror="alert(1)">';
    view.data(root, { server: html }, { nodes: 180, characters: 12000, truncated: false });
    assert.ok(root.text().includes(html));
    const budget = { nodes: 180, characters: 12000, truncated: false }, large = new TextElement();
    view.data(large, Array.from({ length: 1000 }, () => ({ body: "x".repeat(5000) })), budget);
    assert.equal(budget.truncated, true);
    assert.ok(large.text().length < 14000);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});

test("PHP results include real saved module data, failure details, and no browser-only findings", () => {
  const document = new ProbeFixture().document();
  const before = JSON.stringify(document);
  const model = new ProbeResultsModel().load(document);
  assert.equal(model.target, "https://example.com/about");
  assert.equal(model.modules.find((entry) => entry.module === "dns").sources[0].data.records[0].ip, "1.1.1.1");
  assert.equal(model.modules.find((entry) => entry.module === "sitemap").status, "failed");
  assert.equal(model.modules.find((entry) => entry.module === "sitemap").message, "Invalid XML");
  assert.match(model.errors[0].message, /DTDs/);
  assert.ok(!JSON.stringify(model).includes("browser-only"));
  assert.equal(JSON.stringify(document), before);
});

test("recursive PHP results list host modules once and retain independent technology data for each page", () => {
  const document = new ProbeFixture().document();
  document.results.crawl = { visited_hosts: 2, visited_pages: 2, stop_reason: "complete",
    hosts: { "example.com": { dns: document.results.dns }, "outside.example.net": { dns: { records: [{ ip: "8.8.8.8" }] } } },
    pages: [
      { url: "https://example.com/", depth: 0, results: { dns: document.results.dns, technologies: { matches: [{ name: "WordPress" }] } } },
      { url: "https://outside.example.net/", depth: 1, results: { technologies: { matches: [{ name: "Nuxt" }] } } },
    ] };
  const model = new ProbeResultsModel().load(document);
  const dns = model.modules.find((entry) => entry.module === "dns");
  assert.deepEqual(dns.sources.map((source) => source.label), ["example.com", "outside.example.net"]);
  const technologies = model.modules.find((entry) => entry.module === "technologies");
  assert.deepEqual(technologies.sources.map((source) => source.data.matches[0].name), ["WordPress", "Nuxt"]);
  assert.equal(model.modules.find((entry) => entry.module === "crawl").sources[0].data.pages[1].depth, 1);
});

test("empty and browser-only collections have no fabricated PHP modules", () => {
  assert.deepEqual(new ProbeResultsModel().load(null).modules, []);
  assert.deepEqual(new ProbeResultsModel().load({ results: { browser: {} } }).modules, []);
});

test("popup loads saved details once per collection, clears them, and ignores stale asynchronous responses", async () => {
  const controller = Object.create(PopupController.prototype);
  const renders = [], requests = [];
  controller.view = { probes: { render: (value) => renders.push(value) }, get: () => ({ textContent: "" }) };
  controller.client = { send: async (action) => { requests.push(action); return { target: "first" }; } };
  await controller.refreshProbes("first");
  await controller.refreshProbes("first");
  assert.deepEqual(requests, ["collection"]);
  let resolve;
  controller.client.send = () => new Promise((done) => { resolve = done; });
  const pending = controller.refreshProbes("second");
  await controller.refreshProbes(null);
  resolve({ target: "stale" });
  await pending;
  assert.equal(renders.at(-1), null);
  assert.ok(!renders.some((value) => value?.target === "stale"));
});
