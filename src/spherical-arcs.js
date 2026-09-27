/**
 * Spherical Arcs — canvas background.
 *
 * A sphere of twisted latitude arcs, drawn as 2D canvas strokes. Each arc runs
 * from pole to pole; a `twist` term rotates its longitude by cos(u), which is
 * what turns plain latitude circles into the crossing spiral you see. A moving
 * bright head travels along every arc, and the pointer lights up a growing cap
 * on the sphere surface.
 *
 * No dependencies. ES module.
 */

const TAU = Math.PI * 2;

// Cubic ease that pairs min -> median -> max around the 0.5 mark.
const thicknessAt = (t, min, median, max) =>
  t < 0.5
    ? min + (median - min) * (1 - Math.pow(1 - t * 2, 3))
    : median + (max - median) * Math.pow(t * 2 - 1, 3);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const DEFAULTS = {
  // --- shape -------------------------------------------------------------
  curveCount: 20, // number of arcs, pole to pole
  sphereWidth: 0.63, // radius as a fraction of min(width, height)
  sphereHeight: 0.66,
  tilt: -10, // deg, screen roll of the whole sphere
  rotation: 18, // deg, pitch the sphere toward the viewer
  twist: 0.65, // rad, how much each arc's longitude drifts with latitude

  // --- line --------------------------------------------------------------
  minSize: 1.5, // px, thinnest arc
  medianSize: 1.5, // px
  maxSize: 1.5, // px, thickest arc
  lineOpacity: 0.65,
  glow: 0.85, // 0..2, width of the soft halo around each stroke
  segments: 48, // stroke segments per arc

  // --- motion ------------------------------------------------------------
  speed: 1.4, // 0..3, rotation rate
  headSpeed: 1 / 8, // how fast the bright head laps an arc

  // --- colour ------------------------------------------------------------
  baseColor: [242, 240, 234], // off-white
  activationColor: [255, 143, 159], // pink
  activationColorEnd: [135, 187, 255], // ice blue
  activationGradient: true, // mix the two colours across the sphere
  intensity: 1,

  // --- pointer activation ------------------------------------------------
  hoverActivation: true,
  activationBrightness: 1.25,
  activationSpeed: 1, // how fast the lit cap spreads
  activationFade: 1.2, // seconds to fade out after the pointer leaves

  // --- scroll ------------------------------------------------------------
  scrollDriven: false, // fade in and out with page scroll
  startProgress: 0.15,
  endProgress: 0.35,
  fadeRange: 0.4, // softness of the fade at each end
};

function resolveSettings(input) {
  const s = { ...DEFAULTS, ...input };
  s.maxSize = Math.max(s.minSize, s.maxSize);
  s.medianSize = clamp(s.medianSize, s.minSize, s.maxSize);
  s.curveCount = Math.round(clamp(s.curveCount, 0, 1000));
  return s;
}

/**
 * One point of an arc.
 *
 * u    latitude angle, 0..PI (0 = north pole)
 * lat  arc index angle, 0..PI
 * time animation clock
 */
function projectPoint(u, lat, time, width, height, s) {
  const lon = lat + (time * TAU) / 24 + s.twist * Math.cos(u);

  // unit sphere
  const sx = Math.sin(u) * Math.cos(lon);
  const sy = -Math.cos(u);
  const sz = Math.sin(u) * Math.sin(lon);

  // pitch toward the viewer
  const rotRad = (s.rotation * Math.PI) / 180;
  const ry = sy * Math.cos(rotRad) - sz * Math.sin(rotRad);
  const rz = sy * Math.sin(rotRad) + sz * Math.cos(rotRad);

  const r = Math.min(width, height);
  const px = sx * r * s.sphereWidth;
  const py = ry * r * s.sphereHeight;

  // screen roll
  const tiltRad = (s.tilt * Math.PI) / 180;
  const cosT = Math.cos(tiltRad);
  const sinT = Math.sin(tiltRad);

  return {
    x: width / 2 + px * cosT - py * sinT,
    y: height / 2 + px * sinT + py * cosT,
    depth: rz,
    surface: { x: sx, y: ry, z: rz },
  };
}

function emptyActivation() {
  return { inside: false, source: null, cursor: null, radius: 0, presence: 0 };
}

/** Map a screen point back onto the sphere surface, or null if it misses. */
function hitSphere(pointer, width, height, s) {
  if (!pointer.active || s.sphereWidth <= 0 || s.sphereHeight <= 0) return null;

  const tiltRad = (s.tilt * Math.PI) / 180;
  const cosT = Math.cos(tiltRad);
  const sinT = Math.sin(tiltRad);
  const dx = pointer.x - width / 2;
  const dy = pointer.y - height / 2;
  const r = Math.min(width, height);

  const u = (dx * cosT + dy * sinT) / (r * s.sphereWidth);
  const v = (-dx * sinT + dy * cosT) / (r * s.sphereHeight);
  const f = u * u + v * v;
  if (!Number.isFinite(f) || f > 1) return null;

  return { x: u, y: v, z: Math.sqrt(Math.max(0, 1 - f)) };
}

/** Great-circle angle between two surface points, 0..PI. */
function sphereAngle(a, b) {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z;
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

/** How strongly a surface point is lit right now, 0..~1.35. */
function activationAt(surface, state) {
  if (!state.source || state.presence === 0) return 0;

  const dist = sphereAngle(surface, state.source);
  // a soft cap of angular radius `radius`, feathered over 0.35 rad
  const ringPos = clamp((state.radius + 0.35 - dist) / 0.35, 0, 1);
  const ring = ringPos * ringPos * (3 - 2 * ringPos);

  const cursorGlow = state.cursor
    ? Math.exp(-Math.pow(sphereAngle(surface, state.cursor) / 0.3, 2))
    : 0;

  return state.presence * ring * (1 + 0.35 * cursorGlow);
}

function updateActivation(prev, pointer, width, height, s, delta, reducedMotion) {
  if (!s.hoverActivation) return emptyActivation();

  const hit = hitSphere(pointer, width, height, s);
  if (hit) {
    const isNew = !prev.source || prev.presence === 0;
    return {
      inside: true,
      source: isNew ? hit : prev.source,
      cursor: hit,
      radius: reducedMotion
        ? Math.PI
        : Math.min(Math.PI, (isNew ? 0 : prev.radius) + delta * s.activationSpeed * Math.PI),
      presence: Math.min(1, (isNew ? 0 : prev.presence) + delta * 5),
    };
  }

  const fade = s.activationFade === 0 ? 0 : Math.max(0, prev.presence - delta / s.activationFade);
  if (fade === 0) return emptyActivation();
  return { ...prev, inside: false, presence: fade };
}

/** Mix base -> activation colour by how lit the point is. */
function surfaceColor(s, activation, gradientPos) {
  const a = clamp(activation, 0, 1);
  const g = s.activationGradient ? clamp(gradientPos, 0, 1) : 0;
  const base = s.baseColor;
  const start = s.activationColor;
  const end = s.activationColorEnd;

  return [0, 1, 2]
    .map((i) => {
      const mix = start[i] + (end[i] - start[i]) * g;
      return Math.round(base[i] + (mix - base[i]) * a);
    })
    .join(',');
}

function scrollProgress() {
  const doc = document.documentElement;
  const max = doc.scrollHeight - window.innerHeight;
  return max > 0 ? window.scrollY / max : 0;
}

/**
 * Fade the whole scene in and out over a slice of page scroll.
 * Returns 0..1.
 */
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

/**
 * Mount the effect on a container element.
 *
 * options:
 *   settings   any field from DEFAULTS
 *   pointerEl  element that listens for pointermove (defaults to container)
 *
 * Returns an undo function.
 */
export function createSphericalArcs(container, options = {}) {
  const s = resolveSettings(options.settings || {});
  const host = options.pointerEl || container;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;pointer-events:none';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return () => {};
  }

  const pointer = { x: 0, y: 0, active: false };
  let activation = emptyActivation();
  let time = 0;
  let rafId = 0;
  let lastTime = performance.now();
  let visible = true;
  let width = 1;
  let height = 1;

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  // The handle callers get back: the animation controls plus a `settings`
  // object that is read fresh on every frame, so live tuning needs no restart.
  const handle = {
    canvas,
    settings: s,
    frames: 0,
    opacity: 1,
    stop: null,
    setTime(t) {
      time = t;
    },
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
    const inside = x >= 0 && x <= rect.width && y >= 0 && y <= rect.height;
    pointer.x = x;
    pointer.y = y;
    pointer.active = inside;
  };

  const onPointerOut = (event) => {
    if (!event.relatedTarget) pointer.active = false;
  };
  const onVisibilityChange = () => {
    lastTime = performance.now();
  };

  const draw = (delta) => {
    const s = handle.settings;
    handle.frames++;
    ctx.clearRect(0, 0, width, height);
    if (!s.curveCount) return;

    const reducedMotion = motionQuery.matches;
    time = (time + delta * s.speed * (reducedMotion ? 0.025 : 1)) % 24;
    activation = updateActivation(activation, pointer, width, height, s, delta, reducedMotion);

    ctx.lineCap = 'round';

    for (let c = 0; c < s.curveCount; c++) {
      const lat = (c / Math.max(1, s.curveCount)) * Math.PI;

      // golden-ratio spread of thicknesses across the arcs
      const unitPos = (c * 0.61803398875) % 1;
      const thickness = thicknessAt(unitPos, s.minSize, s.medianSize, s.maxSize);
      if (thickness === 0) continue;

      const flow = (((time * s.headSpeed + unitPos) % 1) + 1) % 1;

      for (let i = 0; i < s.segments; i++) {
        const point = projectPoint(((i + 0.5) / s.segments) * TAU, lat, time, width, height, s);

        // brightness near the moving head
        const dist = ((flow - i / s.segments) % 1 + 1) % 1;
        const headGlow = Math.exp(-dist * 22);
        const depthNorm = (point.depth + 1) / 2;

        const act = activationAt(point.surface, activation) * s.activationBrightness;
        const alpha = Math.min(
          1,
          (s.lineOpacity * (0.15 + depthNorm * 0.65 + headGlow * 0.8) + act * 0.55) * s.intensity,
        );
        if (alpha < 0.002 || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;

        const gradientPos = activation.source
          ? sphereAngle(point.surface, activation.source) / Math.PI
          : 0;
        const color = surfaceColor(s, act, gradientPos);

        ctx.strokeStyle = `rgba(${color},${alpha})`;
        ctx.lineWidth = thickness * (0.65 + depthNorm * 0.35) * (1 + Math.min(0.2, act * 0.12));
        ctx.beginPath();
        for (let k = 0; k <= 3; k++) {
          const sub = projectPoint(((i + k / 3) / s.segments) * TAU, lat, time, width, height, s);
          if (k === 0) ctx.moveTo(sub.x, sub.y);
          else ctx.lineTo(sub.x, sub.y);
        }

        // halo: two wide, very transparent passes under the real stroke
        const w = ctx.lineWidth;
        const glowWidth = Math.min(12, s.glow * (1 + headGlow * 3) + act * 3);
        if (glowWidth > 0.1) {
          ctx.lineWidth = w + glowWidth;
          ctx.strokeStyle = `rgba(${color},${alpha * 0.07})`;
          ctx.stroke();
          ctx.lineWidth = w + glowWidth * 0.4;
          ctx.strokeStyle = `rgba(${color},${alpha * 0.1})`;
          ctx.stroke();
        }

        ctx.lineWidth = w;
        ctx.strokeStyle = `rgba(${color},${alpha})`;
        ctx.stroke();
      }

      // the bright head itself
      const head = projectPoint(flow * TAU, lat, time, width, height, s);
      if (!Number.isFinite(head.x) || !Number.isFinite(head.y)) continue;

      const headAct = activationAt(head.surface, activation) * s.activationBrightness;
      const headGradient = activation.source
        ? sphereAngle(head.surface, activation.source) / Math.PI
        : 0;
      const headColor = surfaceColor(s, headAct, headGradient);

      ctx.shadowColor = `rgba(${headColor},${Math.min(0.8, headAct * 0.4)})`;
      ctx.shadowBlur = Math.min(24, s.glow * 2 + headAct * 8);
      ctx.fillStyle = `rgba(${headColor},${Math.min(
        1,
        (s.lineOpacity * (0.3 + (head.depth + 1) * 0.35) + headAct * 0.55) * s.intensity,
      )})`;
      ctx.beginPath();
      ctx.arc(head.x, head.y, thickness * 0.75, 0, TAU);
      ctx.fill();
    }

    ctx.shadowBlur = 0;
  };

  const tick = (now) => {
    const delta = Math.min(50, now - lastTime) / 1000;
    lastTime = now;

    if (visible && !document.hidden) {
      const s = handle.settings;
      // The scroll fade only applies once the page is actually scrollable.
      // A page that fits in the window must not hide the scene.
      const opacity = scrollOpacity(s);
      handle.opacity = opacity;
      container.style.opacity = String(opacity);
      if (opacity <= 0.02) {
        activation = emptyActivation();
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

export default createSphericalArcs;
