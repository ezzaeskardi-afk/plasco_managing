import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;

export function SheetContent({
  className,
  children,
  title,
  hideClose,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  title: string;
  hideClose?: boolean;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/40" />
      <DialogPrimitive.Content
        className={cn(
          'safe-b fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-sheet border-t border-line bg-paper p-4 shadow-none',
          'md:inset-x-auto md:bottom-auto md:top-1/2 md:start-1/2 md:max-h-[85dvh] md:w-[min(560px,92vw)] md:-translate-y-1/2 md:rounded-sheet md:border',
          className,
        )}
        {...props}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <DialogPrimitive.Title className="text-title font-bold text-ink">
            {title}
          </DialogPrimitive.Title>
          {hideClose ? null : (
            <DialogPrimitive.Close
              aria-label="بستن"
              className="-mt-1 -me-1 flex size-12 items-center justify-center rounded-input text-crate"
            >
              <X className="size-5" />
            </DialogPrimitive.Close>
          )}
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
