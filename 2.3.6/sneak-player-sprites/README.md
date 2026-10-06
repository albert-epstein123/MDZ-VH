# Sneak / crouch player sprite workspace

This folder contains copies of the existing player sprite atlases needed to draw new sneaking and crouching animations. The live files in `www/images` are unchanged.

| Category | Object types | Copied atlas files |
|---|---:|---:|
| body | 21 | 63 |
| hands | 4 | 13 |
| top | 19 | 57 |
| pants | 8 | 24 |
| vest | 16 | 41 |
| backpack | 13 | 25 |
| mask | 6 | 12 |
| hat | 8 | 15 |
| helmet | 18 | 36 |
| accessory | 2 | 4 |
| **Total** | **115** | **290** |

The categories come from the wearable and survivor families in `www/data.js`. Headgear is split into masks, hats, helmets, and accessories. The accessory category contains the headlamp and wearable Christmas lights.

Only frames used while attached to a player are mapped and copied. Frames used only for `on_ground`, inventory icons, loot boxes, and other UI art are intentionally excluded. When an on-player frame shares an atlas with a ground frame, the whole source atlas is copied unchanged.

Use `sprite-map.csv` to find each animation frame inside an atlas. It records the Construct object type, animation name, frame index, source file, atlas rectangle, and origin.
