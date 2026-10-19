# Chrome extension

The Manifest V3 extension detects technologies when its popup opens, analyzes the
current page on request, optionally enriches the result with a self-hosted PHP
connector, and opens a packaged Graph Explorer. It runs without a central backend,
account, or CDN.

## Installation

Requirements: Chrome 116+ and the complete `extension/` directory from this
repository. It already includes its runtime, icons, fingerprints, and Explorer.

1. Open `chrome://extensions/`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select the repository's `extension/` directory.
4. Pin **w3bm@p — Web Discovery** using Chrome's extensions menu.
5. Open a normal HTTP or HTTPS page and click the extension.

Technology detection starts automatically when you open the popup. Use **Analyze
current page** to save a full collection, then **Open graph** to inspect findings
or **Export JSON** to save the complete shared-schema document. The **Last
collection** panel always identifies the result's hostname and page; it may refer
to a different tab analyzed earlier.

Chrome internal pages, the Chrome Web Store, PDF viewers, and other restricted
surfaces cannot be inspected. Analysis is limited to the top frame and the current
DOM; it does not crawl other pages or inspect cross-origin frame contents.

## Technology detection

The popup follows four views: **This page** contains the active site's favicon,
technology list and discovery counters; **Site** explains current-site findings;
**Related** lists referenced external domains; **Recent** shows the latest saved
session collection. Recent is not a browsing-history archive. Graph/export actions
always use the saved collection; when it belongs to another page, the graph button
explicitly says **Open last saved graph**. **More options** provides rescan,
connector settings, and collection clearing. Tabs support arrow, Home, and End keys.

The layout stays within Chrome's 600px popup height with a scrolling content area
and fixed graph/export actions. The favicon uses Chrome's extension-origin
`_favicon` endpoint, not an external favicon service. Missing icons use a packaged
fallback. Favicons remain UI-only and are not included in collection exports.
The HTTPS/HTTP badge identifies the page protocol, not an observed HTTP status.

**Pages found** counts the active page and discovered link references, not visited
pages or every static asset. **Domains** counts distinct discovered hostnames,
including the current host and third parties; it does not claim they are all
subdomains. **IP addresses** remains unknown until a full collection is available,
then shows the number of collected IP entities. The connector footer indicates
configuration, not a live health check or proof that an endpoint is reachable.

All interface, application, graph, technology, and fallback icons come from
[Iconify collections](https://github.com/iconify/icon-sets): BoxIcons v2, SVG Logos,
and Simple Icons. The current catalog has 69 technology logos and 11 generic
Iconify fallbacks. Their original geometry is packaged locally; no third-party
logo/CDN request is made by the popup. See the bundled
[icon provenance](../extension/assets/technology-icons/README.md).

The **Technologies** panel belongs to the current page. It groups findings by
category, shows an explicit version when available, and supports filtering by
name, category, or version. Each category is a collapsible group containing
findings with local brand icons and category chips. Technology categories start
expanded; **Collapse technology groups** and **Expand technology groups** toggle
all categories. Expand an individual finding for its version, signal, and confidence.
**Version unknown** means no usable version was observed; the detector never
guesses a version from a technology name. **Detect again** reruns inspection,
which is useful after lazy loading or a client-side route change.

**Related** groups external hostnames under shared suffixes, such as
`*.simet.nic.br` and `*.gstatic.com`. Each heading shows the unique member count
and expands independently. **Site** lists all current-page findings in collapsible
groups: domains, pages by hostname, technologies by category, IPs by IPv4 /24 or
IPv6 /48 prefix, certificates by issuer, and sitemaps by hostname. It uses the saved
collection when it belongs to this page, otherwise the quick local snapshot.
PHP enrichment supplies IPs and certificates when available. An existing saved
collection is not replaced by a quick scan. Clearing it restores the quick findings.

Related and Site groups start collapsed. Native disclosure controls support mouse,
Enter and Space. Site also provides **Expand groups** and **Collapse groups**.
Groups organize findings without asserting ownership or affiliation. Counts and
exports keep individual records. See [Explorer grouping rules](explorer.md#collapsible-groups).
The shared grouping service and public suffix data are packaged locally, with no
additional network requests, permissions, or backend configuration.

The toolbar badge displays the detected count after inspection and clears when
the tab navigates. Detection runs on popup opening or explicit rescan, rather
than continuously monitoring every visited site. No additional permissions are
required. Quick detection stays local, does not call PHP, and does not overwrite
the latest saved graph. To keep these technologies in an export, run **Analyze
current page**, which performs a new snapshot and saves the full collection.

The bundled catalog contains **80 technology definitions**, including CMS,
ecommerce platforms, frameworks, libraries, analytics, payments, maps, security,
and support tools. Examples include WordPress, Shopify, Next.js, React, Vue,
Angular, jQuery, Bootstrap, Google Analytics, Stripe, and Cloudflare Turnstile.
This is a curated catalog, not Wappalyzer's full database or an equivalent
coverage guarantee. Minified applications that hide their markers/globals may
remain undetected. Resource URLs show references, not necessarily executing code.

Detection combines case-insensitive resource patterns, generator metadata, DOM
markers, approved version attributes, and approved JavaScript property paths.
The JavaScript probe runs in Chrome's MAIN world because page globals are not
visible in the extension's isolated world. It reads own data properties, skips
getters, and does not invoke framework methods. Only presence markers and bounded
numeric version strings are returned. DOM collection remains in the isolated
world. The runtime probe also checks property names on the first 400 DOM elements
for modern React/Vue markers, without reading framework state. If runtime
inspection fails, DOM findings remain available and the panel
reports reduced coverage. Navigation during inspection rejects stale results.

Multiple independent signal types slightly increase confidence, always below 1.
Runtime versions take priority over resource filenames. Next.js/Gatsby imply
React and Nuxt implies Vue; dependency findings are explicitly marked, have lower
confidence, and never inherit the parent's version. Technology signals and
versions are heuristic evidence that a page can spoof, not verified installation
facts. Category, version, direct/implied status, and individual indicators are
retained in graph evidence and JSON exports.

The detection approach references the
[WebAppAnalyzer specification](https://github.com/enthec/webappanalyzer), the
community continuation of Wappalyzer. Its source and fingerprint database use
GPL-3.0. This project does not bundle or copy that code/database; the matcher and
80 definitions are independently authored under this repository's MIT license.
The catalog is packaged locally and never downloads rules or executable code at
runtime. See [the catalog format](technology-catalog.md) to add definitions.

## Optional PHP connector

Deploy the [PHP connector](connector.md) on a server you control. Open its
`install.php` page to generate a token and save settings in a private `.env`. There is no shared project endpoint.

Open **Settings** in the extension:

1. Enter the final PHP file URL, such as `https://your-host.example/w3bmap.php`.
2. Enter the server's bearer token, using 32–256 visible ASCII characters.
3. Select enrichment modules. New settings select all eight modules: DNS, RDAP,
   HTTP headers, TLS, technologies, robots, sitemap, and links. Existing module
   selections are preserved.
4. Click **Save & test connection**. Chrome asks for access to the connector host;
   grant it to enable authenticated capability discovery.
5. Confirm the available modules shown in Settings, then click **Analyze this page**.

For development, HTTP is supported only for `localhost` and `127.0.0.1` after
enabling the corresponding setting. The server must also have
`W3BMAP_ALLOW_LOCAL_HTTP=1`. Remote endpoints require HTTPS. Endpoint URLs cannot
contain credentials, query parameters, or fragments; redirects are not followed.

Enrichment sends the analyzed page's hostname, selected module names, and bearer
token to the configured server. It does not send the browser's page body, links,
resources, title, cookies, or browsing history to the connector. PHP web modules
query the hostname's HTTPS homepage, which may differ from the current page's
path. The PHP authentication, request limits, and public-address policy still apply.

No connector is contacted until an endpoint is configured. A saved endpoint
now automatically opts into PHP checks on **Analyze**; the old separate `enabled`
flag is ignored, including for existing settings. Clear the endpoint or use
**Forget connector** for browser-only collection. Automatic popup detection and
**Detect technologies again** remain local and never call PHP.

Analyze captures the page, authenticates a capabilities request to the PHP
connector, requests the selected available modules in one analysis POST, validates
and merges the returned graph, and saves the combined collection. Only the active
page's hostname is analyzed, not every referenced domain. There is no port scan
or vulnerability scan. Unavailable modules are reported individually while
available checks still run. If the connector fails, local findings are retained
in a `partial` collection with an error; individual PHP errors are also retained.

The popup's collapsible **PHP checks** report shows connection and per-module
status, including errors. While Analyze runs, background-state polling updates
its current phase. Close and reopen the popup to see progress or the saved report.
The saved report is included under `results.browser.connector` without credentials
or the connector URL. Module results, evidence, and relationships are available in
the Graph Explorer and JSON export. A successful capability check is distinct from
a successful collection; individual modules can fail after authentication succeeds.
Existing collections without a report remain readable.

**Forget connector** clears its saved settings and token and removes the saved
host permission. Changing endpoints removes the previous connector-host permission
after the new configuration is saved.

## Permissions and storage

| Permission | Use |
| --- | --- |
| `activeTab` | Temporary access to the chosen tab when the user opens the extension |
| `scripting` | Execute the snapshot collector in the top frame's isolated world |
| `storage` | Local settings, optional remembered token, and session collection handoff |
| `favicon` | Display the current site's favicon through Chrome's `_favicon` endpoint |
| Optional connector host | Cross-origin authenticated requests only after a host grant |

The favicon permission can produce a Chrome permission warning when updating the
extension; no extra `tabs` or all-sites permission is added to suppress it.

There is no required all-sites host access or background page collection, or
`webRequest` listener, remotely loaded code, external messaging interface, or
web-accessible resource declaration. Optional patterns permit arbitrary HTTPS
connectors and the two development loopback hosts; Settings requests the exact
configured hostname, not a wildcard across sites. Host grants apply to all paths
and ports on that hostname/scheme; the client still uses the exact configured URL.

Settings persist in `chrome.storage.local`. API keys use `chrome.storage.session`
by default and must be reentered after restarting Chrome or reloading/updating the
extension. **Remember the API key on this device** opts into persistent local,
unencrypted key storage. Keys are never stored in Chrome sync storage or collection
exports. Local and session storage are restricted to trusted extension contexts.

Only the latest collection is kept, in session storage, with a 4 MiB JSON limit.
An opened Explorer reads it directly from trusted extension storage; graph data is
not placed in its URL or sent to the local XAMPP site. The URL contains only a
random collection ID. New analyses replace the saved result. Already-open graphs
keep their own in-memory copy; reopening an expired ID reports that it is stale.
Reloading/updating the extension or restarting the browser clears session results.
Export JSON to retain findings. **Clear last collection** removes the saved result.

## Collection and evidence

The browser snapshot contains:

- The current page's URL, title, and collection time.
- Up to 250 unique links from the first 2,000 anchor elements inspected.
- Up to 250 resources from DOM declarations and existing Performance Resource
  Timing entries, inspecting at most 1,000 entries of each kind.
- Generator metadata, approved DOM markers, and bounded technology-version
  attributes, plus presence/version signals from approved JavaScript globals.

Browser-observed URLs have queries and fragments removed, reject embedded
credentials and unsupported schemes, and are omitted if longer than 2,048
characters. Page titles are limited to 240 characters; generator values to 500.
The collector does not read page text, form values, cookie values, request bodies,
or resource contents. JavaScript property values are limited to presence or
numeric versions and arbitrary strings/objects are not exported. These omissions do not scrub sensitive values already
present in URL paths, titles, or generator metadata; review collections before sharing.

DOM resource declarations produce `references_resource` relationships. Existing
Performance entries produce `requests_resource` relationships, with matching
domain relationships and `observed_via` evidence. A request observation does not
prove a successful response or that a particular framework is executing.

Resources use the existing `page` node type with resource-kind evidence so output
remains compatible with schema 1.0. Technology matches from
`shared/fingerprints.json` are heuristic and have confidence below 1. Versions
are recorded only when explicitly observed. Header-based
signals are available through PHP enrichment; the extension does not intercept
network headers or reload the page to capture them.

When browser and PHP entities share IDs, they are deduplicated and both evidence
observations are retained. The outer document keeps `source: extension`; remote
entities/relationships retain probe attribution where they are the chosen finding.
Collection merging is limited to this local-plus-connector run; this is not a
general multi-file or cross-run correlation engine.

Requests time out after 25 seconds and response bodies are capped at 4 MiB.
Oversized or incompatible enrichment falls back to the local graph. The existing
result is kept if a new browser collection itself cannot be stored. Only one
analysis runs at a time. A popup can be closed and reopened to inspect the result,
but browser/extension shutdown can interrupt an in-progress analysis.

## Architecture and maintenance

```text
extension/
├── manifest.json
├── background.js                 # Service-worker bootstrap
├── popup/                        # Current-page analysis UI
├── options/                      # Connector configuration UI
├── src/
│   ├── models/                   # Settings and graph construction
│   ├── services/                 # Snapshot, fingerprints, transport, storage, merge
│   ├── controllers/              # Background, popup, settings coordination
│   └── views/                    # Popup and settings rendering
├── assets/                       # Project SVG and Chrome PNG icons
├── explorer/                     # Generated runtime copy of ../explorer/
├── fingerprints.json             # Generated copy of ../shared/fingerprints.json
├── scripts/build.mjs
└── tests/
```

Application logic uses classes and MVC. The isolated snapshot class is serialized
by Chrome with all its dependencies inside the injected function. It is a
collection service, not a separate MVC application. The background controller
accepts messages only from this extension's own pages. All imported/collected text
is rendered through DOM text APIs, and graph data is validated before storage and
again before Explorer display.

From `extension/`, using Node.js 20.6+:

```sh
npm run build
npm test
```

No npm install is required. The build copies the canonical Explorer and fingerprint
catalog. Commit the generated copies so a checkout remains ready to load. After
changing the shared schema, regenerate the Explorer validator using its own build
workflow first, then rebuild the extension. Do not edit generated copies directly.
The PNG icons are raster versions of Iconify's `bx:network-chart`. Generated SVGs
only wrap original Iconify geometry; application views do not draw SVG icons or
assemble SVG data URLs. The canonical catalog, source revision, licenses, asset
hashes, and build instructions are in [shared/iconify](../shared/iconify/README.md).

For the redesigned popup, `DiscoveryPopupView` specializes the shared rendering
view and `PopupAssets` resolves packaged technology icons and Chrome favicons.
`popup/popup.css` scopes the new layout without changing the settings page.
For a reproducible UI preview with mock Chrome APIs and synthetic findings, run
`node extension/tests/popup-preview.mjs` from the repository root and open the
printed localhost URL. This fixture cannot validate native permissions, Chrome's
favicon cache, or the real extension popup lifecycle.

The automated suite uses Chrome API fixtures and a separate VM for the injected
collector. It checks settings, permission-request ordering, token storage, request
limits, partial failures, graph compatibility, and session handoff. It does not
exercise actual Chrome installation or native permission prompts.

For an opt-in transport test against an installed PHP connector, set
`W3BMAP_INTEGRATION_ENDPOINT`, `W3BMAP_API_KEY`, and, for development loopback HTTP,
`W3BMAP_ALLOW_LOCAL_HTTP=1`, then run `npm run test:connector` from `extension/`.
The server must allow `example.com`; this test collects its public DNS records.
Chrome host permissions are substituted in this Node transport test.

Manual Chrome verification after loading unpacked: analyze a normal page, close
and reopen the popup during analysis, verify automatic category/version detection
and filtering, check badge reset on navigation, export JSON, open and filter the packaged
graph, grant/decline connector-host access, test capabilities, verify a private-network
target retains browser findings, clear the result, and forget the connector.

## Local connector troubleshooting

For a default XAMPP installation in `htdocs/w3bm@p`, the connector URL is
`http://localhost/w3bm%40p/probe/w3bmap.php`. Use the final PHP file, not
`install.php`, the Explorer URL, or a directory. Enable **Allow development HTTP
on localhost or 127.0.0.1** in extension settings and set
`W3BMAP_ALLOW_LOCAL_HTTP=1` in the private `.env`. Save and test the connection,
using the API key from that same installation. No server restart is needed.

HTTPS requires a certificate trusted by Chrome, including on localhost. An
untrusted XAMPP development certificate can cause a transport failure before PHP
receives the request. Choose local HTTP explicitly for development, or configure
a trusted certificate; the extension never downgrades or follows redirects
automatically. A transport error does not establish that authentication failed.

HTTP 401 means the endpoint responded but could not authenticate the bearer
header. Verify the key; PHP supports both server-variable and Apache header
lookup. HTTP 403 can indicate that local HTTP was not enabled in the private
`.env`; HTTP 404 indicates an incorrect file URL. If the extension reports missing
host access, save the connector settings again and grant access to that host.
Native Chrome permission handling and certificate trust must be checked in Chrome.

The connector client binds native `fetch` to the browser global object. Calling
an unbound native function as a service-object method can throw `Illegal invocation`
before any network request; the former generic transport message hid that error.
Version 0.4.2 fixes this receiver binding. Node's native fetch does not reproduce
this browser restriction, so maintenance includes a browser regression fixture:

```sh
node extension/tests/browser-transport-preview.mjs
```

Serve the repository and open the printed URL. Both Window and Worker tests should
report that PHP was reached (HTTP 401 is expected for the dummy fixture key).
No real API key is written into the fixture. This same-origin transport test does
not replace testing an installed extension's host permissions in Chrome.

For an opt-in test of the complete Analyze-to-PHP pipeline, set the integration
endpoint and key in the process environment and run `npm run test:analyze` from
`extension/`. It collects the public `example.com` target using a simulated page
capture and actual PHP HTTP calls; Chrome host permissions are simulated. Set
`W3BMAP_INTEGRATION_MODULES` to a comma-separated subset if needed. Network or
upstream resource failures may produce partial results, and are reported per module.
