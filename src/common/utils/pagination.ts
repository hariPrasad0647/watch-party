export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

/**
 * Helper to calculate skip/take for Prisma
 */
export function getPaginationOptions(params: PaginationParams) {
  const page = Math.max(1, params.page);
  const limit = Math.max(1, Math.min(100, params.limit)); // Max 100 per page

  return {
    skip: (page - 1) * limit,
    take: limit
  };
}

/**
 * Helper to construct the paginated response metadata
 */
export function buildPaginatedResult<T>(
  data: T[],
  total: number,
  params: PaginationParams
): PaginatedResult<T> {
  const page = Math.max(1, params.page);
  const limit = Math.max(1, Math.min(100, params.limit));
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1
    }
  };
}
