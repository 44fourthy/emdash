import { describe, expect, it } from 'vitest';
import {
  isCursorAbove,
  moveItem,
  parseDndId,
  projectDropTarget,
  rowToDndId,
  sectionReorderTarget,
} from './sidebar-dnd';
import type { SidebarRow } from './sidebar-store';

const UNGROUPED = '';

// Ungrouped holds a and b; "work" holds c.
const rows: SidebarRow[] = [
  { kind: 'section', sectionId: UNGROUPED },
  { kind: 'project', projectId: 'a' },
  { kind: 'project', projectId: 'b' },
  { kind: 'section', sectionId: 'work' },
  { kind: 'project', projectId: 'c' },
];

const sectionForProject = (projectId: string) => (projectId === 'c' ? 'work' : UNGROUPED);
const indexInSection = (projectId: string) => (projectId === 'a' ? 0 : projectId === 'b' ? 1 : 0);

/** Mirrors the component: the cursor is over `overRowIdx`, in its top half when `isAbove`. */
function dropTarget(overRowIdx: number, isAbove: boolean) {
  return projectDropTarget({
    rows,
    insertionRowIdx: isAbove ? overRowIdx : overRowIdx + 1,
    overRow: rows[overRowIdx],
    sectionForProject,
    indexInSection,
    ungroupedId: UNGROUPED,
  });
}

describe('row dnd ids', () => {
  it('round-trips every row kind', () => {
    expect(rowToDndId({ kind: 'section', sectionId: UNGROUPED })).toBe('section::');
    expect(rowToDndId({ kind: 'project', projectId: 'a' })).toBe('proj::a');
    expect(rowToDndId({ kind: 'task', projectId: 'a', taskId: 't' })).toBe('task::a::t');
  });

  it('parses the empty Ungrouped section id', () => {
    expect(parseDndId('section::')).toEqual({ kind: 'section', sectionId: UNGROUPED });
    expect(parseDndId('section::work')).toEqual({ kind: 'section', sectionId: 'work' });
    expect(parseDndId('proj::a')).toEqual({ kind: 'project', projectId: 'a' });
    expect(parseDndId('task::a::t')).toEqual({ kind: 'task', projectId: 'a', taskId: 't' });
  });

  it('rejects unknown ids', () => {
    expect(parseDndId('nope')).toBeNull();
    expect(parseDndId('task::a')).toBeNull();
  });
});

describe('projectDropTarget', () => {
  it('targets the top of a section when dropped on its header', () => {
    expect(dropTarget(3, true)).toEqual({ sectionId: 'work', index: 0 });
    expect(dropTarget(3, false)).toEqual({ sectionId: 'work', index: 0 });
  });

  it('targets the top of Ungrouped when dropped on its header', () => {
    expect(dropTarget(0, true)).toEqual({ sectionId: UNGROUPED, index: 0 });
    expect(dropTarget(0, false)).toEqual({ sectionId: UNGROUPED, index: 0 });
  });

  it('lands at index 0 when the insertion line sits directly below a header', () => {
    // Above `a`, so the row above the line is the Ungrouped header itself.
    expect(dropTarget(1, true)).toEqual({ sectionId: UNGROUPED, index: 0 });
  });

  it('lands below a project in the same section', () => {
    // Below `a` -> after `a` in Ungrouped.
    expect(dropTarget(1, false)).toEqual({ sectionId: UNGROUPED, index: 1 });
  });

  it('lands after the last project of a section', () => {
    // Below `b`, the final member of Ungrouped.
    expect(dropTarget(2, false)).toEqual({ sectionId: UNGROUPED, index: 2 });
  });

  it('lands above the first project of a later section', () => {
    expect(dropTarget(4, true)).toEqual({ sectionId: 'work', index: 0 });
  });

  it('lands after the final project of the list', () => {
    expect(dropTarget(4, false)).toEqual({ sectionId: 'work', index: 1 });
  });

  it('maps a task neighbour to just below its owning project', () => {
    const withTask: SidebarRow[] = [
      { kind: 'section', sectionId: UNGROUPED },
      { kind: 'project', projectId: 'a' },
      { kind: 'task', projectId: 'a', taskId: 't' },
      { kind: 'project', projectId: 'b' },
    ];
    expect(
      projectDropTarget({
        rows: withTask,
        insertionRowIdx: 3,
        overRow: withTask[2],
        sectionForProject,
        indexInSection,
        ungroupedId: UNGROUPED,
      })
    ).toEqual({ sectionId: UNGROUPED, index: 1 });
  });

  it('targets a collapsed section through its header alone', () => {
    const collapsed: SidebarRow[] = [
      { kind: 'section', sectionId: UNGROUPED },
      { kind: 'project', projectId: 'a' },
      { kind: 'section', sectionId: 'work' },
    ];
    expect(
      projectDropTarget({
        rows: collapsed,
        insertionRowIdx: 2,
        overRow: collapsed[2],
        sectionForProject,
        indexInSection,
        ungroupedId: UNGROUPED,
      })
    ).toEqual({ sectionId: 'work', index: 0 });
  });
});

describe('sectionReorderTarget', () => {
  const sections = [{ id: 'work' }, { id: 'personal' }];

  it('moves a section above its target', () => {
    expect(
      sectionReorderTarget({
        sections,
        activeSectionId: 'personal',
        overSectionId: 'work',
        isAbove: true,
      })
    ).toEqual(['personal', 'work']);
  });

  it('moves a section below its target', () => {
    expect(
      sectionReorderTarget({
        sections,
        activeSectionId: 'work',
        overSectionId: 'personal',
        isAbove: false,
      })
    ).toEqual(['personal', 'work']);
  });

  it('returns null when nothing would change', () => {
    expect(
      sectionReorderTarget({
        sections,
        activeSectionId: 'work',
        overSectionId: 'work',
        isAbove: true,
      })
    ).toBeNull();
  });

  it('returns null when the drop target is not a section', () => {
    expect(
      sectionReorderTarget({
        sections,
        activeSectionId: 'work',
        overSectionId: UNGROUPED,
        isAbove: true,
      })
    ).toBeNull();
  });
});

describe('moveItem', () => {
  it('moves an item down', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  });

  it('moves an item up', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('leaves the source array untouched', () => {
    const source = ['a', 'b', 'c'];
    moveItem(source, 0, 2);
    expect(source).toEqual(['a', 'b', 'c']);
  });
});

describe('isCursorAbove', () => {
  const rect = { top: 100, height: 20 } as never;

  it('compares the pointer against the row midpoint', () => {
    expect(isCursorAbove(105, null, rect)).toBe(true);
    expect(isCursorAbove(115, null, rect)).toBe(false);
  });
});
