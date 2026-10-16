export class PopupView {
  constructor() {
    this.get("result").hidden = true;
    this.detected = [];
  }
  get(id) {
    return document.getElementById(id);
  }

  detectionBusy(value) {
    this.get("rescan-button").disabled = value;
    this.get("detection-panel").setAttribute("aria-busy", String(value));
    if (value) this.get("detection-status").textContent = "Detecting technologies on this page…";
  }

  detection(result) {
    this.detected = result.technologies;
    this.get("detected-count").textContent = String(this.detected.length);
    this.get("detection-page").textContent = result.page;
    this.get("detection-status").textContent = `${result.catalogSize} technologies in catalog · ${result.runtimeAvailable ? "DOM + JavaScript signals" : "DOM signals; JavaScript inspection unavailable"}`;
    this.get("detection-status").setAttribute("role", "status");
    this.filterTechnologies(this.get("technology-search").value);
  }

  detectionError(message) {
    this.detected = [];
    this.get("detected-count").textContent = "0";
    this.get("detection-status").textContent = message;
    this.get("detection-status").setAttribute("role", "alert");
    this.get("detected-technologies").replaceChildren();
  }

  filterTechnologies(query = "") {
    const container = this.get("detected-technologies");
    container.replaceChildren();
    const groups = new Map();
    for (const technology of this.detected) {
      if (!`${technology.name} ${technology.category} ${technology.version ?? ""}`.toLowerCase().includes(query.toLowerCase())) continue;
      const category = technology.category ?? "Other";
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(technology);
    }
    for (const [category, technologies] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
      const section = document.createElement("section");
      section.className = "technology-group";
      const heading = document.createElement("h3");
      heading.textContent = category;
      section.append(heading);
      for (const technology of technologies.sort((a, b) => a.name.localeCompare(b.name))) {
        const row = document.createElement("details");
        row.className = "technology-row";
        const summary = document.createElement("summary");
        const name = document.createElement("span");
        name.textContent = technology.name;
        const version = document.createElement("span");
        version.className = "technology-version";
        version.textContent = technology.version ?? "Version unknown";
        summary.append(name, version);
        const evidence = document.createElement("p");
        evidence.className = "technology-evidence";
        const implied = technology.evidence.detection_type === "implied";
        const indicator = `${technology.evidence.indicator_type}${technology.evidence.key ? " · " + technology.evidence.key : ""}: ${technology.evidence.indicator}`;
        evidence.textContent = `${Math.round(technology.confidence * 100)}% confidence · ${implied ? "Implied by " + technology.evidence.implied_by : indicator}`;
        row.append(summary, evidence);
        section.append(row);
      }
      container.append(section);
    }
    if (!groups.size) container.textContent = this.detected.length ? "No matching technologies." : "No supported technology indicators found. Try again after the page finishes loading.";
  }

  notice(text, error = false) {
    this.get("notice").textContent = text;
    this.get("notice").classList.toggle("error", error);
    this.get("notice").setAttribute("role", error ? "alert" : "status");
  }

  current(tab) {
    let target = "Choose an HTTP or HTTPS page";
    try {
      if (/^https?:/.test(tab?.url)) target = new URL(tab.url).hostname;
    } catch {}
    this.get("current-target").textContent = target;
  }

  state(state) {
    this.get("connector-state").textContent = state.connectorEnabled
      ? "PHP enrichment enabled"
      : "Browser collection only";
    this.busy(state.running);
    const record = state.latest;
    this.get("result").hidden = !record;
    this.get("open-graph").disabled = !record;
    this.get("export-json").disabled = !record;
    this.get("clear-result").disabled = !record || state.running;
    if (!record) return;
    this.get("result-target").textContent = record.target;
    this.get("result-page").textContent = record.page;
    this.get("node-count").textContent = String(record.nodes);
    this.get("edge-count").textContent = String(record.edges);
    this.get("result-status").textContent = record.status;
    this.get("result-status").className = `badge ${record.status}`;
    const technologies = this.get("technologies");
    technologies.replaceChildren();
    for (const name of record.technologies.slice(0, 12)) {
      const badge = document.createElement("span");
      badge.className = "technology";
      badge.textContent = name;
      technologies.append(badge);
    }
    if (!record.technologies.length)
      technologies.textContent = "No technology indicators detected.";
    this.get("collection-errors").textContent = record.errors
      ? `${record.errors} collection error(s). Open the graph's Collection tab for details.`
      : "No collection errors reported.";
  }

  busy(value) {
    this.get("analyze-button").disabled = value;
    this.get("analyze-button").textContent = value
      ? "Analyzing page…"
      : "Analyze current page";
    this.get("main").setAttribute("aria-busy", String(value));
  }
}
