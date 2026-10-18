# Iconify assets

All application icons come exclusively from the
[Iconify icon-set repository](https://github.com/iconify/icon-sets), pinned at
`69ca5094ddd4aad6d797e689bb13ee8b692ae232`. `catalog.json` contains only the selected
original icon bodies and dimensions, collection metadata, aliases, and colors.
No icon geometry is drawn in application code. Cosmetic color/size changes and
ordinary interface/chart layout shapes do not replace or redraw an icon.

| Collection | Use | Author | License |
| --- | --- | --- | --- |
| `bx` / BoxIcons v2 2.1.4 | UI controls, graph node types, application marks, fallbacks | Boxicons | MIT |
| `logos` / SVG Logos | Technology logos | Gil Barbara | CC0-1.0 |
| `simple-icons` / Simple Icons 16.35.0 | Additional technology logos | Simple Icons Collaborators | CC0-1.0 |

Full author and license URLs are retained in `catalog.json` and `provenance.json`.
See [BoxIcons MIT](licenses/boxicons-MIT.txt) and [CC0-1.0](licenses/CC0-1.0.txt).
The icon identifiers identify third-party artwork, not project affiliation.

`provenance.json` records each generated asset's Iconify ID and SHA-256 hash.
Tests verify its exact body against the canonical Iconify data and reject inline
SVG icon drawing in application views. The README architecture illustration also
uses original BoxIcons, including its arrow icons; its text and layout remain
project-authored. The actual current site's favicon is content fetched through
Chrome's favicon cache and is intentionally not replaced with an invented brand.

## Offline build

```sh
node scripts/build-icons.mjs
npm --prefix extension run build
```

The extension build runs the icon builder before copying the canonical Explorer.
UI icons use local SVG files through CSS masks. Graph nodes reference local
Iconify SVGs; there are no hand-built SVG data URLs. PNG toolbar icons are raster
exports of `bx:network-chart`, with no custom geometry or background added.
To regenerate PNGs, set `W3BMAP_SHARP_MODULE` to the absolute path of an installed
Sharp entry module and run the icon builder. Normal builds retain the committed
PNG exports and their recorded hashes and need no dependency installation.

## Updating source data

Download `json/bx.json`, `json/logos.json`, and `json/simple-icons.json` from the
pinned Iconify repository revision into `data/iconify-<collection>.json`.
Then run `node scripts/import-iconify.mjs` from the repository root, followed by
the offline build. The importer uses `preferences.json` for additional aliases
and cosmetic colors. Update the importer revision deliberately when changing
the pinned source, verify collection license metadata, and review the resulting
catalog and provenance. SVG bodies must remain unchanged.

Runtime use never fetches icons or executable code from Iconify or a CDN.
