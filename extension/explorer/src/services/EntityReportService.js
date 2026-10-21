import { EntityGroupingService } from "./EntityGroupingService.js";

/**
 * Builds the report model behind Copy: an executive summary of the collection
 * followed by the sections the open tab presents. It states the collection and
 * whether filters are narrowing it, so a copied report never implies findings
 * that are being hidden. Rendering belongs to ReportFormatter.
 */
export class EntityReportService {
  static MAX_ITEMS = 50;

  /** The report for the Graph and Entities tabs: similarity groups. */
  fromGroups(groups, context = {}) {
    return this.report(
      {
        shape: "groups",
        sections: groups.map((group) => ({
          label: group.label,
          type: EntityGroupingService.LABELS[group.type] ?? group.type,
          count: group.members.length,
          items: group.members
            .slice(0, EntityReportService.MAX_ITEMS)
            .map((member) => ({ label: member.label, detail: member.id })),
          hidden: Math.max(0, group.members.length - EntityReportService.MAX_ITEMS),
        })),
      },
      context,
    );
  }

  /** The report for Tree view: the folder hierarchy, kept as a tree. */
  fromTree(roots, context = {}) {
    return this.report({ shape: "tree", roots, sections: [] }, context);
  }

  report(body, { target = "", total = 0, filtered = false, overview = null, now = new Date() } = {}) {
    return {
      ...body,
      target: target || "Collection",
      generatedAt: now.toISOString(),
      total,
      filtered,
      figures: this.figures(overview, total),
      empty: body.shape === "tree" ? !body.roots?.length : !body.sections.length,
    };
  }

  /** The executive figures, in the order a reader scans them. */
  figures(overview, total) {
    if (!overview) return [["Entities", total]];
    const types = Object.entries(overview.types)
      .filter(([, count]) => count > 0)
      .map(([type, count]) => [
        EntityGroupingService.LABELS[type] ?? type,
        count,
      ]);
    return [
      ["Entities", overview.entities],
      ["Relationships", overview.relationships],
      ["Hosts", overview.hosts],
      ...types,
      ["Links detected", overview.links],
      ["Resource references", overview.resources],
      ["Inferred relationships", overview.inferred],
      ["Module results", overview.modules],
      ["Module errors", overview.errors],
    ];
  }
}
