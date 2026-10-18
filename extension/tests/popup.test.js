import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { PopupAssets } from "../src/services/PopupAssets.js";
import { technologyIcons } from "../assets/technology-icons/icons.js";
import { CollectionRepository } from "../src/services/CollectionRepository.js";

const assets = new PopupAssets({ runtime: { getURL: (path) => `chrome-extension://fixture/${path}` } });

test("favicons use Chrome's extension endpoint and omit query strings and fragments", () => {
  const icon = new URL(assets.favicon("https://example.com/account?session=private#secret"));
  assert.equal(icon.origin, "null");
  assert.equal(icon.protocol, "chrome-extension:");
  assert.equal(icon.pathname, "/_favicon/");
  assert.equal(icon.searchParams.get("pageUrl"), "https://example.com/account");
  assert.equal(icon.searchParams.get("size"), "64");
  assert.ok(!icon.href.includes("private") && !icon.href.includes("secret"));
});

test("unsafe favicon inputs and unrecognized technology IDs use packaged fallbacks", () => {
  for (const page of ["javascript:alert(1)", "https://user:password@example.com/", "file:///private", "not a URL"]) {
    assert.equal(assets.favicon(page), assets.fallback());
  }
  for (const id of ["../secret", "__proto__", "constructor", "missing-brand"]) {
    assert.ok(assets.technology(id).endsWith("/technology-icons/generic.svg"));
  }
});

test("every bundled brand icon exists locally and has no executable or external content", async () => {
  assert.ok(Object.keys(technologyIcons).length >= 60);
  for (const [id, file] of Object.entries(technologyIcons)) {
    assert.match(file, /^[a-z0-9-]+\.svg$/);
    const icon = await readFile(new URL(`../assets/technology-icons/${file}`, import.meta.url), "utf8");
    assert.match(icon, /^<svg /);
    assert.ok(!/<script|\bon\w+=|(?:href|src)=|<!/i.test(icon), `Unsafe asset: ${id}`);
    assert.ok(assets.technology(id).endsWith(file));
  }
  await access(new URL("../assets/technology-icons/LICENSE.md", import.meta.url));
});

test("discovery counters exclude declared resources from page counts and keep collected IP totals", () => {
  const data = { target: "example.com", collected_at: new Date().toISOString(), status: "complete",
    nodes: [
      { type: "page", evidence: {} }, { type: "page", evidence: { kind: "link" } },
      { type: "page", evidence: { kind: "script" } }, { type: "domain", evidence: {} },
      { type: "domain", evidence: {} }, { type: "ip", evidence: {} },
    ], edges: [], errors: [], results: {} };
  assert.deepEqual(new CollectionRepository({}).summary({ id: "fixture", document: data }).metrics, { pages: 2, domains: 2, ips: 1 });
});
