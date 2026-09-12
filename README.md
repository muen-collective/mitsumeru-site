# Mitsumeru

The Mitsumeru Desktop download page — a single-page static site.

- `index.html` — the one-pager (EVA dark design, zero dependencies)
- `icon-512.png` — app icon used in the hero and as favicon

Download links point at the release assets of
[`muen-collective/mitsumeru`](https://github.com/muen-collective/mitsumeru/releases) — the app
repo. (`mitsumeru-desktop` was the earlier fork-based lineage and is archived; do not point
links at it.)

`index.html` resolves the current release from the GitHub API at load time, so new versions are
picked up without an edit. The `href` on the hero CTA is a **fallback** for when that fetch
fails (offline, rate-limited) — it has to be bumped by hand on release, and it is the one thing
that silently goes stale.

## Deploy

The site is deployed by **Vercel**, which is connected to this repo — every push to `main`
publishes it. There is no GitHub Pages workflow.

To update the fallback download link, edit `index.html` — it is deliberately a single
self-contained file.

### Asset-name matching

The modal classifies release assets by filename regex. Two things to know before changing them:

- The app's DMG is `Mitsumeru-<version>-arm64.dmg` — it does **not** contain the token `mac`.
  Any regex that requires `mac` will match nothing, the "Recommended" row will disappear, and
  the failure is silent.
- A release also carries `.blockmap` files and `dev-mac.yml`. Anything that renders every asset
  without filtering will show those as download rows.
