import { describe, expect, it } from 'vitest';
import { mergeGithubAccountId, sshConnectionMetadata } from './ssh-connection-metadata';

// Migration tests for the versioned SSH connection metadata chain, per the
// versioned-schema conventions: every stored shape must upgrade to the latest
// version without data loss.
describe('sshConnectionMetadata versioned schema', () => {
  it('parses an unversioned v0 object and upgrades it to the latest version', () => {
    const result = sshConnectionMetadata.safeParse({
      sshConfigAlias: 'my-host',
      forwardAgent: true,
      proxyJump: 'jump-host',
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.data.sshConfigAlias).toBe('my-host');
    expect(result.data.forwardAgent).toBe(true);
    expect(result.data.proxyJump).toBe('jump-host');
    // v4's field defaults to unset (treated as false by readers).
    expect(result.data.syncLocalSettings).toBeUndefined();
    expect(result.data.version).toBe(sshConnectionMetadata.currentVersion);
  });

  it('upgrades v3 data to the latest version preserving dependency selections', () => {
    const result = sshConnectionMetadata.safeParse({
      version: '3',
      sshConfigAlias: 'my-host',
      dependencySelections: {
        claude: { kind: 'pinned', realpath: '/usr/local/bin/claude' },
        codex: null,
      },
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.data.version).toBe('5');
    expect(result.data.dependencySelections).toEqual({
      claude: { kind: 'pinned', realpath: '/usr/local/bin/claude' },
      codex: null,
    });
    expect(result.data.syncLocalSettings).toBeUndefined();
  });

  it('round-trips a current-version object with syncLocalSettings through serialize/parseJson', () => {
    const value = sshConnectionMetadata.schema.parse({
      version: '5',
      sshConfigAlias: 'my-host',
      syncLocalSettings: true,
    });
    const roundTripped = sshConnectionMetadata.parseJson(sshConnectionMetadata.serialize(value));
    expect(roundTripped).toEqual(value);
    expect(roundTripped?.syncLocalSettings).toBe(true);
  });

  it('keeps syncLocalSettings false-y for shapes written before v4', () => {
    for (const stored of [
      {},
      { version: '1', dependencySelections: { claude: { path: '/bin/claude' } } },
      { version: '2', dependencySelections: { claude: { kind: 'path', path: '/bin/claude' } } },
    ]) {
      const result = sshConnectionMetadata.safeParse(stored);
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') continue;
      expect(result.data.syncLocalSettings ?? false).toBe(false);
    }
  });

  it('round-trips a v5 object with githubAccountId through serialize/parseJson', () => {
    const value = sshConnectionMetadata.schema.parse({
      version: '5',
      sshConfigAlias: 'my-host',
      syncLocalSettings: true,
      githubAccountId: 'gh-1234',
    });
    const roundTripped = sshConnectionMetadata.parseJson(sshConnectionMetadata.serialize(value));
    expect(roundTripped).toEqual(value);
    expect(roundTripped?.githubAccountId).toBe('gh-1234');
  });

  it('leaves githubAccountId unset for shapes written before v5', () => {
    for (const stored of [
      {},
      { version: '4', sshConfigAlias: 'my-host', syncLocalSettings: true },
      { version: '3', dependencySelections: { codex: null } },
    ]) {
      const result = sshConnectionMetadata.safeParse(stored);
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') continue;
      expect(result.data.githubAccountId).toBeUndefined();
    }
  });

  it('keeps syncLocalSettings when loading a stored v4 row into the v5 chain', () => {
    // v4's field must survive the pass-through upgrade, or every host would
    // silently lose its sync toggle on the first read after this release.
    const result = sshConnectionMetadata.safeParse({
      version: '4',
      syncLocalSettings: true,
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.data.syncLocalSettings).toBe(true);
    expect(result.data.version).toBe('5');
  });
});

describe('mergeGithubAccountId', () => {
  it('sets the account without disturbing other metadata', () => {
    const next = mergeGithubAccountId(
      { sshConfigAlias: 'my-host', syncLocalSettings: true },
      'gh-1234'
    );
    expect(next).toEqual({
      sshConfigAlias: 'my-host',
      syncLocalSettings: true,
      githubAccountId: 'gh-1234',
      version: '5',
    });
  });

  it('removes the key when cleared so unset stays distinct from empty', () => {
    const next = mergeGithubAccountId({ githubAccountId: 'gh-1234' }, null);
    expect(next.githubAccountId).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(next, 'githubAccountId')).toBe(false);
  });

  it('survives a serialize/parse round trip when cleared', () => {
    const cleared = mergeGithubAccountId({ githubAccountId: 'gh-1234' }, null);
    const roundTripped = sshConnectionMetadata.parseJson(sshConnectionMetadata.serialize(cleared));
    expect(roundTripped?.githubAccountId).toBeUndefined();
  });
});
