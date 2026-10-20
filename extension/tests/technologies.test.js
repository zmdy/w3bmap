import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { FingerprintService } from "../src/services/FingerprintService.js";
import { PageCollector } from "../src/services/PageCollector.js";
import { AnalysisService } from "../src/services/AnalysisService.js";
import { GraphBuilder } from "../src/models/GraphBuilder.js";
import { CollectionRepository } from "../src/services/CollectionRepository.js";
import { BackgroundController } from "../src/controllers/BackgroundController.js";
import { DocumentValidator } from "../explorer/src/services/DocumentValidator.js";

const catalog = JSON.parse(await readFile(new URL("../../shared/fingerprints.json", import.meta.url), "utf8"));

class DetectionFixture {
  snapshot(extra = {}) {
    return { url: "https://example.com/", title: "Fixture", collected_at: new Date().toISOString(),
      links: [], resources: [], hints: [], generators: [], ...extra };
  }

  detect(extra) { return new FingerprintService(catalog).detect(this.snapshot(extra)); }

  runtime(window, plan, document) {
    return vm.runInNewContext(`(${PageCollector.collectRuntime.toString()})(plan)`, {
      window, plan, document, location: { origin: "https://example.com", pathname: "/" },
    });
  }

  analysis({ blockRuntime = false, navigate = false } = {}) {
    this.calls = [];
    this.saved = 0;
    this.badges = [];
    const api = {
      tabs: { query: async () => [{ id: 3, url: "https://example.com/" }],
        get: async () => ({ url: navigate ? "https://other.example/" : "https://example.com/" }) },
      action: { setBadgeText: async (value) => this.badges.push(value), setBadgeBackgroundColor: async () => {} },
      scripting: { executeScript: async (options) => {
        this.calls.push(options);
        if (options.world === "MAIN") {
          if (blockRuntime) throw new Error("Runtime blocked");
          return [{ frameId: 0, result: { url: "https://example.com/", signals: { "React.version": "19.1.0" } } }];
        }
        return [{ frameId: 0, result: this.snapshot({ resources: [{ url: "https://example.com/_next/static/app.js", kind: "script" }] }) }];
      } },
    };
    const unavailable = { load: async () => { throw new Error("Quick detection must not read connector settings"); } };
    return new AnalysisService(api, unavailable, {}, { save: async () => { this.saved++; } }, new DocumentValidator(), catalog);
  }
}

const fixture = new DetectionFixture();

test("the independent catalog has unique IDs, safe metadata, valid patterns, and bounded collection plans", () => {
  assert.equal(catalog.license, "MIT");
  assert.equal(catalog.technologies.length, 94);
  assert.equal(new Set(catalog.technologies.map((item) => item.id)).size, 94);
  const known = new Set(catalog.technologies.map((item) => item.id));
  for (const technology of catalog.technologies) {
    assert.match(technology.website, /^https:\/\//);
    assert.ok(technology.category);
    assert.ok(technology.confidence > 0 && technology.confidence < 1);
    for (const id of technology.implies ?? []) assert.ok(known.has(id));
    for (const pattern of technology.patterns) {
      if (pattern.regex) assert.doesNotThrow(() => new RegExp(pattern.regex, "i"));
      if (pattern.attribute) assert.equal(pattern.attribute, "ng-version");
      if (pattern.key) assert.ok(!["cookie", "value", "password", "token"].includes(pattern.key));
    }
  }
  const plan = PageCollector.plan(catalog);
  assert.ok(plan.js.length <= 100 && plan.dom.length <= 150 && plan.meta.length <= 40);
});

test("versions prefer runtime evidence while retaining independent generator and resource signals", () => {
  const matches = fixture.detect({ generators: ["WordPress 6.7.1"],
    resources: [{ url: "https://cdn.example/jquery-3.6.0.min.js", kind: "script" }],
    js: { "jQuery.fn.jquery": "3.7.1" } });
  assert.equal(matches.find((item) => item.id === "wordpress").version, "6.7.1");
  const jquery = matches.find((item) => item.id === "jquery");
  assert.equal(jquery.version, "3.7.1");
  assert.equal(jquery.evidence.indicators.length, 2);
  assert.ok(jquery.confidence < 1);
});

test("an Angular DOM attribute supplies its version without reading form values or page text", () => {
  const plan = PageCollector.plan(catalog);
  const document = { baseURI: "https://example.com/", title: "Fixture",
    querySelectorAll: () => [],
    querySelector: (selector) => selector === "[ng-version]" ? { getAttribute: () => "19.2.4" } : null,
    get body() { throw new Error("Do not read text"); }, get cookie() { throw new Error("Do not read cookies"); } };
  const snapshot = vm.runInNewContext(`(${PageCollector.collectPage.toString()})(plan)`, {
    plan, document, URL, Date, location: { href: "https://example.com/?secret=value" }, performance: { getEntriesByType: () => [] },
  });
  assert.equal(new FingerprintService(catalog).detect(snapshot).find((item) => item.id === "angular").version, "19.2.4");
  assert.ok(!JSON.stringify(snapshot).includes("secret"));
});

test("the serialized runtime collector skips getters, inherited properties, secret strings, and unsafe paths", () => {
  const window = Object.create({ inherited: { version: "2.0.0" } });
  window.React = { version: "19.1.0", credential: "private-secret-value" };
  Object.defineProperty(window, "throwing", { get() { throw new Error("Getter was invoked"); } });
  const result = fixture.runtime(window, [
    { path: "React.version", version: true }, { path: "React.credential", version: true },
    { path: "React.credential", version: false }, { path: "inherited.version", version: true },
    { path: "throwing.version", version: true }, { path: "React.constructor", version: false },
  ]);
  assert.equal(result.signals["React.version"], "19.1.0");
  assert.equal(result.signals["React.credential"], "present");
  assert.equal(result.signals["inherited.version"], undefined);
  assert.equal(result.signals["throwing.version"], undefined);
  assert.equal(result.signals["React.constructor"], undefined);
  assert.ok(!JSON.stringify(result).includes("private-secret-value"));
});

test("dependencies are explicitly inferred and never inherit versions", () => {
  const matches = fixture.detect({ resources: [{ url: "https://example.com/_next/static/app.js", kind: "script" }] });
  assert.equal(matches.find((item) => item.id === "nextjs").version, null);
  const react = matches.find((item) => item.id === "react");
  assert.equal(react.version, null);
  assert.equal(react.evidence.detection_type, "implied");
  assert.equal(react.evidence.implied_by, "Next.js");
  assert.equal(react.confidence, 0.6);
});

test("modern React and Vue markers are recognized by property names without reading their values", () => {
  const element = {};
  Object.defineProperty(element, "__reactFiber$fixture", { get() { throw new Error("Private React state must not be read"); } });
  Object.defineProperty(element, "__vue_app__", { get() { throw new Error("Private Vue state must not be read"); } });
  const result = fixture.runtime({}, [], { querySelectorAll: () => [element] });
  assert.deepEqual(Array.from(result.hints), ["react", "vue"]);
  assert.deepEqual(fixture.detect({ hints: Array.from(result.hints) }).map((item) => item.id), ["react", "vue"]);
  assert.ok(!JSON.stringify(result).includes("__reactFiber"));
});

test("direct dependency detection keeps its own version and stronger confidence", () => {
  const matches = fixture.detect({ hints: ["nextjs"], js: { "React.version": "19.1.0" } });
  const react = matches.find((item) => item.id === "react");
  assert.equal(react.version, "19.1.0");
  assert.equal(react.evidence.detection_type, "direct");
});

test("resource boundaries avoid arbitrary substring matches and script-only signatures ignore images", () => {
  assert.deepEqual(fixture.detect({ resources: [
    { url: "https://example.com/articles/jquery-guide", kind: "script" },
    { url: "https://example.com/jquery.min.js", kind: "img" },
    { url: "https://js.stripe.com.attacker.example/example", kind: "script" },
  ] }), []);
  assert.deepEqual(fixture.detect({ js: { "_.VERSION": "1.13.6" } }), []);
});

test("Bootstrap is recognized in minified files and explicit package versions", () => {
  for (const url of ["https://example.com/bootstrap.min.css", "https://example.com/bootstrap@5.3.3/dist/css/bootstrap.min.css"]) {
    assert.ok(fixture.detect({ resources: [{ url, kind: "link" }] }).some((item) => item.id === "bootstrap"));
  }
  assert.equal(fixture.detect({ resources: [{ url: "https://example.com/bootstrap-5.3.3.min.css", kind: "link" }] })[0].version, "5.3.3");
});

test("quick detection uses isolated and main worlds without PHP or collection replacement", async () => {
  const service = fixture.analysis();
  const result = await service.detect();
  assert.equal(result.runtimeAvailable, true);
  assert.equal(result.technologies.find((item) => item.id === "react").version, "19.1.0");
  assert.deepEqual(fixture.calls.map((call) => call.world), ["ISOLATED", "MAIN"]);
  assert.equal(fixture.saved, 0);
  assert.deepEqual(fixture.badges, [{ tabId: 3, text: "2" }]);
});

test("runtime inspection failure preserves DOM detections and reports reduced coverage", async () => {
  const result = await fixture.analysis({ blockRuntime: true }).detect();
  assert.equal(result.runtimeAvailable, false);
  assert.ok(result.technologies.some((item) => item.id === "nextjs"));
});

test("a navigation during detection rejects findings for the wrong page", async () => {
  await assert.rejects(() => fixture.analysis({ navigate: true }).detect(), /page changed/);
});

test("technology categories, versions, and inference provenance survive graph serialization", () => {
  const snapshot = fixture.snapshot({ js: { "jQuery.fn.jquery": "3.7.1" }, runtimeAvailable: true });
  const graph = new GraphBuilder().build(snapshot, new FingerprintService(catalog).detect(snapshot));
  assert.equal(new DocumentValidator().validate(graph), true);
  const roundtrip = JSON.parse(JSON.stringify(graph));
  const jquery = roundtrip.nodes.find((node) => node.id === "technology:jquery");
  assert.equal(jquery.evidence.version, "3.7.1");
  assert.equal(jquery.evidence.category, "JavaScript libraries");
  assert.ok(roundtrip.edges.filter((edge) => edge.type === "uses").every((edge) => edge.verification === "inferred"));
  assert.equal(new CollectionRepository({}).summary({ id: "fixture", document: roundtrip }).technologies[0], "jQuery");
});

test("navigation resets tab badges so counts from the previous page do not persist", async () => {
  let listener;
  const updates = [];
  new BackgroundController({ tabs: { onUpdated: { addListener: (callback) => { listener = callback; } } },
    action: { setBadgeText: async (options) => updates.push(options) } }, {}, {}, {}, {});
  listener(7, { status: "loading" });
  assert.deepEqual(updates, [{ tabId: 7, text: "" }]);
});

test("each technology added in 0.6 is detected from its own representative markers", () => {
  const cases = {
    tailwind: { resources: [{ url: "https://cdn.tailwindcss.com/3.4.1", kind: "script" }] },
    svelte: { js: { __svelte: "present" } },
    solid: { js: { _$HY: "present" } },
    qwik: { dom: { "qwik-root": ["present"] } },
    remix: { js: { __remixContext: "present" } },
    storybook: { resources: [{ url: "https://example.com/sb-manager/runtime.js", kind: "script" }] },
    esbuild: { resources: [{ url: "https://example.com/node_modules/.vite/deps/chunk-ABCD1234.js", kind: "script" }] },
    rollup: { resources: [{ url: "https://example.com/assets/index-DeadBeef.js", kind: "script" }] },
    turbopack: { resources: [{ url: "https://example.com/_next/static/chunks/_e69f0d32._.js", kind: "script" }] },
    vitepress: { generators: ["VitePress v1.6.3"] },
    docusaurus: { generators: ["Docusaurus v3.7.0"] },
    posthog: { resources: [{ url: "https://us.i.posthog.com/static/array.js", kind: "script" }] },
    mixpanel: { resources: [{ url: "https://cdn.mxpnl.com/libs/mixpanel-2-latest.min.js", kind: "script" }] },
    umami: { resources: [{ url: "https://analytics.example.com/umami.js", kind: "script" }] },
  };
  for (const [id, snapshot] of Object.entries(cases)) {
    const match = fixture.detect(snapshot).find((item) => item.id === id);
    assert.ok(match, `${id} was not detected from its representative markers`);
    assert.equal(match.evidence.detection_type, "direct");
  }
  assert.equal(fixture.detect(cases.vitepress).find((item) => item.id === "vitepress").version, "1.6.3");
  assert.equal(fixture.detect(cases.docusaurus).find((item) => item.id === "docusaurus").version, "3.7.0");
  assert.ok(fixture.detect({ generators: ["Docusaurus"] }).some((item) => item.id === "docusaurus"));
});

test("build and style markers shared by unrelated pipelines do not claim a technology", () => {
  const ids = (extra) => fixture.detect(extra).map((item) => item.id);
  // A Vercel deployment identifier is not Turbopack output.
  assert.ok(!ids({ resources: [{ url: "https://example.com/_next/static/chunks/main-app.js?dpl=deadbeef", kind: "script" }] }).includes("turbopack"));
  // Generic endpoints and hashed chunk names belong to no single tool.
  assert.deepEqual(ids({ resources: [
    { url: "https://example.com/api/send", kind: "script" },
    { url: "https://example.com/chunk-ABCD1234.js", kind: "script" },
    { url: "https://example.com/assets/site.css", kind: "link" },
  ] }), []);
  // Utility classes and theme attributes are too common to fingerprint.
  for (const marker of PageCollector.plan(catalog).dom) {
    assert.doesNotMatch(marker.selector, /class\*=|data-theme/);
  }
});
