import { getMachinesStore } from '@core/features/machines/contributions/app-stores';
import {
  getProjectStore,
  projectData,
} from '@core/features/projects/api/browser/stores/project-selectors';
import type { HostAccountLock } from '@core/primitives/project-settings/api/resolve-provider-account';
import { lockedConnectionIdFor } from '../host-account-lock';

/**
 * The account lock for a project's host, or `undefined` for local projects.
 *
 * Call inside an observer: the machines store and the project store are both
 * observed so a change to either re-renders.
 */
export function hostAccountLockForProject(projectId: string): HostAccountLock | undefined {
  const project = projectData(getProjectStore(projectId));
  if (!project) return undefined;
  const connectionId = lockedConnectionIdFor(project);
  if (!connectionId) return undefined;
  const connection = getMachinesStore().connections.find((entry) => entry.id === connectionId);
  return { accountId: connection?.githubAccountId ?? null };
}
