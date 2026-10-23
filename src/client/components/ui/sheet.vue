<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { cn } from "@/client/utils/cn";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface SheetLockEntry {
  inerted: HTMLElement[];
}

const lockStack: SheetLockEntry[] = [];
let bodyOwner: SheetLockEntry | null = null;
let prevOverflow = "";
let prevPaddingRight = "";

function appRootChildren(): HTMLElement[] {
  const root = document.getElementById("root");
  if (!root) return [];
  return Array.from(root.children).filter((el): el is HTMLElement => el instanceof HTMLElement);
}

function applyLock(entry: SheetLockEntry): void {
  bodyOwner = entry;
  prevOverflow = document.body.style.overflow;
  prevPaddingRight = document.body.style.paddingRight;
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  document.body.style.overflow = "hidden";
  if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
  entry.inerted = appRootChildren().filter((el) => !el.hasAttribute("inert"));
  for (const el of entry.inerted) el.setAttribute("inert", "");
}

function releaseLock(entry: SheetLockEntry): void {
  if (bodyOwner !== entry) return;
  document.body.style.overflow = prevOverflow;
  document.body.style.paddingRight = prevPaddingRight;
  bodyOwner = null;
}

function releaseInert(entry: SheetLockEntry): void {
  for (const el of entry.inerted) el.removeAttribute("inert");
  entry.inerted = [];
}

function syncLock(): void {
  const owner = lockStack[0];
  if (bodyOwner === owner) return;
  if (bodyOwner) {
    releaseInert(bodyOwner);
    releaseLock(bodyOwner);
  }
  if (owner) applyLock(owner);
}

const props = defineProps<{ open: boolean; class?: string; ariaLabel?: string }>();
const emit = defineEmits<{ close: [] }>();

const panelRef = ref<HTMLDivElement | null>(null);
let trigger: HTMLElement | null = null;
let entry: SheetLockEntry | null = null;
let locked = false;
let openToken = 0;

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
  if (!panel || locked) return;
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body && !panel.contains(active)) trigger = active;
  const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
  if (first) first.focus();
  else panel.focus();
  entry = { inerted: [] };
  lockStack.push(entry);
  syncLock();
  document.addEventListener("keydown", onKeydown);
  locked = true;
}

function unlock(): void {
  if (!locked) return;
  locked = false;
  document.removeEventListener("keydown", onKeydown);
  const closing = entry;
  entry = null;
  if (closing) {
    const index = lockStack.indexOf(closing);
    if (index >= 0) lockStack.splice(index, 1);
    releaseInert(closing);
  }
  syncLock();
  if (trigger instanceof HTMLElement) trigger.focus();
  trigger = null;
}

// A sheet may be mounted already open (the app mounts its sheets on first use), and the watcher's
// post-flush tick runs before a Teleport child is attached in that case, so lock explicitly on mount.
onMounted(() => {
  if (props.open) lock();
});

watch(
  () => props.open,
  async (open) => {
    openToken += 1;
    const token = openToken;
    if (!open) {
      unlock();
      return;
    }
    await nextTick();
    if (token !== openToken || !props.open) return;
    lock();
  },
  { flush: "post" },
);

onUnmounted(unlock);
</script>

<template>
  <Teleport to="body">
    <Transition name="ui-fade" appear>
      <div v-if="open" class="fixed inset-0 z-40 bg-black/50" aria-hidden="true" @click="emit('close')" />
    </Transition>
    <Transition name="ui-sheet" appear>
      <div v-if="open" class="fixed inset-0 z-50 flex items-end justify-center pointer-events-none md:items-center">
        <div
          ref="panelRef"
          role="dialog"
          aria-modal="true"
          :aria-label="ariaLabel"
          tabindex="-1"
          :class="cn('pointer-events-auto w-full max-w-md ui-overlay focus:outline-none', props.class)"
        >
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
