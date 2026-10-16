export class PopupView {
  constructor() {
    this.get("result").hidden = true;
  }
  get(id) {
    return document.getElementById(id);
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
