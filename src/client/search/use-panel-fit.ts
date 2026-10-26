import { computed, onBeforeUnmount, onMounted, ref, watch, type ComputedRef, type CSSProperties, type Ref } from "vue";

const PANEL_MAX_PX = 448;
const PANEL_MIN_PX = 176;
const PANEL_GAP_PX = 6;
const PANEL_EDGE_PX = 8;

interface PanelFitOptions {
  isOpen: () => boolean;
  canSearch: () => boolean;
  inputRef: Ref<HTMLInputElement | null>;
}

/**
 * Caps the result panel to the room it actually has, and keeps that cap current while the panel is open.
 *
 * The panel is clipped by the scrolling `<main>`, and on small screens the fixed bottom bar covers the same area, so a
 * long result list would be cut off or painted over. The panel sits at `z-20`: above page content (the table's sticky
 * column is `z-10`), below the nav bars (`z-30`) and the modal layer (`z-40`/`z-50`).
 */
export function usePanelFit(opts: PanelFitOptions): { panelStyle: ComputedRef<CSSProperties | undefined> } {
  const panelHeight = ref<number | null>(null);
  let fitFrame = 0;

  // `undefined` until the first measurement: the panel renders at its CSS `max-h` until the geometry is known.
  const panelStyle = computed<CSSProperties | undefined>(() =>
    panelHeight.value === null ? undefined : { maxHeight: `${panelHeight.value}px` },
  );

  function fitPanel(): void {
    const input = opts.inputRef.value;
    if (!input) return;
    const clipBottom = Math.min(
      input.closest("main")?.getBoundingClientRect().bottom ?? window.innerHeight,
      window.innerHeight,
    );
    // `clipBottom` is the scrollport's bottom edge, and the bottom bar is a row of that layout rather than an overlay, so
    // the space below the input is already net of the bar; subtracting it again cost the panel 64px of height.
    const room = clipBottom - input.getBoundingClientRect().bottom - PANEL_GAP_PX - PANEL_EDGE_PX;
    panelHeight.value = Math.max(PANEL_MIN_PX, Math.min(PANEL_MAX_PX, Math.round(room)));
  }

  function scheduleFit(): void {
    if (!opts.isOpen() || !opts.canSearch() || fitFrame !== 0) return;
    fitFrame = requestAnimationFrame(() => {
      fitFrame = 0;
      fitPanel();
    });
  }

  /**
   * `flush: "post"` is load-bearing: the panel is drawn by the same tick that opens it, so a pre-flush measurement reads
   * a zero height and the panel jumps to its maximum before shrinking to the real cap — a visible two-step.
   */
  watch(
    [opts.isOpen, opts.canSearch],
    ([open, searchable]) => {
      if (open && searchable) scheduleFit();
    },
    { flush: "post" },
  );

  onMounted(() => {
    window.addEventListener("resize", scheduleFit, { passive: true });
    // `scroll` does not bubble, so capture it from whichever ancestor actually scrolls.
    window.addEventListener("scroll", scheduleFit, { passive: true, capture: true });
  });

  onBeforeUnmount(() => {
    window.removeEventListener("resize", scheduleFit);
    window.removeEventListener("scroll", scheduleFit, { capture: true });
    if (fitFrame !== 0) cancelAnimationFrame(fitFrame);
  });

  return { panelStyle };
}
