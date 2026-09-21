import { isLocalHostRef } from '@emdash/core/primitives/host/api';
import { projectHostRef, type Project } from '@core/primitives/projects/api';

/**
 * The connection whose account claims this project's account, or `undefined`
 * when the project runs locally and keeps its own per-project choice.
 *
 * Callers pair this with the connection's stored account to build a
 * `HostAccountLock`. A remote connection with no account stored yields
 * `{ accountId: null }`, which resolves to no account rather than falling back
 * to the desktop's: git on that machine authenticates as whatever the machine
 * is set up as, so borrowing a desktop identity is how the two silently
 * disagree in the first place.
 */
export function lockedConnectionIdFor(project: Project): string | undefined {
  const host = projectHostRef(project);
  return isLocalHostRef(host) ? undefined : host.id;
}
