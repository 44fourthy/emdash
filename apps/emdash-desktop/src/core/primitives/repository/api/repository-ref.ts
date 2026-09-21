import { err, ok, type Result } from '@emdash/shared';

export type RepositoryRef = {
  host: string;
  owner: string;
  repo: string;
  nameWithOwner: string;
  repositoryUrl: string;
};

export type RepositoryRefParseError = {
  type: 'invalid-repository-ref';
  input: string;
};

export function isGitHubDotComHost(host: string): boolean {
  return normalizeRepositoryHost(host) === 'github.com';
}

export function normalizeRepositoryHost(host: string): string {
  const value = host.trim().toLowerCase();
  if (value === 'www.github.com') return 'github.com';
  // An SSH host alias such as `github.com-rc3r0` or `github.com-work` is
  // github.com reached with a particular key. Git treats it as the same host
  // and only the identity differs, so it must normalize here too. Otherwise
  // the repository is mistaken for a GitHub Enterprise instance: the API base
  // URL becomes https://github.com-rc3r0/api/v3, the connected account fails
  // to match, and the integration pauses.
  //
  // The pattern deliberately excludes any further dot, so a hostile host like
  // `github.com.evil.example` can never be treated as github.com.
  if (/^github\.com[-_][a-z0-9_-]+$/.test(value)) return 'github.com';
  return value;
}

function stripGitSuffix(value: string): string {
  return value.endsWith('.git') ? value.slice(0, -4) : value;
}

function normalizeSlug(slug: string): string | null {
  const value = stripGitSuffix(slug.trim()).replace(/^\/+/, '').replace(/\/+$/, '');
  if (!value || value.includes('\\')) return null;
  const parts = value.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  return parts.join('/');
}

function toRepositoryRef(host: string, slug: string): RepositoryRef | null {
  const normalizedHost = normalizeRepositoryHost(host);
  const nameWithOwner = normalizeSlug(slug);
  if (!normalizedHost || !nameWithOwner) return null;

  const parts = nameWithOwner.split('/');
  const repo = parts.at(-1);
  const owner = parts.slice(0, -1).join('/');
  if (!owner || !repo) return null;

  return {
    host: normalizedHost,
    owner,
    repo,
    nameWithOwner,
    repositoryUrl: `https://${normalizedHost}/${nameWithOwner}`,
  };
}

export function parseRepositoryRef(
  input?: string | null,
  options: { defaultHost?: string } = {}
): RepositoryRef | null {
  const value = input?.trim();
  if (!value) return null;

  if (!value.includes('://')) {
    const scpMatch = /^[^@\s]+@([^:\s]+):(.+)$/.exec(value);
    if (scpMatch) return toRepositoryRef(scpMatch[1], scpMatch[2]);
  }

  if (value.startsWith('ssh://')) {
    const sshMatch = /^ssh:\/\/(?:[^@\s/]+@)?([^/:\s]+)(?::\d+)?\/(.+)$/i.exec(value);
    if (sshMatch) return toRepositoryRef(sshMatch[1], sshMatch[2]);
    try {
      const parsed = new URL(value);
      if (!parsed.hostname) return null;
      return toRepositoryRef(parsed.hostname, parsed.pathname);
    } catch {
      return null;
    }
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    try {
      const parsed = new URL(value);
      if (!parsed.host) return null;
      return toRepositoryRef(parsed.host, parsed.pathname);
    } catch {
      return null;
    }
  }

  if (options.defaultHost) {
    const canonicalMatch = /^([^/\s:]+(?:\/[^/\s?#]+)+?)(?:\.git)?$/i.exec(value);
    if (canonicalMatch) return toRepositoryRef(options.defaultHost, canonicalMatch[1]);
  }

  return null;
}

export function parseRepositoryRefResult(
  input: string,
  options: { defaultHost?: string } = {}
): Result<RepositoryRef, RepositoryRefParseError> {
  const repository = parseRepositoryRef(input, options);
  return repository
    ? ok(repository)
    : err({
        type: 'invalid-repository-ref',
        input,
      });
}

export function splitNameWithOwner(nameWithOwner: string): { owner: string; repo: string } {
  const parsed = parseRepositoryRef(nameWithOwner, { defaultHost: 'github.com' });
  if (!parsed || parsed.nameWithOwner !== nameWithOwner.trim()) {
    throw new Error(`Invalid nameWithOwner: "${nameWithOwner}" (expected "owner/repo")`);
  }
  return { owner: parsed.owner, repo: parsed.repo };
}
