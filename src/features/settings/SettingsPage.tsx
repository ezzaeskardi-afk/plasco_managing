import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Copy, Database, Lock, LockOpen, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Panel, Section } from '@/components/common/Kpi';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Segmented, Switch } from '@/components/ui/misc';
import { ensureDefaults } from '@/db/dexie';
import { wipeAll } from '@/db/seed';
import { countProducts } from '@/db/repos';
import { formatQty } from '@/domain/format';
import { fa } from '@/i18n/fa';
import { toastError, toastSuccess } from '@/lib/toast';
import { APP_VERSION, SCHEMA_VERSION } from '@/app/version';
import { useSettings } from '@/app/settings-context';
import { clearErrors, errorsAsText, readErrors } from '@/app/errorLog';

export function SettingsPage() {
  const { settings, update, costVisible, unlock, lock, setPin, disableCostLock } = useSettings();
  const [pinDraft, setPinDraft] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [unlockPin, setUnlockPin] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const products = useLiveQuery(() => countProducts(), []);
  const errorCount = readErrors().length;

  const copyLog = async () => {
    try {
      await navigator.clipboard.writeText(errorsAsText() || '—');
      toastSuccess(fa.actions.copied);
    } catch {
      toastError(fa.errors.title);
    }
  };

  return (
    <div className="mx-auto max-w-[720px] pb-10">
      <Section title={fa.settings.shop}>
        <Panel>
          <Label htmlFor="shopName">{fa.settings.shopName}</Label>
          <Input
            id="shopName"
            value={settings.shopName}
            onChange={(event) => void update({ shopName: event.target.value })}
          />
          <Label htmlFor="currencyLabel" className="mt-4">
            {fa.settings.currencyLabel}
          </Label>
          <Input
            id="currencyLabel"
            value={settings.currencyLabel}
            onChange={(event) => void update({ currencyLabel: event.target.value })}
          />
          <Label htmlFor="deviceName" className="mt-4">
            {fa.settings.deviceName}
          </Label>
          <Input
            id="deviceName"
            value={settings.deviceName}
            onChange={(event) => void update({ deviceName: event.target.value })}
          />
          <Label htmlFor="devicePrefix" className="mt-4">
            {fa.settings.devicePrefix}
          </Label>
          <Input
            id="devicePrefix"
            dir="ltr"
            className="text-start"
            value={settings.devicePrefix}
            onChange={(event) => void update({ devicePrefix: event.target.value.toUpperCase() })}
          />
        </Panel>
      </Section>

      <Section title={fa.settings.appearance}>
        <Panel>
          <Label>{fa.settings.theme}</Label>
          <Segmented
            ariaLabel={fa.settings.theme}
            value={settings.theme}
            onChange={(value) => void update({ theme: value })}
            options={[
              { value: 'system', label: fa.common.system },
              { value: 'light', label: fa.common.light },
              { value: 'dark', label: fa.common.dark },
            ]}
          />
          <Label className="mt-4">{fa.settings.textScale}</Label>
          <Segmented
            ariaLabel={fa.settings.textScale}
            value={String(settings.textScale)}
            onChange={(value) => void update({ textScale: Number(value) })}
            options={[
              { value: '1', label: fa.settings.textScaleNormal },
              { value: '1.15', label: fa.settings.textScaleLarge },
              { value: '1.3', label: fa.settings.textScaleXL },
            ]}
          />
        </Panel>
      </Section>

      <Section title={fa.settings.privacy}>
        <Panel>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-ink">{fa.settings.costLock}</p>
              <p className="text-[0.8rem] text-crate">{fa.settings.costLockHint}</p>
            </div>
            <Switch
              checked={settings.costLockEnabled}
              onCheckedChange={(value) => {
                if (!value) void disableCostLock();
              }}
              label={fa.settings.costLock}
            />
          </div>

          {settings.costLockEnabled ? (
            <div className="mt-4 border-t border-line pt-4">
              {costVisible ? (
                <Button variant="secondary" size="sm" onClick={lock}>
                  <Lock className="size-4" />
                  {fa.settings.lock}
                </Button>
              ) : (
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label htmlFor="unlockPin">{fa.settings.pinEnter}</Label>
                    <Input
                      id="unlockPin"
                      type="password"
                      inputMode="numeric"
                      value={unlockPin}
                      onChange={(event) => setUnlockPin(event.target.value)}
                    />
                  </div>
                  <Button
                    onClick={() => {
                      void unlock(unlockPin).then((ok) => {
                        setMessage(ok ? null : fa.settings.pinWrong);
                        if (ok) setUnlockPin('');
                      });
                    }}
                  >
                    <LockOpen className="size-4" />
                    {fa.settings.unlock}
                  </Button>
                </div>
              )}
              {message ? <p className="mt-2 text-[0.8rem] text-out">{message}</p> : null}
            </div>
          ) : (
            <div className="mt-4 border-t border-line pt-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Label htmlFor="pin">{fa.settings.pinSet}</Label>
                  <Input
                    id="pin"
                    type="password"
                    inputMode="numeric"
                    value={pinDraft}
                    onChange={(event) => setPinDraft(event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="pin2">{fa.settings.pinChange}</Label>
                  <Input
                    id="pin2"
                    type="password"
                    inputMode="numeric"
                    value={pinConfirm}
                    onChange={(event) => setPinConfirm(event.target.value)}
                  />
                </div>
              </div>
              <Button
                className="mt-3"
                variant="secondary"
                disabled={pinDraft.length < 4 || pinDraft !== pinConfirm}
                onClick={() => {
                  void setPin(pinDraft).then(() => {
                    setPinDraft('');
                    setPinConfirm('');
                    toastSuccess(fa.settings.pinSet);
                  });
                }}
              >
                <Lock className="size-4" />
                {fa.settings.pinSet}
              </Button>
            </div>
          )}
        </Panel>
      </Section>

      <Section title={fa.settings.data}>
        <Panel>
          <p className="mb-3 text-crate">
            {formatQty(products ?? 0)} کالا · {fa.settings.version} {APP_VERSION} · schema{' '}
            {SCHEMA_VERSION}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => void copyLog()}>
              <Copy className="size-4" />
              {fa.settings.copyErrors}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={errorCount === 0}
              onClick={() => {
                clearErrors();
                toastSuccess(fa.actions.clear);
              }}
            >
              <AlertTriangle className="size-4" />
              {fa.settings.errorLog} ({formatQty(errorCount)})
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                window.location.hash = '#/more/data';
              }}
            >
              <Database className="size-4" />
              {fa.importexport.title}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (!window.confirm(fa.settings.resetConfirm)) return;
                void wipeAll()
                  .then(() => ensureDefaults())
                  .then(() => window.location.reload())
                  .catch((error: unknown) => {
                    toastError(fa.errors.title, error instanceof Error ? error.message : undefined);
                  });
              }}
            >
              <Trash2 className="size-4 text-out" />
              {fa.settings.resetData}
            </Button>
          </div>
        </Panel>
      </Section>
    </div>
  );
}
