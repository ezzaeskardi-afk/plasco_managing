import { useState } from 'react';
import { NumberField } from '@/components/common/NumberField';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { updateProduct } from '@/db/repos';
import type { Product } from '@/db/types';
import { formatNumber } from '@/domain/format';
import { parseIntegerInput } from '@/domain/numbers';
import { fa } from '@/i18n/fa';
import { toastError, toastUndo } from '@/lib/toast';
import { useSettings } from '@/app/settings-context';

/**
 * Prices change far more often than anything else in the shop, so they get their own
 * sheet instead of the full product form. Every save lands in the price history and
 * comes with Undo (AGENTS.md rule 13).
 *
 * Mount it with `key={product.id}` so switching rows never keeps a stale draft.
 */
export function PriceEditSheet({ product, onClose }: { product: Product; onClose: () => void }) {
  const { costVisible, settings } = useSettings();
  const [buy, setBuy] = useState(formatNumber(product.buyPrice));
  const [retail, setRetail] = useState(formatNumber(product.retailPrice));
  const [wholesale, setWholesale] = useState(
    product.wholesalePrice != null ? formatNumber(product.wholesalePrice) : '',
  );
  const [saving, setSaving] = useState(false);
  const currency = settings.currencyLabel.trim() || 'تومان';
  const moneySuffix = <span className="text-[0.8rem]">{currency}</span>;

  const save = async () => {
    const nextBuy = parseIntegerInput(buy);
    const nextRetail = parseIntegerInput(retail);
    const nextWholesale =
      (wholesale.trim() === '' ? undefined : parseIntegerInput(wholesale)) ?? undefined;
    const invalid =
      nextBuy == null ||
      nextRetail == null ||
      nextBuy < 0 ||
      nextRetail < 0 ||
      (nextWholesale != null && nextWholesale < 0);
    if (invalid) {
      toastError(fa.stock.enterQty);
      return;
    }

    setSaving(true);
    try {
      const before = {
        buyPrice: product.buyPrice,
        retailPrice: product.retailPrice,
        wholesalePrice: product.wholesalePrice,
      };
      await updateProduct(
        product.id,
        { buyPrice: nextBuy, retailPrice: nextRetail, wholesalePrice: nextWholesale },
        { reason: fa.products.priceReasonQuick },
      );
      toastUndo(fa.products.pricesSaved, () =>
        updateProduct(product.id, before, { reason: fa.products.priceReasonUndo }),
      );
      onClose();
    } catch (error) {
      toastError(fa.errors.title, error instanceof Error ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent title={fa.products.priceEdit}>
        <p className="mb-4 truncate text-[0.9rem] text-crate">{product.name}</p>

        {/* With the cost lock on, the sheet edits retail/wholesale only; the
            hidden buy value is resubmitted unchanged so nothing is lost. */}
        {costVisible ? (
          <NumberField
            id="quick-buy"
            label={fa.products.buyPrice}
            value={buy}
            onChange={setBuy}
            group
            suffix={moneySuffix}
          />
        ) : null}
        <NumberField
          id="quick-retail"
          label={fa.products.retailPrice}
          value={retail}
          onChange={setRetail}
          group
          suffix={moneySuffix}
        />
        <NumberField
          id="quick-wholesale"
          label={fa.products.wholesalePrice}
          value={wholesale}
          onChange={setWholesale}
          group
          suffix={moneySuffix}
          hint={fa.common.optional}
        />

        <p className="mb-4 text-[0.8rem] text-crate">{fa.products.priceEditHint}</p>

        <div className="flex gap-2">
          <Button block disabled={saving} onClick={() => void save()}>
            {fa.actions.save}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {fa.actions.cancel}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
