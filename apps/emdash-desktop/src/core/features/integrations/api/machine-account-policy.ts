/**
 * Fork-local: which GitHub identity each host account is paired with.
 *
 * On these hosts every unix user carries its own SSH key and therefore pushes
 * as its own GitHub identity. Picking the pairing per machine in the UI leaves
 * the two able to disagree — the desktop acting as one identity while git
 * pushes as another — so for these hosts the pairing is owned by code instead.
 *
 * A pinned machine resolves to the pinned identity and to nothing else: the
 * account picked in the UI is ignored, and an identity that is not connected
 * resolves to no account rather than to some other one. Hosts and unix users
 * not listed here keep the per-machine picker.
 *
 * Keys are `<ssh host>:<unix user>`, matching ssh_connections.host/username.
 */
const PINNED_GITHUB_LOGINS: Record<string, string> = {
  // ron-dev — key per user, verified with `ssh -T git@github.com-<alias>`.
  'ron-dev:bara': 'rc3r0',
  'ron-dev:lif': 'ron158',
  'ron-dev:colors': 'ron900',

  // Legacy host. `topline` is intentionally absent: that user has no GitHub key.
  '169.58.235.22:bara': 'rc3r0',
  '169.58.235.22:lif': 'ron158',
  '169.58.235.22:personal': '44fourthy',
};

/** The identity this host account is pinned to, or undefined when unpinned. */
export function pinnedGithubLoginFor(host: string, username: string): string | undefined {
  return PINNED_GITHUB_LOGINS[`${host}:${username}`];
}
