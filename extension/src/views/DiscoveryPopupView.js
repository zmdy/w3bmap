import { EntityClusterModel } from "../../explorer/src/models/EntityClusterModel.js";
import { GroupedListView } from "../../explorer/src/views/GroupedListView.js";
import { ConnectorReportView } from "./ConnectorReportView.js";
import { CrawlOptionsView } from "./CrawlOptionsView.js";
import { ProbeResultsView } from "./ProbeResultsView.js";
import { PopupView } from "./PopupView.js";
import { PopupAssets } from "../services/PopupAssets.js";

export class DiscoveryPopupView extends PopupView {
  constructor(api) {
    super();
    this.assets = new PopupAssets(api);
    this.connectorReport = new ConnectorReportView(this.get("php-checks"));
    this.crawlOptions = new CrawlOptionsView();
    this.probes = new ProbeResultsView(this.get("probe-results"), this.get("probe-context"));
    this.expanded = true;
    this.scan = null;
    this.latest = null;
    this.page = "";
    this.relatedClusters = new EntityClusterModel();
    this.entityClusters = new EntityClusterModel();
    this.relatedList = new GroupedListView(this.get("related-domains"), this.relatedClusters, (node) => this.clusterMember(node));
    this.entityList = new GroupedListView(this.get("site-entities"), this.entityClusters, (node) => this.clusterMember(node));
  }

  current(tab) {
    super.current(tab);
    try {
      const page = new URL(tab?.url);
      if (!["http:", "https:"].includes(page.protocol) || page.username || page.password) throw new Error("Unsupported page");
      page.search = "";
      page.hash = "";
      this.page = page.href;
      this.get("detection-page").textContent = this.page;
      this.get("site-status").textContent = page.protocol === "https:" ? "HTTPS" : "HTTP";
      const image = this.get("site-favicon");
      image.addEventListener("error", () => { image.src = this.assets.fallback(); }, { once: true });
      image.src = this.assets.favicon(this.page);
    } catch {
      this.page = "";
      this.get("site-favicon").src = this.assets.fallback();
    }
  }

  detection(result) {
    this.scan = result;
    super.detection(result);
    this.updateMetrics();
    const domains = this.get("related-domains");
    domains.replaceChildren();
    const related = (result.relatedDomains ?? []).map((domain) => ({ id: `domain:${domain}`, label: domain, type: "domain" }));
    this.relatedClusters.load(related);
    this.relatedList.render(related);
    this.renderEntities();
    if (!domains.childNodes.length) domains.textContent = "No external domains found in this snapshot.";
    this.get("site-overview").textContent = `${new URL(result.page).hostname} · ${result.technologies.length} technology indicators. ${result.runtimeAvailable ? "DOM and JavaScript signals inspected." : "DOM signals inspected; JavaScript inspection unavailable."}`;
  }

  detectionError(message) {
    super.detectionError(message);
    this.scan = null;
    this.updateMetrics();
    this.renderEntities();
    this.get("related-domains").replaceChildren();
  }

  toggleTechnologies() {
    this.expanded = !this.expanded;
    this.get("technology-tools").hidden = !this.expanded;
    if (!this.expanded) this.get("technology-search").value = "";
    this.filterTechnologies(this.get("technology-search").value);
  }

  filterTechnologies(query = "") {
    this.get("technology-tools").hidden = !this.expanded;
    const container = this.get("detected-technologies");
    container.replaceChildren();
    const filtered = this.detected.filter((technology) =>
      `${technology.name} ${technology.category} ${technology.version ?? ""}`.toLowerCase().includes(query.toLowerCase()));
    for (const technology of this.expanded ? filtered : filtered.slice(0, 5)) container.append(this.technologyRow(technology));
    if (!filtered.length) container.textContent = this.detected.length ? "No matching technologies." : "No supported technology indicators found.";
    const label = document.createElement("span");
    label.textContent = this.expanded ? "Show fewer technologies" : "View all technologies";
    const arrow = document.createElement("span");
    arrow.className = "ui-icon";
    arrow.dataset.icon = this.expanded ? "up" : "right";
    arrow.setAttribute("aria-hidden", "true");
    this.get("view-technologies").replaceChildren(label, arrow);
    this.get("view-technologies").setAttribute("aria-expanded", String(this.expanded));
  }

  technologyRow(technology) {
    const row = document.createElement("details");
    row.className = "technology-row";
    const summary = document.createElement("summary");
    const image = document.createElement("img");
    image.className = "technology-icon";
    image.alt = "";
    image.width = 25;
    image.height = 25;
    image.src = this.assets.technology(technology.id);
    const name = document.createElement("span");
    name.className = "technology-name";
    name.textContent = technology.name;
    const category = document.createElement("span");
    category.className = "technology-category";
    category.textContent = technology.category ?? "Other";
    const arrow = document.createElement("span");
    arrow.className = "ui-icon technology-chevron";
    arrow.dataset.icon = "right";
    arrow.setAttribute("aria-hidden", "true");
    summary.append(image, name, category, arrow);
    const evidence = document.createElement("p");
    evidence.className = "technology-evidence";
    const signal = technology.evidence;
    const indicator = signal.detection_type === "implied" ? `Implied by ${signal.implied_by}`
      : `${signal.indicator_type}${signal.key ? " · " + signal.key : ""}: ${signal.indicator}`;
    evidence.textContent = `${technology.version ? "Version " + technology.version : "Version unknown"} · ${Math.round(technology.confidence * 100)}% confidence. ${indicator}`;
    row.append(summary, evidence);
    return row;
  }

  clusterMember(node) {
    const row = document.createElement("div");
    row.className = "cluster-member";
    const label = document.createElement("span");
    label.textContent = node.label;
    if (node.type === "technology") {
      const image = document.createElement("img");
      image.src = this.assets.technology(node.id.replace(/^technology:/, ""));
      image.alt = "";
      image.width = image.height = 20;
      row.append(image);
    }
    row.append(label);
    return row;
  }

  renderEntities() {
    const nodes = (this.latest?.page === this.page ? this.latest?.entities : null) ?? this.scan?.entities ?? [];
    const signature = JSON.stringify(nodes);
    if (signature !== this.entitySignature) {
      this.entitySignature = signature;
      this.entityClusters.load(nodes);
    }
    this.entityList.render(nodes);
    this.get("site-entities-note").textContent = nodes.length
      ? "Similarity groups only. Expand a group to see its findings; use Graph Explorer for evidence and relationships."
      : "Inspect or analyze this page to see grouped findings. IPs and certificates require PHP enrichment.";
  }

  setEntityGroups(open) {
    this.entityClusters.setAll(open);
    this.renderEntities();
  }

  state(state) {
    this.crawlOptions.state(state.crawl);
    super.state(state);
    this.latest = state.latest;
    this.connectorReport.render(state.progress?.connector ?? this.latest?.connector, state.progress);
    this.renderEntities();
    this.get("recent-empty").hidden = Boolean(state.latest);
    const connectorActive = Boolean(state.connectorEnabled);
    this.get("tab-php").hidden = !connectorActive;
    if (!connectorActive && !this.get("panel-php").hidden) {
      this.selectTab("page");
    }
    if (this.get("menu-append-page")) {
      this.get("menu-append-page").disabled = !(state.latest && this.page);
    }
    this.get("connector-state").textContent = state.connectorEnabled ? "Analyze includes server checks" : "Browser collection only";
    this.get("connector-dot").classList.toggle("enabled", state.connectorEnabled);
    this.get("graph-label").textContent = state.latest && state.latest.page !== this.page ? "Open last saved graph" : "Open in Graph Explorer";
    this.get("open-graph").title = state.latest ? `Saved collection: ${state.latest.target}` : "";
    this.updateMetrics();
  }

  readCrawl() { return this.crawlOptions.read(); }

  updateMetrics() {
    const saved = this.latest?.page === this.page ? this.latest : null;
    const metrics = saved?.metrics ?? this.scan?.metrics;
    this.get("page-count").textContent = String(metrics?.pages ?? "—");
    this.get("domain-count").textContent = String(metrics?.domains ?? "—");
    this.get("ip-count").textContent = String(metrics?.ips ?? "—");
    this.get("metrics-note").textContent = saved ? "Counts from the saved collection for this page." : "Page references only · IPs require a full collection.";
  }

  notice(text, error = false) {
    super.notice(text, error);
    this.get("notice").hidden = !text;
  }

  busy(value) {
    this.get("analyze-button").disabled = value;
    this.get("analyze-label").textContent = value ? "Analyzing page…" : "Analyze this page";
    this.get("main").setAttribute("aria-busy", String(value));
  }

  selectTab(name, focus = false) {
    if (name === "php" && this.get("tab-php").hidden) {
      name = "page";
    }
    for (const tab of ["page", "site", "related", "php", "recent"]) {
      const selected = tab === name;
      this.get(`tab-${tab}`).setAttribute("aria-selected", String(selected));
      this.get(`tab-${tab}`).tabIndex = selected ? 0 : -1;
      this.get(`panel-${tab}`).hidden = !selected;
    }
    if (focus) this.get(`tab-${name}`).focus();
    this.get("main").scrollTop = 0;
    this.menu(false);
  }

  menu(open) {
    this.get("more-menu").hidden = !open;
    for (const id of ["more-options", "header-menu", "scan-options"]) this.get(id).setAttribute("aria-expanded", String(open));
  }
}
