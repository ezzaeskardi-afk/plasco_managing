import {
  ChevronLeft,
  ClipboardList,
  Database,
  Download,
  HardDrive,
  Settings as SettingsIcon,
  ShieldCheck,
  Smartphone,
  Tag,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/common/Kpi';
import { createBackup } from '@/db/backup';
import { listBrands, listCategories, listLocations, listProducts } from '@/db/repos';
import { formatQty, formatJalali } from '@/domain/format';
import { fa } from '@/i18n/fa';
import { toastError, toastSuccess } from '@/lib/toast';
import { APP_VERSION } from '@/app/version';
import {
  canInstall,
  isInstallableOrigin,
  isIosDevice,
  isIosSafari,
  isStandalone,
  onInstallChange,
  promptInstall,
} from '@/app/install';
import { readPersistState, requestPersist, type PersistState } from '@/app/persistStorage';
import { useSettings } from '@/app/settings-context';
import { saveBlob } from '@/features/importexport/spreadsheet';

function Row({
  label,
  hint,
  icon: Icon,
  onClick,
}: {
  label: string;
  hint?: string;
  icon: typeof Tag;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-16 w-full items-center gap-3 border-b border-line px-3 text-start last:border-b-0"
    >
      <Icon className="size-5 shrink-0 text-basin" />
      <span className="min-w-0 flex-1">
        <span className="block text-ink">{label}</span>
        {hint ? <span className="block text-[0.8rem] text-crate">{hint}</span> : null}
      </span>
      <ChevronLeft className="size-4 shrink-0 text-crate" />
    </button>
  );
}

export function MorePage() {
  const navigate = useNavigate();
  const { settings, update } = useSettings();
  const brands = useLiveQuery(() => listBrands(), []);
  const categories = useLiveQuery(() => listCategories(), []);
  const locations = useLiveQuery(() => listLocations(), []);
  const products = useLiveQuery(() => listProducts(), []);
  const [canInstallNow, setCanInstallNow] = useState(canInstall());
  const [installed, setInstalled] = useState(isStandalone());
  const [persistState, setPersistState] = useState<PersistState | null>(null);

  useEffect(() => {
    void readPersistState().then(setPersistState);
  }, []);

  const askPersist = async () => {
    const state = await requestPersist();
    setPersistState(state);
    if (state === 'granted') toastSuccess(fa.settings.persistDone);
  };

  useEffect(() => {
    const off = onInstallChange(() => setCanInstallNow(canInstall()));
    const onInstalled = () => setInstalled(true);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      off();
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (await promptInstall()) toastSuccess(fa.settings.installDone);
    setCanInstallNow(canInstall());
  };

  return (
    <div className="mx-auto max-w-[720px] pb-10">
      <Panel className="mb-4 p-0">
        <Row
          label={fa.settings.labels}
          hint={`${formatQty((brands ?? []).length)} ${fa.settings.brands} · ${formatQty((categories ?? []).length)} ${fa.settings.categories} · ${formatQty((locations ?? []).length)} ${fa.settings.locations}`}
          icon={Tag}
          onClick={() => navigate('/more/labels')}
        />
        <Row
          label={fa.importexport.title}
          hint={fa.importexport.backupHint}
          icon={Database}
          onClick={() => navigate('/more/data')}
        />
        <Row
          label={fa.stocktake.title}
          hint={fa.stocktake.start}
          icon={ClipboardList}
          onClick={() => navigate('/stocktake')}
        />
        <Row
          label={fa.settings.title}
          hint={settings.shopName}
          icon={SettingsIcon}
          onClick={() => navigate('/more/settings')}
        />
      </Panel>

      <Panel className="mb-4">
        <p className="mb-2 text-[0.9rem] text-crate">{fa.settings.storage}</p>

        <p className="text-[0.9rem] text-crate">{fa.settings.dataDurability}</p>
        {persistState ? (
          <p
            className={`mb-3 text-[0.9rem] ${
              persistState === 'granted' ? 'text-ok' : persistState === 'best-effort' ? 'text-low' : 'text-crate'
            }`}
          >
            {persistState === 'granted'
              ? fa.settings.persistGranted
              : persistState === 'best-effort'
                ? fa.settings.persistBestEffort
                : fa.settings.persistUnsupported}
          </p>
        ) : null}
        {persistState === 'best-effort' ? (
          <Button size="sm" variant="secondary" className="mb-3" onClick={() => void askPersist()}>
            <ShieldCheck className="size-4" />
            {fa.settings.persist}
          </Button>
        ) : null}
        {persistState === 'granted' ? null : (
          <p className="mb-3 text-[0.8rem] text-crate">{fa.settings.persistHint}</p>
        )}

        <p className="mb-3 text-ink">
          {formatQty((products ?? []).length)} کالا · {fa.importexport.lastBackup}:{' '}
          {settings.lastBackupAt ? formatJalali(settings.lastBackupAt) : fa.importexport.never}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => {
              void createBackup()
                .then(async ({ blob }) => {
                  await saveBlob(blob, `plasco-backup-${new Date().toISOString().slice(0, 10)}.zip`);
                  await update({ lastBackupAt: Date.now() });
                  toastSuccess(fa.importexport.backupCreate);
                })
                .catch((error: unknown) => {
                  toastError(fa.errors.backupFailed, error instanceof Error ? error.message : undefined);
                });
            }}
          >
            <Download className="size-4" />
            {fa.importexport.backupCreate}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => navigate('/more/data')}>
            <HardDrive className="size-4" />
            {fa.importexport.title}
          </Button>
        </div>
      </Panel>

      <Panel>
        <p className="flex items-center gap-2 text-crate">
          <Smartphone className="size-5" />
          {fa.settings.installGuide}
        </p>

        {installed ? (
          <p className="mt-2 text-[0.9rem] text-ok">{fa.settings.installInstalled}</p>
        ) : isIosDevice() ? (
          <div className="mt-2 space-y-1 text-[0.9rem] text-ink">
            <p className="font-bold">{fa.settings.installIosTitle}</p>
            <p>{isIosSafari() ? fa.settings.installIosBody : fa.settings.installIosNotSafari}</p>
            <p className="text-[0.8rem] text-crate">{fa.settings.installIosHint}</p>
          </div>
        ) : (
          <div className="mt-2 space-y-2 text-[0.9rem] text-ink">
            <p className="font-bold">{fa.settings.installAndroidTitle}</p>
            <p>
              {canInstallNow ? fa.settings.installAndroidReady : fa.settings.installAndroidBody}
            </p>
            {canInstallNow ? (
              <Button size="sm" onClick={() => void install()}>
                <Download className="size-4" />
                {fa.settings.installButton}
              </Button>
            ) : null}
          </div>
        )}

        <p className="mt-3 text-[0.8rem] text-crate">{fa.settings.installOfflineHint}</p>
        <p className="mt-1 text-[0.8rem] text-crate">{fa.settings.installDataNote}</p>
        {isInstallableOrigin() ? null : (
          <>
            <p className="mt-1 text-[0.8rem] text-out">{fa.settings.installNeedsHttps}</p>
            <p className="mt-1 text-[0.8rem] text-out">{fa.settings.installSameWifi}</p>
          </>
        )}
        <p className="mt-3 text-[0.8rem] text-crate">
          {fa.settings.version} {APP_VERSION}
        </p>
      </Panel>
    </div>
  );
}
