import { EntityGroupingService } from "./EntityGroupingService.js";

/**
 * Renders the visible entity list as plain text for the clipboard. It reports
 * exactly what the Entities tab shows, including the active grouping, so a
 * copied list never implies findings that the filters are hiding.
 */
export class EntityReportService {
  text(groups, { target = "", total = 0, filtered = false } = {}) {
    const lines = [];
    if (target) lines.push(`w3bm@p · ${target}`);
    lines.push(
      `${total.toLocaleString("en-US")} entities${filtered ? " visible under the current filters" : ""}`,
      "",
    );
    for (const group of groups) {
      const type = EntityGroupingService.LABELS[group.type] ?? group.type;
      lines.push(`${type} ${group.label} (${group.members.length})`);
      for (const member of group.members) lines.push(`- ${member.label}`);
      lines.push("");
    }
    if (!groups.length) lines.push("No entities match the current filters.", "");
    return lines.join("\n").trimEnd() + "\n";
  }
}
