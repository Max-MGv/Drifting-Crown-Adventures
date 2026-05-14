# WIP — Admin UI Tool

> Do not move to documentation until Max confirms this feature is complete.

## Goal
A local Node.js admin server that lets the DM:
- See all images across all adventures
- Mark individual images as "low-res mode" (tool auto-generates degraded copy)
- Add a purchase/source URL per image
- Preview how the adventure page will look with changes applied
- Publish: writes config + pushes to GitHub in one click

## Why
Some art is not commercially owned — displaying full-res publicly is a licensing risk. Low-res copies are shown on the site; source links let viewers buy the original.

---

## Architecture

### Server
`_admin/server.js` — Express server, runs locally only, never deployed.

Endpoints:
- `GET /api/adventures` — list all adventures + their images
- `GET /api/adventure/:name` — read that adventure's current `links.js` config
- `POST /api/lowres` — take a source image, run sharp to generate low-res copy, save to `images/*-lowres.jpg`
- `POST /api/save` — write updated `links.js` for an adventure
- `POST /api/publish` — git add + commit + push

### Image processing
`sharp` npm package. Low-res = resize to **1280px wide** + **JPEG quality 10**. Stored as `[name]-lowres.jpg` alongside the original.

### Config format (extends existing `links.js`)
```js
window.AdventureLinks = {
  'some-id': {
    url: 'https://...',        // purchase/source link
    credit: 'Artist Name',     // badge label
    lowres: true,              // flag: show degraded image
    lowresSrc: 'images/locations/gorrath-lowres.jpg'
  },
};
```

### Adventure page (`ui.js`)
When an image loads and its entry has `lowres: true`:
- Swaps `<img src>` to `lowresSrc`
- Adds `.img-lowres` class and `.container-lowres` to the wrapper
- Adds "Buy full art ↗" badge if a URL is present; clicking the image opens the purchase URL

Art Credits section (`#art-credits`) is auto-populated by `ui.js` from all `AdventureLinks` entries that have a URL — shows thumbnail, image name, artist credit, and buy link.

### Admin UI (`_admin/index.html`)
Served by the Express server. Single page:
1. Adventure selector (dropdown)
2. Image grid — each card shows the image, current low-res status, URL + credit fields
3. Toggle switch: Full / Low-res per image
4. Publish button — saves config + git push

---

## Chunks

| # | Chunk | Status |
|---|-------|--------|
| 1 | Server scaffold + image API (`/api/adventures`, `/api/lowres`, `/api/save`) | ✅ Done |
| 2 | Admin UI — adventure selector + image grid + toggles | ✅ Done |
| 3 | Preview — iframe showing adventure page with pending config | Skipped — localhost:3001 serves live preview |
| 4 | `ui.js` update — low-res swap on page load | ✅ Done |
| 5 | Publish — `/api/publish` git integration + publish button | ✅ Done |
| 6 | Art Credits section — auto-populated from `links.js` by `ui.js` | ✅ Done |

---

## Decisions
- Low-res dimensions: **1280px wide, JPEG quality 10** (tested 2026-05-13, settled on this)
- No CSS blur — quality reduction alone is sufficient at these settings
- Admin server port: 3001 (avoid conflicts with Live Server on 5500)
- `links.js` is extended in-place (no separate config file) to keep static page loading simple
