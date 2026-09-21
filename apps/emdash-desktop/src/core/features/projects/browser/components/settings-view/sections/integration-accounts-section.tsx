import { Field, Select, Separator } from '@emdash/ui/react/primitives';
import { Plus } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import type { ReactNode } from 'react';
import { hostAccountLockForProject } from '@core/features/integrations/api/browser/use-host-account-lock';
import { useAccounts } from '@core/features/integrations/api/browser/use-provider-accounts';
import { IntegrationIcon } from '@core/features/integrations/contributions/browser/integration-icon';
import { useIntegrationsContext } from '@core/features/integrations/contributions/browser/integrations-provider';
import {
  ProvenanceBadge,
  ResetProvenanceButton,
} from '@core/features/projects/contributions/browser/settings-provenance';
import { useOpenModal } from '@core/manifests/browser/modal-api';
import {
  resolveProviderAccount,
  type Resolved,
  type StoredIntegrationAccount,
} from '@core/primitives/project-settings/api';
import {
  providerAccountHostMatching,
  resolveHostLockedAccount,
} from '@core/primitives/project-settings/api/resolve-provider-account';
import {
  sortProviderAccountsByDefault,
  type ProviderAccountSummary,
} from '@core/primitives/provider-accounts/api';
import { ProviderAccountLabel } from '@core/primitives/provider-accounts/browser/account-label';
import { cn } from '@core/primitives/styling/browser/cn';
import type { FormUpdate, IntegrationAccountsFormState } from '../project-settings-form-model';

/** File-local Select option encodings; never stored or exported. */
const NO_ACCOUNT_OPTION = '__no_provider_account__';
const CONNECT_OPTION = '__connect_provider_account__';

/** One account-selection row per integration, using the same host policy as issue execution. */
export const IntegrationAccountsSection = observer(function IntegrationAccountsSection({
  projectId,
  integrationAccountsForm,
  updateIntegrationAccounts,
  repositoryHost,
}: {
  projectId: string;
  integrationAccountsForm: IntegrationAccountsFormState;
  updateIntegrationAccounts: FormUpdate<IntegrationAccountsFormState>;
  /** Effective base-remote host; undefined while repository facts are loading. */
  repositoryHost: string | null | undefined;
}) {
  const { integrations } = useIntegrationsContext();
  const accountsQuery = useAccounts();
  const integrationAccounts = accountsQuery.data;
  const openIntegrationSetup = useOpenModal('integrationSetupModal');

  // The machine's account is a GitHub setting, so it is resolved against the
  // GitHub inventory; `resolveProjectAccount` applies it to no other provider.
  const hostAccountLock = hostAccountLockForProject(
    projectId,
    integrationAccounts?.['github'] ?? []
  );

  const integrationRows = integrations
    .map((integration) => {
      const accounts = sortProviderAccountsByDefault(integrationAccounts?.[integration.id] ?? []);
      const override = integrationAccountsForm[integration.id] ?? undefined;
      const repositoryScoped = integration.issueCapabilities.requiresRepositoryUrl;
      const ready = integrationAccounts && (!repositoryScoped || repositoryHost !== undefined);
      const lock = hostAccountLock?.providerId === integration.id ? hostAccountLock : undefined;
      return {
        integration,
        accounts,
        override,
        lock,
        resolution: ready
          ? lock
            ? resolveHostLockedAccount(accounts, lock)
            : resolveProviderAccount(
                override,
                accounts,
                repositoryScoped ? providerAccountHostMatching(repositoryHost ?? null) : undefined
              )
          : null,
      };
    })
    .filter(({ accounts, override }) => accounts.length > 0 || override !== undefined);

  if (integrationRows.length === 0) return null;

  const anyLocked = integrationRows.some(({ lock }) => lock !== undefined);

  return (
    <>
      <Field.Root>
        <Field.Label>Accounts</Field.Label>
        <Field.Description className="text-foreground-muted">
          {anyLocked
            ? 'This project runs on a machine, so its git authenticates with that machine’s own credentials. The account below is the one set for that machine and is used for every project on it.'
            : 'Choose which account each integration uses for this project.'}
        </Field.Description>
        <div className="flex flex-col">
          {integrationRows.map(({ integration, accounts, override, lock, resolution }) => (
            <ProviderAccountRow
              key={integration.id}
              name={integration.name}
              accounts={accounts}
              resolution={resolution}
              override={override}
              locked={lock !== undefined}
              pinnedLogin={lock?.pinnedLogin}
              fallbackIcon={<IntegrationIcon provider={integration.id} icon={integration.icon} />}
              loadError={accountsQuery.isError}
              onOverrideChange={(value) => updateIntegrationAccounts(integration.id, value)}
              onConnect={() => void openIntegrationSetup({ integration: integration.id })}
              unresolvableHint={
                integration.issueCapabilities.requiresRepositoryUrl
                  ? `The ${integration.name} account set for this project is no longer connected or does not match this repository's host. ${integration.name} stays paused until you pick an account or reset.`
                  : undefined
              }
            />
          ))}
        </div>
      </Field.Root>
      <Separator />
    </>
  );
});

const ProviderAccountRow = observer(function ProviderAccountRow({
  name,
  accounts,
  resolution,
  override,
  locked = false,
  pinnedLogin,
  onOverrideChange,
  onConnect,
  unresolvableHint,
  loadError,
  fallbackIcon,
}: {
  name: string;
  accounts: ProviderAccountSummary[];
  /** Effective account over the pending form state. */
  resolution: Resolved<ProviderAccountSummary | null> | null;
  loadError?: boolean;
  fallbackIcon?: ReactNode;
  override: StoredIntegrationAccount | undefined;
  /** The project's machine claims this account; the row is read-only. */
  locked?: boolean;
  /** Set when this fork pins the machine to a specific identity in code. */
  pinnedLogin?: string;
  onOverrideChange: (value: StoredIntegrationAccount | null) => void;
  onConnect: () => void;
  unresolvableHint?: string;
}) {
  const unresolvable = resolution?.provenance.kind === 'unresolvable';
  const isExplicit = override !== undefined && !locked;

  const selectValue = unresolvable
    ? ''
    : override === undefined
      ? ''
      : override.kind === 'none'
        ? NO_ACCOUNT_OPTION
        : override.accountId;

  return (
    <div className="flex flex-col">
      <div className="flex min-h-9 items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-foreground">{name}</span>
          {resolution ? <ProvenanceBadge provenance={resolution.provenance} /> : null}
          {resolution && isExplicit ? (
            <ResetProvenanceButton onReset={() => onOverrideChange(null)} />
          ) : null}
        </div>
        {locked ? (
          <div
            className={cn(
              'min-w-0 shrink-0 truncate text-left',
              !resolution?.value && 'text-foreground-warning'
            )}
            style={{ width: '18rem', maxWidth: '65%' }}
          >
            {resolution === null ? (
              <span className="text-foreground-muted">Loading accounts…</span>
            ) : resolution.value ? (
              <ProviderAccountLabel account={resolution.value} fallbackIcon={fallbackIcon} />
            ) : unresolvable ? (
              <span>Unavailable {name} account</span>
            ) : (
              <span>No {name} account set for this machine</span>
            )}
          </div>
        ) : (
          <Select.Root
            value={selectValue}
            disabled={resolution === null}
            onValueChange={(value) => {
              if (!value) return;
              if (value === CONNECT_OPTION) {
                onConnect();
                return;
              }
              onOverrideChange(
                value === NO_ACCOUNT_OPTION
                  ? { kind: 'none' }
                  : { kind: 'account', accountId: value }
              );
            }}
          >
            <Select.Trigger
              className={cn(
                'min-w-0 shrink-0 text-left',
                unresolvable && 'text-foreground-warning'
              )}
              style={{ width: '18rem', maxWidth: '65%' }}
            >
              {resolution?.value ? (
                <ProviderAccountLabel account={resolution.value} fallbackIcon={fallbackIcon} />
              ) : (
                <span className="min-w-0 flex-1 truncate text-left">
                  {resolution === null
                    ? loadError
                      ? 'Unable to load accounts'
                      : 'Loading accounts…'
                    : unresolvable
                      ? `Unavailable ${name} account`
                      : `No ${name} account`}
                </span>
              )}
            </Select.Trigger>
            <Select.Content width="trigger" align="end" alignItemWithTrigger={false} sideOffset={6}>
              <>
                {accounts.map((account) => (
                  <Select.Item key={account.accountId} value={account.accountId} className="py-2">
                    <ProviderAccountLabel
                      account={account}
                      fallbackIcon={fallbackIcon}
                      showDefaultBadge
                    />
                  </Select.Item>
                ))}
                <Select.Item value={NO_ACCOUNT_OPTION} className="py-2">
                  <span className="relative -top-px shrink-0">No {name} account</span>
                </Select.Item>
                <Select.Separator />
                <Select.Item value={CONNECT_OPTION} className="py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Plus className="text-muted-foreground h-4 w-4 shrink-0" />
                    <span className="relative -top-px shrink-0">Connect another account…</span>
                  </div>
                </Select.Item>
              </>
            </Select.Content>
          </Select.Root>
        )}
      </div>
      {locked && !resolution?.value ? (
        <span className="pb-2 text-xs text-foreground-muted">
          {pinnedLogin
            ? `This machine is pinned to @${pinnedLogin} by account policy, and that account is not connected. Connect it to re-enable ${name} for every project on this machine.`
            : unresolvable
              ? `The account set for this machine is no longer connected. Pick another in Machine settings; ${name} stays paused for every project on it until then.`
              : `Set which ${name} account this machine uses in Machine settings. Until then ${name} stays paused for every project on it.`}
        </span>
      ) : null}
      {!locked && unresolvable ? (
        <span className="pb-2 text-xs text-foreground-muted">
          {unresolvableHint ??
            `The account set for this project is no longer connected. ${name} stays paused until you pick an account or reset.`}
        </span>
      ) : null}
    </div>
  );
});
