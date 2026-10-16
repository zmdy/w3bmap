export class FingerprintService {
  constructor(catalog) {
    this.catalog = catalog;
    this.compiled = new Map();
  }

  candidates(snapshot, pattern) {
    switch (pattern.source) {
      case "resource": return (snapshot.resources ?? []).map((item) => item.url);
      case "script": return (snapshot.resources ?? []).filter((item) => item.kind === "script").map((item) => item.url);
      case "generator": return snapshot.generators ?? [];
      case "hint": return snapshot.hints ?? [];
      case "meta": return snapshot.meta?.[pattern.key] ?? [];
      case "dom": return snapshot.dom?.[pattern.key] ?? [];
      case "js": return snapshot.js?.[pattern.key] ? [snapshot.js[pattern.key]] : [];
      default: return [];
    }
  }

  match(pattern, value) {
    if (typeof value !== "string") return null;
    value = value.slice(0, 2048);
    if (pattern.regex) {
      if (!this.compiled.has(pattern.regex)) this.compiled.set(pattern.regex, new RegExp(pattern.regex, "i"));
      return this.compiled.get(pattern.regex).exec(value);
    }
    const expected = String(pattern.equals ?? pattern.contains ?? "").toLowerCase();
    return (pattern.equals !== undefined ? value.toLowerCase() === expected : value.toLowerCase().includes(expected)) ? [value] : null;
  }

  detect(snapshot) {
    const matches = new Map();
    const priorities = { js: 5, dom: 4, generator: 3, meta: 3, script: 2, resource: 1, hint: 0 };
    for (const technology of this.catalog.technologies) {
      const signals = [];
      let version = null;
      let priority = -1;
      for (const pattern of technology.patterns) {
        for (const value of this.candidates(snapshot, pattern)) {
          const matched = this.match(pattern, value);
          if (!matched) continue;
          signals.push({ indicator_type: pattern.source, indicator: value.slice(0, 2048), ...(pattern.key ? { key: pattern.key } : {}) });
          const candidate = pattern.versionGroup ? matched[pattern.versionGroup] : null;
          if (candidate && /^[0-9]{1,4}(?:\.[0-9]{1,4}){0,3}(?:[-+][a-z0-9.-]{1,20})?$/i.test(candidate) && priorities[pattern.source] > priority) {
            version = candidate;
            priority = priorities[pattern.source];
          }
          break;
        }
      }
      if (!signals.length) continue;
      const confidence = Math.min(0.99, technology.confidence + 0.03 * (new Set(signals.map((signal) => signal.indicator_type)).size - 1));
      matches.set(technology.id, {
        id: technology.id, name: technology.name, category: technology.category ?? "Other",
        website: technology.website ?? "", version, confidence,
        evidence: { page: snapshot.url, ...signals[0], category: technology.category ?? "Other", version,
          detection_type: "direct", indicators: signals.slice(0, 8) },
      });
    }
    // Dependencies are separate inferences and never inherit a parent's version.
    for (const technology of this.catalog.technologies) {
      if (!matches.has(technology.id)) continue;
      for (const id of technology.implies ?? []) {
        if (matches.has(id)) continue;
        const dependency = this.catalog.technologies.find((item) => item.id === id);
        if (!dependency) continue;
        matches.set(id, { id, name: dependency.name, category: dependency.category, website: dependency.website,
          version: null, confidence: 0.6,
          evidence: { page: snapshot.url, category: dependency.category, version: null,
            detection_type: "implied", implied_by: technology.name, indicator_type: "dependency", indicator: technology.name } });
      }
    }
    return [...matches.values()];
  }
}
