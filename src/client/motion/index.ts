export { staggerStyle } from "./stagger";

/**
 * One `fast` beat of the motion scale, for the one hold that is timed in JS rather than in CSS: how long the Suspense
 * placeholder waits before it shows its dots. `src/styles/motion.css` owns the value and `motion-guard` fails the build
 * if the declaration there drifts from this one.
 */
export const MOTION_FAST_MS = 160;
