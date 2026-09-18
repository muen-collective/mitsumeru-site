# Mitsumeru

The Mitsumeru Desktop download page — a single-page static site.

- `index.html` — the one-pager (EVA dark design, zero dependencies)
- `icon-512.png` — app icon used in the hero and as favicon

Download links point at the release assets of
[`muen-collective/mitsumeru-app`](https://github.com/muen-collective/mitsumeru-app/releases) — the
app repo. Two names to avoid: `mitsumeru-desktop` was the earlier fork-based lineage and is
archived, and the app repo itself was renamed from `mitsumeru` to `mitsumeru-app`. Use the
canonical name rather than leaning on GitHub's redirect — the old name only works while the
redirect lasts.

**The site offers macOS Apple Silicon only.** Intel (x64) and Windows rows were removed from
`PLATFORMS`, and the hero no longer branches on `navigator.userAgent`: 0.2.0 and earlier cannot
build those targets because `prepare-harness.sh` stages the host closure, so every target carries
`darwin-arm64` native addons and would fail to boot. Do not add the rows back until the app
actually publishes those assets — a row whose regex matches no asset silently renders nothing.

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
