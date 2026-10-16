# Browser technology catalog

`shared/fingerprints.json` is the canonical, independently authored MIT-licensed
catalog. Run `npm run build` from `extension/` after edits and commit the generated
copy. No remote rules are loaded. The current format version is `2.0`; exported
graphs continue to use schema `1.0`.

Each technology defines `id`, `name`, `category`, `website`, `confidence`, and a
`patterns` array. IDs must be unique. Use an official HTTPS website and confidence
strictly below 1. Patterns use either `regex` (case-insensitive), `equals`, or
`contains`. Prefer bounded regexes over broad filename substrings. Keep regexes
simple and avoid nested/ambiguous quantifiers; candidates are capped at 2048
characters. Optional `versionGroup` selects a numeric capture group. Non-numeric
versions are discarded, not returned as arbitrary page strings.

| Source | Input | Additional fields |
| --- | --- | --- |
| `resource` | Sanitized resource URLs from DOM/performance | None |
| `script` | Only resource URLs with kind `script` | None |
| `generator` | Generator metadata | None |
| `hint` | Legacy framework marker IDs | Prefer `equals` |
| `meta` | Named/property metadata values | `key`, a safe literal metadata name |
| `dom` | Selector existence (`present`) or an approved attribute | `key`, `selector`, optional `attribute` |
| `js` | Presence (`present`) or a numeric version | `key`, a dotted JavaScript path; `versionGroup` enables numeric capture |

For DOM markers, select precise framework artifacts. Never add selectors or
attributes that capture user input, body text, tokens, or credentials. The current
attribute allowlist is `ng-version`; expand the code's allowlist and privacy tests
deliberately if another public version attribute is needed. Metadata should be
limited to public technology markers. JavaScript paths must use ordinary property
names; `constructor`, `prototype`, and `__proto__` are rejected. Probes return no
functions or arbitrary object/string values and skip accessors.

```json
{
  "id": "angular",
  "name": "Angular",
  "category": "JavaScript frameworks",
  "website": "https://angular.dev",
  "confidence": 0.85,
  "patterns": [{
    "source": "dom",
    "key": "angular-version",
    "selector": "[ng-version]",
    "attribute": "ng-version",
    "regex": "^([0-9]+(?:\\.[0-9]+){0,3})$",
    "versionGroup": 1
  }]
}
```

Version priority is JavaScript, DOM, generator/metadata, script, then generic
resources. All matched pattern indicators are considered; up to eight are
retained per technology. Confidence adds 0.03 per additional source type, capped
at 0.99. This is a heuristic score, not a calibrated probability.

An optional `implies` array references existing technology IDs. Dependencies are
added only when absent, at confidence 0.6, with `detection_type: implied` and no
version. Keep dependencies direct and acyclic; this is a curated inference, not
a general dependency resolver. Do not infer backend software without appropriate
evidence. Unsupported fields from other fingerprint databases are not silently
treated as implemented: this format is not a Wappalyzer database importer.

Run `npm test` from `extension/` for catalog, serialized-probe, privacy, matcher,
version, graph, and integration checks. Add both a positive signal and a similar
negative example for new patterns, then check a real target page in Chrome.
Do not copy third-party catalogs without reviewing their license and provenance.
