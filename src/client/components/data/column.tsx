import type { ReactNode } from "react";
import type { DataTableColumn } from "./types";
import { RightAlignedText } from "./cells";

export function textCol<T>(
  id: string,
  header: string,
  cell: (row: T) => ReactNode,
  opts?: { width?: number | string },
): DataTableColumn<T> {
  return { id, header, cell, ...opts };
}

export function rightCol<T>(
  id: string,
  header: string,
  cell: (row: T) => ReactNode,
  opts?: { hiddenMd?: boolean; width?: number | string },
): DataTableColumn<T> {
  return { id, header, cell, align: "right", hiddenMd: true, ...opts };
}

/** Right-aligned column whose accessor returns null to render the quiet localized "N/A". */
export function rightColNA<T>(
  id: string,
  header: string,
  render: (row: T) => ReactNode | null,
  notAvailableLabel: string,
  opts?: { hiddenMd?: boolean; width?: number | string; mobilePrimary?: boolean },
): DataTableColumn<T> {
  return rightCol(
    id,
    header,
    (row) => {
      const value = render(row);
      // N/A cells stay visually quiet instead of competing with real values.
      return value == null ? (
        <RightAlignedText className="text-text-tertiary">{notAvailableLabel}</RightAlignedText>
      ) : (
        <RightAlignedText>{value}</RightAlignedText>
      );
    },
    opts,
  );
}

export function mobilePrimaryCol<T>(
  id: string,
  header: string,
  cell: (row: T) => ReactNode,
  opts?: { hiddenMd?: boolean },
): DataTableColumn<T> {
  return { id, header, cell, align: "right", hiddenMd: true, mobilePrimary: true, ...opts };
}
