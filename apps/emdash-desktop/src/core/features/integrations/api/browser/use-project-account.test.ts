import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredIntegrationAccounts } from '@core/primitives/project-settings/api';
import type { ProviderAccountSummary } from '@core/primitives/provider-accounts/api';
import { useProjectAccount } from './use-project-account';

const mocks = vi.hoisted(() => ({
  accounts: vi.fn(),
  settings: vi.fn(),
  repository: vi.fn(),
  project: vi.fn(),
  machines: vi.fn(),
}));
vi.mock('./use-provider-accounts', () => ({ useAccounts: mocks.accounts }));
vi.mock('@core/features/projects/api/browser/stores/project-selectors', () => ({
  getProjectSettingsStore: mocks.settings,
  getProjectStore: () => undefined,
  projectData: mocks.project,
}));
vi.mock('@core/features/source-control/api/browser/stores/source-control-selectors', () => ({
  getGitRepositoryStore: mocks.repository,
}));
vi.mock('@core/features/machines/contributions/app-stores', () => ({
  getMachinesStore: mocks.machines,
}));

const account: ProviderAccountSummary = {
  providerId: 'gitlab',
  accountId: 'work',
  host: 'gitlab.example',
  displayName: 'Work',
  isDefault: true,
};
function settings(stored: StoredIntegrationAccounts = {}) {
  return { durableDomains: { integrationAccounts: { stored }, gitIdentity: { stored: {} } } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.accounts.mockReturnValue({ data: [account] });
  mocks.settings.mockReturnValue(settings());
  // Local project: no host lock, so the per-project choice applies.
  mocks.project.mockReturnValue(null);
  mocks.repository.mockReturnValue({
    loading: false,
    repoFacts: {
      remotes: [{ name: 'origin', host: 'gitlab.example', headBranch: null, branches: [] }],
      localBranches: [],
    },
  });
});

describe('useProjectAccount', () => {
  it('resolves from durable account and Git inputs without placement settings', () => {
    const result = useProjectAccount('project-1', 'gitlab', { repository: { kind: 'project' } });
    expect(result?.value).toEqual(account);
    expect(result?.accounts).toEqual([account]);
    expect(mocks.accounts).toHaveBeenCalledWith('gitlab');
  });

  it.each(['pending', 'error'])(
    'does not infer while account inventory is unavailable (%s)',
    (status) => {
      mocks.accounts.mockReturnValue({ data: undefined, status });
      expect(
        useProjectAccount('project-1', 'gitlab', { repository: { kind: 'project' } })
      ).toBeNull();
    }
  );

  it('does not infer while project settings or repository facts are loading', () => {
    mocks.settings.mockReturnValue({ durableDomains: null });
    expect(useProjectAccount('project-1', 'gitlab')).toBeNull();
    mocks.settings.mockReturnValue(settings());
    mocks.repository.mockReturnValue({ loading: true });
    expect(
      useProjectAccount('project-1', 'gitlab', { repository: { kind: 'project' } })
    ).toBeNull();
  });

  it('preserves a durable pin when repository facts cannot be loaded', () => {
    mocks.settings.mockReturnValue(settings({ gitlab: { kind: 'account', accountId: 'work' } }));
    mocks.repository.mockReturnValue({ loading: false, repoFacts: null });
    expect(
      useProjectAccount('project-1', 'gitlab', { repository: { kind: 'project' } })
    ).toMatchObject({ value: account, provenance: { kind: 'set' } });
  });

  it('uses an explicit repository URL without waiting for the project repository', () => {
    mocks.repository.mockReturnValue({ loading: true });
    expect(
      useProjectAccount('project-1', 'gitlab', {
        repository: { kind: 'url', url: 'git@gitlab.example:team/repo.git' },
      })?.value
    ).toEqual(account);
    expect(mocks.repository).not.toHaveBeenCalled();
  });

  it('fails closed when a provider-specific type guard excludes the pinned account', () => {
    mocks.settings.mockReturnValue(settings({ gitlab: { kind: 'account', accountId: 'work' } }));
    const result = useProjectAccount('project-1', 'gitlab', {
      accepts: (value): value is ProviderAccountSummary & { login: string } =>
        typeof value.login === 'string',
    });
    expect(result).toMatchObject({
      value: null,
      provenance: { kind: 'unresolvable' },
      accounts: [],
    });
  });

  it('uses the machine account for a remote project, ignoring the project pin', () => {
    const hostAccount: ProviderAccountSummary = {
      ...account,
      providerId: 'github',
      accountId: 'host',
      displayName: 'Host',
      isDefault: false,
    };
    mocks.accounts.mockReturnValue({
      data: [{ ...account, providerId: 'github' }, hostAccount],
    });
    mocks.project.mockReturnValue({ type: 'ssh', connectionId: 'conn-1' });
    mocks.machines.mockReturnValue({
      connections: [
        { id: 'conn-1', host: 'example.com', username: 'dev', githubAccountId: 'host' },
      ],
    });
    mocks.settings.mockReturnValue(settings({ github: { kind: 'account', accountId: 'work' } }));

    const result = useProjectAccount('project-1', 'github', { repository: { kind: 'project' } });
    expect(result?.value).toEqual(hostAccount);
    expect(result?.provenance).toEqual({ kind: 'inferred', from: 'host account' });
  });

  it('resolves to nothing on a machine with no account set instead of borrowing the pin', () => {
    mocks.accounts.mockReturnValue({ data: [{ ...account, providerId: 'github' }] });
    mocks.project.mockReturnValue({ type: 'ssh', connectionId: 'conn-1' });
    mocks.machines.mockReturnValue({
      connections: [{ id: 'conn-1', host: 'example.com', username: 'dev' }],
    });
    mocks.settings.mockReturnValue(settings({ github: { kind: 'account', accountId: 'work' } }));

    const result = useProjectAccount('project-1', 'github', { repository: { kind: 'project' } });
    expect(result?.value).toBeNull();
    expect(result?.provenance).toEqual({ kind: 'inferred', from: 'no host account' });
  });

  it('resolves a fork-pinned machine to its identity, whatever the machine stores', () => {
    const hostAccount: ProviderAccountSummary = {
      ...account,
      providerId: 'github',
      accountId: 'github.com:160760069',
      login: 'rc3r0',
      isDefault: false,
    };
    mocks.accounts.mockReturnValue({
      data: [{ ...account, providerId: 'github', login: 'ron900' }, hostAccount],
    });
    mocks.project.mockReturnValue({ type: 'ssh', connectionId: 'conn-1' });
    // ron-dev:bara is pinned to rc3r0; the stored pick names the other identity.
    mocks.machines.mockReturnValue({
      connections: [
        {
          id: 'conn-1',
          host: 'ron-dev',
          username: 'bara',
          githubAccountId: 'github.com:255108029',
        },
      ],
    });

    const result = useProjectAccount('project-1', 'github', { repository: { kind: 'project' } });
    expect(result?.value).toEqual(hostAccount);
  });

  it('leaves a non-GitHub provider on its own policy on a locked machine', () => {
    mocks.project.mockReturnValue({ type: 'ssh', connectionId: 'conn-1' });
    mocks.machines.mockReturnValue({
      connections: [{ id: 'conn-1', host: 'ron-dev', username: 'bara' }],
    });

    const result = useProjectAccount('project-1', 'gitlab', { repository: { kind: 'project' } });
    expect(result?.value).toEqual(account);
  });
});
