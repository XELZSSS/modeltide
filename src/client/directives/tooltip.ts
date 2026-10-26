import type { Directive, DirectiveBinding } from "vue";

interface TooltipState {
  tip: HTMLElement;
  cleanup: () => void;
}

const states = new WeakMap<HTMLElement, TooltipState>();

/**
 * The current binding per element. `mounted` closes over the binding object it was called with, and Vue hands the
 * directive a fresh one on every update, so reading the mount-time copy left an updated `v-tooltip` value showing the
 * text it had when the element was created. `updated` refreshes this; `enter` reads it.
 */
const bindings = new WeakMap<HTMLElement, DirectiveBinding>();

function textOf(el: HTMLElement, binding: DirectiveBinding): string {
  const v = binding.value;
  if (v != null && String(v).trim() !== "") return String(v).trim();
  return (el.textContent ?? "").trim();
}

function hide(el: HTMLElement): void {
  const state = states.get(el);
  if (!state) return;
  state.tip.remove();
  state.cleanup();
  states.delete(el);
}

function show(el: HTMLElement, text: string): void {
  if (!text) return;
  hide(el);

  const tip = document.createElement("div");
  // `max-w-[min(...)]` rather than `max-w-xs`: the bubble is clamped 8px inside the viewport on both sides below, so a
  // flat 20rem cap would put its right edge 8px past the viewport on a 320px screen.
  tip.className =
    "ui-surface pointer-events-none fixed z-[9999] max-w-[min(20rem,calc(100vw-16px))] rounded-lg bg-popover px-2.5 py-1.5 text-xs leading-4 text-text-primary break-words";
  tip.setAttribute("role", "tooltip");
  tip.textContent = text;
  tip.style.visibility = "hidden";
  document.body.appendChild(tip);

  const rect = el.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
  // Above the element, unless that would leave the viewport at the top — then below it, and clamped to the bottom edge
  // for an element in the last row of a short viewport.
  let top = rect.top - tipRect.height - 6;
  if (top < 8) top = Math.min(rect.bottom + 6, window.innerHeight - tipRect.height - 8);
  top = Math.max(8, top);

  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  tip.style.visibility = "visible";

  const onScroll = () => hide(el);
  window.addEventListener("scroll", onScroll, true);
  const cleanup = () => window.removeEventListener("scroll", onScroll, true);
  states.set(el, { tip, cleanup });
}

export const vTooltip: Directive<HTMLElement, string | null | undefined> = {
  mounted(el, binding) {
    bindings.set(el, binding);
    const enter = () => {
      const current = bindings.get(el);
      if (!current) return;
      const text = textOf(el, current);
      if (!text) return;
      // Only show when the content is actually truncated (overflowing its box).
      if (el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1) return;
      show(el, text);
    };
    // `hide` is a no-op when nothing is showing, so this stays cheap on the common path where `enter` declined.
    const leave = () => hide(el);
    el.addEventListener("mouseenter", enter);
    el.addEventListener("mouseleave", leave);
    el.addEventListener("focus", enter);
    el.addEventListener("blur", leave);
    (el as HTMLElement & { __tooltipHandlers?: { enter: () => void; leave: () => void } }).__tooltipHandlers = {
      enter,
      leave,
    };
  },
  updated(el, binding) {
    bindings.set(el, binding);
    const state = states.get(el);
    if (state && textOf(el, binding) !== state.tip.textContent) {
      hide(el);
    }
  },
  unmounted(el) {
    const handlers = (el as HTMLElement & { __tooltipHandlers?: { enter: () => void; leave: () => void } })
      .__tooltipHandlers;
    if (handlers) {
      el.removeEventListener("mouseenter", handlers.enter);
      el.removeEventListener("mouseleave", handlers.leave);
      el.removeEventListener("focus", handlers.enter);
      el.removeEventListener("blur", handlers.leave);
    }
    bindings.delete(el);
    hide(el);
  },
};
