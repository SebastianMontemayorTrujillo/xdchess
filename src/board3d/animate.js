// Promise-based tweens: `await tween(500, (t) => ...)` calls update with eased t from 0 to 1.

export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const easeIn = (t) => t * t;

// Players who ask their system for reduced motion get the end state instantly.
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function tween(ms, update, ease = easeInOut) {
  if (reduceMotion()) {
    update(1);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const start = performance.now();
    const frame = (now) => {
      const t = Math.min(1, (now - start) / ms);
      update(ease(t));
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
