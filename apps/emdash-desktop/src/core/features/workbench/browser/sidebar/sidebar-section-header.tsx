import { ContextMenu, Input } from '@emdash/ui/react/primitives';
import { Ban, Check, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import React, { useEffect, useState } from 'react';
import { getSidebarStore } from '@core/features/workbench/contributions/browser/app-stores';
import {
  UNGROUPED_SECTION_ID,
  UNGROUPED_SECTION_NAME,
} from '@core/features/workbench/contributions/mementos';
import {
  SECTION_COLOR_NAMES,
  SECTION_ICON_NAMES,
  sectionColorVar,
  type SectionColorName,
  type SectionIconName,
} from '@core/features/workbench/contributions/section-appearance';
import { useOpenModal } from '@core/manifests/browser/modal-api';
import { cn } from '@core/primitives/styling/browser/cn';
import { SECTION_ICONS } from './section-icons';
import { SidebarItemMiniButton, SidebarMenuAction, SidebarMenuRow } from './sidebar-primitives';

export const SidebarSectionHeader = observer(function SidebarSectionHeader({
  sectionId,
}: {
  sectionId: string;
}) {
  const openConfirm = useOpenModal('confirmActionModal');
  const store = getSidebarStore();

  const isUngrouped = sectionId === UNGROUPED_SECTION_ID;
  const section = store.sections.find((candidate) => candidate.id === sectionId);
  const label = section?.name ?? UNGROUPED_SECTION_NAME;
  const isCollapsed = store.collapsedSectionIds.has(sectionId);
  const isEditing = store.editingSectionId === sectionId;
  const toggleLabel = `${isCollapsed ? 'Expand' : 'Collapse'} ${label}`;
  const appearance = store.appearanceForSection(sectionId);
  const SectionIcon = appearance?.icon ? SECTION_ICONS[appearance.icon] : undefined;
  const projectCount = store.projectsForSection(sectionId).length;

  const [draft, setDraft] = useState(label);
  useEffect(() => {
    if (isEditing) setDraft(label);
  }, [isEditing, label]);

  // Both paths bail once editing has ended, so the blur that follows Escape
  // (which has already cleared the editing state) cannot commit the draft.
  const commit = () => {
    if (store.editingSectionId !== sectionId) return;
    store.renameSection(sectionId, draft);
    store.endSectionEdit();
  };

  const cancel = () => {
    if (store.editingSectionId !== sectionId) return;
    store.endSectionEdit();
  };

  const setColor = (color: SectionColorName | undefined) => {
    store.setSectionAppearance(sectionId, { color });
  };

  const setIcon = (icon: SectionIconName | undefined) => {
    store.setSectionAppearance(sectionId, { icon });
  };

  const confirmDelete = async () => {
    const outcome = await openConfirm({
      title: 'Delete section',
      description: `“${label}” will be removed. Its projects move back to ${UNGROUPED_SECTION_NAME}; no projects are deleted.`,
      confirmLabel: 'Delete',
    });
    if (!outcome.success) return;
    store.deleteSection(sectionId);
  };

  if (isEditing) {
    return (
      <SidebarMenuRow className="flex h-8 items-center px-1">
        <Input
          autoFocus
          size="sm"
          value={draft}
          aria-label="Section name"
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              cancel();
            }
          }}
        />
      </SidebarMenuRow>
    );
  }

  const headerRow = (
    <SidebarMenuRow
      className="group/row flex h-8 items-center justify-between px-1"
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <SidebarItemMiniButton
          type="button"
          aria-label={toggleLabel}
          onClick={(event) => {
            event.stopPropagation();
            store.toggleSectionCollapsed(sectionId);
          }}
        >
          <ChevronRight
            className={cn('h-4 w-4 transition-transform duration-150', !isCollapsed && 'rotate-90')}
          />
        </SidebarItemMiniButton>
        {SectionIcon && (
          <SectionIcon className="h-3.5 w-3.5 shrink-0 text-foreground-tertiary-passive" />
        )}
        <SidebarMenuAction
          aria-label={toggleLabel}
          className="truncate font-medium text-foreground-tertiary-muted select-none"
          onClick={(event) => {
            event.stopPropagation();
            store.toggleSectionCollapsed(sectionId);
          }}
        >
          {label}
        </SidebarMenuAction>
      </div>
      {projectCount > 0 && (
        <span
          className="shrink-0 pr-1 text-xs text-foreground-tertiary-passive tabular-nums"
          aria-label={`${projectCount} ${projectCount === 1 ? 'project' : 'projects'}`}
        >
          {projectCount}
        </span>
      )}
    </SidebarMenuRow>
  );

  // Ungrouped is permanent: it has no rename, delete, or appearance, only the
  // collapse toggle.
  if (isUngrouped) return headerRow;

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger>{headerRow}</ContextMenu.Trigger>
      <ContextMenu.Content>
        <ContextMenu.Item
          onClick={() => {
            setDraft(label);
            store.beginSectionEdit(sectionId);
          }}
        >
          <Pencil className="size-4" />
          Rename Section
        </ContextMenu.Item>
        <ContextMenu.Separator />
        <ContextMenu.Group>
          <ContextMenu.Label>Colour</ContextMenu.Label>
          {/* Plain buttons rather than menu items: a swatch row is not a list of
              commands, and Base UI's menu item layout would fight the grid. */}
          <div className="flex items-center gap-1.5 px-2 pt-0.5 pb-1.5">
            <button
              type="button"
              aria-label="No colour"
              aria-pressed={appearance?.color === undefined}
              className={cn(
                'flex size-4 items-center justify-center rounded-full border border-border text-foreground-tertiary-muted transition-transform hover:scale-110',
                appearance?.color === undefined && 'scale-110'
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setColor(undefined)}
            >
              <Ban className="size-2.5" />
            </button>
            {SECTION_COLOR_NAMES.map((name) => {
              const isActive = appearance?.color === name;
              return (
                <button
                  key={name}
                  type="button"
                  aria-label={name}
                  aria-pressed={isActive}
                  style={{ backgroundColor: sectionColorVar(name) }}
                  className={cn(
                    'flex size-4 items-center justify-center rounded-full transition-transform',
                    isActive ? 'scale-110' : 'hover:scale-110'
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setColor(isActive ? undefined : name)}
                >
                  {isActive && <Check className="size-2.5 text-white" strokeWidth={3} />}
                </button>
              );
            })}
          </div>
        </ContextMenu.Group>
        <ContextMenu.Group>
          <ContextMenu.Label>Icon</ContextMenu.Label>
          <div className="grid grid-cols-5 gap-1 px-2 pt-0.5 pb-1.5">
            <button
              type="button"
              aria-label="No icon"
              aria-pressed={appearance?.icon === undefined}
              className={cn(
                'flex size-6 items-center justify-center rounded text-foreground-tertiary-muted hover:bg-background-tertiary-1',
                appearance?.icon === undefined && 'bg-background-tertiary-2 text-foreground'
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setIcon(undefined)}
            >
              <Ban className="size-3.5" />
            </button>
            {SECTION_ICON_NAMES.map((name) => {
              const Icon = SECTION_ICONS[name];
              const isActive = appearance?.icon === name;
              return (
                <button
                  key={name}
                  type="button"
                  aria-label={name}
                  aria-pressed={isActive}
                  className={cn(
                    'flex size-6 items-center justify-center rounded text-foreground-tertiary-muted hover:bg-background-tertiary-1',
                    isActive && 'bg-background-tertiary-2 text-foreground'
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setIcon(isActive ? undefined : name)}
                >
                  <Icon className="size-3.5" />
                </button>
              );
            })}
          </div>
        </ContextMenu.Group>
        <ContextMenu.Separator />
        <ContextMenu.Item
          variant="destructive"
          onClick={() => {
            void confirmDelete();
          }}
        >
          <Trash2 className="size-4" />
          Delete Section
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Root>
  );
});
