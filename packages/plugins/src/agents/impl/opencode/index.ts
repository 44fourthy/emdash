import {
  definePlugin,
  registerPluginBehavior,
} from '@emdash/core/services/agent-plugins/api/plugins';
import {
  buildStandardCommand,
  createFileDropPlugin,
  npmDependency,
  opencodeMcpAdapter,
  xdgConfigRoot,
} from '@emdash/core/services/agent-plugins/api/plugins/helpers';
import { connectStdioAcp } from '../../helpers/acp-stdio';
import { opencodeAuthStatus } from './auth';
import { buildAcpSpawnArgs } from './platform-launcher';
import { OPENCODE_PLUGIN_CONTENT } from './plugin-file';

const OPENCODE_PLUGIN_PATH = 'plugins/emdash-notifications.js';
const validateSessionId = (id: string) => id.startsWith('ses');
import { icon } from './icon';

/**
 * Capabilities OpenCode ships but leaves off unless told otherwise. They are
 * read from the environment only — an `experimental` block in opencode.json is
 * parsed and then ignored — so they have to ride along with the spawn, or the
 * agent silently runs with a smaller toolset than the CLI supports.
 *
 * The two numeric ones are not switches: `OUTPUT_TOKEN_MAX` caps a single
 * response (the DeepSeek models here allow 384k) and `BASH_DEFAULT_TIMEOUT_MS`
 * replaces the built-in 120000 default.
 */
const OPENCODE_CAPABILITY_ENV: Record<string, string> = {
  OPENCODE_EXPERIMENTAL_PARALLEL: 'true',
  OPENCODE_ENABLE_PARALLEL: 'true',
  OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS: 'true',
  OPENCODE_EXPERIMENTAL_CODE_MODE: 'true',
  // Long runs otherwise get compacted mid-task, which loses the thread of what
  // the agent was doing.
  OPENCODE_DISABLE_AUTOCOMPACT: 'true',
  OPENCODE_ENABLE_QUESTION_TOOL: 'true',
  OPENCODE_EXPERIMENTAL_LSP_TOOL: 'true',
  OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX: '64000',
  OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS: '600000',
};

export const plugin = definePlugin(
  {
    id: 'opencode',
    name: 'OpenCode',
    description:
      'OpenCode CLI that interfaces with models for code generation and edits from the shell.',
    websiteUrl: 'https://opencode.ai/docs/cli/',
  },
  {
    acp: {
      kind: 'supported',
    },
    autoApprove: {
      kind: 'supported',
    },
    auth: {
      kind: 'supported',
      methods: [
        {
          kind: 'cli-login',
          id: 'opencode-login',
          name: 'Sign in with OpenCode',
          args: ['auth', 'login'],
          description: 'Open the OpenCode CLI sign-in flow in a terminal.',
        },
        {
          kind: 'api-key',
          id: 'provider-api-key',
          name: 'Use provider API keys',
          envVars: [
            { name: 'ANTHROPIC_API_KEY', label: 'Anthropic API key' },
            { name: 'OPENAI_API_KEY', label: 'OpenAI API key' },
            { name: 'GEMINI_API_KEY', label: 'Gemini API key' },
            { name: 'ORCAROUTER_API_KEY', label: 'OrcaRouter API key' },
          ],
        },
      ],
    },
    hooks: {
      kind: 'plugin',
      scope: 'global',
      supportedEvents: ['notification', 'stop', 'session'],
    },
    hostDependency: npmDependency({ id: 'opencode', package: 'opencode-ai' }),
    mcp: {
      kind: 'supported',
      scope: 'global',
      supportedTransports: ['stdio', 'http'],
    },
    plugins: {
      kind: 'file-drop',
      scope: 'global',
    },
    prompt: {
      kind: 'argv',
      flag: '--prompt',
    },
    sessions: {
      kind: 'resumable',
    },
  },
  { icon }
);

export const provider = registerPluginBehavior(plugin, {
  auth: {
    checkStatus: opencodeAuthStatus,
  },
  acp: {
    // Routed through `sh` so the launch-time choice between the platform
    // launcher and the bare CLI happens on the host, where the launcher's
    // presence is actually knowable. See platform-launcher.ts.
    buildSpawn: (ctx) =>
      process.platform === 'win32'
        ? { command: ctx.cli, args: ['acp'], env: OPENCODE_CAPABILITY_ENV }
        : {
            command: '/bin/sh',
            args: buildAcpSpawnArgs(ctx.cli, ['acp']),
            env: OPENCODE_CAPABILITY_ENV,
          },
    connect: (io, toClient) => {
      return connectStdioAcp(io, toClient);
    },
  },
  prompt: {
    buildCommand: (ctx) =>
      buildStandardCommand(ctx, {
        extraEnv: {
          ...OPENCODE_CAPABILITY_ENV,
          ...(ctx.autoApprove ? { OPENCODE_PERMISSION: '{"*":"allow"}' } : {}),
        },
        initialPromptFlag: '--prompt',
        modelFlag: '--model',
        resumeFlag: '--session',
        sessionIdFlag: '--session',
        sessionIdOnResumeOnly: true,
        resumeWithoutSessionFlag: '--continue',
        validateSessionId,
      }),
  },
  sessions: { validateSessionId },
  mcp: opencodeMcpAdapter(),
  plugins: createFileDropPlugin({
    resolveConfigRoot: xdgConfigRoot('opencode', { overrideEnvVar: 'OPENCODE_CONFIG_DIR' }),
    relativePath: OPENCODE_PLUGIN_PATH,
    content: OPENCODE_PLUGIN_CONTENT,
  }),
});
