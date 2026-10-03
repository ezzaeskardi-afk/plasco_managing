import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/common/Kpi';
import {
  isBackupStale,
  readCacheStatus,
  readServiceWorkerStatus,
  readStorageUsage,
  type CacheStatus,
  type ServiceWorkerStatus,
  type StorageUsage,
} from '@/app/appStatus';
import { canInstall, isInstallableOrigin, isIosDevice, isStandalone, onInstallChange } from '@/app/install';
import { applyWaitingUpdate } from '@/app/updateStore';
import { APP_VERSION, SCHEMA_VERSION } from '@/app/version';
import { useSettings } from '@/app/settings-context';
import { formatJalali, formatQty } from '@/domain/format';
import { fa } from '@/i18n/fa';
import { cn } from '@/lib/utils';

type Tone = 'ok' | 'low' | 'out';

function Line({
  label,
  value,
  hint,
  tone,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-line px-3 py-3 last:border-b-0">
      <p className="text-[0.9rem] text-crate">{label}</p>
      <p
        className={cn(
          'font-bold',
          tone === 'ok' ? 'text-ok' : tone === 'low' ? 'text-low' : tone === 'out' ? 'text-out' : 'text-ink',
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-[0.8rem] text-crate">{hint}</p> : null}
      {children}
    </div>
  );
}

/** Plain-language state of the service worker (AGENTS.md: no jargon in the UI). */
function workerLine(status: ServiceWorkerStatus): { value: string; hint?: string; tone?: Tone } {
  switch (status.state) {
    case 'preview':
      return { value: fa.status.swPreview, hint: fa.status.swPreviewHint };
    case 'unsupported':
      return { value: fa.status.swUnsupported, tone: 'low' };
    case 'none':
      return { value: fa.status.swNone, hint: fa.status.swNoneHint, tone: 'low' };
    case 'installing':
      return { value: fa.status.swInstalling, tone: 'low' };
    case 'waiting':
      return { value: fa.status.swWaiting, hint: fa.status.swWaitingHint, tone: 'low' };
    default:
      return {
        value: fa.status.swActive,
        hint: status.controlling ? fa.status.swControlling : fa.status.swNotControlling,
        tone: 'ok',
      };
  }
}

export function StatusPage() {
  const { settings } = useSettings();
  const [worker, setWorker] = useState<ServiceWorkerStatus | null>(null);
  const [cache, setCache] = useState<CacheStatus | null>(null);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [installed, setInstalled] = useState(isStandalone());
  const [installable, setInstallable] = useState(canInstall());

  const refresh = useCallback(async () => {
    const [nextWorker, nextCache, nextUsage] = await Promise.all([
      readServiceWorkerStatus(),
      readCacheStatus(),
      readStorageUsage(),
    ]);
    setWorker(nextWorker);
    setCache(nextCache);
    setUsage(nextUsage);
    setInstalled(isStandalone());
    setInstallable(canInstall());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const off = onInstallChange(() => setInstallable(canInstall()));
    const onInstalled = () => setInstalled(true);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      off();
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const backupStale = isBackupStale(settings.lastBackupAt);
  const workerInfo = worker ? workerLine(worker) : null;
  const installInfo = (() => {
    if (!isInstallableOrigin()) return { value: fa.settings.installNeedsHttps, tone: 'out' as Tone };
    if (installed) return { value: fa.settings.installInstalled, hint: fa.status.installStandaloneHint, tone: 'ok' as Tone };
    if (installable) return { value: fa.status.installAvailable, hint: fa.status.installAvailableHint, tone: 'low' as Tone };
    if (isIosDevice()) return { value: fa.status.installIos, hint: fa.settings.installIosHint, tone: 'low' as Tone };
    return { value: fa.status.installUnavailable, hint: fa.settings.installAndroidBody, tone: undefined };
  })();

  return (
    <div className="mx-auto max-w-[720px] pb-10">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[0.8rem] text-crate">{fa.status.readOnlyNote}</p>
        <Button size="sm" variant="secondary" onClick={() => void refresh()}>
          <RefreshCw className="size-4" />
          {fa.status.refresh}
        </Button>
      </div>

      <Panel className="mb-4 p-0">
        <Line label={fa.settings.version} value={APP_VERSION} hint={`${fa.status.schema} ${formatQty(SCHEMA_VERSION)}`} />
        <Line
          label={fa.settings.deviceName}
          value={settings.deviceName || fa.common.unknown}
          hint={`${fa.settings.devicePrefix}: ${settings.devicePrefix || '—'}`}
        />
      </Panel>

      <Panel className="mb-4 p-0">
        <Line label={fa.status.serviceWorker} value={workerInfo?.value ?? fa.common.loading} hint={workerInfo?.hint} tone={workerInfo?.tone}>
          {worker?.state === 'waiting' ? (
            <Button
              size="sm"
              className="mt-2"
              onClick={() => {
                if (!applyWaitingUpdate()) void refresh();
              }}
            >
              {fa.status.applyUpdate}
            </Button>
          ) : null}
        </Line>
        <Line
          label={fa.status.cache}
          value={
            cache && cache.entries > 0
              ? fa.status.cacheLine
                  .replace('{entries}', formatQty(cache.entries))
                  .replace('{buckets}', formatQty(cache.buckets))
              : fa.status.cacheEmpty
          }
          hint={cache && cache.names.length > 0 ? cache.names.join(' · ') : undefined}
          tone={cache && cache.entries > 0 ? 'ok' : 'low'}
        />
        <Line
          label={fa.settings.storage}
          value={
            usage
              ? fa.status.storageLine
                  .replace('{used}', formatQty(Math.round(usage.used / 1024 / 1024)))
                  .replace('{quota}', formatQty(Math.round(usage.quota / 1024 / 1024)))
              : fa.common.unknown
          }
          hint={fa.status.storageHint}
        />
      </Panel>

      <Panel className="p-0">
        <Line
          label={fa.importexport.lastBackup}
          value={settings.lastBackupAt ? formatJalali(settings.lastBackupAt) : fa.importexport.never}
          hint={backupStale ? fa.status.backupStale : fa.status.backupFresh}
          tone={backupStale ? 'low' : 'ok'}
        />
        <Line label={fa.status.install} value={installInfo.value} hint={installInfo.hint} tone={installInfo.tone} />
      </Panel>
    </div>
  );
}
