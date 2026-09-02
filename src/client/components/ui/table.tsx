import { memo, type ReactNode } from "react";
import { cn } from "@/client/utils";

interface ThProps {
  align?: "left" | "right";
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
}

export const Th = memo(function Th({ align = "left", className, style, children }: ThProps) {
  return (
    <th
      className={cn(
        "px-2.5 py-2.5 text-xs font-medium text-text-tertiary",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
      style={style}
    >
      {children}
    </th>
  );
});

interface TdProps {
  align?: "left" | "right";
  mono?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
}

export const Td = memo(function Td({ align = "left", mono, className, style, children }: TdProps) {
  return (
    <td
      className={cn("px-2.5 py-2.5", mono && "font-mono", align === "right" && "text-right", className)}
      style={style}
    >
      {children}
    </td>
  );
});

export function Tr({ className, children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn("border-b border-border last:border-b-0", className)} {...props}>
      {children}
    </tr>
  );
}
