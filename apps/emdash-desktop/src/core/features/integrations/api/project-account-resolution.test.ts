import { describe, expect, it } from 'vitest';
import type { RepoFacts, StoredBaseProjectSettings } from '@core/primitives/project-settings/api';
import type { ProviderAccountSummary } from '@core/primitives/provider-accounts/api';
import { resolveProjectAccount } from './project-account-resolution';

function facts(overrides: Partial<RepoFacts> = {}): RepoFacts {
  return { remotes: [], localBranches: [], ...overrides };
}
function remote(
  name: string,
  overrides: Partial<Omit<RepoFacts['remotes'][number], 'name'>> = {}
): RepoFacts['remotes'][number] {
  return { name, host: 'github.com', headBranch: null, branches: [], ...overrides };
}

describe.each(['github', 'gitlab', 'forgejo'])('project account policy for %s', (providerId) => {
  function account(
    accountId: string,
    overrides: Partial<ProviderAccountSummary> = {}
  ): ProviderAccountSummary {
    return {
      providerId,
      displayName: accountId,
      accountId,
      host: 'github.com',
      isDefault: false,
      ...overrides,
    };
  }
  function stored(settings: StoredBaseProjectSettings = {}) {
    return settings;
  }
  function resolve(
    settings: StoredBaseProjectSettings,
    repoFacts: RepoFacts,
    accounts: ProviderAccountSummary[]
  ) {
    return resolveProjectAccount({
      providerId,
      stored: settings.integrationAccounts ?? {},
      accounts,
      repository: { kind: 'project', storedGitSettings: settings, repoFacts },
    });
  }

  it('returns explicit none as a set null', () => {
    const result = resolve(
      stored({ integrationAccounts: { [providerId]: { kind: 'none' } } }),
      facts({ remotes: [remote('origin')] }),
      [account('a1', { isDefault: true })]
    );
    expect(result).toMatchObject({ value: null, provenance: { kind: 'set' } });
  });

  it('returns a pinned account whose host matches the base remote as set', () => {
    const pinned = account('a1');
    const result = resolve(
      stored({ integrationAccounts: { [providerId]: { kind: 'account', accountId: 'a1' } } }),
      facts({ remotes: [remote('origin', { host: 'github.com' })] }),
      [pinned, account('a2', { isDefault: true })]
    );
    expect(result).toMatchObject({ value: pinned, provenance: { kind: 'set' } });
  });

  it('fails closed on a dangling pin instead of resolving another account', () => {
    const result = resolve(
      stored({ integrationAccounts: { [providerId]: { kind: 'account', accountId: 'gone' } } }),
      facts({ remotes: [remote('origin')] }),
      [account('a1', { isDefault: true })]
    );
    expect(result).toMatchObject({ value: null, provenance: { kind: 'unresolvable' } });
  });

  it('fails closed on a host-mismatched pin', () => {
    const result = resolve(
      stored({ integrationAccounts: { [providerId]: { kind: 'account', accountId: 'a1' } } }),
      facts({ remotes: [remote('origin', { host: 'ghe.example.com' })] }),
      [account('a1', { host: 'github.com' })]
    );
    expect(result).toMatchObject({ value: null, provenance: { kind: 'unresolvable' } });
  });

  it('keeps a pinned account when the repository host is unknown', () => {
    const pinned = account('a1');
    const result = resolve(
      stored({ integrationAccounts: { [providerId]: { kind: 'account', accountId: 'a1' } } }),
      facts({ remotes: [remote('origin', { host: null })] }),
      [pinned]
    );
    expect(result).toMatchObject({ value: pinned, provenance: { kind: 'set' } });
  });

  it('infers the provider default account when its host matches the base remote', () => {
    const preferred = account('a2', { isDefault: true });
    const result = resolve(
      stored(),
      facts({ remotes: [remote('origin', { host: 'github.com' })] }),
      [account('a1'), preferred]
    );
    expect(result).toMatchObject({
      value: preferred,
      provenance: { kind: 'inferred', from: 'default account' },
    });
  });

  it('infers the only host-matching account when the default does not match', () => {
    const matching = account('a1', { host: 'ghe.example.com' });
    const result = resolve(
      stored(),
      facts({ remotes: [remote('origin', { host: 'ghe.example.com' })] }),
      [matching, account('a2', { isDefault: true })]
    );
    expect(result).toMatchObject({
      value: matching,
      provenance: { kind: 'inferred', from: 'only host-matching account' },
    });
  });

  it('infers none when several non-default accounts match the host', () => {
    const result = resolve(
      stored(),
      facts({ remotes: [remote('origin', { host: 'github.com' })] }),
      [account('a1'), account('a2')]
    );
    expect(result).toMatchObject({
      value: null,
      provenance: { kind: 'inferred', from: 'no host-matching account' },
    });
  });

  it('infers none with zero accounts', () => {
    const result = resolve(stored(), facts({ remotes: [remote('origin')] }), []);
    expect(result).toMatchObject({
      value: null,
      provenance: { kind: 'inferred', from: 'no host-matching account' },
    });
  });

  it('infers none when there is no base remote host to match against', () => {
    const result = resolve(stored(), facts(), [account('a1', { isDefault: true })]);
    expect(result).toMatchObject({
      value: null,
      provenance: { kind: 'inferred', from: 'no host-matching account' },
    });
  });

  it('normalizes hosts when matching accounts against the base remote', () => {
    const preferred = account('a1', { host: 'www.github.com', isDefault: true });
    const result = resolve(
      stored(),
      facts({ remotes: [remote('origin', { host: 'github.com' })] }),
      [preferred]
    );
    expect(result).toMatchObject({
      value: preferred,
      provenance: { kind: 'inferred', from: 'default account' },
    });
  });
});

describe('host account lock', () => {
  function account(
    accountId: string,
    overrides: Partial<ProviderAccountSummary> = {}
  ): ProviderAccountSummary {
    return {
      providerId: 'github',
      displayName: accountId,
      accountId,
      host: 'github.com',
      isDefault: false,
      ...overrides,
    };
  }

  function resolve(options: {
    accounts: ProviderAccountSummary[];
    stored?: StoredBaseProjectSettings;
    /** Provider defaults to github, which is what the fork's policy pins. */
    hostAccountLock?: { accountId: string | null; providerId?: string; pinnedLogin?: string };
  }) {
    return resolveProjectAccount({
      providerId: 'github',
      stored: options.stored?.integrationAccounts ?? {},
      accounts: options.accounts,
      hostAccountLock: options.hostAccountLock
        ? { providerId: 'github', ...options.hostAccountLock }
        : undefined,
      repository: {
        kind: 'project',
        storedGitSettings: options.stored ?? {},
        repoFacts: facts({ remotes: [remote('origin')] }),
      },
    });
  }

  it('resolves to the host account regardless of what the project stored', () => {
    const hostAccount = account('a2');
    const result = resolve({
      accounts: [account('a1', { isDefault: true }), hostAccount],
      stored: { integrationAccounts: { github: { kind: 'account', accountId: 'a1' } } },
      hostAccountLock: { accountId: 'a2' },
    });
    expect(result).toMatchObject({
      value: hostAccount,
      provenance: { kind: 'inferred', from: 'host account' },
    });
  });

  it('overrides an explicit none on the project', () => {
    // The host claims the account; a project-level "no account" cannot opt out
    // of the machine's identity, which is what is actually authenticating.
    const hostAccount = account('a2');
    const result = resolve({
      accounts: [hostAccount],
      stored: { integrationAccounts: { github: { kind: 'none' } } },
      hostAccountLock: { accountId: 'a2' },
    });
    expect(result).toMatchObject({ value: hostAccount });
  });

  it('fails closed when the locked account is no longer connected', () => {
    const result = resolve({
      accounts: [account('a1', { isDefault: true })],
      hostAccountLock: { accountId: 'gone' },
    });
    expect(result).toMatchObject({ value: null, provenance: { kind: 'unresolvable' } });
  });

  it('resolves to nothing when the host has no account set', () => {
    const result = resolve({
      accounts: [account('a1', { isDefault: true })],
      hostAccountLock: { accountId: null },
    });
    expect(result).toMatchObject({
      value: null,
      provenance: { kind: 'inferred', from: 'no host account' },
    });
  });

  it('leaves local projects on the per-project policy when there is no lock', () => {
    const preferred = account('a1', { isDefault: true });
    const result = resolve({
      accounts: [preferred],
      stored: { integrationAccounts: { github: { kind: 'account', accountId: 'a1' } } },
    });
    expect(result).toMatchObject({ value: preferred, provenance: { kind: 'set' } });
  });

  it('keys the context on the lock, so changing it invalidates account-bound work', () => {
    const accounts = [account('a1'), account('a2')];
    const locked = resolve({ accounts, hostAccountLock: { accountId: 'a1' } });
    const relocked = resolve({ accounts, hostAccountLock: { accountId: 'a2' } });
    const unlocked = resolve({ accounts });
    expect(locked.contextKey).not.toBe(relocked.contextKey);
    expect(locked.contextKey).not.toBe(unlocked.contextKey);
  });

  it('leaves other providers on their own policy', () => {
    // A machine's account belongs to GitHub. GitLab on the same machine must
    // keep its own resolution rather than be failed closed by a lock that
    // names an account it has never heard of.
    const gitlab: ProviderAccountSummary = { ...account('g1'), providerId: 'gitlab' };
    const result = resolveProjectAccount({
      providerId: 'gitlab',
      stored: {},
      accounts: [gitlab],
      hostAccountLock: { accountId: 'a1', providerId: 'github' },
      repository: {
        kind: 'project',
        storedGitSettings: {},
        repoFacts: facts({ remotes: [remote('origin')] }),
      },
    });
    expect(result).toMatchObject({ value: gitlab });
    expect(result.provenance.kind).not.toBe('unresolvable');
  });
});
