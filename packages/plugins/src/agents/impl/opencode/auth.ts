import type {
  AgentAuthContext,
  AgentAuthStatus,
} from '@emdash/core/services/agent-plugins/api/plugins';
import { authenticatedFromEnv } from '../../helpers/auth';
import { launcherReportsKey, PLATFORM_LAUNCHER } from './platform-launcher';

const AUTH_STATUS_TIMEOUT_MS = 5_000;
const PROVIDER_API_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'ORCAROUTER_API_KEY',
];

export async function opencodeAuthStatus(ctx: AgentAuthContext): Promise<AgentAuthStatus> {
  const envStatus = authenticatedFromEnv(ctx, PROVIDER_API_ENV_VARS);
  if (envStatus.kind === 'authenticated') return envStatus;

  let storedStatus: AgentAuthStatus;
  try {
    const { stdout, stderr } = await ctx.exec(ctx.cli, ['auth', 'list'], {
      timeout: AUTH_STATUS_TIMEOUT_MS,
    });
    storedStatus = statusFromAuthListOutput(`${stdout}\n${stderr}`);
  } catch (error) {
    storedStatus = statusFromAuthListOutput(outputFromExecError(error));
  }
  if (storedStatus.kind === 'authenticated') return storedStatus;

  // On a host that runs OpenCode through its platform launcher the key is held
  // in a vault, never written to auth.json, so an empty credential list is the
  // expected state rather than a missing sign-in.
  const launcherStatus = await platformLauncherStatus(ctx);
  if (launcherStatus) return launcherStatus;

  return storedStatus;
}

/**
 * `null` when the host has no platform launcher — the credential list is then
 * the only evidence and its verdict stands.
 */
async function platformLauncherStatus(ctx: AgentAuthContext): Promise<AgentAuthStatus | null> {
  try {
    const { stdout, stderr } = await ctx.exec(PLATFORM_LAUNCHER, ['auth'], {
      timeout: AUTH_STATUS_TIMEOUT_MS,
    });
    const output = `${stdout}\n${stderr}`;
    return launcherReportsKey(output)
      ? { kind: 'authenticated' }
      : { kind: 'unauthenticated' };
  } catch {
    return null;
  }
}

function statusFromAuthListOutput(output: string): AgentAuthStatus {
  const count = credentialCount(output);
  if (count === null) return { kind: 'unknown' };
  return count > 0 ? { kind: 'authenticated' } : { kind: 'unauthenticated' };
}

function credentialCount(output: string): number | null {
  const match = output.match(/\b(\d+)\s+credentials?\b/i);
  return match ? Number(match[1]) : null;
}

function outputFromExecError(error: unknown): string {
  if (typeof error !== 'object' || error === null) return String(error);
  const withOutput = error as { stdout?: unknown; stderr?: unknown; message?: unknown };
  return [withOutput.stdout, withOutput.stderr, withOutput.message]
    .filter((value): value is string => typeof value === 'string')
    .join('\n');
}
