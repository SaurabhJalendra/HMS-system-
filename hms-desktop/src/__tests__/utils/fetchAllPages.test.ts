import { describe, expect, it, vi } from 'vitest';
import { fetchAllPages } from '../../lib/utils/fetchAllPages';

describe('fetchAllPages', () => {
  it('walks every page until totalPages is reached', async () => {
    const fetchPage = vi.fn(async (page: number) => ({
      items: [`item-${page}`],
      totalPages: 3,
    }));

    const items = await fetchAllPages(fetchPage, { limit: 100 });

    expect(items).toEqual(['item-1', 'item-2', 'item-3']);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 1, 100);
    expect(fetchPage).toHaveBeenNthCalledWith(3, 3, 100);
  });

  it('stops after one page when the API reports a single page', async () => {
    const fetchPage = vi.fn(async () => ({
      items: ['only'],
      totalPages: 1,
    }));

    await expect(fetchAllPages(fetchPage)).resolves.toEqual(['only']);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
