import {
  hostSettingsErrorSchema,
  hostSettingsStateSchema,
  updateHostSettingsInputSchema,
} from '@emdash/core/runtimes/host-settings/api';
import { resourceUsageSampleSchema } from '@emdash/core/runtimes/resource-usage/api';
import type {
  DependencyStatus,
  HostDependencyError,
  InstallCommandOption,
  InstallMethod,
} from '@emdash/core/services/host-dependencies/api';
import {
  hostDependencyErrorSchema,
  hostDependencyOperationProgressSchema,
  hostDependencySnapshotSchema,
  installMethodSchema,
} from '@emdash/core/services/host-dependencies/api';
import type { Result } from '@emdash/shared';
import { resultSchema } from '@emdash/shared';
import {
  defineContract,
  fallible,
  liveJob,
  liveModel,
  liveState,
  mutation,
  procedure,
} from '@emdash/wire/rpc';
import { z } from 'zod';
import type { SshConfig, SshConnectionUsage } from '@core/primitives/ssh/api';

// syncLocalSettings and githubAccountId are excluded from save: each is set
// through its own dedicated procedure so changing it never drops the pinned
// connection.
export type SaveMachineInput = Partial<Pick<SshConfig, 'id'>> &
  Omit<SshConfig, 'id' | 'syncLocalSettings' | 'githubAccountId'> & {
    password?: string;
    passphrase?: string;
  };

export type MachineSystemDependencyTier = 'required' | 'recommended';

export type MachineSystemDependencyStatus = {
  id: string;
  name: string;
  tier: MachineSystemDependencyTier;
  status: DependencyStatus;
  path: string | null;
  installDocs?: string;
  installOptions: InstallCommandOption[];
};

export type InstallMachineSystemDependencyInput = {
  machineId?: string;
  id: string;
  method?: InstallMethod;
  elevate?: boolean;
};

export type InstallMachineSystemDependencyResult = Result<
  MachineSystemDependencyStatus,
  HostDependencyError
>;
export type InstallMachineSystemDependenciesInput = {
  machineId?: string;
  dependencies: Array<Omit<InstallMachineSystemDependencyInput, 'machineId'>>;
};
export type InstallMachineSystemDependenciesResult = Record<
  string,
  InstallMachineSystemDependencyResult
>;

const voidInput = z.void();
const hostInput = z.object({ machineId: z.string().min(1).optional() });
const systemDependencyInstallInput = z.object({
  id: z.string().min(1),
  method: installMethodSchema.optional(),
  elevate: z.boolean().optional(),
});
const systemDependencyInstallResult = resultSchema(
  z.custom<MachineSystemDependencyStatus>(),
  hostDependencyErrorSchema
);

export const machinesDomain = 'machines' as const;

export const machinesContract = defineContract({
  getMachines: procedure({ input: voidInput, output: z.array(z.custom<SshConfig>()) }),
  getMachineUsage: procedure({
    input: voidInput,
    output: z.custom<SshConnectionUsage>(),
  }),
  getMachineMetrics: procedure({
    input: hostInput,
    output: resourceUsageSampleSchema,
  }),
  systemDependencies: liveModel({
    key: hostInput,
    states: {
      current: liveState({ data: hostDependencySnapshotSchema }),
    },
    mutations: {
      refresh: mutation({
        input: z.void(),
        data: hostDependencySnapshotSchema,
        error: hostDependencyErrorSchema,
      }),
    },
  }),
  installSystemDependencies: liveJob({
    input: hostInput.extend({ dependencies: z.array(systemDependencyInstallInput).min(1) }),
    progress: hostDependencyOperationProgressSchema,
    result: z.record(z.string(), systemDependencyInstallResult),
    error: hostDependencyErrorSchema,
  }),
  /**
   * Per-host defaults (shellSetup, worktree root, tmux) from the host-settings
   * runtime; the live model also reflects out-of-band edits to the settings file.
   */
  hostSettings: liveModel({
    key: hostInput,
    states: {
      current: liveState({ data: hostSettingsStateSchema }),
    },
  }),
  updateHostSettings: fallible({
    input: hostInput.extend({ patch: updateHostSettingsInputSchema }),
    data: hostSettingsStateSchema,
    error: hostSettingsErrorSchema,
  }),
  saveMachine: procedure({
    input: z.custom<SaveMachineInput>(),
    output: z.custom<SshConfig>(),
  }),
  /**
   * Flips the per-host "Sync local settings" toggle (connection metadata,
   * desktop-side). Deliberately separate from saveMachine so toggling never
   * drops the pinned host connection.
   */
  setSyncLocalSettings: procedure({
    input: z.object({ id: z.string(), enabled: z.boolean() }),
    output: z.custom<SshConfig>(),
  }),
  /**
   * Sets this host's locked GitHub account (connection metadata, desktop-side).
   * `accountId: null` clears it. Separate from saveMachine for the same reason
   * as the sync toggle: this must never drop the pinned host connection.
   */
  setGithubAccount: procedure({
    input: z.object({ id: z.string(), accountId: z.string().nullable() }),
    output: z.custom<SshConfig>(),
  }),
  deleteMachine: procedure({
    input: z.object({ id: z.string() }),
    output: z.void(),
  }),
  renameMachine: procedure({
    input: z.object({ id: z.string(), name: z.string() }),
    output: z.void(),
  }),
});
