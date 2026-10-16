export class PageCollector {
  // Chrome serializes this function. All collection dependencies live inside it.
  static collectPage = function () {
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
        return {
          url,
          title: document.title.slice(0, 240),
          collected_at: new Date().toISOString(),
          links: [...links.values()],
          resources: [...resources.values()],
          generators,
          hints,
        };
      }
    }
    return new BrowserSnapshotCollector().collect();
  };
}
