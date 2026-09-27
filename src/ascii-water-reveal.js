/**
 * ASCII Water Reveal — canvas background.
 *
 * A height-field wave simulation on a coarse grid, where every cell above a
 * small threshold draws one ASCII glyph. A moving pointer stirs the surface,
 * and the ripples travel outward as trails of characters.
 *
 * The grid is 2D and the physics is the classic string equation: each cell
 * moves toward the average of its four neighbours, with damping. The rendered
 * glyph picks up intensity from that height.
 *
 * No dependencies. ES module.
 */

// Darkest to brightest, matching the original ramp.
const CHARS = ['·', '.', '-', '~', '=', '+', 'x', '*', 'o'];

// Cells below this are skipped entirely.
const INTENSITY_FLOOR = 0.008;

export const DEFAULTS = {
  fontSize: 13, // px, monospace cell size
  density: 1, // 0.6..1.5, grid spacing multiplier
  damping: 0.96, // 0.85..0.99, how long ripples last
  waveSpeed: 0.48, // 0.1..0.5, how fast ripples travel
  maxOpacity: 0.35, // 0.05..1, alpha at the top of the ramp
  intensity: 1, // overall brightness multiplier
  color: [255, 255, 255], // glyph colour
  scrollDriven: false,
  startProgress: 0.15,
  endProgress: 0.35,
  fadeRange: 0.4,
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

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

/**
 * Mount the effect on a container element.
 *
 * options:
 *   settings   any field from DEFAULTS
 *
 * Returns a handle: { canvas, settings, frames, opacity, stir, drop, stop }.
 */
export function createAsciiWaterReveal(container, options = {}) {
  const s = { ...DEFAULTS, ...(options.settings || {}) };

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none';
  container.style.overflow = 'hidden';
  container.style.userSelect = 'none';
  container.style.touchAction = 'none';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const noop = () => {};
  if (!ctx) {
    canvas.remove();
    return { canvas, settings: s, frames: 0, opacity: 1, stir: noop, drop: noop, stop: noop };
  }

  let width = 0;
  let height = 0;
  let cols = 0;
  let rows = 0;
  /** height field, two buffers swapped each step */
  let field = new Float32Array(0);
  let next = new Float32Array(0);

  let rafId = 0;
  let sleeping = false;
  let idleFrames = 0;
  let visible = true;

  const pointer = { x: -1, y: -1, prevX: -1, prevY: -1, down: false };

  const handle = {
    canvas,
    settings: s,
    frames: 0,
    opacity: 1,
    stir: noop,
    drop: noop,
    stop: null,
  };

  // Colours are precomputed: one fillStyle per ramp step.
  const palette = () => {
    const steps = 14;
    const [r, g, b] = s.color;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const alpha = ((i / steps) * s.maxOpacity * s.intensity).toFixed(3);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    });
  };
  let colors = palette();

  const colSpacing = () => (s.fontSize * 0.85) / s.density;
  const rowSpacing = () => (s.fontSize * 1.15) / s.density;

  const initBuffers = () => {
    const rect = container.getBoundingClientRect();
    width = canvas.width = Math.max(1, rect.width);
    height = canvas.height = Math.max(1, rect.height);
    cols = Math.ceil(width / colSpacing()) + 2;
    rows = Math.ceil(height / rowSpacing()) + 2;
    field = new Float32Array(cols * rows);
    next = new Float32Array(cols * rows);
    colors = palette();
    wake();
  };

  const wake = () => {
    idleFrames = 0;
    if (sleeping) {
      sleeping = false;
      rafId = requestAnimationFrame(tick);
    }
  };

  /** Raise the surface in a disc centred on a screen point. */
  const drop = (x, y, radius, strength) => {
    const gx = Math.floor(x / colSpacing());
    const gy = Math.floor(y / rowSpacing());
    const radSq = radius * radius;

    for (let r = -radius; r <= radius; r++) {
      for (let c = -radius; c <= radius; c++) {
        const nx = gx + c;
        const ny = gy + r;
        if (nx <= 0 || nx >= cols - 1 || ny <= 0 || ny >= rows - 1) continue;

        const dist = c * c + r * r;
        if (dist < radSq) field[ny * cols + nx] += strength * (1 - dist / radSq);
      }
    }
    wake();
  };
  handle.drop = drop;

  /** Stir along the path from the previous pointer position to this one. */
  const stir = (x, y) => {
    const prevX = pointer.prevX;
    const prevY = pointer.prevY;
    pointer.x = x;
    pointer.y = y;
    if (prevX === -1) {
      pointer.prevX = x;
      pointer.prevY = y;
      return;
    }

    const dx = x - prevX;
    const dy = y - prevY;
    const speedSq = dx * dx + dy * dy;

    if (speedSq > 2) {
      const speed = Math.sqrt(speedSq);
      // interpolate along the gesture so fast moves leave a continuous trail
      const steps = Math.min(Math.floor(speed / 6), 8);
      const strength = Math.min(speed * 0.12, 3.5) * (pointer.down ? 1.8 : 1);
      const radius = pointer.down ? 3 : 2;
      for (let i = 0; i <= steps; i++) {
        const t = steps === 0 ? 0 : i / steps;
        drop(prevX + dx * t, prevY + dy * t, radius, strength);
      }
    }
    pointer.prevX = x;
    pointer.prevY = y;
  };
  handle.stir = stir;

  const onPointerMove = (e) => {
    const rect = canvas.getBoundingClientRect();
    stir(e.clientX - rect.left, e.clientY - rect.top);
  };
  const onPointerDown = () => {
    pointer.down = true;
    if (pointer.x !== -1) drop(pointer.x, pointer.y, 5, 7);
  };
  const onPointerUp = () => {
    pointer.down = false;
  };
  const onPointerLeave = () => {
    pointer.prevX = -1;
    pointer.prevY = -1;
  };

  /** One wave step plus one draw pass. */
  function step() {
    const s = handle.settings;
    handle.frames++;

    ctx.clearRect(0, 0, width, height);
    ctx.font = `${s.fontSize}px monospace`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    let activeCells = 0;

    // 1. one wave step: each cell relaxes toward its neighbours' mean
    for (let y = 1; y < rows - 1; y++) {
      const rowOffset = y * cols;
      for (let x = 1; x < cols - 1; x++) {
        const i = rowOffset + x;
        next[i] =
          (field[i - 1] + field[i + 1] + field[i - cols] + field[i + cols]) * s.waveSpeed -
          field[i];
        next[i] *= s.damping;
      }
    }
    const swap = field;
    field = next;
    next = swap;

    // 2. draw whatever is above the floor
    const cx = colSpacing();
    const cy = rowSpacing();
    for (let y = 1; y < rows - 1; y++) {
      const rowOffset = y * cols;
      const posY = y * cy;
      for (let x = 1; x < cols - 1; x++) {
        const i = rowOffset + x;
        const intensity = Math.abs(field[i]);
        if (intensity <= INTENSITY_FLOOR) continue;

        activeCells++;
        const charIndex = Math.min((intensity * 2.2) | 0, CHARS.length - 1);
        const colorIndex = Math.min((intensity * 6) | 0, colors.length - 1);
        ctx.fillStyle = colors[colorIndex];
        ctx.fillText(CHARS[charIndex], x * cx, posY);
      }
    }

    // 3. sleep once the surface is flat again
    return activeCells > 0 || pointer.down;
  }

  /**
   * The frame driver. It owns the scroll fade and the sleep cycle: nothing is
   * drawn while the container is scrolled out of view.
   */
  const tick = () => {
    const opacity = scrollOpacity(handle.settings);
    handle.opacity = opacity;
    container.style.opacity = String(opacity);

    if (opacity <= 0.02 || !visible || document.hidden) {
      field.fill(0);
      next.fill(0);
      ctx.clearRect(0, 0, width, height);
    } else if (!step()) {
      // flat surface: hold the last frame and stop stepping
      if (++idleFrames > 30) sleeping = true;
    } else {
      idleFrames = 0;
    }

    if (!sleeping) rafId = requestAnimationFrame(tick);
  };

  const resizeObserver = new ResizeObserver(initBuffers);
  resizeObserver.observe(container);

  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      visible = entries[0]?.isIntersecting ?? true;
      wake();
    },
    { threshold: 0 },
  );
  intersectionObserver.observe(container);

  const onVisibilityChange = () => wake();

  container.addEventListener('pointermove', onPointerMove, { passive: true });
  container.addEventListener('pointerdown', onPointerDown, { passive: true });
  window.addEventListener('pointerup', onPointerUp, { passive: true });
  container.addEventListener('pointerleave', onPointerLeave, { passive: true });
  document.addEventListener('visibilitychange', onVisibilityChange);

  initBuffers();
  rafId = requestAnimationFrame(tick);

  handle.stop = () => {
    cancelAnimationFrame(rafId);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    container.removeEventListener('pointermove', onPointerMove);
    container.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointerup', onPointerUp);
    container.removeEventListener('pointerleave', onPointerLeave);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    canvas.remove();
    sleeping = true;
  };

  return handle;
}

export default createAsciiWaterReveal;
