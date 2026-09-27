# Canvas backgrounds

Four dependency-free effects, ported from the
[Kinetic Particle Scenes](https://kineticparticlescenes.framer.website/preview-spherical-arcs)
Framer previews, rebuilt for a plain website. A fifth module folds three of them into one
scroll-driven object.

Framer publishes each component's original source through its source map, so these are faithful
ports of the geometry and drawing code rather than lookalikes. What changed is the shape: no React,
no Framer runtime, one plain function per effect.

The one exception is the icosahedron in `shape-morph.js`. Its Framer site
([inclusive-stories-634080.framer.app](https://inclusive-stories-634080.framer.app/)) ships its
component inside a minified shared bundle with no reachable source map, so that shape was rebuilt
from the rendered output instead: twelve corners, thirty edges, depth-shaded cyan edges with
glowing nodes, drawn on black.

## Files

- [src/spherical-arcs.js](src/spherical-arcs.js) — the arcs sphere.
- [src/spatial-wireframe.js](src/spatial-wireframe.js) — the drifting point cloud.
- [src/ascii-water-reveal.js](src/ascii-water-reveal.js) — the ASCII wave surface.
- [src/scan-button.js](src/scan-button.js) — the scanning button.
- [src/shape-morph.js](src/shape-morph.js) — wireframe → polygon → sphere, morphing on scroll.
- [spherical-arcs.html](spherical-arcs.html) — preview with live sliders.
- [spatial-wireframe.html](spatial-wireframe.html) — preview with live sliders.
- [ascii-water-reveal.html](ascii-water-reveal.html) — preview with live sliders.
- [scan-button.html](scan-button.html) — preview with live sliders.
- [morph.html](morph.html) — the scroll page: sections 01–03 with the object pinned right.
- [index.html](index.html) — the main page. Lists the effects with the polygon pinned to the right.

## Run the previews

```sh
python3 -m http.server 8765
```

Then open <http://127.0.0.1:8765/>. A server is needed because these are ES modules.

## Drop one into a site

```js
import { createSphericalArcs } from './src/spherical-arcs.js';
import { createSpatialWireframe } from './src/spatial-wireframe.js';
import { createAsciiWaterReveal } from './src/ascii-water-reveal.js';

const bg = document.getElementById('bg');
const scene = createSphericalArcs(bg, { settings: { curveCount: 20 } });

// later
scene.stop();
```

The element needs a size. `position: fixed; inset: 0` behind your content works well.

The three backgrounds return the same handle: `{ canvas, settings, frames, opacity, stop }`. `scene.settings` is read
on every frame, so you can retune live without restarting anything:

```js
scene.settings.speed = 0.4;
scene.settings.baseColor = [200, 220, 255];
```

## Spherical Arcs

Twenty arcs run from pole to pole on a unit sphere. Each arc sits at its own latitude `lat`, and its
longitude at parameter `u` is

```
lon = lat + time * TAU / 24 + twist * cos(u)
```

The `twist * cos(u)` term is the whole trick. It rotates the arc's longitude by latitude, so a
plain ring becomes a spiral that crosses the others.

From there it is orthographic projection plus two small rotations: `rotation` pitches the sphere
toward the viewer, `tilt` rolls the result on screen.

Every frame each arc is drawn as 48 short segments. Three things set a segment's brightness:

- **depth** — the half of the sphere facing the viewer is brighter and slightly thicker
- **the moving head** — a bright pulse laps each arc, falling off as `exp(-22 * dist)`
- **pointer activation** — a cap on the sphere surface that spreads from where the pointer is

The halo is two wide, very transparent strokes drawn under the real one. That is cheaper than a
`shadowBlur` per stroke and it is what gives the lines their soft glow.

| Setting | |
| --- | --- |
| `curveCount` | number of arcs, 0–1000 |
| `sphereWidth`, `sphereHeight` | radius as a fraction of `min(width, height)` |
| `tilt`, `rotation` | screen roll and pitch, degrees |
| `twist` | how far an arc's longitude drifts with latitude, radians |
| `minSize`, `medianSize`, `maxSize` | line thickness range, px |
| `lineOpacity`, `glow`, `intensity` | overall brightness |
| `speed`, `headSpeed` | rotation rate, head lap rate |
| `baseColor`, `activationColor`, `activationColorEnd` | resting and lit colours, `[r, g, b]` |
| `activationGradient` | blend the two activation colours across the sphere |
| `hoverActivation`, `activationBrightness`, `activationSpeed`, `activationFade` | pointer cap |
| `scrollDriven`, `startProgress`, `endProgress`, `fadeRange` | scroll fade |

## Spatial Wireframe

A cloud of points on a Fibonacci sphere, each nudged around by its own slow drift, spun about the
Y axis.

The edges are rebuilt every frame. A minimum spanning tree over the 3D distances gives a connected
shape with no loose points; then every vertex is topped up to at least three edges, and
`connectionDensity` adds a share of whatever pairs are left. Edges that already existed last frame
cost 15% less, so the shape holds together instead of flickering.

Points can be dragged. Dragging writes a manual screen offset onto that vertex, which survives the
automatic drift.

| Setting | |
| --- | --- |
| `vertexCount` | number of points, 1–1000 |
| `nodeSpacing` | size of the cloud |
| `driftAmplitude` | how far points swim |
| `connectionDensity` | extra edges beyond the spanning tree, 0–1 |
| `lineWidth`, `lineOpacity`, `nodeSize`, `glow`, `intensity` | drawing |
| `shapeWidth`, `shapeHeight` | radius as a fraction of `min(width, height)` |
| `twist`, `rotation`, `tilt` | drift phase, pitch, screen roll |
| `speed` | rotation rate |
| `baseColor`, `colorEnd`, `gradient` | flat colour, or a gradient across depth |
| `pointerRange`, `pointerHighlight` | how the pointer lights nodes up |
| `draggable`, `dragRadius` | dragging |
| `scrollDriven`, `startProgress`, `endProgress`, `fadeRange` | scroll fade |

## ASCII Water Reveal

A height-field wave simulation on a coarse grid. Every cell above a small threshold draws one ASCII
glyph, so the ripples read as trails of characters.

The physics is the classic string equation. Each cell moves toward the mean of its four neighbours:

```
next[i] = (field[i-1] + field[i+1] + field[i-cols] + field[i+cols]) * waveSpeed - field[i]
next[i] *= damping
```

The glyph is chosen by `intensity * 2.2`, its alpha by `intensity * 6`, both from a nine-character
ramp: `· . - ~ = + x * o`. A pointer moving across the surface raises a disc at each step along its
path, interpolated so fast gestures leave a continuous trail. Pressing raises a bigger one.

| Setting | |
| --- | --- |
| `fontSize` | monospace cell size, px |
| `density` | grid spacing multiplier, higher is finer |
| `damping` | how long ripples last, 0.85–0.99 |
| `waveSpeed` | how fast ripples travel, 0.1–0.5 |
| `maxOpacity` | alpha at the top of the ramp |
| `color`, `intensity` | glyph colour and overall brightness |
| `scrollDriven`, `startProgress`, `endProgress`, `fadeRange` | scroll fade |

The handle also exposes `stir(x, y)` and `drop(x, y, radius, strength)` in canvas coordinates, so
you can drive the surface from code.

## Quick Scan Button

A bordered button, not a background. Rebuilt from
[scanbutton.framer.website](https://scanbutton.framer.website/) — every value below was measured off
that page at 1728px rather than eyeballed.

Four 11px marks sit centred on the box's corners, so 5px of each hangs outside it. Each mark is two
1px strokes that cross at the mark's own centre, which puts the crossing point on the box corner and
reads as a `+`. Moving them to the mark's outer edge gives a bracket that opens away from the box,
which is not the design. The box itself is four 1px rules at
**white / opacity 0.1** — deliberately not the accent colour. The corner strokes and the scan rule
are the accent, which is what makes the design read as *red crosses joined by a grey line*.

The label lives in a 19px well that clips. Two copies are stacked in it and the pair slides up one
line on hover via `translateY(-100%)`, not a `justify-content` flip, because a justify-content change
cannot animate and the step shows.

The label is a `<span>`, never an `<i>`. An `<i>` is italicised by the user agent stylesheet, which
is exactly how this button first shipped wrong.

Variant one hoists the scan rule to fill the box at full opacity, so hovering floods it with the
accent and the label sits on top. Variant two drops the box rules, keeps the marks inside the
corners as brackets, and lifts the scan into a 30px bar 114% wide.

| Setting | |
| --- | --- |
| `label`, `href` | what it says and where it goes |
| `variant` | `one` (red crosses, ruled box) or `two` (brackets, no rules) |
| `icon`, `iconSize`, `iconGap` | optional leading mark, e.g. the Apple logo |
| `textColor` | label and icon colour |
| `accentColor` | the corner strokes and the scan rule |
| `lineColor` | the box rules, drawn at opacity 0.1 |
| `fontSize`, `fontFamily`, `padding` | typography and box padding |
| `cornerSize`, `markOffset` | the corner marks |
| `duration`, `ease` | one timing shared by every moving part |

`prefers-reduced-motion` removes all of it.

```js
const btn = createScanButton({ label: 'Get In Touch', variant: 'one' });
document.body.appendChild(btn.element);
btn.setLabel('Copied');
```

## Shape Morph

One object, pinned to the right of the page, that changes form as you scroll:

```
0  wireframe   a drifting cloud wired by a spanning tree
1  polygon     an icosahedron: 12 corners, 30 edges, nothing spare
2  sphere      twisted latitude arcs, smoothed past every corner
```

The three shapes share one canvas and one draw path. A shape only produces geometry; it never
draws itself. It fills a display list of screen-space lines and dots centred on the origin, and
`paint()` applies the view transform and strokes it.

That split is what makes the morph cheap. Collapsing a shape to a dot is a scale about the origin
applied at paint time, so no geometry is rebuilt, no vertex correspondence is needed, and shapes as
different as a spanning tree and a sphere collapse identically.

A transition has two phases with a hard handoff at the dot:

```
hold ......... collapse ......... | dot | ......... expand ......... hold
0..holdZone    outshape shrinks     peak    inshape grows, overshooting
```

The expand overshoots by 10% before it settles, which is the bounce. `expandEase` switches that
curve to a four-hop bounce or a plain cubic.

Scroll position is the only input. `floor(stage)` is the shape you came from and the fraction is how
far you have travelled toward the next one, so a slot always morphs in one direction and nothing
reads the sign of the scroll delta. Scrolling back up plays the whole thing in reverse with no extra
code.

Sections are found by `[data-stage]`. Each one anchors its shape at the scroll position that centres
that section, and the stage value is linear between anchors.

| Setting | |
| --- | --- |
| `scale` | shape radius as a fraction of `min(width, height)` |
| `holdZone` | share of a slot where the shape holds still, 0–0.49 |
| `collapseShare` | share of a transition spent collapsing rather than expanding |
| `expandEase` | `back` (overshoot), `bounce`, or `cubic` |
| `smoothing` | per-second easing of the scroll value, 0 disables |
| `speed`, `spin`, `tilt` | rotation rate and pitch |
| `color`, `colorFar`, `coreColor`, `glow`, `intensity` | colour and glow |
| `points`, `pointSpread`, `drift`, `dragEdges` | the wireframe |
| `polygonWidth`, `polygonHeight` | the icosahedron |
| `arcs`, `arcTwist`, `segments`, `headSpeed`, `sphereWidth`, `sphereHeight` | the sphere |
| `lineWidth`, `nodeSize`, `arcWidth` | stroke and node weights |
| `sectionSelector` | how sections are found, defaults to `[data-stage]` |

```js
import { createShapeMorph } from './src/shape-morph.js';

const morph = createShapeMorph(document.getElementById('stage'), {
  onStage: (stage, index) => console.log(index), // fires when the shape changes over
});

morph.setStage(1.35);  // drive it by hand, ignores scroll
morph.releaseStage();  // hand control back to scroll
morph.settings.holdZone = 0.4;
```

Pass `shapes: ['polygon']` for a single rotating object with no transitions at all. One shape means
every slot resolves to itself, so no sections are needed. That is what
[index.html](index.html) mounts, pinned to the right of the page's own blocks.

The handle exposes `{ canvas, settings, stage, index, transition, stop, setStage, releaseStage,
refresh }`. `transition` holds the resolved frame — `core`, `fromK`, `toK`, `focus` — which is what
you want when tuning the timeline. Call `refresh()` after anything moves the sections.

`prefers-reduced-motion` skips the collapse entirely and snaps between shapes.

## Notes

- `prefers-reduced-motion` slows both effects to near zero.
- The canvas is sized to `devicePixelRatio`, capped at 2.
- Rendering pauses when the canvas scrolls out of view or the tab is hidden.
- The scroll fade is skipped when the page does not scroll at all, so a single-screen page keeps its
  background.
