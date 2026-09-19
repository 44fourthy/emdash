import { describe, expect, it } from 'vitest';
import type { SidebarRow } from './sidebar-store';
import { isLastSibling, rowDepth, rowDepths } from './sidebar-tree';

const section = (sectionId: string): SidebarRow => ({ kind: 'section', sectionId });
const project = (projectId: string): SidebarRow => ({ kind: 'project', projectId });
const task = (projectId: string, taskId: string): SidebarRow => ({
  kind: 'task',
  projectId,
  taskId,
});

describe('rowDepth', () => {
  it('nests section > project > task once sections exist', () => {
    expect(rowDepth(section('work'), true)).toBe(0);
    expect(rowDepth(project('a'), true)).toBe(1);
    expect(rowDepth(task('a', 't'), true)).toBe(2);
  });

  it('keeps every row at depth 0 when there are no sections', () => {
    expect(rowDepth(section(''), false)).toBe(0);
    expect(rowDepth(project('a'), false)).toBe(0);
    expect(rowDepth(task('a', 't'), false)).toBe(0);
  });
});

describe('rowDepths', () => {
  it('maps a whole list in render order', () => {
    const rows = [
      section(''),
      project('a'),
      task('a', 't1'),
      task('a', 't2'),
      section('work'),
      project('b'),
    ];

    expect(rowDepths(rows, true)).toEqual([0, 1, 2, 2, 0, 1]);
    expect(rowDepths(rows, false)).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe('isLastSibling', () => {
  it('treats a row followed by a sibling as not last', () => {
    const depths = rowDepths(
      [section(''), project('a'), task('a', 't1'), task('a', 't2'), section('work')],
      true
    );
    // project a is followed only by its own tasks, then a shallower section row,
    // so it is the last project in its group.
    expect(isLastSibling(depths, 1)).toBe(true);
    // t1 has t2 after it at the same depth, so it is not last.
    expect(isLastSibling(depths, 2)).toBe(false);
    expect(isLastSibling(depths, 3)).toBe(true);
  });

  it('skips descendants when looking for the next sibling', () => {
    const depths = rowDepths(
      [section(''), project('a'), task('a', 't'), project('b'), task('b', 't')],
      true
    );
    // project a (index 1) is followed by its task (deeper) then project b (same) ->
    // not last.
    expect(isLastSibling(depths, 1)).toBe(false);
    // project b is followed only by its deeper task -> last.
    expect(isLastSibling(depths, 3)).toBe(true);
  });

  it('treats the final row and an out-of-range index as last', () => {
    const depths = [0, 1, 2];
    expect(isLastSibling(depths, 2)).toBe(true);
    expect(isLastSibling(depths, 99)).toBe(true);
  });

  it('closes a group at a shallower row', () => {
    const depths = rowDepths([section(''), project('a'), section('work'), project('b')], true);
    // project a is followed by a section (shallower) -> last of its group.
    expect(isLastSibling(depths, 1)).toBe(true);
    expect(isLastSibling(depths, 3)).toBe(true);
  });
});
