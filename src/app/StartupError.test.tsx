import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { fa } from '@/i18n/fa';
import { StartupError } from './StartupError';

afterEach(cleanup);

describe('StartupError', () => {
  it('explains the blocked database instead of staying blank and shows the raw error', () => {
    render(<StartupError message="SecurityError: access to the Indexed Database API is denied" />);

    expect(screen.getByText(fa.errors.storageTitle)).toBeTruthy();
    expect(screen.getByText(fa.errors.storageBody)).toBeTruthy();
    expect(screen.getByText(/SecurityError/)).toBeTruthy();
    expect(screen.getByRole('button', { name: fa.errors.reload })).toBeTruthy();
  });
});
