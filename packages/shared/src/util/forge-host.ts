/**
 * SSH host aliases for github.com. A remote written as `github.com-rc3r0`
 * selects a key in ~/.ssh/config, but the forge is still github.com and git
 * treats it as the same host. Keeping several GitHub identities on one machine
 * by aliasing is normal, so anything comparing a git remote host against a
 * configured instance has to fold these first — otherwise the remote is read
 * as a different forge, or as a GitHub Enterprise instance, and the
 * integration rejects a setup that works fine from the command line.
 *
 * The pattern excludes any further dot, so a lookalike host such as
 * `github.com.evil.example` can never normalize into github.com and inherit
 * its configuration.
 */
const GITHUB_ALIASED_HOST_PATTERN = /^github\.com[-_][a-z0-9_-]+$/;

/**
 * The forge a git remote host really refers to, with ssh aliases of github.com
 * and the www prefix folded onto the canonical host.
 */
export function normalizeForgeHost(host: string): string {
  const value = host.trim().toLowerCase();
  if (value === 'www.github.com') return 'github.com';
  return GITHUB_ALIASED_HOST_PATTERN.test(value) ? 'github.com' : value;
}
