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

## Export and privacy

**Export JSON** downloads the complete imported document, including entities hidden
by filters, errors, and module results. Canvas positions, selection, and layout
are not added to the shared contract. Exports from the sample remain synthetic.

Imported content is treated as plain data and rendered with DOM text APIs. URLs
inside it are displayed without automatically fetching or opening them. Renderer
IDs are namespaced separately for entities and relationships to prevent collisions.

Collection content remains in browser memory: no uploads, accounts, browser storage,
or backend persistence are used. Reloading resets the workspace to the sample;
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
└── tests/graph.test.js
```

Project application code uses classes and MVC. Validator and file services are
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
queries are not implemented. The planned Chrome extension can reuse the models,
views, services, and graph contract when it is built.
