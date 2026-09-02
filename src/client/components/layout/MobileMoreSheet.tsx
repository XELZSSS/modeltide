import { NavLink, useLocation } from "react-router";
import { useNavigation, isNavActive } from "./navigation";
import { useTranslation } from "@/client/providers";
import { Sheet } from "@/client/components/ui";
import type { NavItem } from "./navigation";

interface MobileMoreSheetProps {
  open: boolean;
  onClose: () => void;
}

const tileClass = (active: boolean) =>
  `flex flex-col items-center gap-1.5 w-20 py-3 rounded-xl text-xs font-medium transition-colors ${
    active ? "bg-selected text-accent" : "text-text-secondary hover:bg-hover"
  }`;

/** Compact floating "More" menu on mobile: icon-tile grid hovering above the bottom nav. */
export function MobileMoreSheet({ open, onClose }: MobileMoreSheetProps) {
  const { pathname } = useLocation();
  const { mobileMore } = useNavigation();
  const { t } = useTranslation();

  return (
    <Sheet open={open} onClose={onClose} className="w-auto mb-24 rounded-2xl p-2" ariaLabel={t("navMore")}>
      <nav className="flex gap-1" aria-label={t("navSecondary")}>
        {mobileMore.map((item) => {
          const active = isNavActive(pathname, item);
          return <NavTile key={item.path} item={item} active={active} onClose={onClose} />;
        })}
      </nav>
    </Sheet>
  );
}

function NavTile({ item, active, onClose }: { item: NavItem; active: boolean; onClose: () => void }) {
  return (
    <NavLink to={item.path} onClick={onClose} aria-current={active ? "page" : undefined} className={tileClass(active)}>
      <span className="[&>svg]:size-[22px]">{item.icon}</span>
      <span>{item.label}</span>
    </NavLink>
  );
}
