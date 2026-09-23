import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/client/utils/cn";
import { Input } from "@/client/components/ui/input";
import { useTranslation } from "@/client/providers";
import { useResetOnChange } from "@/client/hooks/use-reset-on-change";

interface ComboboxController {
  containerRef: RefObject<HTMLDivElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  listRef: RefObject<HTMLDivElement | null>;
  inputId: string;
  listboxId: string;
  statusId: string;
  inputValue: string;
  debounced: string;
  canSearch: boolean;
  isOpen: boolean;
  activeIndex: number;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onHover: (index: number) => void;
  onSelectIndex: (index: number) => void;
  onClear: () => void;
}

export function useCombobox({
  initialValue,
  minQuery,
  itemCount,
  isOpen,
  setIsOpen,
  setIsFocused,
  onSelect,
}: {
  initialValue: string;
  minQuery: number;
  itemCount: number;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  setIsFocused: (focused: boolean) => void;
  onSelect: (index: number) => void;
}): ComboboxController {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const listboxId = useId();
  const statusId = useId();
  const { inputValue, setInputValue, debounced, setDebouncedDirect } = useDebouncedTerm(initialValue, 200);
  const canSearch = inputValue.trim().length >= minQuery;

  const select = (index: number) => {
    if (index < 0 || index >= itemCount) return;
    setDebouncedDirect("");
    setIsOpen(false);
    onSelect(index);
  };

  const { clampedIndex, setActiveIndex, handleKeyDown } = useListKeyboard(itemCount, select, () => {
    setIsOpen(false);
    inputRef.current?.focus();
  });

  useClickOutside(containerRef, () => setIsOpen(false));

  useEffect(() => {
    if (!isOpen || clampedIndex < 0) return;
    listRef.current
      ?.querySelector(`#${CSS.escape(`${listboxId}-option-${clampedIndex}`)}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [clampedIndex, isOpen, listboxId]);

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      if (canSearch) setIsOpen(true);
      return;
    }
    if (!isOpen) return;
    handleKeyDown(e);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    setInputValue(e.target.value);
    setIsOpen(e.target.value.trim().length >= minQuery);
    setActiveIndex(-1);
  }

  function onFocus() {
    setIsFocused(true);
    if (canSearch) {
      setIsOpen(true);
      setActiveIndex(-1);
    }
  }

  function onClear() {
    setDebouncedDirect("");
    setIsOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  return {
    containerRef,
    inputRef,
    listRef,
    inputId,
    listboxId,
    statusId,
    inputValue,
    debounced,
    canSearch,
    isOpen,
    activeIndex: clampedIndex,
    onChange,
    onFocus,
    onBlur: () => setIsFocused(false),
    onKeyDown,
    onHover: setActiveIndex,
    onSelectIndex: select,
    onClear,
  };
}

export function Combobox({
  controller,
  className,
  status,
  children,
}: {
  controller: ComboboxController;
  className?: string;
  status: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { containerRef, inputRef, listRef, inputId, listboxId, statusId, inputValue, canSearch, isOpen } = controller;

  return (
    <div ref={containerRef} className={cn("relative w-full sm:w-72 min-w-0 max-w-full", className)}>
      <label htmlFor={inputId} className="sr-only">
        {t("searchPlaceholder")}
      </label>
      <div className="flex h-9 items-center gap-2 min-w-0 max-w-full ui-card px-3 transition-colors duration-fast focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-ring/30">
        <Search size={16} className="text-text-secondary shrink-0" aria-hidden="true" />
        <Input
          ref={inputRef}
          id={inputId}
          type="text"
          value={inputValue}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={
            controller.activeIndex >= 0 ? `${listboxId}-option-${controller.activeIndex}` : undefined
          }
          aria-autocomplete="list"
          aria-describedby={statusId}
          autoComplete="off"
          onChange={controller.onChange}
          onFocus={controller.onFocus}
          onBlur={controller.onBlur}
          onKeyDown={controller.onKeyDown}
          placeholder={t("searchPlaceholder")}
          className="flex-1 border-0 bg-transparent px-0 h-full focus:border-transparent focus:ring-0"
        />
        <button
          type="button"
          aria-label={t("clear")}
          aria-hidden={inputValue ? undefined : true}
          tabIndex={inputValue ? 0 : -1}
          onClick={controller.onClear}
          className={cn(
            "shrink-0 p-1 hoverable:hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
            !inputValue && "invisible pointer-events-none",
          )}
        >
          <X size={14} className="text-text-secondary" />
        </button>
      </div>

      {isOpen && canSearch && (
        <div
          id={listboxId}
          ref={listRef}
          role="listbox"
          className="absolute top-full left-0 right-0 sm:left-auto sm:right-0 sm:w-72 sm:max-w-[calc(100vw-2rem)] mt-1.5 max-h-[28rem] overflow-y-auto overscroll-contain no-scrollbar ui-overlay z-40 animate-fade-in"
        >
          <div className="p-1.5">{children}</div>
        </div>
      )}
      <div id={statusId} role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {isOpen && canSearch && status}
      </div>
    </div>
  );
}

function useDebouncedTerm(
  initial: string,
  delayMs = 200,
): {
  inputValue: string;
  setInputValue: (v: string) => void;
  debounced: string;
  setDebouncedDirect: (v: string) => void;
} {
  const [inputValue, setInputValue] = useState(initial);
  const [debounced, setDebounced] = useState(initial);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setDebounced(inputValue);
    }, delayMs);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [inputValue, delayMs]);
  const setDebouncedDirect = useCallback((v: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setDebounced(v);
    setInputValue(v);
  }, []);
  return { inputValue, setInputValue, debounced, setDebouncedDirect };
}

function useClickOutside(ref: RefObject<HTMLElement | null>, onOutside: () => void) {
  const onOutsideRef = useRef(onOutside);
  useEffect(() => {
    onOutsideRef.current = onOutside;
  });

  useEffect(() => {
    function handle(e: Event) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutsideRef.current();
    }
    document.addEventListener("pointerdown", handle);
    document.addEventListener("focusin", handle);
    return () => {
      document.removeEventListener("pointerdown", handle);
      document.removeEventListener("focusin", handle);
    };
  }, [ref]);
}

function useListKeyboard(itemCount: number, onSelect: (index: number) => void, onClose?: () => void) {
  const [activeIndex, setActiveIndex] = useState(-1);
  if (useResetOnChange(itemCount)) setActiveIndex(-1);
  const clampedIndex = activeIndex < 0 ? -1 : Math.min(activeIndex, itemCount - 1);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveIndex(-1);
        onClose?.();
        return;
      }
      if (itemCount === 0) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") e.preventDefault();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % itemCount);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i <= 0 ? itemCount - 1 : i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (clampedIndex >= 0) onSelect(clampedIndex);
        setActiveIndex(-1);
      }
    },
    [itemCount, clampedIndex, onSelect, onClose],
  );

  return { clampedIndex, setActiveIndex, handleKeyDown };
}
