const DEFAULT_PAGE_LIMIT = 100;
const DEFAULT_MAX_PAGES = 50;

type PageResult<T> = {
  items: T[];
  totalPages?: number;
};

/**
 * Walks a paginated API that caps each page (clinic APIs use max 100)
 * so pickers and bill loaders are not truncated after the first page.
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number, limit: number) => Promise<PageResult<T>>,
  options?: { limit?: number; maxPages?: number }
): Promise<T[]> {
  const limit = options?.limit ?? DEFAULT_PAGE_LIMIT;
  const maxPages = options?.maxPages ?? DEFAULT_MAX_PAGES;
  const all: T[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const result = await fetchPage(page, limit);
    all.push(...(result.items || []));
    totalPages = Math.max(1, Number(result.totalPages) || 1);
    page += 1;
  } while (page <= totalPages && page <= maxPages);

  return all;
}
