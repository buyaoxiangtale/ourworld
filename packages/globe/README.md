# Ourworld shared globe

`npm run build -w @ourworld/globe` produces `dist/index.html` and self-contained `assets/`. All geographic data and scripts are bundled, with no runtime CDN. The root build copies this directory to `/globe/` and native app resources.

Bridge v1: receive commands through `window.OurworldGlobe.receive(command)` or a same-origin parent `postMessage`. Events are posted to the parent, `AndroidBridge.postMessage(JSON.stringify(event))`, and `webkit.messageHandlers.ourworldGlobe.postMessage(event)` when available.

Commands: `setMarkers {places:Place[],favoriteIds:string[]}`, `focusPlace {place:Place}`, `restoreCamera {lat,lng,altitude}`, `setActive {active:boolean}`, `setTheme {theme:string}`. Events: `rendererReady`, `placeSelected {place}` (or `geoName,geoId,lat,lng` for countries without a corresponding catalog entry), `cameraChanged {lat,lng,altitude}`, `rendererError {message}`. Every envelope contains `bridgeVersion:1,event,data`.

Geographic outlines are bundled from world-atlas/Natural Earth 1:50m. Basemap data is display data, not an administrative-boundary certification. Maintain reviewed local source data for a production geography release. Ocean and land texture are generated from those outlines locally; no remote imagery is loaded.
