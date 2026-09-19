import type { ClientRect } from '@dnd-kit/core';
import type { SidebarRow } from './sidebar-store';

const SECTION_PREFIX = 'section::';
const PROJECT_PREFIX = 'proj::';
const TASK_PREFIX = 'task::';

const toSectionDndId = (sectionId: string) => `${SECTION_PREFIX}${sectionId}`;
const toProjectDndId = (projectId: string) => `${PROJECT_PREFIX}${projectId}`;
const toTaskDndId = (projectId: string, taskId: string) => `${TASK_PREFIX}${projectId}::${taskId}`;

export type SidebarDndId =
  | { kind: 'project'; projectId: string }
  | { kind: 'task'; projectId: string; taskId: string }
  | { kind: 'section'; sectionId: string };

export function rowToDndId(row: SidebarRow): string {
  switch (row.kind) {
    case 'section':
      return toSectionDndId(row.sectionId);
    case 'project':
      return toProjectDndId(row.projectId);
    case 'task':
      return toTaskDndId(row.projectId, row.taskId);
  }
}

export function parseDndId(id: string): SidebarDndId | null {
  // Ungrouped's section id is empty, so prefix checks must run before the task
  // split rather than relying on a non-empty middle segment.
  if (id.startsWith(SECTION_PREFIX)) {
    return { kind: 'section', sectionId: id.slice(SECTION_PREFIX.length) };
  }
  if (id.startsWith(PROJECT_PREFIX)) {
    return { kind: 'project', projectId: id.slice(PROJECT_PREFIX.length) };
  }
  if (id.startsWith(TASK_PREFIX)) {
    const [, projectId, taskId] = id.split('::');
    if (projectId && taskId) return { kind: 'task', projectId, taskId };
  }
  return null;
}

/** Splice one item to another index, returning a new array. */
export function moveItem<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) return next;
  next.splice(toIndex, 0, moved);
  return next;
}

export type ProjectDropTarget = { sectionId: string; index: number };

/**
 * Where a dragged project lands. One rule: it lands immediately after whatever
 * row sits above the insertion line, in that row's section. Tasks always render
 * below their own project row, so a task neighbour maps to "after the project".
 */
export function projectDropTarget(args: {
  rows: readonly SidebarRow[];
  insertionRowIdx: number;
  overRow: SidebarRow | undefined;
  sectionForProject: (projectId: string) => string;
  indexInSection: (projectId: string) => number;
  ungroupedId: string;
}): ProjectDropTarget {
  const { rows, insertionRowIdx, overRow, sectionForProject, indexInSection, ungroupedId } = args;

  // Targeting the header itself is the only way to drop into a collapsed section,
  // whose projects have no rows to sit above.
  if (overRow?.kind === 'section') return { sectionId: overRow.sectionId, index: 0 };

  const above = insertionRowIdx > 0 ? rows[insertionRowIdx - 1] : undefined;
  if (!above) return { sectionId: ungroupedId, index: 0 };
  if (above.kind === 'section') return { sectionId: above.sectionId, index: 0 };

  return {
    sectionId: sectionForProject(above.projectId),
    index: indexInSection(above.projectId) + 1,
  };
}

/** New section id order for a drag, or null when nothing would change. */
export function sectionReorderTarget(args: {
  sections: readonly { id: string }[];
  activeSectionId: string;
  overSectionId: string;
  isAbove: boolean;
}): string[] | null {
  const ids = args.sections.map((section) => section.id);
  const oldIndex = ids.indexOf(args.activeSectionId);
  const overIndex = ids.indexOf(args.overSectionId);
  if (oldIndex === -1 || overIndex === -1) return null;
  let newIndex = args.isAbove ? overIndex : overIndex + 1;
  if (newIndex > oldIndex) newIndex -= 1;
  if (newIndex === oldIndex) return null;
  return moveItem(ids, oldIndex, newIndex);
}

export function isCursorAbove(
  pointerY: number | null,
  translated: ClientRect | null,
  overRect: ClientRect
): boolean {
  if (pointerY !== null) return pointerY < overRect.top + overRect.height / 2;
  if (!translated) return true;
  const cursorY = translated.top + translated.height / 2;
  const overCenterY = overRect.top + overRect.height / 2;
  return cursorY < overCenterY;
}
