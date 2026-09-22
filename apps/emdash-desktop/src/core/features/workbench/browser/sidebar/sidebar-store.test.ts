import { observable, runInAction } from 'mobx';
import { describe, expect, it, vi } from 'vitest';
import { taskManagerStoreToken } from '@core/features/tasks/contributions/browser/project-store-tokens';
import {
  UNGROUPED_SECTION_ID,
  type WorkbenchSidebarState,
} from '@core/features/workbench/contributions/mementos';
import type { MementoHandle } from '@core/primitives/mementos/browser';
import { SidebarStore } from './sidebar-store';

type SidebarProjectManager = ConstructorParameters<typeof SidebarStore>[0];

vi.mock('@core/features/conversations/browser/acp/acp-chat-store', () => ({
  AcpChatStore: class {
    conversationId = '';
    dispose() {}
    bootstrap() {}
  },
}));

vi.mock('@core/features/conversations/browser/acp/acp-chat-panel', () => ({
  AcpChatPanel: () => null,
}));

function sidebarState(overrides: Partial<WorkbenchSidebarState> = {}): WorkbenchSidebarState {
  return {
    version: '3',
    expandedProjectIds: [],
    taskOrderByProject: {},
    taskSortBy: 'created-at',
    sections: [],
    collapsedSectionIds: [],
    sectionOfProject: {},
    projectOrderBySection: {},
    sectionAppearance: {},
    ...overrides,
  };
}

function projectManager(projects: { id: string; createdAt: string }[]): SidebarProjectManager {
  return {
    projects: new Map(projects.map((p) => [p.id, { ...p, context: null }])),
  } as unknown as SidebarProjectManager;
}

function task(id: string, createdAt: string) {
  return {
    state: 'provisioned',
    data: {
      id,
      type: 'coding-agent',
      isPinned: false,
      createdAt,
      updatedAt: createdAt,
    },
  };
}

function projectManagerWithTasks(
  projects: { id: string; createdAt: string; taskIds: string[] }[]
): SidebarProjectManager {
  return {
    projects: new Map(
      projects.map((project) => {
        const taskManager = {
          tasks: new Map(
            project.taskIds.map((taskId, index) => [
              taskId,
              task(taskId, `2026-01-01T00:00:0${index}.000Z`),
            ])
          ),
        };
        return [
          project.id,
          {
            id: project.id,
            createdAt: project.createdAt,
            context: {
              kind: 'available',
              context: {
                get: (token: unknown) =>
                  token === taskManagerStoreToken ? taskManager : undefined,
              },
            },
          },
        ];
      })
    ),
  } as unknown as SidebarProjectManager;
}

function mementoHandle(initial: WorkbenchSidebarState): MementoHandle<WorkbenchSidebarState> {
  let value = initial;
  return {
    get value() {
      return value;
    },
    ready: Promise.resolve(),
    isPending: false,
    hasStoredValue: true,
    read: () => value,
    update: (next) => {
      value = typeof next === 'function' ? next(value) : next;
    },
    reset: async () => {},
    flush: async () => {},
    autoPersist: () =>
      (() => {}) as ReturnType<MementoHandle<WorkbenchSidebarState>['autoPersist']>,
    dispose: async () => {},
  };
}

describe('SidebarStore project ordering', () => {
  it('keeps a restored collapsed project collapsed during initial task hydration', () => {
    const tasks = observable.map<string, ReturnType<typeof task>>();
    const project = observable({
      id: 'project-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      context: null as null | {
        kind: 'available';
        context: { get: () => { tasks: typeof tasks } };
      },
    });
    const manager = {
      projects: observable.map([['project-1', project]]),
    } as unknown as SidebarProjectManager;
    const handle = mementoHandle(sidebarState());
    const store = new SidebarStore(manager);
    store.attachMemento(handle);

    runInAction(() => {
      project.context = {
        kind: 'available',
        context: { get: () => ({ tasks }) },
      };
    });
    runInAction(() => {
      tasks.set('task-1', task('task-1', '2026-01-01T00:00:00.000Z'));
    });

    expect([...store.expandedProjectIds]).toEqual([]);
    expect(handle.value.expandedProjectIds).toEqual([]);
  });

  it('reads and writes through an attached memento', () => {
    const store = new SidebarStore(projectManager([]));
    const handle = mementoHandle(
      sidebarState({ expandedProjectIds: ['project-1'], taskSortBy: 'updated-at' })
    );

    store.attachMemento(handle);
    expect([...store.expandedProjectIds]).toEqual(['project-1']);
    expect(store.taskSortBy).toBe('updated-at');

    store.setTaskSortBy('created-at');
    expect(handle.value.taskSortBy).toBe('created-at');
  });

  it('reveals a project without changing its persisted expansion preference', () => {
    const store = new SidebarStore(projectManager([{ id: 'project-1', createdAt: '2026-01-01' }]));
    const handle = mementoHandle(sidebarState());
    store.attachMemento(handle);

    store.revealProject('project-1');
    expect([...store.expandedProjectIds]).toEqual(['project-1']);
    expect(handle.value.expandedProjectIds).toEqual([]);

    store.toggleProjectExpanded('project-1');
    expect([...store.expandedProjectIds]).toEqual([]);
    expect(handle.value.expandedProjectIds).toEqual([]);
  });

  it('sorts projects newest first by default', () => {
    const store = new SidebarStore(
      projectManager([
        { id: 'old', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'new', createdAt: '2026-01-02T00:00:00.000Z' },
      ])
    );

    expect(store.orderedProjects.map((project) => project.id)).toEqual(['new', 'old']);
  });

  it('places projects missing from a saved manual order first', () => {
    const store = new SidebarStore(
      projectManager([
        { id: 'old', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'manual', createdAt: '2026-01-02T00:00:00.000Z' },
        { id: 'new', createdAt: '2026-01-03T00:00:00.000Z' },
      ])
    );
    store.attachMemento(
      mementoHandle(
        sidebarState({ projectOrderBySection: { [UNGROUPED_SECTION_ID]: ['manual', 'old'] } })
      )
    );

    expect(store.projectsForSection(UNGROUPED_SECTION_ID).map((project) => project.id)).toEqual([
      'new',
      'manual',
      'old',
    ]);
  });

  it('returns visible task entries in rendered project-tree order', () => {
    const store = new SidebarStore(
      projectManagerWithTasks([
        {
          id: 'project-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          taskIds: ['task-1a', 'task-1b'],
        },
        {
          id: 'project-2',
          createdAt: '2026-01-02T00:00:00.000Z',
          taskIds: ['task-2a'],
        },
      ])
    );
    store.attachMemento(
      mementoHandle(
        sidebarState({
          projectOrderBySection: { [UNGROUPED_SECTION_ID]: ['project-1', 'project-2'] },
        })
      )
    );

    store.toggleProjectExpanded('project-1');
    store.toggleProjectExpanded('project-2');
    store.setTaskOrder('project-1', ['task-1a', 'task-1b']);

    expect(store.visibleTaskEntries).toEqual([
      { projectId: 'project-1', taskId: 'task-1a' },
      { projectId: 'project-1', taskId: 'task-1b' },
      { projectId: 'project-2', taskId: 'task-2a' },
    ]);
  });

  it('excludes pinned automation runs from every sidebar selector', () => {
    const manager = projectManagerWithTasks([
      {
        id: 'project-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        taskIds: ['regular-task', 'automation-task'],
      },
    ]);
    const project = manager.projects.get('project-1')!;
    const context = project.context?.kind === 'available' ? project.context.context : undefined;
    const tasks = context!.get(taskManagerStoreToken).tasks;
    tasks.get('regular-task')!.data.isPinned = true;
    tasks.get('automation-task')!.data.isPinned = true;
    tasks.get('automation-task')!.data.type = 'automation-run';

    const store = new SidebarStore(manager);
    store.toggleProjectExpanded('project-1');

    expect(store.pinnedSidebarEntries).toEqual([
      { projectId: 'project-1', taskId: 'regular-task' },
    ]);
    expect(store.visibleTaskIdsForProject('project-1')).toEqual([]);
    expect(store.sidebarRows).toEqual([{ kind: 'project', projectId: 'project-1' }]);
  });
});

describe('SidebarStore sections', () => {
  function sectionsStore(
    projects = [
      { id: 'p1', createdAt: '2026-01-02T00:00:00.000Z' },
      { id: 'p2', createdAt: '2026-01-01T00:00:00.000Z' },
    ],
    state = sidebarState({ sections: [{ id: 'work', name: 'Work' }] })
  ) {
    const store = new SidebarStore(projectManager(projects));
    const handle = mementoHandle(state);
    store.attachMemento(handle);
    return { store, handle };
  }

  it('renders flat with no section rows until a section exists', () => {
    const { store } = sectionsStore(undefined, sidebarState());

    expect(store.sidebarRows).toEqual([
      { kind: 'project', projectId: 'p1' },
      { kind: 'project', projectId: 'p2' },
    ]);
  });

  it('renders Ungrouped last, after every named section', () => {
    const { store } = sectionsStore();

    expect(store.sidebarRows).toEqual([
      { kind: 'section', sectionId: 'work' },
      { kind: 'section', sectionId: UNGROUPED_SECTION_ID },
      { kind: 'project', projectId: 'p1' },
      { kind: 'project', projectId: 'p2' },
    ]);
  });

  it('renders assigned projects under their section', () => {
    const { store } = sectionsStore(
      undefined,
      sidebarState({ sections: [{ id: 'work', name: 'Work' }], sectionOfProject: { p1: 'work' } })
    );

    expect(store.sidebarRows).toEqual([
      { kind: 'section', sectionId: 'work' },
      { kind: 'project', projectId: 'p1' },
      { kind: 'section', sectionId: UNGROUPED_SECTION_ID },
      { kind: 'project', projectId: 'p2' },
    ]);
  });

  it('keeps a collapsed section header while hiding its projects', () => {
    const { store } = sectionsStore(
      undefined,
      sidebarState({
        sections: [{ id: 'work', name: 'Work' }],
        sectionOfProject: { p1: 'work' },
        collapsedSectionIds: ['work'],
      })
    );

    expect(store.sidebarRows).toEqual([
      { kind: 'section', sectionId: 'work' },
      { kind: 'section', sectionId: UNGROUPED_SECTION_ID },
      { kind: 'project', projectId: 'p2' },
    ]);
  });

  it('collapses the implicit Ungrouped section', () => {
    const { store } = sectionsStore(
      undefined,
      sidebarState({
        sections: [{ id: 'work', name: 'Work' }],
        sectionOfProject: { p1: 'work' },
        collapsedSectionIds: [UNGROUPED_SECTION_ID],
      })
    );

    expect(store.sidebarRows).toEqual([
      { kind: 'section', sectionId: 'work' },
      { kind: 'project', projectId: 'p1' },
      { kind: 'section', sectionId: UNGROUPED_SECTION_ID },
    ]);
  });

  it('resolves an unknown section id to Ungrouped', () => {
    const { store } = sectionsStore(
      undefined,
      sidebarState({ sections: [{ id: 'work', name: 'Work' }], sectionOfProject: { p1: 'ghost' } })
    );

    expect(store.sectionForProject('p1')).toBe(UNGROUPED_SECTION_ID);
    expect(store.sectionForProject('p2')).toBe(UNGROUPED_SECTION_ID);
  });

  it('moves a project into a section at the requested index', () => {
    const { store, handle } = sectionsStore();

    store.moveProjectToSection('p1', 'work', 0);

    expect(handle.value.sectionOfProject).toEqual({ p1: 'work' });
    expect(handle.value.projectOrderBySection['work']).toEqual(['p1']);
    expect(store.sectionForProject('p1')).toBe('work');
  });

  it('reorders within a section using array-move semantics', () => {
    const { store, handle } = sectionsStore(
      undefined,
      sidebarState({
        sections: [{ id: 'work', name: 'Work' }],
        sectionOfProject: { p1: 'work', p2: 'work' },
        projectOrderBySection: { work: ['p1', 'p2'] },
      })
    );

    // Dropping p1 below p2 reports an insertion index of 2, which array-move
    // semantics resolve to final index 1.
    store.moveProjectToSection('p1', 'work', 2);

    expect(handle.value.projectOrderBySection['work']).toEqual(['p2', 'p1']);
  });

  it('returns a deleted section’s projects to Ungrouped', () => {
    const { store, handle } = sectionsStore(
      undefined,
      sidebarState({
        sections: [{ id: 'work', name: 'Work' }],
        sectionOfProject: { p1: 'work' },
        projectOrderBySection: { work: ['p1'] },
        collapsedSectionIds: ['work'],
      })
    );

    store.deleteSection('work');

    expect(handle.value.sections).toEqual([]);
    expect(handle.value.sectionOfProject).toEqual({});
    expect(handle.value.projectOrderBySection).toEqual({});
    expect(handle.value.collapsedSectionIds).toEqual([]);
    // With no sections left the list is flat again and both projects remain.
    expect(store.sidebarRows).toEqual([
      { kind: 'project', projectId: 'p1' },
      { kind: 'project', projectId: 'p2' },
    ]);
  });

  it('refuses to delete the implicit Ungrouped section', () => {
    const { store, handle } = sectionsStore();

    store.deleteSection(UNGROUPED_SECTION_ID);

    expect(handle.value.sections).toEqual([{ id: 'work', name: 'Work' }]);
  });

  it('trims renames and ignores a blank name', () => {
    const { store, handle } = sectionsStore();

    store.renameSection('work', '  Clients  ');
    expect(handle.value.sections).toEqual([{ id: 'work', name: 'Clients' }]);

    store.renameSection('work', '   ');
    expect(handle.value.sections).toEqual([{ id: 'work', name: 'Clients' }]);
  });

  it('creates a section with an explicit id and appends it last', () => {
    const { store, handle } = sectionsStore();

    const id = store.createSection('Personal', 'personal');

    expect(id).toBe('personal');
    expect(handle.value.sections.map((section) => section.id)).toEqual(['work', 'personal']);
  });

  it('reorders sections and appends any omitted ones', () => {
    const { store, handle } = sectionsStore(
      undefined,
      sidebarState({
        sections: [
          { id: 'work', name: 'Work' },
          { id: 'personal', name: 'Personal' },
        ],
      })
    );

    store.setSectionOrder(['personal']);

    expect(handle.value.sections.map((section) => section.id)).toEqual(['personal', 'work']);
  });

  it('reveals a collapsed section for navigation without persisting the change', () => {
    const { store, handle } = sectionsStore(
      undefined,
      sidebarState({
        sections: [{ id: 'work', name: 'Work' }],
        sectionOfProject: { p1: 'work' },
        collapsedSectionIds: ['work'],
      })
    );

    store.revealProject('p1');

    expect(store.collapsedSectionIds.has('work')).toBe(false);
    expect(store.sidebarRows).toEqual([
      { kind: 'section', sectionId: 'work' },
      { kind: 'project', projectId: 'p1' },
      { kind: 'section', sectionId: UNGROUPED_SECTION_ID },
      { kind: 'project', projectId: 'p2' },
    ]);
    expect(handle.value.collapsedSectionIds).toEqual(['work']);
  });

  it('stores colour and icon independently', () => {
    const { store, handle } = sectionsStore();

    store.setSectionAppearance('work', { color: 'amber' });
    expect(store.appearanceForSection('work')).toEqual({ color: 'amber' });

    store.setSectionAppearance('work', { icon: 'star' });
    expect(store.appearanceForSection('work')).toEqual({ color: 'amber', icon: 'star' });
    expect(handle.value.sectionAppearance).toEqual({ work: { color: 'amber', icon: 'star' } });
  });

  it('clears one field without disturbing the other', () => {
    const { store } = sectionsStore();

    store.setSectionAppearance('work', { color: 'teal', icon: 'rocket' });
    store.setSectionAppearance('work', { color: undefined });

    expect(store.appearanceForSection('work')).toEqual({ icon: 'rocket' });
  });

  it('drops the stored entry once nothing is left to remember', () => {
    const { store, handle } = sectionsStore();

    store.setSectionAppearance('work', { color: 'blue' });
    store.setSectionAppearance('work', { color: undefined });

    expect(store.appearanceForSection('work')).toBeUndefined();
    expect(handle.value.sectionAppearance).toEqual({});
  });

  it('reports no appearance for a section that was never customised', () => {
    const { store } = sectionsStore();

    expect(store.appearanceForSection('work')).toBeUndefined();
    expect(store.appearanceForSection(UNGROUPED_SECTION_ID)).toBeUndefined();
  });

  it('forgets a deleted section’s appearance', () => {
    const { store, handle } = sectionsStore(
      undefined,
      sidebarState({
        sections: [{ id: 'work', name: 'Work' }],
        sectionAppearance: { work: { color: 'violet' } },
      })
    );

    store.deleteSection('work');

    expect(handle.value.sectionAppearance).toEqual({});
    expect(store.appearanceForSection('work')).toBeUndefined();
  });
});
