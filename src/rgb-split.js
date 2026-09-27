/**
 * RGB Split — scroll-driven chromatic aberration on text.
 *
 * Three copies of the same text sit stacked. Each copy shows only one color
 * channel via CSS mix-blend-mode. On scroll, the copies offset in opposite
 * directions — red left, blue right — creating the RGB channel split.
 * The offset is proportional to scroll velocity and eases back to zero
 * when scrolling stops.
 *
 * Usage:
 *   import { createRGBSplit } from './src/rgb-split.js';
 *   createRGBSplit(element, options);
 *
 * The element's text content is cloned into three layers. The original
 * text is hidden; the three layers render the split. No canvas needed.
 */

export function createRGBSplit(container, options = {}) {
  const {
    maxOffset = 12,    // max px offset per channel at full velocity
    smoothing = 0.08,  // how fast the offset decays (0..1, lower = smoother)
    velocityScale = 0.15, // scroll px/s to offset px multiplier
  } = options;

  const text = container.textContent;
  container.style.position = 'relative';
  container.style.isolation = 'isolate';

  // Hide original text but keep its height
  container.style.color = 'transparent';

  // Create three channel layers
  const channels = [
    { color: 'rgba(255, 0, 0, 0.8)',   blend: 'screen', dx: -1 },
    { color: 'rgba(0, 255, 0, 0.8)',   blend: 'screen', dx: 0  },
    { color: 'rgba(0, 100, 255, 0.8)', blend: 'screen', dx: 1  },
  ];

  const layers = channels.map((ch) => {
    const el = document.createElement('span');
    el.textContent = text;
    el.style.cssText = `
      position: absolute; inset: 0;
      color: ${ch.color};
      mix-blend-mode: ${ch.blend};
      pointer-events: none;
      will-change: transform;
      transform: translateX(0);
      transition: none;
    `;
    container.appendChild(el);
    return { el, dx: ch.dx, currentX: 0, targetX: 0 };
  });

  // Track scroll velocity
  let lastScrollY = window.scrollY;
  let lastTime = performance.now();
  let velocity = 0;
  let rafId = 0;

  function update() {
    const now = performance.now();
    const dt = Math.max(1, now - lastTime) / 1000;
    lastTime = now;

    const dy = window.scrollY - lastScrollY;
    lastScrollY = window.scrollY;

    // Velocity in px/s, smoothed
    const rawVelocity = dy / dt;
    velocity += (rawVelocity - velocity) * smoothing * 3;

    // Target offset per channel
    const offset = clamp(velocity * velocityScale, -maxOffset, maxOffset);

    // Each layer moves: red opposite to scroll, blue with scroll, green stays
    for (const layer of layers) {
      layer.targetX = offset * layer.dx;
      layer.currentX += (layer.targetX - layer.currentX) * smoothing;
      layer.el.style.transform = `translateX(${layer.currentX.toFixed(2)}px)`;
    }

    rafId = requestAnimationFrame(update);
  }

  function start() {
    lastScrollY = window.scrollY;
    lastTime = performance.now();
    rafId = requestAnimationFrame(update);
  }

  function stop() {
    cancelAnimationFrame(rafId);
  }

  // Auto-start
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // No animation — show white text
    container.style.color = 'rgb(242, 240, 234)';
    layers.forEach((l) => l.el.remove());
    return { stop: () => {} };
  }

  start();

  // Pause when off-screen
  if ('IntersectionObserver' in window) {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            if (!rafId) start();
          } else {
            stop();
            rafId = 0;
          }
        }
      },
      { threshold: 0 }
    );
    obs.observe(container);
  }

  return { stop };
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
