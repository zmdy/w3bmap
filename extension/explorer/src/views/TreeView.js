import { Dom } from "./WorkspaceView.js";

/** Renders the folder tree. All interaction is delegated to the controller. */
export class TreeView {
  static TYPE_TAGS = {
    domain: "Domain",
    ip: "IP",
    page: "Page",
    technology: "Technology",
    certificate: "Certificate",
    sitemap: "Sitemap",
  };

  constructor(container, model, icons, onSelect, onToggle) {
    Object.assign(this, { container, model, icons, onSelect, onToggle });
    this.selectedId = null;
    this.container.addEventListener("click", (event) => this.click(event));
  }

  click(event) {
    const control = event.target.closest("[data-tree-id]");
    if (!control) return;
    const { treeId, treeKind } = control.dataset;
    if (treeKind === "more") {
      this.model.reveal(treeId);
      this.render();
      return;
    }
    if (treeKind === "twisty") {
      this.onToggle(treeId);
      return;
    }
    this.onSelect(treeKind, treeId);
  }

  image(source, type) {
    const image = document.createElement("img");
    image.className = "tree-image";
    image.width = 18;
    image.height = 18;
    image.alt = "";
    image.loading = "lazy";
    image.src = source;
    image.addEventListener(
      "error",
      () => {
        image.replaceWith(Dom.dot(type));
      },
      { once: true },
    );
    return image;
  }

  render() {
    const list = Dom.element("div", "tree-root");
    list.setAttribute("role", "tree");
    for (const root of this.model.roots) list.append(this.folder(root, 0));
    if (!this.model.roots.length)
      list.append(
        Dom.element(
          "p",
          "inspector-subtitle",
          "No entities match the current filters.",
        ),
      );
    this.container.replaceChildren(list);
  }

  folder(folder, depth) {
    const wrapper = Dom.element("div", "tree-branch");
    const open = this.model.isOpen(folder.id);
    const row = Dom.element("div", "tree-row tree-folder");
    row.style.setProperty("--tree-depth", String(depth));
    row.setAttribute("role", "treeitem");
    row.setAttribute("aria-expanded", String(open));

    const twisty = Dom.element("button", "tree-twisty");
    twisty.dataset.treeId = folder.id;
    twisty.dataset.treeKind = "twisty";
    twisty.setAttribute(
      "aria-label",
      `${open ? "Collapse" : "Expand"} ${folder.label}`,
    );
    twisty.append(Dom.icon(open ? "down" : "right"));

    const label = Dom.element("button", "tree-label");
    label.dataset.treeId = folder.id;
    label.dataset.treeKind = "folder";
    label.setAttribute("aria-pressed", String(this.selectedId === folder.id));
    label.classList.toggle("selected", this.selectedId === folder.id);
    label.append(
      Dom.icon(open ? "folder-open" : "folder"),
      Dom.element("strong", "tree-name", folder.label),
    );
    if (folder.site) label.append(Dom.element("span", "tree-tag", "Domain"));
    row.append(
      twisty,
      label,
      Dom.element("span", "tree-count", `(${folder.count})`),
    );
    wrapper.append(row);
    if (!open) return wrapper;

    const children = Dom.element("div", "tree-children");
    children.setAttribute("role", "group");
    const { items, hidden } = this.model.children(folder);
    for (const child of items)
      children.append(
        child.kind === "folder"
          ? this.folder(child, depth + 1)
          : this.entity(child, depth + 1),
      );
    if (hidden) {
      const more = Dom.element("button", "tree-more");
      more.dataset.treeId = folder.id;
      more.dataset.treeKind = "more";
      more.append(Dom.icon("plus"), Dom.element("span", "", `${hidden} more`));
      children.append(more);
    }
    wrapper.append(children);
    return wrapper;
  }

  entity(item, depth) {
    const row = Dom.element("div", "tree-row");
    row.style.setProperty("--tree-depth", String(depth));
    row.setAttribute("role", "treeitem");
    const button = Dom.element("button", "tree-label");
    button.dataset.treeId = item.node.id;
    button.dataset.treeKind = "entity";
    const selected = this.selectedId === item.node.id;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
    const source = this.icons.forNode(item.node);
    button.append(
      source ? this.image(source, item.type) : Dom.dot(item.type),
      Dom.element("span", "tree-name", item.url ?? item.label),
      Dom.element(
        "span",
        "tree-tag",
        TreeView.TYPE_TAGS[item.type] ?? item.type,
      ),
    );
    row.append(button);
    return row;
  }

  selection(id) {
    this.selectedId = id;
    for (const button of this.container.querySelectorAll("button[data-tree-id]")) {
      if (["more", "twisty"].includes(button.dataset.treeKind)) continue;
      const selected = button.dataset.treeId === id;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
  }
}
