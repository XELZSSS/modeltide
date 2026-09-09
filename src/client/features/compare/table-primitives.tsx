"use client";
import { memo, type ReactNode } from "react";
import { cn } from "@/client/utils/cn";

export const Th = memo(function Th({ align = "left", className, style, children, scope }: { align?: "left" | "right"; className?: string; style?: React.CSSProperties; children?: ReactNode; scope?: "col" | "row" }) {
  return <th scope={scope} className={cn("px-4 py-2.5 text-xs font-medium text-text-tertiary", align === "right" ? "text-right" : "text-left", className)} style={style}>{children}</th>;
});

export const Td = memo(function Td({ align = "left", mono, className, style, children }: { align?: "left" | "right"; mono?: boolean; className?: string; style?: React.CSSProperties; children?: ReactNode }) {
  return <td className={cn("px-4 py-2.5 text-sm", mono && "font-mono tabular-nums", align === "right" && "text-right", className)} style={style}>{children}</td>;
});

export const Tr = memo(function Tr({ className, children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b border-border last:border-b-0", className)} {...props}>{children}</tr>;
});
