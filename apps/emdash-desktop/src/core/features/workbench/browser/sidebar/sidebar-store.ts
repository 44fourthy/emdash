import { computed, makeAutoObservable, observable } from 'mobx';
import { type ProjectStore } from '@core/features/projects/api/browser/stores/project';
import type { ProjectManagerStore } from '@core/features/projects/api/browser/stores/project-manager';
import { asAvailableProject } from '@core/features/projects/api/browser/stores/project-selectors';
import type { TaskStore } from '@core/features/tasks/api/browser/stores/task-store';
import { taskManagerStoreToken } from '@core/features/tasks/contributions/browser/project-store-tokens';
import {
  UNGROUPED_SECTION_ID,
  workbenchSidebarMemento,
  type SidebarSection,
  type WorkbenchSidebarState,
} from '@core/features/workbench/contributions/mementos';
import {
  hasAppearance,
  type SectionAppearance,
} from '@core/features/workbench/contributions/section-appearance';
import type { MementoHandle } from '@core/primitives/mementos/browser';
import {
  registeredTaskData,
  unregisteredTaskData,
} from '@core/primitives/task-state/browser/task-state';
import { moveItem } from './sidebar-dnd';
export type SidebarTaskSortBy = WorkbenchSidebarState['taskSortBy'];

export type TaskSortKind = 'created' | 'updated';

export function sortKindFor(sortBy: SidebarTaskSortBy): TaskSortKind {
  return sortBy === 'created-at' ? 'created' : 'updated';
}

export function getSortInstant(task: TaskStore, kind: TaskSortKind): string | undefined {
  const reg = registeredTaskData(task);
  if (reg) {
    if (kind === 'created') return reg.createdAt;
    return reg.lastInteractedAt ?? reg.updatedAt;
  }
  const u = unregisteredTaskData(task);
  if (u) {
    if (kind === 'created') return u.createdAt;
    return u.lastInteractedAt;
  }
  return undefined;
}

function isVisibleRegularTask(task: TaskStore): boolean {
  return (
    task.data.type !== 'automation-run' &&
    (task.state === 'unregistered' || !('archivedAt' in task.data && task.data.archivedAt))
  );
}

export type SidebarRow =
  | { kind: 'section'; sectionId: string }
  | { kind: 'project'; projectId: string }
  | { kind: 'task'; projectId: string; taskId: string };

export class SidebarStore {
  private _handle: MementoHandle<WorkbenchSidebarState> | undefined;
  private _fallbackState: WorkbenchSidebarState = workbenchSidebarMemento.default;
  private readonly _revealedProjectIds = observable.set<string>();
  private readonly _revealedSectionIds = observable.set<string>();
  /** Section whose header is showing its inline rename input, if any. */
  private _editingSectionId: string | null = null;

  constructor(private readonly projectManager: ProjectManagerStore) {
    // `_handle` must stay observable: computeds reading `state` before the
    // memento handle is attached would otherwise capture zero dependencies
    // and freeze at the fallback value forever.
    makeAutoObservable<
      SidebarStore,
      | '_fallbackState'
      | '_handle'
      | '_revealedProjectIds'
      | '_revealedSectionIds'
      | '_editingSectionId'
      | 'projectManager'
    >(this, {
      _fallbackState: false,
      _handle: observable.ref,
      _revealedProjectIds: false,
      _revealedSectionIds: false,
      _editingSectionId: observable.ref,
      projectManager: false,
      expandedProjectIds: computed.struct,
      collapsedSectionIds: computed.struct,
      sidebarRows: computed,
      pinnedSidebarEntries: computed,
    });
  }

  get taskOrderByProject(): Record<string, string[]> {
    return this.state.taskOrderByProject;
  }

  get sections(): readonly SidebarSection[] {
    return this.state.sections;
  }

  get hasSections(): boolean {
    return this.state.sections.length > 0;
  }

  appearanceForSection(sectionId: string): SectionAppearance | undefined {
    return this.state.sectionAppearance[sectionId];
  }

  /**
   * Sections whose projects are hidden. A section revealed by navigation this
   * session drops out of the set without touching the persisted collapse state.
   */
  get collapsedSectionIds(): ReadonlySet<string> {
    const collapsed = new Set(this.state.collapsedSectionIds);
    for (const sectionId of this._revealedSectionIds) collapsed.delete(sectionId);
    return collapsed;
  }

  get expandedProjectIds(): ReadonlySet<string> {
    return new Set([...this.state.expandedProjectIds, ...this._revealedProjectIds]);
  }

  get taskSortBy(): SidebarTaskSortBy {
    return this.state.taskSortBy;
  }

  attachMemento(handle: MementoHandle<WorkbenchSidebarState>): void {
    if (this._handle) throw new Error('Sidebar memento is already attached');
    this._handle = handle;
  }

  /** Global recency order. Every section orders its members relative to this. */
  get orderedProjects(): ProjectStore[] {
    return [...this.projectManager.projects.values()].sort((a, b) =>
      this.compareSidebarProjects(a, b)
    );
  }

  /**
   * Resolve a project's section. An absent or unknown section id resolves to
   * Ungrouped, the same lazy-filter convention the store already uses for stale
   * project and task order ids after a project is deleted.
   */
  sectionForProject(projectId: string): string {
    const sectionId = this.state.sectionOfProject[projectId];
    if (sectionId === undefined || sectionId === UNGROUPED_SECTION_ID) {
      return UNGROUPED_SECTION_ID;
    }
    return this.state.sections.some((section) => section.id === sectionId)
      ? sectionId
      : UNGROUPED_SECTION_ID;
  }

  /** A section's live members in rendered order. */
  projectsForSection(sectionId: string): ProjectStore[] {
    const members = this.orderedProjects.filter(
      (project) => this.sectionForProject(project.id) === sectionId
    );
    const stored = this.state.projectOrderBySection[sectionId] ?? [];
    const byId = new Map(members.map((project) => [project.id, project] as const));
    const seen = new Set<string>();
    const ordered: ProjectStore[] = [];
    for (const id of stored) {
      const project = byId.get(id);
      if (project) {
        ordered.push(project);
        seen.add(id);
      }
    }
    // Members missing from the stored order are already recency-sorted and are
    // prepended so they surface at the top rather than after manual entries.
    return [...members.filter((project) => !seen.has(project.id)), ...ordered];
  }

  get sidebarRows(): SidebarRow[] {
    const rows: SidebarRow[] = [];
    const pushProject = (project: ProjectStore) => {
      const projectId = project.id;
      rows.push({ kind: 'project', projectId });
      const context = asAvailableProject(project);
      if (this.expandedProjectIds.has(projectId) && context) {
        const tasks = Array.from(context.get(taskManagerStoreToken).tasks.values()).filter(
          isVisibleRegularTask
        );
        const manualOrder = this.taskOrderByProject[projectId];
        const ordered = manualOrder?.length
          ? this.mergeTaskOrder(projectId, tasks)
          : this.sortTasksForSidebar(tasks);
        for (const task of ordered) {
          if (task.data.isPinned) continue;
          rows.push({ kind: 'task', projectId, taskId: task.data.id });
        }
      }
    };

    // Flat until the user creates a section: no headers, and the same order
    // pre-sections builds produced, so upgrading changes nothing visually.
    if (!this.hasSections) {
      for (const project of this.projectsForSection(UNGROUPED_SECTION_ID)) pushProject(project);
      return rows;
    }

    for (const section of this.state.sections) {
      // Emitted even when empty so the section stays visible and droppable-into.
      rows.push({ kind: 'section', sectionId: section.id });
      if (this.collapsedSectionIds.has(section.id)) continue;
      for (const project of this.projectsForSection(section.id)) pushProject(project);
    }
    // Ungrouped sits last: it is the catch-all for unassigned projects, so it
    // reads as the tail of the list rather than the head of it.
    rows.push({ kind: 'section', sectionId: UNGROUPED_SECTION_ID });
    if (!this.collapsedSectionIds.has(UNGROUPED_SECTION_ID)) {
      for (const project of this.projectsForSection(UNGROUPED_SECTION_ID)) pushProject(project);
    }
    return rows;
  }

  /** Visible unpinned tasks in the same order they are rendered in the project tree. */
  get visibleTaskEntries(): { projectId: string; taskId: string }[] {
    return this.sidebarRows
      .filter((row): row is Extract<SidebarRow, { kind: 'task' }> => row.kind === 'task')
      .map(({ projectId, taskId }) => ({ projectId, taskId }));
  }

  /** Flat list of pinned tasks from available Project contexts, in project-tree sort order. */
  get pinnedSidebarEntries(): { projectId: string; taskId: string }[] {
    const pairs: { projectId: string; task: TaskStore }[] = [];
    for (const project of this.projectManager.projects.values()) {
      const context = asAvailableProject(project);
      if (!context) continue;
      const projectId = project.id;
      for (const task of context.get(taskManagerStoreToken).tasks.values()) {
        if (!isVisibleRegularTask(task) || !task.data.isPinned) continue;
        pairs.push({ projectId, task });
      }
    }
    pairs.sort((a, b) => this.compareSidebarTasks(a.task, b.task));
    return pairs.map(({ projectId, task }) => ({ projectId, taskId: task.data.id }));
  }

  /**
   * Visible unpinned task IDs for a project in sidebar order. Archived tasks are
   * and automation tasks are excluded. Independent of expand state so Next/Previous
   * Task navigation works even when the project is collapsed.
   */
  visibleTaskIdsForProject(projectId: string): string[] {
    const project = this.projectManager.projects.get(projectId);
    if (!project) return [];
    const context = asAvailableProject(project);
    if (!context) return [];
    const tasks = Array.from(context.get(taskManagerStoreToken).tasks.values()).filter(
      (task) => isVisibleRegularTask(task) && !task.data.isPinned
    );
    const manualOrder = this.taskOrderByProject[projectId];
    const ordered = manualOrder?.length
      ? this.mergeTaskOrder(projectId, tasks)
      : this.sortTasksForSidebar(tasks);
    return ordered.map((t) => t.data.id);
  }

  get isEmpty(): boolean {
    return this.projectManager.projects.size === 0;
  }

  /** Called on first load when no snapshot exists — expand all known projects. */
  expandAllProjects(): void {
    this.updateState((current) => ({
      ...current,
      expandedProjectIds: this.orderedProjects.map((project) => project.id),
    }));
  }

  toggleProjectExpanded(projectId: string): void {
    const isPersisted = this.state.expandedProjectIds.includes(projectId);
    const isRevealed = this._revealedProjectIds.has(projectId);
    if (isPersisted || isRevealed) {
      this._revealedProjectIds.delete(projectId);
      if (isPersisted) {
        this.updateExpandedProjects((ids) => ids.filter((id) => id !== projectId));
      }
      return;
    }
    this.updateExpandedProjects((ids) => [...ids, projectId]);
  }

  /**
   * Reveal a project for navigation. A project inside a collapsed section has no
   * row at all, so its section is revealed first or the scroll target never exists.
   */
  revealProject(projectId: string): void {
    const sectionId = this.sectionForProject(projectId);
    if (this.state.collapsedSectionIds.includes(sectionId)) {
      this._revealedSectionIds.add(sectionId);
    }
    if (!this.expandedProjectIds.has(projectId)) {
      this._revealedProjectIds.add(projectId);
    }
  }

  setTaskSortBy(sortBy: SidebarTaskSortBy): void {
    this.updateState((current) => ({ ...current, taskSortBy: sortBy }));
  }

  /** Set the sort key and clear all manual task orders so the list fully re-sorts. */
  applySort(sortBy: SidebarTaskSortBy): void {
    this.updateState((current) => ({
      ...current,
      taskSortBy: sortBy,
      taskOrderByProject: {},
    }));
  }

  get editingSectionId(): string | null {
    return this._editingSectionId;
  }

  beginSectionEdit(sectionId: string): void {
    this._editingSectionId = sectionId;
  }

  endSectionEdit(): void {
    this._editingSectionId = null;
  }

  createSection(name: string, id: string = crypto.randomUUID()): string {
    this.updateState((current) => ({
      ...current,
      sections: [...current.sections, { id, name }],
    }));
    return id;
  }

  renameSection(sectionId: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.updateState((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId ? { ...section, name: trimmed } : section
      ),
    }));
  }

  /**
   * Merge a colour/icon patch into a section's appearance. An explicit
   * `undefined` clears that field; once both are clear the entry is dropped so
   * saved state stays minimal.
   */
  setSectionAppearance(sectionId: string, patch: SectionAppearance): void {
    this.updateState((current) => {
      const sectionAppearance = { ...current.sectionAppearance };
      const merged = { ...sectionAppearance[sectionId], ...patch };
      if (hasAppearance(merged)) sectionAppearance[sectionId] = merged;
      else delete sectionAppearance[sectionId];
      return { ...current, sectionAppearance };
    });
  }

  setSectionOrder(orderedIds: readonly string[]): void {
    this.updateState((current) => {
      const remaining = new Map(current.sections.map((section) => [section.id, section] as const));
      const ordered: SidebarSection[] = [];
      for (const id of orderedIds) {
        const section = remaining.get(id);
        if (!section) continue;
        ordered.push(section);
        remaining.delete(id);
      }
      // Sections omitted from the new order keep their relative position at the end.
      return { ...current, sections: [...ordered, ...remaining.values()] };
    });
  }

  toggleSectionCollapsed(sectionId: string): void {
    const isPersisted = this.state.collapsedSectionIds.includes(sectionId);
    const isRevealed = this._revealedSectionIds.has(sectionId);
    if (isPersisted || isRevealed) {
      this._revealedSectionIds.delete(sectionId);
      if (isPersisted) {
        this.updateState((current) => ({
          ...current,
          collapsedSectionIds: current.collapsedSectionIds.filter((id) => id !== sectionId),
        }));
      }
      return;
    }
    this.updateState((current) => ({
      ...current,
      collapsedSectionIds: [...current.collapsedSectionIds, sectionId],
    }));
  }

  /** Removes a section and returns its projects to Ungrouped. Projects are never deleted. */
  deleteSection(sectionId: string): void {
    if (sectionId === UNGROUPED_SECTION_ID) return;
    this._revealedSectionIds.delete(sectionId);
    if (this._editingSectionId === sectionId) this._editingSectionId = null;
    this.updateState((current) => {
      const { [sectionId]: _removedOrder, ...projectOrderBySection } =
        current.projectOrderBySection;
      const { [sectionId]: _removedAppearance, ...sectionAppearance } = current.sectionAppearance;
      return {
        ...current,
        sections: current.sections.filter((section) => section.id !== sectionId),
        collapsedSectionIds: current.collapsedSectionIds.filter((id) => id !== sectionId),
        projectOrderBySection,
        sectionAppearance,
        // Freed members carry no order in Ungrouped, so they fall back to recency.
        sectionOfProject: Object.fromEntries(
          Object.entries(current.sectionOfProject).filter(([, id]) => id !== sectionId)
        ),
      };
    });
  }

  /**
   * Move a project into `sectionId` at `index`, or reorder it within its current
   * section. Both affected sections' orders are rewritten in full from the
   * rendered order so an incomplete stored order cannot corrupt the result.
   */
  moveProjectToSection(projectId: string, sectionId: string, index: number): void {
    const fromSection = this.sectionForProject(projectId);

    if (fromSection === sectionId) {
      const ids = this.projectsForSection(sectionId).map((project) => project.id);
      const oldIndex = ids.indexOf(projectId);
      if (oldIndex === -1) return;
      let target = index;
      if (target > oldIndex) target -= 1;
      target = Math.max(0, Math.min(target, ids.length - 1));
      if (target === oldIndex) return;
      const next = moveItem(ids, oldIndex, target);
      this.updateState((current) => ({
        ...current,
        projectOrderBySection: { ...current.projectOrderBySection, [sectionId]: next },
      }));
      return;
    }

    const fromIds = this.projectsForSection(fromSection)
      .map((project) => project.id)
      .filter((id) => id !== projectId);
    const toIds = this.projectsForSection(sectionId).map((project) => project.id);
    const insertionIndex = Math.max(0, Math.min(index, toIds.length));
    const nextToIds = [
      ...toIds.slice(0, insertionIndex),
      projectId,
      ...toIds.slice(insertionIndex),
    ];

    this.updateState((current) => {
      const sectionOfProject = { ...current.sectionOfProject };
      if (sectionId === UNGROUPED_SECTION_ID) delete sectionOfProject[projectId];
      else sectionOfProject[projectId] = sectionId;
      return {
        ...current,
        sectionOfProject,
        projectOrderBySection: {
          ...current.projectOrderBySection,
          [fromSection]: fromIds,
          [sectionId]: nextToIds,
        },
      };
    });
  }

  mergeTaskOrder(projectId: string, tasks: TaskStore[]): TaskStore[] {
    const stored = this.taskOrderByProject[projectId] ?? [];
    const byId = new Map(tasks.map((t) => [t.data.id, t] as const));
    const seen = new Set<string>();
    const result: TaskStore[] = [];
    for (const id of stored) {
      const t = byId.get(id);
      if (t) {
        result.push(t);
        seen.add(id);
      }
    }
    // New tasks (not in the manual order) are sorted by date and prepended so
    // they always appear at the top rather than buried after manually-ordered tasks.
    const newTasks = tasks
      .filter((t) => !seen.has(t.data.id))
      .sort((a, b) => this.compareSidebarTasks(a, b));
    return [...newTasks, ...result];
  }

  setTaskOrder(projectId: string, orderedIds: string[]): void {
    this.updateState((current) => ({
      ...current,
      taskOrderByProject: { ...current.taskOrderByProject, [projectId]: orderedIds },
    }));
  }

  private get state(): WorkbenchSidebarState {
    return this._handle?.value ?? this._fallbackState;
  }

  private updateState(update: (current: WorkbenchSidebarState) => WorkbenchSidebarState): void {
    if (this._handle) {
      this._handle.update(update);
    } else {
      this._fallbackState = update(this._fallbackState);
    }
  }

  private updateExpandedProjects(update: (current: string[]) => string[]): void {
    this.updateState((current) => ({
      ...current,
      expandedProjectIds: update(current.expandedProjectIds),
    }));
  }

  private compareSidebarTasks(a: TaskStore, b: TaskStore): number {
    const kind = sortKindFor(this.taskSortBy);
    const ia = getSortInstant(a, kind) ?? '';
    const ib = getSortInstant(b, kind) ?? '';
    const d = ib.localeCompare(ia);
    if (d !== 0) return d;
    return a.data.id.localeCompare(b.data.id);
  }

  private compareSidebarProjects(a: ProjectStore, b: ProjectStore): number {
    const d = b.createdAt.localeCompare(a.createdAt);
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  }

  private sortTasksForSidebar(tasks: TaskStore[]): TaskStore[] {
    return [...tasks].sort((a, b) => this.compareSidebarTasks(a, b));
  }
}
