import { Button } from '@/components/ui/button';
import { fa } from '@/i18n/fa';

/**
 * Startup failure screen: the database could not be opened (private mode,
 * blocked storage, or the app opened straight from the file system). Without
 * this the page would stay blank with no explanation.
 */
export function StartupError({ message }: { message: string }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-heading font-bold text-ink">{fa.errors.storageTitle}</h1>
      <p className="max-w-[30rem] text-crate">{fa.errors.storageBody}</p>
      <p dir="ltr" className="max-w-full overflow-x-auto text-[0.8rem] text-crate">
        {message}
      </p>
      <Button onClick={() => window.location.reload()}>{fa.errors.reload}</Button>
    </div>
  );
}
