import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedValue } from '../../lib/hooks/useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('updates after the delay and keeps the latest value', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 350),
      { initialProps: { value: '' } },
    );

    expect(result.current).toBe('');

    rerender({ value: 'para' });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe('');

    rerender({ value: 'paracetamol' });
    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(result.current).toBe('paracetamol');
  });
});
