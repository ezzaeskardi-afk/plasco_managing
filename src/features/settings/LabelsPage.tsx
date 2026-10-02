import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/misc';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Section } from '@/components/common/Kpi';
import {
  createBrand,
  createCategory,
  createLocation,
  listBrands,
  listCategories,
  listLocations,
  restore,
  softDelete,
} from '@/db/repos';
import { formatQty } from '@/domain/format';
import { fa } from '@/i18n/fa';
import { toastUndo } from '@/lib/toast';

type Kind = 'brands' | 'categories' | 'locations';

const META: Record<Kind, { title: string; add: string; placeholder: string }> = {
  brands: { title: fa.settings.brands, add: fa.settings.newBrand, placeholder: 'مثلاً بازن' },
  categories: { title: fa.settings.categories, add: fa.settings.newCategory, placeholder: 'مثلاً ظروف' },
  locations: { title: fa.settings.locations, add: fa.settings.newLocation, placeholder: 'مثلاً انبار' },
};

export function LabelsPage() {
  const brands = useLiveQuery(() => listBrands(), []);
  const categories = useLiveQuery(() => listCategories(), []);
  const locations = useLiveQuery(() => listLocations(), []);
  const [open, setOpen] = useState<Kind | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const data: Record<Kind, Array<{ id: string; name: string }>> = {
    brands: brands ?? [],
    categories: categories ?? [],
    locations: locations ?? [],
  };

  const save = async () => {
    if (!open || !name.trim()) return;
    setBusy(true);
    try {
      if (open === 'brands') await createBrand({ name });
      else if (open === 'categories') await createCategory({ name });
      else await createLocation({ name });
      setOpen(null);
      setName('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[720px] pb-10">
      {(Object.keys(META) as Kind[]).map((kind) => (
        <Section
          key={kind}
          title={META[kind].title}
          action={
            <Button size="sm" variant="secondary" onClick={() => setOpen(kind)}>
              <Plus className="size-4" />
              {fa.actions.add}
            </Button>
          }
        >
          {data[kind].length === 0 ? (
            <EmptyState message={kind === 'brands' ? fa.empty.brands : kind === 'categories' ? fa.empty.categories : fa.empty.locations} />
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-input border border-line bg-paper">
              {data[kind].map((item) => (
                <li key={item.id} className="flex min-h-14 items-center gap-3 px-3">
                  <span className="min-w-0 flex-1 truncate text-ink">{item.name}</span>
                  <button
                    type="button"
                    aria-label={fa.actions.delete}
                    onClick={() => {
                      void softDelete(kind, item.id).then(() => {
                        toastUndo(fa.settings.removeConfirm, async () => {
                          await restore(kind, item.id);
                        });
                      });
                    }}
                    className="flex size-10 items-center justify-center rounded-input text-crate"
                  >
                    <Trash2 className="size-5 text-out" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      ))}

      <p className="text-[0.9rem] text-crate">
        {formatQty((brands ?? []).length + (categories ?? []).length + (locations ?? []).length)}{' '}
        {fa.common.total}
      </p>

      <Sheet open={open != null} onOpenChange={(value) => (value ? null : setOpen(null))}>
        <SheetContent title={open ? META[open].add : ''}>
          <Label htmlFor="label-name">{fa.common.name}</Label>
          <Input
            id="label-name"
            autoFocus
            value={name}
            placeholder={open ? META[open].placeholder : ''}
            onChange={(event) => setName(event.target.value)}
          />
          <div className="mt-4 flex gap-2">
            <Button block disabled={busy || !name.trim()} onClick={() => void save()}>
              {fa.actions.save}
            </Button>
            <Button variant="secondary" onClick={() => setOpen(null)}>
              {fa.actions.cancel}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
