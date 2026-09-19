import { describe, expect, it } from 'vitest';
import { UNGROUPED_SECTION_ID, workbenchSidebarMemento, workbenchSidebarSchema } from './mementos';

describe('workbench sidebar memento', () => {
  it('has a valid default with no sections', () => {
    expect(workbenchSidebarSchema.safeParse(workbenchSidebarMemento.default).status).toBe('ok');
    expect(workbenchSidebarMemento.default.sections).toEqual([]);
    expect(workbenchSidebarMemento.default.sectionOfProject).toEqual({});
    expect(workbenchSidebarMemento.default.sectionAppearance).toEqual({});
  });

  it('drains the v1 flat project order into Ungrouped and adds appearance defaults', () => {
    const result = workbenchSidebarSchema.safeParse({
      version: '1',
      expandedProjectIds: ['a'],
      projectOrder: ['b', 'a'],
      taskOrderByProject: { a: ['task-1'] },
      taskSortBy: 'updated-at',
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.data).toEqual({
        version: '3',
        expandedProjectIds: ['a'],
        taskOrderByProject: { a: ['task-1'] },
        taskSortBy: 'updated-at',
        sections: [],
        collapsedSectionIds: [],
        sectionOfProject: {},
        projectOrderBySection: { [UNGROUPED_SECTION_ID]: ['b', 'a'] },
        sectionAppearance: {},
      });
    }
  });

  it('preserves existing v2 sections when adding appearance', () => {
    const result = workbenchSidebarSchema.safeParse({
      version: '2',
      expandedProjectIds: [],
      taskOrderByProject: {},
      taskSortBy: 'created-at',
      sections: [{ id: 'work', name: 'Work' }],
      collapsedSectionIds: ['work'],
      sectionOfProject: { p1: 'work' },
      projectOrderBySection: { work: ['p1'] },
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.data.version).toBe('3');
      expect(result.data.sections).toEqual([{ id: 'work', name: 'Work' }]);
      expect(result.data.sectionOfProject).toEqual({ p1: 'work' });
      expect(result.data.projectOrderBySection).toEqual({ work: ['p1'] });
      expect(result.data.sectionAppearance).toEqual({});
    }
  });

  it('accepts a palette colour and icon per section', () => {
    const result = workbenchSidebarSchema.safeParse({
      ...workbenchSidebarMemento.default,
      sections: [{ id: 'work', name: 'Work' }],
      sectionAppearance: { work: { color: 'amber', icon: 'star' } },
    });

    expect(result.status).toBe('ok');
  });

  it('rejects a colour outside the palette', () => {
    expect(
      workbenchSidebarSchema.safeParse({
        ...workbenchSidebarMemento.default,
        sectionAppearance: { work: { color: 'chartreuse' } },
      }).status
    ).toBe('invalid');
  });

  it('rejects an icon outside the curated set', () => {
    expect(
      workbenchSidebarSchema.safeParse({
        ...workbenchSidebarMemento.default,
        sectionAppearance: { work: { icon: 'unicorn' } },
      }).status
    ).toBe('invalid');
  });

  it('rejects a section without a name', () => {
    expect(
      workbenchSidebarSchema.safeParse({
        ...workbenchSidebarMemento.default,
        sections: [{ id: 'work' }],
      }).status
    ).toBe('invalid');
  });
});
