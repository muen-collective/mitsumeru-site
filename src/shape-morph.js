/**
 * Shape Morph — one pinned object that changes form as you scroll.
 *
 * Three shapes share a single canvas and a single draw path:
 *
 *   0  wireframe   a drifting cloud of points wired by a spanning tree
 *   1  polygon     an icosahedron: 12 corners, 30 edges, nothing spare
 *   2  sphere      twisted latitude arcs, smoothed until the corners are gone
 *
 * Each shape only produces geometry. A shape never knows about the others, and
 * never draws itself. It fills a display list of screen-space lines and dots,
 * centred on (0, 0). `paint()` applies the view transform and strokes it.
 *
 * That split is what makes the morph cheap. Collapsing a shape to a dot is a
 * scale about the origin applied at paint time, so no geometry has to be
 * rebuilt, no vertex correspondence is needed, and every shape collapses the
 * same way no matter how different its topology is.
 *
 * The transition has two phases with a hard handoff at the dot:
 *
 *   hold ......... collapse ......... | dot | ......... expand ......... hold
 *   0..holdZone    outshape shrinks     peak    inshape grows, overshooting
 *
 * The whole thing is a pure function of scroll position, so scrolling back up
 * plays it in reverse with no extra code.
 *
 * No dependencies. ES module.
 */

const TAU = Math.PI * 2;
const PHI = (1 + Math.sqrt(5)) / 2;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smoothstep = (t) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

const easeInCubic = (t) => t * t * t;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

/** Overshoots past 1, then settles. The "bounce" on the way out. */
const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** Four diminishing hops. Softer landing than easeOutBack. */
const easeOutBounce = (t) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

/** Gentle overshoot: rises 8% past 1, then settles. No visible hops. */
const easeOutGentle = (t) => {
  const c1 = 0.8;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

const EASES = {
  back: easeOutBack,
  bounce: easeOutBounce,
  cubic: easeOutCubic,
  gentle: easeOutGentle,
};

export const SHAPE_NAMES = ['wireframe', 'polygon', 'sphere'];

export const DEFAULTS = {
  // --- form ---------------------------------------------------------------
  scale: 0.34, // shape radius as a fraction of min(width, height)
  segments: 36, // stroke segments per sphere arc

  // --- timing -------------------------------------------------------------
  holdZone: 0.3, // share of a slot where the shape holds, 0..0.49
  collapseShare: 0.42, // share of the transition spent collapsing
  expandEase: 'back', // 'back' | 'bounce' | 'cubic'
  smoothing: 14, // per-second easing of the scroll value, 0 disables

  // --- motion -------------------------------------------------------------
  speed: 1,
  spin: 0.42, // rad/s of yaw on the polygon
  tilt: -0.18, // rad, fixed pitch on the polygon

  // --- colour -------------------------------------------------------------
  color: [5, 232, 224], // teal, front faces
  colorFar: [8, 74, 96], // deep teal, back faces
  coreColor: [214, 255, 253], // the dot the shapes collapse into
  glow: 1, // 0..2, halo width
  intensity: 1,

  // --- chromatic split ----------------------------------------------------
  // While the pointer is on the shape the geometry is stroked once per primary
  // and the three passes are added together. `split` is the channel offset in px
  // at full proximity, `splitReach` is how far past the distortion radius the
  // cursor still counts as being on the object, and `splitAlpha` is the per-pass
  // opacity. Set split to 0 to turn the whole thing off.
  split: 9,
  splitReach: 1.1,
  splitAlpha: 0.62,

  // --- wireframe ----------------------------------------------------------
  points: 16, // 4..120
  pointSpread: 0.92,
  drift: 0.62,
  dragEdges: 0.72, // longest edges drawn, as a share of the span
  lineWidth: 1.3,
  nodeSize: 3.4,

  // --- polygon ------------------------------------------------------------
  polygonWidth: 1,
  polygonHeight: 1,

  // --- sphere -------------------------------------------------------------
  arcs: 20,
  arcTwist: 0.65,
  headSpeed: 1 / 8,
  sphereWidth: 0.86,
  sphereHeight: 0.9,
  arcWidth: 1.4,

  // --- stage --------------------------------------------------------------
  sectionSelector: '[data-stage]',
  scrollDriven: true,
};

function resolveSettings(input) {
  const s = { ...DEFAULTS, ...input };
  s.points = Math.round(clamp(s.points, 4, 120));
  s.arcs = Math.round(clamp(s.arcs, 0, 400));
  s.segments = Math.round(clamp(s.segments, 0, 200));
  s.holdZone = clamp(s.holdZone, 0, 0.49);
  s.collapseShare = clamp(s.collapseShare, 0.1, 0.9);
  s.split = clamp(s.split, 0, 40);
  s.splitReach = clamp(s.splitReach, 0, 3);
  s.splitAlpha = clamp(s.splitAlpha, 0, 1);
  if (!EASES[s.expandEase]) s.expandEase = 'back';
  return s;
}

// ---------------------------------------------------------------------------
// geometry
// ---------------------------------------------------------------------------

/**
 * A regular icosahedron on the unit sphere.
 *
 * The twelve corners are the cyclic permutations of (0, +-1, +-phi). Two
 * corners are joined when they are exactly one edge apart, which is the
 * shortest distance in the set. That gives 30 edges from 12 vertices with no
 * table to maintain.
 */
function buildIcosahedron() {
  const raw = [];
  for (const a of [1, -1]) {
    for (const b of [1, -1]) {
      raw.push([0, a, b * PHI]);
      raw.push([a, b * PHI, 0]);
      raw.push([b * PHI, 0, a]);
    }
  }
  const len = Math.hypot(1, PHI);
  const verts = raw.map((v) => [v[0] / len, v[1] / len, v[2] / len]);

  const edge = 2 / len;
  const edges = [];
  for (let i = 0; i < verts.length; i++) {
    for (let j = i + 1; j < verts.length; j++) {
      const d = Math.hypot(
        verts[i][0] - verts[j][0],
        verts[i][1] - verts[j][1],
        verts[i][2] - verts[j][2],
      );
      if (Math.abs(d - edge) < 1e-6) edges.push([i, j]);
    }
  }
  return { verts, edges };
}

const ICOSA = buildIcosahedron();

const GOLDEN = 2.399963229728653;

// ---------------------------------------------------------------------------
// shapes — each returns { lines, dots } in screen pixels, centred on 0,0
// ---------------------------------------------------------------------------

/** 0 — drifting point cloud wired by a minimum spanning tree. */
function buildWireframe(t, s, R) {
  const n = s.points;
  const lines = [];
  const dots = [];
  if (n < 2) return { lines, dots };

  const a = t * s.speed * 0.26;
  const radius = s.pointSpread * 0.5;
  const drift = s.drift * 0.2;
  const pts = [];

  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = i * GOLDEN;

    const x = r * Math.cos(phi) * radius + drift * Math.sin(a * (1 + (i % 3)) + i * 1.71);
    const py = y * radius + drift * Math.sin(a * (2 + (i % 2)) + i * 2.37);
    const z = r * Math.sin(phi) * radius + drift * Math.cos(a * (1 + (i % 4)) + i * 3.13);

    pts.push({
      x: x * Math.cos(a) + z * Math.sin(a),
      y: py,
      z: -x * Math.sin(a) + z * Math.cos(a),
    });
  }

  // centre the cloud
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const p of pts) {
    cx += p.x / n;
    cy += p.y / n;
    cz += p.z / n;
  }
  for (const p of pts) {
    p.x -= cx;
    p.y -= cy;
    p.z -= cz;
  }

  // spanning tree, then top every corner up to three edges
  const pairs = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      pairs.push({
        a: i,
        b: j,
        d: Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y, pts[i].z - pts[j].z),
      });
    }
  }
  pairs.sort((p, q) => p.d - q.d || p.a - q.a || p.b - q.b);

  const parent = Array.from({ length: n }, (_, i) => i);
  const degree = new Array(n).fill(0);
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };

  const keep = new Set();
  const picked = [];
  const longest = (pairs[pairs.length - 1]?.d || 1) * s.dragEdges;

  for (const { a: i, b: j, d } of pairs) {
    if (d > longest) break;
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) {
      parent[ri] = rj;
      keep.add(`${i}:${j}`);
      picked.push([i, j]);
      degree[i]++;
      degree[j]++;
    }
  }
  const minDeg = Math.min(3, n - 1);
  for (const { a: i, b: j, d } of pairs) {
    if (d > longest) break;
    const k = `${i}:${j}`;
    if (keep.has(k)) continue;
    if (degree[i] < minDeg || degree[j] < minDeg) {
      keep.add(k);
      picked.push([i, j]);
      degree[i]++;
      degree[j]++;
    }
  }

  const rot = s.tilt;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  const screen = pts.map((p) => {
    const y = p.y * cosR - p.z * sinR;
    const z = p.y * sinR + p.z * cosR;
    const persp = 2.5 / Math.max(0.5, 2.5 - z * 2);
    return { x: p.x * R * persp, y: y * R * persp, z };
  });

  for (const [i, j] of picked) {
    const pa = screen[i];
    const pb = screen[j];
    if (!Number.isFinite(pa.x) || !Number.isFinite(pb.x)) continue;
    const depth = (pa.z + pb.z) / 2;
    const dn = clamp((depth + 0.55) / 1.1, 0, 1);
    lines.push({
      x1: pa.x,
      y1: pa.y,
      x2: pb.x,
      y2: pb.y,
      depth: dn,
      alpha: (0.16 + dn * 0.62) * s.intensity,
      width: s.lineWidth * (0.7 + dn * 0.5),
      glow: s.glow * 7,
    });
  }

  for (const p of screen) {
    if (!Number.isFinite(p.x)) continue;
    const dn = clamp((p.z + 0.55) / 1.1, 0, 1);
    dots.push({
      x: p.x,
      y: p.y,
      depth: dn,
      alpha: (0.3 + dn * 0.7) * s.intensity,
      size: s.nodeSize * (0.7 + dn * 0.6),
    });
  }

  return { lines, dots };
}

/** 1 — the icosahedron, spun and shaded by depth. */
function buildPolygon(t, s, R) {
  const lines = [];
  const dots = [];

  const yaw = t * s.speed * s.spin;
  const pitch = s.tilt + Math.sin(t * s.speed * 0.31) * 0.22;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  const screen = ICOSA.verts.map(([x, y, z]) => {
    const rx = x * cy + z * sy;
    const rz = -x * sy + z * cy;
    const ry = y * cp - rz * sp;
    const rz2 = y * sp + rz * cp;
    return {
      x: rx * R * s.polygonWidth,
      y: -ry * R * s.polygonHeight,
      z: rz2,
    };
  });

  for (const [i, j] of ICOSA.edges) {
    const pa = screen[i];
    const pb = screen[j];
    const depth = (pa.z + pb.z) / 2;
    const dn = clamp((depth + 1) / 2, 0, 1);
    lines.push({
      x1: pa.x,
      y1: pa.y,
      x2: pb.x,
      y2: pb.y,
      depth: dn,
      alpha: (0.14 + Math.pow(dn, 1.35) * 0.86) * s.intensity,
      width: s.lineWidth * (0.8 + dn * 0.55),
      glow: s.glow * 8,
    });
  }

  for (const p of screen) {
    const dn = clamp((p.z + 1) / 2, 0, 1);
    dots.push({
      x: p.x,
      y: p.y,
      depth: dn,
      alpha: (0.35 + dn * 0.65) * s.intensity,
      size: s.nodeSize * (0.75 + dn * 0.55),
    });
  }

  return { lines, dots };
}

/** 2 — twisted latitude arcs with a travelling head. */
function buildSphere(t, s, R) {
  const lines = [];
  const dots = [];
  const count = s.arcs;
  if (!count) return { lines, dots };

  const segs = Math.max(8, s.segments);
  const tiltRad = s.tilt;
  const cosT = Math.cos(tiltRad);
  const sinT = Math.sin(tiltRad);

  const project = (u, lat) => {
    const lon = lat + (t * s.speed * TAU) / 24 + s.arcTwist * Math.cos(u);
    const sx = Math.sin(u) * Math.cos(lon);
    const sy = -Math.cos(u);
    const sz = Math.sin(u) * Math.sin(lon);
    const px = sx * R * s.sphereWidth;
    const py = sy * R * s.sphereHeight;
    return {
      x: px * cosT - py * sinT,
      y: px * sinT + py * cosT,
      z: sz,
    };
  };

  for (let c = 0; c < count; c++) {
    const lat = (c / count) * Math.PI;
    const unitPos = (c * 0.61803398875) % 1;
    const flow = (((t * s.speed * s.headSpeed + unitPos) % 1) + 1) % 1;

    for (let i = 0; i < segs; i++) {
      const u0 = (i / segs) * TAU;
      const u1 = ((i + 1) / segs) * TAU;
      const a = project(u0, lat);
      const b = project(u1, lat);

      const mid = (i + 0.5) / segs;
      const dist = (((flow - mid) % 1) + 1) % 1;
      const head = Math.exp(-dist * 22);
      const dn = clamp((a.z + 1) / 2, 0, 1);

      lines.push({
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        depth: dn,
        alpha: Math.min(1, (0.14 + dn * 0.6 + head * 0.8) * s.intensity),
        width: s.arcWidth * (0.55 + dn * 0.45 + head * 0.5),
        glow: s.glow * (2 + head * 6),
      });
    }

    const hp = project(flow * TAU, lat);
    const hdn = clamp((hp.z + 1) / 2, 0, 1);
    dots.push({
      x: hp.x,
      y: hp.y,
      depth: hdn,
      alpha: Math.min(1, (0.4 + hdn * 0.6) * s.intensity),
      size: s.nodeSize * 0.9,
    });
  }

  return { lines, dots };
}

const BUILDERS = [buildWireframe, buildPolygon, buildSphere];

// ---------------------------------------------------------------------------
// painting
// ---------------------------------------------------------------------------

function buildPalette(s) {
  const out = new Array(32);
  for (let i = 0; i < 32; i++) {
    const k = i / 31;
    out[i] = [0, 1, 2]
      .map((c) => Math.round(s.colorFar[c] + (s.color[c] - s.colorFar[c]) * k))
      .join(',');
  }
  return out;
}

/** Pure primaries. Added over each other they come back to white. */
const SPLIT_RGB = ['255,0,0', '0,255,0', '0,0,255'];

/**
 * Stroke a display list.
 *
 * view: { ox, oy, k, alpha } — origin, collapse scale about the origin, and the
 * shape's own opacity. Sorting back to front means the glow of a near edge
 * lands on top of a far edge instead of under it.
 */
function paint(ctx, list, view, palette) {
  const { ox, oy, k, alpha } = view;
  const lines = list.lines;
  const dots = list.dots;
  if (alpha <= 0.004) return;

  lines.sort((a, b) => a.depth - b.depth);

  // `channel` swaps the shape's own palette for one flat primary. The split needs
  // that: the object is teal, so its own red is about 5/255 and a split of the
  // real colour would show no red at all. `skipHalo` lets the extra channel
  // passes drop the halo, which is what keeps the glow from tripling.
  const chan = view.channel;
  const at = chan === undefined
    ? (depth) => palette[clamp((depth * 31) | 0, 0, 31)]
    : () => SPLIT_RGB[chan];

  ctx.lineCap = 'round';

  // halo, under everything
  if (!view.skipHalo) {
    for (const l of lines) {
      const w = l.width + l.glow;
      if (l.glow <= 0.2) continue;
      ctx.strokeStyle = `rgba(${at(l.depth)},${l.alpha * alpha * 0.11})`;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(ox + l.x1 * k, oy + l.y1 * k);
      ctx.lineTo(ox + l.x2 * k, oy + l.y2 * k);
      ctx.stroke();
    }
  }

  for (const l of lines) {
    const a = l.alpha * alpha;
    if (a < 0.004) continue;
    ctx.strokeStyle = `rgba(${at(l.depth)},${a})`;
    ctx.lineWidth = l.width * (0.45 + 0.55 * k);
    ctx.beginPath();
    ctx.moveTo(ox + l.x1 * k, oy + l.y1 * k);
    ctx.lineTo(ox + l.x2 * k, oy + l.y2 * k);
    ctx.stroke();
  }

  dots.sort((a, b) => a.depth - b.depth);
  const dotScale = 0.45 + 0.55 * k;
  for (const d of dots) {
    const a = d.alpha * alpha;
    if (a < 0.004) continue;
    const r = Math.max(0.4, (d.size / 2) * dotScale);
    const rgb = at(d.depth);

    ctx.fillStyle = `rgba(${rgb},${a * 0.14})`;
    ctx.beginPath();
    ctx.arc(ox + d.x * k, oy + d.y * k, r + 4, 0, TAU);
    ctx.fill();

    ctx.fillStyle = `rgba(${rgb},${a})`;
    ctx.beginPath();
    ctx.arc(ox + d.x * k, oy + d.y * k, r, 0, TAU);
    ctx.fill();
  }
}

/** The bright core the shapes collapse into. */
function paintCore(ctx, ox, oy, radius, alpha, s) {
  if (alpha <= 0.004) return;
  const rgb = s.coreColor.join(',');
  const r = Math.max(1.5, radius);

  const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, r * 7);
  grad.addColorStop(0, `rgba(${rgb},${alpha * 0.9})`);
  grad.addColorStop(0.18, `rgba(${s.color.join(',')},${alpha * 0.42})`);
  grad.addColorStop(1, `rgba(${s.color.join(',')},0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(ox, oy, r * 7, 0, TAU);
  ctx.fill();

  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.beginPath();
  ctx.arc(ox, oy, r, 0, TAU);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// transition timeline
// ---------------------------------------------------------------------------

/**
 * Resolve a fractional stage position into everything needed to draw one frame.
 *
 * `stage` is 0..SHAPE_NAMES.length-1, continuous. `floor(stage)` is the shape we
 * came from and the fraction is how far we have travelled toward the next one,
 * so a single slot always morphs in one direction. Nothing here reads the sign
 * of the scroll delta: the output depends only on position, which is what makes
 * scrolling back up play the whole thing backwards for free.
 *
 * The fraction is split three ways — a hold at each end and one transition
 * between them — so the shape sits still while a section is on screen and only
 * moves during the travel between two sections.
 */
function resolveTransition(stage, s, slotCount) {
  const last = slotCount - 1;
  const clamped = clamp(stage, 0, last);
  const slot = Math.floor(clamped);
  const f = clamped - slot;

  const from = clamp(slot, 0, last);
  const to = clamp(slot + 1, 0, last);

  const hold = clamp(s.holdZone, 0, 0.49);
  const h = to === from ? 0 : clamp((f - hold) / (1 - 2 * hold), 0, 1);

  const settledAt = (index) => ({
    from: index,
    to: index,
    focus: index,
    t: 0,
    core: 0,
    fromAlpha: 1,
    fromK: 1,
    toAlpha: 0,
    toK: 0,
    settled: true,
  });

  if (to === from || h <= 0) return settledAt(from);

  const split = s.collapseShare;
  const ease = EASES[s.expandEase];

  if (h < split) {
    const u = h / split; // 0..1 through the collapse
    return {
      from,
      to,
      focus: from,
      t: h,
      core: smoothstep(u * 1.15),
      fromAlpha: 1 - smoothstep(u),
      fromK: 1 - easeInCubic(u),
      toAlpha: 0,
      toK: 0,
      settled: false,
    };
  }

  const u = (h - split) / (1 - split); // 0..1 through the expand
  if (u >= 1) return settledAt(to);
  return {
    from,
    to,
    focus: to, // the moment the new shape starts growing is the moment it takes over
    t: h,
    core: 1 - smoothstep(u / 0.4),
    fromAlpha: 0,
    fromK: 0,
    toAlpha: clamp(u / 0.16, 0, 1),
    toK: 1 - ease(u),
    settled: false,
  };
}

// ---------------------------------------------------------------------------
// scroll
// ---------------------------------------------------------------------------

/**
 * Document-absolute top of an element.
 *
 * The offsetParent chain rather than `offsetTop` alone: a section is usually
 * nested inside a positioned wrapper (the scrolly grid sits in a
 * `position: relative` section), and `offsetTop` on its own would then be
 * measured from that wrapper instead of the page.
 */
function docTop(el) {
  let y = 0;
  let node = el;
  while (node) {
    y += node.offsetTop || 0;
    node = node.offsetParent;
  }
  return y;
}

/**
 * Where each stage sits in the scroll.
 *
 * A section anchors a stage at the scroll position that centres the section in
 * the viewport. Between two anchors the stage value is linear, so the morph
 * tracks the scroll exactly and reverses when the scroll does.
 */
function collectAnchors(sections, viewportHeight) {
  return sections.map((el) => docTop(el) + el.offsetHeight / 2 - viewportHeight / 2);
}

function stageFromScroll(anchors, scrollY) {
  if (anchors.length === 0) return 0;
  if (anchors.length === 1) return 0;
  if (scrollY <= anchors[0]) return 0;

  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (scrollY <= b) {
      const span = b - a;
      return span <= 1e-6 ? i + 1 : i + (scrollY - a) / span;
    }
  }
  return anchors.length - 1;
}

// ---------------------------------------------------------------------------
// mount
// ---------------------------------------------------------------------------

/**
 * Mount the morph on a container element.
 *
 * options:
 *   settings      any field from DEFAULTS
 *   sections      elements that anchor each stage (defaults to sectionSelector)
 *   shapes        subset of SHAPE_NAMES to cycle through, in order
 *   pointerEl     element that listens for pointermove (defaults to window)
 *   onStage       called with (stageFloat, index) whenever the active shape changes
 *
 * Returns a handle: { canvas, settings, stage, index, transition, stop,
 * setStage(n), refresh() }.
 */
export function createShapeMorph(container, options = {}) {
  const s = resolveSettings(options.settings || {});

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;pointer-events:none';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return { canvas, settings: s, stage: 0, index: 0, transition: null, stop: () => {}, setStage: () => {}, refresh: () => {} };
  }

  const sections = options.sections
    ? Array.from(options.sections)
    : Array.from(document.querySelectorAll(s.sectionSelector));

  // Which shapes this instance can show, and in what order. Pass
  // `shapes: ['polygon']` for a single object; pass `slots` as well and it still
  // gets one stage position per section.
  const picked = (options.shapes || SHAPE_NAMES)
    .map((name) => SHAPE_NAMES.indexOf(name))
    .filter((i) => i >= 0);
  const builders = picked.length ? picked.map((i) => BUILDERS[i]) : BUILDERS;

  // Stage positions can outnumber shapes. `slots: 3` with one shape gives three
  // places for the object to be, so it collapses to the dot and re-expands
  // between them rather than sitting perfectly still through the whole section.
  const slotCount = Math.max(1, Math.round(options.slots || builders.length));
  const builderAt = (slot) => builders[clamp(slot, 0, slotCount - 1) % builders.length];

  const pointer = { x: 0, y: 0, active: false };
  let time = 0;
  let rafId = 0;
  let lastTime = performance.now();
  let visible = true;
  let width = 1;
  let height = 1;
  let anchors = [];
  let scrollY = 0;
  let manual = null; // set by setStage, wins over scroll

  /** Smoothed scroll value, so a jittery wheel does not jitter the shape. */
  let smoothStage = null;
  let lastIndex = -1;

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  const handle = {
    canvas,
    settings: s,
    frames: 0,
    stage: 0,
    index: 0,
    transition: null,
    stop: null,
    onStage: options.onStage || null,
    setStage(v) {
      manual = v;
    },
    releaseStage() {
      manual = null;
    },
    refresh() {
      anchors = collectAnchors(sections, window.innerHeight);
    },
  };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    handle.refresh();
  };

  const onPointerMove = (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
    pointer.active =
      pointer.x >= 0 && pointer.x <= rect.width && pointer.y >= 0 && pointer.y <= rect.height;
  };
  const onPointerOut = (event) => {
    if (!event.relatedTarget) pointer.active = false;
  };
  const onScroll = () => {
    scrollY = window.scrollY;
  };
  const onVisibilityChange = () => {
    lastTime = performance.now();
  };

  const draw = (delta) => {
    handle.frames++;
    ctx.clearRect(0, 0, width, height);

    const reduced = motionQuery.matches;
    const rate = reduced ? 0.15 : 1;
    time += delta * rate;

    // --- where are we -----------------------------------------------------
    const target = manual !== null ? manual : s.scrollDriven ? stageFromScroll(anchors, scrollY) : 0;
    if (smoothStage === null || s.smoothing <= 0 || manual !== null) {
      smoothStage = target;
    } else {
      const k = 1 - Math.exp(-delta * s.smoothing);
      smoothStage += (target - smoothStage) * k;
    }
    const stage = clamp(smoothStage, 0, slotCount - 1);
    handle.stage = stage;

    const state = resolveTransition(stage, s, slotCount);
    handle.transition = state;

    if (state.focus !== lastIndex) {
      lastIndex = state.focus;
      handle.index = state.focus;
      handle.onStage?.(stage, state.focus);
    }

    const R = Math.min(width, height) * s.scale;
    const ox = width / 2;
    const oy = height / 2;
    const palette = buildPalette(s);

    // --- pointer displacement -----------------------------------------------
    // Each dot is pushed away from the cursor. The force falls off with the
    // inverse square of distance, creating a magnetic ripple that distorts the
    // rigid geometry into something organic. Lines follow their endpoints.
    const ptrActive = pointer.active && !reduced;
    const ptrRadius = R * 1.8;   // influence radius in screen px
    const ptrStrength = R * 0.35; // max displacement at zero distance

    function displace(list) {
      if (!ptrActive) return list;
      const mx = pointer.x - ox;
      const my = pointer.y - oy;
      const off = {};

      // Displace dots first, record offsets by index.
      for (let i = 0; i < list.dots.length; i++) {
        const d = list.dots[i];
        const dx = d.x - mx;
        const dy = d.y - my;
        const dist = Math.hypot(dx, dy);
        if (dist < 1 || dist > ptrRadius) { off[i] = [0, 0]; continue; }
        const force = (1 - dist / ptrRadius);
        const push = force * force * ptrStrength;
        const nx = dx / dist;
        const ny = dy / dist;
        off[i] = [nx * push, ny * push];
        d.x += off[i][0];
        d.y += off[i][1];
        // Brighten displaced dots — the chaos glows.
        d.alpha = Math.min(1, d.alpha + force * 0.35);
        d.size *= 1 + force * 0.25;
      }

      // Lines reference endpoints. Displace each vertex directly.
      for (const l of list.lines) {
        const verts = [
          { xk: 'x1', yk: 'y1', px: l.x1, py: l.y1 },
          { xk: 'x2', yk: 'y2', px: l.x2, py: l.y2 },
        ];
        for (const v of verts) {
          const dx = v.px - mx;
          const dy = v.py - my;
          const dist = Math.hypot(dx, dy);
          if (dist < 1 || dist > ptrRadius) continue;
          const force = (1 - dist / ptrRadius);
          const push = force * force * ptrStrength * 0.7;
          const nx = dx / dist;
          const ny = dy / dist;
          l[v.xk] += nx * push;
          l[v.yk] += ny * push;
        }
      }

      return list;
    }

    // --- chromatic split ---------------------------------------------------
    // While the cursor is on the object the same display list is stroked once per
    // primary, each pass shifted along y and added to the others, so overlapping
    // runs recombine and only the edges fringe. The offset rides the same
    // proximity curve as the distortion, squared, so the split opens as the cursor
    // closes in and shuts again when it leaves. Under reduced motion the pointer is
    // already ignored, so this cannot run there.
    let splitPx = 0;
    if (s.split > 0 && ptrActive) {
      const reach = ptrRadius * s.splitReach;
      const near = clamp(1 - Math.hypot(pointer.x - ox, pointer.y - oy) / reach, 0, 1);
      splitPx = near * near * s.split;
    }

    /** Stroke one list, split into channels when the pointer is close enough. */
    const render = (list, view) => {
      if (splitPx <= 0.35) { paint(ctx, list, view, palette); return; }
      const prevOp = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      for (let c = 0; c < 3; c++) {
        paint(ctx, list, {
          ox: view.ox,
          oy: view.oy + (c === 0 ? -splitPx : c === 2 ? splitPx : 0),
          k: view.k,
          alpha: view.alpha * s.splitAlpha,
          channel: c,
          skipHalo: c !== 1,   // one halo only, or the glow doubles up
        }, palette);
      }
      ctx.globalCompositeOperation = prevOp;
    };

    // --- draw -------------------------------------------------------------
    if (reduced) {
      // no theatre: show the shape the scroll points at, fully formed
      const shape = clamp(Math.round(stage), 0, slotCount - 1);
      if (shape !== lastIndex) {
        lastIndex = shape;
        handle.index = shape;
        handle.onStage?.(stage, shape);
      }
      const list = displace(builderAt(shape)(time, s, R));
      render(list, { ox, oy, k: 1, alpha: 1 });
      return;
    }

    if (state.settled) {
      const list = displace(builderAt(state.from)(time, s, R));
      render(list, { ox, oy, k: 1, alpha: 1 });
    } else {
      if (state.fromAlpha > 0.004) {
        const out = displace(builderAt(state.from)(time, s, R));
        render(out, { ox, oy, k: state.fromK, alpha: state.fromAlpha });
      }
      if (state.toAlpha > 0.004) {
        const into = displace(builderAt(state.to)(time, s, R));
        render(into, { ox, oy, k: state.toK, alpha: state.toAlpha });
      }
      paintCore(ctx, ox, oy, Math.max(2.2, R * 0.028), state.core, s);
    }
  };

  const tick = (now) => {
    const delta = Math.min(50, now - lastTime) / 1000;
    lastTime = now;

    if (visible && !document.hidden) {
      draw(delta);
    }
    rafId = requestAnimationFrame(tick);
  };

  resize();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      visible = entries[0]?.isIntersecting ?? true;
      lastTime = performance.now();
    },
    { threshold: 0 },
  );
  intersectionObserver.observe(canvas);

  scrollY = window.scrollY;
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', handle.refresh);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerout', onPointerOut, { passive: true });
  document.addEventListener('visibilitychange', onVisibilityChange);

  // fonts and images can move the sections after first paint
  handle.refresh();
  requestAnimationFrame(() => handle.refresh());

  // The webfont lands later than both of those. When it swaps in the panels change
  // height, so the anchors measured above go stale and the shapes peak slightly off
  // their panels until something else forces a re-measure.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => handle.refresh());
  }

  rafId = requestAnimationFrame(tick);

  handle.stop = () => {
    cancelAnimationFrame(rafId);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', handle.refresh);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerout', onPointerOut);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    canvas.remove();
  };

  return handle;
}

export default createShapeMorph;
