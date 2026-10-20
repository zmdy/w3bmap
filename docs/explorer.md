# Graph Explorer

The Explorer is a local-first static browser application. It imports JSON exports
from the CLI or PHP connector, validates them against the shared schema, and
displays their entities and relationships using Cytoscape.js. It makes no direct
requests to scan targets or contact the connector.

## Open the Explorer

From the repository root:

```sh
php -S 127.0.0.1:8081 -t explorer
```

Open `http://127.0.0.1:8081/` in a modern browser. The application only needs a
static HTTP server: PHP is one convenient way to serve it, not a required backend.
`node scripts/serve-explorer.mjs` serves the same directory on 127.0.0.1:8081 when
PHP is not available.
Opening `index.html` directly with `file://` is not supported because the application
uses JavaScript modules.

If the repository is already served by XAMPP, open its `/explorer/` directory.
No npm installation or build is needed to use the checked-in application. Browser
libraries and the compiled schema validator are included locally; no external
fonts, analytics, or CDN assets are loaded.

## Import discoveries

1. Export a graph with the CLI, for example:

   ```sh
   php cli/w3bmap.php --domain example.com --modules dns,headers,ssl --output collection.json
   ```

2. Click **Import collection** and select the file, or drag it into the workspace.
3. The Explorer validates JSON syntax, the shared Draft 2020-12 schema, unique
   entity IDs, and the existence of both endpoints of each relationship.
4. A valid import replaces the open collection and resets filters. A rejected
   import keeps the existing collection intact.

Limits are 16 MiB, 5,000 entities, and 15,000 relationships per document. API
capabilities, authentication errors, and environment diagnostics are metadata;
they cannot be imported as graph documents. Collections with `partial` or `failed`
status are accepted so their available findings and module errors remain visible.

The initial **Sample data** collection is synthetic, uses documentation domains
and IP ranges, and makes no network requests. Its deliberate example error shows
how partial collections are presented. Use **Clear collection** to start empty.

## Merging reports

A single investigation can combine reports produced by the CLI, the extension, and
the PHP connector, including runs against different targets.

1. Click **Merge reports** and select one or more JSON documents, or drop several
   files into the workspace at once.
2. Every document is validated before anything is merged. An invalid file aborts
   the operation, names its position, and leaves the open collection untouched.
3. The merged graph becomes the active collection and the header shows
   **INVESTIGATION** while more than one report is combined.

Entities are deduplicated by ID: confidence keeps the highest value, evidence fields
are combined, the most recent collection timestamp wins, and the more descriptive
label is preserved. Relationships are deduplicated by source, type, and target;
`observed` verification outranks `inferred`, and relationships whose endpoints are
absent from the merged graph are dropped. Module results are merged per module,
recursive traversal counters are summed with pages deduplicated by URL, and
identical errors are collapsed. The merged target lists the combined targets, the
status is `complete` only when every report is complete and `failed` only when all
of them failed, and the result is validated against the shared schema again before
it is displayed.

**Import collection** still replaces the open collection, so use it to start a new
investigation and **Merge reports** to extend the current one.

## Explore

- Select a node in **Graph**, an item in **Tree view**, or a button in the
  keyboard-accessible **Entities** list, to view its source, time, confidence,
  evidence, and visible relationships.
- **Copy list** in the Entities tab copies the visible entities as grouped plain
  text, in the same order and grouping the tab shows, and says when filters are
  narrowing the list. Use **Export JSON** for the complete collection.
- An entity with an address offers **Open resource**, which opens it in a new tab,
  and **Copy link**. The Explorer never requests the address itself.
- The investigation card shows the target site's favicon, under the same rule as
  the entity icons below.
- Every selection also shows **Connections**, counting that entity's relationships
  and its neighbours by type, and **Collection at a glance**, counting the
  entities, relationships, hosts, detected links, resource references, inferred
  relationships, module results, and module errors. The figures follow the active
  filters and say so when a filter is narrowing them.
- Select a graph edge or a relationship in the Inspector to inspect that edge's
  evidence and jump to either endpoint.
- Search labels, IDs, and types using literal, case-insensitive text. Search narrows
  the visible entities; only relationships between visible endpoints remain.
- Filter entity types, collection source, minimum confidence, and inferred edges.
  Type counts show the complete collection; the footer shows the visible subset.
- The default **By category** layout places technologies, pages, domains, IPs,
  certificates, and sitemaps in separate nearby regions around the target domain.
  Expanded groups retain their members inside their own boundaries. Positions
  are deterministic and do not change the collection or exported JSON.
- Selecting a node highlights its direct incoming and outgoing relationships and
  their endpoints; unrelated items fade. Selecting an edge highlights that edge
  and its endpoints. Group selection includes its members and their immediate
  neighbors. Click the canvas background to clear the highlight. This uses the
  currently visible graph, including summarized relationships in collapsed groups;
  it does not recursively highlight every reachable node in the collection.
- Choose category, force-directed, concentric, circle, or grid layout. Use the zoom and fit
  controls, scroll to zoom, and drag nodes or the background to arrange the view.
- Open **Collection** to inspect collection status, module errors, and raw module
  results. Large evidence/result previews are truncated; the full data stays in
  the export.
- Use arrow keys, Home, and End within the workspace and Inspector tab groups.
  All filters, entity buttons, relationship buttons, and dialog controls are
  keyboard-accessible. The guide also closes with Escape.

The Inspector shows observation times in the browser's local timezone while the
original timestamps are preserved in exported JSON.

## Tree view

**Tree view** presents the same collection as navigable folders. The site root
is the collection target; below it, every page and asset is placed under a folder
for each segment of its URL path, and each leaf keeps its complete URL and its
type tag. A final path segment that carries a file extension names the entity
itself, so `/css/site.css` sits inside a `css` folder instead of creating one.
Entities that have no URL path — technologies, subdomains, IP addresses,
certificates and sitemaps — are grouped into their own category folders. Inside a
category, entities are placed under the same similarity groups the graph uses, so
subdomains of one registrable domain share a `*.example.com` folder, technologies
share their category, addresses share their prefix and certificates share their
issuer. A group of one stays a direct child instead of a folder holding one item.

When a collection covers more than one site, as a merged investigation does, each
site gets its own folder under the root and its paths nest inside it. **Merge
sites** combines them into a single path tree, where one folder can hold pages
from several hosts, and **Split by site** restores the per-site folders. The
control appears only for a collection with more than one site; a single-site
collection never gains that folder level.

A folder is a URL path prefix, not an ownership claim: pages from different hosts
can share a path, so the host stays visible on every leaf and the folder's details
list the hosts it covers. Folders are sorted before entities and both are sorted
by name, so the same collection always produces the same tree. Large folders
render their first 25 children with a **+N more** control, and expansion state is
kept in the workspace, never written into the collection or the export.

Click a folder to inspect its contents and figures, or an entity to inspect it as
in the Graph view. Selecting an entity anywhere opens every folder on its path.
**Expand all** and **Collapse all** act on the whole tree. The active filters and
search apply to the tree exactly as they do to the graph.

## Icons

Entities carry the technology logo from the packaged Iconify catalog, and domains,
pages and sitemaps carry the site favicon. Favicons are page content, so they come
from Chrome's favicon cache and are only available when the Explorer is opened
from the extension. The standalone HTTP Explorer makes no third-party request and
shows the local fallback mark instead. Any image that fails to load falls back to
the entity's type dot.

## Collapsible groups

The Graph and Entities views share expansion state. Click a collapsed graph group
to expand it; click the expanded group's boundary or heading to collapse it.
In Entities, use each disclosure heading (Enter or Space also works). The sidebar
provides **Expand groups** and **Collapse groups** for the entire collection.
Groups with one member keep their normal individual graph node.

| Entity | Grouping rule |
| --- | --- |
| Domains | Registrable-domain boundary, then the longest suffix shared by the discovered hosts |
| Pages | Exact hostname of the page URL |
| Assets | Exact hostname of the asset URL |
| Technologies | Observed category; missing categories use Other technologies |
| IP addresses | IPv4 /24 or IPv6 /48 prefix |
| Certificates | Issuer organization or common name, when recorded |
| Sitemaps | Exact hostname of the sitemap URL |

For example, `api.simet.nic.br`, `ipv4-api.simet.nic.br` and
`ipv6-api.simet.nic.br` appear under `*.simet.nic.br`. `fonts.gstatic.com` and
`www.gstatic.com` appear under `*.gstatic.com`. Domain grouping uses the locally
bundled [tldts](https://github.com/remusao/tldts) public suffix parser, including
private suffixes, so unrelated `com.br` registrants or `github.io` tenants remain
separate. Labels use the complete collection and remain stable while filtering.
An apex may be listed alongside its subdomains; the wildcard heading is a visual
label, not a DNS wildcard record. Duplicate entity IDs are not counted twice.

Groups indicate similarity, not common ownership, an ASN, an actual assigned
subnet, or an additional collected relationship. Collapsed graph edges summarize
visible original relationships by direction, relation type and verification.
Their counts exclude filtered relationships; edges within a collapsed group are
hidden until expansion. Select a summary edge for guidance, then expand its
groups to inspect the original edges. Selecting an entity or original relationship
from the Inspector expands its containing groups automatically.

Filtering applies before graph projection. Group counts reflect visible members;
collection totals and exports still describe individual entities. Expansion state
lasts for the current collection and resets on import, clear, or reload. Groups
and summary edges never enter the shared JSON contract.

## Export and privacy

**Export JSON** downloads the complete imported document, including entities hidden
by filters, errors, and module results. Canvas positions, selection, and layout
are not added to the shared contract. Exports from the sample remain synthetic.

Imported content is treated as plain data and rendered with DOM text APIs. URLs
inside it are displayed without automatically fetching or opening them. Renderer
IDs are namespaced separately for entities and relationships to prevent collisions.

In the standalone Explorer, collection content remains in browser memory: no
uploads, accounts, browser storage, or backend persistence are used. Reloading resets the workspace to the sample;
export data before leaving if you need to keep it. Serving the application still
causes ordinary local HTTP requests for its own static assets.

## Source organization

```text
explorer/
├── index.html
├── app.js                       # Application bootstrap
├── style.css
├── assets/
├── src/
│   ├── models/                   # Graph state, filters, folder tree, sample
│   ├── views/                    # Canvas, tree, workspace DOM, Inspector
│   ├── controllers/              # Interaction and import coordination
│   └── services/                 # Validation, merging, tree, figures, icons, file IO
├── vendor/                      # Local browser libraries and notices
├── scripts/build-vendor.mjs      # Vendor/validator regeneration
└── tests/                       # Graph, grouping and synthetic UI fixtures
```

Project application code uses classes and MVC. Grouping, merging, validator and file
services are dependencies of the controller, not separate MVC applications. Vendored libraries
and generated code preserve their upstream structure.

## Maintenance and verification

Use Node.js 20.6+ for maintenance and PHP 8.1+ for the interoperability test.
From `explorer/`:

```sh
npm ci
npm test
```

After changing the shared schema or library versions, regenerate the committed
browser assets and rerun the tests:

```sh
npm run vendor
npm test
```

The tests cover schema and semantic rejection, resource limits, filtering, export
preservation, report merging and deduplication, folder tree construction,
collection figures, sample validity, and interoperability with a PHP-produced
document.
The compiled schema snapshot is checked against the repository schema.
Run `php tests/run.php` from the repository root to check the existing collectors.

Manual browser checks: import a CLI export, reject an invalid file, select nodes
and edges, search and reset, toggle inferred relationships, inspect module errors,
switch layouts, browse and expand the Tree view, merge several reports into one
investigation, export with filters active, and verify desktop and narrow layouts.

## Current scope

**Import collection** opens one collection and **Merge reports** combines several
into one investigation. Automatic cross-run correlation beyond shared entity IDs,
persistence of graph positions, PNG export, and direct connector queries inside the
Explorer are not implemented. The Chrome extension packages
this interface and opens a collection from trusted `chrome.storage.session` using
a random ID in the URL fragment. It validates and loads the document locally;
an expired ID shows an error rather than opening a different collection. The
standalone HTTP version never reads extension storage. See [extension.md](extension.md).
