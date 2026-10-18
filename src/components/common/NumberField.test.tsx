import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { NumberField } from './NumberField';

function Harness({ group }: { group?: boolean }) {
  const [value, setValue] = useState('');
  return (
    <NumberField
      id="price"
      label="قیمت"
      value={value}
      onChange={setValue}
      group={group}
      suffix={<span>تومان</span>}
    />
  );
}

describe('NumberField', () => {
  afterEach(cleanup);

  it('groups thousands while typing and keeps Persian digits', () => {
    render(<Harness group />);
    const input = screen.getByLabelText('قیمت') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '2100000' } });
    expect(input.value).toBe('۲٬۱۰۰٬۰۰۰');

    fireEvent.change(input, { target: { value: '۲۱۰' } });
    expect(input.value).toBe('۲۱۰');
  });

  it('cleans stray separators and accepts empty input', () => {
    render(<Harness group />);
    const input = screen.getByLabelText('قیمت') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '۱٬۰۰' } });
    expect(input.value).toBe('۱۰۰');

    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
  });

  it('keeps the formatted text when deleting a separator changes nothing', () => {
    render(<Harness group />);
    const input = screen.getByLabelText('قیمت') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '2100000' } });
    expect(input.value).toBe('۲٬۱۰۰٬۰۰۰');

    // Same number without separators: React would bail out of re-rendering and
    // the DOM would keep the raw text (the bug this test pins down).
    fireEvent.change(input, { target: { value: '۲۱۰۰۰۰۰' } });
    expect(input.value).toBe('۲٬۱۰۰٬۰۰۰');
  });

  it('leaves junk and negatives exactly as typed for validation to catch', () => {
    render(<Harness group />);
    const input = screen.getByLabelText('قیمت') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '-۵' } });
    expect(input.value).toBe('-۵');

    fireEvent.change(input, { target: { value: '12a' } });
    expect(input.value).toBe('12a');
  });

  it('does not touch the text when grouping is off', () => {
    render(<Harness />);
    const input = screen.getByLabelText('قیمت') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '2100000' } });
    expect(input.value).toBe('2100000');
  });
});
