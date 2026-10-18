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

## Explore

- Select a node in **Graph**, or a button in the keyboard-accessible **Entities**
  list, to view its source, time, confidence, evidence, and visible relationships.
- Select a graph edge or a relationship in the Inspector to inspect that edge's
  evidence and jump to either endpoint.
- Search labels, IDs, and types using literal, case-insensitive text. Search narrows
  the visible entities; only relationships between visible endpoints remain.
- Filter entity types, collection source, minimum confidence, and inferred edges.
  Type counts show the complete collection; the footer shows the visible subset.
- Choose force-directed, concentric, circle, or grid layout. Use the zoom and fit
  controls, scroll to zoom, and drag nodes or the background to arrange the view.
- Open **Collection** to inspect collection status, module errors, and raw module
  results. Large evidence/result previews are truncated; the full data stays in
  the export.
- Use arrow keys, Home, and End within the workspace and Inspector tab groups.
  All filters, entity buttons, relationship buttons, and dialog controls are
  keyboard-accessible. The guide also closes with Escape.

The Inspector shows observation times in the browser's local timezone while the
original timestamps are preserved in exported JSON.

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
│   ├── models/                   # Graph state, filters, synthetic sample
│   ├── views/                    # Canvas, workspace DOM, Inspector
│   ├── controllers/              # Interaction and import coordination
│   └── services/                 # Validation and local file IO
├── vendor/                      # Local browser libraries and notices
├── scripts/build-vendor.mjs      # Vendor/validator regeneration
└── tests/                       # Graph, grouping and synthetic UI fixtures
```

Project application code uses classes and MVC. Grouping, validator and file services are
dependencies of the controller, not separate MVC applications. Vendored libraries
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
preservation, sample validity, and interoperability with a PHP-produced document.
The compiled schema snapshot is checked against the repository schema.
Run `php tests/run.php` from the repository root to check the existing collectors.

Manual browser checks: import a CLI export, reject an invalid file, select nodes
and edges, search and reset, toggle inferred relationships, inspect module errors,
switch layouts, export with filters active, and verify desktop and narrow layouts.

## Current scope

Each import opens one collection. Multiple-file merging, automatic cross-run
correlation, persistence of graph positions, PNG export, and direct connector
queries inside the Explorer are not implemented. The Chrome extension packages
this interface and opens a collection from trusted `chrome.storage.session` using
a random ID in the URL fragment. It validates and loads the document locally;
an expired ID shows an error rather than opening a different collection. The
standalone HTTP version never reads extension storage. See [extension.md](extension.md).
