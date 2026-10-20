import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import vm from "node:vm";
import { ConnectorSettings } from "../src/models/ConnectorSettings.js";
import { GraphBuilder } from "../src/models/GraphBuilder.js";
import { PageCollector } from "../src/services/PageCollector.js";
import { FingerprintService } from "../src/services/FingerprintService.js";
import { SettingsRepository } from "../src/services/SettingsRepository.js";
import { CollectionRepository } from "../src/services/CollectionRepository.js";
import { ConnectorClient } from "../src/services/ConnectorClient.js";
import { GraphMerger } from "../src/services/GraphMerger.js";
import { ResourceClassifier } from "../src/services/ResourceClassifier.js";
import { AnalysisService } from "../src/services/AnalysisService.js";
import { BackgroundController } from "../src/controllers/BackgroundController.js";
import { OptionsController } from "../src/controllers/OptionsController.js";
import { DocumentValidator } from "../explorer/src/services/DocumentValidator.js";
import { ExtensionCollectionSource } from "../explorer/src/services/ExtensionCollectionSource.js";

class MemoryStorage {
  constructor() {
    this.values = {};
    this.access = "";
  }
  async setAccessLevel(options) {
    this.access = options.accessLevel;
  }
  async get(keys) {
    if (keys === null) return structuredClone(this.values);
    return Object.fromEntries(
      (Array.isArray(keys) ? keys : [keys])
        .filter((key) => Object.hasOwn(this.values, key))
        .map((key) => [key, structuredClone(this.values[key])]),
    );
  }
  async set(values) {
    Object.assign(this.values, structuredClone(values));
  }
  async remove(keys) {
    for (const key of Array.isArray(keys) ? keys : [keys])
      delete this.values[key];
  }
}

class ChromeFixture {
  constructor(snapshot = new PageFixture().snapshot()) {
    this.storage = { local: new MemoryStorage(), session: new MemoryStorage() };
    this.granted = true;
    this.permissions = { contains: async () => this.granted };
    this.runtime = {
      id: "test-extension",
      getURL: (file) => "chrome-extension://test-extension/" + file,
    };
    this.opened = [];
    this.tab = { id: 1, url: snapshot.url };
    this.tabs = {
      query: async () => [this.tab],
      create: async (options) => {
        this.opened.push(options);
      },
    };
    this.scripting = {
      executeScript: async () => [{ frameId: 0, result: snapshot }],
    };
  }
}

class PageFixture {
  snapshot() {
    return {
      url: "https://example.com/about",
      title: "Example page",
      collected_at: "2026-10-16T12:00:00Z",
      links: [
        { url: "https://example.com/contact" },
        { url: "https://other.example/info" },
      ],
      resources: [
        {
          url: "https://cdn.example/wp-content/app.js",
          kind: "script",
          observed_via: "performance",
        },
      ],
      generators: ["WordPress 6"],
      hints: ["react"],
    };
  }

  remote(local) {
    const graph = structuredClone(local);
    graph.source = "probe";
    graph.nodes.forEach((node) => {
      node.source = "probe";
    });
    graph.edges.forEach((edge) => {
      edge.source_tool = "probe";
    });
    graph.results = { dns: { records: [] } };
    return graph;
  }
}

const catalog = JSON.parse(
  await readFile(
    new URL("../../shared/fingerprints.json", import.meta.url),
    "utf8",
  ),
);
const validator = new DocumentValidator();
const fixture = new PageFixture();
const key = "test-api-key-with-at-least-thirty-two-characters";

test("manifest uses activeTab and optional connector hosts without broad required access", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../manifest.json", import.meta.url), "utf8"),
  );
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["activeTab", "scripting", "storage", "favicon"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.externally_connectable, undefined);
  for (const file of [
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.options_ui.page,
    ...Object.values(manifest.icons),
  ]) {
    await access(new URL("../" + file, import.meta.url));
  }
});

test("the packaged Explorer and catalog match canonical source", async () => {
  for (const file of [
    "app.js",
    "index.html",
    "style.css",
    "src/services/DocumentValidator.js",
    "src/services/ExtensionCollectionSource.js",
    "vendor/schema.json",
    "vendor/cytoscape.js",
    "vendor/graph-validator.js",
  ]) {
    assert.equal(
      await readFile(new URL("../explorer/" + file, import.meta.url), "utf8"),
      await readFile(
        new URL("../../explorer/" + file, import.meta.url),
        "utf8",
      ),
    );
  }
  assert.deepEqual(
    JSON.parse(
      await readFile(new URL("../fingerprints.json", import.meta.url), "utf8"),
    ),
    catalog,
  );
});

test("connector settings require HTTPS, safe endpoint URLs, and explicit local development", () => {
  assert.equal(new ConnectorSettings().validate().enabled, false);
  const settings = new ConnectorSettings({
    endpoint: "https://connector.example:8443/w3bmap.php",
    apiKey: key,
    enabled: true,
  }).validate();
  assert.equal(settings.permissionOrigin, "https://connector.example/*");
  for (const endpoint of [
    "http://remote.example/w3bmap.php",
    "https://user:secret@connector.example/a",
    "https://connector.example/a?token=x",
    "https://connector.example/a#token",
    "javascript:alert(1)",
  ]) {
    assert.throws(() =>
      new ConnectorSettings({
        endpoint,
        apiKey: key,
        enabled: true,
      }).validate(),
    );
  }
  assert.throws(() =>
    new ConnectorSettings({
      endpoint: "http://127.0.0.1:8080/w3bmap.php",
      apiKey: key,
    }).validate(true),
  );
  assert.equal(
    new ConnectorSettings({
      endpoint: "http://127.0.0.1:8080/w3bmap.php",
      apiKey: key,
      allowLocalHttp: true,
    }).validate(true).permissionOrigin,
    "http://127.0.0.1/*",
  );
  assert.throws(() =>
    new ConnectorSettings({
      endpoint: settings.endpoint,
      apiKey: "short",
      enabled: true,
    }).validate(),
  );
  assert.throws(() =>
    new ConnectorSettings({ modules: ["environment"] }).validate(),
  );
});

test("API keys use session storage by default; remembering and forgetting are explicit", async () => {
  const api = new ChromeFixture();
  const repository = new SettingsRepository(api);
  const settings = new ConnectorSettings({
    endpoint: "https://connector.example/w3bmap.php",
    apiKey: key,
  });
  await repository.save(settings);
  assert.equal(api.storage.session.values.connectorKey, key);
  assert.equal(api.storage.local.values.connectorKey, undefined);
  assert.equal(api.storage.local.access, "TRUSTED_CONTEXTS");
  assert.equal(api.storage.session.access, "TRUSTED_CONTEXTS");
  assert.equal((await repository.load()).apiKey, key);
  settings.rememberKey = true;
  await repository.save(settings);
  assert.equal(api.storage.local.values.connectorKey, key);
  assert.equal(api.storage.session.values.connectorKey, undefined);
  await repository.forget();
  assert.equal((await repository.load()).apiKey, "");
  assert.equal((await repository.load()).enabled, false);
});

test("the injected function is self-contained and collects no page body or form values", () => {
  const document = {
    baseURI: "https://example.com/about",
    title: "Example",
    querySelectorAll(selector) {
      if (selector === "a[href]")
        return [
          { href: "https://example.com/contact?token=secret#fragment" },
          { href: "https://user:password@example.com/private" },
          { href: "javascript:alert(1)" },
          { href: "data:text/plain,secret" },
        ];
      if (selector.startsWith("script"))
        return [
          { src: "https://cdn.example/app.js?key=secret", tagName: "SCRIPT" },
        ];
      if (selector.startsWith("meta")) return [{ content: "WordPress" }];
      return [];
    },
    querySelector(selector) {
      return selector === "[ng-version]" ? {} : null;
    },
    get body() {
      throw new Error("Page body must not be read.");
    },
    get cookie() {
      throw new Error("Cookies must not be read.");
    },
  };
  const snapshot = vm.runInNewContext(
    `(${PageCollector.collectPage.toString()})()`,
    {
      document,
      location: { href: "https://example.com/about?session=secret#account" },
      URL,
      Date,
      performance: {
        getEntriesByType: () => [
          {
            name: "https://cdn.example/app.js?other=secret",
            initiatorType: "script",
          },
        ],
      },
    },
  );
  assert.equal(snapshot.url, "https://example.com/about");
  assert.equal(snapshot.links.length, 1);
  assert.equal(snapshot.resources.length, 1);
  assert.equal(snapshot.resources[0].observed_via, "dom_and_performance");
  assert.equal(snapshot.hints[0], "angular");
  assert.equal(JSON.stringify(snapshot).includes("secret"), false);
  assert.equal(JSON.stringify(snapshot).includes("password"), false);
});

test("fingerprints and browser graphs satisfy the shared schema with inferred technology edges", () => {
  const snapshot = fixture.snapshot();
  const matches = new FingerprintService(catalog).detect(snapshot);
  assert.deepEqual(
    matches.map((match) => match.id),
    ["wordpress", "react"],
  );
  const graph = new GraphBuilder().build(snapshot, matches);
  assert.equal(validator.validate(graph), true);
  assert.equal(graph.source, "extension");
  assert.ok(
    graph.edges.some((edge) => edge.type === "requests_resources_from"),
  );
  assert.ok(
    graph.edges
      .filter((edge) => edge.type === "uses")
      .every((edge) => edge.verification === "inferred"),
  );
});

test("DOM-only resources are recorded as references rather than observed requests", () => {
  const snapshot = fixture.snapshot();
  snapshot.resources[0].observed_via = "dom";
  const graph = new GraphBuilder().build(snapshot, []);
  assert.ok(graph.edges.some((edge) => edge.type === "references_resource"));
  assert.equal(
    graph.edges.some((edge) => edge.type === "requests_resource"),
    false,
  );
  assert.equal(validator.validate(graph), true);
});

test("enrichment deduplicates entities while retaining evidence from both sources", () => {
  const local = new GraphBuilder().build(fixture.snapshot(), new FingerprintService(catalog).detect(fixture.snapshot()));
  const before = JSON.stringify(local);
  const remote = fixture.remote(local);
  const result = new GraphMerger().merge(local, remote);
  assert.equal(validator.validate(result), true);
  assert.equal(result.nodes.length, local.nodes.length);
  assert.equal(result.edges.length, local.edges.length);
  assert.equal(result.nodes[0].evidence.observations.length, 2);
  const technology = result.nodes.find((node) => node.type === "technology");
  assert.equal(technology.evidence.category, local.nodes.find((node) => node.id === technology.id).evidence.category);
  assert.equal(result.source, "extension");
  assert.equal(JSON.stringify(local), before);
  remote.target = "different.example";
  assert.throws(
    () => new GraphMerger().merge(local, remote),
    /different target/,
  );
});

test("enrichment rejects unsupported and prototype-shaped module names", () => {
  const local = new GraphBuilder().build(fixture.snapshot(), []);
  const remote = fixture.remote(local);
  remote.results = JSON.parse('{"__proto__":{"polluted":true}}');
  assert.throws(
    () => new GraphMerger().merge(local, remote),
    /unsupported result module/,
  );
  assert.equal({}.polluted, undefined);
});

test("settings request host access before asynchronous storage work; denial preserves prior settings", async () => {
  const api = new ChromeFixture();
  const events = [];
  const originalGet = api.storage.local.get.bind(api.storage.local);
  api.storage.local.get = async (keys) => {
    events.push("storage");
    return originalGet(keys);
  };
  api.permissions.request = () => {
    events.push("permission");
    return Promise.resolve(true);
  };
  api.permissions.remove = async () => true;
  class SettingsViewFixture {
    constructor() {
      this.settings = new ConnectorSettings({
        endpoint: "https://connector.example/w3bmap.php",
        apiKey: key,
      });
    }
    read() {
      return this.settings;
    }
    busy() {}
    notice(message) {
      this.message = message;
    }
    get() {
      return { hidden: false };
    }
  }
  const view = new SettingsViewFixture();
  const controller = new OptionsController(api, view);
  await controller.save(false);
  assert.equal(events[0], "permission");
  assert.equal(
    (await new SettingsRepository(api).load()).endpoint,
    view.settings.endpoint,
  );
  api.permissions.request = () => Promise.resolve(false);
  view.settings = new ConnectorSettings({
    endpoint: "https://different.example/w3bmap.php",
    apiKey: key,
  });
  await controller.save(false);
  assert.match(view.message, /declined/);
  assert.equal(
    (await new SettingsRepository(api).load()).endpoint,
    "https://connector.example/w3bmap.php",
  );
});

test("connector requests use POST, omit cookies, never follow redirects, and do not export tokens", async () => {
  const api = new ChromeFixture();
  const settings = new ConnectorSettings({
    endpoint: "https://connector.example/w3bmap.php",
    apiKey: key,
  });
  let captured;
  const client = new ConnectorClient(api, async (url, options) => {
    captured = { url, options };
    return new Response(
      JSON.stringify({
        tool: "w3bm@p",
        api_version: "1.0",
        schema_version: "1.0",
        modules: ["dns"],
      }),
    );
  });
  assert.deepEqual((await client.capabilities(settings)).modules, ["dns"]);
  await client.analyze(settings, "example.com");
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.redirect, "error");
  assert.equal(captured.options.credentials, "omit");
  assert.equal(captured.options.headers.Authorization, `Bearer ${key}`);
  assert.equal(captured.options.body.includes(key), false);
  assert.equal(captured.url.includes(key), false);
  assert.equal(JSON.parse(captured.options.body).domain, "example.com");
});

test("connector permission, status, invalid JSON, incompatible metadata, reflected secrets, and size failures are bounded", async () => {
  const api = new ChromeFixture();
  const settings = new ConnectorSettings({
    endpoint: "https://connector.example/w3bmap.php",
    apiKey: key,
  });
  api.granted = false;
  await assert.rejects(
    () =>
      new ConnectorClient(api, () => {
        throw new Error("Must not fetch");
      }).capabilities(settings),
    /host access/,
  );
  api.granted = true;
  for (const [response, message] of [
    [new Response(key, { status: 401 }), /HTTP 401/],
    [new Response("<html>not json</html>"), /valid JSON/],
    [new Response(JSON.stringify({ tool: "other" })), /compatible/],
    [
      new Response(JSON.stringify({ tool: "w3bm@p", secret: key })),
      /authentication data/,
    ],
    [new Response("x".repeat(4 * 1024 * 1024 + 1)), /4 MiB/],
  ]) {
    await assert.rejects(
      () =>
        new ConnectorClient(api, async () => response).capabilities(settings),
      message,
    );
  }
  await assert.rejects(
    () =>
      new ConnectorClient(api, async () => {
        throw new TypeError("secret transport diagnostic");
      }).capabilities(settings),
    /could not be reached/,
  );
  await assert.rejects(
    () =>
      new ConnectorClient(api, async () => {
        throw new DOMException("abort", "AbortError");
      }).capabilities(settings),
    /25 seconds/,
  );
});

test("collection storage is bounded and Explorer handoff rejects stale IDs", async () => {
  const api = new ChromeFixture();
  const repository = new CollectionRepository(api);
  const graph = new GraphBuilder().build(fixture.snapshot(), []);
  const stored = await repository.save(graph);
  const source = new ExtensionCollectionSource(api);
  assert.deepEqual(await source.read("#collection=" + stored.id), graph);
  await assert.rejects(
    () => source.read("#collection=stale"),
    /no longer available/,
  );
  await assert.rejects(
    () => repository.save({ huge: "x".repeat(CollectionRepository.MAX_BYTES) }),
    /4 MiB/,
  );
  assert.equal((await repository.latest()).id, stored.id);
  await repository.clear();
  assert.equal(await repository.latest(), null);
});

test("local collection works without a connector and rejects restricted tabs", async () => {
  const api = new ChromeFixture();
  const repository = new CollectionRepository(api);
  const settings = new SettingsRepository(api);
  const service = new AnalysisService(
    api,
    settings,
    {
      analyze: async () => {
        throw new Error("Must not contact a connector");
      },
    },
    repository,
    validator,
    catalog,
  );
  const summary = await service.analyze();
  assert.equal(summary.status, "complete");
  assert.equal((await repository.latest()).document.source, "extension");
  api.tab.url = "chrome://extensions/";
  await assert.rejects(() => service.analyze(), /normal HTTP or HTTPS/);
  assert.equal(service.running, false);
});

test("a connector failure keeps browser findings and records a partial collection", async () => {
  const api = new ChromeFixture();
  const repository = new CollectionRepository(api);
  const settings = new SettingsRepository(api);
  await settings.save(
    new ConnectorSettings({
      endpoint: "https://connector.example/w3bmap.php",
      apiKey: key,
      enabled: true,
    }),
  );
  const service = new AnalysisService(
    api,
    settings,
    {
      capabilities: async () => ({ modules: ConnectorSettings.MODULES }),
      analyze: async () => {
        throw new Error("Connector unavailable.");
      },
    },
    repository,
    validator,
    catalog,
  );
  const summary = await service.analyze();
  const graph = (await repository.latest()).document;
  assert.equal(summary.status, "partial");
  assert.equal(graph.errors[0].module, "connector");
  assert.ok(graph.nodes.length > 0);
  assert.equal(JSON.stringify(graph).includes(key), false);
});

test("concurrent analysis is rejected and successful enrichment remains schema-compatible", async () => {
  const api = new ChromeFixture();
  const repository = new CollectionRepository(api);
  const settings = new SettingsRepository(api);
  await settings.save(
    new ConnectorSettings({
      endpoint: "https://connector.example/w3bmap.php",
      apiKey: key,
      enabled: true,
    }),
  );
  let release;
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  const local = new GraphBuilder().build(
    fixture.snapshot(),
    new FingerprintService(catalog).detect(fixture.snapshot()),
  );
  const service = new AnalysisService(
    api,
    settings,
    {
      capabilities: async () => ({ modules: ConnectorSettings.MODULES }),
      analyze: async () => {
        await waiting;
        const remote = fixture.remote(local);
        remote.results = Object.fromEntries(ConnectorSettings.MODULES.map((module) => [module, {}]));
        return remote;
      },
    },
    repository,
    validator,
    catalog,
  );
  const first = service.analyze();
  await assert.rejects(() => service.analyze(), /already running/);
  release();
  const summary = await first;
  assert.equal(summary.connector.status, "complete");
  assert.equal(summary.connector.connection, "connected");
  assert.equal(summary.connector.modules.length, ConnectorSettings.MODULES.length);
  assert.equal(validator.validate((await repository.latest()).document), true);
  assert.equal(service.running, false);
});

test("background operations reject untrusted senders and open only the packaged Explorer", async () => {
  const api = new ChromeFixture();
  const repository = new CollectionRepository(api);
  const settings = new SettingsRepository(api);
  const controller = new BackgroundController(api, settings, {}, repository, {
    running: false,
  });
  await assert.rejects(
    () =>
      controller.handle(
        { action: "state" },
        { id: api.runtime.id, url: "https://untrusted.example/" },
      ),
    /trusted extension pages/,
  );
  await assert.rejects(
    () =>
      controller.handle(
        { action: "openExplorer" },
        { id: api.runtime.id, url: api.runtime.getURL("popup/index.html") },
      ),
    /Analyze a page/,
  );
  const record = await repository.save(
    new GraphBuilder().build(fixture.snapshot(), []),
  );
  await controller.handle(
    { action: "openExplorer" },
    { id: api.runtime.id, url: api.runtime.getURL("popup/index.html") },
  );
  assert.equal(
    api.opened[0].url,
    api.runtime.getURL("explorer/index.html") + "#collection=" + record.id,
  );
});

test("subresources become asset entities while documents stay pages", () => {
  const snapshot = fixture.snapshot();
  snapshot.links = [
    { url: "https://example.com/contact" },
    { url: "https://example.com/files/report.pdf" },
    { url: "https://example.com/data/index.json" },
  ];
  snapshot.resources = [
    { url: "https://cdn.example/app.js", kind: "script", observed_via: "performance" },
    { url: "https://cdn.example/site.css", kind: "link", observed_via: "dom" },
    { url: "https://cdn.example/logo.png", kind: "img", observed_via: "dom" },
    { url: "https://example.com/embedded", kind: "iframe", observed_via: "dom" },
    { url: "https://cdn.example/brand", kind: "link", observed_via: "dom" },
  ];
  const graph = new GraphBuilder().build(snapshot, []);
  assert.equal(validator.validate(graph), true);
  const typed = (id) => graph.nodes.find((node) => node.id === id)?.type;
  for (const url of ["https://cdn.example/app.js", "https://cdn.example/site.css",
    "https://cdn.example/logo.png", "https://example.com/files/report.pdf",
    "https://example.com/data/index.json"])
    assert.equal(typed(`asset:${url}`), "asset", `${url} should be an asset`);
  // An iframe is a document, and a <link> without an asset extension is a page relation.
  assert.equal(typed("page:https://example.com/embedded"), "page");
  assert.equal(typed("page:https://cdn.example/brand"), "page");
  assert.equal(typed("page:https://example.com/about"), "page");
  assert.equal(typed("page:https://example.com/contact"), "page");
  assert.equal(graph.nodes.some((node) => node.id.startsWith("page:https://cdn.example/app.js")), false);
  // A linked download is a reference, not navigation.
  const from = (target) =>
    graph.edges.find(
      (edge) => edge.source === "page:https://example.com/about" && edge.target === target,
    ).type;
  assert.equal(from("asset:https://example.com/files/report.pdf"), "references_resource");
  assert.equal(from("page:https://example.com/contact"), "links_to");
  assert.equal(graph.schema_version, "1.1");
});

test("resource classification prefers the request kind and falls back to the extension", () => {
  assert.equal(ResourceClassifier.classify("https://example.com/app.js", "script"), "asset");
  assert.equal(ResourceClassifier.classify("https://example.com/page", "iframe"), "page");
  assert.equal(ResourceClassifier.classify("https://example.com/style", "css"), "asset");
  assert.equal(ResourceClassifier.classify("https://example.com/report.pdf"), "asset");
  assert.equal(ResourceClassifier.classify("https://example.com/about"), "page");
  assert.equal(ResourceClassifier.classify("https://example.com/index.html"), "page");
  assert.equal(ResourceClassifier.classify("https://example.com/shop/item.php"), "page");
  // A dotted directory name is not an extension, and a dotfile is not an asset.
  assert.equal(ResourceClassifier.classify("https://example.com/v1.2/guide"), "page");
  assert.equal(ResourceClassifier.classify("https://example.com/.well-known/x"), "page");
  assert.equal(ResourceClassifier.classify("not a url", "script"), "asset");
  assert.equal(ResourceClassifier.classify("not a url"), "page");
});
