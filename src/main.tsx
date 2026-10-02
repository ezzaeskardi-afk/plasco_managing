import '@fontsource-variable/vazirmatn';
import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProviders } from './app/providers';
import { AppRouter } from './app/router';
import { ErrorBoundary } from './app/ErrorBoundary';
import { StartupError } from './app/StartupError';
import { PwaUpdate } from './app/PwaUpdate';
import { logError } from './app/errorLog';
import { askPersistOnFirstRun } from './app/persistStorage';
import { ensureDefaults } from './db/dexie';

document.documentElement.lang = 'fa';
document.documentElement.dir = 'rtl';

window.addEventListener('error', (event) => {
  logError({ message: event.message, stack: event.error?.stack, context: 'window' });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason: unknown = event.reason;
  logError({
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    context: 'promise',
  });
});

const container = document.getElementById('root');

/** Without this the screen stays blank when IndexedDB cannot be opened. */
function showStartupError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  logError({
    message,
    stack: error instanceof Error ? error.stack : undefined,
    context: 'startup',
  });
  if (!container) return;
  createRoot(container).render(
    <StrictMode>
      <StartupError message={message} />
    </StrictMode>,
  );
}

if (container) {
  void ensureDefaults()
    .then(() => {
      createRoot(container).render(
        <StrictMode>
          <ErrorBoundary>
            <AppProviders>
              <AppRouter />
              <PwaUpdate />
            </AppProviders>
          </ErrorBoundary>
        </StrictMode>,
      );
      // First run: ask the browser to keep the shop's data (no-op afterwards).
      void askPersistOnFirstRun();
    })
    .catch(showStartupError);
}
