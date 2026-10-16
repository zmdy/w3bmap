export class PageCollector {
  // Chrome serializes this function. All collection dependencies live inside it.
  static collectPage = function (plan = {}) {
    class BrowserSnapshotCollector {
      safeUrl(value) {
        try {
          if (typeof value !== "string" || !value) return null;
          const url = new URL(value, document.baseURI);
          if (
            !["http:", "https:"].includes(url.protocol) ||
            url.username ||
            url.password
          )
            return null;
          url.search = "";
          url.hash = "";
          if (url.href.length > 2048) return null;
          return url.href;
        } catch {
          return null;
        }
      }

      collect() {
        const url = this.safeUrl(location.href);
        if (!url) throw new Error("Only HTTP and HTTPS pages can be analyzed.");
        const links = new Map();
        for (const anchor of Array.from(
          document.querySelectorAll("a[href]"),
        ).slice(0, 2000)) {
          const href = this.safeUrl(anchor.href);
          if (href) links.set(href, { url: href });
          if (links.size >= 250) break;
        }
        const resources = new Map();
        for (const element of Array.from(
          document.querySelectorAll(
            "script[src],link[href],img[src],iframe[src],source[src],video[src],audio[src]",
          ),
        ).slice(0, 1000)) {
          const href = this.safeUrl(element.src || element.href);
          if (href)
            resources.set(href, {
              url: href,
              kind: element.tagName.toLowerCase(),
              observed_via: "dom",
            });
          if (resources.size >= 250) break;
        }
        for (const entry of performance
          .getEntriesByType("resource")
          .slice(0, 1000)) {
          const href = this.safeUrl(entry.name);
          if (href && resources.has(href))
            resources.get(href).observed_via = "dom_and_performance";
          else if (href && resources.size < 250)
            resources.set(href, {
              url: href,
              kind: String(entry.initiatorType || "resource").slice(0, 40),
              observed_via: "performance",
            });
        }
        const generators = Array.from(
          document.querySelectorAll('meta[name="generator" i]'),
        )
          .slice(0, 10)
          .map((element) => String(element.content).slice(0, 500));
        const selectors = {
          nextjs: "#__NEXT_DATA__",
          nuxt: "#__NUXT_DATA__",
          react: "[data-reactroot]",
          vue: "[data-v-app]",
          angular: "[ng-version]",
        };
        const hints = Object.entries(selectors)
          .filter(([, selector]) => document.querySelector(selector))
          .map(([id]) => id);
        const meta = Object.create(null);
        for (const key of (plan.meta ?? []).slice(0, 40)) {
          if (!/^[a-z0-9:_-]{1,50}$/i.test(key)) continue;
          meta[key] = Array.from(document.querySelectorAll(`meta[name="${key}" i],meta[property="${key}" i]`))
            .slice(0, 5).map((element) => String(element.content).slice(0, 500));
        }
        const dom = Object.create(null);
        for (const marker of (plan.dom ?? []).slice(0, 150)) {
          try {
            if (marker.attribute && marker.attribute !== "ng-version") continue;
            const element = document.querySelector(marker.selector);
            if (!element) continue;
            // Only catalog-approved technology attributes, never form values/text.
            const value = marker.attribute ? element.getAttribute(marker.attribute) : "present";
            if (typeof value === "string") dom[marker.key] = [value.slice(0, 100)];
          } catch { /* A bad selector must not interrupt page collection. */ }
        }
        return {
          url,
          title: document.title.slice(0, 240),
          collected_at: new Date().toISOString(),
          links: [...links.values()],
          resources: [...resources.values()],
          generators,
          hints,
          meta,
          dom,
        };
      }
    }
    return new BrowserSnapshotCollector().collect();
  };

  static collectRuntime = function (plan = []) {
    class RuntimeSignalCollector {
      read(path) {
        if (!/^[a-z_$][\w$]*(?:\.[a-z_$][\w$]*)*$/i.test(path)
          || path.split(".").some((key) => ["__proto__", "prototype", "constructor"].includes(key))) return undefined;
        let value = window;
        for (const key of path.split(".")) {
          if (value === null || !["object", "function"].includes(typeof value)) return undefined;
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          if (!descriptor || !Object.hasOwn(descriptor, "value")) return undefined;
          value = descriptor.value;
        }
        return value;
      }

      collect() {
        const signals = Object.create(null);
        for (const entry of plan.slice(0, 100)) {
          try {
            const value = this.read(entry.path);
            if (value === undefined || value === null || value === false) continue;
            if (!entry.version) signals[entry.path] = "present";
            else if (["string", "number"].includes(typeof value)) {
              const match = /^v?([0-9]{1,4}(?:\.[0-9]{1,4}){0,3}(?:[-+][a-z0-9.-]{1,20})?)$/i.exec(String(value));
              if (match) signals[entry.path] = match[1];
            }
          } catch { /* Host objects and proxies can reject property inspection. */ }
        }
        const hints = new Set();
        if (typeof document !== "undefined") {
          const elements = document.querySelectorAll("*");
          for (let index = 0; index < Math.min(elements.length, 400); index++) {
            const names = Object.getOwnPropertyNames(elements[index]);
            if (names.some((name) => /^__react(?:Fiber|Container|Props)\$/.test(name))) hints.add("react");
            if (names.includes("__vue_app__") || names.includes("__vue__")) hints.add("vue");
          }
        }
        return { url: location.origin + location.pathname, signals, hints: [...hints] };
      }
    }
    return new RuntimeSignalCollector().collect();
  };

  static plan(catalog) {
    const meta = new Set();
    const dom = new Map();
    const js = new Map();
    for (const technology of catalog.technologies) {
      for (const pattern of technology.patterns) {
        if (pattern.source === "meta") meta.add(pattern.key);
        if (pattern.source === "dom") dom.set(pattern.key, { key: pattern.key, selector: pattern.selector, attribute: pattern.attribute });
        if (pattern.source === "js") js.set(pattern.key, { path: pattern.key, version: Boolean(pattern.versionGroup) });
      }
    }
    return { meta: [...meta], dom: [...dom.values()], js: [...js.values()] };
  }
}
