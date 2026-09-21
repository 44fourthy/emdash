import { describe, expect, it } from 'vitest';
import {
  buildAcpSpawnArgs,
  launcherReportsKey,
  PLATFORM_LAUNCHER_SCRIPT,
} from './platform-launcher';

describe('PLATFORM_LAUNCHER_SCRIPT', () => {
  it('prefers the launcher and falls back to the resolved CLI', () => {
    expect(PLATFORM_LAUNCHER_SCRIPT).toContain('command -v devctl');
    expect(PLATFORM_LAUNCHER_SCRIPT).toContain('exec devctl agent opencode');
    // The fallback runs the CLI path passed as $0, so a host without the
    // launcher keeps working exactly as before.
    expect(PLATFORM_LAUNCHER_SCRIPT).toContain('exec "$0"');
  });

  it('does not interpolate anything but the launcher name', () => {
    // The CLI path arrives as an argument, never as script text, so no value
    // from the environment can alter the command being run.
    expect(PLATFORM_LAUNCHER_SCRIPT).not.toContain('ctx');
    expect(PLATFORM_LAUNCHER_SCRIPT).not.toContain('$1');
  });
});

describe('buildAcpSpawnArgs', () => {
  it('passes the CLI path as $0 and the subcommand as an argument', () => {
    expect(buildAcpSpawnArgs('/opt/opencode/1.18.31/opencode', ['acp'])).toEqual([
      '-c',
      PLATFORM_LAUNCHER_SCRIPT,
      '/opt/opencode/1.18.31/opencode',
      'acp',
    ]);
  });
});

describe('launcherReportsKey', () => {
  it('accepts real devctl auth output that reports the key', () => {
    const output = [
      'devctl auth — checking sessions and references only',
      '',
      'AUTH',
      "  [OK]   identity             checking bara's own sessions",
      '  [OK]   vault access         selected client vault is accessible',
      '  [INFO] deepseek reference   mapped in the selected client vault',
      '  [OK]   DeepSeek             client vault key is available',
      '',
      'READY',
    ].join('\n');
    expect(launcherReportsKey(output)).toBe(true);
  });

  it('rejects output where the launcher is present but the key is missing', () => {
    const output = [
      'AUTH',
      '  [OK]   vault access         selected client vault is accessible',
      '  [ERR]  DeepSeek             client vault key is unavailable',
      'NOT READY',
    ].join('\n');
    expect(launcherReportsKey(output)).toBe(false);
    expect(launcherReportsKey('')).toBe(false);
  });
});
