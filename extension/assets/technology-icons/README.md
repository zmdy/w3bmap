# Technology icons

62 brand SVGs are vendored from [Simple Icons 16.0.0](https://github.com/simple-icons/simple-icons/tree/16.0.0/icons),
under CC0-1.0; see [LICENSE.md](LICENSE.md). A root `fill` color is added to match
the popup palette. `generic.svg` is an original project asset under MIT and is
used when a brand asset is unavailable. Brand artwork does not imply affiliation.

`icons.js` maps catalog IDs to local filenames. No icon is fetched from a CDN or
technology vendor while the popup is open. Additions to the detector remain usable
even without a new icon because unknown IDs receive the generic fallback.

To refresh these assets intentionally, run `node extension/scripts/update-icons.mjs`
from the repository root. This maintenance command requires curl, downloads only
from the pinned Simple Icons release, checks SVGs for executable/external content,
and retains already downloaded icons on a transient network failure. Review the
generated manifest, artwork, and licensing before committing. Normal builds and
tests use the packaged assets and require no network connection.
