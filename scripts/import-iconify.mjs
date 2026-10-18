import { readFile, writeFile, mkdir } from "node:fs/promises";

class IconifyCatalogImporter {
  async run() {
    const sets = {};
    for (const prefix of ["bx", "logos", "simple-icons"]) sets[prefix] = JSON.parse(await readFile(`data/iconify-${prefix}.json`, "utf8"));
    const catalog = JSON.parse(await readFile("shared/fingerprints.json", "utf8"));
    const { aliases, colors } = JSON.parse(await readFile("shared/iconify/preferences.json", "utf8"));
    const logos = { nextjs: "nextjs-icon", vue: "vue", nuxt: "nuxt-icon", angular: "angular-icon", alpine: "alpinejs-icon",
      sveltekit: "svelte-icon", backbone: "backbone-icon", ember: "ember-tomster", htmx: "htmx", dayjs: "dayjs", lodash: "lodash",
      chartjs: "chartjs", threejs: "threejs", "google-analytics": "google-analytics", "google-maps": "google-maps",
      "google-fonts": "google-fonts", gtm: "google-tag-manager", fontawesome: "font-awesome", newrelic: "new-relic",
      datadog: "datadog-icon", sentry: "sentry-icon", stripe: "stripe", lit: "lit-icon", mailchimp: "mailchimp-freddie",
      recaptcha: "recaptcha", turnstile: "cloudflare-icon", magento: "magento", videojs: "videojs", materialize: "materializecss" };
    const ui = { network: "network-chart", settings: "cog", more: "dots-vertical-rounded", chevron: "chevron-down",
      play: "play", external: "link-external", download: "download", upload: "upload", file: "file", globe: "globe", sitemap: "sitemap",
      refresh: "refresh", right: "chevron-right", up: "up-arrow-alt", down: "down-arrow-alt", search: "search", fit: "fullscreen",
      grid: "grid-alt", list: "list-ul", info: "info-circle", close: "x", shield: "check-shield", code: "code-alt", server: "server", plus: "plus", minus: "minus", extension: "extension", terminal: "terminal", branch: "git-branch" };
    const selected = {};
    const resolve = (id) => {
      const [prefix, name] = id.split(":");
      const set = sets[prefix];
      const icon = set.icons[name];
      if (!icon || /<script|foreignObject|\bon\w+\s*=|(?:href|src)=["'](?!#)|<!/i.test(icon.body)) throw new Error(`Missing/unsafe icon: ${id}`);
      selected[id] = { width: icon.width ?? set.width ?? 16, height: icon.height ?? set.height ?? 16, body: icon.body };
      return id;
    };
    const technologies = {};
    for (const { id } of catalog.technologies) {
      const candidates = [...(logos[id] ? [`logos:${logos[id]}`] : []), `logos:${id}-icon`, `logos:${id}`,
        `simple-icons:${aliases[id] ?? id.replaceAll("-", "")}`, `bx:bxl-${id}`];
      const icon = candidates.find((value) => {
        const [prefix, name] = value.split(":");
        const candidate = sets[prefix].icons[name];
        if (!candidate) return false;
        // Prefer compact official marks over wordmarks that become unreadable at 24px.
        return prefix !== "logos" || (candidate.width ?? sets[prefix].width ?? 16) / (candidate.height ?? sets[prefix].height ?? 16) <= 2;
      }) ?? "bx:code-alt";
      technologies[id] = resolve(icon);
    }
    for (const [name, value] of Object.entries(ui)) ui[name] = resolve(`bx:${value}`);
    await mkdir("shared/iconify", { recursive: true });
    await writeFile("shared/iconify/catalog.json", JSON.stringify({ source: "https://github.com/iconify/icon-sets",
      revision: "69ca5094ddd4aad6d797e689bb13ee8b692ae232", collections: Object.fromEntries(Object.entries(sets).map(([key, value]) => [key, value.info])),
      ui, technologies, colors: Object.fromEntries(Object.entries(colors).map(([key, value]) => [key, "#" + value])), icons: selected }, null, 2) + "\n");
    console.log(`Imported ${Object.keys(selected).length} original Iconify icons.`);
  }
}

await new IconifyCatalogImporter().run();
