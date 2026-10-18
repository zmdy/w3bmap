# Technology icons

All SVGs are generated from [Iconify icon sets](https://github.com/iconify/icon-sets).
69 brands use the SVG Logos and Simple Icons collections (CC0-1.0); 11 technology
IDs use the BoxIcons `bx:code-alt` fallback (MIT). `generic.svg` is also
`bx:code-alt`, not a custom drawing. See the canonical
[source catalog, provenance, and licenses](../../../shared/iconify/README.md).
The SVG bodies are copied unchanged, with only the wrapper/color configured.

`icons.js` maps catalog IDs to local filenames. No icon is fetched from a CDN or
technology vendor while the popup is open. Additions to the detector remain usable
even without a new icon because unknown IDs receive the generic fallback.

Run `node scripts/build-icons.mjs` from the repository root to regenerate the
assets from the checked-in Iconify catalog. `extension/scripts/update-icons.mjs`
is a compatibility entry point for that same offline build. Source updates require
an explicit import from Iconify, not direct downloads from individual icon vendors.
Normal builds and tests require no network connection.
