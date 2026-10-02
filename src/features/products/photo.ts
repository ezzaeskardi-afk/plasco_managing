import { useEffect, useState } from 'react';
import { getPhoto } from '@/db/repos';
import type { ID } from '@/db/types';

const FULL_MAX = 800;
const THUMB_MAX = 160;
const QUALITY = 0.75; // Safari cannot encode WebP from a canvas (AGENTS.md section 9).

async function drawTo(bitmap: ImageBitmap, maxSize: number): Promise<Blob> {
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('CanvasUnavailable');
  context.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
  if (!blob) throw new Error('ImageEncodeFailed');
  return blob;
}

/** Resizes a camera/gallery file into a full image plus a small thumbnail. */
export async function fileToPhoto(file: File): Promise<{ full: Blob; thumb: Blob }> {
  const bitmap = await createImageBitmap(file);
  try {
    const full = await drawTo(bitmap, FULL_MAX);
    const thumb = await drawTo(bitmap, THUMB_MAX);
    return { full, thumb };
  } finally {
    bitmap.close();
  }
}

interface CacheEntry {
  url: string;
  updatedAt: number;
}

const urlCache = new Map<string, CacheEntry>();

function cacheKey(productId: ID, kind: 'thumb' | 'full'): string {
  return `${productId}:${kind}`;
}

/**
 * Loads a photo blob lazily and keeps a cached object URL; entries are evicted
 * when the stored photo changes.
 */
export function usePhotoUrl(productId: ID | undefined, kind: 'thumb' | 'full' = 'thumb') {
  const [url, setUrl] = useState<string | undefined>(() =>
    productId ? urlCache.get(cacheKey(productId, kind))?.url : undefined,
  );

  useEffect(() => {
    if (!productId) {
      setUrl(undefined);
      return;
    }
    let cancelled = false;
    const key = cacheKey(productId, kind);
    void getPhoto(productId).then((photo) => {
      if (cancelled) return;
      const blob = kind === 'thumb' ? photo?.thumb : photo?.full;
      if (!blob) {
        const stale = urlCache.get(key);
        if (stale) {
          URL.revokeObjectURL(stale.url);
          urlCache.delete(key);
        }
        setUrl(undefined);
        return;
      }
      const cached = urlCache.get(key);
      if (cached && cached.updatedAt === (photo?.updatedAt ?? 0)) {
        setUrl(cached.url);
        return;
      }
      if (cached) URL.revokeObjectURL(cached.url);
      const next = URL.createObjectURL(blob);
      urlCache.set(key, { url: next, updatedAt: photo?.updatedAt ?? 0 });
      setUrl(next);
    });
    return () => {
      cancelled = true;
    };
  }, [productId, kind]);

  return url;
}
