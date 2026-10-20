import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

export class IconAssetBuilder {
  constructor() {
    this.root = new URL("../", import.meta.url);
    this.outputs = {};
  }

  svg(id, color = "#325970") {
    const icon = this.catalog.icons[id];
    if (!icon) throw new Error(`Missing Iconify icon: ${id}`);
    if (/<script|foreignObject|\bon\w+\s*=|(?:href|src)=["'](?!#)|<!/i.test(icon.body)) throw new Error(`Unsafe Iconify asset: ${id}`);
    // Only the SVG container/color is generated; geometry is copied from Iconify unchanged.
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${icon.width}" height="${icon.height}" viewBox="0 0 ${icon.width} ${icon.height}" color="${color}">${icon.body}</svg>\n`;
  }

  async save(path, content, icon) {
    const url = new URL(path, this.root);
    await mkdir(new URL("./", url), { recursive: true });
    await writeFile(url, content);
    if (icon) this.outputs[path] = { icon, sha256: createHash("sha256").update(content).digest("hex") };
  }

  async run() {
    this.catalog = JSON.parse(await readFile(new URL("shared/iconify/catalog.json", this.root), "utf8"));
    for (const directory of ["explorer/assets/icons", "extension/assets/ui-icons"]) {
      const css = ["/* Generated from Iconify. Do not draw or edit icon geometry here. */",
        ".ui-icon { display: inline-block; width: 19px; height: 19px; background-color: currentColor; mask: var(--icon-url) center / contain no-repeat; -webkit-mask: var(--icon-url) center / contain no-repeat; flex-shrink: 0; }"];
      for (const [name, id] of Object.entries(this.catalog.ui)) {
        await this.save(`${directory}/${name}.svg`, this.svg(id), id);
        css.push(`.ui-icon[data-icon="${name}"] { --icon-url: url("./${name}.svg"); }`);
      }
      await this.save(`${directory}/icons.css`, css.join("\n") + "\n");
    }
    const graph = { domain: ["globe", "#168b92"], ip: ["server", "#8b6dc5"], page: ["file", "#5e8cc7"],
      asset: ["code", "#7a8aa0"], technology: ["code", "#c58d43"], certificate: ["shield", "#4d9a7a"],
      sitemap: ["sitemap", "#b66e97"] };
    for (const [type, [name, color]] of Object.entries(graph)) {
      await this.save(`explorer/assets/icons/graph-${type}.svg`, this.svg(this.catalog.ui[name], color), this.catalog.ui[name]);
    }
    const technologyIcons = {};
    // The Explorer also runs standalone over HTTP, so it keeps its own copy of the logos.
    for (const directory of ["extension/assets/technology-icons", "explorer/assets/technology-icons"]) {
      for (const [id, icon] of Object.entries(this.catalog.technologies)) {
        technologyIcons[id] = `${id}.svg`;
        await this.save(`${directory}/${id}.svg`, this.svg(icon, this.catalog.colors[id] ?? "#325970"), icon);
      }
      await this.save(`${directory}/icons.js`, "// Generated from shared/iconify/catalog.json. Iconify assets only.\nexport const technologyIcons = " + JSON.stringify(technologyIcons, null, 2) + ";\n");
    }
    for (const [path, id, color] of [
      ["extension/assets/technology-icons/generic.svg", "bx:code-alt", "#16849c"],
      ["explorer/assets/technology-icons/generic.svg", "bx:code-alt", "#16849c"],
      ["extension/assets/site-fallback.svg", "bx:globe", "#128099"],
      ["explorer/assets/site-fallback.svg", "bx:globe", "#128099"],
      ["extension/assets/logo.svg", "bx:network-chart", "#009bb0"],
      ["extension/assets/brand-mark.svg", "bx:network-chart", "#00b8c9"],
      ["explorer/assets/favicon.svg", "bx:network-chart", "#009bb0"],
    ]) await this.save(path, this.svg(id, color), id);
    if (process.env.W3BMAP_SHARP_MODULE) {
      const { default: sharp } = await import(pathToFileURL(process.env.W3BMAP_SHARP_MODULE).href);
      for (const size of [16, 32, 48, 128]) {
        const png = await sharp(Buffer.from(this.svg("bx:network-chart", "#009bb0"))).resize(size, size).png().toBuffer();
        await this.save(`extension/assets/icon-${size}.png`, png, "bx:network-chart");
      }
    }
    const previous = JSON.parse(await readFile(new URL("shared/iconify/provenance.json", this.root), "utf8").catch(() => "{}"));
    for (const [path, entry] of Object.entries(previous.assets ?? {})) {
      if (path.endsWith(".png") && !this.outputs[path]) this.outputs[path] = entry;
    }
    await this.save("shared/iconify/provenance.json", JSON.stringify({ source: this.catalog.source,
      revision: this.catalog.revision, collections: this.catalog.collections, assets: this.outputs }, null, 2) + "\n");
    console.log("Iconify UI, brand, graph, and fallback icons are packaged locally.");
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await new IconAssetBuilder().run();
