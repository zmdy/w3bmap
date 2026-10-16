<p align="center">
  <img src="docs/assets/architecture.svg" width="880" alt="w3bm@p — Discover · Analyze · Connect · Visualize. Extension, CLI, and an optional self-hosted Probe API feed a Unified Data Schema and the Graph Explorer.">
</p>

# w3bm@p

An open source platform for web technology discovery and infrastructure mapping.
Discover technologies, map pages and infrastructure, and explore their connections
while keeping control of your data and collection infrastructure.

> **Status:** the first PHP connector and SH/BAT CLI are implemented. The Chrome
> extension, Graph Explorer, native PowerShell collector, and cross-run correlation
> are still planned.

## Architecture

w3bm@p follows a local-first architecture with no required account, database, or
central backend. Independent collectors produce a shared JSON format for future
consolidation and visualization in the Graph Explorer.

| Component | Responsibility | Technologies and status |
| --- | --- | --- |
| Extension | Discover technologies, pages, links, and resources; configure and query the user's connector | JavaScript, Chrome Manifest V3 — planned |
| PHP Connector / Probe API | Enrich discoveries with DNS, RDAP, certificates, HTTP, and other public sources | PHP 8.1+, cURL, OpenSSL — implemented |
| CLI | Collect data from the terminal and export JSON in standalone or connected mode | SH/BAT launchers with PHP classes — implemented; native PowerShell planned |
| Graph Explorer | Import, correlate, and visualize entities, relationships, and evidence | SPA, Cytoscape.js — planned |
| Shared | Define the JSON graph contract | JSON Schema — implemented; shared fingerprint catalog planned |

## Quick start

Install PHP 8.1+ with cURL, OpenSSL, DOM, and SimpleXML for all modules. From the
repository root, run a standalone collection:

```sh
sh cli/w3bmap.sh --domain example.com --modules dns,headers,ssl,technologies
```

On Windows Command Prompt:

```bat
cli\w3bmap.bat --domain example.com --modules dns,headers,ssl,technologies
```

Or invoke PHP directly on either platform:

```sh
php cli/w3bmap.php --help
php cli/w3bmap.php --action capabilities
```

Read the [CLI guide](docs/cli.md) for exports, connected mode, requirements, and
exit codes. Read the [connector guide](docs/connector.md) to deploy the authenticated
single-file PHP API and configure its token and target allowlist.

### Optional self-hosted PHP connector

Each user will install `w3bmap.php` on their own hosting service, VPS, or local
server and configure its URL and authentication key in the extension.
**The project will not provide a public or centralized PHP endpoint.** Browser
collection will remain available without the connector.

The planned workflow is:

1. Install the Chrome extension.
2. Optionally install the PHP connector on a server you control.
3. Enter the connector URL and authentication key in the extension settings.
4. Test the connection and discover the server's available modules.
5. Enrich browser discoveries with connector queries.
6. Explore the combined graph and export the results as JSON.

The CLI supports **standalone** mode using the local PHP runtime and **connected**
mode using the same PHP connector protocol.

### Engineering principles

- **English throughout:** documentation, source code, identifiers, comments,
  interface text, errors, examples, and commit messages must be in English.
- **Object-oriented programming:** implement application behavior through classes
  with clear responsibilities, encapsulation, and composition. Keep entry points
  thin and delegate behavior to objects.
- **Model–View–Controller wherever applicable:** models represent entities and
  application state; views render interfaces or serialize responses; controllers
  coordinate input and application services. Keep collection, networking, and
  correlation logic in dedicated service classes.
- **Language-appropriate launchers:** Shell and BAT scripts remain thin launchers
  for object-oriented application code, since those languages do not provide
  native class-based OOP. PowerShell application behavior should use classes.
- **Independent components, shared contracts:** preserve a common versioned data
  format while allowing each collector to operate independently.

The single-file PHP distribution will preserve internal class boundaries.

## Repository structure

```text
w3bmap/
├── extension/          # Planned Chrome extension and connector settings
├── cli/                # w3bmap.sh, w3bmap.bat, and the PHP CLI application
├── probe/              # w3bmap.php, distributed as a single file
├── explorer/           # Planned shared graph interface
├── shared/             # schema.json
├── tests/              # Offline PHP regression suite
├── docs/               # CLI/connector guides and artwork
├── AGENTS.md           # Repository instructions for coding agents
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

The `extension/` and `explorer/` directories will be added when developed.
The PHP applications separate models, views, controllers, and services internally.
The connector remains deployable as one file; the CLI shares its classes.

## Data contract

Collectors share versioned JSON containing entities (`nodes`), relationships
(`edges`), collection metadata, module results, and errors. Discoveries record
source, collection time, evidence, and confidence; relationships distinguish
observed findings from inferred associations. The contract is defined in
[shared/schema.json](shared/schema.json). Cross-run correlation is still planned.

Simplified excerpt (full documents also include metadata, status, evidence,
confidence, module results, and errors):

```json
{
  "schema_version": "1.0",
  "tool": "w3bm@p",
  "target": "example.com",
  "source": "extension",
  "nodes": [
    { "id": "domain:example.com", "type": "domain", "label": "example.com" },
    { "id": "page:https://example.com/about", "type": "page", "label": "/about" }
  ],
  "edges": [
    {
      "source": "domain:example.com",
      "target": "page:https://example.com/about",
      "type": "contains"
    }
  ]
}
```

## Connector API

The PHP connector is distributed as a single file, without a mandatory Composer
installation or database. All operations require bearer-token authentication,
including capabilities. Configure `W3BMAP_API_KEY` and `W3BMAP_ALLOWED_DOMAINS` on
the server before use. The following actions are implemented:

```text
GET  /w3bmap.php?action=capabilities
GET  /w3bmap.php?action=dns&domain=example.com
GET  /w3bmap.php?action=rdap&domain=example.com
GET  /w3bmap.php?action=ssl&domain=example.com
GET  /w3bmap.php?action=headers&domain=example.com
GET  /w3bmap.php?action=technologies&domain=example.com
GET  /w3bmap.php?action=sitemap&domain=example.com
GET  /w3bmap.php?action=robots&domain=example.com
GET  /w3bmap.php?action=links&domain=example.com
POST /w3bmap.php?action=analyze
```

Modules cover DNS, RDAP, certificates, HTTP headers, technology indicators,
robots.txt, sitemaps, and links. Optional PHP environment diagnostics are disabled
by default. Local directory inspection and recursive crawling are not implemented.
See [the connector protocol and limits](docs/connector.md) for request bodies,
deployment settings, security boundaries, and partial-result behavior.

### Security boundaries

- Token authentication for every operation, including capabilities, and HTTPS for remote endpoints.
- Extension origin permissions granted for the hosts in use.
- Limits on request rates, execution time, and response sizes.
- Validation and authorization of connector query destinations.
- Blocking of private, loopback, and cloud metadata destinations by default, including DNS resolution and redirect validation.
- Credentials excluded from versioned source and exported JSON.
- Route discovery through links and sitemaps; no directory brute force in the API.

Queries and diagnostics must remain within the scope authorized by the operator.

## Roadmap

- [x] Initialize Git, documentation, licensing, and commit conventions.
- [x] Establish English-only content, OOP, and MVC guidelines.
- [x] Define the shared JSON graph schema.
- [x] Implement standalone and connected PHP CLI with SH/BAT launchers.
- [x] Implement the authenticated self-hosted PHP connector.
- [ ] Build the Graph Explorer with import and export.
- [ ] Implement the Chrome extension with local collection and technology detection.
- [ ] Add a native PowerShell collector.
- [ ] Integrate the optional connector into the Chrome extension.
- [ ] Correlate entities and evidence from multiple sources.

## Verification

Run the offline regression suite:

```sh
php tests/run.php
```

The suite uses injected DNS and HTTP fixtures to check authentication, request
validation, destination policy, rate limiting, graph consistency, XML/HTML parsing,
and CLI input handling. It does not send external network requests.

Syntax checks:

```sh
php -l probe/w3bmap.php
php -l cli/w3bmap.php
sh -n cli/w3bmap.sh
```

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Commits follow
[Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/),
for example: `feat(extension): add connector settings`.

## License

Project code and documentation are distributed under the [MIT License](LICENSE).
Copyright (c) 2026 Hudson.

The architecture illustration uses BoxIcons v2 icons by Aniket Suvarna, obtained
through [Iconify](https://icon-sets.iconify.design/bx/). See the
[asset credits and license notices](docs/assets/README.md).
