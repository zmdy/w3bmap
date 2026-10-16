<p align="center">
  <img src="docs/assets/architecture.svg" width="880" alt="w3bm@p — Discover · Analyze · Connect · Visualize. Extension, CLI, and an optional self-hosted Probe API feed a Unified Data Schema and the Graph Explorer.">
</p>

# w3bm@p

An open source platform for web technology discovery and infrastructure mapping.
Discover technologies, map pages and infrastructure, and explore their connections
while keeping control of your data and collection infrastructure.

> **Status:** repository foundation. The components below are planned; no runnable
> application has been implemented yet.

## Architecture

w3bm@p follows a local-first architecture with no required account, database, or
central backend. Independent collectors will produce a shared JSON format for
consolidation and visualization in the Graph Explorer.

| Planned component | Responsibility | Planned technologies |
| --- | --- | --- |
| Extension | Discover technologies, pages, links, and resources; configure and query the user's connector | JavaScript, Chrome Manifest V3 |
| PHP Connector / Probe API | Enrich discoveries with DNS, RDAP, certificates, HTTP, and other public sources | PHP 8+, cURL, OpenSSL |
| CLI | Collect data from the terminal and export JSON in standalone or connected mode | Shell, PowerShell, and a BAT launcher |
| Graph Explorer | Import, correlate, and visualize entities, relationships, and evidence | SPA, Cytoscape.js |
| Shared | Define the JSON schema and share technology fingerprints | JSON, JSON Schema |

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

The CLI will support **standalone** mode using local tools and **connected** mode
using the same PHP connector protocol.

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

## Planned repository structure

```text
w3bmap/
├── extension/          # Chrome extension and connector settings
├── cli/                # w3bmap.sh, w3bmap.ps1, and w3bmap.bat
├── probe/              # w3bmap.php, distributed as a single file
├── explorer/           # Shared graph interface
├── shared/             # schema.json and fingerprints.json
├── docs/assets/        # README artwork and icon license notices
├── AGENTS.md           # Repository instructions for coding agents
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

Implementation directories will be added as their components are developed.
Within application components, organize classes into models, views, controllers,
and services where applicable.

## Planned data contract

Collectors will share versioned JSON containing entities (`nodes`), relationships
(`edges`), and collection metadata. Each discovery should record its source,
collection time, evidence, and confidence, distinguishing verified relationships
from probable associations. The formal schema and correlation rules will be
specified in `shared/`.

Minimal illustrative example, subject to the final schema:

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

## Planned Connector API

The PHP connector will be distributed as a single file, without a mandatory
Composer installation or database. All operations will require authentication.
These proposed calls are not functional endpoints yet:

```text
GET  /w3bmap.php?action=capabilities
GET  /w3bmap.php?action=dns&domain=example.com
GET  /w3bmap.php?action=rdap&domain=example.com
GET  /w3bmap.php?action=ssl&domain=example.com
GET  /w3bmap.php?action=headers&domain=example.com
GET  /w3bmap.php?action=technologies&domain=example.com
GET  /w3bmap.php?action=sitemap&domain=example.com
POST /w3bmap.php?action=analyze
```

Planned modules cover DNS, RDAP, certificates, HTTP headers, technologies,
robots.txt, sitemaps, and links. PHP environment diagnostics and local directory
inspection will be separate features, disabled by default and enabled explicitly
by the operator. Longer collection tasks will be handled primarily by the CLI.

### Implementation security requirements

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
- [ ] Define the JSON schema and build the Graph Explorer with import and export.
- [ ] Implement the Chrome extension with local collection and technology detection.
- [ ] Implement the cross-platform CLI with standalone and connected modes.
- [ ] Implement the PHP connector and its optional extension integration.
- [ ] Correlate entities and evidence from multiple sources.

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
