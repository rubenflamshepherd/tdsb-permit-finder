# Vector Basemap Upgrade

The current map uses CARTO raster tiles, which is a useful improvement over raw OSM tiles: calmer colors, cleaner labels, and less visual noise. The next best version would be moving to a vector basemap.

With vector tiles, MapLibre receives map features as data instead of pre-rendered image tiles. That would let us style the map directly in the app: mute roads, reduce label density, hide distracting POIs, tune park and water colors, and make the school availability markers the clear visual focus.

Recommended direction:

- Use a light vector basemap from MapTiler, Stadia, or Protomaps.
- Keep the visual style quiet: pale land, muted roads, low-contrast labels.
- Hide nonessential POIs so schools and results stand out.
- Reserve strong color only for app data: selected point, search radius, and availability markers.
- Keep a raster fallback if we want a no-key option.

Why it is worth doing:

- More polished product feel.
- Better control over contrast and map clutter.
- Easier future theming.
- Cleaner integration with our availability colors.
- Better scalability if we later add more map overlays.

Tradeoff: it adds a little setup complexity, and most hosted vector basemap providers require an API key or have usage limits. Protomaps is the most attractive if we want more ownership and fewer provider constraints.
