import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/client/utils";

// Selector for elements that should be reachable inside the sheet for the focus trap.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
}

/**
 * Bottom-sheet dialog (centered on desktop) rendered in a portal. While open it traps
 * focus, closes on Escape, locks body scroll, and restores focus to the trigger element on close.
 */
export function Sheet({ open, onClose, children, className, ariaLabel, ariaLabelledBy }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  // Remember the trigger so focus can be restored on close; while open, trap focus
  // within the panel (Tab cycles first/last) and Escape closes the sheet.
  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    // Lock scroll and compensate for scrollbar to avoid layout shift
    const scrollbarW = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarW > 0) document.body.style.paddingRight = `${scrollbarW}px`;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
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
    // Focus the panel's first control on the next frame, but only when focus
    // isn't already somewhere meaningful (don't steal it from the trigger flow).
    const timer = setTimeout(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    }, 50); // Small delay to ensure DOM is ready
    return () => {
      document.removeEventListener("keydown", handler);
      clearTimeout(timer);
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabelledBy ? undefined : ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className={cn(
          "relative z-50 w-full max-w-md rounded-t-xl sm:rounded-xl border border-border bg-bg-primary shadow-lg animate-sheet-up focus:outline-none",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
