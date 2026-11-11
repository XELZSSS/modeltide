import { onBeforeUnmount, onMounted, onUpdated, ref, watch, type Ref } from "vue";

/** Sub-pixel slop: a fractional scroll offset must not read as "more content below". */
const EDGE_EPSILON_PX = 1;

/**
 * Whether a scrollport still hides content past its end edges — the flag a scroll fade is drawn from. Every scrollport
 * hides its bar, and iOS/Android Chrome then paint no indicator at rest, so a gradient drawn from this flag is the
 * affordance. Measured on scroll, after every re-render, on mount/unmount and on resize: no observer to keep alive.
 */
export function useOverflowShadow(el: Readonly<Ref<HTMLElement | null>>) {
  const moreBelow = ref(false);

  function measure(): void {
    const node = el.value;
    if (node === null) return;
    moreBelow.value = node.scrollTop + node.clientHeight < node.scrollHeight - EDGE_EPSILON_PX;
  }

  watch(el, (node) => {
    if (node === null) {
      // The scrollport unmounted: a flag left set would draw its fade on the next open, before anything is measured.
      moreBelow.value = false;
      return;
    }
    measure();
  });
  onMounted(() => {
    measure();
    window.addEventListener("resize", measure);
  });
  onUpdated(measure);
  onBeforeUnmount(() => window.removeEventListener("resize", measure));

  return { moreBelow, measure };
}
