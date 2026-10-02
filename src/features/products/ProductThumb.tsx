import { Package } from 'lucide-react';
import type { ID } from '@/db/types';
import { cn } from '@/lib/utils';
import { usePhotoUrl } from './photo';

export function ProductThumb({
  productId,
  className,
  kind = 'thumb',
}: {
  productId: ID;
  className?: string;
  kind?: 'thumb' | 'full';
}) {
  const url = usePhotoUrl(productId, kind);
  if (!url) {
    return (
      <div
        className={cn(
          'flex size-12 shrink-0 items-center justify-center rounded-thumb bg-frost text-crate',
          className,
        )}
      >
        <Package className="size-5" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      className={cn('size-12 shrink-0 rounded-thumb bg-frost object-cover', className)}
    />
  );
}
