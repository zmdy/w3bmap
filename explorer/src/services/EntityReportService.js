import { EntityGroupingService } from "./EntityGroupingService.js";

/**
 * Renders what a workspace tab shows as plain text for the clipboard. Each
 * report states the collection and whether filters are narrowing it, so a
 * copied list never implies findings that are being hidden.
 */
export class EntityReportService {
  /** The grouped entity list shared by the Graph and Entities tabs. */
  text(groups, { target = "", total = 0, filtered = false } = {}) {
    const lines = this.heading(target, total, filtered);
    for (const group of groups) {
      const type = EntityGroupingService.LABELS[group.type] ?? group.type;
      lines.push(`${type} ${group.label} (${group.members.length})`);
      for (const member of group.members) lines.push(`- ${member.label}`);
      lines.push("");
    }
    if (!groups.length) lines.push("No entities match the current filters.", "");
    return lines.join("\n").trimEnd() + "\n";
  }

  /** The folder tree, indented exactly as Tree view presents it. */
  tree(roots, { target = "", total = 0, filtered = false } = {}) {
    const lines = this.heading(target, total, filtered);
    for (const root of roots) this.branch(root, 0, lines);
    if (!roots.length) lines.push("No entities match the current filters.", "");
    return lines.join("\n").trimEnd() + "\n";
  }

  branch(folder, depth, lines) {
    const indent = "  ".repeat(depth);
    lines.push(`${indent}${folder.label}/ (${folder.count})`);
    for (const child of folder.children) {
      if (child.kind === "folder") this.branch(child, depth + 1, lines);
      else lines.push(`${indent}  - ${child.url ?? child.label}`);
    }
  }

  heading(target, total, filtered) {
    const lines = [];
    if (target) lines.push(`w3bm@p · ${target}`);
    lines.push(
      `${total.toLocaleString("en-US")} entities${filtered ? " visible under the current filters" : ""}`,
      "",
    );
    return lines;
  }
}
