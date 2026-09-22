import { isLocalHostRef } from '@emdash/core/primitives/host/api';
import type { HostAccountLock } from '@core/primitives/project-settings/api/resolve-provider-account';
import { projectHostRef, type Project } from '@core/primitives/projects/api';
import { pinnedGithubLoginFor } from './machine-account-policy';

/**
 * The connection whose account claims this project's account, or `undefined`
 * when the project runs locally and keeps its own per-project choice.
 */
export function lockedConnectionIdFor(project: Project): string | undefined {
  const host = projectHostRef(project);
  return isLocalHostRef(host) ? undefined : host.id;
}

/** Machine accounts are a GitHub concept: the SSH metadata field is GitHub's. */
export const GITHUB_PROVIDER_ID = 'github';

export type LockableAccount = { accountId: string; login?: string };

/**
 * The lock for one machine.
 *
 * Every project on a remote host is locked — to that machine's account when it
 * has one, and to nothing when it does not. There is deliberately no fall-back
 * to the desktop's account: git on that machine authenticates as whatever the
 * machine is set up as, so borrowing a desktop identity is how the two silently
 * disagree in the first place.
 *
 * A machine the fork pins to an identity ignores `storedAccountId` entirely, so
 * a pairing left over in the database cannot reintroduce the mismatch. An
 * identity that is not connected resolves to nothing rather than to another
 * account.
 */
export function hostAccountLock(options: {
  host: string;
  username: string;
  /** The account picked in Machine settings, already stored. */
  storedAccountId?: string;
  accounts: LockableAccount[];
}): HostAccountLock {
  const pinnedLogin = pinnedGithubLoginFor(options.host, options.username);
  if (pinnedLogin === undefined) {
    return { accountId: options.storedAccountId ?? null, providerId: GITHUB_PROVIDER_ID };
  }
  const pinned = options.accounts.find((account) => account.login === pinnedLogin);
  return { accountId: pinned?.accountId ?? null, providerId: GITHUB_PROVIDER_ID, pinnedLogin };
}
