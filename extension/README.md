# w3bm@p Chrome extension

This directory is a ready-to-load, unpacked Manifest V3 extension. It contains a
local copy of the Graph Explorer and has no CDN or central backend dependency.

## Install

1. Open `chrome://extensions/` in Chrome 116 or newer.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this `extension/` directory, containing `manifest.json`.
5. Pin **w3bm@p — Web Discovery** from Chrome's extensions menu.

Open an HTTP or HTTPS page and click the extension. Technology detection starts
automatically: browse categories, filter by name/category/version, and expand a
technology to inspect its evidence. **Detect again** refreshes these findings.
The icon badge shows the detected count after inspection and resets on navigation.

Choose **Analyze current page** to save the complete collection, including links,
resources, and optional PHP enrichment. Use **Open graph** or **Export JSON** when
the collection is ready. Quick detection never replaces the last saved graph.

The local catalog includes 80 independently authored technology definitions.
Versions are shown only when an explicit numeric signal is available; otherwise
the UI says **Version unknown**. Coverage is smaller than Wappalyzer's catalog.

For optional PHP setup, privacy details, permissions, and verification, read
[the extension guide](../docs/extension.md).

## Maintain

From this directory, use Node.js 20.6+:

```sh
npm run build
npm test
```

The build copies the canonical `../explorer/` runtime and
`../shared/fingerprints.json`. Update those sources rather than editing the
generated `extension/explorer/` or `extension/fingerprints.json` copies.
No dependency installation is needed for these commands. Regenerating the Explorer
validator itself uses the Explorer's separate development dependencies.

After changes, click **Reload** on this extension in `chrome://extensions/` and
reload the target page before analyzing again.

The Node suite uses Chrome API fixtures. Loading the unpacked extension and
checking Chrome's permission prompts and popup lifecycle require a real Chrome
session; an ordinary HTTP preview does not grant extension permissions.
