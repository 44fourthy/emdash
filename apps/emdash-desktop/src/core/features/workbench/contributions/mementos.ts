import { defineVersionedSchema } from '@emdash/core/primitives/versioned-schema/api';
import { z } from 'zod';
import { defineMemento } from '@core/primitives/mementos/api';
import { appSubject } from '@core/primitives/subjects/api';
import { sectionAppearanceSchema } from './section-appearance';

/** Reserved section id: every project absent from `sectionOfProject` lives here. */
export const UNGROUPED_SECTION_ID = '';
export const UNGROUPED_SECTION_NAME = 'Ungrouped';

const sidebarSectionSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type SidebarSection = z.infer<typeof sidebarSectionSchema>;

const workbenchSidebarV1Schema = z.object({
  version: z.literal('1'),
  expandedProjectIds: z.array(z.string()),
  projectOrder: z.array(z.string()),
  taskOrderByProject: z.record(z.string(), z.array(z.string())),
  taskSortBy: z.enum(['created-at', 'updated-at']),
});

const workbenchSidebarSectionFields = {
  expandedProjectIds: z.array(z.string()),
  taskOrderByProject: z.record(z.string(), z.array(z.string())),
  taskSortBy: z.enum(['created-at', 'updated-at']),
  sections: z.array(sidebarSectionSchema),
  // Collapse is an id array rather than a flag inside `sections` so the implicit
  // Ungrouped section, which is never a member of `sections`, can collapse too.
  collapsedSectionIds: z.array(z.string()),
  /** projectId -> sectionId. Absent or unknown resolves to Ungrouped. */
  sectionOfProject: z.record(z.string(), z.string()),
  /** sectionId -> ordered projectIds. Missing key means no manual order yet. */
  projectOrderBySection: z.record(z.string(), z.array(z.string())),
};

const workbenchSidebarV2Schema = z.object({
  version: z.literal('2'),
  ...workbenchSidebarSectionFields,
});

const workbenchSidebarV3Schema = z.object({
  version: z.literal('3'),
  ...workbenchSidebarSectionFields,
  /** sectionId -> colour/icon. Absent means the uncoloured default. */
  sectionAppearance: z.record(z.string(), sectionAppearanceSchema),
});

export const workbenchSidebarSchema = defineVersionedSchema()
  .initial('1', workbenchSidebarV1Schema)
  // v2 partitions the flat projectOrder into per-section orders; the old flat
  // order becomes Ungrouped's order so existing layouts render unchanged.
  .version('2', workbenchSidebarV2Schema, (v1) => ({
    version: '2' as const,
    expandedProjectIds: v1.expandedProjectIds,
    taskOrderByProject: v1.taskOrderByProject,
    taskSortBy: v1.taskSortBy,
    sections: [],
    collapsedSectionIds: [],
    sectionOfProject: {},
    projectOrderBySection: { [UNGROUPED_SECTION_ID]: v1.projectOrder },
  }))
  // v3 adds per-section appearance. Existing sections keep their default look.
  .version('3', workbenchSidebarV3Schema, (v2) => ({
    ...v2,
    version: '3' as const,
    sectionAppearance: {},
  }))
  .build();

export type WorkbenchSidebarState = typeof workbenchSidebarSchema.Type;

export const workbenchSidebarMemento = defineMemento({
  id: 'workbench.sidebar',
  subject: appSubject,
  schema: workbenchSidebarSchema,
  default: {
    version: '3' as const,
    expandedProjectIds: [],
    taskOrderByProject: {},
    taskSortBy: 'created-at' as const,
    sections: [],
    collapsedSectionIds: [],
    sectionOfProject: {},
    projectOrderBySection: {},
    sectionAppearance: {},
  },
});

const workbenchPanelLayoutsV1Schema = z.object({
  version: z.literal('1'),
  layouts: z.record(z.string(), z.string()),
});

export const workbenchPanelLayoutsSchema = defineVersionedSchema()
  .initial('1', workbenchPanelLayoutsV1Schema)
  .build();
export type WorkbenchPanelLayoutsState = typeof workbenchPanelLayoutsSchema.Type;

export const workbenchPanelLayoutsMemento = defineMemento({
  id: 'workbench.panel-layouts',
  subject: appSubject,
  schema: workbenchPanelLayoutsSchema,
  default: {
    version: '1' as const,
    layouts: {},
  },
});

// The navigation and history mementos moved into the navigation primitive:
// @core/primitives/navigation/api/mementos.
