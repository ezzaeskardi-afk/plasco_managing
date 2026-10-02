import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, ImagePlus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { NumberField } from '@/components/common/NumberField';
import { QuantityInput } from '@/components/common/QuantityInput';
import { Button } from '@/components/ui/button';
import { Field, Input, Label, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/misc';
import {
  DEFAULT_PACK_LABEL,
  DuplicateCodeError,
  createProduct,
  deletePhoto,
  getProduct,
  listBrands,
  listCategories,
  listLocations,
  putPhoto,
  updateProduct,
} from '@/db/repos';
import { applyMovement } from '@/db/movements';
import type { Brand, Category, Location, Product } from '@/db/types';
import { parseIntegerInput } from '@/domain/numbers';
import { fa } from '@/i18n/fa';
import { toastError, toastSuccess } from '@/lib/toast';
import { fileToPhoto } from './photo';
import { usePhotoUrl } from './photo';

const money = (message: string) =>
  z
    .string()
    .refine((v) => v.trim() === '' || (parseIntegerInput(v) ?? -1) >= 0, { message });

const schema = z.object({
  name: z.string().trim().min(1, 'نام کالا الزامی است.'),
  brandId: z.string(),
  categoryId: z.string(),
  code: z.string(),
  barcodes: z.string(),
  packLabel: z.string(),
  packSize: z.string().refine((v) => (parseIntegerInput(v) ?? 0) >= 1, {
    message: 'تعداد در بسته باید حداقل ۱ باشد.',
  }),
  buyPrice: money('قیمت خرید را درست وارد کنید.'),
  retailPrice: money('قیمت خرده را درست وارد کنید.'),
  wholesalePrice: money('قیمت عمده را درست وارد کنید.'),
  minStock: money('حداقل موجودی را درست وارد کنید.'),
  note: z.string(),
  active: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  name: '',
  brandId: '',
  categoryId: '',
  code: '',
  barcodes: '',
  packLabel: DEFAULT_PACK_LABEL,
  packSize: '1',
  buyPrice: '',
  retailPrice: '',
  wholesalePrice: '',
  minStock: '',
  note: '',
  active: true,
};

function toDraft(values: FormValues) {
  const int = (v: string) => {
    const parsed = parseIntegerInput(v);
    return parsed == null ? undefined : parsed;
  };
  return {
    name: values.name,
    brandId: values.brandId || undefined,
    categoryId: values.categoryId || undefined,
    code: values.code || undefined,
    barcodes: values.barcodes.split('\n').map((b) => b.trim()).filter(Boolean),
    packLabel: values.packLabel || DEFAULT_PACK_LABEL,
    packSize: int(values.packSize) ?? 1,
    buyPrice: int(values.buyPrice) ?? 0,
    retailPrice: int(values.retailPrice) ?? 0,
    wholesalePrice: int(values.wholesalePrice),
    minStock: int(values.minStock),
    note: values.note || undefined,
    active: values.active,
  };
}

function fromProduct(product: Product): FormValues {
  return {
    name: product.name,
    brandId: product.brandId ?? '',
    categoryId: product.categoryId ?? '',
    code: product.code,
    barcodes: product.barcodes.join('\n'),
    packLabel: product.packLabel,
    packSize: String(product.packSize),
    buyPrice: String(product.buyPrice),
    retailPrice: String(product.retailPrice),
    wholesalePrice: product.wholesalePrice != null ? String(product.wholesalePrice) : '',
    minStock: product.minStock != null ? String(product.minStock) : '',
    note: product.note ?? '',
    active: product.active,
  };
}

export function ProductFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [showMore, setShowMore] = useState(false);
  const [openingPieces, setOpeningPieces] = useState(0);
  const [openingLocationId, setOpeningLocationId] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoCleared, setPhotoCleared] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  const packSize = parseIntegerInput(watch('packSize')) ?? 1;
  const packLabel = watch('packLabel') || DEFAULT_PACK_LABEL;
  const existingPhotoUrl = usePhotoUrl(isEdit ? id : undefined, 'thumb');
  const previewUrl = useMemo(
    () => (photoFile ? URL.createObjectURL(photoFile) : undefined),
    [photoFile],
  );
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  useEffect(() => {
    void Promise.all([listBrands(), listCategories(), listLocations()]).then(
      ([b, c, l]) => {
        setBrands(b);
        setCategories(c);
        setLocations(l);
        setOpeningLocationId((current) => current || (l[0]?.id ?? ''));
      },
    );
  }, []);

  useEffect(() => {
    if (!id) return;
    void getProduct(id).then((product) => {
      if (product) reset(fromProduct(product));
    });
  }, [id, reset]);

  const submit = async (values: FormValues, andNext: boolean) => {
    setSaving(true);
    try {
      const draft = toDraft(values);
      let productId = id;
      if (isEdit && id) {
        await updateProduct(id, draft);
        if (photoCleared) await deletePhoto(id);
      } else {
        const created = await createProduct(draft);
        productId = created.id;
        if (openingPieces > 0 && openingLocationId) {
          await applyMovement({
            productId: created.id,
            locationId: openingLocationId,
            type: 'initial',
            qty: openingPieces,
            unitCost: draft.buyPrice,
          });
        }
        // Storage persistence is requested after the first product is saved.
        void navigator.storage?.persist?.();
      }

      if (photoFile && productId) {
        const { full, thumb } = await fileToPhoto(photoFile);
        await putPhoto(productId, full, thumb);
      }

      toastSuccess(fa.products.saved);
      if (andNext) {
        reset({
          ...EMPTY,
          brandId: values.brandId,
          categoryId: values.categoryId,
          packLabel: values.packLabel,
          packSize: values.packSize,
          buyPrice: values.buyPrice,
          retailPrice: values.retailPrice,
          wholesalePrice: values.wholesalePrice,
        });
        setOpeningPieces(0);
        setPhotoFile(null);
        setPhotoCleared(false);
        return;
      }
      navigate(isEdit && id ? `/products/${id}` : '/products');
    } catch (error) {
      if (error instanceof DuplicateCodeError) {
        setError('code', { message: fa.products.codeTaken });
      } else {
        toastError(fa.errors.title, error instanceof Error ? error.message : undefined);
      }
    } finally {
      setSaving(false);
    }
  };

  const photoSrc = previewUrl ?? (photoCleared ? undefined : existingPhotoUrl);

  return (
    <form
      className="mx-auto max-w-[720px] pb-10"
      onSubmit={handleSubmit((values) => void submit(values, false))}
    >
      <Field label={fa.products.name} htmlFor="name" hint={fa.products.nameHint}>
        <Input id="name" autoFocus placeholder={fa.products.namePlaceholder} {...register('name')} />
        {errors.name ? <p className="mt-1 text-[0.8rem] text-out">{errors.name.message}</p> : null}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          id="buyPrice"
          label={fa.products.buyPrice}
          value={watch('buyPrice')}
          onChange={(value) => setValue('buyPrice', value)}
          error={errors.buyPrice?.message}
        />
        <NumberField
          id="retailPrice"
          label={fa.products.retailPrice}
          value={watch('retailPrice')}
          onChange={(value) => setValue('retailPrice', value)}
          error={errors.retailPrice?.message}
        />
      </div>

      {!isEdit ? (
        <div className="mb-6 rounded-input border border-line bg-paper p-4">
          <Label>{fa.products.openingQty}</Label>
          <QuantityInput
            value={openingPieces}
            onChange={setOpeningPieces}
            packSize={packSize}
            packLabel={packLabel}
          />
          <div className="mt-3">
            <Label htmlFor="openingLocation">{fa.products.openingLocation}</Label>
            <Select
              id="openingLocation"
              value={openingLocationId}
              onValueChange={setOpeningLocationId}
              options={locations.map((l) => ({ value: l.id, label: l.name }))}
              placeholder={fa.stock.location}
            />
          </div>
          <p className="mt-2 text-[0.8rem] text-crate">{fa.products.packPiecesHint}</p>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setShowMore((prev) => !prev)}
        className="mb-4 flex h-11 w-full items-center justify-between rounded-input border border-line bg-paper px-3 text-ink"
      >
        <span>{fa.actions.more}</span>
        <ChevronDown className={showMore ? 'size-5 rotate-180' : 'size-5'} />
      </button>

      {showMore ? (
        <div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={fa.products.filterBrand} htmlFor="brandId">
              <Controller
                control={control}
                name="brandId"
                render={({ field }) => (
                  <Select
                    id="brandId"
                    value={field.value}
                    onValueChange={field.onChange}
                    allowEmpty
                    placeholder={fa.products.filterBrand}
                    options={brands.map((b) => ({ value: b.id, label: b.name }))}
                  />
                )}
              />
            </Field>
            <Field label={fa.products.filterCategory} htmlFor="categoryId">
              <Controller
                control={control}
                name="categoryId"
                render={({ field }) => (
                  <Select
                    id="categoryId"
                    value={field.value}
                    onValueChange={field.onChange}
                    allowEmpty
                    placeholder={fa.products.filterCategory}
                    options={categories.map((c) => ({ value: c.id, label: c.name }))}
                  />
                )}
              />
            </Field>
            <Field label={fa.common.code} htmlFor="code" hint="خالی بگذارید تا خودکار ساخته شود.">
              <Input id="code" dir="ltr" className="text-start" {...register('code')} />
              {errors.code ? (
                <p className="mt-1 text-[0.8rem] text-out">{errors.code.message}</p>
              ) : null}
            </Field>
            <NumberField
              id="wholesalePrice"
              label={fa.products.wholesalePrice}
              value={watch('wholesalePrice')}
              onChange={(value) => setValue('wholesalePrice', value)}
              error={errors.wholesalePrice?.message}
              hint={fa.common.optional}
            />
            <NumberField
              id="minStock"
              label={fa.products.minStock}
              value={watch('minStock')}
              onChange={(value) => setValue('minStock', value)}
              error={errors.minStock?.message}
              hint={fa.common.optional}
            />
            <NumberField
              id="packSize"
              label={fa.products.packSize}
              value={watch('packSize')}
              onChange={(value) => setValue('packSize', value)}
              error={errors.packSize?.message}
              hint={fa.products.packPiecesHint}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={fa.products.packLabel} htmlFor="packLabel">
              <Input id="packLabel" {...register('packLabel')} />
            </Field>
            <Field label={fa.products.barcodes} htmlFor="barcodes">
              <Textarea
                id="barcodes"
                dir="ltr"
                className="text-start"
                placeholder={fa.products.barcodePlaceholder}
                {...register('barcodes')}
              />
            </Field>
          </div>

          <Field label={fa.common.note} htmlFor="note">
            <Textarea id="note" {...register('note')} />
          </Field>

          <div className="mb-4 flex items-center gap-3">
            <input
              id="active"
              type="checkbox"
              className="size-5"
              checked={watch('active')}
              onChange={(event) => setValue('active', event.target.checked)}
            />
            <Label htmlFor="active" className="mb-0">
              {fa.products.active}
            </Label>
          </div>

          <div className="mb-6 rounded-input border border-line bg-paper p-4">
            <Label>{fa.common.photo}</Label>
            <div className="mt-2 flex items-center gap-3">
              {photoSrc ? (
                <img src={photoSrc} alt="" className="size-20 rounded-thumb object-cover" />
              ) : (
                <div className="flex size-20 items-center justify-center rounded-thumb bg-frost text-crate">
                  <ImagePlus className="size-6" />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                >
                  {fa.products.photoAdd}
                </Button>
                {photoSrc ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPhotoFile(null);
                      setPhotoCleared(true);
                    }}
                  >
                    <Trash2 className="size-4" />
                    {fa.products.photoRemove}
                  </Button>
                ) : null}
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  setPhotoFile(file);
                  setPhotoCleared(false);
                }
              }}
            />
            <p className="mt-2 text-[0.8rem] text-crate">{fa.products.photoHint}</p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {fa.actions.save}
        </Button>
        {!isEdit ? (
          <Button
            type="button"
            variant="secondary"
            disabled={saving}
            onClick={handleSubmit((values) => void submit(values, true))}
          >
            {fa.actions.saveAndNext}
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={() => navigate(`/products/${id}`)}>
            {fa.actions.cancel}
          </Button>
        )}
      </div>
    </form>
  );
}
