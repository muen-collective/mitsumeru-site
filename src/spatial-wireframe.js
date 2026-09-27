/**
 * Spatial Wireframe — canvas background.
 *
 * A drifting cloud of points wired together as a minimum spanning tree, redrawn
 * every frame as the points move. The tree rebuilds as the points swim, with a
 * small discount on edges that already exist so the shape does not flicker.
 *
 * Points can be dragged. Dragging writes a manual screen offset onto that
 * vertex, which survives the automatic drift.
 *
 * No dependencies. ES module.
 */

const TAU = Math.PI * 2;

// Golden angle, for spreading points over a sphere.
const GOLDEN = 2.399963229728653;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const DEFAULTS = {
  // --- points ------------------------------------------------------------
  vertexCount: 5, // 1..300
  nodeSpacing: 0.8, // size of the cloud
  driftAmplitude: 0.65, // how far points swim

  // --- wireframe ---------------------------------------------------------
  connectionDensity: 0, // 0..1, extra edges beyond the spanning tree
  lineWidth: 1.5,
  lineOpacity: 0.7,
  nodeSize: 5, // px, diameter
  glow: 0.7, // 0..2

  // --- shape -------------------------------------------------------------
  shapeWidth: 0.75, // radius as a fraction of min(width, height)
  shapeHeight: 0.7,
  twist: 0.4, // rad, phase shift inside the drift
  rotation: 18, // deg, pitch toward the viewer
  tilt: -10, // deg, screen roll

  // --- motion ------------------------------------------------------------
  speed: 1, // 0..3

  // --- colour ------------------------------------------------------------
  baseColor: [242, 240, 234],
  colorEnd: [135, 187, 255],
  gradient: false, // mix base -> end across depth
  intensity: 1,

  // --- pointer -----------------------------------------------------------
  pointerRange: 0.25, // fraction of min(width, height)
  pointerHighlight: 1, // 0..3

  // --- drag --------------------------------------------------------------
  draggable: true,
  dragRadius: 12, // minimum hit radius in px

  // --- scroll ------------------------------------------------------------
  scrollDriven: false,
  startProgress: 0.25,
  endProgress: 0.45,
  fadeRange: 0.4,
};

function resolveSettings(input) {
  const s = { ...DEFAULTS, ...input };
  s.vertexCount = Math.round(clamp(s.vertexCount, 0, 1000));
  return s;
}

/**
 * Point positions on a sphere of radius nodeSpacing/2, each nudged around by a
 * slow per-point drift. The whole cloud then spins about the Y axis by `time`.
 *
 * The three drift terms use different periods (1+i%3, 2+i%2, 1+i%4) so the
 * points never move in lockstep.
 */
function computeVertices(time, s) {
  const count = s.vertexCount;
  if (!Number.isSafeInteger(count) || count < 1 || count > 1000) return [];

  const a = (time * TAU) / 24;
  const radius = s.nodeSpacing * 0.5;
  const drift = s.driftAmplitude * 0.2;
  const points = [];

  for (let i = 0; i < count; i++) {
    // Fibonacci sphere
    const y = 1 - (2 * (i + 0.5)) / count;
    const r = Math.sqrt(1 - y * y);
    const phi = i * GOLDEN;

    const x = r * Math.cos(phi) * radius + drift * Math.sin(a * (1 + (i % 3)) + i * 1.71);
    const py = y * radius + drift * Math.sin(a * (2 + (i % 2)) + i * 2.37);
    const z = r * Math.sin(phi) * radius + drift * Math.cos(a * (1 + (i % 4)) + i * 3.13 + s.twist);

    // spin about the Y axis
    points.push({
      x: x * Math.cos(a) + z * Math.sin(a),
      y: py,
      z: -x * Math.sin(a) + z * Math.cos(a),
    });
  }

  // keep the cloud centred on the origin
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const p of points) {
    cx += p.x / count;
    cy += p.y / count;
    cz += p.z / count;
  }
  for (const p of points) {
    p.x -= cx;
    p.y -= cy;
    p.z -= cz;
  }
  return points;
}

/**
 * Edges for the wireframe.
 *
 * A minimum spanning tree over the 3D distances gives a connected shape with no
 * loose points. Then every vertex is topped up to at least `minDeg` edges, and
 * `density` adds a share of whatever pairs are left.
 *
 * Edges present in `prevEdges` cost 15% less, which keeps the tree from
 * thrashing while the points move.
 */
function computeEdges(points, density, prevEdges) {
  const n = points.length;
  if (n < 2) return [];

  const key = (a, b) => `${Math.min(a, b)}:${Math.max(a, b)}`;
  const prevSet = new Set(prevEdges.map(([a, b]) => key(a, b)));

  const pairs = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      const dz = points[i].z - points[j].z;
      pairs.push({ a: i, b: j, cost: Math.hypot(dx, dy, dz) * (prevSet.has(key(i, j)) ? 0.85 : 1) });
    }
  }
  pairs.sort((p, q) => p.cost - q.cost || p.a - q.a || p.b - q.b);

  const parent = Array.from({ length: n }, (_, i) => i);
  const degree = new Array(n).fill(0);
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };

  const edges = [];
  const seen = new Set();
  const addEdge = (a, b) => {
    const k = key(a, b);
    if (seen.has(k)) return;
    seen.add(k);
    edges.push([a, b]);
    degree[a]++;
    degree[b]++;
  };

  for (const { a, b } of pairs) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent[ra] = rb;
      addEdge(a, b);
    }
  }

  const minDeg = Math.min(3, n - 1);
  for (const { a, b } of pairs) {
    if (degree[a] < minDeg || degree[b] < minDeg) addEdge(a, b);
  }

  let extra = Math.round((pairs.length - edges.length) * clamp(density, 0, 1));
  for (const { a, b } of pairs) {
    if (!extra) break;
    if (!seen.has(key(a, b))) {
      addEdge(a, b);
      extra--;
    }
  }

  return edges.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
}

function scrollProgress() {
  const doc = document.documentElement;
  const max = doc.scrollHeight - window.innerHeight;
  return max > 0 ? window.scrollY / max : 0;
}

/** Fade the whole scene in and out over a slice of page scroll. 0..1. */
function scrollOpacity(s) {
  if (!s.scrollDriven) return 1;
  if (document.documentElement.scrollHeight <= window.innerHeight + 1) return 1;

  const start = Math.min(s.startProgress, s.endProgress);
  const end = Math.max(s.startProgress, s.endProgress);
  if (end - start <= 0.001) return 0;

  const progress = scrollProgress();
  const fadeZone = (end - start) * clamp(s.fadeRange, 0.02, 0.5);
  const fadeIn = start <= 0.001 ? 1 : clamp((progress - start) / fadeZone, 0, 1);
  const fadeOut = end >= 0.999 ? 1 : clamp((end - progress) / fadeZone, 0, 1);
  return Math.min(fadeIn, fadeOut);
}

/** Colour of a point at depth `t`, 0..1 from back to front. */
function colorAt(s, t) {
  const base = s.baseColor;
  if (!s.gradient) return base.join(',');

  const k = clamp(t, 0, 1);
  const end = s.colorEnd;
  return [0, 1, 2].map((i) => Math.round(base[i] + (end[i] - base[i]) * k)).join(',');
}

/**
 * Mount the effect on a container element.
 *
 * options:
 *   settings   any field from DEFAULTS
 *
 * Returns a handle: { canvas, settings, frames, opacity, stop }.
 */
export function createSpatialWireframe(container, options = {}) {
  const s = resolveSettings(options.settings || {});

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:pan-y';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return { canvas, settings: s, frames: 0, opacity: 1, stop: () => {} };
  }

  const pointer = { x: 0, y: 0, active: false };

  let time = 0;
  let rafId = 0;
  let lastTime = performance.now();
  let visible = true;
  let width = 1;
  let height = 1;

  let prevEdges = [];
  let prevEdgeCount = 0;

  /** Manual screen offset per vertex, written by dragging. */
  let offsets = [];
  /** Total offset a vertex needs to reach its drag target. */
  let pending = [];
  /** Smoothed pointer highlight per vertex, 0..1. */
  let heat = [];
  /** Last projected screen position per vertex. */
  let projected = [];
  let drag = null;

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  const handle = {
    canvas,
    settings: s,
    frames: 0,
    opacity: 1,
    stop: null,
  };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const onPointerMove = (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    pointer.x = x;
    pointer.y = y;
    pointer.active = x >= 0 && x <= rect.width && y >= 0 && y <= rect.height;
  };

  const onPointerOut = (event) => {
    if (!event.relatedTarget) pointer.active = false;
  };

  const onVisibilityChange = () => {
    lastTime = performance.now();
  };

  // --- dragging ---------------------------------------------------------

  const localCoords = (e) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const hitVertex = (coords, radius) => {
    let best = -1;
    let bestDist = radius;
    projected.forEach((p, i) => {
      const d = Math.hypot(p.x - coords.x, p.y - coords.y);
      const closer = d < bestDist;
      const tie = Math.abs(d - bestDist) < 0.001 && (best < 0 || p.z > projected[best].z);
      if (d <= radius && (closer || tie)) {
        best = i;
        bestDist = d;
      }
    });
    return best;
  };

  const onPointerDown = (e) => {
    if (!s.draggable || e.button !== 0 || drag || s.nodeSize <= 0) return;

    const coords = localCoords(e);
    const idx = hitVertex(coords, Math.max(s.dragRadius, s.nodeSize / 2 + 6));
    if (idx < 0) return;

    e.preventDefault();
    const p = projected[idx];
    drag = {
      index: idx,
      pointerId: e.pointerId,
      target: { x: p.x, y: p.y },
      grab: { x: p.x - coords.x, y: p.y - coords.y },
    };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  };

  const onPointerDrag = (e) => {
    const coords = localCoords(e);
    if (drag && drag.pointerId === e.pointerId) {
      drag.target = { x: coords.x + drag.grab.x, y: coords.y + drag.grab.y };
      e.preventDefault();
    } else if (s.draggable && s.nodeSize > 0) {
      canvas.style.cursor =
        hitVertex(coords, Math.max(s.dragRadius, s.nodeSize / 2 + 6)) >= 0 ? 'grab' : 'default';
    }
  };

  const onPointerUp = (e) => {
    if (!drag || drag.pointerId !== e.pointerId) return;

    const i = drag.index;
    const p = projected[i];
    if (p && offsets[i]) {
      offsets[i].x += pending[i].x;
      offsets[i].y += pending[i].y;
    }
    pending[i] = { x: 0, y: 0 };
    drag = null;
    canvas.style.cursor = 'default';
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };

  // --- drawing ----------------------------------------------------------

  const draw = (delta) => {
    const s = handle.settings;
    handle.frames++;

    ctx.clearRect(0, 0, width, height);
    if (!s.vertexCount) return;

    const reducedMotion = motionQuery.matches;
    time = (time + delta * s.speed * (reducedMotion ? 0.025 : 1)) % 48;

    const basePoints = computeVertices(time, s);
    if (basePoints.length === 0) return;

    if (offsets.length !== basePoints.length) offsets = basePoints.map(() => ({ x: 0, y: 0 }));
    if (pending.length !== basePoints.length) pending = basePoints.map(() => ({ x: 0, y: 0 }));
    if (heat.length !== basePoints.length) heat = basePoints.map(() => 0);

    const minDim = Math.min(width, height);
    const rotRad = (s.rotation * Math.PI) / 180;
    const tiltRad = (s.tilt * Math.PI) / 180;
    const cosT = Math.cos(tiltRad);
    const sinT = Math.sin(tiltRad);

    const next = [];
    for (let i = 0; i < basePoints.length; i++) {
      const p = basePoints[i];

      // pitch toward the viewer
      const ry = p.y * Math.cos(rotRad) - p.z * Math.sin(rotRad);
      const rz = p.y * Math.sin(rotRad) + p.z * Math.cos(rotRad);

      // perspective
      const persp = 2.5 / Math.max(0.5, 2.5 - rz);
      const sx = p.x * minDim * s.shapeWidth * persp;
      const sy = ry * minDim * s.shapeHeight * persp;

      let x = width / 2 + sx * cosT - sy * sinT;
      let y = height / 2 + sx * sinT + sy * cosT;

      // A dragged vertex rides the cursor exactly. On release the offset that
      // took it there is folded into `offsets`, so it stays put afterwards.
      if (drag && drag.index === i) {
        pending[i].x = drag.target.x - x;
        pending[i].y = drag.target.y - y;
        x = drag.target.x;
        y = drag.target.y;
      } else {
        x += offsets[i].x;
        y += offsets[i].y;
      }

      // pointer highlight, eased toward its target
      const smooth = 1 - Math.exp(-Math.max(0, delta) * 10);
      let target = 0;
      if (pointer.active && !reducedMotion) {
        const dist = Math.hypot(x - pointer.x, y - pointer.y);
        const range = minDim * s.pointerRange;
        if (range > 0 && dist < range) {
          target = Math.pow(Math.max(0, 1 - dist / range), 2) * s.pointerHighlight;
        }
      }
      heat[i] += (target - heat[i]) * smooth;

      next.push({ x, y, z: rz, heat: heat[i] });
    }
    projected = next;

    // edges over the projected positions, so proximity is measured in pixels
    const normalized = next.map((p) => ({
      x: (p.x - width / 2) / minDim,
      y: (p.y - height / 2) / minDim,
      z: p.z,
    }));
    const prev = prevEdgeCount === s.vertexCount ? prevEdges : [];
    const edges = computeEdges(normalized, s.connectionDensity, prev);
    prevEdges = edges;
    prevEdgeCount = s.vertexCount;

    ctx.lineCap = 'round';

    // edges, back to front
    if (s.lineWidth > 0) {
      const sorted = [...edges].sort((a, b) => {
        return next[a[0]].z + next[a[1]].z - (next[b[0]].z + next[b[1]].z);
      });

      for (const [i, j] of sorted) {
        const pa = next[i];
        const pb = next[j];
        if (!Number.isFinite(pa.x) || !Number.isFinite(pa.y)) continue;
        if (!Number.isFinite(pb.x) || !Number.isFinite(pb.y)) continue;

        const edgeHeat = Math.max(pa.heat, pb.heat);
        const depth = (pa.z + pb.z) / 2;
        const alpha = Math.min(
          1,
          (s.lineOpacity * Math.max(0.18, Math.min(1, 0.55 + (pa.z + pb.z) * 0.35)) +
            edgeHeat * 0.45) *
            s.intensity,
        );
        const rgb = colorAt(s, (depth + 1) / 2);

        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);

        if (s.glow > 0) {
          ctx.strokeStyle = `rgba(${rgb},${alpha * 0.08})`;
          ctx.lineWidth = s.lineWidth + Math.min(12, s.glow * 5);
          ctx.stroke();
        }

        ctx.strokeStyle = `rgba(${rgb},${alpha})`;
        ctx.lineWidth = s.lineWidth * (1 + Math.min(0.3, edgeHeat * 0.2));
        ctx.stroke();
      }
    }

    // nodes, back to front
    if (s.nodeSize > 0) {
      const sorted = [...next].sort((a, b) => a.z - b.z);
      for (const p of sorted) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;

        const rgb = colorAt(s, (p.z + 1) / 2);

        if (p.heat > 0.01) {
          ctx.fillStyle = `rgba(${rgb},${Math.min(0.2, p.heat * 0.12) * s.intensity})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, s.nodeSize / 2 + Math.min(12, p.heat * 5), 0, TAU);
          ctx.fill();
        }

        const alpha = Math.min(
          1,
          (s.lineOpacity * Math.max(0.25, 0.7 + p.z * 0.3) + p.heat * 0.45) * s.intensity,
        );
        ctx.fillStyle = `rgba(${rgb},${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, (s.nodeSize / 2) * (1 + Math.min(0.3, p.heat * 0.2)), 0, TAU);
        ctx.fill();
      }
    }
  };

  const tick = (now) => {
    const delta = Math.min(50, now - lastTime) / 1000;
    lastTime = now;

    if (visible && !document.hidden) {
      const opacity = scrollOpacity(handle.settings);
      handle.opacity = opacity;
      container.style.opacity = String(opacity);
      if (opacity <= 0.02) {
        ctx.clearRect(0, 0, width, height);
      } else {
        draw(delta);
      }
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

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerout', onPointerOut, { passive: true });
  document.addEventListener('visibilitychange', onVisibilityChange);

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerDrag);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('lostpointercapture', onPointerUp);

  rafId = requestAnimationFrame(tick);

  handle.stop = () => {
    cancelAnimationFrame(rafId);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerout', onPointerOut);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    canvas.remove();
  };

  return handle;
}

export default createSpatialWireframe;
