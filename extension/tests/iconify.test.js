import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";

const root = new URL("../../", import.meta.url);
const catalog = JSON.parse(await readFile(new URL("shared/iconify/catalog.json", root), "utf8"));
const provenance = JSON.parse(await readFile(new URL("shared/iconify/provenance.json", root), "utf8"));

class IconAudit {
  async files(directory) {
    const result = [];
    for (const item of await readdir(new URL(directory, root), { withFileTypes: true })) {
      const path = directory + "/" + item.name;
      if (item.isDirectory()) result.push(...await this.files(path));
      else if (/\.(?:js|html)$/.test(path)) result.push(path);
    }
    return result;
  }
}

test("all generated icon assets retain original Iconify geometry and recorded hashes", async () => {
  assert.equal(catalog.source, "https://github.com/iconify/icon-sets");
  assert.match(catalog.revision, /^[0-9a-f]{40}$/);
  assert.equal(provenance.revision, catalog.revision);
  assert.equal(Object.keys(catalog.technologies).length, 94);
  assert.ok(Object.keys(provenance.assets).length > 140);
  for (const [path, entry] of Object.entries(provenance.assets)) {
    const bytes = await readFile(new URL(path, root));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256, `Unrecorded icon edit: ${path}`);
    assert.ok(catalog.icons[entry.icon], `Unrecognized source: ${path}`);
    if (path.endsWith(".svg")) {
      const svg = bytes.toString("utf8");
      const body = svg.slice(svg.indexOf(">") + 1, svg.lastIndexOf("</svg>"));
      assert.equal(body, catalog.icons[entry.icon].body, `Iconify geometry was modified: ${path}`);
    }
  }
});

test("application views contain no hand-authored SVG icon geometry or SVG data URLs", async () => {
  const files = ["explorer/index.html", ...await new IconAudit().files("explorer/src"),
    ...await new IconAudit().files("extension/src"), ...await new IconAudit().files("extension/popup")];
  for (const path of files) {
    const source = await readFile(new URL(path, root), "utf8");
    assert.ok(!/<(?:svg|path|rect|circle|ellipse|symbol)\b|data:image\/svg|createElementNS/i.test(source), `Inline icon drawing found: ${path}`);
  }
});

test("the packaged Explorer uses the canonical Iconify graph and interface assets", async () => {
  for (const item of await readdir(new URL("explorer/assets/icons", root))) {
    assert.deepEqual(await readFile(new URL("extension/explorer/assets/icons/" + item, root)),
      await readFile(new URL("explorer/assets/icons/" + item, root)), `Stale packaged icon: ${item}`);
  }
  assert.deepEqual(await readFile(new URL("extension/explorer/assets/favicon.svg", root)),
    await readFile(new URL("explorer/assets/favicon.svg", root)));
});
