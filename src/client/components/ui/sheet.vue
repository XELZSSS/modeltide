<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from "vue";
import { cn } from "@/client/utils/cn";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let lockCount = 0;
let prevOverflow = "";
let prevPaddingRight = "";
let inertedAppChildren: HTMLElement[] = [];

let lastPointerTarget: HTMLElement | null = null;

document.addEventListener(
  "pointerdown",
  (event) => {
    lastPointerTarget = event.target instanceof HTMLElement ? event.target : null;
  },
  true,
);

function inertAppChildren(): void {
  const root = document.getElementById("root");
  if (!root) return;
  inertedAppChildren = Array.from(root.children).filter((el): el is HTMLElement => el instanceof HTMLElement);
  for (const el of inertedAppChildren) el.setAttribute("inert", "");
}

function restoreAppChildren(): void {
  for (const el of inertedAppChildren) el.removeAttribute("inert");
  inertedAppChildren = [];
}

const props = defineProps<{ open: boolean; class?: string; ariaLabel?: string }>();
const emit = defineEmits<{ close: [] }>();

const panelRef = ref<HTMLDivElement | null>(null);
let trigger: HTMLElement | null = null;
let locked = false;

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") emit("close");
  if (event.key !== "Tab") return;
  const panel = panelRef.value;
  if (!panel) return;
  const focusable = panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function lock(): void {
  const panel = panelRef.value;
  if (!panel) return;
  const active = document.activeElement;
  const focused = active instanceof HTMLElement && active !== document.body ? active : lastPointerTarget;
  if (focused && !panel.contains(focused)) trigger = focused;
  const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
  if (first) first.focus();
  else {
    panel.setAttribute("tabindex", "-1");
    panel.focus();
  }
  if (lockCount === 0) {
    prevOverflow = document.body.style.overflow;
    prevPaddingRight = document.body.style.paddingRight;
    inertAppChildren();
  }
  lockCount += 1;
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  document.body.style.overflow = "hidden";
  if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
  document.addEventListener("keydown", onKeydown);
  locked = true;
}

function unlock(): void {
  if (!locked) return;
  locked = false;
  document.removeEventListener("keydown", onKeydown);
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = prevOverflow;
    document.body.style.paddingRight = prevPaddingRight;
    restoreAppChildren();
  }
  if (trigger instanceof HTMLElement) trigger.focus();
  trigger = null;
}

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      unlock();
      return;
    }
    await nextTick();
    lock();
  },
  { immediate: true, flush: "post" },
);

onUnmounted(unlock);
</script>

<template>
  <Teleport v-if="open" to="body">
    <div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center" @click="emit('close')">
      <div class="fixed inset-0 bg-black/50 animate-enter" aria-hidden="true" />
      <div
        ref="panelRef"
        role="dialog"
        aria-modal="true"
        :aria-label="ariaLabel"
        :class="cn('relative z-50 w-full max-w-md ui-overlay animate-enter focus:outline-none', props.class)"
        @click.stop
      >
        <slot />
      </div>
    </div>
  </Teleport>
</template>
