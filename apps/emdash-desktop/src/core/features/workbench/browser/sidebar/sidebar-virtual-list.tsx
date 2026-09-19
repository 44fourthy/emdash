import {
  closestCenter,
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useDndContext,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useVirtualizer } from '@tanstack/react-virtual';
import { observer } from 'mobx-react-lite';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { projectViewDef } from '@core/features/projects/contributions/views';
import { getTaskStore } from '@core/features/tasks/api/browser/task-state/task-selectors';
import { taskViewDef } from '@core/features/tasks/contributions/views';
import { type SidebarRow } from '@core/features/workbench/browser/sidebar/sidebar-store';
import { getSidebarStore } from '@core/features/workbench/contributions/browser/app-stores';
import {
  UNGROUPED_SECTION_ID,
  UNGROUPED_SECTION_NAME,
} from '@core/features/workbench/contributions/mementos';
import { sectionColorVar } from '@core/features/workbench/contributions/section-appearance';
import {
  useViewParams,
  useWorkspaceSlots,
} from '@core/primitives/navigation/browser/navigation-hooks';
import { SidebarProjectItem } from './project-item';
import {
  isCursorAbove,
  parseDndId,
  projectDropTarget,
  rowToDndId,
  sectionReorderTarget,
} from './sidebar-dnd';
import { SidebarMenuRow } from './sidebar-primitives';
import { SidebarSectionHeader } from './sidebar-section-header';
import {
  isLastSibling,
  rowDepths as computeRowDepths,
  TREE_GUIDE_INSET_PX,
  TREE_INDENT_STEP_PX,
} from './sidebar-tree';
import { SidebarTaskItem } from './task-item';

const ROW_HEIGHT = 32;

export const SidebarVirtualList = observer(function SidebarVirtualList() {
  const rows = getSidebarStore().sidebarRows;
  const { currentView } = useWorkspaceSlots();
  const taskParams = useViewParams(taskViewDef) ?? {
    projectId: undefined,
    taskId: undefined,
  };
  const projectParams = useViewParams(projectViewDef) ?? { projectId: undefined };

  const scrollRef = useRef<HTMLDivElement>(null);
  const initialPointerYRef = useRef<number | null>(null);
  const initialScrollTopRef = useRef(0);
  const dragPointerYRef = useRef<number | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dragPointerY, setDragPointerY] = useState<number | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const activeTaskProjectExpanded =
    currentView === 'task' && taskParams.projectId
      ? getSidebarStore().expandedProjectIds.has(taskParams.projectId)
      : null;
  // Navigating into a project whose section is collapsed reveals that section, which
  // only adds the target row after this effect has already run once. Tracking the
  // collapse state re-runs the scroll lookup once the row exists.
  const activeTargetProjectId =
    currentView === 'task'
      ? (taskParams.projectId ?? null)
      : currentView === 'project'
        ? (projectParams.projectId ?? null)
        : null;
  const activeTargetSectionCollapsed = activeTargetProjectId
    ? getSidebarStore().collapsedSectionIds.has(
        getSidebarStore().sectionForProject(activeTargetProjectId)
      )
    : null;
  const hasSections = getSidebarStore().hasSections;
  const editingSectionId = getSidebarStore().editingSectionId;
  const allDndIds = useMemo(() => rows.map(rowToDndId), [rows]);
  const rowDepths = useMemo(() => computeRowDepths(rows, hasSections), [rows, hasSections]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  // Scroll the active project/task into view only when the navigation target itself
  // changes, plus the active task's project expansion state. Re-running on every
  // `rows` change would yank the user back to the active row whenever the
  // sidebar mutates (e.g. deleting an unrelated task), but direct navigation to a
  // task in a collapsed project needs one rerun after `revealProject`.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  useEffect(() => {
    let targetProjectId: string | null = null;
    let targetTaskId: string | null = null;

    if (currentView === 'task') {
      targetProjectId = taskParams.projectId ?? null;
      targetTaskId = taskParams.taskId ?? null;
    } else if (currentView === 'project') {
      targetProjectId = projectParams.projectId ?? null;
    }

    if (!targetProjectId) return;

    if (targetTaskId) {
      const activeTask = getTaskStore(targetProjectId, targetTaskId);
      if (activeTask?.data.isPinned) {
        return;
      }
    }

    const activeIndex = rowsRef.current.findIndex((row) => {
      if (targetTaskId) {
        return (
          row.kind === 'task' && row.taskId === targetTaskId && row.projectId === targetProjectId
        );
      }
      return row.kind === 'project' && row.projectId === targetProjectId;
    });

    if (activeIndex >= 0) {
      virtualizer.scrollToIndex(activeIndex, { align: 'auto' });
    }
  }, [
    currentView,
    taskParams.projectId,
    taskParams.taskId,
    projectParams.projectId,
    activeTaskProjectExpanded,
    activeTargetSectionCollapsed,
    virtualizer,
  ]);

  // A brand-new section is appended at the end, so its rename input only mounts
  // once the virtualizer has scrolled that far.
  useEffect(() => {
    if (!editingSectionId) return;
    const editIndex = rowsRef.current.findIndex(
      (row) => row.kind === 'section' && row.sectionId === editingSectionId
    );
    if (editIndex >= 0) virtualizer.scrollToIndex(editIndex, { align: 'auto' });
  }, [editingSectionId, virtualizer]);

  function setCurrentDragPointerY(pointerY: number | null) {
    dragPointerYRef.current = pointerY;
    setDragPointerY(pointerY);
  }

  function handleDragStart(event: DragStartEvent) {
    const pointerY = getEventClientY(event.activatorEvent);
    initialPointerYRef.current = pointerY;
    initialScrollTopRef.current = scrollRef.current?.scrollTop ?? 0;
    setActiveDragId(String(event.active.id));
    setCurrentDragPointerY(pointerY);
  }

  function handleDragMove(event: DragMoveEvent) {
    const initialPointerY = initialPointerYRef.current;
    if (initialPointerY === null) return;
    // dnd-kit's `delta` is scroll-adjusted: pointer travel plus however far the list has
    // scrolled since the drag started. `over.rect` reads in viewport space, so strip the
    // scroll component to keep the pointer in viewport space for the above/below decision.
    const scrollTop = scrollRef.current?.scrollTop ?? initialScrollTopRef.current;
    const scrollDelta = scrollTop - initialScrollTopRef.current;
    setCurrentDragPointerY(initialPointerY + event.delta.y - scrollDelta);
  }

  function clearDragPointerY() {
    initialPointerYRef.current = null;
    setActiveDragId(null);
    setCurrentDragPointerY(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const pointerY = dragPointerYRef.current;
    clearDragPointerY();
    if (!over || active.id === over.id) return;
    const aParsed = parseDndId(String(active.id));
    const oParsed = parseDndId(String(over.id));
    if (!aParsed || !oParsed) return;

    const isAbove = isCursorAbove(pointerY, active.rect.current.translated, over.rect);

    if (aParsed.kind === 'project') {
      const overRowIdx = rows.findIndex((r) => rowToDndId(r) === String(over.id));
      if (overRowIdx === -1) return;
      const insertionRowIdx = isAbove ? overRowIdx : overRowIdx + 1;
      const store = getSidebarStore();
      const { sectionId, index } = projectDropTarget({
        rows,
        insertionRowIdx,
        overRow: rows[overRowIdx],
        sectionForProject: (projectId) => store.sectionForProject(projectId),
        indexInSection: (projectId) =>
          store
            .projectsForSection(store.sectionForProject(projectId))
            .findIndex((project) => project.id === projectId),
        ungroupedId: UNGROUPED_SECTION_ID,
      });
      store.moveProjectToSection(aParsed.projectId, sectionId, index);
      return;
    }

    if (aParsed.kind === 'section') {
      // Section drags only ever land on other section headers, and Ungrouped is not
      // in `sections`, so a section can never be reordered above it.
      if (oParsed.kind !== 'section') return;
      const nextOrder = sectionReorderTarget({
        sections: getSidebarStore().sections,
        activeSectionId: aParsed.sectionId,
        overSectionId: oParsed.sectionId,
        isAbove,
      });
      if (nextOrder) getSidebarStore().setSectionOrder(nextOrder);
      return;
    }

    if (oParsed.kind === 'task' && oParsed.projectId === aParsed.projectId) {
      const projectId = aParsed.projectId;
      const taskIds = rows
        .filter(
          (r): r is Extract<SidebarRow, { kind: 'task' }> =>
            r.kind === 'task' && r.projectId === projectId
        )
        .map((r) => r.taskId);
      const oldIdx = taskIds.indexOf(aParsed.taskId);
      const overTaskIdx = taskIds.indexOf(oParsed.taskId);
      if (oldIdx === -1 || overTaskIdx === -1) return;
      let newIdx = isAbove ? overTaskIdx : overTaskIdx + 1;
      if (newIdx > oldIdx) newIdx -= 1;
      if (newIdx === oldIdx) return;
      getSidebarStore().setTaskOrder(projectId, arrayMove(taskIds, oldIdx, newIdx));
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={sidebarCollision}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      autoScroll={{ threshold: { x: 0, y: 0.18 }, acceleration: 8, interval: 5 }}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={clearDragPointerY}
    >
      <SortableContext items={allDndIds} strategy={verticalListSortingStrategy}>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-3">
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vItem) => {
              const row = rows[vItem.index];
              if (!row) return null;
              const dndId = rowToDndId(row);
              // Every row of a coloured section draws the same rail, so the
              // colour reads as one continuous strip down the whole section.
              const rail = railColorForRow(row);
              const depth = rowDepths[vItem.index] ?? 0;
              const lastSibling = isLastSibling(rowDepths, vItem.index);
              const vStyle: React.CSSProperties = {
                position: 'absolute',
                top: vItem.start,
                left: 0,
                width: '100%',
                height: `${vItem.size}px`,
              };
              if (row.kind === 'section') {
                return (
                  <SortableRow
                    key={`section:${row.sectionId}`}
                    dndId={dndId}
                    // Renaming owns the pointer: a drag sensor here would fight text selection.
                    disabled={getSidebarStore().editingSectionId === row.sectionId}
                    rail={rail}
                    style={vStyle}
                  >
                    <SidebarSectionHeader sectionId={row.sectionId} />
                  </SortableRow>
                );
              }
              if (row.kind === 'project') {
                return (
                  <SortableRow
                    key={row.projectId}
                    dndId={dndId}
                    rail={rail}
                    depth={depth}
                    lastSibling={lastSibling}
                    style={vStyle}
                  >
                    <SidebarProjectItem projectId={row.projectId} />
                  </SortableRow>
                );
              }
              return (
                <SortableRow
                  key={`${row.projectId}:${row.taskId}`}
                  dndId={dndId}
                  rail={rail}
                  depth={depth}
                  lastSibling={lastSibling}
                  style={vStyle}
                >
                  <SidebarTaskItem projectId={row.projectId} taskId={row.taskId} />
                </SortableRow>
              );
            })}
          </div>
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activeDragId ? <DragOverlayContent dndId={activeDragId} /> : null}
      </DragOverlay>
      <InsertionIndicator pointerY={dragPointerY} />
    </DndContext>
  );
});

// Project drags consider every visible row so dropping over a task maps to its
// owning project in onDragEnd without changing the virtualized list mid-drag.
// Task drags stay restricted to their own project's tasks, and section drags to
// other section headers.
const sidebarCollision: CollisionDetection = (args) => {
  const activeId = String(args.active.id);
  const parsed = parseDndId(activeId);
  if (!parsed) return [];
  const containers = args.droppableContainers.filter((c) => {
    const id = String(c.id);
    if (id === activeId) return false;
    if (parsed.kind === 'task') {
      const cParsed = parseDndId(id);
      return cParsed?.kind === 'task' && cParsed.projectId === parsed.projectId;
    }
    if (parsed.kind === 'section') {
      return parseDndId(id)?.kind === 'section';
    }
    return true;
  });
  const filteredArgs = { ...args, droppableContainers: containers };
  const pointerCollisions = pointerWithin(filteredArgs);
  return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(filteredArgs);
};

/** Resolved rail colour for a row, or undefined when its section is uncoloured. */
function railColorForRow(row: SidebarRow): string | undefined {
  const store = getSidebarStore();
  const sectionId = row.kind === 'section' ? row.sectionId : store.sectionForProject(row.projectId);
  const color = store.appearanceForSection(sectionId)?.color;
  return color ? sectionColorVar(color) : undefined;
}

function getEventClientY(event: Event): number | null {
  if ('clientY' in event && typeof event.clientY === 'number') return event.clientY;
  if (typeof TouchEvent !== 'undefined' && event instanceof TouchEvent) {
    const touch = event.touches[0] ?? event.changedTouches[0];
    return touch?.clientY ?? null;
  }
  return null;
}

const DragOverlayContent = observer(function DragOverlayContent({ dndId }: { dndId: string }) {
  const parsed = parseDndId(dndId);
  if (!parsed) return null;

  if (parsed.kind === 'section') {
    const section = getSidebarStore().sections.find(
      (candidate) => candidate.id === parsed.sectionId
    );
    return (
      <div className="px-3">
        <div className="rounded-lg bg-background-tertiary-2 shadow-md">
          <SidebarMenuRow className="flex h-8 items-center px-1 font-medium text-foreground-tertiary-passive select-none">
            {section?.name ?? UNGROUPED_SECTION_NAME}
          </SidebarMenuRow>
        </div>
      </div>
    );
  }

  return (
    <div className="px-3">
      <div className="rounded-lg bg-background-tertiary-2 shadow-md">
        {parsed.kind === 'project' ? (
          <SidebarProjectItem projectId={parsed.projectId} />
        ) : (
          <SidebarTaskItem projectId={parsed.projectId} taskId={parsed.taskId} />
        )}
      </div>
    </div>
  );
});

function InsertionIndicator({ pointerY }: { pointerY: number | null }) {
  const { active, over } = useDndContext();
  if (!active || !over || active.id === over.id) return null;
  const activeParsed = parseDndId(String(active.id));
  const overParsed = parseDndId(String(over.id));
  if (!activeParsed || !overParsed) return null;
  if (
    activeParsed.kind === 'project' &&
    overParsed.kind === 'task' &&
    overParsed.projectId === activeParsed.projectId
  ) {
    return null;
  }
  const overRect = over.rect;
  if (!overRect) return null;
  // A section header always means "top of that section", so the marker sits on its
  // top edge regardless of which half of the header the cursor is over.
  const top =
    overParsed.kind === 'section' ||
    isCursorAbove(pointerY, active.rect.current.translated, overRect)
      ? overRect.top
      : overRect.top + overRect.height;
  return createPortal(
    <div
      className="bg-primary"
      style={{
        position: 'fixed',
        left: overRect.left + 8,
        top: top - 1.5,
        width: Math.max(0, overRect.width - 16),
        height: 3,
        borderRadius: 2,
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    />,
    document.body
  );
}

/**
 * Vertical connectors hanging beneath each ancestor's chevron. The row's own
 * level ends in an elbow, so the last child of a group reads as a corner rather
 * than a line running past the end of the group.
 */
function treeGuides(depth: number, lastSibling: boolean): React.ReactNode[] {
  const guides: React.ReactNode[] = [];
  for (let level = 0; level < depth; level++) {
    const left = level * TREE_INDENT_STEP_PX + TREE_GUIDE_INSET_PX;
    const isOwnLevel = level === depth - 1;
    guides.push(
      <span
        key={`down-${level}`}
        aria-hidden="true"
        className="pointer-events-none absolute w-px bg-border"
        style={{ left, top: 0, bottom: isOwnLevel && lastSibling ? '50%' : 0 }}
      />
    );
    if (isOwnLevel) {
      guides.push(
        <span
          key={`across-${level}`}
          aria-hidden="true"
          className="pointer-events-none absolute h-px bg-border"
          style={{
            left,
            top: '50%',
            width: Math.max(0, TREE_INDENT_STEP_PX - TREE_GUIDE_INSET_PX),
          }}
        />
      );
    }
  }
  return guides;
}

interface SortableRowProps {
  dndId: string;
  style: React.CSSProperties;
  children: React.ReactNode;
  /** Detach the drag sensor without unmounting the row. */
  disabled?: boolean;
  /** Resolved colour for the section rail, if the row's section is coloured. */
  rail?: string;
  /** Nesting depth; 0 renders no guides and no extra indent. */
  depth?: number;
  /** Whether the row is last of its siblings, which squares off its elbow. */
  lastSibling?: boolean;
}

function SortableRow({
  dndId,
  style,
  children,
  disabled = false,
  rail,
  depth = 0,
  lastSibling = false,
}: SortableRowProps) {
  const { setNodeRef, transform, transition, isDragging, listeners } = useSortable({
    id: dndId,
    disabled,
  });

  const combinedStyle: React.CSSProperties = {
    ...style,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 1 : 'auto',
    // Inset shadow rather than a border: a border would shift every row of a
    // coloured section sideways from uncoloured rows.
    boxShadow: rail ? `inset 2px 0 0 0 ${rail}` : undefined,
    paddingLeft: depth > 0 ? depth * TREE_INDENT_STEP_PX : undefined,
  };

  return (
    <div ref={setNodeRef} style={combinedStyle} {...(disabled ? {} : listeners)}>
      {treeGuides(depth, lastSibling)}
      {children}
    </div>
  );
}
