/**
 * Fork-local: hosts that run OpenCode through a platform launcher.
 *
 * On those hosts the provider key is deliberately not on disk in
 * `opencode auth.json` — it lives in a vault and the launcher injects it at
 * start-up. Spawning `opencode` directly therefore leaves OpenCode with no
 * credentials, and it offers only its free models: no DeepSeek, and no sign of
 * why. Hosts without the launcher are untouched and keep the direct CLI, which
 * is what the older server relies on.
 *
 * The decision has to be made on the host at launch time, because whether the
 * launcher exists is a property of the machine, not of the app build.
 */
export const PLATFORM_LAUNCHER = 'devctl';

/** `devctl agent opencode [...]` passes the remaining args through to OpenCode. */
export const PLATFORM_AGENT_ARGS = ['agent', 'opencode'] as const;

/**
 * Shell wrapper that prefers the platform launcher and falls back to the
 * resolved OpenCode binary.
 *
 * `$0` is the resolved CLI path, passed as an argument rather than
 * interpolated, so nothing from the environment reaches the script text. The
 * `exec` calls keep stdin/stdout attached to the launcher, which the ACP
 * stdio transport depends on.
 */
export const PLATFORM_LAUNCHER_SCRIPT = `if command -v ${PLATFORM_LAUNCHER} >/dev/null 2>&1; then exec ${PLATFORM_LAUNCHER} ${PLATFORM_AGENT_ARGS.join(' ')} "$@"; else exec "$0" "$@"; fi`;

/** The spawn argv for an ACP session: `sh` shim, then the CLI path, then `acp`. */
export function buildAcpSpawnArgs(cli: string, args: readonly string[]): string[] {
  return ['-c', PLATFORM_LAUNCHER_SCRIPT, cli, ...args];
}

/**
 * The launcher reports a usable key on its own line, e.g.
 * `[OK]   DeepSeek             client vault key is available`.
 * Matching the provider we need keeps a launcher that is installed but has no
 * key from reading as authenticated.
 */
const LAUNCHER_KEY_READY_PATTERN = /\[OK\]\s+DeepSeek\b/;

export function launcherReportsKey(output: string): boolean {
  return LAUNCHER_KEY_READY_PATTERN.test(output);
}
