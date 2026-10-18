import { EntityGroupingService } from "../services/EntityGroupingService.js";

export class GroupedListView {
  constructor(container, model, renderItem, onToggle = () => {}) {
    Object.assign(this, { container, model, renderItem, onToggle });
  }

  render(nodes) {
    const fragment = document.createDocumentFragment();
    for (const group of this.model.visible(nodes)) {
      const details = document.createElement("details");
      details.className = "entity-cluster";
      details.dataset.clusterId = group.id;
      details.open = this.model.isOpen(group.id);
      const summary = document.createElement("summary");
      const arrow = document.createElement("span");
      arrow.className = "ui-icon cluster-chevron";
      arrow.dataset.icon = "right";
      arrow.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "cluster-label";
      const type = document.createElement("small");
      type.textContent = EntityGroupingService.LABELS[group.type] ?? group.type;
      const name = document.createElement("strong");
      name.textContent = group.label;
      label.append(type, name);
      const count = document.createElement("span");
      count.className = "cluster-count";
      count.textContent = String(group.members.length);
      summary.append(arrow, label, count);
      const children = document.createElement("div");
      children.className = "cluster-members";
      // Populate on demand so large collections remain usable while collapsed.
      const populate = () => {
        if (details.open && !children.childNodes.length)
          for (const member of group.members) children.append(this.renderItem(member));
      };
      populate();
      details.append(summary, children);
      details.addEventListener("toggle", () => {
        if (!details.isConnected) return;
        populate();
        if (this.model.isOpen(group.id) === details.open) return;
        this.model.setOpen(group.id, details.open);
        this.onToggle(group.id, details.open);
      });
      fragment.append(details);
    }
    this.container.replaceChildren(fragment);
  }
}
