# Abyss Watchers Signal Mesh

A local-first static web app for tracking:

- live crypto market movement via CoinGecko public endpoints
- recent scientific publication metadata via Crossref
- a personal or community watchlist, notes, and shareable "signal packs"
- an optional YouTube-powered radio panel that only activates after user consent

## Run locally

Serve the folder with any static server. For example:

```powershell
python -m http.server 4173
```

Then open `http://localhost:4173`.

## Data sources

- CoinGecko public market endpoints
- Crossref REST API for recent research metadata

## Local-first behavior

- watchlist and notes are saved in `localStorage`
- the current topic and watchlist are mirrored into the URL hash for easy sharing
- the service worker caches the app shell for offline reopening
- radio consent and the last pasted YouTube station are also stored locally
