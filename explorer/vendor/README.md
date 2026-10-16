# Browser dependencies

These files are checked in so the Explorer does not need a CDN, network access,
or an npm installation at runtime.

| Asset | Source | Version | License |
| --- | --- | --- | --- |
| `cytoscape.js` | [Cytoscape.js](https://github.com/cytoscape/cytoscape.js) | 3.34.4 | MIT; see `cytoscape-LICENSE.txt` |
| `graph-validator.js` | [Ajv](https://github.com/ajv-validator/ajv) standalone output and [ajv-formats](https://github.com/ajv-validator/ajv-formats) | 8.20.0 / 3.0.1 | MIT; see the respective license notices |
| `schema.json` | Project shared schema | 1.0 | Project MIT license |

The validator is generated from `../../shared/schema.json` using JSON Schema Draft
2020-12 and standard format validation. It runs without dynamic code generation
or `eval` in the browser. The schema copy is retained to detect stale builds.

From `explorer/`, run `npm ci` and `npm run vendor` to regenerate these files.
Pinned development dependencies and their integrity hashes are recorded in
`package-lock.json`. Node.js 20.6+ is required for the maintenance script.
Application OOP/MVC guidelines apply to project source; vendored upstream code
and generated validator code retain their upstream structure.
