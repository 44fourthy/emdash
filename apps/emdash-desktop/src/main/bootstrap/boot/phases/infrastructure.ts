import { eq } from 'drizzle-orm';
import { app, powerMonitor } from 'electron';
import type { SshServiceHandle } from '@core/manifests/node/ssh-service-handle';
import { IS_CANARY } from '@core/primitives/app-identity/api/app-identity';
import type { SshService } from '@core/primitives/ssh/api';
import type { AppDb } from '@core/services/app-db/node/db';
import { sshConnections } from '@core/services/app-db/node/schema';
import { createHosts, type Hosts } from '@core/services/hosts/node/hosts';
import { sshCredentialChanges } from '@core/services/ssh/node/credentials/credential-record';
import { SshCredentialService } from '@core/services/ssh/node/credentials/ssh-credential-service';
import { createSshService } from '@main/bootstrap/core/ssh-service-factory';
import { getDesktopClientId } from '@main/core/runtime/desktop-client-id';
import { encryptedAppSecretsStore } from '@main/host/secrets/encrypted-app-secrets-store';
import { log } from '@main/lib/logger';
import { telemetryService } from '@main/lib/telemetry';
import { appScope } from '../../core/app-scope';
import type { DatabaseBundle } from './database';

export type InfrastructureBundle = {
  readonly ssh: SshServiceHandle;
  readonly hosts: Hosts;
};

export async function bootInfrastructure(database: DatabaseBundle): Promise<InfrastructureBundle> {
  const ssh = createSshService({
    scope: appScope,
    db: database.db,
    credentials: new SshCredentialService(encryptedAppSecretsStore),
    prepareCredentials: (id, credentials) =>
      encryptedAppSecretsStore.prepareChanges(sshCredentialChanges(id, credentials)),
    logger: log,
    telemetry: telemetryService,
  });
  const hostSettings = await database.appSettings.get('remoteMachine');
  const clientId = await getDesktopClientId();
  const hosts = createHosts({
    scope: appScope,
    ssh: { manager: ssh.manager, control: ssh.control },
    machineEvents: ssh.machines,
    installBaseUrl: hostSettings.installBaseUrl,
    releaseChannel: IS_CANARY ? 'canary' : 'stable',
    devAutoUpdate: process.env['EMDASH_WORKSPACE_SERVER_DEV_AUTO_UPDATE'] === '1',
    client: { id: clientId, appVersion: app.getVersion() },
    logger: log,
  });
  ssh.bindLifecycle(hosts.lifecycle);
  const resume = () => hosts.wake('resume');
  const suspend = () => hosts.wake('suspend');
  powerMonitor.on('resume', resume);
  powerMonitor.on('suspend', suspend);
  appScope.add(() => {
    powerMonitor.off('resume', resume);
    powerMonitor.off('suspend', suspend);
  });
  void reconnectIntendedSshConnections(database.db, ssh.ssh, hosts);
  return { ssh, hosts };
}

async function reconnectIntendedSshConnections(
  db: AppDb,
  ssh: SshService,
  hosts: Pick<Hosts, 'lifecycle' | 'wake'>
): Promise<void> {
  try {
    const rows = await db
      .select({ id: sshConnections.id })
      .from(sshConnections)
      .where(eq(sshConnections.shouldConnect, 1));

    await Promise.all(
      rows.map(async ({ id }) => {
        try {
          await ssh.ensureConnected(id);
          // Creates the host entry as well as ensuring SSH. Entries are built
          // lazily, and wake() below only reaches ones that already exist.
          await hosts.lifecycle.ensureConnected(id);
        } catch (error) {
          log.warn('Failed to reconnect intended SSH connection', {
            connectionId: id,
            error: String(error),
          });
        }
      })
    );

    // Bring the intended hosts up, not merely reachable. Without this a host
    // stays idle until a project attaches or the user connects by hand, and
    // anything that asks for its runtime without waiting — the clone flow, for
    // one — fails as "Host runtime is not currently usable". Each host still
    // answers to its own shouldConnect intent.
    hosts.wake('online');
  } catch (error) {
    log.warn('Failed to load intended SSH connections', { error: String(error) });
  }
}
