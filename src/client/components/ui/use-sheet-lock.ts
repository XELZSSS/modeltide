import { nextTick, onMounted, onUnmounted, watch, type Ref } from "vue";

/**
 * The modal lock behind `sheet.vue`: scroll lock on <body>, `inert` on the rest of the app, and a focus trap inside the
 * panel.
 *
 * The lock is global while the machine is per sheet: the shell mounts sheets on first use and can have several open in
 * sequence, so only the topmost entry in `lockStack` holds <body> — closing the second hands the lock back to the first
 * one still open instead of releasing it outright.
 */

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface LockEntry {
  inerted: HTMLElement[];
}

const lockStack: LockEntry[] = [];
let bodyOwner: LockEntry | null = null;
let prevOverflow = "";
let prevPaddingRight = "";

/** The app's own children, which are what gets `inert` while a sheet is open. */
function appRootChildren(): HTMLElement[] {
  const root = document.getElementById("root");
  if (!root) return [];
  return Array.from(root.children).filter((el): el is HTMLElement => el instanceof HTMLElement);
}

function applyLock(entry: LockEntry): void {
  bodyOwner = entry;
  prevOverflow = document.body.style.overflow;
  prevPaddingRight = document.body.style.paddingRight;
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  document.body.style.overflow = "hidden";
  if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
  entry.inerted = appRootChildren().filter((el) => !el.hasAttribute("inert"));
  for (const el of entry.inerted) el.setAttribute("inert", "");
}

function releaseLock(entry: LockEntry): void {
  if (bodyOwner !== entry) return;
  document.body.style.overflow = prevOverflow;
  document.body.style.paddingRight = prevPaddingRight;
  bodyOwner = null;
}

function releaseInert(entry: LockEntry): void {
  for (const el of entry.inerted) el.removeAttribute("inert");
  entry.inerted = [];
}

/** Gives the lock to the topmost open sheet, releasing whichever entry holds it now. */
function syncLock(): void {
  const owner = lockStack[0];
  if (bodyOwner === owner) return;
  if (bodyOwner) {
    releaseInert(bodyOwner);
    releaseLock(bodyOwner);
  }
  if (owner) applyLock(owner);
}

export interface SheetLockOptions {
  /** Whether the sheet is open. Watched post-flush so the teleported panel already exists when the lock runs. */
  open: () => boolean;
  /** The panel that receives focus and traps Tab. */
  panel: Readonly<Ref<HTMLElement | null>>;
  /** Escape was pressed while the sheet was open. */
  onClose: () => void;
}

export function useSheetLock(options: SheetLockOptions): void {
  let trigger: HTMLElement | null = null;
  let entry: LockEntry | null = null;
  let locked = false;
  let openToken = 0;

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") options.onClose();
    if (event.key !== "Tab") return;
    const panel = options.panel.value;
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
    const panel = options.panel.value;
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

  // A sheet may be mounted already open (the shell mounts its sheets on first use), and the watcher's post-flush tick
  // runs before a Teleport child is attached in that case, so lock explicitly on mount.
  onMounted(() => {
    if (options.open()) lock();
  });

  watch(
    options.open,
    async (open) => {
      openToken += 1;
      const token = openToken;
      if (!open) {
        unlock();
        return;
      }
      await nextTick();
      if (token !== openToken || !options.open()) return;
      lock();
    },
    { flush: "post" },
  );

  onUnmounted(unlock);
}
