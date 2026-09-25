# Wallpaper collection

Twenty original AI-generated wallpapers replace the ten procedural wallpapers and their video loops. Ambient remains available as the theme-based option.

![All twenty wallpapers](collection.jpg)

## Collection

### Monumental sci-fi

- [monsoon arcology](../../Setpiece/Assets/Wallpapers/monsoon-arcology.jpg)
- [tidal relay](../../Setpiece/Assets/Wallpapers/tidal-relay.jpg)
- [saffron orbit](../../Setpiece/Assets/Wallpapers/saffron-orbit.jpg)
- [cloud sanctuary](../../Setpiece/Assets/Wallpapers/cloud-sanctuary.jpg)

### Wild frontiers

- [rainfall valley](../../Setpiece/Assets/Wallpapers/rainfall-valley.jpg)
- [basalt shore](../../Setpiece/Assets/Wallpapers/basalt-shore.jpg)
- [glacier signal](../../Setpiece/Assets/Wallpapers/glacier-signal.jpg)
- [highland crossing](../../Setpiece/Assets/Wallpapers/highland-crossing.jpg)

### Neon cities

- [neon rain](../../Setpiece/Assets/Wallpapers/neon-rain.jpg)
- [amber megalith](../../Setpiece/Assets/Wallpapers/amber-megalith.jpg)
- [midnight transit](../../Setpiece/Assets/Wallpapers/midnight-transit.jpg)
- [violet harbor](../../Setpiece/Assets/Wallpapers/violet-harbor.jpg)

### Voxel worlds

- [voxel sunrise](../../Setpiece/Assets/Wallpapers/voxel-sunrise.jpg)
- [voxel canopy](../../Setpiece/Assets/Wallpapers/voxel-canopy.jpg)
- [voxel frost](../../Setpiece/Assets/Wallpapers/voxel-frost.jpg)
- [voxel mesa](../../Setpiece/Assets/Wallpapers/voxel-mesa.jpg)

### Sculptural abstracts

- [prismatic fold](../../Setpiece/Assets/Wallpapers/prismatic-fold.jpg)
- [terracotta arc](../../Setpiece/Assets/Wallpapers/terracotta-arc.jpg)
- [liquid chrome](../../Setpiece/Assets/Wallpapers/liquid-chrome.jpg)
- [opal bloom](../../Setpiece/Assets/Wallpapers/opal-bloom.jpg)

## Artwork and delivery

Created on 2026-09-25 with the built-in OpenAI image generation tool, one generation per image, using the [recorded prompts](prompts.json). The user's art direction referenced The Creator, Death Stranding, Blade Runner, Minecraft, and abstract shapes. These are newly generated scenes, not imported movie frames, game screenshots, or third-party texture assets.

The tool returned 1672 × 941 pixels (Voxel Frost: 1672 × 940), despite the requested larger dimensions. The delivered JPEGs preserve that native resolution and framing; they are not upscaled or advertised as 1440p/4K. JPEG quality 92 keeps the complete set around 7.9 MiB. The artwork is included under the repository's license.

The moving-wallpaper switch applies a subtle, synchronized 48-second CSS pan/zoom cycle to each still. Ambient retains its breathing gradient. Both the app's Reduced motion setting and the system's prefers-reduced-motion setting disable animation. Static mode uses the uncropped source apart from normal cover fitting. No video downloads or codecs are required.

## Existing profiles

The Windows host migrates legacy IDs during normalization; future saves store the new ID. Animation preferences and unrelated profile fields are retained. Unknown IDs still fall back to Ambient.

| Previous wallpaper | Replacement |
| --- | --- |
| fjord-glass | monsoon-arcology |
| paper-horizon | terracotta-arc |
| moss-geometry | voxel-canopy |
| blue-hour | glacier-signal |
| ember-grid | neon-rain |
| slate-dunes | basalt-shore |
| orchard-mist | rainfall-valley |
| violet-current | prismatic-fold |
| quiet-coast | tidal-relay |
| mono-bloom | liquid-chrome |

The old procedural generator was removed so running maintenance scripts cannot recreate the retired assets. To replace an image later, generate the artwork using its recorded prompt, inspect it, and save the approved JPEG with the same filename.
