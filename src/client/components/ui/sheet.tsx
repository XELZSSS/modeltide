import { memo, useEffect, useLayoutEffect, useRef } from "react";
import { cn } from "@/client/utils/cn";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { Button } from "@/client/components/ui/button";
import { useTranslation } from "@/client/providers";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let sheetLockCount = 0;
let sheetPrevOverflow = "";
let sheetPrevPaddingRight = "";
let inertedAppChildren: HTMLElement[] = [];

let lastPointerTarget: HTMLElement | null = null;
if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    (event) => {
      lastPointerTarget = event.target instanceof HTMLElement ? event.target : null;
    },
    true,
  );
}

function inertAppChildren() {
  const root = document.getElementById("root");
  if (!root) return;
  inertedAppChildren = Array.from(root.children).filter((el): el is HTMLElement => el instanceof HTMLElement);
  for (const el of inertedAppChildren) el.setAttribute("inert", "");
}

function restoreAppChildren() {
  for (const el of inertedAppChildren) el.removeAttribute("inert");
  inertedAppChildren = [];
}

function useSheetEffects(open: boolean, onClose: () => void, panelRef: React.RefObject<HTMLDivElement | null>) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const triggerRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const active = document.activeElement;
    const focused = active instanceof HTMLElement && active !== document.body ? active : lastPointerTarget;
    if (focused && !panel.contains(focused)) triggerRef.current = focused;
    const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    if (first) first.focus();
    else {
      panel.setAttribute("tabindex", "-1");
      panel.focus();
    }
  }, [open, panelRef]);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    if (sheetLockCount === 0) {
      sheetPrevOverflow = document.body.style.overflow;
      sheetPrevPaddingRight = document.body.style.paddingRight;
      inertAppChildren();
    }
    sheetLockCount += 1;
    const scrollbarW = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarW > 0) document.body.style.paddingRight = `${scrollbarW}px`;

    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      sheetLockCount = Math.max(0, sheetLockCount - 1);
      if (sheetLockCount !== 0) {
        if (trigger instanceof HTMLElement) trigger.focus();
        return;
      }
      document.body.style.overflow = sheetPrevOverflow;
      document.body.style.paddingRight = sheetPrevPaddingRight;
      restoreAppChildren();
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, [open, panelRef]);
}

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}

export const Sheet = memo(function Sheet({ open, onClose, children, className, ariaLabel }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useSheetEffects(open, onClose, panelRef);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50 animate-fade-in" aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={cn("relative z-50 w-full max-w-md ui-overlay animate-sheet-up focus:outline-none", className)}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
});

export const SheetHeader = memo(function SheetHeader({
  title,
  onClose,
}: {
  title: React.ReactNode;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between">
      <p className="ui-card-title">{title}</p>
      <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("close")}>
        <X className="size-4" />
      </Button>
    </div>
  );
});

export const SheetBody = memo(function SheetBody({ children }: { children: React.ReactNode }) {
  return <div className="p-5 flex flex-col gap-5 max-h-[70vh] overflow-y-auto">{children}</div>;
});
