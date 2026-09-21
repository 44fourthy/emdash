import { describe, expect, it } from 'vitest';
import type { Project } from '@core/primitives/projects/api';
import { hostAccountLock, lockedConnectionIdFor } from './host-account-lock';

function project(overrides: Partial<Project> = {}): Project {
  return {
    type: 'local',
    id: 'p1',
    name: 'project',
    path: '/repo',
    baseRef: null,
    repositoryWorkspaceId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Project;
}

describe('lockedConnectionIdFor', () => {
  it('returns undefined for a local project, which keeps its own choice', () => {
    expect(lockedConnectionIdFor(project())).toBeUndefined();
  });

  it('returns the connection for an ssh project, locked or not', () => {
    const ssh = project({ type: 'ssh', connectionId: 'conn-1' } as Partial<Project>);
    expect(lockedConnectionIdFor(ssh)).toBe('conn-1');
  });
});

const ACCOUNTS = [
  { accountId: 'github.com:160760069', login: 'rc3r0' },
  { accountId: 'github.com:262890770', login: 'ron158' },
  { accountId: 'github.com:255108029', login: 'ron900' },
];

describe('hostAccountLock', () => {
  it('uses the stored pick for a host the fork does not pin', () => {
    expect(
      hostAccountLock({
        host: 'example.com',
        username: 'someone',
        storedAccountId: 'github.com:160760069',
        accounts: ACCOUNTS,
      })
    ).toEqual({ accountId: 'github.com:160760069', providerId: 'github' });
  });

  it('resolves a pinned host to its identity by login, not by the stored pick', () => {
    // The stored pick is deliberately the wrong identity: policy wins.
    expect(
      hostAccountLock({
        host: 'ron-dev',
        username: 'colors',
        storedAccountId: 'github.com:160760069',
        accounts: ACCOUNTS,
      })
    ).toEqual({
      accountId: 'github.com:255108029',
      providerId: 'github',
      pinnedLogin: 'ron900',
    });
  });

  it('resolves to nothing when a pinned identity is not connected', () => {
    expect(hostAccountLock({ host: 'ron-dev', username: 'topline', accounts: ACCOUNTS })).toEqual({
      accountId: null,
      providerId: 'github',
    });
    expect(hostAccountLock({ host: 'ron-dev', username: 'colors', accounts: [] })).toEqual({
      accountId: null,
      providerId: 'github',
      pinnedLogin: 'ron900',
    });
  });

  it('pins the listed legacy hosts too', () => {
    expect(
      hostAccountLock({ host: '169.58.235.22', username: 'personal', accounts: ACCOUNTS })
    ).toMatchObject({ pinnedLogin: '44fourthy' });
    expect(
      hostAccountLock({ host: '169.58.235.22', username: 'colors', accounts: ACCOUNTS })
    ).toEqual({ accountId: null, providerId: 'github' });
  });
});
