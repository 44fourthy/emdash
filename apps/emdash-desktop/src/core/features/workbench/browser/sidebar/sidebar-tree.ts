import type { SidebarRow } from './sidebar-store';

/** Indent added per nesting level (section > project > task) once sections exist. */
export const TREE_INDENT_STEP_PX = 16;
/** Guide lines hang beneath the level's chevron, so they share its inset. */
export const TREE_GUIDE_INSET_PX = 4;

/**
 * Nesting depth per row. With no sections every row is depth 0, so a sidebar that
 * has never had a section renders exactly as it did before sections existed.
 */
export function rowDepth(row: SidebarRow, hasSections: boolean): number {
  if (!hasSections) return 0;
  if (row.kind === 'section') return 0;
  return row.kind === 'project' ? 1 : 2;
}

export function rowDepths(rows: readonly SidebarRow[], hasSections: boolean): number[] {
  return rows.map((row) => rowDepth(row, hasSections));
}

/**
 * Whether a row is the last of its sibling group. Its own connector then ends in
 * a corner instead of running past the end of the group.
 *
 * Siblings sit at the same depth. A following row that is shallower closes the
 * group (this row was last); a deeper one is a descendant of this row, not a
 * sibling, so the scan continues past it.
 */
export function isLastSibling(depths: readonly number[], index: number): boolean {
  const depth = depths[index];
  if (depth === undefined) return true;
  for (let i = index + 1; i < depths.length; i++) {
    const next = depths[i]!;
    if (next < depth) return true;
    if (next === depth) return false;
  }
  return true;
}
