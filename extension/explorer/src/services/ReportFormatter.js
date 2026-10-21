/**
 * Renders a report model as plain text, Markdown or Mermaid. Every format
 * opens with the same executive summary, so a pasted report carries what the
 * collection contains and whether filters narrowed it, not just a list.
 */
export class ReportFormatter {
  static FORMATS = [
    ["text", "Plain list"],
    ["markdown", "Markdown list"],
    ["table", "Markdown table"],
    ["mermaid", "Mermaid diagram"],
  ];
  static MERMAID_NODES = 80;

  render(report, format = "text") {
    const method = { text: "text", markdown: "markdown", table: "table", mermaid: "mermaid" }[format];
    if (!method) throw new Error(`Unknown report format: ${format}.`);
    return this[method](report).replace(/\n*$/, "\n");
  }

  extension(format) {
    return format === "mermaid" ? "mmd" : format === "text" ? "txt" : "md";
  }

  scope(report) {
    return report.filtered
      ? "visible under the current filters"
      : "in the complete collection";
  }

  count(value) {
    return Number(value).toLocaleString("en-US");
  }

  date(report) {
    return report.generatedAt.replace(/\.\d+Z$/, "Z");
  }

  // Plain text ------------------------------------------------------------

  text(report) {
    const lines = [
      `w3bm@p · ${report.target}`,
      `${this.count(report.total)} entities ${this.scope(report)} · ${this.date(report)}`,
      "",
      report.figures.map(([label, value]) => `${label}: ${this.count(value)}`).join(" · "),
      "",
    ];
    if (report.empty) return [...lines, this.nothing(report)].join("\n");
    if (report.shape === "tree") {
      for (const root of report.roots) this.branch(root, 0, lines);
      return lines.join("\n");
    }
    for (const section of report.sections) {
      lines.push(`${section.type} ${section.label} (${this.count(section.count)})`);
      for (const item of section.items) lines.push(`- ${item.label}`);
      if (section.hidden) lines.push(`- … ${this.count(section.hidden)} more`);
      lines.push("");
    }
    return lines.join("\n");
  }

  branch(folder, depth, lines) {
    const indent = "  ".repeat(depth);
    lines.push(`${indent}${folder.label}/ (${this.count(folder.count)})`);
    for (const child of folder.children) {
      if (child.kind === "folder") this.branch(child, depth + 1, lines);
      else lines.push(`${indent}  - ${child.url ?? child.label}`);
    }
  }

  // Markdown --------------------------------------------------------------

  markdown(report) {
    const lines = [
      `# Site report · ${report.target}`,
      "",
      `${this.count(report.total)} entities ${this.scope(report)}, collected on ${this.date(report)}.`,
      "",
      ...report.figures.map(([label, value]) => `- **${label}:** ${this.count(value)}`),
      "",
    ];
    if (report.empty) return [...lines, this.nothing(report)].join("\n");
    if (report.shape === "tree") {
      lines.push("## Folders", "");
      for (const root of report.roots) this.markdownBranch(root, 0, lines);
      return lines.join("\n");
    }
    for (const section of report.sections) {
      lines.push(`## ${section.type} · ${section.label} (${this.count(section.count)})`, "");
      for (const item of section.items) lines.push(`- ${this.escape(item.label)}`);
      if (section.hidden) lines.push(`- _${this.count(section.hidden)} more not listed_`);
      lines.push("");
    }
    return lines.join("\n");
  }

  markdownBranch(folder, depth, lines) {
    const indent = "  ".repeat(depth);
    lines.push(`${indent}- **${this.escape(folder.label)}/** (${this.count(folder.count)})`);
    for (const child of folder.children) {
      if (child.kind === "folder") this.markdownBranch(child, depth + 1, lines);
      else lines.push(`${indent}  - ${this.escape(child.url ?? child.label)}`);
    }
  }

  // Markdown table --------------------------------------------------------

  table(report) {
    const lines = [
      `# Site report · ${report.target}`,
      "",
      `${this.count(report.total)} entities ${this.scope(report)}, collected on ${this.date(report)}.`,
      "",
      "| Figure | Count |",
      "| --- | ---: |",
      ...report.figures.map(([label, value]) => `| ${label} | ${this.count(value)} |`),
      "",
    ];
    if (report.empty) return [...lines, this.nothing(report)].join("\n");
    if (report.shape === "tree") {
      lines.push("| Folder | Items | Depth |", "| --- | ---: | ---: |");
      for (const root of report.roots) this.tableBranch(root, 0, lines);
      return lines.join("\n");
    }
    lines.push("| Type | Group | Items | Findings |", "| --- | --- | ---: | --- |");
    for (const section of report.sections) {
      const findings = section.items.map((item) => this.escape(item.label)).join(", ");
      const more = section.hidden ? `, … ${this.count(section.hidden)} more` : "";
      lines.push(
        `| ${section.type} | ${this.escape(section.label)} | ${this.count(section.count)} | ${findings}${more} |`,
      );
    }
    return lines.join("\n");
  }

  tableBranch(folder, depth, lines) {
    lines.push(
      `| ${"— ".repeat(depth)}${this.escape(folder.label)}/ | ${this.count(folder.count)} | ${depth} |`,
    );
    for (const child of folder.folders ?? []) this.tableBranch(child, depth + 1, lines);
  }

  // Mermaid ---------------------------------------------------------------

  mermaid(report) {
    const lines = [
      `%% w3bm@p · ${report.target} · ${this.count(report.total)} entities ${this.scope(report)}`,
      `%% Generated ${this.date(report)}`,
      "flowchart LR",
      `  root["${this.label(report.target)}<br/>${this.count(report.total)} entities"]`,
    ];
    if (report.empty) return [...lines, `  root --> empty["No findings"]`].join("\n");
    const budget = { left: ReportFormatter.MERMAID_NODES, skipped: 0 };
    if (report.shape === "tree") {
      for (const [index, root] of report.roots.entries())
        this.mermaidBranch(root, `r${index}`, "root", lines, budget);
    } else {
      for (const [index, section] of report.sections.entries()) {
        if (budget.left <= 0) {
          budget.skipped += section.count;
          continue;
        }
        const id = `g${index}`;
        budget.left--;
        lines.push(
          `  ${id}["${this.label(section.type)} · ${this.label(section.label)}<br/>${this.count(section.count)}"]`,
          `  root --> ${id}`,
        );
        for (const [position, item] of section.items.entries()) {
          if (budget.left <= 0) {
            budget.skipped += section.count - position;
            break;
          }
          budget.left--;
          lines.push(`  ${id}_${position}["${this.label(item.label)}"]`, `  ${id} --> ${id}_${position}`);
        }
      }
    }
    if (budget.skipped)
      lines.push(
        `  more["${this.count(budget.skipped)} more not drawn"]`,
        "  root -.-> more",
      );
    return lines.join("\n");
  }

  mermaidBranch(folder, id, parent, lines, budget) {
    if (budget.left <= 0) {
      budget.skipped += folder.count;
      return;
    }
    budget.left--;
    lines.push(
      `  ${id}["${this.label(folder.label)}/<br/>${this.count(folder.count)}"]`,
      `  ${parent} --> ${id}`,
    );
    for (const [index, child] of folder.children.entries()) {
      if (budget.left <= 0) {
        budget.skipped += folder.children.length - index;
        return;
      }
      if (child.kind === "folder") {
        this.mermaidBranch(child, `${id}_${index}`, id, lines, budget);
        continue;
      }
      budget.left--;
      lines.push(
        `  ${id}_${index}["${this.label(child.url ?? child.label)}"]`,
        `  ${id} --> ${id}_${index}`,
      );
    }
  }

  nothing(report) {
    return report.filtered
      ? "No entities match the current filters."
      : "This collection has no entities.";
  }

  /** Table cells and list items must not break the Markdown they sit in. */
  escape(value) {
    return String(value).replaceAll("|", "\\|").replace(/\r?\n/g, " ");
  }

  /** Mermaid labels are quoted, so quotes and brackets are replaced. */
  label(value) {
    return String(value)
      .replace(/\r?\n/g, " ")
      .replaceAll('"', "'")
      .replace(/[[\]{}<>]/g, " ")
      .slice(0, 120)
      .trim();
  }
}
