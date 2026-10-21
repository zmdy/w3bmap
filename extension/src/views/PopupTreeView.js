/**
 * Compact folder tree for the popup. It renders the same TreeModel the Site
 * Explorer uses, without the Explorer's canvas dependencies, so the popup stays
 * small. Expansion state lives in the model and never reaches the collection.
 */
export class PopupTreeView {
  constructor(container, model, onToggle) {
    Object.assign(this, { container, model, onToggle });
    this.container.addEventListener("click", (event) => {
      const control = event.target.closest("button[data-tree-id]");
      if (!control) return;
      this.onToggle(control.dataset.treeId);
    });
  }

  element(tag, className, text = "") {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  icon(name) {
    const icon = this.element("span", "ui-icon");
    icon.dataset.icon = name;
    icon.setAttribute("aria-hidden", "true");
    return icon;
  }

  render() {
    const list = this.element("div", "popup-tree");
    list.setAttribute("role", "tree");
    for (const root of this.model.roots) list.append(this.folder(root, 0));
    if (!this.model.roots.length)
      list.append(
        this.element("p", "empty-panel", "No findings to place in folders yet."),
      );
    this.container.replaceChildren(list);
  }

  folder(folder, depth) {
    const wrapper = this.element("div", "popup-branch");
    const open = this.model.isOpen(folder.id);
    const row = this.element("div", "popup-tree-row");
    row.style.setProperty("--tree-depth", String(depth));
    row.setAttribute("role", "treeitem");
    row.setAttribute("aria-expanded", String(open));
    const button = this.element("button", "popup-tree-label");
    button.dataset.treeId = folder.id;
    button.append(
      this.icon(open ? "down" : "right"),
      this.icon(open ? "folder-open" : "folder"),
      this.element("span", "popup-tree-name", folder.label),
    );
    row.append(button, this.element("span", "popup-tree-count", String(folder.count)));
    wrapper.append(row);
    if (!open) return wrapper;
    const children = this.element("div", "popup-tree-children");
    children.setAttribute("role", "group");
    const { items, hidden } = this.model.children(folder);
    for (const child of items)
      children.append(
        child.kind === "folder"
          ? this.folder(child, depth + 1)
          : this.entity(child, depth + 1),
      );
    if (hidden)
      children.append(
        this.element(
          "p",
          "popup-tree-more",
          `${hidden} more in Site Explorer.`,
        ),
      );
    wrapper.append(children);
    return wrapper;
  }

  entity(item, depth) {
    const row = this.element("div", "popup-tree-row popup-tree-leaf");
    row.style.setProperty("--tree-depth", String(depth));
    row.setAttribute("role", "treeitem");
    row.append(
      this.element("span", "popup-tree-name", item.url ?? item.label),
      this.element("span", "popup-tree-tag", item.type),
    );
    return row;
  }
}
