"use client";
import { memo, useEffect, useRef } from "react";
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

function useSheetEffects(open: boolean, onClose: () => void, panelRef: React.RefObject<HTMLDivElement | null>) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement;
    if (sheetLockCount === 0) {
      sheetPrevOverflow = document.body.style.overflow;
      sheetPrevPaddingRight = document.body.style.paddingRight;
    }
    sheetLockCount++;
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
    const timer = setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (first) first.focus();
      else {
        panel.setAttribute("tabindex", "-1");
        panel.focus();
      }
    }, 50);
    return () => {
      document.removeEventListener("keydown", handler);
      clearTimeout(timer);
      sheetLockCount = Math.max(0, sheetLockCount - 1);
      if (sheetLockCount === 0) {
        document.body.style.overflow = sheetPrevOverflow;
        document.body.style.paddingRight = sheetPrevPaddingRight;
      }
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
  ariaLabelledBy?: string;
}

export const Sheet = memo(function Sheet({
  open,
  onClose,
  children,
  className,
  ariaLabel,
  ariaLabelledBy,
}: SheetProps) {
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
        aria-label={ariaLabelledBy ? undefined : ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className={cn(
          "relative z-50 w-full max-w-md rounded-none border border-border bg-bg-primary shadow-lg animate-sheet-up focus:outline-none",
          className,
        )}
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
