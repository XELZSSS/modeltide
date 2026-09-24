import { ChevronRight } from "lucide-react";
import { useTranslation } from "@/client/providers";
import { Sheet, SheetBody, SheetHeader } from "@/client/components/ui/sheet";
import { SafeLink as Link, usePathname } from "@/client/router";
import { isNavActive, useNavigation, usePrefetch, type NavItem, type PrefetchControls } from "./navigation";

interface MobileMoreSheetProps {
  open: boolean;
  onClose: () => void;
}

export function MobileMoreSheet({ open, onClose }: MobileMoreSheetProps) {
  const pathname = usePathname();
  const { mobileMore } = useNavigation();
  const { t } = useTranslation();
  const prefetch = usePrefetch();

  return (
    <Sheet open={open} onClose={onClose} ariaLabel={t("navMore")}>
      <SheetBody>
        <SheetHeader title={t("more")} onClose={onClose} />

        <nav className="divide-y divide-border" aria-label={t("navSecondary")}>
          {mobileMore.map((item) => (
            <NavRow
              key={item.path}
              item={item}
              active={isNavActive(pathname, item)}
              onClose={onClose}
              prefetch={prefetch}
            />
          ))}
        </nav>
      </SheetBody>
    </Sheet>
  );
}

function NavRow({
  item,
  active,
  onClose,
  prefetch,
}: {
  item: NavItem;
  active: boolean;
  onClose: () => void;
  prefetch: PrefetchControls;
}) {
  return (
    <Link
      href={item.path}
      onClick={onClose}
      aria-current={active ? "page" : undefined}
      onTouchStart={() => prefetch.immediate(item.path)}
      onMouseEnter={() => prefetch.hover(item.path)}
      onMouseLeave={prefetch.cancel}
      onFocus={() => prefetch.immediate(item.path)}
      onBlur={prefetch.cancel}
      className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors duration-fast focus-visible:outline-none focus-visible:bg-hover ${
        active ? "text-accent" : "text-text-primary hoverable:hover:bg-hover"
      }`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <span className={active ? "text-accent shrink-0" : "text-text-secondary shrink-0"}>{item.icon}</span>
        <span className="text-sm">{item.label}</span>
      </span>
      <ChevronRight size={16} className="text-text-tertiary shrink-0" aria-hidden="true" />
    </Link>
  );
}
