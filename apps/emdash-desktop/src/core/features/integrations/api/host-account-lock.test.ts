import { describe, expect, it } from 'vitest';
import type { Project } from '@core/primitives/projects/api';
import { lockedConnectionIdFor } from './host-account-lock';

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
