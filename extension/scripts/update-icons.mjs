import { IconAssetBuilder } from '../../scripts/build-icons.mjs';

// Compatibility entry point. All icon sources are pinned Iconify collections.
await new IconAssetBuilder().run();
