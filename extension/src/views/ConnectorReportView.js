export class ConnectorReportView {
  static MODULES = { dns: "DNS", rdap: "Registration (RDAP)", headers: "HTTP headers", ssl: "TLS certificate",
    technologies: "Technologies", robots: "robots.txt", sitemap: "Sitemap", links: "Page links",
    status: "HTTP status checks" };
  static STATUS = { pending: "Waiting", running: "Running", complete: "Complete", failed: "Failed",
    partial: "Partial", unavailable: "Unavailable", no_result: "No result", not_configured: "Not configured" };

  constructor(container) { this.container = container; }

  render(report, progress) {
    this.container.hidden = !report && !progress;
    if (this.container.hidden) return;
    const summary = document.createElement("summary");
    const arrow = document.createElement("span");
    arrow.className = "ui-icon";
    arrow.dataset.icon = "right";
    arrow.setAttribute("aria-hidden", "true");
    const heading = document.createElement("strong");
    heading.textContent = "Server checks";
    const status = document.createElement("span");
    status.className = "php-status";
    status.textContent = progress ? "Running" : ConnectorReportView.STATUS[report?.status] ?? "Unknown";
    summary.append(arrow, heading, status);
    const content = document.createElement("div");
    content.className = "php-report-content";
    const message = document.createElement("p");
    message.textContent = progress?.message ?? report?.message ?? (report?.status === "not_configured"
      ? "Browser findings only. Configure a PHP connector to include server checks."
      : report?.connection === "connected"
        ? report.status === "complete" ? "PHP connection verified. Results are included in the saved graph and JSON."
          : "PHP connection verified. Available findings and module errors were saved."
        : "PHP connection could not be verified. Browser findings have been preserved.");
    content.append(message);
    if (report?.crawl) {
      const crawl = document.createElement("p");
      crawl.textContent = report.crawl.status === "running" ? `Recursive analysis: depth ${report.crawl.depth}, ${report.crawl.scope} scope.`
        : `Recursive analysis: ${report.crawl.visitedPages ?? 0} pages, ${report.crawl.visitedHosts ?? 0} hosts. Stop reason: ${report.crawl.stopReason ?? report.crawl.status}.`;
      content.append(crawl);
    }
    for (const entry of report?.modules ?? []) {
      const row = document.createElement("div");
      row.className = "php-module";
      const label = document.createElement("span");
      label.textContent = ConnectorReportView.MODULES[entry.module] ?? entry.module;
      const value = document.createElement("span");
      value.textContent = ConnectorReportView.STATUS[entry.status] ?? "Unknown";
      value.dataset.status = entry.status;
      row.append(label, value);
      if (entry.message) {
        const detail = document.createElement("small");
        detail.textContent = entry.message;
        row.append(detail);
      }
      content.append(row);
    }
    // Keep the disclosure state while polling updates its contents.
    this.container.replaceChildren(summary, content);
  }
}
