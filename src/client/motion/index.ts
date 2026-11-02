/** The per-item index `ui-anim-rise` reads its delay from; the timing itself stays in `src/styles/motion.css`. */
export function staggerStyle(index: number): Record<string, string> {
  return { "--motion-stagger-index": String(index) };
}

/**
 * One `fast` beat of the motion scale, for the one hold that is timed in JS rather than in CSS: how long the Suspense
 * placeholder waits before it shows its dots. `src/styles/motion.css` owns the value and `motion-guard` fails the build
 * if the declaration there drifts from this one.
 */
export const MOTION_FAST_MS = 160;
