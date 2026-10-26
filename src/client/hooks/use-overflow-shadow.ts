import { onBeforeUnmount, onMounted, onUpdated, ref, watch, type Ref } from "vue";

/** Sub-pixel slop: a fractional scroll offset must not read as "more content below". */
const EDGE_EPSILON_PX = 1;

/**
 * Whether a scrollport still hides content past its end edges — the flag a scroll fade is drawn from.
 *
 * Every scrollport hides its bar (src/styles/scrollbar.css), which left a clipped panel looking finished while more
 * rows sat below it: iOS paints its own overlay indicator only while a finger moves, and Android Chrome paints nothing
 * once the bar is styled away. A gradient drawn from this flag is the affordance instead — it is there exactly while
 * something is hidden and settles away at the end, which a static overlay cannot do.
 *
 * Measured on scroll, after every re-render (arriving data grows the content), when the element itself mounts or
 * unmounts, and on a window resize. Four layout reads per call; no observer to keep alive.
 */
export function useOverflowShadow(el: Readonly<Ref<HTMLElement | null>>) {
  const moreBelow = ref(false);
  const moreRight = ref(false);

  function measure(): void {
    const node = el.value;
    if (node === null) return;
    moreBelow.value = node.scrollTop + node.clientHeight < node.scrollHeight - EDGE_EPSILON_PX;
    moreRight.value = node.scrollLeft + node.clientWidth < node.scrollWidth - EDGE_EPSILON_PX;
  }

  watch(el, (node) => {
    if (node === null) {
      // The scrollport unmounted: a flag left set would draw its fade on the next open, before anything is measured.
      moreBelow.value = false;
      moreRight.value = false;
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

  return { moreBelow, moreRight, measure };
}
